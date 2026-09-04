import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.mock_interview import MockInterview, MockInterviewMessage
from app.models.jd_analysis import JDAnalysis
from app.schemas.mock_interview import (
    StartInterviewRequest,
    AnswerRequest,
    InterviewSessionResponse,
    InterviewListItem,
    InterviewMessageResponse,
)
from app.services.ai_service import mock_interview_stream, evaluate_mock_answer, generate_interview_feedback, _determine_difficulty

router = APIRouter(prefix="/api/mock-interview", tags=["mock_interview"])


# ─── Helpers ───────────────────────────────────────────────

def _session_to_dict(s: MockInterview) -> dict:
    return {
        "id": s.id,
        "jd_analysis_id": s.jd_analysis_id,
        "position": s.position,
        "company": s.company,
        "status": s.status,
        "interview_type": s.interview_type,
        "difficulty_level": s.difficulty_level,
        "overall_feedback": json.loads(s.overall_feedback) if s.overall_feedback else None,
        "summary_score": s.summary_score,
        "started_at": s.started_at,
        "completed_at": s.completed_at,
    }


def _msg_to_dict(m: MockInterviewMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "question_type": m.question_type,
        "metadata_json": json.loads(m.metadata_json) if isinstance(m.metadata_json, str) else m.metadata_json,
        "created_at": m.created_at,
    }


# ─── Start ────────────────────────────────────────────────

@router.post("/start", response_model=InterviewSessionResponse, status_code=201)
async def start_interview(data: StartInterviewRequest, db: AsyncSession = Depends(get_db)):
    """创建模拟面试，AI 生成开场白和第一个问题"""
    position = data.position
    company = data.company
    jd_context = ""

    # 如果关联 JD 分析，提取信息
    if data.jd_analysis_id:
        jd_result = await db.execute(select(JDAnalysis).where(JDAnalysis.id == data.jd_analysis_id))
        jd_record = jd_result.scalar_one_or_none()
        if jd_record:
            if not position:
                position = jd_record.position
            if not company:
                company = jd_record.company
            tech_stack = json.loads(jd_record.tech_stack) if isinstance(jd_record.tech_stack, str) else jd_record.tech_stack
            analysis = json.loads(jd_record.analysis_result) if isinstance(jd_record.analysis_result, str) else jd_record.analysis_result
            jd_parts = []
            if isinstance(tech_stack, list):
                jd_parts.append("技术要求：" + "、".join(t.get("name", "") for t in tech_stack[:10]))
            if isinstance(analysis, dict):
                if analysis.get("key_requirements"):
                    jd_parts.append("核心要求：" + "；".join(analysis["key_requirements"][:3]))
                if analysis.get("role_summary"):
                    jd_parts.append("职位概述：" + analysis["role_summary"][:200])
            jd_context = "\n".join(jd_parts)

    # 创建会话
    session = MockInterview(
        jd_analysis_id=data.jd_analysis_id,
        position=position,
        company=company,
        status="in_progress",
        interview_type=data.interview_type,
        difficulty_level=data.difficulty_level,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # AI 生成开场白 + 第一个问题
    opening_text = ""
    try:
        async for chunk in mock_interview_stream(
            position, company, [], jd_context,
            interview_type=data.interview_type,
            difficulty_level=data.difficulty_level,
        ):
            parsed = json.loads(chunk)
            if parsed.get("content"):
                opening_text += parsed["content"]
    except Exception as e:
        opening_text = f"你好！欢迎参加 {position or '该岗位'} 的面试。请先介绍一下你自己吧。"

    if not opening_text.strip():
        opening_text = f"你好！欢迎参加 {position or '该岗位'} 的面试。请先介绍一下你自己吧。"

    # 保存开场消息
    opening_msg = MockInterviewMessage(
        interview_id=session.id,
        role="ai",
        content=opening_text,
        question_type="opening",
    )
    db.add(opening_msg)
    await db.commit()
    await db.refresh(opening_msg)

    return InterviewSessionResponse(
        **_session_to_dict(session),
        messages=[_msg_to_dict(opening_msg)],
    )


# ─── Answer (SSE) ────────────────────────────────────────

@router.post("/{interview_id}/answer")
async def answer_question(interview_id: int, data: AnswerRequest, db: AsyncSession = Depends(get_db)):
    """提交回答，流式返回 AI 面试官反馈"""
    # 校验会话
    result = await db.execute(select(MockInterview).where(MockInterview.id == interview_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试不存在")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="该面试已结束")
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="回答不能为空")

    # 保存用户回答
    user_msg = MockInterviewMessage(
        interview_id=interview_id,
        role="user",
        content=data.content,
        question_type="answer",
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # 获取对话历史
    msg_result = await db.execute(
        select(MockInterviewMessage)
        .where(MockInterviewMessage.interview_id == interview_id)
        .order_by(MockInterviewMessage.created_at)
    )
    all_messages = msg_result.scalars().all()

    # 获取最后一轮 AI 提问（用于评估）
    last_ai_question = ""
    for m in reversed(all_messages):
        if m.role == "ai" and m.id != user_msg.id:
            last_ai_question = m.content[:500]
            break

    # 获取 JD 上下文
    jd_context = ""
    if session.jd_analysis_id:
        jd_result = await db.execute(select(JDAnalysis).where(JDAnalysis.id == session.jd_analysis_id))
        jd_record = jd_result.scalar_one_or_none()
        if jd_record:
            tech_stack = json.loads(jd_record.tech_stack) if isinstance(jd_record.tech_stack, str) else jd_record.tech_stack
            if isinstance(tech_stack, list):
                jd_context = "技术要求：" + "、".join(t.get("name", "") for t in tech_stack[:10])

    async def event_stream():
        # 1. 评估回答
        try:
            evaluation = await evaluate_mock_answer(
                last_ai_question or session.position,
                data.content,
                session.position,
            )
        except Exception:
            evaluation = {"score": 5, "feedback": "评估暂不可用", "strengths": [], "weaknesses": []}

        # 更新用户消息的 metadata
        user_msg.metadata_json = json.dumps(evaluation, ensure_ascii=False)
        await db.commit()

        # 发送评估结果作为首个事件
        yield f"data: {json.dumps({'type': 'evaluation', 'score': evaluation.get('score', 5), 'feedback': evaluation.get('feedback', '')})}\n\n"

        # 2. 难度自适应：根据近期表现调整难度
        old_difficulty = session.difficulty_level
        try:
            new_difficulty = await _determine_difficulty(
                [{"role": m.role, "content": m.content, "metadata_json": m.metadata_json}
                 for m in all_messages + [user_msg]],
                session.difficulty_level,
            )
            if new_difficulty != old_difficulty:
                session.difficulty_level = new_difficulty
                await db.commit()
                yield f"data: {json.dumps({'type': 'difficulty_change', 'from': old_difficulty, 'to': new_difficulty})}\n\n"
        except Exception:
            pass

        # 3. 生成 AI 面试官流式回复
        history_correct = [{"role": m.role, "content": m.content} for m in all_messages]

        full_ai_response = ""
        try:
            async for chunk in mock_interview_stream(
                session.position, session.company, history_correct, jd_context,
                interview_type=session.interview_type or "comprehensive",
                difficulty_level=session.difficulty_level or "mid",
            ):
                parsed = json.loads(chunk)
                content = parsed.get("content", "")
                done = parsed.get("done", False)
                if content:
                    full_ai_response += content
                    yield f"data: {json.dumps({'type': 'response', 'content': content, 'done': False})}\n\n"
                if done:
                    break
        except Exception as e:
            fallback = "感谢你的回答！我们继续下一个问题。你能谈谈你在实际项目中遇到的最大挑战是什么吗？"
            yield f"data: {json.dumps({'type': 'response', 'content': fallback, 'done': False})}\n\n"
            full_ai_response = fallback

        # 保存 AI 回复
        if full_ai_response.strip():
            ai_msg = MockInterviewMessage(
                interview_id=interview_id,
                role="ai",
                content=full_ai_response,
                question_type="interview",
            )
            db.add(ai_msg)
            await db.commit()

        yield f"data: {json.dumps({'type': 'done', 'content': '', 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── List ────────────────────────────────────────────────

@router.get("/list", response_model=list[InterviewListItem])
async def list_interviews(
    status: str | None = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
):
    """面试历史列表"""
    query = select(MockInterview).order_by(MockInterview.started_at.desc())
    if status:
        query = query.where(MockInterview.status == status)
    result = await db.execute(query)
    sessions = result.scalars().all()

    items = []
    for s in sessions:
        count_result = await db.execute(
            select(MockInterviewMessage.id)
            .where(MockInterviewMessage.interview_id == s.id)
        )
        msg_count = len(count_result.scalars().all())

        items.append(InterviewListItem(
            id=s.id,
            jd_analysis_id=s.jd_analysis_id,
            position=s.position,
            company=s.company,
            status=s.status,
            interview_type=s.interview_type or "comprehensive",
            difficulty_level=s.difficulty_level or "mid",
            summary_score=s.summary_score,
            total_questions=msg_count // 2,
            started_at=s.started_at,
            completed_at=s.completed_at,
        ))

    return items


# ─── Session Detail ──────────────────────────────────────

@router.get("/{interview_id}", response_model=InterviewSessionResponse)
async def get_interview(interview_id: int, db: AsyncSession = Depends(get_db)):
    """获取面试详情（含完整对话记录）"""
    result = await db.execute(select(MockInterview).where(MockInterview.id == interview_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试不存在")

    msg_result = await db.execute(
        select(MockInterviewMessage)
        .where(MockInterviewMessage.interview_id == interview_id)
        .order_by(MockInterviewMessage.created_at)
    )
    messages = [_msg_to_dict(m) for m in msg_result.scalars().all()]

    return InterviewSessionResponse(
        **_session_to_dict(session),
        messages=messages,
    )


# ─── Delete Interview ────────────────────────────────────


@router.delete("/{interview_id}")
async def delete_interview(interview_id: int, db: AsyncSession = Depends(get_db)):
    """删除面试记录（级联删除消息）"""
    result = await db.execute(select(MockInterview).where(MockInterview.id == interview_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试不存在")
    await db.delete(session)
    await db.commit()
    return {"ok": True}


# ─── End Interview ───────────────────────────────────────

@router.post("/{interview_id}/end", response_model=InterviewSessionResponse)
async def end_interview(interview_id: int, db: AsyncSession = Depends(get_db)):
    """结束面试，生成综合评价"""
    result = await db.execute(select(MockInterview).where(MockInterview.id == interview_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试不存在")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="该面试已结束")

    msg_result = await db.execute(
        select(MockInterviewMessage)
        .where(MockInterviewMessage.interview_id == interview_id)
        .order_by(MockInterviewMessage.created_at)
    )
    all_messages = msg_result.scalars().all()
    history = [{"role": m.role, "content": m.content[:500]} for m in all_messages]

    try:
        feedback = await generate_interview_feedback(session.position, session.company, history)
    except Exception:
        feedback = {"summary_score": 0, "strengths": [], "weaknesses": [], "suggestions": []}

    closing_text = (
        f"## 面试评价\n\n"
        f"**总体评分：{feedback.get('summary_score', 0)}/100**\n\n"
    )
    if feedback.get("strengths"):
        closing_text += "### 优势\n" + "\n".join(f"- {s}" for s in feedback["strengths"]) + "\n\n"
    if feedback.get("weaknesses"):
        closing_text += "### 待改进\n" + "\n".join(f"- {w}" for w in feedback["weaknesses"]) + "\n\n"
    if feedback.get("suggestions"):
        closing_text += "### 建议\n" + "\n".join(f"- {s}" for s in feedback["suggestions"])

    closing_msg = MockInterviewMessage(
        interview_id=interview_id,
        role="ai",
        content=closing_text,
        question_type="closing",
    )
    db.add(closing_msg)

    session.status = "completed"
    session.overall_feedback = json.dumps(feedback, ensure_ascii=False)
    session.summary_score = feedback.get("summary_score", 0)
    session.completed_at = __import__("datetime").datetime.utcnow()
    await db.commit()
    await db.refresh(session)

    msg_result2 = await db.execute(
        select(MockInterviewMessage)
        .where(MockInterviewMessage.interview_id == interview_id)
        .order_by(MockInterviewMessage.created_at)
    )
    messages = [_msg_to_dict(m) for m in msg_result2.scalars().all()]

    return InterviewSessionResponse(
        **_session_to_dict(session),
        messages=messages,
    )
