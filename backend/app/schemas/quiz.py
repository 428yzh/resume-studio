from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class QuestionResponse(BaseModel):
    id: int
    type: str
    question_text: str
    options: list | str
    correct_answer: str
    skill_ids: list | str
    node_id: str = ""  # 图谱节点 id，空 = 没挂节点（不计分）
    jd_analysis_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GenerateQuestionsRequest(BaseModel):
    mode: str = "practice"  # practice / exam
    skill_ids: list[int] = []
    skill_id: Optional[int] = None  # 单元级出题：块来自这个技能的图谱
    node_ids: list[str] = []        # 块 = 这几个节点（含子树），题挂回的落分点也在这里面
    jd_analysis_id: Optional[int] = None
    counts: dict = {"single_choice": 5, "multi_choice": 5, "essay": 2}


class CreateSessionRequest(BaseModel):
    mode: str
    question_ids: list[int]


class SubmitAnswersRequest(BaseModel):
    answers: dict[int, str]  # question_id -> user_answer


class QuizSessionResponse(BaseModel):
    id: int
    mode: str
    question_ids: list | str
    status: str
    score: int
    total_questions: int
    correct_count: int
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class QuizAnswerResponse(BaseModel):
    id: int
    session_id: int
    question_id: int
    user_answer: str
    is_correct: Optional[bool] = None
    ai_score: Optional[int] = None
    ai_feedback: str
    ai_reference: str
    answered_at: datetime

    model_config = {"from_attributes": True}


class QuizSessionDetailResponse(BaseModel):
    id: int
    mode: str
    question_ids: list | str
    status: str
    score: int
    total_questions: int
    correct_count: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    questions: list[QuestionResponse] = []
    answers: list[QuizAnswerResponse] = []

    model_config = {"from_attributes": True}


class SessionListItem(BaseModel):
    id: int
    mode: str
    status: str
    score: int
    total_questions: int
    correct_count: int
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
