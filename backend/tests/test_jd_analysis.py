"""TC-JD 系列：JD 分析"""
import io
import pytest
from PIL import Image


@pytest.mark.asyncio
class TestJDAnalysis:
    async def test_analyze_jd(self, client):
        """TC-JD-001: POST /api/jd/analyze 分析 JD（无 AI key 时返回默认结果）"""
        resp = await client.post("/api/jd/analyze", json={
            "jd_text": "招聘前端工程师，要求熟悉 React、TypeScript、Node.js",
            "company": "测试公司",
            "position": "前端工程师",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["company"] == "测试公司"
        assert data["position"] == "前端工程师"
        assert "tech_stack" in data

    async def test_list_analyses(self, client):
        """TC-JD-002: GET /api/jd/analyses 列出分析记录"""
        await client.post("/api/jd/analyze", json={"jd_text": "JD 1"})
        await client.post("/api/jd/analyze", json={"jd_text": "JD 2"})

        resp = await client.get("/api/jd/analyses")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_get_analysis_detail(self, client):
        """TC-JD-003: GET /api/jd/analyses/:id 获取分析详情"""
        created = await client.post("/api/jd/analyze", json={"jd_text": "测试 JD"})
        analysis_id = created.json()["id"]

        resp = await client.get(f"/api/jd/analyses/{analysis_id}")
        assert resp.status_code == 200
        assert resp.json()["jd_text"] == "测试 JD"

    async def test_update_analysis_title(self, client):
        """TC-JD-007: PUT /api/jd/analyses/:id 重命名 title 需真正落库

        title 不是 jd_analyses 的列，它从 analysis_result["suggested_title"] 派生，
        所以重命名必须写回 JSON 字段，否则静默失效。
        """
        created = await client.post("/api/jd/analyze", json={"jd_text": "测试 JD"})
        analysis_id = created.json()["id"]

        resp = await client.put(
            f"/api/jd/analyses/{analysis_id}",
            json={"title": "我的自定义标题", "company": "改后的公司", "position": "改后的岗位"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "我的自定义标题"

        # 重新拉取，确认不是只在响应里改了
        detail = await client.get(f"/api/jd/analyses/{analysis_id}")
        assert detail.json()["title"] == "我的自定义标题"
        assert detail.json()["company"] == "改后的公司"
        assert detail.json()["position"] == "改后的岗位"

    async def test_update_analysis_missing(self, client):
        """TC-JD-008: PUT /api/jd/analyses/:id 不存在的记录返回 404"""
        resp = await client.put("/api/jd/analyses/99999", json={"title": "x"})
        assert resp.status_code == 404

    async def test_quiz_generation_carries_jd_context(self, client, monkeypatch):
        """TC-JD-009: 出题带 jd_analysis_id → prompt 拿到的是 JD 的**内容**（岗位 + 技术栈 + 原文）

        回归：曾经只把 `jd_analysis_id` 这个数字拼进 prompt，AI 看不到任何 JD 内容，
        「JD 专属题」等于普通题挂了个外键。题目落 jd_analysis_id，JD 详情按它筛题。
        """
        async def fake_analyze(jd_text):
            return {
                "suggested_title": "LLM 工程师 - 测试公司",
                "tech_stack": [{"name": "LangChain", "category": "后端", "required_level": "精通", "priority": 1}],
                "key_requirements": [], "role_summary": "", "experience_years": "3-5年", "education": "本科",
            }

        monkeypatch.setattr("app.api.jd_analysis.analyze_jd", fake_analyze)
        jd = (await client.post("/api/jd/analyze", json={
            "jd_text": "岗位要求：精通 LangChain 与向量检索。",
            "company": "测试公司", "position": "LLM 工程师",
        })).json()

        captured = {}

        async def fake_q(mode, skill_names, jd_context="", counts=None, block_context=""):
            captured["ctx"] = jd_context
            return [{"type": "single_choice", "question_text": "题", "options": [], "correct_answer": "A", "node_id": ""}]

        monkeypatch.setattr("app.api.quiz.generate_quiz_questions", fake_q)
        resp = await client.post("/api/questions/generate", json={
            "mode": "practice", "jd_analysis_id": jd["id"],
            "counts": {"single_choice": 1, "multi_choice": 0, "essay": 0},
        })
        assert resp.status_code == 200
        q = resp.json()[0]
        assert q["jd_analysis_id"] == jd["id"]
        assert "LLM 工程师" in captured["ctx"]
        assert "LangChain（精通）" in captured["ctx"]
        assert "精通 LangChain 与向量检索" in captured["ctx"]
        # JD 详情页「JD 专属题」按它筛
        by_jd = (await client.get(f"/api/questions?jd_analysis_id={jd['id']}")).json()
        assert [x["id"] for x in by_jd] == [q["id"]]

        await client.delete(f"/api/questions/{q['id']}")
        await client.delete(f"/api/jd/analyses/{jd['id']}")

    async def test_analyze_image_no_file(self, client):
        """TC-JD-004: POST /api/jd/analyze-image 未上传文件返回 422"""
        resp = await client.post("/api/jd/analyze-image")
        assert resp.status_code == 422

    async def test_analyze_image_not_image(self, client):
        """TC-JD-005: POST /api/jd/analyze-image 非图片文件返回 400"""
        resp = await client.post(
            "/api/jd/analyze-image",
            files=[("file", ("test.txt", b"not an image", "text/plain"))],
        )
        assert resp.status_code == 400
        assert "图片" in resp.json()["detail"]

    async def test_analyze_image_white_empty(self, client):
        """TC-JD-006: POST /api/jd/analyze-image 空白图片返回 400"""
        img = Image.new("RGB", (100, 50), "white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        resp = await client.post(
            "/api/jd/analyze-image",
            files=[("file", ("test.png", buf.read(), "image/png"))],
            data={"company": "测试公司", "position": "前端工程师"},
        )
        # OCR extracts nothing from a pure white image → 400
        assert resp.status_code == 400
        assert "无法" in resp.json()["detail"] or "文字" in resp.json()["detail"]
