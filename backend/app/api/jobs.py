from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.job import Job
from app.models.resume import Resume
from app.schemas.job import JobResponse
from app.services.job_service import build_search_query, search_jobs

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


async def _list(db: AsyncSession) -> list[Job]:
    return (await db.execute(select(Job).order_by(Job.id))).scalars().all()


async def _refresh(db: AsyncSession) -> list[Job]:
    """根据所有简历画像联网搜索，替换岗位缓存；失败时保留旧数据"""
    resumes = (await db.execute(select(Resume))).scalars().all()
    query = build_search_query(list(resumes))
    jobs = await search_jobs(query)

    if not jobs:
        return await _list(db)

    for old in await _list(db):
        await db.delete(old)
    for j in jobs:
        db.add(Job(**j))
    await db.commit()
    return await _list(db)


@router.get("", response_model=list[JobResponse])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    """获取缓存的岗位推荐"""
    return await _list(db)


@router.post("/refresh", response_model=list[JobResponse])
async def refresh_jobs(db: AsyncSession = Depends(get_db)):
    """根据简历画像联网搜索并刷新岗位推荐"""
    return await _refresh(db)
