import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.connection import get_db
from app.models.skill import Skill
from app.services.ai_service import polish_resume, polish_resume_stream, generate_learning_guide, explain_topic, generate_cornell_prompts, _find_nodes, _render_graph_for_prompt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class PolishRequest(BaseModel):
    section_title: str
    content: str
    target_position: str = ""


class PolishResponse(BaseModel):
    result: str


class ExplainTopicRequest(BaseModel):
    skill_name: str
    step_title: str = ""
    step_description: str = ""
    topic: str = ""
    step_type: str = "concept"
    required_level: str = "了解"
    skill_id: int | None = None  # 查学习者背景（技能熟练度 + 现状理解）供模拟用户评审代入
    # 这个单元/知识点覆盖的图谱节点 id。单元概述传 step.node_ids（可多个，了解档会合并），
    # 深入讲解传单个子节点 id。服务端据此从技能图谱里取出那块当内容边界（结论 10）
    node_ids: list[str] = []


class CornellPromptsRequest(BaseModel):
    skill_name: str
    step_title: str = ""
    topics: list[str] | None = None
    required_level: str = "了解"


class LearningGuideRequest(BaseModel):
    tech_name: str
    category: str = ""
    required_level: str = "了解"


class LearningGuideResponse(BaseModel):
    learning_path: list[dict]
    resources: list[dict] = []
    interview_questions: list[dict] = []


@router.post("/polish", response_model=PolishResponse)
async def polish_resume_endpoint(data: PolishRequest):
    try:
        result = await polish_resume(data.section_title, data.content, data.target_position)
        return PolishResponse(result=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 润色失败: {str(e)}")


@router.post("/polish/stream")
async def stream_polish(data: PolishRequest):
    async def event_stream():
        try:
            async for chunk in polish_resume_stream(data.section_title, data.content, data.target_position):
                yield f"data: {chunk}\n\n"
        except Exception as e:
            logger.error(f"流式润色异常: {e}")
            yield f"data: {json.dumps({'content': '', 'error': f'AI 润色失败: {str(e)}', 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/explain-topic")
async def explain_topic_endpoint(data: ExplainTopicRequest, db: AsyncSession = Depends(get_db)):
    try:
        # 学习者背景：技能熟练度 + 生成学习计划时填的现状理解，供模拟用户以「当前掌握度」身份评审
        learner_background = ""
        graph_block = ""
        if data.skill_id:
            result = await db.execute(select(Skill).where(Skill.id == data.skill_id))
            skill = result.scalar_one_or_none()
            if skill:
                # proficiency 为 NULL = 用户没自评过，不编一个数字冒充
                parts = [] if skill.proficiency is None else [f"技能熟练度 {skill.proficiency}/100"]
                if skill.learning_plan:
                    try:
                        prior = json.loads(skill.learning_plan).get("prior_understanding", "")
                        if prior:
                            parts.append(f"现状理解：{prior}")
                    except Exception:
                        pass
                learner_background = "；".join(parts)
                # 图谱块在服务端取，前端只报 id —— 渲染格式归后端一处，免得两边各写一套缩进
                if data.node_ids and skill.knowledge_graph:
                    try:
                        nodes = json.loads(skill.knowledge_graph)["nodes"]
                        hit = _find_nodes(nodes, set(data.node_ids))
                        graph_block = _render_graph_for_prompt(hit)
                    except Exception as e:
                        logger.warning(f"渲染图谱块失败，按无块降级: {e}")
        result = await explain_topic(
            skill_name=data.skill_name,
            step_title=data.step_title,
            step_description=data.step_description,
            topic=data.topic,
            step_type=data.step_type,
            required_level=data.required_level,
            learner_background=learner_background,
            graph_block=graph_block,
        )
        # explain_topic 已返回 {explanation, topic_keywords}（单元概述带知识点关键词，深入讲解为空数组）
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cornell-prompts")
async def cornell_prompts_endpoint(data: CornellPromptsRequest):
    try:
        result = await generate_cornell_prompts(
            skill_name=data.skill_name,
            step_title=data.step_title,
            topics=data.topics,
            required_level=data.required_level,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning-guide", response_model=LearningGuideResponse)
async def learning_guide_endpoint(data: LearningGuideRequest):
    try:
        result = await generate_learning_guide(data.tech_name, data.category, data.required_level)
        return LearningGuideResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成学习指引失败: {str(e)}")
