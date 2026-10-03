"""TC-SKILL 系列：技能库"""
import pytest


@pytest.mark.asyncio
class TestSkills:
    async def test_create_skill(self, client):
        """TC-SKILL-001: POST /api/skills 创建技能"""
        resp = await client.post("/api/skills", json={
            "name": "React",
            "category": "前端",
            "proficiency": 80,
            "source": "手动添加",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "React"
        assert data["category"] == "前端"

    async def test_list_skills(self, client):
        """TC-SKILL-002: GET /api/skills 列出技能"""
        await client.post("/api/skills", json={"name": "React", "category": "前端"})
        await client.post("/api/skills", json={"name": "Python", "category": "后端"})

        resp = await client.get("/api/skills")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_filter_skills_by_category(self, client):
        """TC-SKILL-002b: 按分类筛选"""
        await client.post("/api/skills", json={"name": "React", "category": "前端"})
        await client.post("/api/skills", json={"name": "Python", "category": "后端"})

        resp = await client.get("/api/skills?category=前端")
        assert len(resp.json()) == 1
        assert resp.json()[0]["name"] == "React"

    async def test_create_skill_without_proficiency_is_null(self, client):
        """TC-SKILL-001b: 不带 proficiency 创建 → NULL（未表态），不是 0"""
        resp = await client.post("/api/skills", json={"name": "harness", "notes": "压测框架"})
        assert resp.status_code == 201
        assert resp.json()["proficiency"] is None

    async def test_update_skill(self, client):
        """TC-SKILL-003: PUT /api/skills/:id 更新技能"""
        created = await client.post("/api/skills", json={"name": "React", "proficiency": 50})
        skill_id = created.json()["id"]

        resp = await client.put(f"/api/skills/{skill_id}", json={"proficiency": 90})
        assert resp.status_code == 200
        assert resp.json()["proficiency"] == 90

    async def test_delete_skill(self, client):
        """TC-SKILL-004: DELETE /api/skills/:id 删除技能"""
        created = await client.post("/api/skills", json={"name": "React"})
        skill_id = created.json()["id"]

        resp = await client.delete(f"/api/skills/{skill_id}")
        assert resp.status_code == 204

        resp = await client.get("/api/skills")
        assert len(resp.json()) == 0
