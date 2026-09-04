from pydantic import BaseModel
from datetime import datetime


class JobResponse(BaseModel):
    id: int
    title: str
    company: str
    city: str
    salary: str
    experience: str
    education: str
    jd: str
    url: str
    created_at: datetime

    model_config = {"from_attributes": True}
