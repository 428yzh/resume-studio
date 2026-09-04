"""种子数据：初始化简历模板"""
import asyncio
import json
from app.database.connection import async_session, init_db
from app.models.template import ResumeTemplate

TEMPLATES = [
    {
        "name": "经典专业",
        "description": "最通用的经典简历模板，适合大多数行业，左侧个人信息 + 右侧经历的经典双栏布局",
        "is_default": True,
        "structure": {
            "sections": [
                {"key": "header", "title": "个人信息", "required": True, "max_length": 500, "hint": "姓名、电话、邮箱、所在地"},
                {"key": "summary", "title": "个人摘要", "required": True, "max_length": 300, "hint": "2-3句话概括核心竞争力和职业目标"},
                {"key": "experience", "title": "工作经历", "required": True, "max_length": 3000, "hint": "按时间倒序，使用STAR法则，量化成果"},
                {"key": "education", "title": "教育背景", "required": True, "max_length": 500, "hint": "学校、专业、学位、时间"},
                {"key": "skills", "title": "专业技能", "required": True, "max_length": 1000, "hint": "分类列出技术栈和熟练程度"},
                {"key": "projects", "title": "项目经历", "required": False, "max_length": 2000, "hint": "挑选2-3个最有代表性的项目"},
                {"key": "certificates", "title": "证书荣誉", "required": False, "max_length": 500, "hint": "相关证书和荣誉奖项"},
            ],
            "style": {"font": "DM Sans", "primary_color": "#1456f0", "layout": "classic"}
        }
    },
    {
        "name": "现代简洁",
        "description": "干净简约的现代风格，强调留白和排版层次，适合互联网/科技行业",
        "is_default": False,
        "structure": {
            "sections": [
                {"key": "header", "title": "个人信息", "required": True, "max_length": 500, "hint": "姓名、职位、联系方式"},
                {"key": "summary", "title": "专业概要", "required": True, "max_length": 250, "hint": "一句话定位 + 核心优势"},
                {"key": "experience", "title": "工作经历", "required": True, "max_length": 3000, "hint": "突出成就和影响，每个经历3-5个要点"},
                {"key": "education", "title": "教育背景", "required": True, "max_length": 500, "hint": "学校、专业、GPA（如较高）"},
                {"key": "skills", "title": "技术栈", "required": True, "max_length": 800, "hint": "图标/标签形式展示，按熟练度排序"},
            ],
            "style": {"font": "Inter", "primary_color": "#059669", "layout": "minimal"}
        }
    },
    {
        "name": "创意设计",
        "description": "视觉突出的创意模板，适合设计师、创意岗位，用色彩区块区分内容",
        "is_default": False,
        "structure": {
            "sections": [
                {"key": "header", "title": "个人品牌", "required": True, "max_length": 500, "hint": "姓名 + 职位标签 + 个人网站/作品集链接"},
                {"key": "summary", "title": "设计理念", "required": False, "max_length": 300, "hint": "个人设计理念和方法论"},
                {"key": "experience", "title": "工作经历", "required": True, "max_length": 3000, "hint": "展示设计成果和业务影响"},
                {"key": "education", "title": "教育背景", "required": True, "max_length": 500, "hint": "学校、专业"},
                {"key": "skills", "title": "工具技能", "required": True, "max_length": 800, "hint": "设计工具和技术栈"},
                {"key": "portfolio", "title": "作品精选", "required": False, "max_length": 2000, "hint": "链接或描述代表性设计项目"},
            ],
            "style": {"font": "DM Sans", "primary_color": "#a855f7", "layout": "creative"}
        }
    },
]


async def seed_templates():
    await init_db()
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(select(ResumeTemplate))
        existing = result.scalars().all()
        if existing:
            print(f"已有 {len(existing)} 个模板，跳过种子数据")
            return

        for t in TEMPLATES:
            template = ResumeTemplate(
                name=t["name"],
                description=t["description"],
                structure=json.dumps(t["structure"], ensure_ascii=False),
                is_default=t["is_default"],
            )
            session.add(template)

        await session.commit()
        print(f"已插入 {len(TEMPLATES)} 个简历模板")


if __name__ == "__main__":
    asyncio.run(seed_templates())
