from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, func
from app.database.connection import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False, default="未命名简历")
    template_id = Column(Integer, nullable=False, default=1)
    sections = Column(Text, nullable=False, default="{}")  # JSON
    target_company = Column(String(200), default="")
    target_position = Column(String(200), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
