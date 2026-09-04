from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.database.connection import Base


class FeynmanTopic(Base):
    """费曼教学房间（每个技能/主题一个房间）"""

    __tablename__ = "feynman_topics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)  # 关联技能库（可空，允许自由主题）
    name = Column(String(200), nullable=False)  # 主题名
    level = Column(Integer, default=1)  # 当前理解等级 1-5（单调上升）
    status = Column(String(20), default="learning")  # learning / completed
    breadth_left = Column(Integer, default=2)  # L3 广度追问预算
    depth_left = Column(Integer, default=2)  # L5 深度追问预算
    learning_summary = Column(Text, nullable=True)  # JSON：学习摘要（PPT 内容）
    weak_points = Column(Text, nullable=True)  # JSON：薄弱点列表（错误/答不上来累计，进 PPT）
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class FeynmanMessage(Base):
    """费曼教学对话消息"""

    __tablename__ = "feynman_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    topic_id = Column(Integer, ForeignKey("feynman_topics.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(10), nullable=False)  # user / ai
    content = Column(Text, nullable=False)
    level = Column(Integer, nullable=True)  # AI 消息带理解等级徽章
    action = Column(String(30), default="")  # AI 动作：clarify_term / ask_example / breadth_question / restatement / depth_question / done
    created_at = Column(DateTime, server_default=func.now())


class FeynmanProblem(Base):
    """费曼教学房间·问题跟踪（用户手动记录的教学缺陷/卡点）"""

    __tablename__ = "feynman_problems"

    id = Column(Integer, primary_key=True, autoincrement=True)
    topic_id = Column(Integer, ForeignKey("feynman_topics.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)  # 问题/卡点描述
    source = Column(String(20), default="manual")  # manual（AI 只提示，不自动收录）
    status = Column(String(10), default="open")  # open / resolved
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
