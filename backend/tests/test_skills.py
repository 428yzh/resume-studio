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


@pytest.mark.asyncio
class TestSkillNotes:
    """TC-NOTE 系列：笔记搬服务端（设计纪要 L1 迁移）"""

    async def test_note_roundtrip(self, client):
        """TC-NOTE-001: 存了能原样读回来；中文不坏；没存过是空列表"""
        created = await client.post("/api/skills", json={"name": "pi Agent源码讲解", "notes": "测试用"})
        skill_id = created.json()["id"]

        assert (await client.get(f"/api/skills/{skill_id}/notes")).json() == []

        body = {"unit_key": "1", "cornell": '{"cues":["主循环靠什么驱动"],"notes":"while(true)","summary":"心跳"}'}
        resp = await client.put(f"/api/skills/{skill_id}/notes", json=body)
        assert resp.status_code == 200

        stored = (await client.get(f"/api/skills/{skill_id}/notes")).json()
        assert len(stored) == 1
        assert stored[0]["unit_key"] == "1"
        assert "主循环靠什么驱动" in stored[0]["cornell"]

    async def test_note_upsert_overwrites_not_appends(self, client):
        """TC-NOTE-002: 同一块内容是覆盖 —— 自动保存的每次落库不该攒出一堆副本"""
        skill_id = (await client.post("/api/skills", json={"name": "临时", "notes": "x"})).json()["id"]

        await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": "4,5", "cornell": "第一版"})
        await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": "4,5", "cornell": "第二版"})

        stored = (await client.get(f"/api/skills/{skill_id}/notes")).json()
        assert len(stored) == 1
        assert stored[0]["cornell"] == "第二版"

        # 换一块（另一个单元的笔记）是新增，不会顶掉前一条
        await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": "1", "cornell": "另一块"})
        assert len((await client.get(f"/api/skills/{skill_id}/notes")).json()) == 2

    async def test_notes_die_with_skill(self, client, db_session):
        """TC-NOTE-003: 删技能，笔记跟着走 —— 靠 FK ON DELETE CASCADE，不是应用层清理"""
        from sqlalchemy import text

        async def rows() -> int:
            # 直接数表。走端点会「技能不存在 → 也返回空列表」，那样测不出级联到底有没有生效
            return (await db_session.execute(text("SELECT COUNT(*) FROM skill_notes"))).scalar()

        skill_id = (await client.post("/api/skills", json={"name": "临时", "notes": "x"})).json()["id"]
        await client.put(f"/api/skills/{skill_id}/notes", json={"unit_key": "step1", "cornell": "老计划的笔记"})
        assert await rows() == 1

        await client.delete(f"/api/skills/{skill_id}")
        assert await rows() == 0
