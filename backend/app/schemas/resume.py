from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ResumeSection(BaseModel):
    key: str
    title: str
    content: str


class ResumeCreate(BaseModel):
    title: str = "未命名简历"
    template_id: int = 1
    sections: dict = {}
    target_company: str = ""
    target_position: str = ""


class ResumeUpdate(BaseModel):
    title: Optional[str] = None
    template_id: Optional[int] = None
    sections: Optional[dict] = None
    target_company: Optional[str] = None
    target_position: Optional[str] = None


class ResumeResponse(BaseModel):
    id: int
    title: str
    template_id: int
    sections: dict
    target_company: str
    target_position: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExportRequest(BaseModel):
    format: str = "pdf"
