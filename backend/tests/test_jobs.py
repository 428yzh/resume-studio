"""TC-JOB 系列：岗位推荐（DeepSeek 联网搜索 + SQLite 缓存）"""
import json
import pytest
from sqlalchemy import select

from app.models.job import Job
from app.models.resume import Resume
from app.services.job_service import build_search_query, _parse_jobs_json


@pytest.mark.asyncio
class TestJobs:
    async def test_list_empty(self, client):
        """TC-JOB-001: GET /api/jobs 无数据时返回空列表"""
        resp = await client.get("/api/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_refresh_keeps_old_on_failure(self, client, db_session, monkeypatch):
        """TC-JOB-002: 搜索失败（返回空）时保留旧岗位数据，不误删"""
        db_session.add(Job(title="旧岗位", company="旧公司", url="https://old.com"))
        await db_session.commit()

        async def no_results(query):
            return []

        monkeypatch.setattr("app.api.jobs.search_jobs", no_results)

        resp = await client.post("/api/jobs/refresh")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "旧岗位"

    async def test_refresh_replaces_old(self, client, db_session, monkeypatch):
        """TC-JOB-003: 搜索成功时替换旧数据为新岗位"""
        db_session.add(Job(title="旧岗位", company="旧公司", url="https://old.com"))
        await db_session.commit()

        async def fake(query):
            return [{
                "title": "前端工程师",
                "company": "腾讯",
                "city": "深圳",
                "salary": "20-40K",
                "experience": "3-5年",
                "education": "本科",
                "jd": "精通 React 与 TypeScript",
                "url": "https://example.com/job/1",
            }]

        monkeypatch.setattr("app.api.jobs.search_jobs", fake)

        resp = await client.post("/api/jobs/refresh")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "前端工程师"
        assert data[0]["url"] == "https://example.com/job/1"

        # 旧数据已被替换
        resp2 = await client.get("/api/jobs")
        assert len(resp2.json()) == 1
        assert resp2.json()[0]["title"] == "前端工程师"

    async def test_list_returns_saved(self, client, db_session):
        """TC-JOB-004: GET /api/jobs 返回已缓存岗位"""
        db_session.add(Job(title="缓存岗位", company="字节", city="北京", url="https://bytedance.com/job"))
        await db_session.commit()

        resp = await client.get("/api/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "缓存岗位"
        assert data[0]["company"] == "字节"

    async def test_build_query_from_resumes(self, db_session):
        """TC-JOB-005: build_search_query 汇总所有简历的目标岗位 + 技能"""
        db_session.add(Resume(
            title="前端简历", target_position="前端工程师", target_company="腾讯",
            sections=json.dumps({"skills": [{"name": "React"}, {"name": "TypeScript"}]}),
        ))
        db_session.add(Resume(
            title="后端简历", target_position="后端工程师",
            sections=json.dumps({"skills": [{"name": "Python"}]}),
        ))
        await db_session.commit()

        resumes = (await db_session.execute(select(Resume))).scalars().all()
        query = build_search_query(list(resumes))
        assert "前端工程师" in query
        assert "后端工程师" in query
        assert "React" in query
        assert "腾讯" in query

    async def test_build_query_empty_fallback(self):
        """TC-JOB-006: 无简历时返回默认搜索词"""
        query = build_search_query([])
        assert isinstance(query, str)
        assert query != ""

    async def test_parse_jobs_json_with_code_fence(self):
        """TC-JOB-007: 解析模型输出（含 ```json 代码块）"""
        text = '```json\n[{"title": "岗位A", "url": "https://a.com", "salary": "20K"}, {"title": "无链接岗位", "url": ""}]\n```'
        jobs = _parse_jobs_json(text)
        assert len(jobs) == 1
        assert jobs[0]["title"] == "岗位A"
        assert jobs[0]["url"] == "https://a.com"

    async def test_parse_jobs_json_invalid(self):
        """TC-JOB-008: 无效输出返回空列表"""
        assert _parse_jobs_json("抱歉，没有找到相关岗位") == []
        assert _parse_jobs_json("") == []
