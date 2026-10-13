# TEST_PLAN.md — 简历管理应用测试计划

## 测试层级

| 层 | 策略 |
|----|------|
| P0 冒烟 | 核心 API 流程、简历 CRUD、模板加载、Store 基础 |
| P1 回归 | 编码兼容、边界条件、loading 状态、级联操作 |
| P2 边界 | 特殊字符、大文本、空状态 |

## 测试目录结构

```
tests/
├── TEST_PLAN.md
├── backend/
│   ├── conftest.py
│   ├── test_health.py
│   ├── test_resumes.py
│   ├── test_templates.py
│   ├── test_jd_analysis.py
│   ├── test_skills.py
│   ├── test_ai_service.py
│   ├── test_jobs.py
│   ├── test_feynman.py
│   ├── test_feynman_problems.py
│   └── test_review_pipeline.py
└── frontend/
    ├── test_api_client.ts
    ├── test_models.ts
    ├── test_resume_store.ts
    ├── test_skill_store.ts
    ├── test_job_store.ts
    ├── test_highlights.ts
    ├── feynman_store.test.ts
    └── e2e/
        ├── resume.spec.ts
        └── jd_analysis.spec.ts
```

## 后端测试用例

### TC-HEALTH 系列
- TC-HEALTH-001: GET /health 返回 200 + 状态 ok

### TC-RESUME 系列
- TC-RESUME-001: POST /api/resumes 创建简历
- TC-RESUME-002: GET /api/resumes 列出简历
- TC-RESUME-003: GET /api/resumes/:id 获取详情
- TC-RESUME-004: PUT /api/resumes/:id 更新简历
- TC-RESUME-005: DELETE /api/resumes/:id 删除简历
- TC-RESUME-006: POST /api/resumes/:id/export 导出 PDF

### TC-TEMPLATE 系列
- TC-TEMPLATE-001: GET /api/templates 列出模板
- TC-TEMPLATE-002: GET /api/templates/:id 获取模板详情

### TC-JD 系列
- TC-JD-001: POST /api/jd/analyze 分析 JD
- TC-JD-002: GET /api/jd/analyses 列出分析记录
- TC-JD-003: GET /api/jd/analyses/:id 获取分析详情
- TC-JD-004: POST /api/jd/analyze-image 未上传文件返回 422
- TC-JD-005: POST /api/jd/analyze-image 非图片文件返回 400
- TC-JD-006: POST /api/jd/analyze-image 空白图片 OCR 失败返回 400
- TC-JD-007: PUT /api/jd/analyses/:id 重命名 title 真正落库（回归：title 由 analysis_result 派生，非独立列）
- TC-JD-008: PUT /api/jd/analyses/:id 不存在的记录返回 404
- TC-JD-009: 出题带 jd_analysis_id → prompt 拿到 JD 的**内容**（岗位 + 技术栈（含 required_level）+ 原文截断）；题目落 jd_analysis_id，JD 详情按它筛得到（回归：曾经只把 id 这个数字拼进 prompt，「JD 专属题」= 普通题挂外键）

### TC-SKILL 系列
- TC-SKILL-001: POST /api/skills 创建技能
- TC-SKILL-001b: 不带 proficiency 创建 → NULL（未表态），不是 0
- TC-SKILL-002: GET /api/skills 列出技能
- TC-SKILL-003: PUT /api/skills/:id 更新技能
- TC-SKILL-004: DELETE /api/skills/:id 删除技能

### TC-NOTE 系列（笔记搬服务端，test_skills.py）
- TC-NOTE-001: 存了能原样读回来（中文不坏）；没存过是空列表
- TC-NOTE-002: 同一块内容是**覆盖**不追加（自动保存每次落库不该攒副本）；换一块是新增
- TC-NOTE-003: 删技能笔记跟着走 —— 直接数表验证 FK 级联（走端点会「技能不存在也返回空列表」，测不出来）

### TC-GRAPH 系列（知识图谱，test_knowledge_graph.py）
- TC-GRAPH-001: 合格树通过校验（4 顶层 × 4 子 = 20 节点）
- TC-GRAPH-002: 顶层节点数越界（<4 或 >6）被拦
- TC-GRAPH-003: 子节点数越界（每节点 1 个）被拦
- TC-GRAPH-004: **超过 3 层被拦**（父节点累加会算错，结论 13/14）
- TC-GRAPH-005: 每层合法但总量超标（124 节点）被拦
- TC-GRAPH-006: children 写成 null/字符串时计数不炸
- TC-GRAPH-007: id 按位分配（1 / 1.2 / 1.2.3），分数落点要稳
- TC-GRAPH-008: 三层 id 嵌套
- TC-GRAPH-009: title 去空格 + 丢弃非 dict 的 children
- TC-GRAPH-010: 端点往返 —— 未生成返回 null / 生成后落库可读 / 中文标题原样 / 不存在 404
- TC-GRAPH-011: 空图谱不落库（失败态不污染持久化）

### TC-PLAN 系列（学习计划 = 图谱切分，结论 8/9）
- TC-PLAN-001: 覆盖完整通过 —— 一一对应 / 合并成更少单元（了解档）都合法
- TC-PLAN-002: **漏掉顶层节点被拦**（那块知识永远不会被安排学）
- TC-PLAN-003: 多个单元重复覆盖同一节点被拦
- TC-PLAN-004: 引用子节点 id（"1.2"）被拦 —— 会让分数落点错位
- TC-PLAN-005: 空 node_ids / 非 dict 的 step 不炸
- TC-PLAN-006: `_render_graph_for_prompt` 带 id 缩进渲染（切分依据是 id，id 必须进 prompt）
- TC-PLAN-007: 端点 —— 无图谱 409；有图谱时把树传给切分函数并落库

### TC-BLOCK 系列（单元的内容边界，结论 10）
- TC-BLOCK-001: `_find_nodes` 命中顶层节点时连子树一起取（单元概述要讲的是整块）
- TC-BLOCK-002: 多个 id 按图谱顺序返回，不按入参顺序（了解档合并单元）
- TC-BLOCK-003: 能在第二层命中（深入讲解入口传的是子节点 id）
- TC-BLOCK-004: 找不到返回空数组；非 dict 节点不炸
- TC-BLOCK-005: 端点自己从技能图谱取块（前端只报 id）—— 缩进/id 顺序正确；不报 id 时 `graph_block` 为空，退回自由发挥

### TC-SCORE 系列（分数落回图谱节点 ⑥，test_scoring.py）
- TC-SCORE-001: 叶子节点的分 = 答过的题的 0-100 平均
- TC-SCORE-002: 设计稿算例 —— 六个顶层块 30/70/90/15/40/20 → 技能级 44；子节点全满分 → 父节点满分
- TC-SCORE-003: 未测的子节点不摊进平均、不显示为 0（「没学过」≠「学得差」）
- TC-SCORE-004: 子节点全没测 → 退回父节点自己的直接证据（单元级出题的落点不能丢）
- TC-SCORE-005: 全没测 → 全是 None（界面画虚线，不是 0 分）
- TC-SCORE-006: 三层自下而上累加；`round` 取偶（52.5 → 52）
- TC-SCORE-007: 出题报单元块 → 块（带 id）进 prompt，AI 标的 node_id 落库，编的 id 清空
- TC-SCORE-008: 答完一对错 → GET 图谱带分（未测 null）；**按 skill_id 筛题不再永远为空**（回归：`LIKE '%"id"%'` 查数字 JSON 数组匹配不到）
- TC-SCORE-009: 普通刷题不带节点 → node_id 空，不落分
- TC-SCORE-010: 技能没有图谱却报了 node_ids → 不炸、块为空、id 清空
- TC-SCORE-011: 跨来源取最深那条不平均（费曼 > 刷题 > 笔记），同来源内才平均
- TC-SCORE-012: 列表/PUT/POST 响应带 `graph_summary`（卡片正面 4.1 的数字全部来自服务端这一份）—— coverage 只数**直接证据**（`own`）：父节点的分是子节点算上来的，不算被测过，否则覆盖率虚高；单元数取学习计划；没图谱 → `graph_summary` 为 None
- TC-SCORE-013: 交卷时 AI 评分挂掉 → `ai_score` 存 null（未测≠0）—— 回归：曾存 0，把「没评到」冒充成「AI 判了 0 分」
- TC-SCORE-014: 多选题 AI 写的 `"A, C"`（带空格）→ 用户 `"C,A"` 仍判对（选项字母归一化后集合比对；生成 prompt 也补了 multi_choice 返回示例 + 无空格约束）

### TC-AUDIT 系列（AI 审计日志 + 防注入，test_ai_audit.py）
- TC-AUDIT-001: 一次调用落一行 —— feature/status/token/全文 response；L1 加固（system 声明 + `<user_input>` 包裹）
- TC-AUDIT-002: **feature 取调用方函数名**，跳过共同帧（`Agent.call`：图谱/计划/讲解/复盘；`_chat_json`：费曼定级/覆盖度。不跳则全记成共同帧名，等于没打标签）
- TC-AUDIT-003: **duration_ms 单位是毫秒**（曾经又乘了 1000，13 秒的调用记成 13125000）
- TC-AUDIT-004: 调用抛错 → status=error + error 落库
- TC-AUDIT-005: 注入模式命中 → injection=1，内容仍被定界符包裹（数据化，不拦截）
- TC-AUDIT-006: 流式调用消费完才打点，usage 取最后 chunk

### TC-JOB 系列（岗位推荐）
- TC-JOB-001: GET /api/jobs 无数据时返回空列表
- TC-JOB-002: POST /api/jobs/refresh 搜索失败时保留旧岗位
- TC-JOB-003: POST /api/jobs/refresh 搜索成功替换旧岗位
- TC-JOB-004: GET /api/jobs 返回已缓存岗位
- TC-JOB-005: build_search_query 汇总多份简历画像
- TC-JOB-006: build_search_query 无简历时返回默认搜索词
- TC-JOB-007: _parse_jobs_json 解析带代码块的 JSON
- TC-JOB-008: _parse_jobs_json 无效输出返回空列表

### TC-FEYN 系列（费曼教学 · 数字学生）
- TC-FEYN-001: clamp_level 上升最多 +1（禁跳级，L5 需先到 L4）
- TC-FEYN-002: clamp_level 下降最多 -1（发现错误回落）
- TC-FEYN-003: apply_budget 广度/深度追问扣预算
- TC-FEYN-004: apply_budget 无预算时不再扣减
- TC-FEYN-005: resolve_action 动作与等级对齐
- TC-FEYN-006: resolve_action 等级钳制后动作回退默认
- TC-FEYN-007: resolve_action 预算用尽退化为重构/完成
- TC-FEYN-008: POST /api/feynman/topics 创建房间（level=1, 预算=2）
- TC-FEYN-009: GET /api/feynman/topics 房间列表
- TC-FEYN-010: GET /api/feynman/topics/:id 房间详情
- TC-FEYN-011: DELETE /api/feynman/topics/:id 删除房间
- TC-FEYN-012: POST message SSE 定级 + 流式回复，AI 消息带等级徽章
- TC-FEYN-013: POST message 等级钳制（提议跳级被限）
- TC-FEYN-014: POST message 广度追问消耗预算
- TC-FEYN-015: POST message AI 不可用降级（等级不假装提升）
- TC-FEYN-016: POST /report 生成 pptx + 房间转 completed
- TC-FEYN-017: 讲错 → 强制降级 + correction 动作 + 记薄弱点（不耗预算）
- TC-FEYN-018: 达 L5 → depth_question 消耗深度预算
- TC-FEYN-019: POST /problems 手动添加问题（open）
- TC-FEYN-020: POST /problems 空 content → 400 / 房间不存在 → 404
- TC-FEYN-021: PUT /problems/:id 标记解决（resolved_at 写入）/ 重开（清空）
- TC-FEYN-022: PUT /problems/:id 非法 status → 400 / 不存在 → 404
- TC-FEYN-023: DELETE /topics/:id 级联删除问题；列表 has_problems 标记；详情含 problems
- TC-FEYN-024: POST message 零卡点轮自动解决 open 问题；有 blind_spot 时保留
- TC-FEYN-025: level_from_coverage 分档（0→L1 / 2-5→L2 / 3-5→L3 / 4-5→L4 / 5-5→L5；total=0 → L1）
- TC-FEYN-026: sanitize_covered 只认点单里的 id，按点单顺序去重（AI 编的 id 一律清掉）
- TC-FEYN-027: **覆盖度驱动等级 + 无进展冻结** —— 覆盖率涨了才动等级（提议 L5 也被禁跳级钳到 +1）；覆盖集合没变的轮次等级原地不动（根治「每说一句就升一级」）
- TC-FEYN-028: 技能无图谱 → 点单为空，退回旧的「AI 提级」路径（老房间零破坏）
- TC-FEYN-029: 报告携带未覆盖知识点（进 PPT 薄弱点页，指向下一步）
- TC-FEYN-030: AI 判定不可用的轮次（`_coverage_fallback`）→ 累计覆盖/等级原地不动，未解决问题不被清 —— 回归：兜底曾返回 `covered: []`，一次 AI 抖动清空覆盖、等级按「0/4 覆盖」拉回，且 error/blind_spot 全空被当「零卡点」把未解决问题全自动解决
- TC-STORE-FEYN-001: FeynmanStore fetchTopics 加载列表
- TC-STORE-FEYN-002: FeynmanStore createTopic 创建房间
- TC-STORE-FEYN-003: FeynmanStore deleteTopic 删除房间
- TC-STORE-FEYN-004: FeynmanStore fetchTopic 加载详情
- TC-STORE-FEYN-005: FeynmanStore sendMessage SSE 定级流式（含失败态 / 无 done 帧收尾 / 房间隔离）—— 流结束没收到 done 帧也要复位 `isStreaming`（曾永久卡流式态，下一条发不出去），半截回复留成 AI 消息
- TC-STORE-FEYN-006: FeynmanStore addProblem 手动添加问题
- TC-STORE-FEYN-007: FeynmanStore setProblemStatus 标记解决 / 重开

## 前端测试用例

### TC-MODEL 系列
- TC-MODEL-001: Resume 接口结构正确
- TC-MODEL-002: Template 接口结构正确
- TC-MODEL-003: Skill 接口结构正确
- TC-MODEL-004: JDAnalysis 接口结构正确
- TC-MODEL-005: `findNodes` 从图谱取单元分到的那块 —— 带子树 / 按图谱顺序 / 二层命中 / 找不到是空数组（镜像后端 `_find_nodes`）
- TC-MODEL-006: `unitKeyOf` 笔记归属键 —— 有节点 id 用 `"4,5"` / `"2"`，老计划退回 `"step7"`（前后端同一个约定）

### TC-REV 系列（多 Agent 评审管线，test_review_pipeline.py）
- TC-REV-001: 三个生产生成入口（学习指引 / 学习计划 / 知识点讲解）都必须传 `max_rounds=1` —— 回归：曾全部没传，`review_pipeline` 默认 0 = 评审不过也不重试，「反馈注入重写 + 棘轮回滚」在生产从未跑过

### TC-CHAT 系列（问一问 · 每单元会话，test_skill_chat.py —— 由 TC-REVIEW 改写，2026-10-10）
> 复盘并入开场（结论 5）：打开 = `messages: []` 的特殊请求，AI 先读笔记做轻点评 + 指不足，不判分、不落库（结论 27 不变）。
> 结构化的 level/gaps 输出随 JSON 单包协议一起删（格式一漂全丢，实证见会议记录）；改成对话后没有 JSON 可漂。
> SSE 事件：`{content, done}` 逐字块，收尾 `{content: "", done: true}`；失败在收尾事件带 `error`。
- TC-CHAT-001: 开场（`messages: []`）→ SSE 流；交给 AI 的是【技能备注】+【这块的图谱（带 id）】+【笔记三栏原文】，块外的节点不进内容边界
- TC-CHAT-002: 这块没写过笔记 → 400（门槛保持：不拿空笔记去烧 AI 调用）
- TC-CHAT-003: 技能不存在 → 404
- TC-CHAT-004: 语境实时（结论 10）—— 两轮之间把笔记改成新内容，第二轮 prompt 用的是新笔记原文
- TC-CHAT-005: 对话历史进 prompt（`ai`→`assistant` 映射）；超上限只带最近 `_CHAT_HISTORY_LIMIT` 条
- TC-CHAT-006: 老计划（`step7`，没有图谱）也能问，块为空串、不炸
- TC-CHAT-007: AI 不可用 → 仍 200 SSE，收尾事件带 `error`（不编内容、不是 500）
- TC-CHAT-008: 流中途异常 → 已吐出的 chunk 保留 + 补一个 `error` 事件（前端据此保留半截文字，结论 19）
- TC-CHAT-009: `_render_cornell` —— 三栏拆开带栏名（空栏不占位，别让 AI 以为用户写过总结）；解不开的 JSON 原样透传不丢内容

> UI 层（入口两态 + 对话抽屉）无自动化用例：跑一次要真出图谱 + 真学习计划 + 真 AI 开场，塞进 E2E 又慢又要 key。
> 老复盘版已手工验证过一遍（抽屉渲染 L1 徽章 + 思路点评 + 缺口卡片）；问一问版待冒烟：开场轻点评 → 追问 → 中途断流保留半截 → 重试。

### TC-GRAPH-VIZ 系列（知识图谱网状图，knowledge_graph.test.ts）
- TC-GRAPH-VIZ-001: `KnowledgeGraph.layout` 径向布局 —— 节点全摆上、每个节点一根线连回父节点、全落在画布内、空图谱返回空（不引 d3，位置全靠角度算，算歪只会画到画布外、不报错）

### TC-SCORE-VIZ 系列（分数地图，score_map.test.ts）
- TC-SCORE-VIZ-001: `tierOf` 五档边界（≥75 / 50-74 / 25-49 / <25 / null=未测；0 是「测过全错」不是未测）
- TC-SCORE-VIZ-002: `skillTotal` 只数有分的顶层块（未测不按 0 算）；全未测 → null；四块满分 → 100
- TC-SCORE-VIZ-003: `statusOf` 卡片四态（设计 4.1）—— 无图谱/空图谱 → none；覆盖不到一半 → untested（样本太少，先别提分数）；过半覆盖 + 最低块 <25 → gap，≥25 → ok；一块都没测出分（lowest null）→ ok 不误报缺口

> UI 层（掌握度/结构切换、步骤卡「考一考」按钮）无自动化用例：要真图谱 + 真 AI 出题才跑得起来。
> 已用真实 AI 手工跑通一遍（临时技能 → 图谱 5 顶层 → 单元 1 出 3 题挂 1.1/1.2/1.3 →
> 2 对 1 错 → 三个子节点 100/0/100、父节点 67、其余顶层 null）。

### TC-ELAPSED 系列（等待计时器，elapsed_time.test.ts）
- TC-ELAPSED-001: `formatElapsed` 秒/分格式 —— <60 只报秒、≥60 报「M 分 S 秒」（0/59→秒，60→"1 分 0 秒"，61→"1 分 1 秒"，3725→"62 分 5 秒"）

> 计时锚点（`startedAt` = 请求发出时刻，收起再展开不归零）无自动化用例：靠 store/面板处的一行时间戳 + 代码注释约束，手工冒烟。

### TC-DOCX 系列（导出 Word，docx_service.test.ts）
- TC-DOCX-001: 区块 → 通用块（`resumeToDocBlocks`）—— header 独立成姓名/求职意向/联系方式一行；正文区块带小标题；空/坏数据/未知区块不出块也不炸（未填区块不占标题）
- TC-DOCX-002: 经历在职显示「至今」；描述按换行拆段（docx 的 TextRun 不渲染 `\n`，必须拆成独立段落）
- TC-DOCX-003: 技能/语言熟练度翻中文 + 一行顿号连接；教育/项目/证书的日期与补充信息拼 meta
- TC-DOCX-004: 打包真的出 `.docx`（zip 魔数 PK）；空简历走「暂无内容」不炸

> 下载动作（`URL.createObjectURL` + `a.click()`）无自动化用例：浏览器 API，靠手工冒烟。
> docx 走动态 import 独立 chunk（391KB），只点「导出 Word」时才拉取。

### TC-E2E 系列（Playwright，frontend/e2e/skills.spec.ts）
- TC-E2E-SKILLS-001（重挂回归，2026-10-08）：触发一次纯本地 state 重渲染（开/关添加表单），断言先前捕获的卡片 DOM 节点 `isConnected` 仍为 true。内联组件定义（组件体内写 `function SkillCard`）会让父级每次重渲染换掉组件类型 → 整张网格卸载重挂 → 卡片入场动画重播 = 「一打字整页刷新」；重挂则旧节点 detach，断言失败。

### TC-STORE 系列
- TC-STORE-RESUME-001: ResumeStore 创建简历
- TC-STORE-RESUME-002: ResumeStore 更新简历区块
- TC-STORE-RESUME-003: ResumeStore 切换模板
- TC-STORE-SKILL-001: SkillStore 添加技能
- TC-STORE-SKILL-002: SkillStore 更新熟练度
- TC-STORE-SKILL-003: SkillStore 按分类筛选
- TC-STORE-SKILL-004: generateLearningPlan AI 降级返回 → 退回输入表单 + 报错可重试；正常返回 → 设置计划
- TC-STORE-JOB-001: JobStore 读取岗位缓存
- TC-STORE-JOB-002: JobStore 刷新岗位
- TC-STORE-JOB-003: isJobsStale 岗位缓存过期判断
- TC-STORE-CHAT-001: ChatStore open 开场 —— 发 `messages: []`、流式收字落成 AI 消息、opened=true
- TC-STORE-CHAT-002: 已开过的单元再 open **零请求**（每单元单例，点开不重载——结论 2/16）
- TC-STORE-CHAT-003: 每单元隔离 —— `{skill}__{unit}` 两个会话互不干扰
- TC-STORE-CHAT-004: 开场失败 → error 置位、无残留半截；retry 重发开场成功（结论 18）
- TC-STORE-CHAT-005: 回复中途断 → 保留半截 AI 文字 + error；retry 重发该轮、半截被替换不重复追加（结论 19）
- TC-STORE-CHAT-006: ask 追加 user 消息，请求体带对话历史（截断后）

### TC-HL 系列（划词高亮）
- TC-HL-001: applyHighlights 基础匹配/多处高亮
- TC-HL-002: 最长优先匹配 + 重叠区间处理
- TC-HL-003: 边界（空文本/未命中/空白过滤/开头结尾）
- TC-HL-004: contentHighlightKey 缓存 key

### TC-API 系列
- TC-API-001: GET 请求处理
- TC-API-002: POST 请求处理
- TC-API-003: 错误响应处理

## 运行命令

```bash
# 后端
cd backend && source venv/Scripts/activate
python -m pytest tests/ -v

# 前端（frontend/ 目录）
npx vitest run
npx vitest          # watch 模式

# E2E（frontend/ 目录）
npm run test:e2e
```
