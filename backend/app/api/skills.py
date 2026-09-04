from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.skill import Skill, LearningResource, InterviewQuestion
from app.schemas.skill import (
    SkillCreate, SkillUpdate, SkillResponse,
    LearningResourceCreate, LearningResourceUpdate, LearningResourceResponse,
    InterviewQuestionCreate, InterviewQuestionUpdate, InterviewQuestionResponse,
    ProficiencyFromStepsRequest,
)
from app.services.ai_service import generate_learning_plan

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.post("", response_model=SkillResponse, status_code=201)
async def create_skill(data: SkillCreate, db: AsyncSession = Depends(get_db)):
    skill = Skill(**data.model_dump())
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.get("", response_model=list[SkillResponse])
async def list_skills(category: str = "", db: AsyncSession = Depends(get_db)):
    query = select(Skill).order_by(Skill.created_at.desc())
    if category:
        query = query.where(Skill.category == category)
    result = await db.execute(query)
    return result.scalars().all()


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(skill_id: int, data: SkillUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, key, value)

    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(Skill).where(Skill.id == skill_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="技能不存在")
    await db.commit()


@router.get("/{skill_id}/resources", response_model=list[LearningResourceResponse])
async def list_resources(skill_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LearningResource).where(LearningResource.skill_id == skill_id)
    )
    return result.scalars().all()


@router.post("/{skill_id}/resources", response_model=LearningResourceResponse, status_code=201)
async def create_resource(skill_id: int, data: LearningResourceCreate, db: AsyncSession = Depends(get_db)):
    resource = LearningResource(skill_id=skill_id, **data.model_dump())
    db.add(resource)
    await db.commit()
    await db.refresh(resource)
    return resource


@router.put("/{skill_id}/resources/{resource_id}", response_model=LearningResourceResponse)
async def update_resource(skill_id: int, resource_id: int, data: LearningResourceUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LearningResource).where(
            LearningResource.id == resource_id,
            LearningResource.skill_id == skill_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(resource, key, value)
    await db.commit()
    await db.refresh(resource)
    return resource


@router.delete("/{skill_id}/resources/{resource_id}", status_code=204)
async def delete_resource(skill_id: int, resource_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        delete(LearningResource).where(
            LearningResource.id == resource_id,
            LearningResource.skill_id == skill_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="资源不存在")
    await db.commit()


@router.get("/{skill_id}/questions", response_model=list[InterviewQuestionResponse])
async def list_questions(skill_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.skill_id == skill_id)
    )
    return result.scalars().all()


@router.post("/{skill_id}/questions", response_model=InterviewQuestionResponse, status_code=201)
async def create_question(skill_id: int, data: InterviewQuestionCreate, db: AsyncSession = Depends(get_db)):
    question = InterviewQuestion(skill_id=skill_id, **data.model_dump())
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


@router.put("/{skill_id}/questions/{question_id}", response_model=InterviewQuestionResponse)
async def update_question(skill_id: int, question_id: int, data: InterviewQuestionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.id == question_id,
            InterviewQuestion.skill_id == skill_id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="面试题不存在")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(question, key, value)
    await db.commit()
    await db.refresh(question)
    return question


@router.delete("/{skill_id}/questions/{question_id}", status_code=204)
async def delete_question(skill_id: int, question_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        delete(InterviewQuestion).where(
            InterviewQuestion.id == question_id,
            InterviewQuestion.skill_id == skill_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="面试题不存在")
    await db.commit()


@router.get("/{skill_id}/learning-plan")
async def get_learning_plan(skill_id: int, db: AsyncSession = Depends(get_db)):
    """获取技能的 AI 学习计划"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    plan = skill.learning_plan or ""
    if plan:
        import json
        return json.loads(plan)
    return None


class LearningPlanRequest(BaseModel):
    required_level: str
    prior_understanding: str = ""


@router.post("/{skill_id}/learning-plan")
async def create_learning_plan(skill_id: int, data: LearningPlanRequest, db: AsyncSession = Depends(get_db)):
    """AI 生成并保存学习计划"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    plan = await generate_learning_plan(skill.name, data.required_level, data.prior_understanding)
    import json
    plan["prior_understanding"] = data.prior_understanding  # 随计划落库，供模拟用户评审读取学习者背景
    text = json.dumps(plan, ensure_ascii=False)
    # 降级内容（无 key / 服务不可用）不落库：失败态不该污染持久化，重进页面不再见到死计划
    if not any(m in text for m in ("AI 服务未配置", "AI 服务暂不可用", "AI 暂不可用")):
        skill.learning_plan = text
        await db.commit()
    return plan


@router.post("/{skill_id}/proficiency-from-steps", response_model=SkillResponse)
async def calculate_proficiency_from_steps(skill_id: int, data: ProficiencyFromStepsRequest, db: AsyncSession = Depends(get_db)):
    """根据学习步骤的 Cornell 笔记完成度自动更新技能掌握度"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    if not data.step_scores:
        return skill

    overall = sum(s.score for s in data.step_scores) / len(data.step_scores)
    overall = max(0, min(100, round(overall)))

    skill.proficiency = overall
    await db.commit()
    await db.refresh(skill)
    return skill


@router.post("/{skill_id}/import", response_model=SkillResponse)
async def import_skill_from_jd(skill_id: int, data: SkillUpdate, db: AsyncSession = Depends(get_db)):
    """从 JD 分析导入技能到技能库（更新分类/来源）"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, key, value)
    if not skill.source:
        skill.source = "JD分析导入"

    await db.commit()
    await db.refresh(skill)
    return skill
