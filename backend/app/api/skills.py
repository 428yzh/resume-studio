import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.skill import Skill, LearningResource, InterviewQuestion, SkillNote
from app.schemas.skill import (
    SkillCreate, SkillUpdate, SkillResponse,
    LearningResourceCreate, LearningResourceUpdate, LearningResourceResponse,
    InterviewQuestionCreate, InterviewQuestionUpdate, InterviewQuestionResponse,
    SkillNoteUpsert, SkillNoteResponse,
)
from app.services.ai_service import generate_learning_plan, generate_knowledge_graph
from app.services.scoring import compute_scores

router = APIRouter(prefix="/api/skills", tags=["skills"])
logger = logging.getLogger(__name__)


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
    skills = result.scalars().all()
    # 卡片正面要覆盖率（设计 4.1），展开才 GET /graph 来不及 —— 列表时现算附上。
    # ponytail: 每行一次答题记录扫描；单用户几十个技能的量级够用，真慢了再批量取证据
    return [await _resp_with_summary(s, db) for s in skills]


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
    return await _resp_with_summary(skill, db)


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


@router.get("/{skill_id}/notes", response_model=list[SkillNoteResponse])
async def list_notes(skill_id: int, db: AsyncSession = Depends(get_db)):
    """一个技能的全部笔记。笔记是自动保存的、没有提交按钮，服务端拿不到原文就做不了复盘（⑤）"""
    result = await db.execute(select(SkillNote).where(SkillNote.skill_id == skill_id))
    return result.scalars().all()


@router.put("/{skill_id}/notes", response_model=SkillNoteResponse)
async def upsert_note(skill_id: int, data: SkillNoteUpsert, db: AsyncSession = Depends(get_db)):
    """PUT 覆盖而非 POST 追加：同一块图谱内容只该有一条笔记（自动保存，每次覆盖前一版）"""
    result = await db.execute(
        select(SkillNote).where(SkillNote.skill_id == skill_id, SkillNote.unit_key == data.unit_key)
    )
    note = result.scalar_one_or_none()
    if note:
        note.cornell = data.cornell
    else:
        note = SkillNote(skill_id=skill_id, unit_key=data.unit_key, cornell=data.cornell)
        db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


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


async def _node_evidence(db: AsyncSession, skill_id: int) -> dict[str, dict[str, list[int]]]:
    """刷题/考试这条来源的答题证据：{节点 id: {"quiz": [每题得分]}}。

    分数来自答题记录，不新存一份。重答同一题取最后一次（是「现在会不会」，
    不是「历史平均」）。加新来源（费曼等级、笔记完成度）时在这里塞新桶，
    scoring.py 一行不用改。
    """
    from app.models.quiz import Question, QuizAnswer
    rows = (await db.execute(
        select(Question, QuizAnswer)
        .join(QuizAnswer, QuizAnswer.question_id == Question.id)
        .order_by(QuizAnswer.answered_at)
    )).all()

    latest: dict[int, tuple] = {}
    for q, a in rows:
        if skill_id not in q.skill_id_list or not q.node_id:
            continue
        latest[q.id] = (q.node_id, a)

    evidence: dict[str, dict[str, list[int]]] = {}
    for node_id, a in latest.values():
        score = 100 if a.is_correct else (a.ai_score if a.ai_score is not None else 0)
        evidence.setdefault(node_id, {}).setdefault("quiz", []).append(score)
    return evidence


async def _graph_summary(skill: Skill, db: AsyncSession) -> dict | None:
    """卡片正面三件套（设计 4.1）：覆盖率 / 最低的一块 / 单元数。没图谱 → None。

    跟 GET /graph 同一套算分（scoring.py），所以卡片和展开的数字永远一致。
    """
    if not skill.knowledge_graph:
        return None
    try:
        nodes = json.loads(skill.knowledge_graph)["nodes"]
    except Exception as e:
        logger.warning(f"技能 {skill.id} 图谱解析失败，卡片摘要按未生成处理: {e}")
        return None
    scores = compute_scores(nodes, await _node_evidence(db, skill.id))

    total = tested = 0

    def count(ns: list) -> None:
        nonlocal total, tested
        for n in ns:
            if not isinstance(n, dict):
                continue
            total += 1
            if (scores.get(n.get("id")) or {}).get("own"):  # 只数直接证据，子树测了不算
                tested += 1
            count(n.get("children") or [])

    count(nodes)

    def depth_of(ns: list) -> int:
        return 1 + max((depth_of(n.get("children") or []) for n in ns if isinstance(n, dict)), default=-1)

    scored_tops = [
        (n, scores[n["id"]]["score"])
        for n in nodes
        if isinstance(n, dict) and n.get("id") and (scores.get(n.get("id")) or {}).get("score") is not None
    ]
    lowest = min(scored_tops, key=lambda p: p[1]) if scored_tops else None

    units = 0
    if skill.learning_plan:
        try:
            units = len(json.loads(skill.learning_plan).get("steps") or [])
        except Exception:
            units = 0

    return {
        "score": round(sum(s for _, s in scored_tops) / len(scored_tops)) if scored_tops else None,
        "tested": tested,
        "total": total,
        "depth": depth_of(nodes),
        "units": units,
        "lowest": {"id": lowest[0]["id"], "title": lowest[0].get("title", ""), "score": lowest[1]}
        if lowest
        else None,
    }


async def _resp_with_summary(skill: Skill, db: AsyncSession) -> dict:
    """SkillResponse + 现算的 graph_summary。update 后前端整对象替换 store，摘要丢了卡片就瞎了"""
    return {
        **SkillResponse.model_validate(skill).model_dump(),
        "graph_summary": await _graph_summary(skill, db),
    }


@router.get("/{skill_id}/graph")
async def get_knowledge_graph(skill_id: int, db: AsyncSession = Depends(get_db)):
    """读取知识图谱 + 分数。未生成返回 null（卡片据此显示「未生成图谱」）。

    scores 是自下而上算的（scoring.py），和覆盖率配对看才有意义：
    未测不摊进平均，所以「1/4 子节点测过且满分」的单元分也是 100。
    """
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    if not skill.knowledge_graph:
        return None
    data = json.loads(skill.knowledge_graph)
    data["scores"] = compute_scores(data["nodes"], await _node_evidence(db, skill_id))
    return data


@router.post("/{skill_id}/graph")
async def create_knowledge_graph(skill_id: int, db: AsyncSession = Depends(get_db)):
    """AI 生成并保存知识图谱（技能级，生成一次）。"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    graph = await generate_knowledge_graph(skill.name, skill.notes or "")
    # 空图谱不落库：失败态不该污染持久化，重进页面仍是「未生成图谱」
    if graph["nodes"]:
        import json
        skill.knowledge_graph = json.dumps(graph, ensure_ascii=False)
        await db.commit()
    return graph


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

    # 结论 8：图谱先生成，学习计划据图切分。没图就没法切 —— 不能退回「凭空排计划」那套
    import json
    if not skill.knowledge_graph:
        raise HTTPException(status_code=409, detail="请先生成知识图谱，学习计划由图谱切分得出")
    graph = json.loads(skill.knowledge_graph)["nodes"]

    plan = await generate_learning_plan(skill.name, data.required_level, data.prior_understanding, graph)
    plan["prior_understanding"] = data.prior_understanding  # 随计划落库，供模拟用户评审读取学习者背景
    text = json.dumps(plan, ensure_ascii=False)
    # 降级内容（无 key / 服务不可用）不落库：失败态不该污染持久化，重进页面不再见到死计划
    if not any(m in text for m in ("AI 服务未配置", "AI 服务暂不可用", "AI 暂不可用")):
        skill.learning_plan = text
        await db.commit()
    return plan


# 已删除 POST /{skill_id}/proficiency-from-steps：
# 它把「康奈尔笔记字数启发式」当成自评写进 skill.proficiency，是假数据来源。
# 笔记完成度只在前端本地算分展示，不落库（见 design/2026-10-03 技能模块设计纪要 ①）。


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
    return await _resp_with_summary(skill, db)
