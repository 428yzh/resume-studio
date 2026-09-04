from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.database.connection import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    company = Column(String(200), default="")
    city = Column(String(100), default="")
    salary = Column(String(100), default="")
    experience = Column(String(100), default="")
    education = Column(String(100), default="")
    jd = Column(Text, default="")  # 任职要求摘要
    url = Column(String(500), default="", index=True)
    created_at = Column(DateTime, server_default=func.now())
