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

### TC-SKILL 系列
- TC-SKILL-001: POST /api/skills 创建技能
- TC-SKILL-001b: 不带 proficiency 创建 → NULL（未表态），不是 0
- TC-SKILL-002: GET /api/skills 列出技能
- TC-SKILL-003: PUT /api/skills/:id 更新技能
- TC-SKILL-004: DELETE /api/skills/:id 删除技能

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
- TC-STORE-FEYN-001: FeynmanStore fetchTopics 加载列表
- TC-STORE-FEYN-002: FeynmanStore createTopic 创建房间
- TC-STORE-FEYN-003: FeynmanStore deleteTopic 删除房间
- TC-STORE-FEYN-004: FeynmanStore fetchTopic 加载详情
- TC-STORE-FEYN-005: FeynmanStore sendMessage SSE 定级流式（含失败态 / 房间隔离）
- TC-STORE-FEYN-006: FeynmanStore addProblem 手动添加问题
- TC-STORE-FEYN-007: FeynmanStore setProblemStatus 标记解决 / 重开

## 前端测试用例

### TC-MODEL 系列
- TC-MODEL-001: Resume 接口结构正确
- TC-MODEL-002: Template 接口结构正确
- TC-MODEL-003: Skill 接口结构正确
- TC-MODEL-004: JDAnalysis 接口结构正确
- TC-MODEL-005: `findNodes` 从图谱取单元分到的那块 —— 带子树 / 按图谱顺序 / 二层命中 / 找不到是空数组（镜像后端 `_find_nodes`）

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
