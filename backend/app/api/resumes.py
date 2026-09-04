import json
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pypdf import PdfReader

from app.database.connection import get_db
from app.models.resume import Resume
from app.schemas.resume import ResumeCreate, ResumeUpdate, ResumeResponse
from app.services.ai_service import parse_resume_from_text

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


def _resume_to_response(r: Resume) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "template_id": r.template_id,
        "sections": json.loads(r.sections) if isinstance(r.sections, str) else r.sections,
        "target_company": r.target_company,
        "target_position": r.target_position,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


@router.post("", response_model=ResumeResponse, status_code=201)
async def create_resume(data: ResumeCreate, db: AsyncSession = Depends(get_db)):
    resume = Resume(
        title=data.title,
        template_id=data.template_id,
        sections=json.dumps(data.sections, ensure_ascii=False),
        target_company=data.target_company,
        target_position=data.target_position,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return _resume_to_response(resume)


@router.post("/import-pdf", response_model=ResumeResponse, status_code=201)
async def import_resume_from_pdf(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """上传 PDF 简历并自动解析为结构化数据"""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    try:
        contents = await file.read()
        reader = PdfReader(BytesIO(contents))
        text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        raise HTTPException(status_code=400, detail="无法读取 PDF 文件，请确保文件未损坏")

    if not text:
        raise HTTPException(status_code=400, detail="无法从 PDF 中提取文本，暂不支持图片扫描件")

    # AI 解析
    parsed = await parse_resume_from_text(text)
    sections = parsed.get("sections", {})
    title = parsed.get("title", file.filename.replace(".pdf", ""))
    target_position = parsed.get("target_position", "")
    target_company = parsed.get("target_company", "")

    # Clean section arrays — ensure each item has an id
    for key in ["experience", "education", "skills", "projects", "certifications", "languages"]:
        items = sections.get(key, [])
        if isinstance(items, list):
            for i, item in enumerate(items):
                if isinstance(item, dict) and "id" not in item:
                    item["id"] = f"imported_{i + 1}"

    resume = Resume(
        title=title or "导入的简历",
        template_id=1,
        sections=json.dumps(sections, ensure_ascii=False),
        target_company=target_company,
        target_position=target_position,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return _resume_to_response(resume)


@router.get("", response_model=list[ResumeResponse])
async def list_resumes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).order_by(Resume.updated_at.desc()))
    return [_resume_to_response(r) for r in result.scalars().all()]


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(resume_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")
    return _resume_to_response(resume)


@router.put("/{resume_id}", response_model=ResumeResponse)
async def update_resume(resume_id: int, data: ResumeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    update_data = data.model_dump(exclude_unset=True)
    if "sections" in update_data:
        update_data["sections"] = json.dumps(update_data["sections"], ensure_ascii=False)

    for key, value in update_data.items():
        setattr(resume, key, value)

    await db.commit()
    await db.refresh(resume)
    return _resume_to_response(resume)


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(resume_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(Resume).where(Resume.id == resume_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="简历不存在")
    await db.commit()
