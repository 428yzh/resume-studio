"""TC-HEALTH 系列：健康检查"""
import pytest


@pytest.mark.asyncio
class TestHealth:
    async def test_health_check(self, client):
        """TC-HEALTH-001: GET /health 返回 200"""
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "resume-app"
