"""费曼教学·问题跟踪 测试

TC-PROB 系列：手动记录问题 / 标记解决 / 重开 / 级联删 / 列表 presence 标记 / 零卡点自动解决
"""
import json

import pytest
from sqlalchemy import select

from app.models.feynman import FeynmanProblem
from app.services import feynman as feynman_service


@pytest.mark.asyncio
async def _create_problem(client, topic_id, content="讲不清楚 useRef 的返回值"):
    return await client.post(f"/api/feynman/topics/{topic_id}/problems", json={"content": content})


async def _send_message(client, topic_id, content):
    async with client.stream(
        "POST", f"/api/feynman/topics/{topic_id}/message", json={"content": content}
    ) as resp:
        text = ""
        async for chunk in resp.aiter_text():
            text += chunk
    return resp.status_code, text


# ─── 手动创建 ──────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_problem(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    resp = await _create_problem(client, created["id"])
    assert resp.status_code == 201
    data = resp.json()
    assert data["content"] == "讲不清楚 useRef 的返回值"
    assert data["source"] == "manual"
    assert data["status"] == "open"
    assert data["resolved_at"] is None
    assert data["topic_id"] == created["id"]


@pytest.mark.asyncio
async def test_create_problem_empty_400(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    resp = await _create_problem(client, created["id"], content="   ")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_problem_topic_not_found(client):
    resp = await _create_problem(client, 99999)
    assert resp.status_code == 404


# ─── 标记解决 / 重开 ───────────────────────────────────
@pytest.mark.asyncio
async def test_resolve_problem(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    problem = (await _create_problem(client, created["id"])).json()
    resp = await client.put(
        f"/api/feynman/topics/{created['id']}/problems/{problem['id']}", json={"status": "resolved"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "resolved"
    assert data["resolved_at"] is not None


@pytest.mark.asyncio
async def test_reopen_problem(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    problem = (await _create_problem(client, created["id"])).json()
    pid = problem["id"]
    await client.put(f"/api/feynman/topics/{created['id']}/problems/{pid}", json={"status": "resolved"})
    resp = await client.put(f"/api/feynman/topics/{created['id']}/problems/{pid}", json={"status": "open"})
    data = resp.json()
    assert data["status"] == "open"
    assert data["resolved_at"] is None


@pytest.mark.asyncio
async def test_update_problem_invalid_status_400(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    problem = (await _create_problem(client, created["id"])).json()
    resp = await client.put(
        f"/api/feynman/topics/{created['id']}/problems/{problem['id']}", json={"status": "done"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_problem_not_found(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    resp = await client.put(
        f"/api/feynman/topics/{created['id']}/problems/99999", json={"status": "resolved"}
    )
    assert resp.status_code == 404


# ─── 级联删除 ──────────────────────────────────────────
@pytest.mark.asyncio
async def test_delete_topic_cascades_problems(client, db_session):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    await _create_problem(client, created["id"])
    assert (await client.delete(f"/api/feynman/topics/{created['id']}")).status_code == 200
    result = await db_session.execute(select(FeynmanProblem))
    assert result.scalars().all() == []


# ─── 列表 presence 标记（不显示数量）────────────────────
@pytest.mark.asyncio
async def test_list_has_problems_marker(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    assert (await client.get("/api/feynman/topics")).json()[0]["has_problems"] is False

    await _create_problem(client, created["id"])
    assert (await client.get("/api/feynman/topics")).json()[0]["has_problems"] is True

    problem = (await client.get(f"/api/feynman/topics/{created['id']}")).json()["problems"][0]
    await client.put(
        f"/api/feynman/topics/{created['id']}/problems/{problem['id']}", json={"status": "resolved"}
    )
    assert (await client.get("/api/feynman/topics")).json()[0]["has_problems"] is False


@pytest.mark.asyncio
async def test_topic_detail_includes_problems(client):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    await _create_problem(client, created["id"], "A 卡点")
    await _create_problem(client, created["id"], "B 卡点")
    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert len(detail["problems"]) == 2
    assert detail["problems"][0]["content"] == "A 卡点"


# ─── 零卡点轮自动解决 ─────────────────────────────────
@pytest.mark.asyncio
async def test_send_message_auto_resolves_on_clean_round(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    await _create_problem(client, created["id"], "生命周期理解不清")

    async def fake_assess(name, messages, level, breadth_left, depth_left):
        return {"level": level + 1, "action": "ask_example", "blind_spot": "", "error": ""}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "我听懂了", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    status, _ = await _send_message(client, created["id"], "我把生命周期讲清楚了。")
    assert status == 200

    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["problems"][0]["status"] == "resolved"


@pytest.mark.asyncio
async def test_send_message_keeps_problems_with_blind_spot(client, monkeypatch):
    created = (await client.post("/api/feynman/topics", json={"name": "React Hooks"})).json()
    await _create_problem(client, created["id"], "生命周期理解不清")

    async def fake_assess(name, messages, level, breadth_left, depth_left):
        return {"level": level + 1, "action": "ask_example", "blind_spot": "依赖数组还是缺一环", "error": ""}

    async def fake_stream(name, messages, level, action, blind_spot, error=""):
        yield json.dumps({"content": "还有一环没讲清", "done": True})

    monkeypatch.setattr(feynman_service, "assess_level", fake_assess)
    monkeypatch.setattr(feynman_service, "feynman_tutor_stream", fake_stream)

    status, _ = await _send_message(client, created["id"], "我再补讲一次。")
    assert status == 200

    detail = (await client.get(f"/api/feynman/topics/{created['id']}")).json()
    assert detail["problems"][0]["status"] == "open"
