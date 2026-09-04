from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class JDAnalyzeRequest(BaseModel):
    jd_text: str
    company: str = ""
    position: str = ""
    resume_id: Optional[int] = None
    job_url: str = ""


class JDAnalyzeFromBossRequest(BaseModel):
    job_url: str
    jd_text: str
    company: str = ""
    position: str = ""


class JDSummaryResponse(BaseModel):
    job_url: str
    match_percentage: int = 0
    match_count: int = 0
    total_required: int = 0
    matched_skills: list[dict] = []
    missing_skills: list[dict] = []


class TechStackItem(BaseModel):
    name: str
    category: str
    required_level: str = ""  # 熟悉/精通/了解
    priority: int = 0


class JDAnalysisResponse(BaseModel):
    id: int
    company: str
    position: str
    title: str = ""
    jd_text: str
    tech_stack: list[TechStackItem]
    analysis_result: dict
    resume_id: Optional[int] = None
    job_url: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class JDAnalysisUpdate(BaseModel):
    title: str = ""
    company: str = ""
    position: str = ""


class JDAnalysisListItem(BaseModel):
    id: int
    company: str
    position: str
    title: str = ""
    resume_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}
