from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class StartInterviewRequest(BaseModel):
    jd_analysis_id: Optional[int] = None
    position: str = ""
    company: str = ""
    interview_type: str = "comprehensive"  # comprehensive / algorithm / system_design / behavioral
    difficulty_level: str = "mid"  # junior / mid / senior


class AnswerRequest(BaseModel):
    content: str


class InterviewMessageResponse(BaseModel):
    id: int
    role: str  # ai / user
    content: str
    question_type: str
    metadata_json: dict = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class InterviewSessionResponse(BaseModel):
    id: int
    jd_analysis_id: Optional[int] = None
    position: str
    company: str
    status: str
    interview_type: str = "comprehensive"
    difficulty_level: str = "mid"
    overall_feedback: Optional[dict] = None
    summary_score: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    messages: list[InterviewMessageResponse] = []

    model_config = {"from_attributes": True}


class InterviewListItem(BaseModel):
    id: int
    jd_analysis_id: Optional[int] = None
    position: str
    company: str
    status: str
    interview_type: str = "comprehensive"
    difficulty_level: str = "mid"
    summary_score: Optional[int] = None
    total_questions: int = 0
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
