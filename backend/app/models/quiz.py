from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from app.database.connection import Base


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(20), nullable=False)  # single_choice / multi_choice / essay
    question_text = Column(Text, nullable=False)
    options = Column(Text, default="[]")  # JSON: [{"key": "A", "text": "..."}]
    correct_answer = Column(Text, default="")
    skill_ids = Column(Text, default="[]")  # JSON: [1, 3, 5]
    jd_analysis_id = Column(Integer, ForeignKey("jd_analyses.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False)  # practice / exam
    question_ids = Column(Text, nullable=False)  # JSON: [1, 5, 8]
    status = Column(String(20), default="in_progress")  # in_progress / completed
    score = Column(Integer, default=0)
    total_questions = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    user_answer = Column(Text, default="")
    is_correct = Column(Boolean, nullable=True)  # true/false for choice, null for essay pending AI
    ai_score = Column(Integer, nullable=True)
    ai_feedback = Column(Text, default="")
    ai_reference = Column(Text, default="")
    answered_at = Column(DateTime, server_default=func.now())
