"""多 Agent 评审管线测试

TC-REV 系列：Agent 基类 / 评审 agent 放行 / review_pipeline 协作循环（棘轮回滚）/ 生产调用点接线
"""
import json

import pytest

from app.services import ai_service
from app.services.ai_service import (
    Agent,
    _parse_json_defensive,
    _review_agent,
    review_pipeline,
    _lecturer,
    _sim_user,
    generate_learning_guide,
    generate_learning_plan,
)


# ─── 纯逻辑：兜底 JSON 解析 ─────────────────────────────
def test_parse_json_defensive_strips_fences():
    text = "```json\n{\"passed\": true}\n```"
    assert _parse_json_defensive(text) == {"passed": True}


def test_parse_json_defensive_extracts_braces():
    assert _parse_json_defensive("前缀 {\"a\": 1} 后缀") == {"a": 1}


def test_parse_json_defensive_empty_and_garbage():
    assert _parse_json_defensive("") == {}
    assert _parse_json_defensive("完全不是 json") == {}


# ─── Agent 基类 ────────────────────────────────────────
def test_agent_system_dynamic_and_static():
    dyn = Agent("动态", lambda r: f"level={r.get('required_level')}")
    assert dyn._system({"required_level": "精通"}) == "level=精通"
    stat = Agent("静态", "固定人设")
    assert stat._system({}) == "固定人设"


# ─── 评审 agent：失败放行（不阻断主功能） ────────────────
@pytest.mark.asyncio
async def test_review_agent_fail_open_no_client(monkeypatch):
    async def fake_call(self, *a, **k):
        return ""

    monkeypatch.setattr(Agent, "call", fake_call)
    verdict = await _review_agent(_lecturer, "内容", "背景")
    assert verdict["passed"] is True
    assert verdict["error"] is True


@pytest.mark.asyncio
async def test_review_agent_fail_open_unparsable(monkeypatch):
    async def fake_call(self, *a, **k):
        return "评审失败，输出非 JSON"

    monkeypatch.setattr(Agent, "call", fake_call)
    verdict = await _review_agent(_sim_user, "内容", "背景")
    assert verdict["passed"] is True
    assert verdict["error"] is True


@pytest.mark.asyncio
async def test_review_agent_returns_verdict(monkeypatch):
    async def fake_call(self, *a, **k):
        return '{"passed": false, "findings": [{"severity": "critical", "issue": "深度不够", "suggestion": "加深原理"}]}'

    monkeypatch.setattr(Agent, "call", fake_call)
    verdict = await _review_agent(_lecturer, "内容", "背景")
    assert verdict["passed"] is False
    assert "深度不够" in verdict["feedback"]
    assert verdict["error"] is False


# ─── review_pipeline：协作循环 ──────────────────────────
class FakeGen:
    """鸭子类型生成器：记录每轮 user 消息，按剧本返回内容。"""

    def __init__(self, script: list[str]):
        self.script = script
        self.calls: list[str] = []

    async def call(self, user_msg, *, request=None, json_mode=False, **kw):
        self.calls.append(user_msg)
        return self.script.pop(0)


@pytest.mark.asyncio
async def test_pipeline_all_pass_single_round(monkeypatch):
    gen = FakeGen(["合格内容"])

    async def fake_review(agent, content, ctx):
        return {"passed": True, "feedback": "", "findings": [], "error": False}

    monkeypatch.setattr(ai_service, "_review_agent", fake_review)
    content, verdicts = await review_pipeline(gen, lambda fb: f"原始上下文|{fb}", [(_lecturer, "ctx"), (_sim_user, "ctx")])
    assert content == "合格内容"
    assert len(gen.calls) == 1
    assert all(v["passed"] for v in verdicts)


@pytest.mark.asyncio
async def test_pipeline_default_single_round(monkeypatch):
    """默认只 1 轮：首轮评审未通过也不再重试"""
    gen = FakeGen(["不合格"])

    async def fake_review(agent, content, ctx):
        return {"passed": False, "feedback": "需要修订", "findings": [], "error": False}

    monkeypatch.setattr(ai_service, "_review_agent", fake_review)
    content, verdicts = await review_pipeline(gen, lambda fb: f"req|{fb}", [(_lecturer, "ctx")])
    assert len(gen.calls) == 1  # 没有第二轮
    assert content == "不合格"
    assert all(not v["passed"] for v in verdicts)


@pytest.mark.asyncio
async def test_pipeline_retry_injects_feedback(monkeypatch):
    gen = FakeGen(["第一版", "修订版"])

    async def fake_review(agent, content, ctx):
        if content == "第一版":
            return {"passed": False, "feedback": "深度不够 → 加深原理讲解", "findings": [], "error": False}
        return {"passed": True, "feedback": "", "findings": [], "error": False}

    monkeypatch.setattr(ai_service, "_review_agent", fake_review)
    content, verdicts = await review_pipeline(gen, lambda fb: f"原始上下文|{fb}", [(_lecturer, "ctx")], max_rounds=1)
    assert content == "修订版"
    assert len(gen.calls) == 2
    # 第二轮消息：原始上下文保留 + 评审反馈注入
    assert "原始上下文|" in gen.calls[1]
    assert "深度不够" in gen.calls[1]
    assert gen.calls[1].startswith("原始上下文|")


@pytest.mark.asyncio
async def test_pipeline_ratchet_rollback(monkeypatch):
    gen = FakeGen(["v1", "v2"])

    async def fake_review(agent, content, ctx):
        # v2 没有比 v1 好（bad 仍为 1）→ 回滚到 v1
        return {"passed": False, "feedback": "还是有问题", "findings": [], "error": False}

    monkeypatch.setattr(ai_service, "_review_agent", fake_review)
    content, _ = await review_pipeline(gen, lambda fb: f"req|{fb}", [(_lecturer, "ctx")], max_rounds=1)
    assert content == "v1"  # 棘轮：未变好，保留上一版


@pytest.mark.asyncio
async def test_pipeline_max_rounds_returns_best(monkeypatch):
    gen = FakeGen(["r1", "r2", "r3"])

    async def fake_review(agent, content, ctx):
        # r1：双评审未过（bad=2）→ r2：讲师过、用户仍受阻（bad=1，变好）→ r3：bad 不再下降 → 回滚 r2
        if content == "r1":
            return {"passed": False, "feedback": "讲师：深度不够 → 加深原理", "findings": [], "error": False}
        if agent is _lecturer:
            return {"passed": True, "feedback": "", "findings": [], "error": False}
        return {"passed": False, "feedback": "用户：太深看不懂 → 讲得更通俗", "findings": [], "error": False}

    monkeypatch.setattr(ai_service, "_review_agent", fake_review)
    content, _ = await review_pipeline(
        gen, lambda fb: f"req|{fb}", [(_lecturer, "ctx"), (_sim_user, "ctx")], max_rounds=2
    )
    assert content == "r2"  # 棘轮下保留 bad 最低的版本
    assert len(gen.calls) == 3  # 跑满 max_rounds+1 后回滚


# ─── 生产调用点：反馈重写必须开启 ──────────────────────
@pytest.mark.asyncio
async def test_production_generators_enable_feedback_rewrite(monkeypatch):
    """三个生产生成入口都必须传 max_rounds=1。

    曾经全部没传 —— review_pipeline 默认 0 = 评审不过也不重试，
    「反馈增量注入重新生成 + 棘轮回滚」在生产从未跑过（只是函数能力）。"""
    calls: list[tuple[str, object]] = []

    async def fake_pipeline(gen, build_msg, reviewers, **kw):
        calls.append((gen.name, kw.get("max_rounds")))
        if gen.name == "学习指引":
            return json.dumps({"learning_path": [{"step": 1, "title": "入门", "description": "d"}], "interview_questions": []}), []
        if gen.name == "学习计划":
            return json.dumps({"steps": [{"step": 1, "title": "单元一", "node_ids": ["1"]}]}), []
        return "", []  # 知识点讲解：空内容走早退，避开尾部真实资源搜索

    monkeypatch.setattr(ai_service, "review_pipeline", fake_pipeline)
    monkeypatch.setattr(ai_service, "_get_client", lambda: object())

    await ai_service.generate_learning_guide("React", "前端", "了解")
    await ai_service.generate_learning_plan(
        "React", "了解", "", graph=[{"id": "1", "title": "Hooks", "children": []}]
    )
    await ai_service.explain_topic("React", step_title="Hooks")

    assert calls == [("学习指引", 1), ("学习计划", 1), ("知识点讲解", 1)]


# ─── 改造后的函数：无 API key 走 fallback ───────────────
@pytest.mark.asyncio
async def test_generate_learning_guide_no_client_fallback(monkeypatch):
    monkeypatch.setattr(ai_service, "_get_client", lambda: None)
    result = await generate_learning_guide("React", "前端", "精通")
    assert result["learning_path"]
    assert result["resources"] == []
    assert result["interview_questions"] == []


@pytest.mark.asyncio
async def test_generate_learning_plan_no_client_fallback(monkeypatch):
    monkeypatch.setattr(ai_service, "_get_client", lambda: None)
    result = await generate_learning_plan("React", "精通", "会点基础")
    assert result["steps"]  # 走 _default_learning_plan
