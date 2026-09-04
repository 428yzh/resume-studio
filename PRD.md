# Resume Pro 简历管理 Web 应用 — 产品需求文档 (PRD)

##### **Document Instructions:**

> 本 PRD 是**沟通与对齐工具**，连接战略与执行，帮助团队围绕**真实用户问题**达成一致。它回答：**做什么**（产品目标）、**为什么**（对用户与业务的价值）、**如何衡量成功**（指标）。
>
> **Gap 标记约定**：🔶 **Assumption** = 基于推断/类比填写，未经验证；🔵 **Open Question** = 尚不知道，需调研。所有假设在确认前都是风险。

***

## Document Information

### Authors

- 产品经理（基于现有代码与 CLAUDE.md 归档整理）

### Reviewers

- 前端/后端开发负责人
- 设计

**Date:** 2026-08-02

### Change Log

| Version | Date       | Author     | Change Description         |
|---------|------------|------------|----------------------------|
| 0.1     | 2026-08-02 | 产品经理   | 依据现有实现反写的初始 PRD |

***

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Users & Personas](#3-target-users--personas)
4. [Strategic Context](#4-strategic-context)
5. [Solution Overview](#5-solution-overview)
6. [Success Metrics](#6-success-metrics)
7. [User Stories & Requirements](#7-user-stories--requirements)
8. [Out of Scope](#8-out-of-scope)
9. [Dependencies & Risks](#9-dependencies--risks)
10. [Open Questions](#10-open-questions)

***

## 1. Executive Summary

我们正在构建 **Resume Pro（简历管理 Web 应用）**，面向**正在求职的技术从业者（开发、测试、产品等）**，解决**简历无法针对性优化、与目标 JD 匹配度低、技能短板不清楚、面试准备缺乏系统训练**的问题，形成「写简历 → 对齐 JD → 补技能 → 模拟面试」的求职闭环，最终结果将是**提升简历投递的回复率与面试通过率，缩短求职周期**。

Resume Pro 是一个 SPA Web 应用：**模板化简历编写**（3 套模板、8 种区块、一键导出 A4 PDF）；**AI 润色**（DeepSeek SSE 流式逐字渲染，STAR 法则 + ATS 关键词增强）；**JD 分析与匹配度评估**（粘贴 JD 即得技术栈差距与学习方向）；**技能库**（熟练度、学习资源、复习题管理）；**模拟面试**（AI 面试官流式对话 + 实时评分 + 综合评价）；并支持 **PDF 简历导入**与 **BOSS直聘 Chrome 扩展一键采集 JD**。

- 🔶 **Assumption**：目标用户确认为「技术岗求职者」这一假设基于产品功能形态（技术栈分析、面试题、ATS 优化）推断，尚未经真实用户访谈验证。

***

## 2. Problem Statement

### Who Has This Problem?

- **技术岗求职者**：准备跳槽的社招工程师、应届毕业生，通过 BOSS直聘、智联、拉勾等平台海投简历。
- **跨行/转岗求职者**：技能与目标岗位有差距，需要明确「该学什么、学到什么程度」。
- **🔶 Assumption**：以上人群画像基于功能设计推断，未做用户访谈验证。

### What Is the Problem?

- 简历是「一次性文档」，写完就丢在一边，**不会针对不同 JD 迭代优化**；多数求职者简历普遍存在：描述空洞（无量化成果）、关键词不匹配 ATS 系统、与目标岗位技术栈错位。
- 求职者**不清楚自己与目标岗位的技能差距**，海投后石沉大海，只能靠猜哪里不足。
- 面试准备**缺乏系统训练**，没有针对目标 JD 的模拟演练与即时反馈。

### Why Is It Painful?

- **用户影响**：投递数十份简历回复率极低；面试失败后不知道差在哪；补技能方向盲目，浪费时间在非目标技能上。
- **业务/效率影响**（对求职者自身）：求职周期被拉长，错过招聘窗口；付费课程/简历代写成本高但效果不可验证。

### Evidence

- 🔶 **Assumption**：当前项目为**个人工具**，无埋点、无访谈、无客服数据。以下证据槽位均待建立：
  - **Interviews**：待执行（建议做 5-10 场求职者访谈）。
  - **Analytics**：待埋点（当前无激活/留存数据）。
  - **Support signals**：无。
  - **Customer quote**：无。

***

## 3. Target Users & Personas

### Primary Persona

- **Name**：求职中的前端工程师「小林」
- **Role**：3 年经验前端开发，准备跳槽到中大型互联网公司
- **Context**：个人开发者，技术栈 React/Vue；用过 BOSS直聘；没有 HR 人脉，全靠海投
- **Goals**：让简历更贴合目标岗位 JD；知道该补什么技能；面试前能演练技术问题
- **Pain points**：不知道简历为什么没回复；JD 里的技术栈有一半没接触过；面试紧张，表达不系统
- **Current behaviour**：用 Word/在线模板写一份通用简历海投；刷 LeetCode；搜索面经自行对照

### Secondary Personas

- **Name**：产品经理求职者「阿婷」
- **Role**：转岗/跳槽产品经理
- **Differs from primary**：JD 匹配更看重产品思维而非纯技术栈；技能库偏软技能+工具；模拟面试关注产品案例题
- 🔶 **Assumption**：产品岗作为次要 persona 基于现有「产品感面试题」模块推断。

### Jobs-to-Be-Done

- **Functional job**：在投递前，把简历改到「能通过 ATS 初筛」的程度；明确目标岗位的技能差距并按优先级补齐。
- **Emotional job**：求职过程有掌控感——知道每一步在优化什么，而不是玄学式等回复。
- **Social job**：在面试官/HR 面前展现出「匹配该岗位」的专业形象。

***

## 4. Strategic Context

### Business Goals

- **Strategic alignment**（个人项目定位）：将「简历 → JD → 技能 → 面试」四件本应串联的事情收敛到一个工具里，形成求职者自己的「求职作战台」。为后续可能的订阅制/求职社群产品打基础。
- **Revenue impact**：🔶 **Assumption**——暂无商业化模型；当前为个人效率工具，不产生直接收入。

### Market Opportunity (optional)

- **TAM**：🔶 **Assumption**——中国每年千万级求职者（含校招+社招+跨行）。
- **SAM**：🔶 **Assumption**——使用在线简历工具/求职 App 的人群（百万级）。
- **SOM**：🔶 **Assumption**——无法估算，无数据支撑。

### Competitive Landscape

- **Current alternatives**：
  - **超级简历 / 知页简历 / 五百丁**：模板 + 在线编辑 + PDF 导出，但 AI 深度、JD 对齐、技能学习能力弱。
  - **BOSS直聘/脉脉自带简历**：有投递与沟通过程，但简历优化与技能学习功能薄弱。
  - **ChatGPT 等通用 AI**：可润色，但无结构化简历数据、无 JD 差距分析、无技能库与面试闭环。
- **Our gap**：差异点是**「JD 匹配度分析 + 技能差距 → 学习路径 → 模拟面试」的完整闭环**，竞争对手多停留在「模板 + 润色」单点。

### Why Now?

- AI 能力（DeepSeek）已能稳定支撑流式润色与结构化解析，成本降到个人可负担。
- 求职者投递成本低但反馈闭环差——AI 原生地补上「为什么没回复 / 该补什么」这一环。
- 🔶 **Assumption**：以上两点是市场直觉，未做竞品定量调研。

***

## 5. Solution Overview

Resume Pro 以「简历」为中心数据，向外延展 JD、技能、面试三张网，全部围绕一份结构化简历（`sections` JSON）驱动。用户进入后看到四大一级导航：**简历管理 / JD 分析 / 技能库**，简历编辑器内另有 **AI 润色、预览、JD 匹配**三个标签页；另有独立**模拟面试**入口。

**核心闭环流程**：
1. **写简历**：从 3 套模板起步，按 8 种区块（基本信息/个人摘要/工作经历/教育背景/技能/项目/证书/语言…）编辑，AI 润色（STAR + ATS）后一键导出 A4 PDF。
2. **对齐 JD**：粘贴/上传（图片 OCR 或 BOSS直聘扩展）目标 JD → AI 提取技术栈与要求 → 自动导入技能库 → 与简历技能做**匹配度差距分析**。
3. **补技能**：技能库管理熟练度（0-100 滑块）；AI 生成学习计划与**学习指引**；学习面板内提供「知识点讲解 → 康奈尔笔记 → AI 判卷 → 复习题」的学习闭环。
4. **面试演练**：AI 面试官按目标 JD 流式提问 + 实时评分 + 综合评估。

### Key Features

| 模块 | 核心能力 |
|---|---|
| **模板化简历编写** | 3 套模板（经典专业/现代简洁/创意设计），8 种区块类型，通用表单（single/array 双模式 + 6 种字段），完成度评分 |
| **AI 润色** | SSE 流式逐字渲染，STAR 法则 + ATS 关键词增强，AbortController 取消 |
| **PDF 导入** | 上传 PDF → AI 解析为结构化 sections，旧格式自动迁移 |
| **JD 分析** | 粘贴/图片 OCR/扩展采集 → 技术栈提取 → 自动导入技能库 → 匹配度差距分析 → 学习路径 + 面试题 |
| **技能库** | 技能 CRUD、分类筛选、熟练度滑块、学习资源 + 面试题关联 |
| **学习面板** | 知识点讲解（按 step_type 切换框架）、康奈尔笔记、AI 判卷、复习题、学习计划 |
| **模拟面试** | AI 面试官（按 JD 上下文 + 难度自适应 + 实时评分）流式对话、综合评价 |
| **测验/题库** | 刷题模式 + 考试模式，AI 生成选择题/多选题/问答题 |
| **BOSS直聘集成** | Chrome 扩展一键从 BOSS直聘采集 JD 到本应用 |

### User Flows / Wireframes (optional)

- 主路由：`/resumes`（列表）→ `/resumes/:id`（编辑器：编辑/AI 润色/预览/JD）→ `/jd` → `/skills` → `/mock-interview`、`/quiz/*`。
- 🔵 **Open Question**：UI 线框图尚未沉淀为独立文档（可后续用设计稿补齐）。

### Story Map (optional)

- 已按 **Phase 1–5** 实现完成：编辑器/技能库/JD 分析 → AI 润色/PDF 导出 → Docker/E2E → BOSS直聘 → 模拟面试。🔵 **Open Question**：是否拆分为更细的 release 切片待定。

***

## 6. Success Metrics

> 🔶 **Assumption**：以下全部指标当前**无埋点、无基线**，为设计目标而非已测量数据。上线前需建立 instrumentation。

### Primary Metric

- **Metric**：求职者**简历完成率**（新建简历 → 完成 ≥80% 区块并导出 PDF 的比例）——衡量「写简历」环节是否顺畅。
- **Current**：未知（未埋点）。
- **Target**：≥60%（🔶 Assumption）。
- **Timeline**：功能上线后 30 天。

### Secondary Metrics

- **AI 润色使用率**：润色次数 / 简历编辑会话数（目标 ≥40%）。
- **JD 分析 → 技能导入转化率**：完成 JD 分析后实际导入 ≥1 个技能的比例（目标 ≥50%）。
- **学习面板留存**：打开知识点讲解后完成 ≥1 次康奈尔笔记/判卷的比例。
- **模拟面试完成率**：开始面试 → 完成 ≥3 轮对话的比例。

### Guardrail Metrics

- **导出 PDF 成功率**：不应因新增 AI 功能而下降（保持 ≥99%）。
- **核心编辑性能**：编辑器输入无明显卡顿（打字延迟 <100ms）——AI 功能不得拖慢基础编辑体验。

***

## 7. User Stories & Requirements

### Epic Hypothesis

> 我们相信，为求职者提供「简历 → JD 匹配 → 技能补齐 → 模拟面试」的闭环工具，能提升其简历投递回复率与面试通过率，因为当前求职者缺乏针对性的反馈与训练路径。我们将以「简历完成率 + JD 分析到技能导入转化率」作为成功度量（🔶 Assumption：基线待埋点）。

### User Stories

**Story 1：模板化简历创建与编辑**

As 求职者小林, I want 从模板快速创建简历并按区块编辑, so that 不用从空白页开始写。

**Acceptance Criteria:**
- [ ] 可从 3 套模板中选择创建简历，模板预填结构（sections）
- [ ] 支持 8 种区块类型的新增/删除/排序，每个区块表单按字段类型渲染
- [ ] 编辑实时保存到后端，刷新不丢失
- [ ] 展示简历完成度（已填区块/必填字段百分比）

**Story 2：AI 润色简历段落**

As 小林, I want 让 AI 按 STAR 法则和 ATS 关键词润色我的经历描述, so that 简历更有量化成果、更容易过初筛。

**Acceptance Criteria:**
- [ ] 选择单区块可流式润色（SSE 逐字渲染，可中止）
- [ ] 支持全文润色
- [ ] 润色结果可一键采用/取消
- [ ] DeepSeek 不可用时显示「AI 服务暂不可用」并提供「重新生成」按钮（不阻断编辑）
- [ ] 润色不改变区块结构与原有排序

**Story 3：JD 分析与匹配度评估**

As 小林, I want 粘贴目标 JD 后看到技术栈要求和我的差距, so that 知道该补哪些技能。

**Acceptance Criteria:**
- [ ] 粘贴 JD（文本/图片 OCR/BOSS直聘扩展采集）→ AI 提取技术栈、岗位要求、经验年限
- [ ] 分析结果自动将技术栈导入技能库（可勾选）
- [ ] 与简历现有技能做匹配度计算，展示「已匹配 / 缺失 / 建议学习」差距列表
- [ ] 分析记录可保存、历史回看、删除
- [ ] AI 降级时显示错误提示 + 重新分析按钮

**Story 4：学习路径与学习面板**

As 小林, I want 对每个差距技能生成学习计划和逐知识点讲解, so that 补技能有方向、可执行。

**Acceptance Criteria:**
- [ ] 技能库可生成/查看 AI 学习计划（按掌握程度分档：了解/熟悉/精通）
- [ ] 学习面板：知识点讲解（按 step_type 适配概念/工具/阅读框架）+ 推荐资源链接
- [ ] 康奈尔笔记（线索/笔记/总结三段式）自动保存
- [ ] AI 判卷 + 追问 + 复习题闭环
- [ ] 所有 AI 生成内容在服务不可用时显示错误态 + 重试按钮，降级文案不得当作正常内容渲染

**Story 5：模拟面试**

As 小林, I want 与 AI 面试官进行针对目标 JD 的模拟面试并获得评分, so that 面试前能系统演练。

**Acceptance Criteria:**
- [ ] 按目标岗位 + JD 上下文开启面试，AI 流式提问
- [ ] 回答后实时评分（X/10）与评语
- [ ] 难度自适应升降级
- [ ] 结束后生成综合评估
- [ ] AI 不可用时显示错误提示并可重试发送（不得把降级文案当面试官回复）

**Story 6：技能库管理**

As 小林, I want 管理技能、熟练度和关联资源, so that 学习进度可追踪。

**Acceptance Criteria:**
- [ ] 技能 CRUD、分类筛选、熟练度滑块（0-100，持久化到后端）
- [ ] 每个技能关联学习资源 + 面试题（增删改查）
- [ ] 熟练度可从学习步骤得分自动推算

### Constraints & Edge Cases

- **Technical constraints**：前端 SPA（React+Vite+Tailwind v4）零部署，后端 FastAPI + SQLite 异步；端口约束（后端 8001 / 前端 5173）；DeepSeek API 为外部依赖，须有降级路径。
- **Edge cases**：
  - 所有 AI 功能在 `DEEPSEEK_API_KEY` 未配置或限流时，返回降级文案 → 前端必须识别并显示错误态 + 重试（已实现共享 `isUnavailable` 机制）。
  - 大文本（JD 全文 / 长简历）流式传输的性能与内存。
  - PDF 导入：非 PDF / 扫描图 OCR 失败 → 明确报错。
  - 并发请求（多个技能同时生成学习指引）需串行或限制。

***

## 8. Out of Scope

### Not Included in This Release

- **多端/移动端适配**：当前为桌面 Web SPA（编辑 PDF 导出 A4 的桌面体验优先）。
- **账号体系与多用户协作**：当前为单机本地 SQLite，无登录/多人协同。
- **AI 代写整份简历**：AI 只做润色/解析，不凭空生成整份简历。
- **求职社区/问答**：不做 UGC 社区。
- **付费/订阅商业化**：暂不做。
- **ATS 真机投递**：仅优化简历内容，不实际投递。

### Future Considerations

- 移动端适配；多账号云同步；面试录音转写；更多 JD 平台扩展（猎聘/拉勾）。

***

## 9. Dependencies & Risks

### Dependencies

- **Technical**：
  - DeepSeek API（OpenAI 兼容 SDK）——润色、分析、讲解、判卷、面试全链路依赖，须有**降级路径**（已实现）。
  - SQLite + aiosqlite（异步，本地文件，无需外部部署）。
  - @react-pdf/renderer（PDF 导出）、Playwright（E2E）。
- **External**：
  - BOSS直聘 Chrome 扩展依赖站点 DOM 结构，站点改版可能导致采集失效。
  - PDF 解析/图片 OCR（tesseract）质量依赖上传文件清晰度。
- **Team**：🔶 **Assumption**——当前为个人开发，无跨团队依赖。

### Risks & Mitigations

- **Risk**：DeepSeek API 不可用/限流/超时导致核心 AI 功能瘫痪。
  - **Mitigation**：全链路 AI 降级（错误文案识别 → 错误态 + 重试按钮）；本地缓存 AI 结果（localStorage）；默认数据兜底（学习计划/题库等）。
- **Risk**：SSE 流式连接中断，用户以为卡死。
  - **Mitigation**：AbortController 取消；超时兜底；错误提示 + 重新生成。
- **Risk**：BOSS直聘页面改版，扩展采集失效。
  - **Mitigation**：提供手动粘贴/图片 OCR 双通道，扩展失败不影响核心流程。
- **Risk**：AI 内容幻觉（推荐链接为虚构、知识讲解有误）。
  - **Mitigation**：资源推荐优先走真实搜索（websearch-deepseek）；讲解内容标注来源；用户可添加真实资源覆盖。
- **Risk**：无埋点导致无法验证产品假设。
  - **Mitigation**：接入基础前端埋点，先建立 Section 6 指标的基线。

***

## 10. Open Questions

| Question | Owner | Deadline | Status |
|----------|-------|----------|--------|
| 目标用户是否确认为技术岗求职者？是否需要产品/运营岗纵深？ | 产品 | 发布前 | 🔵 Open |
| 商业化形态（免费/订阅/求职服务引流）？ | 产品 | 发布前 | 🔵 Open |
| 是否需要账号与云同步？本地 SQLite 会限制多设备使用。 | 技术 | Phase 6 立项时 | 🔵 Open |
| 简历与 JD 的「匹配度分数」算法口径（当前为规则计算，是否引入 AI 打分）？ | 产品+技术 | 发布前 | 🔵 Open |
| 是否需要埋点基础设施（当前无任何分析）？ | 技术 | 发布前 | 🔵 Open |
| BOSS直聘扩展是否需通过应用商店审核，还是侧载发布？ | 产品+技术 | 扩展发布时 | 🔵 Open |

***

## PRD Self-Assessment

### Strongest Section

- **Section 5 & 7**：解决方案与需求均基于已完整实现的代码（Phase 1–5 全量交付，45 项测试），功能边界与验收标准清晰、可验证。

### Weakest Section

- **Section 6（Success Metrics）与 Section 2（Evidence）**：当前产品无埋点、无用户访谈，所有指标与问题证据均为 🔶 Assumption，是最薄弱且最需补强的部分。

### Top Assumptions to Validate

| # | Assumption | Section | Risk if Wrong | Proposed Validation |
|---|------------|---------|---------------|---------------------|
| 1 | 目标用户是技术岗求职者且痛点真实 | 2/3 | 做错方向，功能不匹配真实需求 | 5-10 场求职者访谈（Mom Test） |
| 2 | 「JD 匹配→技能补齐→面试」闭环是差异化价值 | 4 | 竞品已覆盖或被 ChatGAT 平替 | 竞品深度评测 + 用户对比测试 |
| 3 | AI 降级兜底能保证核心编辑可用 | 9 | 高频 AI 调用导致体验割裂 | 压力测试 + 降级场景 QA |
| 4 | 简历完成率可作为主指标 | 6 | 完成率高但投递转化低，指标失真 | 先埋点验证相关性 |

### Recommended Next Step

- **为 Section 6 建立埋点基线**，并启动 5-10 场求职者访谈验证 Section 2/3 的核心假设。在拿到真实数据前，本 PRD 的指标与证据部分保持 🔶 Assumption 状态，不宜据此做重大方向决策。

***

*End of PRD*
