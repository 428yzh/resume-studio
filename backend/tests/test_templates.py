"""TC-TEMPLATE 系列：模板管理"""
import json
import pytest
from sqlalchemy import select

from app.models.template import ResumeTemplate


@pytest.mark.asyncio
class TestTemplates:
    async def _seed_template(self, db_session):
        t = ResumeTemplate(
            name="测试模板",
            description="测试描述",
            structure=json.dumps({
                "sections": [
                    {"key": "header", "title": "个人信息", "required": True, "max_length": 500}
                ]
            }),
            is_default=True,
        )
        db_session.add(t)
        await db_session.commit()

    async def test_list_templates(self, client, db_session):
        """TC-TEMPLATE-001: GET /api/templates 列出模板"""
        await self._seed_template(db_session)
        resp = await client.get("/api/templates")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["name"] == "测试模板"

    async def test_get_template(self, client, db_session):
        """TC-TEMPLATE-002: GET /api/templates/:id 获取模板详情"""
        await self._seed_template(db_session)
        result = await db_session.execute(select(ResumeTemplate))
        t = result.scalar_one()

        resp = await client.get(f"/api/templates/{t.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试模板"

    async def test_get_template_not_found(self, client):
        """TC-TEMPLATE-002b: 不存在的模板返回 404"""
        resp = await client.get("/api/templates/999")
        assert resp.status_code == 404
