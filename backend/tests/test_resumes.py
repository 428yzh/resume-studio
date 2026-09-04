"""TC-RESUME 系列：简历 CRUD"""
import pytest


@pytest.mark.asyncio
class TestResumes:
    async def test_create_resume(self, client):
        """TC-RESUME-001: POST /api/resumes 创建简历"""
        resp = await client.post("/api/resumes", json={
            "title": "测试简历",
            "template_id": 1,
            "sections": {"summary": "资深前端开发"},
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "测试简历"
        assert data["sections"]["summary"] == "资深前端开发"

    async def test_list_resumes(self, client):
        """TC-RESUME-002: GET /api/resumes 列出简历"""
        await client.post("/api/resumes", json={"title": "简历1"})
        await client.post("/api/resumes", json={"title": "简历2"})

        resp = await client.get("/api/resumes")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    async def test_get_resume(self, client):
        """TC-RESUME-003: GET /api/resumes/:id 获取详情"""
        created = await client.post("/api/resumes", json={"title": "测试简历"})
        resume_id = created.json()["id"]

        resp = await client.get(f"/api/resumes/{resume_id}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "测试简历"

    async def test_get_resume_not_found(self, client):
        """TC-RESUME-003b: 不存在的简历返回 404"""
        resp = await client.get("/api/resumes/999")
        assert resp.status_code == 404

    async def test_update_resume(self, client):
        """TC-RESUME-004: PUT /api/resumes/:id 更新简历"""
        created = await client.post("/api/resumes", json={"title": "旧标题"})
        resume_id = created.json()["id"]

        resp = await client.put(f"/api/resumes/{resume_id}", json={"title": "新标题"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "新标题"

    async def test_delete_resume(self, client):
        """TC-RESUME-005: DELETE /api/resumes/:id 删除简历"""
        created = await client.post("/api/resumes", json={"title": "待删除"})
        resume_id = created.json()["id"]

        resp = await client.delete(f"/api/resumes/{resume_id}")
        assert resp.status_code == 204

        resp = await client.get(f"/api/resumes/{resume_id}")
        assert resp.status_code == 404
