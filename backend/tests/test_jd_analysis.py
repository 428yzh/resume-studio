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
