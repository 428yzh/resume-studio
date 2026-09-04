# backend/app/services/brightdata_service.py
#
# ⚠️ 已废弃 — Bright Data MCP 集成已被移除。
# 学习资源推荐已改为由 AI 直接生成中文资源。

# 保留空类以防历史导入
class BrightDataService:
    """已废弃，所有方法返回空结果。"""
    async def search_resources(self, *args, **kwargs):
        return []
    async def search_multi(self, *args, **kwargs):
        return []
    async def build_search_queries(self, *args, **kwargs):
        return []

brightdata_service = BrightDataService()
