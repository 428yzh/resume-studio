"""TC-SCORE 系列：分数落回图谱节点（⑥）

规则（自下而上）：
- 有证据的节点：分 = 最深那条来源的平均（选择题 0/100，问答题取 AI 的 0-100）
- 父节点：子节点分的平均，子节点全没测时退回自己那条直接证据
- 没测过的节点是「未测」（None），不是 0，也不摊进平均
- 跨来源取优先级最高的（费曼 > 刷题 > 笔记），**不平均**
"""
import json

import pytest

from app.services.scoring import compute_scores

# 三层小树：1 有两条子链，2 是叶子
TREE = [
    {
        "id": "1",
        "title": "模型",
        "children": [
            {
                "id": "1.1",
                "title": "如何调用模型",
                "children": [
                    {"id": "1.1.1", "title": "流式调用", "children": []},
                    {"id": "1.1.2", "title": "工具调用", "children": []},
                ],
            },
            {"id": "1.2", "title": "提示词模板", "children": []},
        ],
    },
    {"id": "2", "title": "输出解析器", "children": []},
]


def test_leaf_score_is_answer_average():
    """TC-SCORE-001: 叶子节点的分 = 它答过的题的平均（2 对 1 错 → 67）"""
    scores = compute_scores(TREE, {"1.1.1": {"quiz": [100, 100, 0]}})
    assert scores["1.1.1"] == {"score": 67, "answered": 3, "own": 3}


def test_design_mockup_average():
    """TC-SCORE-002: 设计图的算例 —— 六个顶层块（30/70/90/15/40/20）的平均 = 44

    「一个主题分 4 个子主题、每个 20 分，全学完就是 100」是同一件事的另一种说法：
    等权平均下，子节点满分推上去父节点就是满分。总分是算出来的，能逐层拆回去验算。
    """
    six = [30, 70, 90, 15, 40, 20]
    nodes = [
        {"id": str(i + 1), "title": f"块{i + 1}", "children": [
            {"id": f"{i + 1}.1", "title": "子", "children": []}
        ]}
        for i in range(6)
    ]
    scores = compute_scores(nodes, {f"{i + 1}.1": {"quiz": [s]} for i, s in enumerate(six)})
    assert [scores[str(i + 1)]["score"] for i in range(6)] == six
    assert round(sum(six) / 6) == 44


def test_untested_not_counted_as_zero():
    """TC-SCORE-003: 未测的子节点不摊进平均，也不显示为 0

    测过 80 的父节点如果因为另有一个未测的子节点被摊成 40，就是把「没学过」
    算成了「学得差」—— 而这俩要的动作完全不同（去学 vs 去补）。
    """
    scores = compute_scores(TREE, {"1.1.1": {"quiz": [80]}})
    assert scores["1.1"]["score"] == 80          # 只有 1.1.1 有分，1.1.2 未测
    assert scores["1.1.2"] == {"score": None, "answered": 0, "own": 0}
    assert scores["1"]["score"] == 80            # 1.2 未测，不参与


def test_parent_own_evidence_when_leaves_untested():
    """TC-SCORE-004: 子节点全没测、父节点自己被直接考过 → 用父自己的分（不浪费这条证据）"""
    scores = compute_scores(TREE, {"2": {"quiz": [60]}})
    assert scores["2"] == {"score": 60, "answered": 1, "own": 1}


def test_all_untested_is_none_not_zero():
    """TC-SCORE-005: 全没测 → 全是 None（前端画虚线），不是 0 分"""
    scores = compute_scores(TREE, {})

    def walk(nodes):
        for n in nodes:
            assert scores[n["id"]] == {"score": None, "answered": 0, "own": 0}
            walk(n["children"])
    walk(TREE)


def test_three_level_accumulation():
    """TC-SCORE-006: 三层自下而上 —— 1.1 = 两个叶子的平均，1 = 1.1 与 1.2 的平均"""
    scores = compute_scores(TREE, {
        "1.1.1": {"quiz": [100]},
        "1.1.2": {"quiz": [50]},
        "1.2": {"quiz": [30]},
    })
    assert scores["1.1"]["score"] == 75
    assert scores["1"]["score"] == 52            # (75 + 30) / 2 = 52.5，Python round 取偶
    assert scores["1"]["answered"] == 3          # 子节点的答题数累加


def test_deeper_source_wins_not_averaged():
    """TC-SCORE-011: 跨来源取最深那条，不平均

    选择题 90 分 + 费曼讲不出来（L1 = 16）平均成 53 的话，「能选对但讲不出」
    这个洞就被抹平了 —— 而这正是最该被看见的信号。费曼最能证伪，优先取它。
    """
    scores = compute_scores(TREE, {"1.1.1": {"quiz": [90], "feynman": [16]}})
    assert scores["1.1.1"] == {"score": 16, "answered": 2, "own": 2}
    # 同一来源内才平均
    scores = compute_scores(TREE, {"1.1.1": {"feynman": [16, 32]}})
    assert scores["1.1.1"]["score"] == 24
    # 笔记只在没有更深来源时兜底
    scores = compute_scores(TREE, {"1.1.1": {"notes": [40], "quiz": [90]}})
    assert scores["1.1.1"]["score"] == 90


# ── 端点层：出题挂节点 → 答题 → 图谱带分 ──────────────────────

GRAPH = [
    {
        "id": "1",
        "title": "循环驱动",
        "children": [
            {"id": "1.1", "title": "消息循环", "children": []},
            {"id": "1.2", "title": "退出条件", "children": []},
        ],
    },
    {"id": "2", "title": "别的块", "children": []},
]


async def _seed_skill(client, monkeypatch, *, graph=GRAPH):
    skill_id = (await client.post("/api/skills", json={"name": "TC-SCORE 临时技能", "notes": "测试用"})).json()["id"]

    async def fake_graph(name, notes=""):
        return {"nodes": graph, "degraded": False, "issues": []}

    monkeypatch.setattr("app.api.skills.generate_knowledge_graph", fake_graph)
    await client.post(f"/api/skills/{skill_id}/graph")
    return skill_id


def _fake_questions(*node_ids):
    """造一批带 node_id 的题：给定 node_ids 逐题挂上去（空串 = 没挂）"""
    async def fake(mode, skill_names, jd_context="", counts=None, block_context=""):
        fake.block_context = block_context
        return [
            {
                "type": "single_choice",
                "question_text": f"题 {i}",
                "options": [{"key": "A", "text": "对"}, {"key": "B", "text": "错"}],
                "correct_answer": "A",
                "node_id": nid,
            }
            for i, nid in enumerate(node_ids)
        ]
    return fake


@pytest.mark.asyncio
async def test_generate_carries_block_and_node_id(client, monkeypatch):
    """TC-SCORE-007: 报单元块 → 块（带 id）进 prompt，AI 标的 node_id 落库；编的 id 清空

    AI 编的 id 落库后，分数会挂到一个不存在的节点上，界面上就永远少一块、还查不出原因。
    """
    skill_id = await _seed_skill(client, monkeypatch)
    fake = _fake_questions("1.1", "9.9", "")
    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", fake)
    try:
        resp = await client.post("/api/questions/generate", json={
            "mode": "practice", "skill_id": skill_id, "node_ids": ["1"],
            "counts": {"single_choice": 3, "multi_choice": 0, "essay": 0},
        })
        assert resp.status_code == 200
        qs = resp.json()
        assert [q["node_id"] for q in qs] == ["1.1", "", ""]
        # 块进 prompt：1 的子树都在，别的块（2）不在
        assert "1.1  消息循环" in fake.block_context
        assert "1.2  退出条件" in fake.block_context
        assert "别的块" not in fake.block_context
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_graph_exposes_scores(client, monkeypatch):
    """TC-SCORE-008: 答完题，GET 图谱带每个节点的分；没测的节点是 null"""
    skill_id = await _seed_skill(client, monkeypatch)
    fake = _fake_questions("1.1", "1.1")
    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", fake)
    try:
        qs = (await client.post("/api/questions/generate", json={
            "mode": "practice", "skill_id": skill_id, "node_ids": ["1"],
            "counts": {"single_choice": 2, "multi_choice": 0, "essay": 0},
        })).json()
        qids = [q["id"] for q in qs]
        sid = (await client.post("/api/quiz/sessions", json={"mode": "practice", "question_ids": qids})).json()["id"]
        # 一对一错
        await client.post(f"/api/quiz/sessions/{sid}/submit", json={"answers": {str(qids[0]): "A", str(qids[1]): "B"}})

        graph = (await client.get(f"/api/skills/{skill_id}/graph")).json()
        s = graph["scores"]
        assert s["1.1"] == {"score": 50, "answered": 2, "own": 2}
        assert s["1"]["score"] == 50           # 1.2 未测，不摊
        assert s["1"]["own"] == 0              # 分数是子节点算上来的，不代表 1 本身被测过
        assert s["1.2"] == {"score": None, "answered": 0, "own": 0}
        assert s["2"] == {"score": None, "answered": 0, "own": 0}

        # 按技能筛题（技能面板的关联题目）：曾经用 LIKE '%"id"%' 查、数字不带引号，永远为空
        by_skill = (await client.get(f"/api/questions?skill_id={skill_id}")).json()
        assert sorted(q["id"] for q in by_skill) == sorted(qids)  # created_at 同秒，不赌顺序
        assert (await client.get("/api/questions?skill_id=999999")).json() == []
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_plain_quiz_does_not_score(client, monkeypatch):
    """TC-SCORE-009: 普通刷题不带节点 → node_id 空，图谱分数表里没有它"""
    skill_id = await _seed_skill(client, monkeypatch)
    fake = _fake_questions("")
    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", fake)
    try:
        qs = (await client.post("/api/questions/generate", json={
            "mode": "practice", "skill_id": skill_id,
            "counts": {"single_choice": 1, "multi_choice": 0, "essay": 0},
        })).json()
        assert qs[0]["node_id"] == ""
        sid = (await client.post("/api/quiz/sessions", json={"mode": "practice", "question_ids": [qs[0]["id"]]})).json()["id"]
        await client.post(f"/api/quiz/sessions/{sid}/submit", json={"answers": {str(qs[0]["id"]): "A"}})

        graph = (await client.get(f"/api/skills/{skill_id}/graph")).json()
        assert all(v["score"] is None for v in graph["scores"].values())
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_node_ids_without_graph_does_not_crash(client, monkeypatch):
    """TC-SCORE-010: 技能还没生成图谱却报了 node_ids → 块为空，照常出题（对手输 URL / 老前端）"""
    skill_id = (await client.post("/api/skills", json={"name": "TC-SCORE 无图谱", "notes": "测试用"})).json()["id"]
    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", _fake_questions("1.1"))
    try:
        resp = await client.post("/api/questions/generate", json={
            "mode": "practice", "skill_id": skill_id, "node_ids": ["1"],
            "counts": {"single_choice": 1, "multi_choice": 0, "essay": 0},
        })
        assert resp.status_code == 200
        assert resp.json()[0]["node_id"] == ""      # 没有图谱就没有合法 id，编的清空
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_graph_summary_counts_direct_evidence_only(client, monkeypatch):
    """TC-SCORE-012: 列表接口带卡片摘要（设计 4.1）

    coverage 只数**直接证据**：父节点 1 的分是子节点 1.1 算出来的，不代表 1 被测过 ——
    拿 answered（含子树）算覆盖率，「孩子测了」会被充成「父节点测了」，覆盖率虚高。
    单元数来自学习计划；没图谱 → 摘要 None（卡片显示「未生成图谱」）。
    """
    skill_id = await _seed_skill(client, monkeypatch)

    async def fake_plan(name, required_level, prior, graph):
        return {"required_level": required_level, "steps": [
            {"step": 1, "title": "单元1", "node_ids": ["1"]},
            {"step": 2, "title": "单元2", "node_ids": ["2"]},
        ]}

    monkeypatch.setattr("app.api.skills.generate_learning_plan", fake_plan)
    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", _fake_questions("1.1", "1.1"))
    try:
        await client.post(f"/api/skills/{skill_id}/learning-plan", json={"required_level": "熟悉"})
        qs = (await client.post("/api/questions/generate", json={
            "mode": "practice", "skill_id": skill_id, "node_ids": ["1"],
            "counts": {"single_choice": 2, "multi_choice": 0, "essay": 0},
        })).json()
        qids = [q["id"] for q in qs]
        sid = (await client.post("/api/quiz/sessions", json={"mode": "practice", "question_ids": qids})).json()["id"]
        await client.post(f"/api/quiz/sessions/{sid}/submit", json={"answers": {str(qids[0]): "A", str(qids[1]): "B"}})

        me = next(s for s in (await client.get("/api/skills")).json() if s["id"] == skill_id)
        g = me["graph_summary"]
        assert g["tested"] == 1            # 只有 1.1 自己答过题；1 的分是它算上来的，不算
        assert g["total"] == 4             # 1 / 1.1 / 1.2 / 2
        assert g["depth"] == 2
        assert g["score"] == 50
        assert g["lowest"] == {"id": "1", "title": "循环驱动", "score": 50}
        assert g["units"] == 2

        # PUT 也要带摘要：store 拿响应整对象替换，摘要丢了卡片就瞎了
        updated = (await client.put(f"/api/skills/{skill_id}", json={"notes": "改备注"})).json()
        assert updated["graph_summary"]["tested"] == 1

        plain = (await client.post("/api/skills", json={"name": "TC-SCORE 无图谱摘要"})).json()
        try:
            assert plain["graph_summary"] is None
        finally:
            await client.delete(f"/api/skills/{plain['id']}")
    finally:
        await client.delete(f"/api/skills/{skill_id}")


@pytest.mark.asyncio
async def test_essay_grading_failure_stores_null_not_zero(client, monkeypatch):
    """TC-SCORE-013: 交卷时 AI 评分挂掉 → ai_score 存 null（未测≠0），不是 0 分

    存 0 会让「AI 没评到」冒充「AI 评了 0 分」：结果页显红、图谱分被拉低，全查不出原因。
    """

    async def fake_essay(mode, skill_names, jd_context="", counts=None, block_context=""):
        return [{
            "type": "essay",
            "question_text": "讲讲浏览器事件循环",
            "options": [],
            "correct_answer": "评分要点：宏任务 / 微任务 / 渲染时机",
            "node_id": "",
        }]

    async def boom(*a, **kw):
        raise RuntimeError("DeepSeek 不可用")

    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", fake_essay)
    monkeypatch.setattr("app.api.quiz.grade_essay_answer", boom)

    qs = (await client.post("/api/questions/generate", json={
        "mode": "practice", "counts": {"single_choice": 0, "multi_choice": 0, "essay": 1},
    })).json()
    qid = qs[0]["id"]
    sid = (await client.post("/api/quiz/sessions", json={"mode": "practice", "question_ids": [qid]})).json()["id"]
    resp = await client.post(f"/api/quiz/sessions/{sid}/submit", json={"answers": {str(qid): "我的回答"}})
    assert resp.status_code == 200

    ans = (await client.get(f"/api/quiz/sessions/{sid}")).json()["answers"][0]
    assert ans["is_correct"] is None
    assert ans["ai_score"] is None  # 曾存 0
    assert ans["ai_feedback"] == "AI 评分暂不可用"


@pytest.mark.asyncio
async def test_multi_choice_grading_tolerates_spaces(client, monkeypatch):
    """TC-SCORE-014: 多选题 AI 写成 "A, C"（带空格）→ 用户 "C,A" 仍判对

    判分是集合比对，prompt 约束不住生成端时（曾连 multi_choice 的返回示例都没有）空格会
    让正确答案判错 —— 必须按选项字母归一化后再比。
    """

    async def fake_multi(mode, skill_names, jd_context="", counts=None, block_context=""):
        return [{
            "type": "multi_choice",
            "question_text": "选出所有正确项",
            "options": [{"key": "A", "text": "a"}, {"key": "B", "text": "b"}, {"key": "C", "text": "c"}, {"key": "D", "text": "d"}],
            "correct_answer": "A, C",  # AI 没守「无空格」格式约束
            "node_id": "",
        }]

    monkeypatch.setattr("app.api.quiz.generate_quiz_questions", fake_multi)

    qs = (await client.post("/api/questions/generate", json={
        "mode": "practice", "counts": {"single_choice": 0, "multi_choice": 1, "essay": 0},
    })).json()
    qid = qs[0]["id"]
    sid = (await client.post("/api/quiz/sessions", json={"mode": "practice", "question_ids": [qid]})).json()["id"]
    await client.post(f"/api/quiz/sessions/{sid}/submit", json={"answers": {str(qid): "C,A"}})

    ans = (await client.get(f"/api/quiz/sessions/{sid}")).json()["answers"][0]
    assert ans["is_correct"] is True
