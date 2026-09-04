from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SkillCreate(BaseModel):
    name: str
    category: str = ""
    proficiency: int = 0
    source: str = ""
    notes: str = ""


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    proficiency: Optional[int] = None
    notes: Optional[str] = None
    source: Optional[str] = None


class SkillResponse(BaseModel):
    id: int
    name: str
    category: str
    proficiency: int
    source: str
    notes: str
    learned_at: Optional[datetime] = None
    created_at: datetime

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


class ProficiencyFromStepsRequest(BaseModel):
    step_scores: list[StepScoreItem]
