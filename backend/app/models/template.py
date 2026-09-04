from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func
from app.database.connection import Base


class ResumeTemplate(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), default="")
    structure = Column(Text, nullable=False)  # JSON - section definitions
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
