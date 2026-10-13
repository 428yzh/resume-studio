"""应用设置：AI 服务（接口地址 / API key / 模型）的读写 + 连通性测试。

存哪：app_settings 表，DB 覆盖 .env、.env 作兜底 —— 换服务商/换模型不必改文件、不必重启。
生效链：所有 AI 调用点（润色/出题/讲解/费曼/岗位搜索/search.js 子进程）都读
settings.deepseek_*，所以写入时只改这一处 + 清掉 ai_service 的 client 缓存即可。

已知锁定：岗位推荐与学习资源搜索走 DeepSeek 专属的 /anthropic 兼容端点（web_search 工具），
换非 DeepSeek 服务时这两处会降级（返回空列表，前端已有兜底），其余功能取决于兼容性。
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.connection import async_session, get_db
from app.models.setting import AppSetting
from app.services import ai_service

router = APIRouter(prefix="/api/settings", tags=["settings"])

KEY_API, KEY_BASE_URL, KEY_MODEL = "ai_api_key", "ai_base_url", "ai_model"

# .env（+ config 默认值）原值：DB 覆盖被清空时要能落回来，单独留一份
_ENV = {
    KEY_API: settings.deepseek_api_key,
    KEY_BASE_URL: settings.deepseek_base_url,
    KEY_MODEL: settings.deepseek_model,
}


class AIConfigRequest(BaseModel):
    # 三态：省略（None）= 不动；"" = 清除该覆盖、回落 .env；非空 = 设置
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


def _mask(key: str) -> str:
    """掩码尾巴（sk-xxx…4f2a）。明文永不回前端 —— 前端只需辨认「是不是这把」。"""
    return f"{key[:6]}…{key[-4:]}" if len(key) > 12 else "已配置"


async def _overrides(db: AsyncSession) -> dict[str, str | None]:
    return {k: await _row_value(db, k) for k in (KEY_API, KEY_BASE_URL, KEY_MODEL)}


async def _row_value(db: AsyncSession, key: str) -> str | None:
    row = await db.get(AppSetting, key)
    return (row.value or None) if row else None


def _status(ov: dict[str, str | None]) -> dict:
    return {
        "ai_configured": bool(ov[KEY_API] or _ENV[KEY_API]),
        "key_source": "db" if ov[KEY_API] else ("env" if _ENV[KEY_API] else None),
        "key_hint": _mask(ov[KEY_API] or _ENV[KEY_API]) if (ov[KEY_API] or _ENV[KEY_API]) else None,
        "base_url": ov[KEY_BASE_URL] or _ENV[KEY_BASE_URL],
        "base_url_source": "db" if ov[KEY_BASE_URL] else "env",
        "model": ov[KEY_MODEL] or _ENV[KEY_MODEL],
        "model_source": "db" if ov[KEY_MODEL] else "env",
    }


def _apply(ov: dict[str, str | None]) -> None:
    settings.deepseek_api_key = ov[KEY_API] or _ENV[KEY_API]
    settings.deepseek_base_url = ov[KEY_BASE_URL] or _ENV[KEY_BASE_URL]
    settings.deepseek_model = ov[KEY_MODEL] or _ENV[KEY_MODEL]
    ai_service.reset_client()  # 懒加载单例，key/base_url 变了不清就一直用旧的


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)):
    return _status(await _overrides(db))


@router.put("/ai-config")
async def set_ai_config(payload: AIConfigRequest, db: AsyncSession = Depends(get_db)):
    for field, raw in (
        (KEY_API, payload.api_key),
        (KEY_BASE_URL, payload.base_url),
        (KEY_MODEL, payload.model),
    ):
        if raw is None:
            continue  # 省略 = 不动（表单只改一项时不会误清其他项）
        value = raw.strip()
        if field == KEY_API and ("\n" in raw or len(value) > 200):
            raise HTTPException(400, "API key 格式不对")
        if field == KEY_MODEL and len(value) > 100:
            raise HTTPException(400, "模型名过长")
        if field == KEY_BASE_URL and value and not value.startswith(("http://", "https://")):
            raise HTTPException(400, "接口地址要以 http:// 或 https:// 开头")
        row = await db.get(AppSetting, field)
        if value:
            if row is None:
                db.add(AppSetting(key=field, value=value))
            else:
                row.value = value
        elif row is not None:
            await db.delete(row)
    await db.commit()
    ov = await _overrides(db)
    _apply(ov)
    return _status(ov)


@router.post("/ai-config/test")
async def test_ai_config():
    """连通性测试：GET {base}/models —— 200 有效 / 401·403 无效，不发消息不烧 token。
    成功时顺带把可用模型 id 列表带回去（前端做输入建议）。只回 id，不回上游原始 body
    （防拿它当探测内网的跳板，也防回显敏感串）。"""
    if not settings.deepseek_api_key:
        return {"ok": False, "detail": "尚未配置 API key", "models": []}
    url = settings.deepseek_base_url.rstrip("/") + "/models"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url, headers={"Authorization": f"Bearer {settings.deepseek_api_key}"}
            )
    except Exception:
        return {"ok": False, "detail": "连不上服务端，检查接口地址和网络后重试", "models": []}
    if resp.status_code == 200:
        try:
            data = resp.json().get("data") or []
        except Exception:
            data = []
        models = [m["id"] for m in data if isinstance(m, dict) and m.get("id")]
        return {"ok": True, "detail": "连接正常", "models": models[:50]}
    if resp.status_code in (401, 403):
        return {"ok": False, "detail": f"API key 无效（{resp.status_code}）", "models": []}
    return {"ok": False, "detail": f"服务端返回 {resp.status_code}", "models": []}


async def load_ai_overrides(db: AsyncSession | None = None) -> None:
    """启动时把 DB 里的配置落到运行时（.env 作兜底）。测试可传入自己的 session。"""
    if db is not None:
        _apply(await _overrides(db))
        return
    async with async_session() as session:
        _apply(await _overrides(session))
