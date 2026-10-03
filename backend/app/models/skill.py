from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from app.database.connection import Base


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    category = Column(String(100), default="")  # 前端/后端/数据库/工具/其他
    # 0-100 自评；NULL = 用户尚未表态（「未验证」），不要用 0 冒充
    proficiency = Column(Integer, nullable=True)
    source = Column(String(200), default="")  # 来源：JD分析/手动添加
    notes = Column(Text, default="")
    learned_at = Column(DateTime, nullable=True)
    learning_plan = Column(Text, default="")  # JSON：AI 学习计划
    # JSON：AI 生成的知识图谱（严格树）。NULL = 还没生成 —— 卡片据此显示「未生成图谱」，
    # 所以它必须能和「生成了一张空图」区分开，不能用 "" 当默认值
    knowledge_graph = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    @property
    def has_graph(self) -> bool:
        """卡片靠它显示「已生成图谱」，不必为了一个布尔拉整棵树（20-30 节点 × N 个技能）"""
        return bool(self.knowledge_graph)


class LearningResource(Base):
    __tablename__ = "learning_resources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    url = Column(String(500), default="")
    type = Column(String(50), default="article")  # article/video/course/book
    completed = Column(Boolean, default=False)


class SkillNote(Base):
    """学习笔记（Cornell 笔记原文）。搬服务端是为了让 AI 能复盘（⑤）——
    笔记留在浏览器里，服务端拿不到原文，复盘就无从谈起。"""

    __tablename__ = "skill_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False)
    # 这条笔记属于图谱的哪一块：node_ids 逗号连接（了解档一个单元合并多个顶层节点 → "4,5"）。
    # 不用学习计划的步骤号：重新切分计划（换 required_level）会让旧步骤号指向别的内容，
    # 笔记就静默错位了（待决策 D9）。图谱生成一次后不再重生成（A5），节点 id 才是稳定锚。
    # 老计划没有 node_ids，用 "step{n}" 兜底 —— 反正那时也没别的可指。
    unit_key = Column(String(100), nullable=False)
    # JSON {cues, notes, summary}。存 Text 不存 JSON 列：跟本表其余 JSON 字段一致，
    # 且笔记只整体读写，不按字段查询
    cornell = Column(Text, default="")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, default="")
    difficulty = Column(String(20), default="medium")  # easy/medium/hard
