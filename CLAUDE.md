# resume-app

简历管理 Web 应用，帮助求职者构建、优化和管理简历。

## 核心功能

1. **模板化简历编写** — 3 套简历模板，区块化编辑（8 种区块类型），一键导出 PDF
2. **AI 润色简历** — 接入 DeepSeek API（SSE 流式），语法修正、STAR 法则优化、ATS 关键词增强
3. **JD 分析与学习路径** — 导入职位描述，AI 提取技术栈，自动导入技能库，生成学习指引和面试题
4. **PDF 简历导入** — 上传 PDF 文件，AI 自动解析为结构化 sections 数据
5. **JD 匹配度分析** — 简历技能 vs JD 技术栈的差距分析，定位学习方向
6. **技能库管理** — 技能 CRUD、分类筛选、自评熟练度滑块、学习资源和面试题关联。**`proficiency` 可空，`NULL` = 用户没表态（UI 显示「未验证」）**，绝不用 0 或 50 冒充自评；新建表单不预填、不落库，只有用户拖过滑块才算自评。**备注为新建必填**：出题时它是该技能唯一的语境（见 #9），空的备注会让歧义技能名退化成裸名字
7. **岗位推荐** — DeepSeek 联网搜索真实岗位，首页流动卡片，详情弹窗一键匹配分析 + 查看原帖
8. **划词高亮笔记** — 技能库 AI 学习内容划词高亮 + 笔记，localStorage 持久化，复习快速定位要点
9. **面试题库（刷题 + 考试）** — AI 出题（`mode: "practice"` 按技能范围自定义题量 / `mode: "exam"` 固定 10 单选 + 5 多选 + 3 问答），三种题型（single_choice / multi_choice / essay）；选择题直接比对判分、问答题走 AI 评分 + 评语 + 参考答案。考试模式带 **45 分钟倒计时**（`QuizExam.tsx` 的 `EXAM_DURATION = 45 * 60`）、到时自动交卷；答题记录列表 + 单场次详情回看。技能库详情内可查该技能的关联题目（`GET /api/questions?skill_id=`）。**出题的技能语境只取技能备注**（`quiz.py` 的 `_skill_context`）：出题时把勾选技能的备注拼进 prompt 并在 system 要求先读备注定技术再出题 —— 只传名字时歧义名（如 `harness`）会被 AI 按字面联想成别的技术。**不带 `category`**：它是自由分类、新建表单默认值是「前端」，实测 12 条里 5 条是错误默认值，当判据会把 AI 带偏。**PDF 导出**（`QuizPDF.tsx` + `pdfService.exportQuestionsToPDF`）覆盖 4 个场景：考前空白卷（刷题页 / 考试页）、考后含答案卷（结果页 / 答题记录详情）、技能复习卷（技能库「AI 生成题目」区，只出正确答案）
10. **模拟面试对话** — 按目标岗位 + JD 上下文开启 AI 面试官，SSE 流式提问与追问，逐题实时评分（X/10）+ 评语，**难度自适应升降级**，结束后生成综合评价；支持语音作答（`VoiceRecorder.tsx`，浏览器 SpeechRecognition）
11. **BOSS 直聘集成** — `frontend/boss-extension/` Chrome 扩展（manifest v3）采集职位页 → `POST /api/jd/from-boss` 落库；另有 `GET /api/jd/by-url` + `/by-url/summary` 按链接抓取 JD
12. **费曼教学 · 数字学生** — 你给 AI 讲课，AI 批判式听讲。五级理解状态机（混沌/字面/关联/重构/辩证），等级有界升降（+1/-1、禁跳级），徽章挂气泡旁；**讲错自动降级 + 温和纠正（correction 动作）**，L3 广度追问 ×2、L5 深度追问 ×2 预算控制；薄弱点累计进 PPT 报告；SSE 流式对话（max_tokens 4096）+ 报告生成（python-pptx 下载）。**聊天状态按房间隔离**（Zustand `rooms: Record<id, RoomState>`），不同房间的流式/消息互不干扰。**问题跟踪**：房间内手动记录教学缺陷/卡点，AI 讲错/讲含糊只在回复里提示、绝不自动建项；某轮 AI 零卡点自动解决未解决项（非破坏式，可重开），列表页「有未解决问题」presence 标记。SQLite 连接启用 `PRAGMA foreign_keys=ON` 保证级联删除生效
13. **多 Agent 评审管线** — 3 个教学生成函数（`explain_topic` / `generate_learning_guide` / `generate_learning_plan`）生成内容先经**资深讲师**（内容质量）+ **模拟用户**（用户适配度）双 agent 评审，不合格则反馈增量注入重新生成（棘轮回滚，上下文不丢）；评审只输出 JSON 反馈、绝不自己生成；无 key / 解析失败一律放行。**复习板块已全量删除**（后端 `/cornell-review`、`/review-questions` 路由 + 前端 AI 批改/复习按钮 + Ebbinghaus 记忆曲线），保留康奈尔记笔记本体
14. **AI 审计日志 + 防提示词注入** — 单点补丁包装 `client.chat.completions.create`（`_get_client` 内 `_patch_audit`，幂等，覆盖全部调用点含 feynman）：每次 AI 调用一行 JSON 落 `backend/logs/ai_audit.log`（RotatingFileHandler 5MB×3，字段：feature/status/injection/token 用量/耗时/生成内容全文，流式 usage 取最后 chunk、取不到按 4 字符/token 估算）。安全分两层（参考 DeepSeek-Harness 指令/数据分离）：L1 防注入声明 + user 内容 `<user_input>` 定界符包裹；L2 注入模式正则检测（忽略指令/system prompt/角色扮演/DAN mode）命中 → 日志标记 `injection=1`。job_service 的 httpx 直连单独加声明 + 打点。审计失败只吞掉不影响主流程

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
| PDF | @react-pdf/renderer v4 | A4 简历 + 试题导出。**必须走 `NotoSansSC` 字体**，见下方「PDF 中文字体」 |
| 状态管理 | Zustand v5 | 零 DOM 依赖 |
| 数据库 | SQLite + aiosqlite | 异步，无需额外部署 |
| 测试 | pytest + httpx + vitest + Playwright | 后端 87 / 前端 51 / E2E 8 |

## 架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           React 前端 (SPA)                          │
│                                                                     │
│  ┌─ App.tsx (路由入口, 17 条) ─────────────────────────────────┐  │
│  │                                                               │  │
│  │  /            ─→ redirect /resumes                            │  │
│  │  /resumes     ─→ ResumeList   ─→ ResumeEditor                │  │
│  │  /resumes/:id ─→ ResumeEditor  (编辑 / AI 润色 / 预览 / JD)   │  │
│  │  /jd          ─→ JDAnalysis    (文本 / 图片 OCR 双输入)       │  │
│  │  /skills      ─→ SkillLibrary                                │  │
│  │  /mock-interview      ─→ MockInterviewList                   │  │
│  │  /mock-interview/:id  ─→ MockInterview                       │  │
│  │  /quiz                ─→ QuizList      (刷题 / 考试双模式)    │  │
│  │  /quiz/session/:id    ─→ QuizSession                         │  │
│  │  /quiz/exam/:id       ─→ QuizExam      (45 分钟倒计时)        │  │
│  │  /quiz/records        ─→ QuizRecords                         │  │
│  │  /quiz/records/:id    ─→ QuizRecordDetail                    │  │
│  │  /feynman     ─→ FeynmanRoomList ─→ FeynmanRoom              │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Layout (导航栏：简历管理 / JD 分析 / 面试题库 /               ┐  │
│  │           模拟面试 / 技能库；费曼复习入口见技能库页头)          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ core/ (纯逻辑层) ──────────┐   ┌─ web/ (UI 层) ────────────┐  │
│  │  api/    ← HttpClient 接口  │   │  components/ (18 个)      │  │
│  │  models/ ← TypeScript 类型  │   │   Layout / SectionForm     │  │
│  │  stores/ ← Zustand 状态     │   │   ResumePDF / JDMatchTab   │  │
│  │  services/ ← 业务逻辑       │   │   JobRecommend / JobDetail │  │
│  └─────────────────────────────┘   │   LearningPanel / Floating │  │
│                                    │   HighlightableMarkdown    │  │
│                                    │   QuestionCard / VoiceRecorder│
│                                    │   AIErrorBox / ConfirmDialog│
│                                    │   AnimatedNumber / LoadingDots│
│                                    │   EmptyIcons / LevelBadge  │  │
│                                    │  pages/ (13 个)            │  │
│                                    │   ResumeList / ResumeEditor│
│                                    │   JDAnalysis / SkillLibrary│
│                                    │   MockInterviewList / MockInterview│
│                                    │   QuizList / QuizSession   │  │
│                                    │   QuizExam / QuizRecords   │  │
│                                    │   QuizRecordDetail         │  │
│                                    │   FeynmanRoomList / FeynmanRoom│
│                                    └─────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ REST API (proxy /api → :8001)
┌─────────────────────────▼───────────────────────────────────────────┐
│                      FastAPI 后端                                   │
│                                                                     │
│  ┌─ main.py (FastAPI app, CORS, 路由挂载) ──────────────────────┐  │
│  │  lifespan: init_db → yield                                    │  │
│  │  挂载 10 个 router (共 63 个 endpoint):                       │  │
│  │    /health            → health.py                             │  │
│  │    /api/resumes       → resumes.py  (CRUD + PDF import)       │  │
│  │    /api/templates     → templates.py (list / detail)          │  │
│  │    /api/jd            → jd_analysis.py (analyze + CRUD +      │  │
│  │                         analyze-image + from-boss + by-url)   │  │
│  │    /api/skills        → skills.py (CRUD + resources + Q&A +   │  │
│  │                         learning-plan + import)               │  │
│  │    /api/ai            → ai.py (polish / polish/stream /       │  │
│  │                         explain-topic / cornell / guide)      │  │
│  │    /api/jobs          → jobs.py (联网搜索 refresh + list)      │  │
│  │    /api                → quiz.py (questions + quiz sessions)   │  │
│  │    /api/mock-interview → mock_interview.py (start/answer/end)  │  │
│  │    /api/feynman       → feynman.py (五级教学房间 + SSE + PPT)  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ models/ (13 张表) ─────────┐   ┌─ schemas/ (7 个模块) ─────┐  │
│  │  Resume                     │   │  resume / template         │  │
│  │  ResumeTemplate             │   │  jd / skill / job          │  │
│  │  JDAnalysis                 │   │  quiz / feynman            │  │
│  │  Skill / LearningResource   │   │                            │  │
│  │  InterviewQuestion / Job    │   │  (mock_interview 复用      │  │
│  │  Question / QuizSession     │   │   quiz/feynman schema)     │  │
│  │  QuizAnswer                 │   │                            │  │
│  │  MockInterview / Message    │   │                            │  │
│  │  Feynman{Topics,Messages,   │   │                            │  │
│  │          Problems}          │   │                            │  │
│  └─────────────────────────────┘   └────────────────────────────┘  │
│  ┌─ services/ ─────────────────────────────────────────────────┐  │
│  │  ai_service.py: polish / analyze_jd / generate_learning_guide│  │
│  │                 / parse_resume_from_text / explain_topic /   │  │
│  │                 generate_quiz_questions / cornell_prompts /  │  │
│  │                 OCR + 多 Agent 评审管线                       │  │
│  │  job_service.py: DeepSeek 联网搜索岗位 + 结构化解析           │  │
│  │  feynman.py: 五级状态机 + 定级 + SSE + python-pptx 报告       │  │
│  │  audit.py: AI 审计日志 + L1/L2 防注入（单点补丁包装）         │  │
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
│  │  learning_resources | interview_questions | questions |      │  │
│  │  quiz_sessions | quiz_answers | mock_interviews |            │  │
│  │  mock_interview_messages | feynman_topics |                  │  │
│  │  feynman_messages | feynman_problems                         │  │
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
│   │   ├── resume.ts         ← Resume / ResumeCreate / ResumeUpdate
│   │   ├── section.ts        ← 8 种区块类型 + 表单配置 + 工具函数
│   │   ├── template.ts       ← ResumeTemplate / TemplateSection
│   │   ├── skill.ts          ← Skill / LearningResource / InterviewQuestion
│   │   ├── jd.ts             ← JDAnalysis / TechStackItem / GapAnalysis
│   │   ├── job.ts            ← Job 岗位推荐
│   │   ├── feynman.ts        ← 费曼房间 / 消息 / 问题
│   │   ├── quiz.ts           ← Question / QuizSession / GenerateRequest
│   │   └── mockInterview.ts  ← MockInterview 会话与消息
│   ├── stores/               ← 6 个 Zustand store
│   │   ├── resumeStore.ts    ← resumes CRUD + templates
│   │   ├── skillStore.ts     ← skills + jd + resources + Q&A + learningPlan
│   │   ├── jobStore.ts       ← jobs 缓存 + 刷新 + 过期判断
│   │   ├── feynmanStore.ts   ← 房间隔离 (rooms: Record<id, RoomState>)
│   │   ├── quizStore.ts      ← 题目生成 / 场次 / 交卷 / 记录
│   │   └── interviewStore.ts ← 模拟面试会话 / 流式作答
│   └── services/
│       ├── resumeService.ts  ← 区块排序/完成度/gap分析/文本转换/旧格式迁移
│       ├── pdfService.ts     ← @react-pdf/renderer 生成 + 下载（简历 + 试题）；CJK 字体注册在此
│       └── highlights.ts     ← 划词高亮纯函数 + localStorage 持久化
│
├── web/                      ← Web UI 层 (React 组件)
│   ├── components/           ← 18 个
│   │   ├── Layout.tsx        ← 导航栏 (5 个入口；费曼复习入口在技能库页头)
│   │   ├── SectionForm.tsx   ← 通用表单：single/array 模式 + 6 种 field type
│   │   ├── ResumePDF.tsx     ← @react-pdf renderer 组件（简历）
│   │   ├── QuizPDF.tsx       ← @react-pdf renderer 组件（试题，showAnswers 控制含不含答案）
│   │   ├── JDMatchTab.tsx    ← JD 匹配度标签页 (嵌入 ResumeEditor)
│   │   ├── JobRecommend.tsx  ← 首页岗位推荐流动卡片 (marquee 悬停暂停)
│   │   ├── JobDetailModal.tsx ← 岗位详情 + 匹配度分析 + 查看原帖
│   │   ├── HighlightableMarkdown.tsx ← 划词高亮（渲染后 DOM 注入 <mark>）
│   │   ├── LearningPanel.tsx ← 技能学习面板（多 topic 并发加载）
│   │   ├── FloatingNote.tsx  ← 划词笔记浮层
│   │   ├── QuestionCard.tsx  ← 三种题型渲染（刷题/考试/回顾共用）
│   │   ├── VoiceRecorder.tsx ← 模拟面试语音作答（SpeechRecognition）
│   │   ├── AIErrorBox.tsx    ← AI 降级错误态 + 重试
│   │   ├── ConfirmDialog.tsx / AnimatedNumber.tsx / LoadingDots.tsx
│   │   ├── EmptyIcons.tsx    ← 4 个空状态图标
│   │   └── LevelBadge.tsx    ← 费曼五级徽章
│   ├── pages/                ← 13 个
│   │   ├── ResumeList.tsx / ResumeEditor.tsx (4 tab)
│   │   ├── JDAnalysis.tsx    ← 文本 / 图片 OCR 双输入
│   │   ├── SkillLibrary.tsx  ← 表格 + 分类 + 资源/面试题/关联题目
│   │   ├── MockInterviewList.tsx / MockInterview.tsx
│   │   ├── QuizList.tsx / QuizSession.tsx / QuizExam.tsx
│   │   ├── QuizRecords.tsx / QuizRecordDetail.tsx
│   │   └── FeynmanRoomList.tsx / FeynmanRoom.tsx
│   └── hooks/
│       ├── useEntrance.ts    ← 入场动画
│       └── useHighlights.ts  ← 划词高亮状态 + localStorage 持久化
│
├── boss-extension/           ← BOSS 直聘 Chrome 扩展 (manifest v3)
│   └── background.js / content.js / popup.{html,js} / styles.css
│
├── src/
│   ├── App.tsx               ← 路由配置 (BrowserRouter, 17 条)
│   ├── main.tsx              ← 入口
│   └── index.css             ← Tailwind v4 全局样式
│
├── tests/                    ← 单元测试 (vitest, 8 个文件 / 51 用例)
│   ├── api_client.test.ts / models.test.ts
│   ├── resume_service.test.ts
│   ├── resume_store.test.ts / skill_store.test.ts
│   ├── job_store.test.ts / feynman_store.test.ts
│   └── highlights.test.ts
│
└── e2e/                      ← 端到端测试 (Playwright, 4 spec / 7 test)
    ├── navigation.spec.ts    ← ⚠️ 名为 all pages，实际只覆盖 3 页
    ├── resume.spec.ts
    ├── skills.spec.ts
    └── jd-analysis.spec.ts
```

### API 路由总览

**46 条路径 / 63 个 endpoint**（以实跑 `/openapi.json` 为准）。

```
GET    /health                          → 健康检查

# 简历
POST   /api/resumes                     → 创建简历
POST   /api/resumes/import-pdf          → PDF 导入 + AI 解析（⚠️ 硬编码 template_id=1）
GET    /api/resumes                     → 列表
GET    /api/resumes/:id                 → 详情
PUT    /api/resumes/:id                 → 更新
DELETE /api/resumes/:id                 → 删除

# 模板
GET    /api/templates                   → 列表
GET    /api/templates/:id               → 详情

# JD 分析
POST   /api/jd/analyze                  → AI 分析 + 自动导入技能
POST   /api/jd/analyze-image            → 图片 JD → OCR → 走 analyze_jd（10MB 上限硬编码）
GET    /api/jd/analyses                 → 分析列表 (?resume_id=)
GET    /api/jd/analyses/:id             → 分析详情
PUT    /api/jd/analyses/:id             → 更新（⚠️ title 字段无对应列，静默失效）
DELETE /api/jd/analyses/:id             → 删除
POST   /api/jd/from-boss                → BOSS 扩展采集落库
GET    /api/jd/by-url                   → 按链接抓取 JD
GET    /api/jd/by-url/summary           → 按链接抓取摘要

# 技能库
POST   /api/skills                      → 创建技能
GET    /api/skills                      → 列表 (?category=)
PUT    /api/skills/:id                  → 更新
DELETE /api/skills/:id                  → 删除
POST   /api/skills/:id/import           → 批量导入技能
GET    /api/skills/:id/learning-plan    → 读取学习计划
POST   /api/skills/:id/learning-plan    → 生成学习计划（走多 Agent 评审）
                                            （原 /proficiency-from-steps 已删除，见「自评 NULL 化」）
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
POST   /api/ai/explain-topic            → 知识点讲解 / 单元概述
POST   /api/ai/cornell-prompts          → 康奈尔笔记线索提示
POST   /api/ai/learning-guide           → 生成学习指引（走多 Agent 评审管线）

# 岗位推荐
GET    /api/jobs                        → 岗位推荐缓存列表
POST   /api/jobs/refresh                → 根据简历画像联网搜索刷新岗位

# 面试题库（quiz.py，挂在 /api 根上）
POST   /api/questions/generate          → AI 出题（mode=practice 自定义题量 / mode=exam 固定 10+5+3）
GET    /api/questions                   → 题目列表 (?skill_id= &jd_analysis_id= &type=)
GET    /api/questions/:id               → 题目详情
DELETE /api/questions/:id               → 删除题目
POST   /api/quiz/sessions               → 创建答题场次
GET    /api/quiz/sessions               → 答题记录列表 (?mode= &status=)
GET    /api/quiz/sessions/:id           → 场次详情（含题目 + 作答 + 判分）
POST   /api/quiz/sessions/:id/submit    → 交卷（选择题直接比对，问答题 AI 评分）

# 模拟面试
POST   /api/mock-interview/start        → 开启面试（岗位 + JD 上下文）
POST   /api/mock-interview/:id/answer   → 作答，SSE 流式返回评分 + 评语 + 自适应难度
GET    /api/mock-interview/list         → 面试历史列表
GET    /api/mock-interview/:id          → 面试详情 + 消息
DELETE /api/mock-interview/:id          → 删除面试记录
POST   /api/mock-interview/:id/end      → 结束并生成综合评价

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
│  JD图片 → POST /api/jd/analyze-image → OCR → analyze_jd      │
│  BOSS扩展 → content.js 采集 → POST /api/jd/from-boss          │
│  刷题/考试 → POST /api/questions/generate → 作答 →           │
│            POST /api/quiz/sessions → POST /:id/submit →      │
│            选择题直接比对 / 问答题 AI 评分 → 记录页回看       │
│  模拟面试 → POST /api/mock-interview/start → 逐题 SSE 作答 →  │
│            POST /:id/end → 综合评价                          │
└─────────────────────────────────────────────────────────────┘
```

## 数据库表结构

| 表 | 字段 | 说明 |
|---|---|---|
| **resumes** | id, title, template_id, sections(JSON), target_company, target_position, created_at, updated_at | 简历主体 |
| **templates** | id, name, description, structure(JSON), is_default, created_at | 3 套种子模板 |
| **jd_analyses** | id, company, position, jd_text, tech_stack(JSON), analysis_result(JSON), resume_id(FK), created_at | JD 分析记录 |
| **skills** | id, name, category, proficiency(0-100, **nullable; NULL=未验证**), source, notes, learned_at, created_at, learning_plan | 技能库 |
| **learning_resources** | id, skill_id(FK), title, url, type, completed | 学习资源 |
| **interview_questions** | id, skill_id(FK), question, answer, difficulty | 面试题 |
| **jobs** | id, title, company, city, salary, experience, education, jd, url, created_at | 岗位推荐缓存（DeepSeek 联网搜索） |
| **questions** | id, type(single_choice/multi_choice/essay), question_text, options(JSON), correct_answer, skill_ids(JSON), jd_analysis_id(FK, SET NULL), created_at | AI 生成的题目 |
| **quiz_sessions** | id, mode(practice/exam), question_ids(JSON), status(in_progress/completed), score, total_questions, correct_count, started_at, completed_at | 答题场次 |
| **quiz_answers** | id, session_id(FK, CASCADE), question_id(FK, CASCADE), user_answer, is_correct(问答题为 null), ai_score(0-100), ai_feedback, ai_reference, answered_at | 逐题作答与判分 |
| **mock_interviews** | id, jd_analysis_id(FK), position, company, status(in_progress/completed), interview_type(comprehensive/algorithm/system_design/behavioral), difficulty_level(junior/mid/senior), overall_feedback(JSON), summary_score, started_at, completed_at | 模拟面试会话 |
| **mock_interview_messages** | id, interview_id(FK, CASCADE), role(ai/user), content, question_type(opening/interview/followup/feedback/closing), metadata_json(逐题评分/评语), created_at | 面试对话消息 |
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

## PDF 中文字体（踩过的坑，别再踩）

`@react-pdf/renderer` 默认字体 `Helvetica` 是单字节 WinAnsi 标准字体，**没有中文字形，也不嵌入字体**。写中文时 pdfkit 会把码点截断成低字节：

```
"中文测试" → 实际画出 "-‡KÕ"    // 中 U+4E2D → 0x2D '-'，文 U+6587 → 0x87，…
```

不会报错、不会警告 —— 导出的 PDF 看起来"生成成功"，只有中文全是乱码（ASCII 的邮箱、日期、英文技能名正常，所以很容易漏看）。**2026-09-19 之前所有简历导出都是这个状态。**

修法（已在 `core/services/pdfService.ts` 落地，两个 PDF 共用）：

```ts
Font.register({
  family: "NotoSansSC",
  fonts: [
    { src: "/fonts/NotoSansSC-Regular.woff", fontWeight: 400 },
    { src: "/fonts/NotoSansSC-Bold.woff", fontWeight: 700 },
  ],
});
```

- 字体在 `frontend/public/fonts/`（约 1.5MB × 2），导出时才拉取，不进 JS bundle；Docker 下由 nginx 提供
- 所有 `StyleSheet` 的 `fontFamily` 必须写 `"NotoSansSC"`，不要用 `Helvetica`
- **字形覆盖有限**：用的是 fontsource 的 `chinese-simplified` 子集（8248 字形），`✓` `✗` `√` `○` `●` `→` 等符号**不在其中**（`hasGlyphForCodePoint` 为 false，渲染成空白）。已在用的安全符号只有 `×` `÷` `—` `·`。要加符号先用 fontkit 验一下：

```js
// NODE_PATH=frontend/node_modules node -e "…"
require("fontkit").openSync("frontend/public/fonts/NotoSansSC-Regular.woff").hasGlyphForCodePoint(0x2713)
```

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

详见 `tests/TEST_PLAN.md`。当前 **146 tests**（后端 87 + 前端 51 + E2E 8）。

**覆盖盲区（已知，待补）**：
- 后端 `quiz.py` 全部 8 个 endpoint、`mock_interview.py` 全部 6 个 endpoint **零测试**
- 后端 `ai.py` 的 polish / polish/stream / explain-topic / cornell-prompts、`resumes` 的 import-pdf、`skills` 的 learning-plan **零测试**
- 前端 `quizStore` / `interviewStore` **零单测**（tests/ 只覆盖 resume/skill/job/feynman 四个 store）
- E2E `navigation.spec.ts` 名为 "all pages"，实际只点了 3 个导航项

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

- **当前阶段**：Phase 9 已完成，进入**收尾/加固期**（修 bug + 补测试 + 清死代码）
- **开发模式**：TDD
- **上次开发讨论**：2026-10-03
- **技能模块设计纪要**：`design/2026-10-03 技能模块设计纪要.md`（分数机制定稿 / 页面架构 / 16 条遗留 / 9 步实施顺序，① 已完成）
- **上次代码审计**：2026-09-19

### 完成状态

| 模块 | 进度 | 测试 |
|------|------|------|
| **后端 API** | 100% | 87/87 ✅ |
| **前端 core 层** | 100% | 51/51 ✅ |
| **前端 UI 层** | 100% | — |
| **E2E 测试** | 部分 | 8/8 ✅（仅覆盖 3/6 导航） |
| **部署 (Docker)** | 100% | — |
| **BOSS 直聘集成** | 100% | — |
| **模拟面试对话** | 100% 功能 / 0% 测试 | ❌ 6 个 endpoint 无测试 |
| **面试题库（刷题+考试）** | 功能完成（PDF 导出 4/5 场景）/ 0% 测试 | ❌ 8 个 endpoint 无测试 |
| **岗位推荐** | 100% | — |
| **费曼教学** | 100% | 37/37 ✅ |

### 已知未完成 / 已知缺陷

审计于 2026-09-19，按严重度排列。

**✅ 已修复（2026-09-19）**

静默失败缺陷，均已修复并加验证：

| # | 问题 | 根因 | 修法 |
|---|---|---|---|
| 1 | `/resumes/new` 点保存**静默不保存却 toast「保存成功」** | 静态路由 `/resumes/new` 优先于 `/resumes/:id` 匹配，`useParams().id` 为空 → `isNew` 恒 false | 删掉 `App.tsx` 那条多余静态路由，让 `/resumes/:id` 以 `id="new"` 匹配（`ResumeEditor` 本就按此设计） |
| 2 | 模拟面试「再来一次」永远渲染「面试不存在」 | 跳 `/mock-interview/new`，该路由无 `:id` → 不触发 `fetchSession` | 按钮改跳 `/mock-interview`（列表页有 3 步开启向导），并删掉该无效路由 |
| 3 | `PUT /api/jd/analyses/:id` 重命名 title 静默失效 | `title` **不是表列**，由 `analysis_result["suggested_title"]` 派生，赋 `record.title` 只写了个 Python 属性 | 改为写回 `analysis_result` JSON 字段；新增 TC-JD-007/008 覆盖 |
| 4 | **所有 PDF 导出的中文都是乱码**（简历导出自 Phase 2 起一直如此） | 默认字体 `Helvetica` 是单字节 WinAnsi 标准字体，无中文字形；pdfkit 把码点截断成低字节（`中文测试` → `-‡KÕ`），不报错不警告 | 注册 `NotoSansSC` 并全量替换 `fontFamily`，详见「PDF 中文字体」 |
| 5 | 刷题「交卷」后结果页**答对 0 题、逐题无对错标注** | `quizStore.submitSession` 交卷后不重新拉取，`currentSession.answers` 还是交卷前的空数组 | `submitSession` 内补 `await get().fetchSession(sessionId)` |
| 6 | 出题**只按技能名联想，歧义技能出成别的技术**（技能 `harness` 出成了 Harness.io CI/CD 的题） | `quiz.py` 查了 `Skill` 对象却只取 `s.name`，`notes` 等语境字段全丢掉；prompt 里只剩 `涉及技能：harness` | 新增技能**备注必填**（前端表单拦截）；出题时用 `_skill_context()` 把备注作为唯一技能语境传给 AI，system prompt 要求先读备注定技术再出题 |

**✅ 已修复（2026-10-03）** —— 技能模块设计第 ① 步：自评 NULL 化（详见 `design/2026-10-03 技能模块设计纪要.md`）

`proficiency` 一个整数背了四种来源、其中两种是假的。修法是**让它能表示「没表态」**：

| # | 问题 | 根因 | 修法 |
|---|---|---|---|
| 7 | 新建技能表单**预填 `proficiency: 50`** —— 用户没拖过滑块也存成「自评 50」 | `SkillLibrary.tsx` 表单默认值写死 50；`SkillCreate.proficiency: int = 0` 让漏传变成 0 | 后端 `proficiency` 改 `nullable`（`NULL` = 未表态）；新建表单**整块删掉滑块**，新建即未验证；`SkillCreate.proficiency: Optional[int] = None` |
| 8 | **JD 导入的技能全是 0 分** —— 从没问过用户，却存成「自评 0 分」 | schema 默认 0 冒充用户表态 | 同上；`ai.py` 拼学习者背景时 `None` 不再渲染成 `技能熟练度 None/100` |
| 9 | `POST /proficiency-from-steps` 把**康奈尔笔记字数启发式**当自评写进 `skill.proficiency` | 该端点唯一职责就是回写，等于用词数冒充自评 | **整个端点 + `ProficiencyFromStepsRequest` + 前端调用一并删除**；笔记完成度只在前端本地算分展示，不落库 |

> UI：熟练度为 `null` 时表格显示「未验证」（muted），拖动滑块才变成真实自评。`FeynmanRoomList` 的「熟练度 N」同步改为「未验证 / 自评熟练度 N」。

> 残留：直接手输 `/mock-interview/new` 等非法 `:id` 会发一次 422（`Number("new")` → `NaN`）。无任何入口链接到这类 URL，页面会降级显示「面试不存在」。

**📋 功能缺口**

- **面试题库 PDF 导出：4/5 场景已实现，差「JD 复习卷」** — `REQUIREMENTS_v2.md` §2.7 的 5 个场景中，空白卷 / 考后含答案卷 / 技能复习卷已可用。**JD 复习卷做不了，因为没有任何题目会关联到 JD**：`QuizList.tsx` 出题时从不传 `jd_analysis_id`（全仓只有 `MockInterviewList` 在传），所以 `questions.jd_analysis_id` 恒为 NULL，`GET /api/questions?jd_analysis_id=` 永远返回空。要打通得先在出题表单加 JD 选择器
- **JD 详情「JD 专属题」Tab** — `REQUIREMENTS_v2.md` §2.5 要求，`JDAnalysis.tsx` 未消费 `/api/questions?jd_analysis_id=`（同上，无数据可展示）
- **没有 `DELETE /api/quiz/sessions/:id`** — 答题场次只能创建不能删，交卷后永久留在记录页。这也让"交卷流程"没法做可清理的 E2E
- **SECURITY.md P1/P2 一条未做** — JWT 认证、XSS 校验、Rate limiting、Helmet、HTTPS、CSP、备份、日志脱敏。当前 63 个接口**全部无鉴权**
- **PRD §10 的 6 个 Open Question 仍全 Open**，无埋点，PRD §6 成功指标无法验证
- **费曼教学没有正反馈（2026-10-03 记 · 待讨论）** — 整个环节全靠用户输出，AI 只回一句追问/纠正，用户讲完得不到任何"我做对了什么"的回报，长期劝退
- **费曼理解状态机判级不准（2026-10-03 记 · 待讨论）** — 实测「用户每说一句就升一级」，判据落在**发言推进**而非**内容推进**上。候选替代方案：按**知识点覆盖度**计分（AI 产出知识点清单 → 判定命中哪些 → 覆盖率即等级，未命中的自动成为缺口清单）

**🧹 技术债**

**✅ 已清（2026-09-19）**

| # | 问题 | 处理 |
|---|---|---|
| 1 | 死代码：`services/brightdata_service.py` 整文件废弃、`_default_learning_guide`、`_FromBossResponse`、`GenerateExamRequest`、`core/models/index.ts` 桶文件、空目录 `frontend/tests/e2e/` | 全部删除（删前逐个 grep 确认全仓零引用） |
| 2 | 幽灵依赖：`HighlightableMarkdown.tsx:3-7` 直接 import `unified`/`remark-parse`/`remark-rehype`，三者不在 package.json，靠传递依赖 hoist 才能编译 | 补进 `dependencies`（`^11.0.0`），lock 已同步 |
| 3 | 未用依赖：后端 `mcp`/`PyYAML`/`tqdm`/`httpx-sse`（Bright Data 集成残留）；前端 `marked`/`@testing-library/react`/`@testing-library/jest-dom` | 从 requirements.txt / package.json 移除，`npm install` 掉 19 个包 |
| 4 | 硬编码：`search.js:9` 写死 `C:/Users/27661/...` 绝对路径，换机器 `import()` 失败 → 静默降级成 AI 编的链接 | 改为运行时 `npm root -g` 解析；后端补 `else: logger.warning` 让搜不到时留痕 |
| 5 | 吞异常过宽：`connection.py` 三处 `except Exception: pass  # column already exists` | 收窄为 `except OperationalError`（实测 SQLite duplicate column 确实抛这个），写错表名/库被锁不再被吞 |
| 6 | `logs/ai_audit.log` 混入测试假数据（file handler 在 import 时即挂上） | `conftest.py` 加 session 级 autouse fixture 摘掉 handler，跑完还回去；实测跑测试日志字节数不变 |

> 历史遗留：`logs/ai_audit.log` 现有 120 行里仍混着旧测试数据（本次只堵住增量，未清存量）。要清直接删文件即可，日志无保留价值。

**残留（未处理）**

- 前端 bundle 单 chunk 2.16MB（gzip 691KB），Vite 已警告未做 code-split；`client.ts` 同时被静态+动态 import，动态那条不会分包

**📦 localStorage → 服务端迁移（2026-10-03 定 · 大项 · 未开工）**

学习数据散在浏览器 localStorage 是早期图快的产物，现在同时挡住三件事 —— **是一件事，不是三件**：

| 被挡住的功能 | 为什么被挡 |
|---|---|
| 笔记 AI 复盘（原「判卷」，见下） | 复盘需要提交动作；笔记现在是自动保存、无提交点，服务端拿不到原文 |
| 用户自输入知识点的语境拼接 | 边界/笔记不在服务端，prompt 拼不出上下文 |
| 技能仪表盘的证据聚合 | 笔记是最弱、但唯一免费的一条证据，现在只活在浏览器里 |

**要搬的 key**（定义在 `core/services/scoring.ts` + `web/components/LearningPanel.tsx`）：

- 必需：`cornell__{skillId}__step{n}`（笔记原文）、`explain_topics__{skillId}__step{n}`（知识点关键词）
- 缓存类，顺带搬可省 AI 调用：`topic__*`、`explain__*`、`cornell_prompts__*`、`sticky__*` / `_pos`
- `hl__*`（划词高亮）不在本次范围

**明确不做：向量数据库。** 单用户 / 13 技能 / 几十条笔记的量级，SQLite FTS5 或直接 `LIKE` 够用；上下文拼接要的是按 `skill_id` / `step` 取**结构化字段**，不是语义检索。等真出现「跨技能找相关笔记」的查询需求再议。

**约束**：不要造「上下文管理系统」抽象 —— 照 `backend/app/api/quiz.py::_skill_context()` 的做法按需拼字符串。

**📝 笔记「AI 判卷」要改名（2026-10-03 定）**

定位不是判分，是**让 AI 看你的答案、理解你的思路、指出思维模式上的不足**。连带要改：`ai_service.py::grade_essay_answer` 的 prompt（现为「面试评分专家」+ `{score, feedback, reference}`）和输出结构 —— 分数不是重点，**缺口清单**才是。

产出喂给仪表盘时属于 `AI 判定`（0.8）而非 `客观判分`（1.0）；因为线索问题没有标准答案，`reference_answer` 在笔记场景为空，是 AI 自产自销。

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
| **Phase 10** | 面试题库（AI 出题 + 刷题/考试双模式 + 45 分钟倒计时 + AI 判卷 + 答题记录）· JD 图片 OCR · JD by-url / from-boss | ✅ |
| **Phase 11** | 收尾加固：修 5 个静默失败 bug ✅ + 面试题 PDF 导出 ✅（4/5，见功能缺口）+ 清死代码/技术债 ✅ + 补 quiz/mock-interview 测试 ⬜（用户暂缓） | 🚧 进行中 |

### 文件清单

**后端 (10 个核心文件)**
- `backend/app/main.py` — FastAPI 入口，**10 个 router 挂载**
- `backend/app/api/` — **10 个路由模块** (health/resumes/templates/jd_analysis/skills/ai/jobs/quiz/mock_interview/feynman)
- `backend/app/models/` — **13 张 SQLAlchemy 表** (resume/template/jd_analysis/skill/job/quiz 3 张/mock_interview 2 张/feynman 3 张)
- `backend/app/schemas/` — 7 个 Pydantic schema 模块
- `backend/app/services/ai_service.py` — DeepSeek API (润色/分析/出题/面试/讲解/OCR) + 多 Agent 评审管线（Agent 基类 + 资深讲师/模拟用户评审 + review_pipeline 棘轮循环）
- `backend/app/services/job_service.py` — DeepSeek 联网搜索岗位 (web_search_20250305 工具 + 结构化解析)
- `backend/app/services/feynman.py` — 费曼教学核心（五级状态机 + 定级评估 + SSE 流式 + python-pptx 报告）
- `backend/app/services/audit.py` — AI 审计日志 + 防注入（L1 声明/定界符 + L2 注入检测，单点补丁配套）
- `backend/app/database/connection.py` — SQLite + async engine + session
- `backend/app/seed.py` — 3 套模板种子数据
- `backend/app/config.py` — Settings (DB/DeepSeek/CORS)

**前端 core 层 (13 个核心文件)**
- `frontend/core/api/` — HttpClient 接口 + FetchHttpClient 实现
- `frontend/core/models/` — 9 个模块 (resume/section/template/skill/jd/job/feynman/quiz/mockInterview)
- `frontend/core/stores/` — **6 个 Zustand store** (resumeStore / skillStore / jobStore / feynmanStore / quizStore / interviewStore)
- `frontend/core/services/` — 3 个服务 (resumeService / pdfService / highlights)

**前端 UI 层 (30 个核心文件)**
- `frontend/web/components/` — **18 个** (Layout / SectionForm / ResumePDF / QuizPDF / JDMatchTab / JobRecommend / JobDetailModal / HighlightableMarkdown / LearningPanel / FloatingNote / QuestionCard / VoiceRecorder / AIErrorBox / ConfirmDialog / AnimatedNumber / LoadingDots / EmptyIcons / LevelBadge)
- `frontend/web/pages/` — **13 个** (ResumeList / ResumeEditor / JDAnalysis / SkillLibrary / MockInterviewList / MockInterview / QuizList / QuizSession / QuizExam / QuizRecords / QuizRecordDetail / FeynmanRoomList / FeynmanRoom)
- `frontend/web/hooks/` — useEntrance / useHighlights
- `frontend/boss-extension/` — BOSS 直聘 Chrome 扩展 (manifest v3)
- `frontend/src/` — App.tsx (路由, 17 条) / main.tsx (入口)

**测试 (13 个文件)**
- `backend/tests/` — 11 个文件 (conftest + 10 个测试模块：health/resumes/templates/skills/jd_analysis/jobs/feynman/feynman_problems/review_pipeline/ai_audit)
- `frontend/tests/` — 8 个 vitest 测试文件 (api_client/models/resume_service/resume_store/skill_store/job_store/feynman_store/highlights)
- `frontend/e2e/` — 4 个 Playwright 规范 (8 个 test)

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
