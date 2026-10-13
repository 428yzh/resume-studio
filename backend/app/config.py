from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./resume_app.db"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    # 唯一一处模型名默认值：调用点全部读 settings.deepseek_model（可在设置页覆盖）。
    # search.js 子进程的 WEBSEARCH_MODEL 同源 —— 但它走 DeepSeek 专属 websearch 包，
    # 换非 DeepSeek 服务时岗位推荐/资源搜索会降级，见 api/settings.py 的说明。
    deepseek_model: str = "deepseek-v4-flash"
    cors_origins: str = "http://localhost:5173,http://localhost:5174"
    max_upload_size_mb: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
