from sqlalchemy import Column, DateTime, String, Text, func
from app.database.connection import Base


class AppSetting(Base):
    """应用级键值设置（一行一个 key，照 Open WebUI 的 config 表）—— 目前只放 AI API key。

    与 .env 的关系：DB 值覆盖 .env，.env 仍是兜底默认（换机器只改 .env 也能跑）。
    明文存：单用户本地应用，DB 与 .env 同机同权限、都不进 git（见 .gitignore），
    at-rest 加密在当前无鉴权的前提下只是把钥匙和锁放同一个抽屉（SECURITY.md P1 未做）。
    明文永不回前端：GET /api/settings 只回「配没配 + 掩码尾巴」。
    """

    __tablename__ = "app_settings"

    key = Column(String(50), primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
