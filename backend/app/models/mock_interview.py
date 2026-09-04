from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.database.connection import Base


class MockInterview(Base):
    __tablename__ = "mock_interviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    jd_analysis_id = Column(Integer, ForeignKey("jd_analyses.id"), nullable=True)
    position = Column(String(200), default="")
    company = Column(String(200), default="")
    status = Column(String(20), default="in_progress")  # in_progress / completed
    interview_type = Column(String(20), default="comprehensive")  # comprehensive / algorithm / system_design / behavioral
    difficulty_level = Column(String(10), default="mid")  # junior / mid / senior
    overall_feedback = Column(Text, nullable=True)  # JSON
    summary_score = Column(Integer, nullable=True)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


class MockInterviewMessage(Base):
    __tablename__ = "mock_interview_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    interview_id = Column(Integer, ForeignKey("mock_interviews.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(10), nullable=False)  # ai / user
    content = Column(Text, nullable=False)
    question_type = Column(String(20), default="interview")  # opening / interview / followup / feedback / closing
    metadata_json = Column(Text, default="{}")  # per-answer AI score/feedback
    created_at = Column(DateTime, server_default=func.now())
