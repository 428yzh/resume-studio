"""费曼教学 · 数字学生 测试

TC-FEYN 系列：五级理解状态机 + 房间路由 + 提问预算 + PPT 报告
"""
import json

import pytest
import pytest_asyncio

from app.services import feynman as feynman_service
from app.api import feynman as feynman_api


# ─── 纯逻辑：等级钳制（上升 +1 / 下降 -1）───────────────
def test_clamp_level_up_no_skip():
    # 上升：最多 +1（L5 必须先到过 L4）
    assert feynman_service.clamp_level(5, 1) == 2
    assert feynman_service.clamp_level(2, 1) == 2
    assert feynman_service.clamp_level(5, 4) == 5


def test_clamp_level_down_bounded():
    # 下降：最多 -1（发现理解被推翻 → 允许回落）
    assert feynman_service.clamp_level(1, 3) == 2
    assert feynman_service.clamp_level(3, 5) == 4
    assert feynman_service.clamp_level(1, 1) == 1


def test_clamp_level_at_top():
    assert feynman_service.clamp_level(5, 5) == 5


# ─── 纯逻辑：提问预算 ───────────────────────────────────
def test_budget_breadth():
    assert feynman_service.apply_budget("breadth_question", 3, 2, 2) == (1, 2)


def test_budget_depth():
    assert feynman_service.apply_budget("depth_question", 5, 2, 2) == (2, 1)


def test_budget_no_spend():
    # 重构/复述不扣预算
    assert feynman_service.apply_budget("restatement", 4, 2, 2) == (2, 2)
    # L2 问例子不扣
    assert feynman_service.apply_budget("ask_example", 2, 2, 2) == (2, 2)


def test_budget_no_negative():
    assert feynman_service.apply_budget("breadth_question", 3, 0, 2) == (0, 2)
    assert feynman_service.apply_budget("depth_question", 5, 2, 0) == (2, 0)


# ─── 纯逻辑：动作与等级对齐 ───────────────────────────
def test_resolve_action_fits_level():
    assert feynman_service.resolve_action(2, "ask_example", 2, 2) == "ask_example"
    assert feynman_service.resolve_action(3, "breadth_question", 2, 2) == "breadth_question"
    assert feynman_service.resolve_action(4, "restatement", 2, 2) == "restatement"
    assert feynman_service.resolve_action(5, "depth_question", 2, 2) == "depth_question"


def test_resolve_action_mismatch_falls_back():
    # 等级钳制后动作不匹配等级 → 用等级默认动作
    assert feynman_service.resolve_action(2, "depth_question", 2, 2) == "ask_example"
    assert feynman_service.resolve_action(1, "restatement", 2, 2) == "clarify_term"


def test_resolve_action_budget_exhausted():
    # L3 广度用尽 → 退化为重构；L5 深度用尽 → 完成
    assert feynman_service.resolve_action(3, "breadth_question", 0, 2) == "restatement"
    assert feynman_service.resolve_action(5, "depth_question", 2, 0) == "done"


# ─── 路由：创建 / 列表 / 详情 / 删除 ────────────────────
@pytest.mark.asyncio
async def test_create_topic(client):
    resp = await client.post("/api/feynman/topics", json={"name": "React Hooks"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "React Hooks"
    assert data["level"] == 1
    assert data["breadth_left"] == 2
    assert data["depth_left"] == 2
    assert data["status"] == "learning"


@pytest.mark.asyncio
async def test_create_topic_empty_name(client):
    resp = await client.post("/api/feynman/topics", json={"name": "  "})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_topics(client):
    await client.post("/api/feynman/topics", json={"name": "React Hooks"})
    resp = await client.get("/api/feynman/topics")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["total_messages"] == 0


@pytest.mark.asyncio
async def test_get_topic_detail(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    resp = await client.get(f"/api/feynman/topics/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "React Hooks"
    assert resp.json()["messages"] == []


@pytest.mark.asyncio
async def test_get_topic_not_found(client):
    resp = await client.get("/api/feynman/topics/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_topic(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    resp = await client.delete(f"/api/feynman/topics/{created['id']}")
    assert resp.status_code == 200
    assert (await client.get(f"/api/feynman/topics/{created['id']}")).status_code == 404


# ─── 路由：发消息 SSE（定级 → 流式回复）────────────────
async def _send_message(client, topic_id, content):
    async with client.stream(
        "POST", f"/api/feynman/topics/{topic_id}/message", json={"content": content}
    ) as resp:
        text = ""
        async for chunk in resp.aiter_text():
            text += chunk
    return resp.status_code, text


def _parse_sse(text: str) -> list[dict]:
    """解析 SSE data 行，返回 JSON 列表"""
    events = []
    for line in text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


@pytest.mark.asyncio
async def test_send_message_advances_level(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()

    async def fake_assess(name, messages, level, breadth_left, depth_left):
        return {"level": level + 1, "action": "ask_example", "blind_spot": "缺少例子"}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "我复述一下你的讲解…", "done": False})
        yield json.dumps({"content": "", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    status, text = await _send_message(client, created["id"], "React Hooks 是管理状态用的。")
    assert status == 200
    events = _parse_sse(text)
    assert events[0]["type"] == "level"
    assert events[0]["level"] == 2  # 等级 1→2
    response_events = [e for e in events if e.get("type") == "response"]
    assert any("复述" in e["content"] for e in response_events)

    # 消息落库：user + ai(带 level)
    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert len(detail["messages"]) == 2
    assert detail["messages"][-1]["role"] == "ai"
    assert detail["messages"][-1]["level"] == 2
    assert detail["level"] == 2


@pytest.mark.asyncio
async def test_send_message_clamps_skip(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()

    async def fake_assess_skip(name, messages, level, breadth_left, depth_left):
        return {"level": 5, "action": "restatement", "blind_spot": ""}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "完整复述", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess_skip)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    status, text = await _send_message(client, created["id"], "React Hooks 状态管理。")
    assert status == 200
    events = _parse_sse(text)
    assert events[0]["level"] == 2  # 提议 L5 被钳制到 L2
    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["level"] == 2


@pytest.mark.asyncio
async def test_send_message_spends_breadth_budget(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()

    # 第一条消息 → L2；第二条消息（历史更长）→ L3 + breadth_question
    async def fake_assess(name, messages, level, breadth_left, depth_left):
        if len(messages) >= 3:
            return {"level": 3, "action": "breadth_question", "blind_spot": "缺一环"}
        return {"level": level + 1, "action": "ask_example", "blind_spot": ""}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "逻辑链缺一环，请问…", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    await _send_message(client, created["id"], "React Hooks 依赖链。")  # → L2
    await _send_message(client, created["id"], "我补上这一环…")  # → L3 + 广度追问
    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["level"] == 3
    assert detail["breadth_left"] == 1  # 广度预算 2→1
    assert detail["depth_left"] == 2


@pytest.mark.asyncio
async def test_send_message_error_downgrade_and_weak_point(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()

    async def fake_assess(name, messages, level, breadth_left, depth_left):
        n_user = sum(1 for m in messages if m["role"] == "user")
        if n_user >= 4:
            return {"level": 2, "action": "restatement", "blind_spot": "", "error": "依赖数组讲反了"}
        return {"level": level + 1, "action": "ask_example", "blind_spot": "", "error": ""}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "老师，我好像记得不太一样……", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    # 3 轮升到 L4
    for i in range(3):
        await _send_message(client, created["id"], f"讲解 {i}")
    assert (await client.get(f"/api/feynman/topics/{created['id']}")).json()["level"] == 4

    # 第 4 轮讲错 → 强制降级到 L3 + correction 动作 + 记薄弱点
    status, text = await _send_message(client, created["id"], "依赖数组讲反了的内容")
    assert status == 200
    events = _parse_sse(text)
    assert events[0]["level"] == 3
    assert events[0]["action"] == "correction"

    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["level"] == 3
    assert "依赖数组讲反了" in detail["weak_points"]
    assert detail["breadth_left"] == 2  # correction 不消耗预算


@pytest.mark.asyncio
async def test_send_message_reaches_l5_depth_budget(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()

    async def fake_assess(name, messages, level, breadth_left, depth_left):
        n_user = sum(1 for m in messages if m["role"] == "user")
        if n_user >= 4:
            return {"level": 5, "action": "depth_question", "blind_spot": "边界情况", "error": ""}
        return {"level": level + 1, "action": "ask_example", "blind_spot": "", "error": ""}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "我想到一个边界情况……", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    # 3 轮升到 L4
    for i in range(3):
        await _send_message(client, created["id"], f"讲 {i}")
    # 第 4 轮完整讲解 → 提议 L5 → 深度追问
    status, text = await _send_message(client, created["id"], "完整正确的讲解")
    assert status == 200
    events = _parse_sse(text)
    assert events[0]["level"] == 5
    assert events[0]["action"] == "depth_question"

    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["level"] == 5
    assert detail["depth_left"] == 1  # 深度预算 2→1
    assert detail["breadth_left"] == 2


@pytest.mark.asyncio
async def test_send_message_ai_down_fallback(client):
    # 无 API key 时 assess 返回兜底：等级不升、回复提示不可用
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    status, text = await _send_message(client, created["id"], "React Hooks 状态管理。")
    assert status == 200
    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["level"] == 1  # 不假装理解提升
    assert detail["messages"][-1]["role"] == "ai"


@pytest.mark.asyncio
async def test_send_message_empty_rejected(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    resp = await client.post(f"/api/feynman/topics/{created['id']}/message", json={"content": " "})
    assert resp.status_code == 400


# ─── 路由：PPT 报告 ────────────────────────────────────
@pytest.mark.asyncio
async def test_report_generates_pptx(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()

    async def fake_report(name, messages, level, weak_points=None):
        return {
            "title": "React Hooks 学习报告",
            "summary": "学会了状态管理",
            "slides": [{"title": "概览", "bullets": ["要点1", "要点2"]}],
            "weak_points": (weak_points or []) + ["依赖数组理解不深"],
        }

    monkeypatch.setattr(feynman_service, "generate_report_slides", fake_report)

    resp = await client.post(f"/api/feynman/topics/{created['id']}/report")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument")
    assert len(resp.content) > 1000  # pptx 二进制非空

    # 房间状态转为 completed + learning_summary 写入
    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["status"] == "completed"
    assert detail["learning_summary"]["title"] == "React Hooks 学习报告"


@pytest.mark.asyncio
async def test_report_topic_not_found(client):
    resp = await client.post("/api/feynman/topics/99999/report")
    assert resp.status_code == 404
