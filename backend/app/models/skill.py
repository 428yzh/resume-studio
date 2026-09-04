from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from app.database.connection import Base


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    category = Column(String(100), default="")  # 前端/后端/数据库/工具/其他
    proficiency = Column(Integer, default=0)  # 0-100
    source = Column(String(200), default="")  # 来源：JD分析/手动添加
    notes = Column(Text, default="")
    learned_at = Column(DateTime, nullable=True)
    learning_plan = Column(Text, default="")  # JSON：AI 学习计划
    created_at = Column(DateTime, server_default=func.now())


class LearningResource(Base):
    __tablename__ = "learning_resources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    url = Column(String(500), default="")
    type = Column(String(50), default="article")  # article/video/course/book
    completed = Column(Boolean, default=False)


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, default="")
    difficulty = Column(String(20), default="medium")  # easy/medium/hard
