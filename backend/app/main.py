from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.connection import init_db
from app.seed import seed_templates
from app.api.health import router as health_router
from app.api.resumes import router as resume_router
from app.api.templates import router as template_router
from app.api.jd_analysis import router as jd_router
from app.api.skills import router as skill_router
from app.api.ai import router as ai_router
from app.api.jobs import router as jobs_router
from app.api.quiz import router as quiz_router
from app.api.mock_interview import router as mock_interview_router
from app.api.feynman import router as feynman_router
from app.api.settings import router as settings_router, load_ai_overrides

# app.* 下的 logger.info（如 AI 评审打点 `[评审临时]`）默认没有 handler，INFO 会被静默丢弃。
# 这里给 app logger 挂上 stderr handler，让打点日志打到 uvicorn 终端。
_ai_logger = logging.getLogger("app")
if not _ai_logger.handlers:
    _ai_logger.setLevel(logging.INFO)
    _ai_logger.addHandler(logging.StreamHandler())


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_templates()  # 空库补齐 3 套模板（幂等）；Docker 全新卷首次启动就靠它
    await load_ai_overrides()  # 界面里配过的 key/地址/模型覆盖 .env；表由 init_db 刚建好
    yield


app = FastAPI(title="Resume App API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(resume_router)
app.include_router(template_router)
app.include_router(jd_router)
app.include_router(skill_router)
app.include_router(ai_router)
app.include_router(jobs_router)
app.include_router(quiz_router)
app.include_router(mock_interview_router)
app.include_router(feynman_router)
app.include_router(settings_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
