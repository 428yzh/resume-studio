from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)


# SQLite 默认关闭外键约束，ondelete="CASCADE" 不会生效 → 删父记录会留孤儿行。
# 每个连接开启 FK，级联删除才真正工作。
if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_fk(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        from app.models.resume import Resume  # noqa
        from app.models.template import ResumeTemplate  # noqa
        from app.models.jd_analysis import JDAnalysis  # noqa
        from app.models.job import Job  # noqa
        from app.models.skill import Skill, LearningResource, InterviewQuestion  # noqa
        from app.models.quiz import Question, QuizSession, QuizAnswer  # noqa
        from app.models.mock_interview import MockInterview, MockInterviewMessage  # noqa
        from app.models.feynman import FeynmanTopic, FeynmanMessage, FeynmanProblem  # noqa
        await conn.run_sync(Base.metadata.create_all)

        # Migrate: add new columns to mock_interviews if missing
        # 只吞 "duplicate column" 这一种 OperationalError；写错表名/库被锁等真问题必须炸出来
        from sqlalchemy import text
        from sqlalchemy.exc import OperationalError
        try:
            await conn.execute(text(
                "ALTER TABLE mock_interviews ADD COLUMN interview_type VARCHAR(20) DEFAULT 'comprehensive'"
            ))
        except OperationalError:
            pass  # column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE mock_interviews ADD COLUMN difficulty_level VARCHAR(10) DEFAULT 'mid'"
            ))
        except OperationalError:
            pass  # column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE feynman_topics ADD COLUMN weak_points TEXT"
            ))
        except OperationalError:
            pass  # column already exists
