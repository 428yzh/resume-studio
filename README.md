# Resume Studio

AI 驱动的简历管理 Web 应用——帮助求职者构建、优化和管理简历，从简历编写到 JD 匹配到岗位推荐的一站式工具。

## 功能特性

- **模板化简历编写** — 3 套简历模板，8 种区块类型可视化编辑，一键导出 A4 PDF
- **AI 润色** — DeepSeek API SSE 流式输出：语法修正、STAR 法则优化、ATS 关键词增强
- **JD 分析与学习路径** — 导入职位描述，AI 提取技术栈并自动导入技能库，生成学习指引与面试题
- **PDF 简历导入** — 上传 PDF，AI 自动解析为结构化数据
- **JD 匹配度分析** — 简历技能 vs JD 技术栈差距分析，定位学习方向
- **技能库** — 技能 CRUD、分类筛选、熟练度滑块、学习资源与面试题关联
- **费曼教学 · 数字学生** — 给 AI 讲课、AI 批判式听讲；五级理解状态机 + 等级徽章 + 提问预算 + PPT 学习报告
- **多 Agent 评审管线** — 教学生成内容经资深讲师 + 模拟用户双 agent 评审，不合格自动重生成（棘轮回滚）
- **岗位推荐** — AI 联网搜索真实岗位，首页流动卡片，详情弹窗一键匹配分析
- **划词高亮笔记** — 学习内容划词高亮 + 笔记，localStorage 持久化
- **模拟面试 / 测验** — AI 面试官对话 + 综合评价；知识点测验与错题回顾
- **AI 审计日志 + 防提示词注入** — 每次 AI 调用一行 JSON 审计日志（token 用量/耗时/生成全文），L1 定界符加固 + L2 注入检测

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite 6 + Tailwind CSS v4 + Zustand v5 |
| 后端 | Python 3.11 + FastAPI + SQLAlchemy 2.0（异步） |
| AI | DeepSeek API（SSE 流式） |
| 数据库 | SQLite（aiosqlite，零部署） |
| PDF | @react-pdf/renderer（导出）/ python-pptx（报告） |
| 测试 | pytest 84 + vitest 45 + Playwright E2E 7 |

## 快速开始（Docker）

```bash
cp .env.example .env          # 填入 DEEPSEEK_API_KEY
docker compose up -d --build
# 访问 http://localhost（前端 :80 → 后端 :8001）
```

数据持久化在 `resume-data` 卷，AI 审计日志在宿主机 `logs/ai_audit.log`。

## 本地开发

```bash
# 后端 :8001（在 backend/ 下，先激活 venv）
cd backend && uvicorn app.main:app --port 8001 --reload

# 前端 :5173（vite proxy → :8001）
cd frontend && npx vite --port 5173
```

### 测试

```bash
cd backend && python -m pytest tests/ -v    # 后端 84
cd frontend && npx vitest run               # 前端 45
cd frontend && npm run test:e2e             # E2E 7（需前后端已启动）
```

## 目录结构

```
├── backend/            FastAPI：app/api 路由 · app/services AI 服务（含审计/防注入）· app/models · app/schemas
├── frontend/
│   ├── core/           纯逻辑层（api client / models / Zustand stores / services，零 DOM）
│   ├── web/            React UI（components / pages / hooks）
│   ├── src/            路由入口
│   └── e2e/            Playwright
├── docker-compose.yml  backend(:8001) + nginx(:80) 编排
└── tests/TEST_PLAN.md  测试计划
```

## 文档

- `CLAUDE.md` — 架构、数据库表结构、API 路由、开发规范
- `DESIGN.md` — Airtable 风格 UI 设计规范
- `tests/TEST_PLAN.md` — 测试体系
