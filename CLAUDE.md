# resume-app

简历管理 Web 应用，帮助求职者构建、优化和管理简历。

## 核心功能

1. **模板化简历编写** — 3 套简历模板，区块化编辑（8 种区块类型），一键导出 PDF
2. **AI 润色简历** — 接入 DeepSeek API（SSE 流式），语法修正、STAR 法则优化、ATS 关键词增强
3. **JD 分析与学习路径** — 导入职位描述，AI 提取技术栈，自动导入技能库，生成学习指引和面试题
4. **PDF 简历导入** — 上传 PDF 文件，AI 自动解析为结构化 sections 数据
5. **JD 匹配度分析** — 简历技能 vs JD 技术栈的差距分析，定位学习方向
6. **技能库管理** — 技能 CRUD、分类筛选、熟练度滑块、学习资源和面试题关联
7. **岗位推荐** — DeepSeek 联网搜索真实岗位，首页流动卡片，详情弹窗一键匹配分析 + 查看原帖
8. **划词高亮笔记** — 技能库 AI 学习内容划词高亮 + 笔记，localStorage 持久化，复习快速定位要点
9. **费曼教学 · 数字学生** — 你给 AI 讲课，AI 批判式听讲。五级理解状态机（混沌/字面/关联/重构/辩证），等级有界升降（+1/-1、禁跳级），徽章挂气泡旁；**讲错自动降级 + 温和纠正（correction 动作）**，L3 广度追问 ×2、L5 深度追问 ×2 预算控制；薄弱点累计进 PPT 报告；SSE 流式对话（max_tokens 4096）+ 报告生成（python-pptx 下载）。**聊天状态按房间隔离**（Zustand `rooms: Record<id, RoomState>`），不同房间的流式/消息互不干扰。**问题跟踪**：房间内手动记录教学缺陷/卡点，AI 讲错/讲含糊只在回复里提示、绝不自动建项；某轮 AI 零卡点自动解决未解决项（非破坏式，可重开），列表页「有未解决问题」presence 标记。SQLite 连接启用 `PRAGMA foreign_keys=ON` 保证级联删除生效
10. **多 Agent 评审管线** — 3 个教学生成函数（`explain_topic` / `generate_learning_guide` / `generate_learning_plan`）生成内容先经**资深讲师**（内容质量）+ **模拟用户**（用户适配度）双 agent 评审，不合格则反馈增量注入重新生成（棘轮回滚，上下文不丢）；评审只输出 JSON 反馈、绝不自己生成；无 key / 解析失败一律放行。**复习板块已全量删除**（后端 `/cornell-review`、`/review-questions` 路由 + 前端 AI 批改/复习按钮 + Ebbinghaus 记忆曲线），保留康奈尔记笔记本体
11. **AI 审计日志 + 防提示词注入** — 单点补丁包装 `client.chat.completions.create`（`_get_client` 内 `_patch_audit`，幂等，覆盖全部调用点含 feynman）：每次 AI 调用一行 JSON 落 `backend/logs/ai_audit.log`（RotatingFileHandler 5MB×3，字段：feature/status/injection/token 用量/耗时/生成内容全文，流式 usage 取最后 chunk、取不到按 4 字符/token 估算）。安全分两层（参考 DeepSeek-Harness 指令/数据分离）：L1 防注入声明 + user 内容 `<user_input>` 定界符包裹；L2 注入模式正则检测（忽略指令/system prompt/角色扮演/DAN mode）命中 → 日志标记 `injection=1`。job_service 的 httpx 直连单独加声明 + 打点。审计失败只吞掉不影响主流程

## 端口配置

| 服务 | 端口 | 命令 |
|---|---|---|
| 后端 FastAPI | **8001** | 在 `backend/` 目录下 `uvicorn app.main:app --port 8001 --reload`（main.py 用 `from app.config import`，须以 backend/ 为根启动） |
| 前端 Vite proxy | → `:8001` | `frontend/vite.config.ts` proxy target |
| 前端 Vite dev | **5173** | `npx vite --port 5173` |

**约束**：改后端端口须同步更新 `frontend/vite.config.ts` proxy target 和 `backend/app/main.py` CORS allow_origins。后端实际运行在 8001，前端 proxy 到 8001。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 19 + Vite 6 + Tailwind CSS v4 | SPA，react-router-dom v7 |
| 后端 | Python 3.11 + FastAPI 0.115 + SQLAlchemy 2.0 | REST API，异步引擎 |
| AI | DeepSeek API（OpenAI SDK） | 润色 SSE 流式 + 非流式分析 |
| PDF | @react-pdf/renderer v4 | A4 格式简历导出 |
| 状态管理 | Zustand v5 | 零 DOM 依赖 |
| 数据库 | SQLite + aiosqlite | 异步，无需额外部署 |
| 测试 | pytest + httpx + vitest + Playwright | 后端 79 / 前端 45 / E2E 7 |

## 架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           React 前端 (SPA)                          │
│                                                                     │
│  ┌─ App.tsx (路由入口) ──────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  /resumes   ─→ ResumeList     ─→ ResumeEditor                 │  │
│  │  /resumes/:id ─→ ResumeEditor  (编辑 / AI 润色 / 预览 / JD)   │  │
│  │  /resumes/new ─→ ResumeEditor  (新建)                         │  │
│  │  /jd         ─→ JDAnalysis                                   │  │
│  │  /skills     ─→ SkillLibrary                                 │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Layout (导航栏：简历管理 / JD 分析 / 技能库) ─────────────────┐  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ core/ (纯逻辑层) ──────────┐   ┌─ web/ (UI 层) ────────────┐  │
│  │  api/    ← HttpClient 接口  │   │  components/               │  │
│  │  models/ ← TypeScript 类型  │   │   ├─ Layout.tsx            │  │
│  │  stores/ ← Zustand 状态     │   │   ├─ SectionForm.tsx       │  │
│  │  services/ ← 业务逻辑       │   │   ├─ ResumePDF.tsx          │  │
│  └─────────────────────────────┘   │   └─ JDMatchTab.tsx         │  │
│                                    │  pages/                     │  │
│                                    │   ├─ ResumeList.tsx         │  │
│                                    │   ├─ ResumeEditor.tsx       │  │
│                                    │   ├─ JDAnalysis.tsx         │  │
│                                    │   └─ SkillLibrary.tsx       │  │
│                                    └─────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ REST API (proxy /api → :8001)
┌─────────────────────────▼───────────────────────────────────────────┐
│                      FastAPI 后端                                   │
│                                                                     │
│  ┌─ main.py (FastAPI app, CORS, 路由挂载) ──────────────────────┐  │
│  │  lifespan: init_db → yield                                    │  │
│  │  挂载 10 个 router:                                           │  │
│  │    /health           → health.py                              │  │
│  │    /api/resumes      → resumes.py  (CRUD + PDF import)        │  │
│  │    /api/templates    → templates.py (list / detail)            │  │
│  │    /api/jd           → jd_analysis.py (analyze + CRUD)        │  │
│  │    /api/skills       → skills.py (CRUD + resources + Q&A)     │  │
│  │    /api/ai           → ai.py (polish / polish/stream / guide) │  │
│  │    /api/jobs         → jobs.py (联网搜索 refresh + list)       │  │
│  │    /api/feynman      → feynman.py (五级教学房间 + SSE + PPT)   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ models/ ───────────────────┐   ┌─ schemas/ ────────────────┐  │
│  │  Resume                     │   │  ResumeCreate/Update/Resp  │  │
│  │  ResumeTemplate             │   │  TemplateResponse          │  │
│  │  JDAnalysis                 │   │  JDAnalyzeReq/Response     │  │
│  │  Skill / LearningResource   │   │  SkillCreate/Resp          │  │
│  │  InterviewQuestion          │   │  LearningResource CRUD     │  │
│  │  Job                        │   │  JobResponse               │  │
│  └─────────────────────────────┘   │  InterviewQuestion CRUD    │  │
│                                    └────────────────────────────┘  │
│  ┌─ services/ ─────────────────────────────────────────────────┐  │
│  │  ai_service.py: polish_resume / polish_resume_stream /      │  │
│  │                 analyze_jd / generate_learning_guide /       │  │
│  │                 parse_resume_from_text                       │  │
│  │  job_service.py: DeepSeek 联网搜索岗位 + 结构化解析           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─ database/ ────────────────────────────────┐  ┌─ config.py ─┐  │
│  │  connection.py: engine / session / init_db │  │  Settings   │  │
│  └─────────────────────────────────────────────┘  └────────────┘  │
│  ┌─ seed.py ───────────────────────────────────────────────────┐  │
│  │  3 套模板：经典专业 / 现代简洁 / 创意设计                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  SQLite 数据库 (resume_app.db)                │  │
│  │  resumes | templates | jd_analyses | skills | jobs |         │  │
│  │  learning_resources | interview_questions                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 前端 core/ui 分层

```
frontend/
├── core/                     ← 纯逻辑层，零 DOM 依赖，可跨平台复用
│   ├── api/
│   │   ├── types.ts          ← HttpClient 接口 (get/post/put/del)
│   │   └── client.ts         ← FetchHttpClient 实现
│   ├── models/
│   │   ├── index.ts          ← 统一导出
│   │   ├── resume.ts         ← Resume / ResumeCreate / ResumeUpdate
│   │   ├── section.ts        ← 8 种区块类型 + 表单配置 + 工具函数
│   │   ├── template.ts       ← ResumeTemplate / TemplateSection
│   │   ├── skill.ts          ← Skill / LearningResource / InterviewQuestion
│   │   ├── jd.ts             ← JDAnalysis / TechStackItem / GapAnalysis
│   │   └── job.ts            ← Job 岗位推荐
│   ├── stores/
│   │   ├── resumeStore.ts    ← Zustand: resumes CRUD + templates
│   │   ├── skillStore.ts     ← Zustand: skills + jd + resources + Q&A
│   │   └── jobStore.ts       ← Zustand: jobs 缓存 + 刷新 + 过期判断
│   └── services/
│       ├── resumeService.ts  ← 区块排序/完成度/gap分析/文本转换/旧格式迁移
│       ├── pdfService.ts     ← @react-pdf/renderer 生成 + 下载
│       └── highlights.ts     ← 划词高亮纯函数 + localStorage 持久化
│
├── web/                      ← Web UI 层 (React 组件)
│   ├── components/
│   │   ├── Layout.tsx        ← 导航栏 (简历管理 / JD 分析 / 技能库)
│   │   ├── SectionForm.tsx   ← 通用表单：single/array 模式 + 6 种 field type
│   │   ├── ResumePDF.tsx     ← @react-pdf renderer 组件
│   │   ├── JDMatchTab.tsx    ← JD 匹配度标签页 (嵌入 ResumeEditor)
│   │   ├── JobRecommend.tsx  ← 首页岗位推荐流动卡片 (marquee 悬停暂停)
│   │   ├── JobDetailModal.tsx ← 岗位详情 + 匹配度分析 + 查看原帖
│   │   └── HighlightableMarkdown.tsx ← 划词高亮 + 笔记（渲染后 DOM 注入 <mark>）
│   ├── pages/
│   │   ├── ResumeList.tsx    ← 简历列表 (grid + 完成度 + 导入 PDF)
│   │   ├── ResumeEditor.tsx  ← 核心编辑器 (4 tab: 编辑/AI 润色/预览/JD)
│   │   ├── JDAnalysis.tsx    ← JD 分析页 (输入 + 结果 + 学习指引)
│   │   └── SkillLibrary.tsx  ← 技能库 (表格 + 分类 + 资源/面试题)
│   └── hooks/
│       ├── useEntrance.ts    ← 入场动画
│       └── useHighlights.ts  ← 划词高亮状态 + localStorage 持久化
│
├── src/
│   ├── App.tsx               ← 路由配置 (BrowserRouter)
│   ├── main.tsx              ← 入口
│   └── index.css             ← Tailwind v4 全局样式
│
├── tests/                    ← 单元测试 (vitest)
│   ├── api_client.test.ts
│   ├── models.test.ts
│   ├── resume_service.test.ts
│   ├── resume_store.test.ts
│   └── skill_store.test.ts
│
└── e2e/                      ← 端到端测试 (Playwright)
    ├── navigation.spec.ts
    ├── resume.spec.ts
    ├── skills.spec.ts
    └── jd-analysis.spec.ts
```

### API 路由总览

```
GET    /health                          → 健康检查

# 简历
POST   /api/resumes                     → 创建简历
POST   /api/resumes/import-pdf          → PDF 导入 + AI 解析
GET    /api/resumes                     → 列表
GET    /api/resumes/:id                 → 详情
PUT    /api/resumes/:id                 → 更新
DELETE /api/resumes/:id                 → 删除

# 模板
GET    /api/templates                   → 列表
GET    /api/templates/:id               → 详情

# JD 分析
POST   /api/jd/analyze                  → AI 分析 + 自动导入技能
GET    /api/jd/analyses                 → 分析列表 (?resume_id=)
GET    /api/jd/analyses/:id             → 分析详情

# 技能库
POST   /api/skills                      → 创建技能
GET    /api/skills                      → 列表 (?category=)
PUT    /api/skills/:id                  → 更新
DELETE /api/skills/:id                  → 删除
GET    /api/skills/:id/resources        → 学习资源列表
POST   /api/skills/:id/resources        → 添加资源
PUT    /api/skills/:id/resources/:rid   → 更新资源
DELETE /api/skills/:id/resources/:rid   → 删除资源
GET    /api/skills/:id/questions        → 面试题列表
POST   /api/skills/:id/questions        → 添加面试题
PUT    /api/skills/:id/questions/:qid   → 更新面试题
DELETE /api/skills/:id/questions/:qid   → 删除面试题

# AI
POST   /api/ai/polish                   → 全文润色
POST   /api/ai/polish/stream            → 流式润色 (SSE)
POST   /api/ai/learning-guide           → 生成学习指引（走多 Agent 评审管线）

# 岗位推荐
GET    /api/jobs                        → 岗位推荐缓存列表
POST   /api/jobs/refresh                → 根据简历画像联网搜索刷新岗位

# 费曼教学 · 数字学生
POST   /api/feynman/topics              → 从技能库创建学习房间
GET    /api/feynman/topics              → 房间列表（含等级徽章/预算）
GET    /api/feynman/topics/:id          → 房间详情 + 消息
POST   /api/feynman/topics/:id/message  → 发讲解，SSE 流式返回 {level, content}（零卡点轮自动解决未解决问题）
POST   /api/feynman/topics/:id/report   → 生成 PPT 学习报告（python-pptx）
DELETE /api/feynman/topics/:id          → 删除房间
POST   /api/feynman/topics/:id/problems         → 手动添加问题（open）
PUT    /api/feynman/topics/:id/problems/:pid    → 标记解决 / 重开 {status}
```

### 数据流

```
┌─ 用户输入 ──────────────────────────────────────────────────┐
│  PDF上传 → PDF解析 → AI 解析文本 → 结构化 sections → 保存  │
│  JD粘贴 → AI 分析 → tech_stack + analysis → 自动导入技能库  │
│  编辑区块 → SectionForm → Zustand Store → API → SQLite     │
│  AI润色 → POST /api/ai/polish/stream → SSE → 实时渲染       │
│  岗位推荐 → 汇总简历画像 → POST /api/jobs/refresh →          │
│            DeepSeek 联网搜索 → SQLite 缓存 → 首页流动卡片 →  │
│            详情弹窗 → 分析匹配度 → JDMatchTab 匹配分+差距   │
└─────────────────────────────────────────────────────────────┘
```

## 数据库表结构

| 表 | 字段 | 说明 |
|---|---|---|
| **resumes** | id, title, template_id, sections(JSON), target_company, target_position, created_at, updated_at | 简历主体 |
| **templates** | id, name, description, structure(JSON), is_default, created_at | 3 套种子模板 |
| **jd_analyses** | id, company, position, jd_text, tech_stack(JSON), analysis_result(JSON), resume_id(FK), created_at | JD 分析记录 |
| **skills** | id, name, category, proficiency(0-100), source, notes, learned_at, created_at | 技能库 |
| **learning_resources** | id, skill_id(FK), title, url, type, completed | 学习资源 |
| **interview_questions** | id, skill_id(FK), question, answer, difficulty | 面试题 |
| **jobs** | id, title, company, city, salary, experience, education, jd, url, created_at | 岗位推荐缓存（DeepSeek 联网搜索） |
| **feynman_topics** | id, skill_id(FK), name, level(1-5), status, breadth_left(2), depth_left(2), learning_summary(JSON), created_at, updated_at | 费曼教学房间（每主题一个） |
| **feynman_messages** | id, topic_id(FK), role, content, level(AI消息带), action, created_at | 费曼教学对话消息 |
| **feynman_problems** | id, topic_id(FK, CASCADE), content, source(默认 manual), status(open/resolved), created_at, resolved_at(nullable) | 费曼问题跟踪（仅手动添加，AI 只在回复提示） |

## 设计原则

1. **core/ui 分离** — 业务逻辑与 UI 解耦，core 层零 DOM 依赖，预留移植接口
2. **API 客户端接口化** — `interface HttpClient` (get/post/put/del) 可替换适配器（fetch/axios）
3. **状态管理独立** — Zustand 纯逻辑无 UI 依赖，Store 只暴露 async action
4. **表单通用化** — `SectionForm.tsx` 统一处理 8 种区块类型，single/array 双模式，6 种 field type
5. **AI fallback 降级** — DeepSeek API 不可用时返回默认数据，不阻断核心流程
6. **SSE 流式体验** — AI 润色使用 Server-Sent Events 逐 token 渲染，支持 AbortController 取消
7. **PDF 导入 → AI 解析** — 上传 PDF 后 AI 自动提取结构化 sections，支持旧格式自动迁移
8. **多 Agent 评审** — 教学生成先经资深讲师（内容质量）+ 模拟用户（适配度）独立评审，评审只出 JSON 反馈、生成始终由原生成器执行；反馈增量注入（上下文不丢），棘轮回滚保证只变好不变差，失败放行不阻断主流程

## Karpathy 编码规则

基于 Andrej Karpathy 的 AI 编程行为准则，约束 AI 助手的编码行为。

### 1. 先思考再编码（Think Before Coding）

- **明确陈述假设** — 不确定时提问，不猜测
- **呈现多重解读** — 遇到歧义时不默选一种
- **该反驳时反驳** — 有更简单方案时直言
- **困惑时停下来** — 识别不清晰的点，请求澄清

### 2. 简洁至上（Simplicity First）

- 不做需求之外的功能
- 不为一次性使用场景建抽象
- 不搞没要求的"灵活可配置"
- 不为不可能发生的场景写错误处理
- 200 行能改成 50 行就改

**检验标准**：资深工程师会觉得这过于复杂吗？如果是，简化。

### 3. 精准手术（Surgical Changes）

- 不改动无关代码、注释、格式
- 不重构没坏的东西
- 匹配现有代码风格，不坚持个人偏好
- 发现无关的死代码只提一句，不删
- 只清理自己的改动产生的未用导入/变量/函数

### 4. 目标驱动（Goal-Driven Execution）

- "添加验证" → 转化为"先写一个针对非法输入的失败测试，再让它通过"
- 多步任务：每步陈述简要计划并附加验证标准
- 不告诉 AI"怎么做"，给它"成功的标准"，让它迭代直到达成

## UI 设计规范

采用 **Airtable DESIGN.md** 风格（详见 DESIGN.md），通过 `npx getdesign@latest add airtable` 安装。

### 核心设计语言

- **白底黑字**：干净简约
- **蓝色主调**：blue `#1456f0` 作为主品牌色
- **全扁平化**：卡片用 `border` 替代阴影
- **全 pill 按钮**：所有按钮 `rounded-full`
- **数据表格**：类 Airtable 的表格组件用于技能库展示
- **品牌名**：Resume **Pro**

### CSS Token 体系（Tailwind v4 `@theme`）

| 组 | Tokens |
|---|---|
| Surface | canvas `#ffffff`, surface `#f7f8fa`, hairline `#e2e8f0` |
| Text | ink `#0a0a0a`, charcoal `#222222`, slate `#475569`, muted `#94a3b8` |
| Brand | blue `#1456f0`, blue-light `#dbeafe`, green `#059669`, amber `#d97706` |

### 组件规则

| 组件 | 样式 |
|---|---|
| 主按钮 | `bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm` |
| 次按钮 | `bg-transparent text-ink border border-hairline rounded-full px-5 py-2` |
| 卡片 | `bg-canvas rounded-xl border border-hairline p-6` |
| 特色卡片 | `bg-blue text-white rounded-[32px] p-8` |
| 输入框 | `bg-canvas border border-hairline rounded-lg px-3 py-2` |
| 表格 | `border border-hairline rounded-lg overflow-hidden` |
| Tab 切换 | `bg-surface rounded-full p-1`，选中态 `bg-canvas shadow-sm` |

## 测试体系

详见 `tests/TEST_PLAN.md`。当前 **136 tests**（后端 84 + 前端 45 + E2E 7）。

### 运行命令

```bash
# 后端（项目根目录，需先激活 venv）
cd backend && source venv/Scripts/activate && python -m pytest tests/ -v

# 前端单元（frontend/）
cd frontend && npx vitest run

# 前端 E2E（需先启动前后端）
cd frontend && npm run test:e2e          # headless
cd frontend && npm run test:e2e:ui       # 有头
```

### 测试层级

| 层 | 策略 |
|---|---|
| P0 冒烟 | 核心 API、简历 CRUD、模板加载、Store 基础 |
| P1 回归 | 边界条件、loading 状态、级联操作、编码兼容 |
| P2 边界 | 特殊字符、大文本、空状态、旧格式迁移 |

### 测试数据清理

E2E 测试中创建的 mock 数据（简历、技能等）必须在测试结束后立即删除。Playwright 的 `worker` 配置为 `1`，测试按顺序串行执行，每个测试用例必须：

- **创建的数据由同一用例自行删除**（`add` 测试必须在 `after` 或末尾调用 `delete`）
- 用例之间互不依赖，不共享测试数据
- 避免使用 `test.describe` 级别的共享常量，每个用例独立生成带时间戳的名称
- 如果测试失败导致清理未执行，手动通过应用界面或 API 清理残留数据

```bash
# 手动清理残留测试数据
curl -s http://localhost:8001/api/skills | python -c "import json,sys; [print(s['id'],s['name']) for s in json.load(sys.stdin) if 'E2E' in s['name']]"
curl -s http://localhost:8001/api/resumes | python -c "import json,sys; [print(r['id'],r['title']) for r in json.load(sys.stdin) if 'E2E' in r['title']]"
```

## 开发工作流

1. **读架构** — 定位需求关联的模块和影响范围
2. **输出测试用例** — 先写测试文档，不写实现
3. **实现代码** — 确保测试从红变绿
4. **重启验证** — 重启 dev server，确认功能可用
5. **记载归档** — 更新 CLAUDE.md + TEST_PLAN.md

## 状态

- **当前阶段**：Phase 9 ✅（全部完成）
- **开发模式**：TDD
- **上次开发讨论**：2026-08-09

### 完成状态

| 模块 | 进度 | 测试 |
|------|------|------|
| **后端 API** | 100% | 84/84 ✅ |
| **前端 core 层** | 100% | 45/45 ✅ |
| **前端 UI 层** | 100% | — |
| **E2E 测试** | 100% | 7/7 ✅ |
| **部署 (Docker)** | 100% | — |
| **BOSS 直聘集成** | 100% | — |
| **模拟面试对话** | 100% | — |
| **岗位推荐** | 100% | — |
| **费曼教学** | 100% | — |

### 开发历程

| 阶段 | 任务 | 状态 |
|------|------|------|
| **Phase 1** | ResumeEditor / SkillLibrary / JDAnalysis | ✅ |
| **Phase 2** | AI 润色流式集成 + PDF 导出 | ✅ |
| **Phase 3** | Docker 部署 + 资源/面试题 CRUD + E2E 测试 | ✅ |
| **Phase 4** | BOSS直聘集成（Chrome 扩展） | ✅ |
| **Phase 5** | 模拟面试对话（AI 面试官 + SSE 流式 + 综合评价） | ✅ |
| **Phase 6** | 岗位推荐（DeepSeek 联网搜索 + 首页流动卡片 + 详情匹配闭环） | ✅ |
| **Phase 7** | 划词高亮笔记（技能库 AI 内容划词高亮 + 笔记 + localStorage 持久化） | ✅ |
| **Phase 8** | 费曼教学 · 数字学生（五级理解状态机 + SSE 流式对话 + 提问预算 + PPT 报告） | ✅ |
| **Phase 9** | 多 Agent 评审管线（讲师+模拟用户双评审 + 棘轮重试，覆盖 3 个教学函数）+ 全量删除复习板块 | ✅ |

### 文件清单

**后端 (10 个核心文件)**
- `backend/app/main.py` — FastAPI 入口，7 个 router 挂载
- `backend/app/api/` — 9 个路由模块 (health/resumes/templates/jd_analysis/skills/ai/jobs/quiz/mock_interview/feynman)
- `backend/app/models/` — 7 个 SQLAlchemy 模型 (resume/template/jd_analysis/skill/job + feynman 3 张)
- `backend/app/schemas/` — 7 个 Pydantic schema 模块
- `backend/app/services/ai_service.py` — DeepSeek API (润色/分析/面试等) + 多 Agent 评审管线（Agent 基类 + 资深讲师/模拟用户评审 + review_pipeline 棘轮循环）
- `backend/app/services/job_service.py` — DeepSeek 联网搜索岗位 (web_search_20250305 工具 + 结构化解析)
- `backend/app/services/feynman.py` — 费曼教学核心（五级状态机 + 定级评估 + SSE 流式 + python-pptx 报告）
- `backend/app/services/audit.py` — AI 审计日志 + 防注入（L1 声明/定界符 + L2 注入检测，单点补丁配套）
- `backend/app/database/connection.py` — SQLite + async engine + session
- `backend/app/seed.py` — 3 套模板种子数据
- `backend/app/config.py` — Settings (DB/DeepSeek/CORS)

**前端 core 层 (12 个核心文件)**
- `frontend/core/api/` — HttpClient 接口 + FetchHttpClient 实现
- `frontend/core/models/` — 7 个模块 (index/resume/section/template/skill/jd/job/feynman)
- `frontend/core/stores/` — 4 个 Zustand store (resumeStore / skillStore / jobStore / feynmanStore)
- `frontend/core/services/` — 2 个服务 (resumeService / pdfService)

**前端 UI 层 (14 个核心文件)**
- `frontend/web/components/` — Layout / SectionForm / ResumePDF / JDMatchTab / JobRecommend / JobDetailModal / LevelBadge
- `frontend/web/pages/` — ResumeList / ResumeEditor / JDAnalysis / SkillLibrary / FeynmanRoomList / FeynmanRoom
- `frontend/src/` — App.tsx (路由) / main.tsx (入口)

**测试 (13 个文件)**
- `backend/tests/` — 11 个文件 (conftest + 10 个测试模块，含 test_jobs、test_feynman、test_feynman_problems、test_review_pipeline、test_ai_audit)
- `frontend/tests/` — 7 个 vitest 测试文件 (含 job_store、feynman_store)
- `frontend/e2e/` — 4 个 Playwright 规范

## Docker 部署

```bash
# 1. 确保后端 .env 文件存在
cp .env.example backend/.env

# 2. 构建并启动
docker compose up -d

# 3. 访问
# http://localhost

# 4. 查看日志
docker compose logs -f

# 5. 停止
docker compose down
```

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 编排 backend + frontend 两个容器 |
| `backend/Dockerfile` | Python 3.11-slim + uvicorn |
| `frontend/Dockerfile` | 多阶段构建：Node 20 build → Nginx alpine |
| `frontend/nginx.conf` | SPA fallback + `/api` 代理到 backend |
| `.env.example` | 环境变量模板 |

## 识图能力

你的底层模型（当前为 deepseek-v4-flash）**不具备原生识图能力**。遇到图片时，不要用 Read 工具看图片，改用 `vision.js`：

```
vision "<图片路径>" "用中文描述这张图片"     # 本地图片
vision --url "<链接>" "用中文描述这张图片"   # 网络图片
vision-paste "用中文描述这张图片"            # 剪贴板图片 (Win+Shift+S截图后)
```

### 触发场景

- 用户分享图片路径（本地或网络 URL）
- 消息中出现 `[Unsupported Image]` 或 "Saved attachments:" 并列出图片
- 用户要求分析、描述、识别图片内容
- 出现 `[Unsupported Image]` 时，让用户截图后运行 `vision-paste`

### 配置说明

- API Key 和模型配置在项目根目录 `.env` 文件中：
  - `DASHSCOPE_API_KEY` — 阿里云百炼 API Key
  - `VISION_MODEL` — 视觉模型名（当前为 `qwen3.5-omni-plus`）
- 全局 `vision` 命令在 `~/.claude/skills/vision/` 目录下
- 识图服务走阿里云百炼（dashscope），OpenAI 兼容格式
