from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CreateTopicRequest(BaseModel):
    skill_id: Optional[int] = None
    name: str


class MessageRequest(BaseModel):
    content: str


class CreateProblemRequest(BaseModel):
    content: str


class UpdateProblemRequest(BaseModel):
    status: str  # open / resolved


class FeynmanProblemResponse(BaseModel):
    id: int
    topic_id: int
    content: str
    source: str = "manual"
    status: str = "open"
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FeynmanPoint(BaseModel):
    id: str
    title: str


class FeynmanMessageResponse(BaseModel):
    id: int
    role: str  # user / ai
    content: str
    level: Optional[int] = None  # AI 消息的理解等级徽章
    action: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class FeynmanTopicResponse(BaseModel):
    id: int
    skill_id: Optional[int] = None
    name: str
    level: int = 1
    status: str = "learning"
    breadth_left: int = 2
    depth_left: int = 2
    learning_summary: Optional[dict] = None
    weak_points: list[str] = []
    knowledge_points: list[FeynmanPoint] = []  # 点单（图谱顶层节点），空 = 没图谱、走旧判级
    covered_points: list[str] = []  # 累计讲对的点 id（前端画覆盖条）
    problems: list[FeynmanProblemResponse] = []
    created_at: datetime
    updated_at: datetime
    messages: list[FeynmanMessageResponse] = []

    model_config = {"from_attributes": True}


class FeynmanTopicListItem(BaseModel):
    id: int
    skill_id: Optional[int] = None
    name: str
    level: int = 1
    status: str = "learning"
    breadth_left: int = 2
    depth_left: int = 2
    weak_points: list[str] = []
    has_problems: bool = False  # 存在未解决问题（列表页 presence 标记，不显示数量）
    total_messages: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
