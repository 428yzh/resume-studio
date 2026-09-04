from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey
from app.database.connection import Base


class JDAnalysis(Base):
    __tablename__ = "jd_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company = Column(String(200), default="")
    position = Column(String(200), default="")
    jd_text = Column(Text, nullable=False)
    tech_stack = Column(Text, default="[]")  # JSON array
    analysis_result = Column(Text, default="{}")  # JSON
    resume_id = Column(Integer, ForeignKey("resumes.id"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    job_url = Column(String(500), default="", index=True)
