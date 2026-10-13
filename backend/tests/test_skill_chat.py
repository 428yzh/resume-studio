"""TC-CHAT 系列：问一问（每单元一个会话，2026-10-10 由 TC-REVIEW 改写）

复盘并入开场（结论 5）：messages=[] 时 AI 先读笔记做轻点评 + 指不足；之后就是普通对话。
不判分、不落库（结论 27）。SSE 事件 {content, done} 逐字块，失败在收尾事件带 error。
"""
import json
import types

import pytest

from app.services import ai_service

# 单元 "1,2" 分到的块：1（含子节点 1.1）+ 2
GRAPH = [
    {"id": "1", "title": "循环驱动结构", "children": [{"id": "1.1", "title": "消息循环", "children": []}]},
    {"id": "2", "title": "响应解析", "children": []},
    {"id": "3", "title": "别的单元的地盘", "children": []},
]

# ensure_ascii=False：前端 JSON.stringify 出来的就是原样中文，别在测试里造一个转义过的输入
NOTE = json.dumps({"cues": ["循环怎么起的？"], "notes": "靠 while 轮询消息队列", "summary": "消息驱动"}, ensure_ascii=False)


async def _seed(client, monkeypatch, *, unit_key="1,2", cornell=NOTE, graph=GRAPH):
    """建技能 → 生成图谱 → 写笔记，返回 skill_id"""
    skill_id = (await client.post("/api/skills", json={"name": "TC-CHAT 临时技能", "notes": "测试用"})).json()["id"]

    async def fake_graph(name, notes=""):
        return {"nodes": graph, "degraded": False, "issues": []}

    monkeypatch.setattr("app.api.skills.generate_knowledge_graph", fake_graph)
    await client.post(f"/api/skills/{skill_id}/graph")
    await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": unit_key, "cornell": cornell})
    return skill_id


def _parse_sse(text: str) -> list[dict]:
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


async def _chat(client, skill_id, messages, unit_key="1,2"):
    async with client.stream(
        "POST", f"/api/skills/{skill_id}/notes/chat", json={"unit_key": unit_key, "messages": messages}
    ) as resp:
        text = ""
        async for chunk in resp.aiter_text():
            text += chunk
    return resp.status_code, text


def _chunk(content):
    delta = type("Delta", (), {"content": content})()
    return type("Chunk", (), {"choices": [type("Choice", (), {"delta": delta})()]})()


def _stub_client(contents=("好",), error_after=None):
    """假 openai client（越过审计补丁）：create 返回可控假流，并记下每次收到的 kwargs"""
    calls = []

    async def create(**kwargs):
        calls.append(kwargs)

        async def gen():
            for c in contents:
                yield _chunk(c)
            if error_after:
                raise error_after

        return gen()

    client = types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create))
    )
    return client, calls


# ─── 路由层：开场 / 门槛 / 语境 ─────────────────────────────


@pytest.mark.asyncio
async def test_chat_opening_passes_context(client, monkeypatch):
    """TC-CHAT-001: 开场（messages: []）→ SSE 流；交给 AI 的是【技能备注】+【这块的图谱（带 id）】+【笔记三栏原文】"""
    skill_id = await _seed(client, monkeypatch)
    seen = {}

    async def fake_chat(skill_name, skill_notes, cornell, graph_block="", messages=None):
        seen.update(skill_name=skill_name, skill_notes=skill_notes, cornell=cornell, block=graph_block, messages=messages)
        yield json.dumps({"content": "你写的是消息驱动", "done": False})
        yield json.dumps({"content": "", "done": True})

    monkeypatch.setattr("app.api.skills.notes_chat_stream", fake_chat)

    try:
        status, text = await _chat(client, skill_id, [])
        assert status == 200
        events = _parse_sse(text)
        assert events[0]["content"] == "你写的是消息驱动"
        assert events[-1]["done"] is True
        # 块里只有这个单元的节点，别的单元的地盘（节点 3）不能进内容边界
        assert "1.1  消息循环" in seen["block"]
        assert "别的单元" not in seen["block"]
        assert "循环怎么起的？" in seen["cornell"]      # 笔记原文原样给出去
        assert seen["skill_notes"] == "测试用"           # 技能备注当语境，同 quiz::_skill_context
        assert seen["messages"] == []                    # 开场不带历史
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_chat_requires_note(client, monkeypatch):
    """TC-CHAT-002: 这块没写过笔记 → 400（门槛保持：不拿空笔记去烧 AI 调用）"""
    skill_id = await _seed(client, monkeypatch)
    try:
        resp = await client.post(f"/api/skills/{skill_id}/notes/chat", json={"unit_key": "3", "messages": []})
        assert resp.status_code == 400
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_chat_not_found(client):
    """TC-CHAT-003: 技能不存在 → 404"""
    resp = await client.post("/api/skills/999999/notes/chat", json={"unit_key": "1", "messages": []})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_chat_reads_latest_note_each_turn(client, monkeypatch):
    """TC-CHAT-004: 对话是记录，语境是实时的（结论 10）—— 中间改了笔记，下一轮 prompt 用新原文"""
    skill_id = await _seed(client, monkeypatch)
    seen = []

    async def fake_chat(skill_name, skill_notes, cornell, graph_block="", messages=None):
        seen.append(cornell)
        yield json.dumps({"content": "好", "done": False})
        yield json.dumps({"content": "", "done": True})

    monkeypatch.setattr("app.api.skills.notes_chat_stream", fake_chat)

    try:
        await _chat(client, skill_id, [])
        new_note = json.dumps({"notes": "改成了事件驱动"}, ensure_ascii=False)
        await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": "1,2", "cornell": new_note})
        await _chat(client, skill_id, [{"role": "user", "content": "再问"}, {"role": "ai", "content": "好"}])
        assert "while 轮询" in seen[0]
        assert "事件驱动" in seen[1] and "while 轮询" not in seen[1]
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_chat_without_graph_still_works(client, monkeypatch):
    """TC-CHAT-006: 老计划（`step7`，没有图谱）也能问，块为空串、不炸"""
    skill_id = (await client.post("/api/skills", json={"name": "TC-CHAT 老计划技能"})).json()["id"]
    await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": "step7", "cornell": NOTE})
    seen = {}

    async def fake_chat(skill_name, skill_notes, cornell, graph_block="", messages=None):
        seen["block"] = graph_block
        yield json.dumps({"content": "好", "done": False})
        yield json.dumps({"content": "", "done": True})

    monkeypatch.setattr("app.api.skills.notes_chat_stream", fake_chat)

    try:
        status, text = await _chat(client, skill_id, [], unit_key="step7")
        assert status == 200
        assert seen["block"] == ""
        assert _parse_sse(text)[-1]["done"] is True
    finally:
        await client.delete(f"/api/skills/{skill_id}")


# ─── 服务层：历史映射/截断、开场指令、失败事件 ─────────────────


@pytest.mark.asyncio
async def test_chat_history_mapped_capped_and_opening(monkeypatch):
    """TC-CHAT-005: 历史进 prompt（ai→assistant 映射）、超 _CHAT_HISTORY_LIMIT 只带最近 N 条；
    messages=[] 时补一条开场指令（让 AI 先读笔记）"""
    stub, calls = _stub_client(contents=("好",))
    monkeypatch.setattr(ai_service, "_get_client", lambda: stub)

    history = [{"role": "user" if i % 2 else "ai", "content": f"第{i}条"} for i in range(25)]
    [json.loads(e) async for e in ai_service.notes_chat_stream("React", "备注", NOTE, "", history)]

    sent = calls[0]["messages"]
    assert sent[0]["role"] == "system"
    assert "React（备注）" in sent[0]["content"]        # 技能备注当语境
    assert "【笔记栏】" in sent[0]["content"]            # 笔记三栏原文在语境里
    assert "【内容边界】（这个单元还没有图谱" in sent[0]["content"]  # 无块时说明按技能整体聊

    kept = sent[1:]
    assert len(kept) == ai_service._CHAT_HISTORY_LIMIT
    assert kept[0]["content"] == "第5条"                 # 只带最近 20 条
    assert kept[0]["role"] == "user"
    assert kept[1]["role"] == "assistant"                # ai → assistant 映射
    assert kept[-1]["content"] == "第24条"
    assert all("第4条" not in m["content"] for m in kept)

    # 开场：没有历史 → 补一条「先读一遍」的用户指令
    [json.loads(e) async for e in ai_service.notes_chat_stream("React", "备注", NOTE, "", [])]
    opening = calls[1]["messages"]
    assert len(opening) == 2
    assert opening[1]["role"] == "user"
    assert "开场点评" in opening[1]["content"]


@pytest.mark.asyncio
async def test_chat_ai_unavailable(monkeypatch):
    """TC-CHAT-007: AI 不可用 → 收尾事件带 error（不编内容、不是 500）"""
    monkeypatch.setattr(ai_service, "_get_client", lambda: None)
    events = [json.loads(e) async for e in ai_service.notes_chat_stream("React", "", NOTE)]
    assert events[-1]["done"] is True
    assert "AI 服务未配置" in events[-1]["error"]
    assert not any(e.get("content") for e in events)


@pytest.mark.asyncio
async def test_chat_midstream_error_keeps_partial(monkeypatch):
    """TC-CHAT-008: 流中途异常 → 已吐的 chunk 保留 + 收尾事件带 error（前端据此保留半截文字，结论 19）"""
    stub, _ = _stub_client(contents=("前半句",), error_after=RuntimeError("boom"))
    monkeypatch.setattr(ai_service, "_get_client", lambda: stub)

    events = [json.loads(e) async for e in ai_service.notes_chat_stream("React", "", NOTE)]
    assert events[0] == {"content": "前半句", "done": False}
    assert events[-1]["done"] is True
    assert "boom" in events[-1]["error"]


class TestRenderCornell:
    """笔记进 prompt 前拆成三栏 —— 三栏各有各的角色，摊平了 AI 才好判哪栏在糊弄"""

    def test_three_columns_rendered(self):
        """TC-CHAT-009: 线索/笔记/总结各带栏名，空栏不占位"""
        from app.services.ai_service import _render_cornell
        out = _render_cornell(json.dumps(
            {"cues": ["循环怎么起的？", "  "], "notes": "靠 while 轮询", "summary": ""}, ensure_ascii=False
        ))
        assert "【线索栏】\n- 循环怎么起的？" in out
        assert "【笔记栏】\n靠 while 轮询" in out
        assert "【总结栏】" not in out  # 空栏不出现，别让 AI 以为用户写了总结
        assert "  " not in out.replace("靠 while 轮询", "")  # 空白线索被过滤

    def test_broken_json_passes_through(self):
        """TC-CHAT-009b: 解不开就原样给，不丢内容"""
        from app.services.ai_service import _render_cornell
        assert _render_cornell("不是 JSON") == "不是 JSON"
        assert _render_cornell(json.dumps({"cues": []})) == '{"cues": []}'  # 三栏全空：退回原文，不返回空串
