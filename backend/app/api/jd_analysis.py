import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.jd_analysis import JDAnalysis
from app.models.resume import Resume
from app.schemas.jd_analysis import (
    JDAnalyzeRequest, JDAnalyzeFromBossRequest, JDSummaryResponse,
    JDAnalysisResponse, JDAnalysisListItem, JDAnalysisUpdate,
)
from app.services.ai_service import analyze_jd, extract_text_from_image
from app.services.match_service import compute_gaps

router = APIRouter(prefix="/api/jd", tags=["jd_analysis"])


def _record_to_response(record: JDAnalysis) -> dict:
    """Helper to convert ORM record to dict with parsed JSON fields."""
    analysis_result = json.loads(record.analysis_result) if isinstance(record.analysis_result, str) else record.analysis_result
    suggested = (analysis_result or {}).get("suggested_title", "") if isinstance(analysis_result, dict) else ""
    return {
        "id": record.id,
        "company": record.company,
        "position": record.position,
        "title": suggested,
        "jd_text": record.jd_text,
        "tech_stack": json.loads(record.tech_stack) if isinstance(record.tech_stack, str) else record.tech_stack,
        "analysis_result": analysis_result,
        "resume_id": record.resume_id,
        "job_url": record.job_url or "",
        "created_at": record.created_at,
    }


@router.post("/analyze", response_model=JDAnalysisResponse)
async def analyze_jd_endpoint(data: JDAnalyzeRequest, db: AsyncSession = Depends(get_db)):
    analysis = await analyze_jd(data.jd_text)

    record = JDAnalysis(
        company=data.company,
        position=data.position,
        jd_text=data.jd_text,
        tech_stack=json.dumps(analysis.get("tech_stack", []), ensure_ascii=False),
        analysis_result=json.dumps(analysis, ensure_ascii=False),
        resume_id=data.resume_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return _record_to_response(record)


@router.get("/analyses", response_model=list[JDAnalysisListItem])
async def list_analyses(
    resume_id: int | None = Query(None, description="Filter by resume ID"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(JDAnalysis).order_by(JDAnalysis.created_at.desc())
    if resume_id is not None:
        stmt = stmt.where(JDAnalysis.resume_id == resume_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/analyze-image", response_model=JDAnalysisResponse)
async def analyze_jd_image(file: List[UploadFile] = File(...), company: str = "", position: str = "", resume_id: int | None = Query(None), db: AsyncSession = Depends(get_db)):
    """上传多张 JD 截图，OCR 提取文字后走 AI 分析"""
    if not file:
        raise HTTPException(status_code=400, detail="请上传至少一张图片")

    texts: list[str] = []
    for f in file:
        if not f.content_type or not f.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"文件 {f.filename} 不是图片格式")

        contents = await f.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"图片 {f.filename} 大小不能超过 10MB")

        text = await extract_text_from_image(contents)
        if text:
            texts.append(text)

    if not texts:
        raise HTTPException(status_code=400, detail="无法从图片中提取文字，请尝试截图更清晰或手动输入")

    jd_text = "\n\n".join(texts)
    analysis = await analyze_jd(jd_text)

    record = JDAnalysis(
        company=company,
        position=position,
        jd_text=jd_text,
        tech_stack=json.dumps(analysis.get("tech_stack", []), ensure_ascii=False),
        analysis_result=json.dumps(analysis, ensure_ascii=False),
        resume_id=resume_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return _record_to_response(record)


@router.get("/analyses/{analysis_id}", response_model=JDAnalysisResponse)
async def get_analysis(analysis_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(JDAnalysis).where(JDAnalysis.id == analysis_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="分析记录不存在")
    return _record_to_response(record)


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(analysis_id: int, db: AsyncSession = Depends(get_db)):
    """删除 JD 分析记录"""
    result = await db.execute(select(JDAnalysis).where(JDAnalysis.id == analysis_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="分析记录不存在")
    await db.delete(record)
    await db.commit()
    return {"ok": True}


@router.put("/analyses/{analysis_id}", response_model=JDAnalysisResponse)
async def update_analysis(analysis_id: int, data: JDAnalysisUpdate, db: AsyncSession = Depends(get_db)):
    """更新 JD 分析记录（重命名）"""
    result = await db.execute(select(JDAnalysis).where(JDAnalysis.id == analysis_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="分析记录不存在")

    if data.title:
        record.title = data.title
    if data.company:
        record.company = data.company
    if data.position:
        record.position = data.position

    await db.commit()
    await db.refresh(record)
    return _record_to_response(record)


# ═══ BOSS直聘 集成端点 ═══

class _FromBossResponse(JDAnalysisResponse):
    """复用 JDAnalysisResponse 结构"""
    pass


@router.post("/from-boss", response_model=JDAnalysisResponse)
async def analyze_from_boss(data: JDAnalyzeFromBossRequest, db: AsyncSession = Depends(get_db)):
    """BOSS 扩展一键导入 JD：去重 → AI 分析 → 存库"""
    if not data.job_url or not data.jd_text.strip():
        raise HTTPException(status_code=400, detail="job_url 和 jd_text 不能为空")

    # 去重：已分析过则直接返回
    stmt = select(JDAnalysis).where(JDAnalysis.job_url == data.job_url)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return _record_to_response(existing)

    # AI 分析
    analysis = await analyze_jd(data.jd_text)

    record = JDAnalysis(
        company=data.company or "",
        position=data.position or "",
        jd_text=data.jd_text,
        tech_stack=json.dumps(analysis.get("tech_stack", []), ensure_ascii=False),
        analysis_result=json.dumps(analysis, ensure_ascii=False),
        job_url=data.job_url,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return _record_to_response(record)


@router.get("/by-url", response_model=JDAnalysisResponse | None)
async def get_analysis_by_url(url: str = Query(..., description="BOSS直聘职位 URL"), db: AsyncSession = Depends(get_db)):
    """按 BOSS URL 查询分析记录"""
    stmt = select(JDAnalysis).where(JDAnalysis.job_url == url)
    record = (await db.execute(stmt)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="未找到该职位的分析记录")
    return _record_to_response(record)


@router.get("/by-url/summary", response_model=JDSummaryResponse | None)
async def get_analysis_summary_by_url(url: str = Query(..., description="BOSS直聘职位 URL"), db: AsyncSession = Depends(get_db)):
    """轻量匹配摘要（供扩展浮标用）"""
    stmt = select(JDAnalysis).where(JDAnalysis.job_url == url)
    record = (await db.execute(stmt)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="未找到该职位的分析记录")

    # 取最近编辑的简历做匹配
    resume_stmt = select(Resume).order_by(desc(Resume.updated_at)).limit(1)
    resume = (await db.execute(resume_stmt)).scalars().first()
    if not resume:
        return JDSummaryResponse(
            job_url=url,
            match_percentage=0,
            match_count=0,
            total_required=0,
            matched_skills=[],
            missing_skills=[],
        )

    sections = json.loads(resume.sections) if isinstance(resume.sections, str) else resume.sections
    tech_stack = json.loads(record.tech_stack) if isinstance(record.tech_stack, str) else record.tech_stack

    gaps = compute_gaps(sections, tech_stack)

    return JDSummaryResponse(
        job_url=url,
        match_percentage=gaps["match_percentage"],
        match_count=gaps["match_count"],
        total_required=gaps["total_required"],
        matched_skills=gaps["matched_skills"],
        missing_skills=gaps["missing_skills"],
    )
