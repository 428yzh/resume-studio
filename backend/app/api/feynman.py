import json
import logging
import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.feynman import FeynmanTopic, FeynmanMessage, FeynmanProblem
from app.models.skill import Skill
from app.schemas.feynman import (
    CreateTopicRequest,
    MessageRequest,
    FeynmanTopicResponse,
    FeynmanTopicListItem,
    FeynmanMessageResponse,
    CreateProblemRequest,
    UpdateProblemRequest,
    FeynmanProblemResponse,
)
from app.services import feynman as feynman_service

router = APIRouter(prefix="/api/feynman", tags=["feynman"])

logger = logging.getLogger(__name__)


def _problem_to_dict(p: FeynmanProblem) -> dict:
    return {
        "id": p.id,
        "topic_id": p.topic_id,
        "content": p.content,
        "source": p.source,
        "status": p.status,
        "created_at": p.created_at,
        "resolved_at": p.resolved_at,
    }


def _topic_to_dict(t: FeynmanTopic) -> dict:
    return {
        "id": t.id,
        "skill_id": t.skill_id,
        "name": t.name,
        "level": t.level,
        "status": t.status,
        "breadth_left": t.breadth_left,
        "depth_left": t.depth_left,
        "learning_summary": json.loads(t.learning_summary) if t.learning_summary else None,
        "weak_points": json.loads(t.weak_points) if t.weak_points else [],
        "knowledge_points": json.loads(t.knowledge_points) if t.knowledge_points else [],
        "covered_points": json.loads(t.covered_points) if t.covered_points else [],
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


async def _load_problems(topic_id: int, db: AsyncSession) -> list[FeynmanProblem]:
    result = await db.execute(
        select(FeynmanProblem).where(FeynmanProblem.topic_id == topic_id).order_by(FeynmanProblem.created_at)
    )
    return list(result.scalars().all())


async def _has_open_problems(topic_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(FeynmanProblem.id)
        .where(FeynmanProblem.topic_id == topic_id, FeynmanProblem.status == "open")
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _resolve_all_open(topic_id: int, db: AsyncSession) -> None:
    """自动解决：某轮 AI 零卡点时清空未解决项（非破坏式，保留可见可重开）。"""
    result = await db.execute(
        select(FeynmanProblem).where(FeynmanProblem.topic_id == topic_id, FeynmanProblem.status == "open")
    )
    for p in result.scalars().all():
        p.status = "resolved"
        p.resolved_at = func.now()


def _msg_to_dict(m: FeynmanMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "level": m.level,
        "action": m.action,
        "created_at": m.created_at,
    }


def _points_of(topic: FeynmanTopic) -> list[dict]:
    """房间的点单（图谱顶层节点，建房间时冻结）。空 = 没图谱 → 走旧判级路径。"""
    return json.loads(topic.knowledge_points) if topic.knowledge_points else []


async def _load_topic(topic_id: int, db: AsyncSession) -> FeynmanTopic:
    result = await db.execute(select(FeynmanTopic).where(FeynmanTopic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="房间不存在")
    return topic


async def _load_messages(topic_id: int, db: AsyncSession) -> list[FeynmanMessage]:
    result = await db.execute(
        select(FeynmanMessage).where(FeynmanMessage.topic_id == topic_id).order_by(FeynmanMessage.created_at)
    )
    return list(result.scalars().all())


# ─── 创建房间 ────────────────────────────────────────────
@router.post("/topics", response_model=FeynmanTopicResponse, status_code=201)
async def create_topic(data: CreateTopicRequest, db: AsyncSession = Depends(get_db)):
    """从技能库选主题创建费曼教学房间"""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="主题名不能为空")

    # 点单：技能图谱的顶层节点，建房间时冻结成判级的锚（D12）
    points: list[dict] = []
    if data.skill_id:
        result = await db.execute(select(Skill).where(Skill.id == data.skill_id))
        skill = result.scalar_one_or_none()
        if not skill:
            raise HTTPException(status_code=404, detail="技能不存在")
        if skill.knowledge_graph:
            try:
                nodes = json.loads(skill.knowledge_graph)["nodes"]
                points = [
                    {"id": n["id"], "title": n["title"]}
                    for n in nodes
                    if isinstance(n, dict) and n.get("id")
                ]
            except Exception as e:
                logger.warning(f"费曼房间取图谱点单失败，按无点单降级: {e}")

    topic = FeynmanTopic(
        skill_id=data.skill_id, name=name, level=1, status="learning", breadth_left=2, depth_left=2,
        knowledge_points=json.dumps(points, ensure_ascii=False) if points else None,
    )
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return FeynmanTopicResponse(**_topic_to_dict(topic), messages=[])


# ─── 房间列表 ───────────────────────────────────────────
@router.get("/topics", response_model=list[FeynmanTopicListItem])
async def list_topics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeynmanTopic).order_by(FeynmanTopic.updated_at.desc()))
    topics = result.scalars().all()

    items = []
    for t in topics:
        count = await db.execute(
            select(FeynmanMessage.id).where(FeynmanMessage.topic_id == t.id)
        )
        items.append(FeynmanTopicListItem(
            **_topic_to_dict(t),
            has_problems=await _has_open_problems(t.id, db),
            total_messages=len(count.scalars().all()),
        ))
    return items


# ─── 房间详情 ───────────────────────────────────────────
@router.get("/topics/{topic_id}", response_model=FeynmanTopicResponse)
async def get_topic(topic_id: int, db: AsyncSession = Depends(get_db)):
    topic = await _load_topic(topic_id, db)
    messages = [_msg_to_dict(m) for m in await _load_messages(topic_id, db)]
    problems = [_problem_to_dict(p) for p in await _load_problems(topic_id, db)]
    return FeynmanTopicResponse(**_topic_to_dict(topic), problems=problems, messages=messages)


# ─── 发消息（SSE：定级 → 流式回复）──────────────────────
@router.post("/topics/{topic_id}/message")
async def send_message(topic_id: int, data: MessageRequest, db: AsyncSession = Depends(get_db)):
    topic = await _load_topic(topic_id, db)
    if topic.status == "completed":
        raise HTTPException(status_code=400, detail="该房间已完成学习")
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="讲解不能为空")

    user_msg = FeynmanMessage(topic_id=topic_id, role="user", content=data.content, action="teaching")
    db.add(user_msg)
    await db.commit()

    messages = [_msg_to_dict(m) for m in await _load_messages(topic_id, db)]
    history = [{"role": m["role"], "content": m["content"]} for m in messages]

    # 阶段 A：定级 + 状态更新（在 endpoint 内完成，session 生命周期确定；StreamingResponse 的
    # generator 里改 ORM 对象 + commit 在真实服务器上有不持久化的坑，所以前置到这里）
    points = _points_of(topic)
    prev_covered = json.loads(topic.covered_points) if topic.covered_points else []
    covered = None
    if points:
        # 有图谱点单：等级由覆盖度算（D12）
        assessed = await feynman_service.assess_coverage(
            topic.name, history, points, topic.level, topic.breadth_left, topic.depth_left
        )
        raw_covered = assessed.get("covered")
        # covered 不是 list = 判定没跑成（AI 不可用/响应缺字段）：保持原覆盖集合与等级，不写库
        covered = feynman_service.sanitize_covered(raw_covered, points) if isinstance(raw_covered, list) else None
    else:
        assessed = await feynman_service.assess_level(
            topic.name, history, topic.level, topic.breadth_left, topic.depth_left
        )
    error = str(assessed.get("error", "")).strip()

    if error:
        # 发现老师讲错 → 强制降一级 + correction 动作（温和纠正），不消耗提问预算
        new_level = max(1, topic.level - 1)
        action = "correction"
    elif covered is not None:
        # 覆盖集合没动的轮次等级原地不动 —— 判据落在内容推进上，不在发言轮次上
        proposal = feynman_service.level_from_coverage(len(covered), len(points))
        new_level = (
            feynman_service.clamp_level(proposal, topic.level) if set(covered) != set(prev_covered) else topic.level
        )
        action = feynman_service.resolve_action(
            new_level, assessed.get("action", "ask_example"), topic.breadth_left, topic.depth_left
        )
    else:
        new_level = feynman_service.clamp_level(int(assessed.get("level", topic.level)), topic.level)
        action = feynman_service.resolve_action(
            new_level, assessed.get("action", "ask_example"), topic.breadth_left, topic.depth_left
        )
    blind_spot = str(assessed.get("blind_spot", ""))
    if covered is not None:
        topic.covered_points = json.dumps(covered, ensure_ascii=False)

    # 问题跟踪：AI 零卡点（无讲错、无盲点）→ 自动解决未解决问题（非破坏式，可手动重开）。
    # degraded 轮次（判定没跑成）不算零卡点 —— 否则 AI 一挂就把未解决问题全清了
    if not assessed.get("degraded") and not error and not blind_spot.strip():
        await _resolve_all_open(topic_id, db)

    b, d = feynman_service.apply_budget(action, new_level, topic.breadth_left, topic.depth_left)
    topic.level = new_level
    topic.breadth_left = b
    topic.depth_left = d

    # 薄弱点累计（进 PPT 报告）
    if error:
        wp = json.loads(topic.weak_points) if topic.weak_points else []
        if error not in wp:
            wp.append(error)
        topic.weak_points = json.dumps(wp, ensure_ascii=False)
    await db.commit()

    async def event_stream():
        yield f"data: {json.dumps({'type': 'level', 'level': new_level, 'action': action})}\n\n"

        # 阶段 B：按等级流式回复
        full = ""
        try:
            async for chunk in feynman_service.feynman_tutor_stream(topic.name, history, new_level, action, blind_spot, error):
                parsed = json.loads(chunk)
                content = parsed.get("content", "")
                done = parsed.get("done", False)
                if content:
                    full += content
                    yield f"data: {json.dumps({'type': 'response', 'content': content, 'done': False})}\n\n"
                if done:
                    break
        except Exception:
            full = "（数字学生暂时回应不了，请稍后再试）"
            yield f"data: {json.dumps({'type': 'response', 'content': full, 'done': False})}\n\n"

        if not full.strip():
            full = "（我还在整理思路，老师继续讲，我会跟上。）"
            yield f"data: {json.dumps({'type': 'response', 'content': full, 'done': False})}\n\n"

        if full.strip():
            ai_msg = FeynmanMessage(topic_id=topic_id, role="ai", content=full, level=new_level, action=action)
            db.add(ai_msg)
            await db.commit()

        yield f"data: {json.dumps({'type': 'done', 'done': True, 'level': new_level, 'action': action})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── 问题跟踪 ──────────────────────────────────────────
@router.post("/topics/{topic_id}/problems", response_model=FeynmanProblemResponse, status_code=201)
async def create_problem(topic_id: int, data: CreateProblemRequest, db: AsyncSession = Depends(get_db)):
    """手动记录一条教学问题/卡点（AI 不自动收录，只提示）"""
    await _load_topic(topic_id, db)
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="问题不能为空")

    problem = FeynmanProblem(topic_id=topic_id, content=content, source="manual", status="open")
    db.add(problem)
    await db.commit()
    await db.refresh(problem)
    return FeynmanProblemResponse(**_problem_to_dict(problem))


@router.put("/topics/{topic_id}/problems/{problem_id}", response_model=FeynmanProblemResponse)
async def update_problem(
    topic_id: int, problem_id: int, data: UpdateProblemRequest, db: AsyncSession = Depends(get_db)
):
    """标记解决 / 重开"""
    await _load_topic(topic_id, db)
    result = await db.execute(
        select(FeynmanProblem).where(FeynmanProblem.id == problem_id, FeynmanProblem.topic_id == topic_id)
    )
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="问题不存在")

    status = data.status.strip()
    if status not in ("open", "resolved"):
        raise HTTPException(status_code=400, detail="status 仅支持 open / resolved")

    problem.status = status
    problem.resolved_at = func.now() if status == "resolved" else None
    await db.commit()
    await db.refresh(problem)
    return FeynmanProblemResponse(**_problem_to_dict(problem))


# ─── 生成 PPT 报告 ──────────────────────────────────────
@router.post("/topics/{topic_id}/report")
async def generate_report(topic_id: int, db: AsyncSession = Depends(get_db)):
    topic = await _load_topic(topic_id, db)
    messages = [_msg_to_dict(m) for m in await _load_messages(topic_id, db)]

    # 一直没讲到的知识点进报告薄弱点页（覆盖条上那些虚线点，最后要落到「下一步」）
    points = _points_of(topic)
    covered = json.loads(topic.covered_points) if topic.covered_points else []
    report = await feynman_service.generate_report_slides(
        topic.name,
        [{"role": m["role"], "content": m["content"]} for m in messages],
        topic.level,
        json.loads(topic.weak_points) if topic.weak_points else [],
        feynman_service.uncovered_titles(points, covered),
    )

    tmpdir = tempfile.gettempdir()
    out_path = os.path.join(tmpdir, f"feynman_report_{topic.id}.pptx")
    feynman_service.build_pptx(report, out_path)

    topic.learning_summary = json.dumps(report, ensure_ascii=False)
    topic.status = "completed"
    await db.commit()

    return FileResponse(
        out_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"{topic.name}-费曼学习报告.pptx",
    )


# ─── 删除房间 ───────────────────────────────────────────
@router.delete("/topics/{topic_id}")
async def delete_topic(topic_id: int, db: AsyncSession = Depends(get_db)):
    topic = await _load_topic(topic_id, db)
    await db.delete(topic)
    await db.commit()
    return {"ok": True}
