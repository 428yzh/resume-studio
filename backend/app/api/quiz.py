import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.quiz import Question, QuizSession, QuizAnswer
from app.models.skill import Skill
from app.models.jd_analysis import JDAnalysis
from app.schemas.quiz import (
    QuestionResponse, GenerateQuestionsRequest,
    CreateSessionRequest, SubmitAnswersRequest,
    QuizSessionResponse, QuizSessionDetailResponse,
    QuizAnswerResponse, SessionListItem,
)
from app.services.ai_service import (
    generate_quiz_questions, grade_essay_answer,
    _find_nodes, _render_graph_for_prompt, _all_ids,
)

router = APIRouter(prefix="/api", tags=["quiz"])
logger = logging.getLogger(__name__)


# ─── Helpers ───────────────────────────────────────────────

def _question_to_dict(q: Question) -> dict:
    return {
        "id": q.id,
        "type": q.type,
        "question_text": q.question_text,
        "options": json.loads(q.options) if isinstance(q.options, str) else q.options,
        "correct_answer": q.correct_answer,
        "skill_ids": json.loads(q.skill_ids) if isinstance(q.skill_ids, str) else q.skill_ids,
        "node_id": q.node_id or "",
        "jd_analysis_id": q.jd_analysis_id,
        "created_at": q.created_at,
    }


def _session_to_dict(s: QuizSession) -> dict:
    return {
        "id": s.id,
        "mode": s.mode,
        "question_ids": json.loads(s.question_ids) if isinstance(s.question_ids, str) else s.question_ids,
        "status": s.status,
        "score": s.score,
        "total_questions": s.total_questions,
        "correct_count": s.correct_count,
        "started_at": s.started_at,
        "completed_at": s.completed_at,
    }


def _skill_context(s) -> str:
    """技能名 + 备注，作为出题的唯一技能语境。

    只给名字时歧义词只能瞎猜：技能名「harness」可能被出成 Harness.io 的 CI/CD，
    而用户要学的是 Agent Harness。备注是「这个技能具体指什么」的专用字段、用户手写，
    也是新增技能时的必填项。
    不带 category：它不可靠（新建表单默认值是「前端」，实测 12 条里 5 条是错的默认值），
    当判据用会把 AI 带偏。不带 source：只是来源标记，对消歧无帮助。
    """
    notes = (s.notes or "").strip()
    return f"{s.name}（{notes}）" if notes else s.name


def _jd_context(jd: JDAnalysis) -> str:
    """出题的 JD 语境：岗位 + 技术栈 + JD 原文（截断）。

    出题时传个 jd_analysis_id 数字给 AI 等于没传 —— 它看不到内容。
    跟 `_skill_context` 一个思路：拼成一段可读文本进 prompt。
    """
    head = " · ".join(p for p in (jd.company, jd.position) if p) or jd.title or f"JD #{jd.id}"
    try:
        stack = json.loads(jd.tech_stack) if isinstance(jd.tech_stack, str) else (jd.tech_stack or [])
    except Exception:
        stack = []
    items = []
    for it in stack:
        if isinstance(it, dict) and it.get("name"):
            lvl = it.get("required_level") or ""
            items.append(f"{it['name']}（{lvl}）" if lvl else it["name"])
    text = f"目标岗位：{head}"
    if items:
        text += "\nJD 技术栈：" + "、".join(items)
    if jd.jd_text:
        text += "\nJD 原文（截断）：" + jd.jd_text[:1200]
    return text


def _answer_to_dict(a: QuizAnswer) -> dict:
    return {
        "id": a.id,
        "session_id": a.session_id,
        "question_id": a.question_id,
        "user_answer": a.user_answer,
        "is_correct": a.is_correct,
        "ai_score": a.ai_score,
        "ai_feedback": a.ai_feedback,
        "ai_reference": a.ai_reference,
        "answered_at": a.answered_at,
    }


# ─── Question Generation ──────────────────────────────────

@router.post("/questions/generate", response_model=list[QuestionResponse])
async def generate_questions(data: GenerateQuestionsRequest, db: AsyncSession = Depends(get_db)):
    """AI 生成题目（刷题模式）"""
    if data.mode == "exam":
        counts = {"single_choice": 10, "multi_choice": 5, "essay": 3}
    else:
        counts = data.counts

    # 单元级出题：块从技能的图谱里取，前端只报 node_ids（同复盘⑤，前端不传内容）
    block: list = []
    skill_ids = data.skill_ids or ([data.skill_id] if data.skill_id else [])
    if data.skill_id and data.node_ids:
        skill = (await db.execute(select(Skill).where(Skill.id == data.skill_id))).scalar_one_or_none()
        # 没生成图谱 / 技能不存在 → 块为空照常出题，只是不挂节点（老前端、手输 URL 不能炸）
        if skill and skill.knowledge_graph:
            try:
                block = _find_nodes(json.loads(skill.knowledge_graph)["nodes"], set(data.node_ids))
            except Exception as e:
                logger.warning(f"出题取图谱块失败，按无块降级: {e}")

    # Get skill context if skill_ids are provided
    skill_names = []
    if skill_ids:
        skill_result = await db.execute(
            select(Skill).where(Skill.id.in_(skill_ids))
        )
        skill_names = [_skill_context(s) for s in skill_result.scalars().all()]
        if not skill_names:
            skill_names = [f"skill_{sid}" for sid in skill_ids]

    # JD 语境：查出来拼成文本再进 prompt（只传 ID 等于没传，AI 看不到内容）
    jd_context = ""
    if data.jd_analysis_id:
        jd = (await db.execute(
            select(JDAnalysis).where(JDAnalysis.id == data.jd_analysis_id)
        )).scalar_one_or_none()
        if jd:
            jd_context = _jd_context(jd)

    # Call AI to generate questions
    questions_data = await generate_quiz_questions(
        mode=data.mode,
        skill_names=skill_names,
        jd_context=jd_context,
        counts=counts,
        block_context=_render_graph_for_prompt(block) if block else "",
    )

    # Save to DB。AI 编的 node_id 落库后分数会挂到不存在的节点上，
    # 界面永远少一块还查不出原因 —— 只认块里的 id，编的一律清空
    valid_ids = _all_ids(block)
    created = []
    for qd in questions_data:
        node_id = qd.get("node_id") or ""
        if node_id not in valid_ids:
            node_id = ""
        question = Question(
            type=qd["type"],
            question_text=qd["question_text"],
            options=json.dumps(qd.get("options", []), ensure_ascii=False),
            correct_answer=qd.get("correct_answer", ""),
            skill_ids=json.dumps(skill_ids, ensure_ascii=False),
            node_id=node_id,
            jd_analysis_id=data.jd_analysis_id,
        )
        db.add(question)
        created.append(question)

    await db.commit()
    for q in created:
        await db.refresh(q)
    return [_question_to_dict(q) for q in created]


# ─── Questions CRUD ───────────────────────────────────────

@router.get("/questions", response_model=list[QuestionResponse])
async def list_questions(
    skill_id: int | None = None,
    jd_analysis_id: int | None = None,
    qtype: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Question).order_by(Question.created_at.desc())
    if jd_analysis_id:
        query = query.where(Question.jd_analysis_id == jd_analysis_id)
    if qtype:
        query = query.where(Question.type == qtype)
    result = await db.execute(query)
    rows = result.scalars().all()
    if skill_id:
        # 曾经用 LIKE '%"1"%' 过滤，永远匹配不到（静默返回空列表），见 Question.skill_id_list
        rows = [q for q in rows if skill_id in q.skill_id_list]
    return [_question_to_dict(q) for q in rows]


@router.get("/questions/{question_id}", response_model=QuestionResponse)
async def get_question(question_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Question).where(Question.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    return _question_to_dict(q)


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(question_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(Question).where(Question.id == question_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="题目不存在")
    await db.commit()


# ─── Quiz Sessions ────────────────────────────────────────

@router.post("/quiz/sessions", response_model=QuizSessionResponse, status_code=201)
async def create_session(data: CreateSessionRequest, db: AsyncSession = Depends(get_db)):
    session = QuizSession(
        mode=data.mode,
        question_ids=json.dumps(data.question_ids, ensure_ascii=False),
        total_questions=len(data.question_ids),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_to_dict(session)


@router.get("/quiz/sessions", response_model=list[SessionListItem])
async def list_sessions(
    mode: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(QuizSession).order_by(QuizSession.started_at.desc())
    if mode:
        query = query.where(QuizSession.mode == mode)
    if status:
        query = query.where(QuizSession.status == status)
    result = await db.execute(query)
    sessions = result.scalars().all()
    return [_session_to_dict(s) for s in sessions]


@router.get("/quiz/sessions/{session_id}", response_model=QuizSessionDetailResponse)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(QuizSession).where(QuizSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="场次不存在")

    session_dict = _session_to_dict(session)
    question_ids = session_dict["question_ids"]

    # Load questions
    questions = []
    if question_ids:
        q_result = await db.execute(
            select(Question).where(Question.id.in_(question_ids))
        )
        questions = [_question_to_dict(q) for q in q_result.scalars().all()]

    # Load answers
    a_result = await db.execute(
        select(QuizAnswer).where(QuizAnswer.session_id == session_id)
    )
    answers = [_answer_to_dict(a) for a in a_result.scalars().all()]

    return {**session_dict, "questions": questions, "answers": answers}


@router.post("/quiz/sessions/{session_id}/submit")
async def submit_session(
    session_id: int,
    data: SubmitAnswersRequest,
    db: AsyncSession = Depends(get_db),
):
    """交卷：批量提交答案 + AI 判卷"""
    result = await db.execute(select(QuizSession).where(QuizSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="场次不存在")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="该场次已交卷")

    question_ids = json.loads(session.question_ids) if isinstance(session.question_ids, str) else session.question_ids

    # Load questions for grading
    questions_map = {}
    if question_ids:
        q_result = await db.execute(
            select(Question).where(Question.id.in_(question_ids))
        )
        for q in q_result.scalars().all():
            questions_map[q.id] = q

    correct_count = 0
    total_score = 0
    total_questions = len(question_ids)

    for question_id, user_answer in data.answers.items():
        question = questions_map.get(int(question_id))
        if not question:
            continue

        is_correct = None
        ai_score = None
        ai_feedback = ""
        ai_reference = ""

        if question.type in ("single_choice", "multi_choice"):
            # Direct comparison for choice questions
            correct = question.correct_answer.strip()
            user = user_answer.strip()
            if question.type == "multi_choice":
                # 容忍 AI 写的 "A, C" 带空格（prompt 已要求无空格，但生成端不保证）
                is_correct = {a.strip() for a in user.split(",")} == {a.strip() for a in correct.split(",")}
            else:
                is_correct = user == correct
            if is_correct:
                correct_count += 1
                total_score += 100
            ai_reference = correct
        else:
            # Essay: AI grading
            try:
                grade_result = await grade_essay_answer(question.question_text, user_answer, question.correct_answer)
                is_correct = None  # essay doesn't have binary correct
                ai_score = grade_result.get("score", 50)
                ai_feedback = grade_result.get("feedback", "")
                ai_reference = grade_result.get("reference", question.correct_answer)
                total_score += ai_score
            except Exception:
                # 评分没跑成 = 未测，不是 0 分（同 proficiency 的 NULL 语义）
                ai_score = None
                ai_feedback = "AI 评分暂不可用"
                ai_reference = question.correct_answer

        answer = QuizAnswer(
            session_id=session_id,
            question_id=question_id,
            user_answer=user_answer,
            is_correct=is_correct,
            ai_score=ai_score,
            ai_feedback=ai_feedback,
            ai_reference=ai_reference,
        )
        db.add(answer)

    # Update session
    session.status = "completed"
    session.correct_count = correct_count
    if total_questions > 0:
        session.score = round(total_score / total_questions)
    session.completed_at = datetime.utcnow()

    await db.commit()
    return {"status": "ok", "score": session.score, "correct_count": correct_count, "total": total_questions}
