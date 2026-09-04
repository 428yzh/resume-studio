from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TemplateSection(BaseModel):
    key: str
    title: str
    required: bool = True
    max_length: int = 1000
    hint: str = ""


class TemplateStructure(BaseModel):
    sections: list[TemplateSection]
    style: dict = {}


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: str
    structure: dict
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}
