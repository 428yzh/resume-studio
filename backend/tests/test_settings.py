"""TC-SET：应用设置（AI 接口地址 / API key / 模型 的存取 + 掩码 + 连通性测试）。

测试机 backend/.env 里可能配了真 key —— 每个用例都把 _ENV 与 settings.deepseek_*
打桩成已知值，别让 .env 影响断言。
红线：任何响应体里都不许出现 key 明文（明文只回掩码尾巴）。
"""
import pytest

from app.api import settings as settings_api
from app.api.settings import KEY_API, KEY_BASE_URL, KEY_MODEL
from app.config import settings
from app.models.setting import AppSetting
from app.services import ai_service

pytestmark = pytest.mark.asyncio

FAKE_KEY = "sk-1234567890abcdefghij"
ENV_KEY = "sk-envfallback-key-0001"
ENV_URL = "https://env.example/v1"
ENV_MODEL = "env-model"


@pytest.fixture(autouse=True)
def stub_env(monkeypatch):
    """打桩 .env 兜底值 + 塞一个假 _client，验证写入时会清缓存。"""
    for key, value in ((KEY_API, ""), (KEY_BASE_URL, ENV_URL), (KEY_MODEL, ENV_MODEL)):
        monkeypatch.setitem(settings_api._ENV, key, value)
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    monkeypatch.setattr(settings, "deepseek_base_url", ENV_URL)
    monkeypatch.setattr(settings, "deepseek_model", ENV_MODEL)
    monkeypatch.setattr(ai_service, "_client", object())


@pytest.fixture
def fake_httpx(monkeypatch):
    """替换 httpx.AsyncClient：记录请求，不碰网络。install(状态码/异常/JSON) 返回记录器。"""
    def install(status_code=200, error=None, payload=None):
        seen = {}

        class FakeClient:
            def __init__(self, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, headers=None):
                seen["url"], seen["headers"] = url, headers
                if error:
                    raise error
                return type("R", (), {
                    "status_code": status_code,
                    "json": lambda self=None: payload or {},
                })()

        monkeypatch.setattr(settings_api.httpx, "AsyncClient", FakeClient)
        return seen

    return install


# ── TC-SET-001/002: 读状态 ──────────────────────────────────────

async def test_get_unconfigured(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json() == {
        "ai_configured": False, "key_source": None, "key_hint": None,
        "base_url": ENV_URL, "base_url_source": "env",
        "model": ENV_MODEL, "model_source": "env",
    }


async def test_get_configured_from_env_masks_key(client, monkeypatch):
    monkeypatch.setitem(settings_api._ENV, KEY_API, ENV_KEY)
    monkeypatch.setattr(settings, "deepseek_api_key", ENV_KEY)
    body = (await client.get("/api/settings")).json()
    assert body["ai_configured"] is True and body["key_source"] == "env"
    assert body["key_hint"].endswith(ENV_KEY[-4:])
    assert ENV_KEY not in str(body)  # 明文不回前端，只回掩码


# ── TC-SET-003~006: 写配置 ──────────────────────────────────────

async def test_put_key_persists_applies_and_resets_client(client, db_session):
    resp = await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY})
    body = resp.json()
    assert body["ai_configured"] is True and body["key_source"] == "db"
    assert body["key_hint"].endswith(FAKE_KEY[-4:]) and FAKE_KEY not in resp.text

    row = await db_session.get(AppSetting, KEY_API)
    assert row is not None and row.value == FAKE_KEY  # 落库
    assert settings.deepseek_api_key == FAKE_KEY  # 运行时立即生效
    assert ai_service._client is None  # 旧 client 缓存被清，下条调用用新 key

    again = await client.get("/api/settings")
    assert again.json()["key_source"] == "db"  # 读回同一状态


async def test_put_base_url_and_model(client, db_session):
    resp = await client.put("/api/settings/ai-config", json={
        "base_url": "https://gateway.example/v1", "model": "some-other-model",
    })
    body = resp.json()
    assert body["base_url"] == "https://gateway.example/v1" and body["base_url_source"] == "db"
    assert body["model"] == "some-other-model" and body["model_source"] == "db"
    assert settings.deepseek_base_url == "https://gateway.example/v1"
    assert settings.deepseek_model == "some-other-model"
    assert (await db_session.get(AppSetting, KEY_MODEL)).value == "some-other-model"


async def test_omitted_fields_untouched_blank_fields_fall_back(client, db_session, monkeypatch):
    await client.put("/api/settings/ai-config", json={
        "api_key": FAKE_KEY, "base_url": "https://gateway.example/v1", "model": "some-other-model",
    })
    monkeypatch.setitem(settings_api._ENV, KEY_API, ENV_KEY)

    # 只改模型：key 与地址必须原样保留（表单只动一项时不许误清其他项）
    await client.put("/api/settings/ai-config", json={"model": "third-model"})
    assert (await db_session.get(AppSetting, KEY_API)).value == FAKE_KEY
    assert settings.deepseek_base_url == "https://gateway.example/v1"

    # 空串 = 清除该覆盖，回落 .env
    body = (await client.put("/api/settings/ai-config", json={"api_key": "", "model": ""})).json()
    assert body["key_source"] == "env" and body["key_hint"].endswith(ENV_KEY[-4:])
    assert body["model"] == ENV_MODEL and body["model_source"] == "env"
    assert await db_session.get(AppSetting, KEY_API) is None
    assert settings.deepseek_api_key == ENV_KEY
    assert settings.deepseek_model == ENV_MODEL


async def test_put_overwrites_same_row(client, db_session):
    await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY})
    await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY + "x"})
    rows = (await db_session.execute(AppSetting.__table__.select())).all()
    assert len(rows) == 1  # upsert 不是追加
    assert settings.deepseek_api_key == FAKE_KEY + "x"


# ── TC-SET-007: 启动装载 ────────────────────────────────────────

async def test_load_overrides_on_startup(db_session):
    for key, value in ((KEY_API, FAKE_KEY), (KEY_MODEL, "db-model")):
        db_session.add(AppSetting(key=key, value=value))
    await db_session.commit()
    await settings_api.load_ai_overrides(db_session)
    assert settings.deepseek_api_key == FAKE_KEY
    assert settings.deepseek_model == "db-model"
    assert settings.deepseek_base_url == ENV_URL  # 没覆盖的回落 .env
    assert ai_service._client is None

    for key in (KEY_API, KEY_MODEL):
        await db_session.delete(await db_session.get(AppSetting, key))
    await db_session.commit()
    await settings_api.load_ai_overrides(db_session)
    assert settings.deepseek_api_key == ""  # 无覆盖 → 回落 .env（此处打桩为空）
    assert settings.deepseek_model == ENV_MODEL


# ── TC-SET-008~012: 测试连接 ────────────────────────────────────

async def test_test_without_key(client):
    assert (await client.post("/api/settings/ai-config/test")).json() == {
        "ok": False, "detail": "尚未配置 API key", "models": [],
    }


async def test_test_ok_returns_model_ids(client, fake_httpx):
    seen = fake_httpx(payload={"data": [{"id": "model-a"}, {"id": "model-b"}, {"bad": 1}]})
    await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY})
    body = (await client.post("/api/settings/ai-config/test")).json()
    assert body == {"ok": True, "detail": "连接正常", "models": ["model-a", "model-b"]}
    assert seen["url"].endswith("/models")  # 探测走 models 列表，不发消息不烧 token
    assert seen["headers"]["Authorization"] == f"Bearer {FAKE_KEY}"


async def test_test_invalid_key(client, fake_httpx):
    fake_httpx(status_code=401)
    await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY})
    body = (await client.post("/api/settings/ai-config/test")).json()
    assert body["ok"] is False and "无效" in body["detail"] and body["models"] == []
    assert FAKE_KEY not in str(body)  # 错误里也不带明文


async def test_test_unreachable(client, fake_httpx):
    fake_httpx(error=ConnectionError("boom"))
    await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY})
    body = (await client.post("/api/settings/ai-config/test")).json()
    assert body["ok"] is False and "连不上" in body["detail"]


async def test_test_other_status(client, fake_httpx):
    fake_httpx(status_code=429)
    await client.put("/api/settings/ai-config", json={"api_key": FAKE_KEY})
    body = (await client.post("/api/settings/ai-config/test")).json()
    assert body["ok"] is False and "429" in body["detail"]


# ── TC-SET-013: 非法输入 ────────────────────────────────────────

async def test_bad_inputs_rejected(client):
    for payload in (
        {"api_key": "sk-a\nb"},
        {"api_key": "x" * 201},
        {"model": "m" * 101},
        {"base_url": "api.deepseek.com"},  # 缺协议头
    ):
        resp = await client.put("/api/settings/ai-config", json=payload)
        assert resp.status_code == 400, payload
