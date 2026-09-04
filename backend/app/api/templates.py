import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.template import ResumeTemplate
from app.schemas.template import TemplateResponse

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _template_to_response(t: ResumeTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "structure": json.loads(t.structure) if isinstance(t.structure, str) else t.structure,
        "is_default": t.is_default,
        "created_at": t.created_at,
    }


@router.get("", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResumeTemplate).order_by(ResumeTemplate.id))
    return [_template_to_response(t) for t in result.scalars().all()]


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResumeTemplate).where(ResumeTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return _template_to_response(template)
