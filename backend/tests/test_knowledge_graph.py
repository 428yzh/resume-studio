"""知识图谱测试

TC-GRAPH 系列：树的容量校验（结论 14）/ 节点 id 分配（结论 12 分数落点）/ 端点存取。

校验器是这个模块唯一有分支的逻辑，也是「不静默接受一棵超深的树」的闸门，重点测它。
"""
import pytest

from app.services.ai_service import _assign_ids, _count_nodes, _validate_graph


def _node(title: str, *children) -> dict:
    return {"title": title, "children": list(children)}


def _fanout(breadth: int, depth: int, tag: str = "n") -> dict:
    """造一棵每层 breadth 个子节点的树"""
    if depth == 0:
        return _node(tag)
    return _node(tag, *[_fanout(breadth, depth - 1, f"{tag}{i}") for i in range(breadth)])


def _ok_graph(top: int = 4, kids: int = 3) -> list:
    """一棵合格的树：top 个顶层节点，每个 kids 个子节点 → top*(1+kids) 个节点"""
    return [_node(f"top{i}", *[_node(f"t{i}k{j}") for j in range(kids)]) for i in range(top)]


# ─── 合格判定 ──────────────────────────────────────────
def test_valid_graph_passes():
    assert _validate_graph(_ok_graph(top=4, kids=4)) == []  # 4 + 16 = 20 节点


def test_top_level_count_enforced():
    issues = _validate_graph(_ok_graph(top=3, kids=4))
    assert any("顶层 3 个" in i for i in issues)

    issues = _validate_graph(_ok_graph(top=9, kids=3))
    assert any("顶层 9 个" in i for i in issues)


def test_child_count_enforced():
    """顶层 4 个、每个只有 1 个子节点 —— 结构上合法但太稀疏，要拦"""
    issues = _validate_graph(_ok_graph(top=4, kids=1))
    assert any("个子节点" in i for i in issues)


def test_depth_over_limit_rejected():
    """4 层的树必须被拒：父节点累加会算错（结论 13/14）"""
    graph = [_fanout(breadth=3, depth=3) for _ in range(4)]
    issues = _validate_graph(graph)
    assert any("超过 3 层" in i for i in issues)


def test_total_node_count_enforced():
    """每一层都合法但总量超标（4 × (1+5+25) = 124）"""
    graph = [_node("t", *[_node("m", *[_node("l") for _ in range(5)]) for _ in range(5)]) for _ in range(4)]
    issues = _validate_graph(graph)
    assert any("总节点" in i for i in issues)


def test_count_nodes_ignores_non_dict_children():
    """模型偶尔把 children 写成字符串/null，计数不能炸"""
    assert _count_nodes([{"title": "a", "children": None}, {"title": "b", "children": ["垃圾", 42]}]) == 2


# ─── id 分配 ───────────────────────────────────────────
def test_assign_ids_are_positional_and_stable():
    graph = _assign_ids(_ok_graph(top=2, kids=2))
    assert [n["id"] for n in graph] == ["1", "2"]
    assert [n["id"] for n in graph[0]["children"]] == ["1.1", "1.2"]
    assert graph[0]["children"][0]["children"] == []


def test_assign_ids_three_levels():
    graph = _assign_ids([_node("a", _node("b", _node("c")))])
    assert graph[0]["children"][0]["children"][0]["id"] == "1.1.1"


def test_assign_ids_strips_title_and_drops_junk_children():
    graph = _assign_ids([{"title": "  空格  ", "children": ["垃圾", {"title": "真节点"}]}])
    assert graph[0]["title"] == "空格"
    assert [c["title"] for c in graph[0]["children"]] == ["真节点"]


# ─── 端点 ──────────────────────────────────────────────
@pytest.mark.asyncio
async def test_graph_endpoints_roundtrip(client, monkeypatch):
    """未生成 → null；生成后 → 落库可读；不存在的技能 → 404"""
    resp = await client.post("/api/skills", json={"name": "TC-GRAPH 临时技能", "notes": "测试用"})
    skill_id = resp.json()["id"]
    try:
        assert (await client.get(f"/api/skills/{skill_id}/graph")).json() is None

        async def fake_graph(name, notes=""):
            return {"nodes": _assign_ids(_ok_graph()), "degraded": False, "issues": []}

        monkeypatch.setattr("app.api.skills.generate_knowledge_graph", fake_graph)

        body = (await client.post(f"/api/skills/{skill_id}/graph")).json()
        assert body["degraded"] is False
        assert [n["id"] for n in body["nodes"]] == ["1", "2", "3", "4"]

        stored = (await client.get(f"/api/skills/{skill_id}/graph")).json()
        assert stored == body  # 中文标题也要原样往返，不能被转义坏掉

        assert (await client.get("/api/skills/999999/graph")).status_code == 404
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_empty_graph_not_persisted(client, monkeypatch):
    """生成失败（空图谱）不落库，重进页面仍是「未生成图谱」"""
    resp = await client.post("/api/skills", json={"name": "TC-GRAPH 空图技能", "notes": "测试用"})
    skill_id = resp.json()["id"]
    try:
        async def fake_graph(name, notes=""):
            return {"nodes": [], "degraded": False, "issues": ["AI 服务未配置"]}

        monkeypatch.setattr("app.api.skills.generate_knowledge_graph", fake_graph)

        body = (await client.post(f"/api/skills/{skill_id}/graph")).json()
        assert body["nodes"] == []
        assert (await client.get(f"/api/skills/{skill_id}/graph")).json() is None
    finally:
        await client.delete(f"/api/skills/{skill_id}")


# ─── 学习计划 = 图谱切分（TC-PLAN，结论 8/9）────────────────
from app.services.ai_service import _render_graph_for_prompt, _validate_plan_coverage  # noqa: E402


def _step(title: str, ids: list) -> dict:
    return {"step": 1, "title": title, "node_ids": ids}


def test_plan_full_coverage_passes():
    """顶层 4 个，4 个单元一一对应；也允许合并成更少的单元（了解档）"""
    assert _validate_plan_coverage([_step(f"单元{i}", [str(i)]) for i in range(1, 5)], ["1", "2", "3", "4"]) == []
    assert _validate_plan_coverage([_step("单元A", ["1", "2"]), _step("单元B", ["3", "4"])], ["1", "2", "3", "4"]) == []


def test_plan_missing_node_flagged():
    """漏掉一个顶层节点 = 那块知识永远不会被安排学，必须拦"""
    issues = _validate_plan_coverage([_step("单元1", ["1"]), _step("单元2", ["2"])], ["1", "2", "3", "4"])
    assert any("没有任何单元覆盖" in i and "'3'" in i and "'4'" in i for i in issues)


def test_plan_duplicate_coverage_flagged():
    issues = _validate_plan_coverage([_step("单元A", ["1", "2"]), _step("单元B", ["2", "3"])], ["1", "2", "3"])
    assert any("重复覆盖" in i and "'2'" in i for i in issues)


def test_plan_non_top_level_id_flagged():
    """模型爱引用子节点 id —— 那会让分数落点错位，要拦"""
    issues = _validate_plan_coverage([_step("单元1", ["1.2"]), _step("单元2", ["2"])], ["1", "2"])
    assert any("不存在的节点" in i and "1.2" in i for i in issues)
    assert any("没有任何单元覆盖" in i and "'1'" in i for i in issues)


def test_plan_empty_ids_and_junk_steps_dont_crash():
    issues = _validate_plan_coverage(["垃圾", _step("空单元", []), None], ["1"])
    assert any("node_ids 是空的" in i for i in issues)
    assert any("没有任何单元覆盖" in i for i in issues)


def test_render_graph_for_prompt_has_ids_and_indent():
    text = _render_graph_for_prompt(_assign_ids(_ok_graph(top=2, kids=2)))
    lines = text.splitlines()
    assert lines[0] == "1  top0"
    assert lines[1] == "  1.1  t0k0"  # 缩进表示层级，id 必须在（切分依据是 id）
    assert lines[2] == "  1.2  t0k1"
    assert lines[3] == "2  top1"  # 第二棵顶层子树回到零缩进


@pytest.mark.asyncio
async def test_plan_endpoint_requires_graph(client, monkeypatch):
    """结论 8：图谱先生成。没图就没得切 —— 409，不退回「凭空排计划」"""
    resp = await client.post("/api/skills", json={"name": "TC-PLAN 临时技能", "notes": "测试用"})
    skill_id = resp.json()["id"]
    try:
        r = await client.post(f"/api/skills/{skill_id}/learning-plan", json={"required_level": "熟悉"})
        assert r.status_code == 409
        assert "知识图谱" in r.json()["detail"]

        # 生成图谱后放行，并把图谱交给切分函数（而不是丢掉）
        async def fake_graph(name, notes=""):
            return {"nodes": _assign_ids(_ok_graph()), "degraded": False, "issues": []}

        got: dict = {}

        async def fake_plan(name, level, prior="", graph=None):
            got["graph"] = graph
            return {"required_level": level, "steps": [_step("单元1", ["1"])], "milestones": []}

        monkeypatch.setattr("app.api.skills.generate_knowledge_graph", fake_graph)
        monkeypatch.setattr("app.api.skills.generate_learning_plan", fake_plan)

        await client.post(f"/api/skills/{skill_id}/graph")
        body = (await client.post(f"/api/skills/{skill_id}/learning-plan", json={"required_level": "精通"})).json()

        assert [n["id"] for n in got["graph"]] == ["1", "2", "3", "4"]  # 图谱真的传下去了
        assert body["steps"][0]["node_ids"] == ["1"]
        assert body["prior_understanding"] == ""
        assert (await client.get(f"/api/skills/{skill_id}/learning-plan")).json()["required_level"] == "精通"
    finally:
        await client.delete(f"/api/skills/{skill_id}")


# ─── 单元的内容边界（TC-BLOCK，结论 10）──────────────────
from app.services.ai_service import _find_nodes  # noqa: E402


def test_find_nodes_takes_subtree_with_children():
    """命中top节点要连子树一起取 —— 单元概述要讲的是整块，不是节点标题一行"""
    graph = _assign_ids(_ok_graph(top=4, kids=2))
    hit = _find_nodes(graph, {"2"})
    assert [n["id"] for n in hit] == ["2"]
    assert [c["id"] for c in hit[0]["children"]] == ["2.1", "2.2"]


def test_find_nodes_multiple_ids_keep_original_order():
    """了解档一个单元会合并相邻顶层节点，顺序按图谱来、不按调用方给的顺序"""
    graph = _assign_ids(_ok_graph(top=4, kids=2))
    hit = _find_nodes(graph, {"3", "1"})
    assert [n["id"] for n in hit] == ["1", "3"]


def test_find_nodes_reaches_second_level():
    """点深入讲解入口传的是子节点 id，得能在第二层命中"""
    graph = _assign_ids(_ok_graph(top=3, kids=2))
    hit = _find_nodes(graph, {"2.1"})
    assert len(hit) == 1 and hit[0]["title"] == "t1k0"  # 第 2 个 top 的第 1 个孩子


def test_find_nodes_missing_id_is_empty_and_junk_safe():
    graph = _assign_ids(_ok_graph(top=2, kids=2))
    assert _find_nodes(graph, {"9.9"}) == []
    assert _find_nodes(["垃圾", {"id": "1", "title": "真", "children": []}], {"1"})[0]["title"] == "真"


@pytest.mark.asyncio
async def test_explain_topic_endpoint_renders_block_from_graph(client, monkeypatch):
    """端点自己从技能图谱里取块 —— 前端只报 id，缩进格式归后端一处"""
    resp = await client.post("/api/skills", json={"name": "TC-BLOCK 临时技能", "notes": "测试用"})
    skill_id = resp.json()["id"]
    try:
        async def fake_graph(name, notes=""):
            return {"nodes": _assign_ids(_ok_graph(top=4, kids=2)), "degraded": False, "issues": []}

        monkeypatch.setattr("app.api.skills.generate_knowledge_graph", fake_graph)
        await client.post(f"/api/skills/{skill_id}/graph")

        seen: dict = {}

        async def fake_explain(**kw):
            seen.update(kw)
            return {"explanation": "## x", "topic_keywords": []}

        monkeypatch.setattr("app.api.ai.explain_topic", fake_explain)
        body = {"skill_name": "临时", "step_title": "单元", "skill_id": skill_id, "node_ids": ["2", "3"]}
        await client.post("/api/ai/explain-topic", json=body)

        block = seen["graph_block"]
        assert [ln.strip().split("  ")[0] for ln in block.splitlines()] == ["2", "2.1", "2.2", "3", "3.1", "3.2"]
        assert block.splitlines()[1].startswith("  ")  # 层级靠缩进

        # 不报 id（旧计划）→ 没有块，退回自由发挥
        await client.post("/api/ai/explain-topic", json={**body, "node_ids": []})
        assert seen["graph_block"] == ""
    finally:
        await client.delete(f"/api/skills/{skill_id}")
