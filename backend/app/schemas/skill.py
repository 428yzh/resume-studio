from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SkillCreate(BaseModel):
    name: str
    category: str = ""
    # 不预填 0：「没表态」和「自评 0 分」是两件事
    proficiency: Optional[int] = None
    source: str = ""
    notes: str = ""


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    proficiency: Optional[int] = None
    notes: Optional[str] = None
    source: Optional[str] = None


class GraphLowest(BaseModel):
    """最低的那个顶层块（分数地图的最高优先级线索：哪块虚）"""
    id: str
    title: str
    score: int


class GraphSummary(BaseModel):
    """卡片正面三件套（设计 4.1）：覆盖率 × 状态 × 单元数。列表接口现算，不落库。

    covered 只数**直接证据**（own>0）：父节点的分是子节点算出来的，
    不证明父节点被测过。score 为 None = 一块都没测过（不是 0 分）。
    """
    score: Optional[int] = None
    tested: int = 0
    total: int = 0
    depth: int = 0
    units: int = 0
    lowest: Optional[GraphLowest] = None


class SkillResponse(BaseModel):
    id: int
    name: str
    category: str
    proficiency: Optional[int] = None
    source: str
    notes: str
    learned_at: Optional[datetime] = None
    created_at: datetime
    # 是否已生成知识图谱。只给布尔不给树：列表页要的是「生成过没有」，
    # 整棵树等展开时再单独 GET /graph
    has_graph: bool = False
    # 卡片正面的图谱摘要；没图谱 → None（展开工作台时仍走 GET /graph 拿整棵树）
    graph_summary: Optional[GraphSummary] = None

    model_config = {"from_attributes": True}


class LearningResourceResponse(BaseModel):
    id: int
    skill_id: int
    title: str
    url: str
    type: str
    completed: bool

    model_config = {"from_attributes": True}


class LearningResourceCreate(BaseModel):
    title: str
    url: str = ""
    type: str = "article"
    completed: bool = False


class LearningResourceUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    type: str | None = None
    completed: bool | None = None


class SkillNoteUpsert(BaseModel):
    """unit_key：这条笔记挂在哪一块图谱上（node_ids 逗号连接 / 老计划 "step{n}"）"""
    unit_key: str
    # JSON {cues, notes, summary}，原样存原样取 —— 服务端只有在复盘时才拆开读 notes 字段
    cornell: str = ""


class SkillNoteResponse(BaseModel):
    unit_key: str
    cornell: str
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class NoteChatMessage(BaseModel):
    role: str  # "user" / "ai"
    content: str = ""


class NoteChatRequest(BaseModel):
    """messages: [] = 开场（打开会话时先让 AI 读一遍这块笔记）"""
    unit_key: str
    messages: list[NoteChatMessage] = []


class InterviewQuestionResponse(BaseModel):
    id: int
    skill_id: int
    question: str
    answer: str
    difficulty: str

    model_config = {"from_attributes": True}


class InterviewQuestionCreate(BaseModel):
    question: str
    answer: str = ""
    difficulty: str = "medium"


class InterviewQuestionUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    difficulty: str | None = None


class StepScoreItem(BaseModel):
    step: int
    score: float
