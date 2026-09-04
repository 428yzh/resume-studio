# 需求文档 v2 — 面试题平台 + JD 图片分析

## 1. JD 分析支持图片导入

### 功能描述
用户上传 JD 截图（PNG/JPG），后端 OCR 提取文字后走原有 AI 分析流程。

### 流程
```
JD 分析页 → 切换: 文本输入 | 图片上传
  ↓ 图片上传
预览缩略图 → 点击「开始分析」
  ↓
后端接收图片 → OCR 提取文字 → 走原有 analyze_jd 逻辑
  ↓
返回分析结果（与文本 JD 分析结果一致）
```

### 技术方案
- 前端：`<input type="file" accept="image/*">`，FormData 上传
- 后端：新增 `POST /api/jd/analyze-image`，用 `pytesseract` 或调用 AI 多模态（如果 DeepSeek 支持）做文字提取
- fallback：OCR 失败时提示用户手动输入

---

## 2. 面试题平台

### 2.1 数据模型

```sql
-- AI 生成的题目（核心表）
CREATE TABLE questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          VARCHAR(20) NOT NULL,       -- single_choice / multi_choice / essay
    question_text TEXT NOT NULL,               -- 题目内容
    options      TEXT DEFAULT '[]',            -- JSON: [{key: "A", text: "..."}] 仅选择题
    correct_answer TEXT NOT NULL DEFAULT '',   -- 正确答案（选择题: "A" / "A,B" / 问答题: 参考回答）
    skill_ids    TEXT DEFAULT '[]',            -- JSON: [1, 3, 5] 关联技能 ID 列表
    jd_analysis_id INTEGER,                   -- 可选，关联 JD 分析记录
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jd_analysis_id) REFERENCES jd_analyses(id) ON DELETE SET NULL
);

-- 答题场次
CREATE TABLE quiz_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    mode          VARCHAR(20) NOT NULL,       -- practice / exam
    question_ids  TEXT NOT NULL,              -- JSON: [1, 5, 8, ...] 这场次的题目列表
    status        VARCHAR(20) DEFAULT 'in_progress',  -- in_progress / completed
    score         INTEGER DEFAULT 0,          -- 总分（考试模式）
    total_questions INTEGER DEFAULT 0,
    correct_count  INTEGER DEFAULT 0,
    started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at  DATETIME
);

-- 答题记录（每道题的作答）
CREATE TABLE quiz_answers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL,
    question_id   INTEGER NOT NULL,
    user_answer   TEXT DEFAULT '',            -- 选择题: "A" / "A,B" / 问答题: 文本
    is_correct    BOOLEAN,                    -- 选择题: true/false, 问答题: null 待 AI 判
    ai_score      INTEGER,                    -- 问答题 AI 评分 (0-100)
    ai_feedback   TEXT DEFAULT '',            -- AI 评语
    ai_reference  TEXT DEFAULT '',            -- 参考答案（AI 生成）
    answered_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
```

### 2.2 题型定义

| 题型 | options | correct_answer | 判卷方式 |
|------|---------|----------------|----------|
| single_choice | `[{"key":"A","text":"..."}, ...]` | `"A"` | 直接比对 |
| multi_choice | `[{"key":"A","text":"..."}, ...]` | `"A,C"` | 完全匹配（有序比对） |
| essay | `[]` | 参考回答文本 | AI 评分 + 生成反馈 |

### 2.3 AI 出题样式

**刷题模式 Prompt 要点：**
- 根据选中的技能 / JD，以目标公司平均水平的难度出题
- 偏基础
- 选择题选项尽量有迷惑性
- 问答题附带评分要点
- 返回 JSON 格式，标注每题关联的技能 ID

**考试模式 Prompt 要点：**
- 模拟真实面试
- 10 单选 + 5 多选 + 3 问答
- 按 JD 要求的技术栈权重分配题目比例
- 附带时间建议（如 45 分钟）

### 2.4 答题流程

#### 刷题模式 (practice)
```
1. 用户进入刷题页
2. 选择过滤条件（技能 / JD / 全部）
3. 选择题型数量（默认 5单选 + 5多选 + 2问答）
4. 点击「生成题目」→ AI 生成，一次性渲染
5. 逐题作答
6. 点击「交卷」
7. 自动判卷：
   - 选择题 → 直接比对，标注对错
   - 问答题 → 异步调 AI 评分 + 生成反馈 + 参考答案
8. 结果页：对错标注 + 正确答案 + AI 评语
9. 可下载：空白题 PDF（考前） / 带答案 PDF（考后）
```

#### 考试模式 (exam)
```
1. 用户选择目标 JD / 技能范围
2. 点击「生成面试卷」→ AI 生成标准卷
3. 进入考试界面：倒计时 45 分钟
4. 作答
5. 到时自动交卷 / 手动交卷
6. AI 判卷 + 评分
7. 成绩单页：总分 + 每题得分 + 正确答案 + AI 评语
```

### 2.5 页面设计

| 路由 | 页面 | 说明 |
|------|------|------|
| `/quiz` | 刷题首页 | 分类筛选 + 题型数量配置 + 出题按钮 |
| `/quiz/session/:id` | 答题页 | 展示题目，答题交互，提交 |
| `/quiz/result/:id` | 结果页 | 对错标注，答案展示，下载 PDF |
| `/quiz/exam` | 考试首页 | 选 JD → 生成考试卷 |
| `/quiz/exam/:id` | 考试答题页 | 倒计时，一页展示所有题 |
| `/quiz/exam/result/:id` | 考试成绩单 | 总分 + 每题得分 |
| `/quiz/records` | 答题记录 | 所有历史场次列表（筛选：模式/时间） |
| `/quiz/records/:id` | 答题详情 | 单场次完整回顾 |

**已有页面扩展：**
- **SkillLibrary** → 展开技能详情时，新增「关联题目」Tab，展示该技能下所有题目 + 历史作答
- **JDAnalysis 详情** → 新增「JD 专属题」Tab，展示该 JD 关联的题目

### 2.6 Nav 改造

当前导航：`简历管理 | JD 分析 | 技能库`

改为：
```
简历管理 | JD 分析 | 面试题库 | 技能库
```

面试题库作为一级入口，下设二级页面（刷题/考试/记录）。

### 2.7 PDF 导出功能

使用现有 `@react-pdf/renderer` 生成：

| 场景 | 内容 | 含答案 |
|------|------|--------|
| 刷题前下载 | 当前生成的空白题 | ❌ |
| 考试前下载 | 空白试卷 | ❌ |
| 考后下载 | 题目 + 用户答案 + 正确答案 + AI 反馈 | ✅ |
| 技能复习 | 该技能所有题目 + 正确答案 | ✅ |
| JD 复习 | 该 JD 所有题目 + 正确答案 | ✅ |

---

## 3. 后端 API 设计

### 新增路由

```
# 题目管理
POST   /api/questions/generate          → AI 生成题目（刷题模式）
POST   /api/questions/generate-exam     → AI 生成考试卷
GET    /api/questions                    → 题目列表（?skill_id= &jd_analysis_id= &type=）
GET    /api/questions/:id                → 题目详情
DELETE /api/questions/:id                → 删除题目

# 答题
POST   /api/quiz/sessions                → 创建答题场次
GET    /api/quiz/sessions                → 答题记录列表（?mode= &status=）
GET    /api/quiz/sessions/:id            → 场次详情（含所有答案）
POST   /api/quiz/sessions/:id/submit     → 交卷（批量提交答案 + AI 判卷）
GET    /api/quiz/sessions/:id/result     → 结果详情

# PDF
GET    /api/quiz/sessions/:id/pdf        → 导出本场次 PDF（含答案）
GET    /api/questions/:id/pdf            → 导出单题 PDF
GET    /api/skills/:id/questions/pdf     → 导出技能下所有题目 PDF
GET    /api/jd/analyses/:id/questions/pdf → 导出 JD 专属题目 PDF

# 图片分析
POST   /api/jd/analyze-image             → 上传图片 JD → OCR → AI 分析
```

---

## 4. 前端核心变更

| 文件 | 变更 |
|------|------|
| `src/App.tsx` | 添加 `/quiz/*` 路由 |
| `Layout.tsx` | 导航加「面试题库」入口 |
| `core/models/` | 新增 `quiz.ts`（Question, QuizSession, QuizAnswer 等类型） |
| `core/stores/` | 新增 `quizStore.ts`（题目、答题状态） |
| `core/stores/skillStore.ts` | 扩展：关联题目查询 |
| `core/api/client.ts` | 无变更（现有 HttpClient 接口够用） |
| `web/pages/` | 新增 `QuizList.tsx`, `QuizSession.tsx`, `QuizExam.tsx`, `QuizResult.tsx`, `QuizRecords.tsx` |
| `web/components/` | 新增 `QuestionCard.tsx`（选择题/多选题/问答题渲染组件） |
| `JDAnalysis.tsx` | 添加图片上传模式 |
| `SkillLibrary.tsx` | 技能详情展开新增「关联题目」 |
| `core/services/pdfService.ts` | 扩展：导出试题 PDF |

---

## 5. 实施建议

### Phase 1 — 基础设施（后端 + 数据模型）
- 新增 `questions` / `quiz_sessions` / `quiz_answers` 表
- 实现 CRUD API
- 实现 AI 出题（刷题模式 + 考试模式）
- 实现 AI 判卷（问答题评分）
- JD 图片分析（OCR + 走现有分析流程）

### Phase 2 — 前端核心功能
- 刷题模式 UI（生成 → 作答 → 交卷 → 结果）
- 考试模式 UI（生成 → 倒计时 → 交卷 → 成绩单）
- QuestionCard 组件（三种题型渲染 + 交互）

### Phase 3 — 扩展功能
- 答题记录页 + 详情
- 技能关联题目展示
- JD 关联题目展示
- PDF 导出（全部场景）

### Phase 4 — UI 打磨
- impeccable 设计高保真
- 空状态 / loading / error states
- 移动端适配
