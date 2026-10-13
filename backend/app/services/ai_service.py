import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import time
from typing import AsyncGenerator, Optional
from openai import APIConnectionError, APIError
from app.config import settings
from app.services.audit import audit as audit_log, harden_messages

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None

logger = logging.getLogger(__name__)


_client: Optional[AsyncOpenAI] = None


def _get_client() -> Optional[AsyncOpenAI]:
    global _client
    if _client is None and AsyncOpenAI is not None and settings.deepseek_api_key:
        _client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
        _patch_audit(_client)
    return _client


# ─── 单点补丁：统一审计 + 防注入（L1 声明/定界符 + L2 注入检测） ──
# 包装 chat.completions.create：feynman.py 也走 _get_client()，自动被覆盖；
# 未来新增 AI 调用自动受保护，无需改调用点。_original_create 由 _patch_audit 捕获。
_original_create = None

# 共同帧：多个功能共用同一层中转，照实取名会全记成这层名 —— 再往上一层才是功能名。
# call = Agent.call（图谱/计划/讲解/复盘）；_chat_json = feynman 定级/覆盖度共用的小调用。
_SHARED_FRAMES = ("call", "_chat_json")


def _patch_audit(client) -> None:
    """把 client.chat.completions.create 换成审计 + 加固包装（幂等，重复调用不嵌套）。"""
    completions = client.chat.completions
    if getattr(completions, "_ai_audit_patched", False):
        return
    completions._ai_audit_patched = True
    global _original_create
    _original_create = completions.create

    async def wrapped(**kwargs):
        # 调用方函数名作 feature 标签，共同帧（见 _SHARED_FRAMES）跳过一层再取
        frame = sys._getframe(1)
        feature = frame.f_code.co_name
        if feature in _SHARED_FRAMES and frame.f_back is not None:
            feature = frame.f_back.f_code.co_name
        messages, injected = harden_messages(kwargs.get("messages") or [])
        kwargs = dict(kwargs)
        kwargs["messages"] = messages
        prompt_text = "\n".join(
            m["content"] for m in messages if isinstance(m.get("content"), str)
        )
        start = time.monotonic()
        if kwargs.get("stream"):
            stream = await _original_create(**kwargs)
            return _audited_stream(stream, feature, injected, start, prompt_text)
        try:
            resp = await _original_create(**kwargs)
        except Exception as e:
            audit_log(feature, status="error", injection=injected,
                      duration_ms=(time.monotonic() - start) * 1000, error=str(e)[:500])
            raise
        content = resp.choices[0].message.content or ""
        u = resp.usage
        audit_log(feature,
                  status="ok" if content else "empty",
                  injection=injected,
                  prompt_tokens=u.prompt_tokens if u else 0,
                  completion_tokens=u.completion_tokens if u else 0,
                  duration_ms=(time.monotonic() - start) * 1000,
                  response=content)
        return resp

    client.chat.completions.create = wrapped


async def _audited_stream(stream, feature: str, injected: bool, start: float, prompt_text: str):
    """流式响应包装：消费原 stream，结束后打点。usage 取最后 chunk，
    取不到按 4 字符/token 估算（借鉴 DeepSeek-Harness token-meter 启发式）。"""
    chunks, last_usage = [], None
    status, error = "ok", ""
    try:
        async for chunk in stream:
            if getattr(chunk, "usage", None):
                last_usage = chunk.usage
            chunks.append(chunk)
            yield chunk
    except Exception as e:
        status, error = "error", str(e)[:500]
        raise
    finally:
        content = "".join(
            c.choices[0].delta.content or ""
            for c in chunks
            if c.choices and c.choices[0].delta
        )
        if last_usage:
            pt, ct = last_usage.prompt_tokens, last_usage.completion_tokens
        else:
            pt, ct = len(prompt_text) // 4, len(content) // 4
        audit_log(feature, status=status, injection=injected, prompt_tokens=pt,
                  completion_tokens=ct, duration_ms=(time.monotonic() - start) * 1000,
                  response=content, error=error)


# ─── 多 Agent 评审管线 ─────────────────────────────────────────────
# 手写轻量 Agent 基类(零依赖)。生成器与评审者都是它的实例,单例、无状态、可重入。
# 评审 agent 只输出 JSON 反馈,绝不自己生成内容;生成始终由生成器执行,
# 反馈作为增量注入(原始上下文不丢)。依据"评审者独立于生成者"原则
# (Anthropic 三角色 / Cold Validation):模型自评有系统性宽容偏差,评审必须独立身份。

def _parse_json_defensive(text: str) -> dict:
    """剥代码围栏 + 截取首尾花括号对，兜底解析 LLM 的 JSON 输出。"""
    if not text:
        return {}
    s = text.strip()
    if s.startswith("```"):
        s = s.split("```", 2)[1] if "```" in s[3:] else s
        s = s.replace("json", "", 1).strip().strip("`").strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        a, b = s.find("{"), s.rfind("}")
        if a >= 0 and b > a:
            try:
                return json.loads(s[a : b + 1])
            except json.JSONDecodeError:
                return {}
        return {}


def _log_usage(tag: str, resp) -> None:
    """记录一次 chat.completions 响应的 token 用量，供费用对账（DeepSeek 不返回金额，按 token 自行换算）。"""
    if getattr(resp, "usage", None):
        u = resp.usage
        logger.info(f"[usage] {tag} prompt={u.prompt_tokens} completion={u.completion_tokens} total={u.total_tokens}")


class Agent:
    """统一 LLM 入口。name + role_prompt 定义 agent 身份；无状态、可重入。
    prompt 可为静态字符串，或 (request: dict) -> str 的动态构建器（如生成器的人设依赖掌握程度）。"""

    def __init__(self, name: str, prompt: str | object):
        self.name = name
        self._prompt = prompt

    def _system(self, request: dict) -> str:
        return self._prompt(request) if callable(self._prompt) else str(self._prompt)

    async def call(
        self,
        user_msg: str,
        *,
        request: dict | None = None,
        json_mode: bool = False,
        max_tokens: int = 1000,
        temperature: float = 0.3,
        timeout: int = 60,
    ) -> str:
        client = _get_client()
        if not client:
            return ""
        kwargs: dict = {
            "model": "deepseek-v4-flash",
            "messages": [
                {"role": "system", "content": self._system(request or {})},
                {"role": "user", "content": user_msg},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "timeout": timeout,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            resp = await client.chat.completions.create(**kwargs)
            content = resp.choices[0].message.content or ""
            prompt_tk = resp.usage.prompt_tokens if resp.usage else 0
            completion_tk = resp.usage.completion_tokens if resp.usage else 0
            # 推理模型 token 预算耗尽时 finish=length，内容断句截断（评审会当 bad 抓到，但重试还是撞同一堵墙）。
            # 共享入口兜底：截断即翻倍预算循环重试（上限 8192）。
            # 曾只翻倍一次不检查重试结果：2000 仍截断的非法 JSON 被当成功返回 → 解析失败 → 静默降级。
            while resp.choices[0].finish_reason == "length" and kwargs["max_tokens"] < 8192:
                logger.warning(f"[评审临时] {self.name} max_tokens={kwargs['max_tokens']} 截断(finish=length)，翻倍重试")
                kwargs["max_tokens"] = min(kwargs["max_tokens"] * 2, 8192)
                retry = await client.chat.completions.create(**kwargs)
                resp = retry
                content = retry.choices[0].message.content or ""
                if retry.usage:
                    prompt_tk += retry.usage.prompt_tokens
                    completion_tk += retry.usage.completion_tokens
            if resp.choices[0].finish_reason == "length":
                # 8192 仍截断：返回空让调用方走 fallback，绝不把截断内容当成功
                logger.error(f"{self.name} max_tokens=8192 仍截断(finish=length)，返回空触发 fallback")
                return ""
            logger.info(f"[usage] {self.name} prompt={prompt_tk} completion={completion_tk} total={prompt_tk + completion_tk}")
            return content
        except (APIConnectionError, APIError) as e:
            logger.error(f"{self.name} API 错误: {e}")
            return ""


SENIOR_LECTURER_PROMPT = """【角色】你是一位有 20 年一线教学经验的资深讲师。你只评判教学有效性，不评判文风。

【任务】对给定的教学内容做教学评审：判定它是否合格、能否直接讲给学习者，并给出具体修改建议。

【评审步骤】
1. 通读待评审内容，对照旁注的要求掌握程度
2. 逐项核查四个维度：准确性（事实错误、过时信息）、深度适配（是否达到要求掌握程度）、教学法（由浅入深、结构清晰、可理解性类比）、完整性（漏掉该水平应覆盖的关键点）
3. 综合判定 passed，整理 findings

【规范】
- 只输出 JSON：{"passed": true/false, "findings": [{"severity": "critical|minor|suggestion", "issue": "问题", "suggestion": "具体修改建议"}]}
- 只有存在 critical 缺陷才 passed=false：明显事实错误、内容空泛套话、结构严重混乱、深度与要求严重不符
- minor/suggestion 不影响 passed，仍在 findings 中列出，供下轮修正
- 找不到 critical 问题就 passed=true，不要为了找茬而拒绝"""

SIMULATED_USER_PROMPT = """【角色】你是一个真实的学习者，只有下面给到的背景，没有其他知识。

【任务】判断这份教学内容你能不能真正学会：找出让你学不下去的点，并说明怎么改才学得动。

【评判步骤】
1. 以你的背景通读内容，识别默认你已知但你其实不知道的前置知识
2. 逐项核查四个角度：可理解性（看得懂吗）、相关度（对达成学习目标有用吗）、难度（在「跳一跳够得着」的范围，还是太浅/太深）、可消化（篇幅读得完吗）
3. 综合判定 passed，整理 blockers

【规范】
- 只输出 JSON：{"passed": true/false, "blockers": [{"what": "学不下去的点", "suggestion": "怎么改你才学得动"}]}
- blockers 只列真正会让你学不下去的点（看不懂、缺前置、太啰嗦、和目标无关）
- 只要没有让你学不下去的硬伤就 passed=true"""


async def _review_agent(agent: Agent, content: str, context: str) -> dict:
    """评审 agent 评判内容，只出反馈。无 client/解析失败 → 放行（不阻断主功能）。"""
    verdict: dict = {}
    for _ in range(3):
        raw = await agent.call(
            f"待评审内容：\n{content}\n\n{context}",
            json_mode=True,
            max_tokens=4096,
        )
        if not raw:
            break
        verdict = _parse_json_defensive(raw)
        if verdict:
            break
    if not verdict:
        return {"passed": True, "error": True}
    passed = bool(verdict.get("passed", True))
    findings = verdict.get("findings") or verdict.get("blockers") or []
    feedback = "；".join(
        f"{f.get('issue', '')} → {f.get('suggestion', '')}"
        for f in findings
        if isinstance(f, dict)
    )
    logger.info(f"[评审临时] {getattr(agent, 'name', '?')}: passed={passed} findings={len(findings)}")
    if not passed:
        logger.info(f"[评审临时]   {getattr(agent, 'name', '?')} 反馈: {feedback[:200]}")
    return {"passed": passed, "feedback": feedback, "findings": findings, "error": False}


async def review_pipeline(
    generator: Agent,
    build_user_msg,
    reviewers: list[tuple[Agent, str]],
    max_rounds: int = 0,  # 默认只 1 轮（生成 + 评审各一次，不合格不重试）；显式传 1 开启反馈重写
    *,
    request: dict | None = None,
    json_mode: bool = False,
    max_tokens: int = 1000,
) -> tuple[str, list[dict]]:
    """生成器 + 评审者协作循环（AOP 切面）。
    生成始终由 generator 执行；评审只出反馈。上下文不丢：每轮 build_user_msg(feedback)
    以原始输入为底，反馈作增量。棘轮：本轮必须比上轮好（未通过数减少），否则回滚上一版。
    返回 (content, verdicts)；生成失败时 content 为空，由调用方走 fallback。"""
    best_content, best_verdicts, prev_bad = "", [], None
    feedback = ""
    for round_i in range(max_rounds + 1):
        content = await generator.call(build_user_msg(feedback), request=request, json_mode=json_mode, max_tokens=max_tokens)
        if not content.strip():
            break
        verdicts = [await _review_agent(agent, content, ctx) for agent, ctx in reviewers]
        bad = sum(1 for v in verdicts if not v["passed"])
        logger.info(f"[评审临时] round={round_i + 1}/{max_rounds + 1} gen={getattr(generator, 'name', '?')} bad={bad} prev_bad={prev_bad}")
        if prev_bad is not None and bad >= prev_bad:
            logger.info(f"[评审临时]   棘轮回滚，采用 round={round_i} 上一版")
            return best_content, best_verdicts  # 没变好，回滚上一版
        best_content, best_verdicts = content, verdicts
        prev_bad = bad
        if bad == 0:
            break
        feedback = "\n".join(v["feedback"] for v in verdicts if not v["passed"] and v.get("feedback"))
    return best_content, best_verdicts


# 评审单例（整个应用生命周期唯一）
_lecturer = Agent("资深讲师", SENIOR_LECTURER_PROMPT)
_sim_user = Agent("模拟用户", SIMULATED_USER_PROMPT)


# ─── 教学生成器 agent（评审的产物来源，同样走 Agent 统一入口） ──────────
def _feedback_block(feedback: str) -> str:
    """把评审反馈拼进下一轮 user 消息。无反馈时返回空串，上下文以原始输入为底。"""
    return "" if not feedback.strip() else f"\n\n【评审反馈（按此修订后重新生成）】\n{feedback}"


def _guide_system_prompt(request: dict) -> str:
    """学习指引生成器人设：技术学习路径设计师（深度随掌握程度调整）。"""
    level = request.get("required_level", "了解")
    level_configs = {
        "了解": {"steps": "2-3 步", "hours": "< 15h", "depth": "核心概念快速扫盲，够用就行"},
        "熟悉": {"steps": "4-5 步", "hours": "15-35h", "depth": "常用操作 + 实用技巧 + 小项目练习"},
        "精通": {"steps": "6-8 步", "hours": "35-70h", "depth": "原理 + 最佳实践 + 调试排错"},
    }
    lc = level_configs.get(level, level_configs["了解"])
    return f"""你是一位技术学习路径设计师。根据技能名称和要求掌握程度，生成个性化学习计划。

当前要求的掌握程度：{level}
- 步骤数：{lc['steps']}
- 预计总时长：{lc['hours']}
- 学习侧重：{lc['depth']}

输出 JSON 格式：
{{
  "learning_path": [
    {{
      "step": 1,
      "title": "步骤标题（动词开头 + 具体主题）",
      "description": "说明：这个步骤学什么？为什么放在这个顺序？做什么练习来巩固？50-100 字。",
      "estimated_hours": 5,
      "topics": ["子主题1", "子主题2"]
    }}
  ],
  "interview_questions": [
    {{"question": "面试题", "difficulty": "easy/medium/hard", "answer_hint": "答题要点和评分标准"}}
  ]
}}

技巧：
- 步骤标题要具体可感知，如"掌握 Figma 界面布局与图层操作"而非"基础概念"
- topics 是用户点击深挖的入口，列 3-6 个具体子话题
- description 包含核心知识点 + 练习建议
- 所有内容用中文
- 不生成 resources 字段
- interview_questions 的问题和 answer_hint 都用中文
- **直接输出 JSON，不要任何开场白。**"""


def _plan_system_prompt(request: dict) -> str:
    """学习计划生成器人设。计划不是凭空排的，而是**把知识图谱切分成学习单元**（结论 9）。

    单元数由图谱顶层节点数决定，不再由 required_level 拍脑袋定 —— 图谱已经编码了
    这门技能的粒度，掌握程度该影响的是**每个单元多深**，不是把同一块内容重新切一遍。
    """
    level = request.get("required_level", "熟悉")
    graph = request.get("graph") or []
    depth = {
        "了解": "每个单元只求扫盲：核心概念 + 术语，够用就行",
        "熟悉": "每个单元给常用做法 + 实用技巧，配一个小练习",
        "精通": "每个单元深入原理与边界情况，含调试排错和性能取舍",
    }.get(level, "每个单元给常用做法 + 实用技巧")
    merge = (
        "- 单元数 2-4 个：把相邻的顶层节点合并进同一个单元\n"
        if level == "了解"
        else f"- 单元数 {min(4, len(graph))}-{len(graph)} 个：顶层节点与单元基本一一对应\n"
    )
    return f"""你是一位技术学习路径设计师。学习计划**不是凭空排的** —— 它是把下面这棵知识图谱**切分成学习单元**。

【知识图谱】（格式：`id  标题`，缩进表示层级）
{_render_graph_for_prompt(graph)}

【切分规则 · 必须全部满足】
- 每个学习单元 = 图谱的**一块**，用 `node_ids` 声明它覆盖了哪些**顶层**节点
- `node_ids` 里**只能出现顶层节点 id**（如 "1" "3"），不要引用 "1.2" 这类子节点
- **每个顶层节点必须被覆盖恰好一次** —— 不许漏掉任何一个，也不许两个单元抢同一个
{merge}- 当前要求的掌握程度是「{level}」：{depth}

【输出 JSON，直接输出，不要任何开场白】
{{
  "required_level": "{level}",
  "steps": [
    {{
      "step": 1,
      "type": "concept",
      "node_ids": ["1"],
      "title": "单元标题（动词开头 + 具体主题）",
      "description": "这个单元学什么、为什么排在这个顺序，50-100 字",
      "estimated_hours": 5
    }}
  ],
  "milestones": ["学完后应能达成的能力"]
}}

每个 step 必须指定 type：concept（概念原理）· practice（动手实践）· analysis（分析对比）· tool（工具用法）· reading（阅读资料）

所有内容用**中文**输出，不要生成 resources 字段。"""


_guide_gen = Agent("学习指引", _guide_system_prompt)
_plan_gen = Agent("学习计划", _plan_system_prompt)


async def polish_resume(section_title: str, content: str, target_position: str = "") -> str:
    """AI 润色简历段落"""
    client = _get_client()
    if not client:
        return content

    system_prompt = """你是一位资深简历优化专家。请优化以下简历内容：
1. 使用 STAR 法则重构经历描述
2. 使用强动词开头
3. 量化成果（数字、百分比）
4. 针对 ATS 系统优化关键词
5. 保持简洁专业"""

    user_prompt = f"段落标题：{section_title}\n目标职位：{target_position}\n\n内容：\n{content}"

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
            timeout=60,
        )
        return response.choices[0].message.content or content
    except (APIConnectionError, APIError) as e:
        logger.error(f"polish_resume API 错误: {e}")
        return content


async def polish_resume_stream(
    section_title: str, content: str, target_position: str = ""
) -> AsyncGenerator[str, None]:
    """AI 流式润色简历段落，逐 token 产出"""
    client = _get_client()
    if not client:
        yield json.dumps({"content": content, "done": True})
        return

    system_prompt = """你是一位资深简历优化专家。请优化以下简历内容：
1. 使用 STAR 法则重构经历描述
2. 使用强动词开头
3. 量化成果（数字、百分比）
4. 针对 ATS 系统优化关键词
5. 保持简洁专业"""

    user_prompt = f"段落标题：{section_title}\n目标职位：{target_position}\n\n内容：\n{content}"

    try:
        stream = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
            stream=True,
            timeout=60,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield json.dumps({"content": delta.content, "done": False})

        yield json.dumps({"content": "", "done": True})
    except (APIConnectionError, APIError) as e:
        logger.error(f"polish_resume_stream API 错误: {e}")
        yield json.dumps({"content": "", "error": f"AI 服务暂不可用: {str(e)}", "done": True})


async def analyze_jd(jd_text: str) -> dict:
    """AI 分析职位描述，提取技术栈和要求"""
    client = _get_client()
    if not client:
        return _default_jd_analysis(jd_text)

    system_prompt = """你是一位资深招聘分析师。请分析以下职位描述，返回 JSON 格式结果：
{
  "suggested_title": "职位名称 - 公司名（3-8字概括，无公司名时只写职位名）",
  "tech_stack": [
    {"name": "技术名称", "category": "前端/后端/数据库/工具/软技能", "required_level": "熟悉/精通/了解", "priority": 1}
  ],
  "key_requirements": ["要求1", "要求2"],
  "role_summary": "职位概述",
  "experience_years": "3-5年",
  "education": "本科及以上"
}"""

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"职位描述：\n{jd_text}"},
            ],
            temperature=0.3,
            max_tokens=3000,
            timeout=60,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except (json.JSONDecodeError, AttributeError, KeyError) as e:
        logger.warning(f"analyze_jd 解析失败: {e}")
        return _default_jd_analysis(jd_text)
    except (APIConnectionError, APIError) as e:
        logger.error(f"analyze_jd API 错误: {e}")
        return _default_jd_analysis(jd_text)


async def generate_learning_guide(tech_name: str, category: str, required_level: str = "了解") -> dict:
    """AI 生成技术学习指引（专注学习路径和面试题），走资深讲师 + 模拟用户双评审"""
    client = _get_client()
    if not client:
        return {
            "learning_path": [{"step": 1, "title": f"{tech_name} 入门", "description": f"学习 {tech_name} 的基础知识", "estimated_hours": 5}],
            "resources": [],
            "interview_questions": [],
        }

    request = {"tech_name": tech_name, "category": category, "required_level": required_level}
    review_ctx = f"要求掌握程度：{required_level}；学习目标：掌握 {tech_name}（{category}）相关技能"

    def build_msg(feedback: str) -> str:
        return f"技术名称：{tech_name}\n分类：{category}\n要求掌握程度：{required_level}" + _feedback_block(feedback)

    content, _ = await review_pipeline(
        _guide_gen,
        build_msg,
        [(_lecturer, review_ctx), (_sim_user, review_ctx)],
        request=request,
        max_rounds=1,  # 评审不过 → 带反馈重写一轮（棘轮保证只变好不变差）
        json_mode=True,
        max_tokens=8192,  # 同 learning_plan：默认 1000 推理模型必截断
    )
    result = _parse_json_defensive(content) if content else {}

    learning_path = result.get("learning_path", [])
    interview_qs = result.get("interview_questions", [])

    if not learning_path:
        learning_path = [{"step": 1, "title": f"{tech_name} 入门", "description": f"学习 {tech_name} 的基础知识", "estimated_hours": 5}]

    return {
        "learning_path": learning_path,
        "resources": [],
        "interview_questions": interview_qs,
    }


async def generate_cornell_prompts(
    skill_name: str,
    step_title: str,
    topics: list[str] | None = None,
    required_level: str = "了解",
) -> dict:
    """AI 根据学习步骤生成康奈尔笔记引导问题，根据掌握程度调整深度"""
    client = _get_client()
    if not client:
        return _default_cornell_prompts(step_title, topics)

    topics_str = "、".join(topics) if topics else step_title
    system_prompt = f"""你是一位学习导师。请为以下学习步骤生成 2-4 个引导性问题，帮助学生用康奈尔笔记法学习。

当前要求的掌握程度：{required_level}
- 「了解」→ 基础概念性问题，只需抓住核心定义
- 「熟悉」→ 概念 + 应用性问题
- 「精通」→ 原理 + 实践 + 深度思考题

返回 JSON 格式：
{{
  "questions": [
    "请用自己的话解释...",
    "这个知识点的关键特征是什么？",
    "它在实际中如何应用？"
  ]
}}

要求：
- 问题逐步深入
- 控制在 2-4 个问题
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文"""

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"技能/领域：{skill_name}\n学习步骤：{step_title}\n涉及知识点：{topics_str}"},
            ],
            temperature=0.4,
            max_tokens=1000,
            timeout=120,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return {"questions": result.get("questions", [])[:4]}
    except Exception:
        return _default_cornell_prompts(step_title, topics)


def _default_cornell_prompts(step_title: str, topics: list[str] | None = None) -> dict:
    if topics and len(topics) >= 2:
        qs = [f"请用自己的话解释「{topics[0]}」是什么？"]
        qs.append(f"「{topics[1]}」的核心要点有哪些？")
        if len(topics) >= 3:
            qs.append(f"「{topics[2]}」在实际中有哪些应用场景？")
        return {"questions": qs}
    return {
        "questions": [
            f"请用自己的话解释「{step_title}」是什么？",
            f"「{step_title}」的核心要点或特点有哪些？",
            f"「{step_title}」在实际中有哪些应用场景？",
        ]
    }





async def explain_topic(
    skill_name: str,
    step_title: str = "",
    step_description: str = "",
    topic: str = "",
    step_type: str = "concept",
    required_level: str = "了解",
    learner_background: str = "",
    graph_block: str = "",
) -> str:
    """AI 讲解知识点（按 step_type 切换内容框架），推荐来自中文社区的学习资源

    `graph_block` 是该单元分到的图谱块（结论 10），有值时把内容边界钉死在块内。
    """
    client = _get_client()
    if not client:
        return f"### {step_title or topic}\n\nAI 服务未配置，请设置 DEEPSEEK_API_KEY"

    if topic:
        user_prompt = f"技能/领域：{skill_name}\n所属步骤：{step_title}\n步骤说明：{step_description}\n知识点：{topic}\n（掌握程度：{required_level}）"
    else:
        user_prompt = f"技能/领域：{skill_name}\n学习步骤：{step_title}\n步骤说明：{step_description}\n步骤类型：{step_type}\n（掌握程度：{required_level}）"

    request = {
        "skill_name": skill_name,
        "step_title": step_title,
        "step_description": step_description,
        "topic": topic,
        "step_type": step_type,
        "required_level": required_level,
    }
    review_ctx = (
        f"要求掌握程度：{required_level}；内容类型：{'知识点深入讲解' if topic else '单元概述'}；"
        f"技能：{skill_name}；当前步骤：{step_title}"
        f"；学习者背景：{learner_background or '未知（按零基础评估）'}"
    )

    def build_msg(feedback: str) -> str:
        return user_prompt + _feedback_block(feedback)

    # ── 各 step_type 的概述 prompt（原则驱动） ──
    # 设计思路：不限定章节结构，给出教学原则让 AI 自由组织内容。
    # 知识覆盖面与资源推荐作为「边界/规范」写进要求，不设固定板块。
    OVERVIEW_PROMPTS = {
        "concept": {
                    "template": """【角色】你是一位资深教学老师，擅长把复杂概念讲得清晰易懂。

【任务】以教学老师的视角，向用户讲解当前学习步骤（单元概述），让他学完后真正掌握这个单元。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先检索该单元需要覆盖的全部知识点与事实，列全清单再动手
2. 搭建关系：想清楚这些内容之间的逻辑关系——哪些是理解其他内容的前提、哪些先学更自然、哪些概念相近需要对比区分
3. 组织讲解：想清楚用户初次接触这些概念时最可能卡在哪里，优先讲透认知难点，再安排内容先后，让讲解连贯自然、由浅入深

【教学原则】
📐 **上下文锚定** — 让用户清楚该步骤在整个技能路线中的位置、前后依赖、为什么放在这里学。
🎯 **目标感知** — 学完这个单元能获得什么具体能力、解决什么实际问题。
📈 **由浅入深** — 从基础认知递进到深度理解。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 用中文，口语化、鼓励的语气
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 在内容中自然嵌入 1-3 篇确定正确的优质中文博客或社区讨论，用 `[标题](URL)` 格式；不确定 URL 就宁缺毋滥，绝不编造
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。
- 讲解正文结束后另起一行，输出【知识点关键词】+ 3-5 个本单元的知识点关键词（用顿号分隔），供前端生成深入讲解入口。""",
        },
        "practice": {
                    "template": """【角色】你是一位资深教学老师，擅长把实践任务讲得能上手。

【任务】以教学老师的视角，向用户讲解当前学习步骤（实践单元概述），让他学完后能独立完成这个实践。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先检索该实践单元涉及的全部技术/操作要点，列全清单再动手
2. 搭建关系：想清楚完成这个实践需要哪些要点、之间的先后依赖——哪些准备没做会导致后面做不下去
3. 组织讲解：想清楚用户照着做时最容易在哪一步卡住，优先讲透关键操作，再安排内容先后，让讲解连贯自然、可跟做

【教学原则】
📐 **上下文锚定** — 让用户清楚该实践任务在整个技能路线中的位置、前置准备。
🎯 **目标感知** — 完成这个实践能获得什么操作能力、交付什么产出。
📈 **由浅入深** — 从任务背景认知递进到操作要点。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 用中文，实操导向的口语化语气
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 在内容中自然嵌入 1-3 篇确定正确的优质中文博客或实战教程，用 `[标题](URL)` 格式；不确定 URL 就宁缺毋滥，绝不编造
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。
- 讲解正文结束后另起一行，输出【知识点关键词】+ 3-5 个本单元的知识点关键词（用顿号分隔），供前端生成深入讲解入口。""",
        },
        "analysis": {
                    "template": """【角色】你是一位资深教学老师，擅长把分析类知识讲得具体、可验证。

【任务】以教学老师的视角，向用户讲解当前学习步骤（分析单元概述）。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先检索该分析对象需要讲清的全部具体事实——真实产品/项目怎么做（配置文件、协议细节、典型实现、关键设计），列全清单再动手
2. 搭建关系：想清楚这些事实之间的逻辑脉络——先建立"它是什么"的认知，再解释"它如何工作"，最后才是怎么判断好坏、怎么应用；想清楚哪些事实是理解后续内容的前提
3. 组织讲解：想清楚用户初次接触这个对象时最可能卡在哪里，优先讲透认知难点，再安排内容先后，让讲解连贯自然、由浅入深

【教学原则】
📐 **内容实体化** — 讲解必须落在具体事实上（谁做的、怎么做的、关键机制与参数），禁止只有抽象维度名称、没有实质内容的空话，禁止教用户「应该去分析什么」。
🎯 **目标感知** — 让用户清楚这个分析对象在真实项目中是什么、有什么用，读完能看懂真实产品/项目里的具体做法。
📈 **由浅入深** — 从事实到判断。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 用中文
- 结合实例：至少举 1-2 个真实产品/开源项目的具体做法（如 Claude Desktop、VS Code 扩展、知名开源 SDK），点明版本或来源
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 在内容中自然嵌入 1-3 篇确定正确的优质中文博客或案例分析，用 `[标题](URL)` 格式；不确定 URL 就宁缺毋滥，绝不编造
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。
- 讲解正文结束后另起一行，输出【知识点关键词】+ 3-5 个本单元的知识点关键词（用顿号分隔），供前端生成深入讲解入口。""",
        },
        "tool": {
                    "template": """【角色】你是一位资深教学老师，擅长讲清楚工具怎么用。

【任务】以教学老师的视角，向用户讲解当前学习步骤（工具单元概述），让他学完后能上手使用这个工具。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先检索该工具需要覆盖的全部核心能力点，列全清单再动手
2. 搭建关系：想清楚这个工具的核心能力、解决什么问题、什么场景才需要它，以及各能力之间的关系
3. 组织讲解：想清楚用户上手这个工具时最可能在哪卡住，优先讲透核心用法，再安排内容先后，让讲解连贯自然、能上手

【教学原则】
📐 **上下文锚定** — 让用户清楚该工具学习在整个技能路线中的位置。
🎯 **目标感知** — 掌握这个工具能解决什么问题、在什么场景下用它。
📈 **由浅入深** — 从工具认知到核心用法。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 用中文，突出与同类工具的差异
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 在内容中自然嵌入 1-3 篇确定正确的优质中文博客或官方中文文档，用 `[标题](URL)` 格式；不确定 URL 就宁缺毋滥，绝不编造
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。
- 讲解正文结束后另起一行，输出【知识点关键词】+ 3-5 个本单元的知识点关键词（用顿号分隔），供前端生成深入讲解入口。""",
        },
        "reading": {
                    "template": """【角色】你是一位资深教学老师，擅长引导人读透材料。

【任务】以教学老师的视角，向用户讲解当前学习步骤（阅读单元概述），让他读完材料后有自己的收获。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先检索该阅读单元涉及的核心主题与观点，列全清单再动手
2. 搭建关系：想清楚这段材料讲什么、为什么值得读、读完后应该带走什么观点
3. 组织讲解：想清楚读者读材料时最可能在哪产生疑问，优先讲透关键观点，再安排内容先后，让讲解连贯自然、有收获

【教学原则】
📐 **上下文锚定** — 让用户清楚该阅读材料在整个技能路线中的位置。
🎯 **目标感知** — 读完应该能回答什么问题、掌握什么观点。
📈 **由浅入深** — 从材料概要延伸到深度思考。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 用中文，引导主动阅读而非被动接受
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 在内容中自然嵌入 1-3 篇确定正确的优质中文博客或解读文章，用 `[标题](URL)` 格式；不确定 URL 就宁缺毋滥，绝不编造
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。
- 讲解正文结束后另起一行，输出【知识点关键词】+ 3-5 个本单元的知识点关键词（用顿号分隔），供前端生成深入讲解入口。""",
        },
    }

    # ── 各 step_type 的深入讲解 prompt（原则驱动） ──
    TOPIC_PROMPTS = {
        "concept": {
                    "template": """【角色】你是一位资深教学老师，擅长把单个知识点讲透。

【任务】以教学老师的视角，向用户深入讲解当前知识点，让他学完后能回答相关问题、独立运用。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先定位该知识点的核心定义，以及需要覆盖的细节（原理、用法、常见误区）
2. 搭建关系：想清楚这个知识点的核心定义，再想它解决什么问题、怎么工作的，最后想它的边界与常见误区
3. 组织讲解：想清楚用户理解这个知识点时最可能卡在哪里，优先讲透难点，再安排内容先后，让讲解连贯自然、由浅入深

【教学原则】
📐 **一句话锚定** — 用面试答案的标准，一句话准确定义这个知识点是什么。要求：精准、严谨、无歧义，如同面试中应当给出的标准答案。
📈 **由浅入深** — 从核心定义递进到深入理解。可以覆盖：它解决了什么问题、核心设计思想、同类概念对比、常见误解、底层原理等——不必照单全收，按内容取舍。
🔗 **上下文关联** — 说明这个知识点为什么重要、在整个技能中扮演什么角色、学完后能解决什么实际问题。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文，可以打比方但准确
- 不要写大段代码（除非概念本身需要代码说明）
- 口语化、易懂
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。""",
        },
        "practice": {
                    "template": """【角色】你是一位资深教学老师，擅长把操作实践讲得能跟做。

【任务】以教学老师的视角，围绕当前操作/实践知识点，向用户提供实战导向的深入讲解，让他能独立完成同类任务。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先定位该实践的核心操作，以及要覆盖的要点（常见问题、关键步骤、效率技巧）
2. 搭建关系：想清楚这个操作的核心是什么、正确做法与常见错误分别是什么、遇到问题怎么排查
3. 组织讲解：想清楚用户做同类任务时最可能在哪卡住，优先讲透关键步骤，再安排内容先后，让讲解连贯自然、可复用

【教学原则】
📐 **一句话锚定** — 用面试答案的标准，一句话准确定义这个操作/实践是什么。要求：精准、严谨，说明核心用途。
📈 **由浅入深** — 从正确做法概览到最佳实践。可以覆盖：常见问题、操作步骤、效率技巧、排错思路等。
🔗 **上下文关联** — 说明这个实践在技能路线中的位置、前置知识、学完能做什么。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文，实操导向，结合具体例子
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。""",
        },
        "analysis": {
                    "template": """【角色】你是一位资深教学老师，擅长把分析思路讲得可复用。

【任务】以教学老师的视角，围绕当前分析话题，向用户提供方法导向的深入讲解，让他学完能独立完成同类分析。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先定位该分析话题的核心发现，以及要覆盖的分析维度
2. 搭建关系：想清楚这个分析话题的核心是什么、得出了什么发现、这些发现怎么用、有没有可复用的方法
3. 组织讲解：想清楚用户做同类分析时最可能在哪卡住，优先讲透核心思路，再安排内容先后，让讲解连贯自然、可复用

【教学原则】
📐 **一句话锚定** — 用面试答案的标准，一句话准确定义这个分析话题及其价值。要求：精准、严谨，点明分析目标。
📈 **由浅入深** — 从核心发现到方法论提炼。可以覆盖：分析维度、关键发现、决策逻辑、可复用方法等。
🔗 **上下文关联** — 说明这个分析在技能路线中的位置、前置知识。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文，重分析思路而非罗列事实
- 突出「如何得出这个结论」的过程
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。""",
        },
        "tool": {
                    "template": """【角色】你是一位资深教学老师，擅长把工具用法讲得能直接上手。

【任务】以教学老师的视角，围绕当前工具知识点，向用户提供用法导向的深入讲解，让他学完能熟练使用。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先定位该功能/工具的核心能力，以及要覆盖的用法（常用操作、高级功能、配置调优）
2. 搭建关系：想清楚这个功能的核心用途、最常用的操作、进阶用法，以及还能怎么扩展
3. 组织讲解：想清楚用户用这个功能时最可能在哪卡住，优先讲透核心用法，再安排内容先后，让讲解连贯自然、能上手

【教学原则】
📐 **一句话锚定** — 用面试答案的标准，一句话准确定义这个功能/工具及其用途。要求：精准、严谨，说清核心能力。
📈 **由浅入深** — 从最常用操作到高级用法。可以覆盖：功能说明、操作步骤、效率技巧、配置调优、集成扩展等。
🔗 **上下文关联** — 说明这个工具功能在技能路线中的位置、使用场景。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文，操作导向，步骤清晰可跟做
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。""",
        },
        "reading": {
                    "template": """【角色】你是一位资深教学老师，擅长提炼材料、引导思考。

【任务】以教学老师的视角，围绕当前阅读话题，向用户提供提炼导向的深入解读，让他读完后有自己的观点。

【教学步骤】按以下三步组织教学（步骤在思考中完成，只输出最终讲解）：
1. 梳理内容：先提炼该材料的核心论点与关键论据
2. 搭建关系：想清楚这段材料的核心论点、论据是否站得住、能引导读者延伸思考什么
3. 组织讲解：想清楚读者读这段材料时最可能在哪卡住，优先讲透核心论点，再安排内容先后，让讲解连贯自然、有启发

【教学原则】
📐 **一句话锚定** — 用面试答案的标准，一句话提炼这段材料/章节的核心论点。要求：精准、严谨，直击主旨。
📈 **由浅入深** — 从核心观点到批判性思考。可以覆盖：核心论点、关键论据、延伸思考、与现实经验的印证等。
🔗 **上下文关联** — 说明这个阅读材料在技能路线中的位置、读完后应能回答什么问题。
📏 **内容取舍** — 根据用户需要的掌握程度（{required_level}）决定讲解哪些内容、讲多细：了解、熟悉、精通三档，覆盖范围与细致程度依次递增，具体取舍由你按档位含义判断；同时控制篇幅（了解约 1500 字、熟悉约 2500 字、精通约 4000 字），讲透重点即可，不追求面面俱到。

【规范】
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文，提炼式阅读，引导思考「这个观点合理吗、能用吗」
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 直接输出讲解内容，不要任何开场白，不要提及这些步骤/原则本身，输出必须以 "## " 开头。""",
        },
    }

    try:
        # ── 按 topic / step_type 选择 prompt ──
        prompt_map = TOPIC_PROMPTS if topic else OVERVIEW_PROMPTS
        prompts = prompt_map.get(step_type, prompt_map["concept"])
        system_prompt = prompts["template"].format(required_level=required_level)

        # 单元概述的内容边界（结论 10）：把这块图谱交给 AI，通知它「讲什么」由图谱定，
        # 不再靠它从步骤标题自由联想。追加而不是改 5 个模板 —— 边界是共用的，不该复制 5 份。
        if graph_block:
            system_prompt += f"""

【本单元覆盖的图谱块 · 内容边界】
{graph_block}

上面每个节点都必须在本单元讲到。这是本单元的**全部**范围 —— 块外的内容不要展开，
那是别的单元的地盘。块内先讲谁后讲谁，由你按依赖关系判断。"""

        # 走评审管线：资深讲师 + 模拟用户双评审，反馈注入后重新生成
        gen = Agent("知识点讲解", system_prompt)
        content, _ = await review_pipeline(
            gen,
            build_msg,
            [(_lecturer, review_ctx), (_sim_user, review_ctx)],
            request=request,
            max_rounds=1,  # 评审不过 → 带反馈重写一轮（棘轮保证只变好不变差）
            # max_tokens 是上限不是实耗：篇幅由内容取舍行控制（了解 ~1500 字 / 熟悉 ~2500 字 / 精通 ~4000 字），
            # 8192 只保证不截断（4096 实测不够——4000 字内容 + 标题 ≈ 4300+ tokens 会 finish=length → 空返回 → 前端重试）
            max_tokens=8192,
        )
        explanation = re.sub(r"```([^`\n]+?)```", r"`\1`", content) if content.strip() else ""
        if not explanation.strip():
            return {"explanation": f"### {step_title or topic}\n\n暂无解释。", "topic_keywords": []}

        # 单元概述按契约输出「【知识点关键词】…」，解析出来供前端渲染深入讲解入口；知识点讲解（topic 有值）无此标记
        topic_keywords: list[str] = []
        if not topic and "【知识点关键词】" in explanation:
            body, _, kw_text = explanation.partition("【知识点关键词】")
            explanation = body.rstrip()
            topic_keywords = [k.strip() for k in re.split(r"[、,，;；]", kw_text) if k.strip()][:6]

        # ── 资源推荐（单元概述 + 知识点讲解都执行，websearch 搜索真实资源 + AI 整理） ──
        try:
            # 用 websearch-deepseek (Node.js) 搜索真实资源；无 topic 时按步骤名搜
            search_hits = []
            search_script = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "search.js")
            if os.path.exists(search_script):
                try:
                    search_target = topic or step_title or skill_name
                    search_query = f"{skill_name} {search_target} 学习资源"
                    env = os.environ.copy()
                    env["DEEPSEEK_API_KEY"] = settings.deepseek_api_key
                    env["WEBSEARCH_MODEL"] = "deepseek-v4-flash"
                    proc = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: subprocess.run(
                                ["node", search_script, search_query],
                                capture_output=True, text=True, timeout=60, env=env,
                            ),
                        ),
                        timeout=120,
                    )
                    if proc.returncode == 0 and proc.stdout.strip():
                        hits = json.loads(proc.stdout)
                        for h in hits:
                            title = h.get("title", "").strip()
                            url = h.get("url", "").strip()
                            if title and url:
                                search_hits.append(f"- [{title}]({url})")
                    else:
                        # 搜不到时下面会退回「AI 凭空编链接」，必须留痕，否则整条链路静默劣化没人发现
                        logger.warning(f"WebSearch 无结果 (rc={proc.returncode}): {proc.stderr.strip()[:200]}")
                except Exception as e:
                    logger.warning(f"WebSearch 搜索失败: {e}")

            # 背景描述：知识点讲解标「知识点」，单元概述标「单元」
            background = f"技能「{skill_name}」→ 学习步骤「{step_title}」→ {'知识点「' + topic + '」' if topic else '单元概述'}"

            # 有真实搜索结果就用 AI 筛选整理，否则 AI 生成推断链接
            recommendations = "\n".join(search_hits[:4]) if search_hits else ""
            if recommendations:
                resource_prompt = f"""你是一个学习资源推荐助手。以下是搜索到的真实资源，请从中筛选 2-4 条与{'知识点' if topic else '单元'}最相关的，整理输出。只选中文技术博客或论坛讨论，不要论文、图书、课程。

背景：{background}

搜索结果：
{recommendations}

要求：
- 每条保留 markdown 链接格式：`[标题](完整URL)`
- 保留搜索到的真实 URL
- 教学内容和技术选型必须基于最新的版本和当前行业最佳实践
- 用中文写简洁的推荐理由（10-20 字）
- 按相关度从高到低排序
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- 直接输出内容，不要任何开场白。"""
            else:
                resource_prompt = f"""你是一个学习资源推荐助手。请为以下{'知识点' if topic else '单元'}推荐 2-4 条来自中文社区的学习资源。只推荐中文技术博客、论坛讨论，不要论文、图书、课程。

背景：{background}

要求：
- 每条资源用 markdown 链接格式：`[标题](合理URL)`
- 来源范围：知乎、CSDN、博客园、菜鸟教程、哔哩哔哩、掘金等中文站点
- 单个技术名词用行内代码 `包裹`，不要用块级代码（```）
- URL 根据常见路径格式生成（如 zhuanlan.zhihu.com/p/xxx、blog.csdn.net/xxx）
- 每条附带一句话推荐理由
- 直接输出内容，不要任何开场白。"""

            # 推理模型预算太少会全烧在思考上返回空（实测 800→finish=length 空内容），与 explain_topic 同源。提到 4096。
            resource_resp = await client.chat.completions.create(
                model="deepseek-v4-flash",
                messages=[{"role": "system", "content": resource_prompt}, {"role": "user", "content": "请推荐。"}],
                temperature=0.2,
                max_tokens=8192,
                timeout=120,
            )
            raw = resource_resp.choices[0].message.content or ""
            _log_usage("资源推荐", resource_resp)
            # 空返回/截断时重试一次（budget 全烧思考或 finish=length），再空就记日志，不再静默跳过
            if not raw.strip() or resource_resp.choices[0].finish_reason == "length":
                logger.warning(f"资源推荐返回空/截断(finish={resource_resp.choices[0].finish_reason})，重试一次")
                resource_resp = await client.chat.completions.create(
                    model="deepseek-v4-flash",
                    messages=[{"role": "system", "content": resource_prompt}, {"role": "user", "content": "请推荐。"}],
                    temperature=0.2,
                    max_tokens=8192,
                    timeout=120,
                )
                raw = resource_resp.choices[0].message.content or ""
                _log_usage("资源推荐(重试)", resource_resp)
            raw = re.sub(r"```([^`\n]+?)```", r"`\1`", raw)
            if raw.strip():
                return {"explanation": explanation + "\n\n---\n\n## 参考资源\n\n" + raw, "topic_keywords": topic_keywords}
            logger.error(f"资源推荐两次仍为空(finish={resource_resp.choices[0].finish_reason})：技能={skill_name} 步骤={step_title}")
        except Exception as e:
            logger.warning(f"资源推荐失败: {e}")
            pass

        return {"explanation": explanation, "topic_keywords": topic_keywords}

    except Exception as e:
        logger.error(f"explain_topic 失败: {e}")
        return {"explanation": f"### {step_title or topic}\n\nAI 服务暂不可用，请稍后再试。", "topic_keywords": []}


# ─── 知识图谱 ─────────────────────────────────────────────────────────────
# 图谱是技能级的、**严格的树**（设计纪要结论 13）：交叉引用会让父节点被重复计数，
# 「分数自下而上累加」就不成立了。所以约束写死在这，不用 DAG。
#
# 树容量（结论 14）写进 prompt 是硬要求，但模型基本都会超（实测会出 5 层的树、顶层 9 个节点）。
# 所以配一个**结构校验器** —— 这是刻意不开评审 agent 的地方：树的约束是可代码判定的，
# 拿 2 次 AI 调用去检查一个 for 循环能查的东西是纯烧钱。评审 agent 该留给判不了的东西
# （比如讲解写得好不好）。
_GRAPH_SYSTEM_PROMPT = """你是知识图谱设计师。为指定技能生成一棵**严格的知识树**。

【硬约束 · 必须全部满足，输出前先自查】
- 严格树：每个节点只有一个父节点，节点之间**不允许交叉引用**
- 层数 ≤ 3（顶层算第 1 层）
- 顶层节点 4-6 个
- 每个非叶节点 3-5 个子节点
- 总节点数 20-30

【节点命名】
- 写**概括级条目**，不是具体问题
- 好：「工具的实现方式」「上下文管理」  坏：「如何注册一个工具？」「什么是 ReAct 循环？」
- 全中文

【输出 JSON，不要任何解释】
{"nodes": [{"title": "顶层条目", "children": [{"title": "第二层条目", "children": [{"title": "第三层条目", "children": []}]}]}]}"""

_MAX_DEPTH = 3
_TOP_MIN, _TOP_MAX = 4, 6
_KIDS_MIN, _KIDS_MAX = 3, 5
_TOTAL_MIN, _TOTAL_MAX = 20, 30


def _count_nodes(nodes: list) -> int:
    return sum(1 + _count_nodes(n.get("children") or []) for n in nodes if isinstance(n, dict))


def _validate_graph(nodes: list) -> list[str]:
    """校验图谱结构，返回问题清单（空 = 合格）。只查可代码判定的容量约束。"""
    issues: list[str] = []

    def walk(node: dict, depth: int) -> None:
        kids = [k for k in (node.get("children") or []) if isinstance(k, dict)]
        title = node.get("title", "?")
        if depth >= _MAX_DEPTH:
            if kids:
                issues.append(f"超过 {_MAX_DEPTH} 层：「{title}」下面还有节点")
        elif kids and not (_KIDS_MIN <= len(kids) <= _KIDS_MAX):
            issues.append(f"第 {depth} 层「{title}」有 {len(kids)} 个子节点，应为 {_KIDS_MIN}-{_KIDS_MAX}")
        for k in kids:
            walk(k, depth + 1)

    if not (_TOP_MIN <= len(nodes) <= _TOP_MAX):
        issues.append(f"顶层 {len(nodes)} 个节点，应为 {_TOP_MIN}-{_TOP_MAX}")
    for n in nodes:
        if isinstance(n, dict):
            walk(n, 1)
    total = _count_nodes(nodes)
    if not (_TOTAL_MIN <= total <= _TOTAL_MAX):
        issues.append(f"总节点 {total} 个，应为 {_TOTAL_MIN}-{_TOTAL_MAX}")
    return issues


def _assign_ids(nodes: list, prefix: str = "") -> list[dict]:
    """服务端分配稳定 id：1 / 1.2 / 1.2.3。

    不能让模型自己编号 —— 它会重复、会漂，而这 id 是分数落点和笔记归属的锚
    （结论 12：分数加在下层节点上），必须稳。
    """
    out = []
    for i, n in enumerate(nodes, 1):
        nid = f"{prefix}.{i}" if prefix else str(i)
        out.append({
            "id": nid,
            "title": str(n.get("title", "")).strip(),
            "children": _assign_ids([k for k in (n.get("children") or []) if isinstance(k, dict)], nid),
        })
    return out


def _find_nodes(nodes: list, ids: set[str]) -> list:
    """取出图谱里 id 命中的节点（含各自子树），保持原顺序。

    单元切分时一个单元能覆盖多个顶层节点（了解档会合并），所以是复数。
    """
    out = []
    for n in nodes:
        if not isinstance(n, dict):
            continue
        if n.get("id") in ids:
            out.append(n)
        else:
            out.extend(_find_nodes(n.get("children") or [], ids))
    return out


def _render_graph_for_prompt(nodes: list, depth: int = 0) -> str:
    """把图谱渲染成缩进文本给 AI 看。id 必须出现在 prompt 里 —— 切分依据就是 id。"""
    lines = []
    for n in nodes:
        if not isinstance(n, dict):
            continue
        lines.append("  " * depth + f"{n.get('id', '?')}  {n.get('title', '')}")
        kids = _render_graph_for_prompt(n.get("children") or [], depth + 1)
        if kids:
            lines.append(kids)
    return "\n".join(lines)


def _all_ids(nodes: list) -> set[str]:
    """图谱里出现过的全部节点 id。复盘缺口只能引用这里的 id，否则 ⑥ 拿它落分会落空。"""
    out: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            continue
        if isinstance(n.get("id"), str):
            out.add(n["id"])
        out |= _all_ids(n.get("children") or [])
    return out


async def generate_knowledge_graph(skill_name: str, notes: str = "") -> dict:
    """AI 生成技能知识图谱。结构不合格重试一次，仍不合格则接受并标 degraded。

    返回 {"nodes": [...], "degraded": bool, "issues": [...]}。
    degraded=True 的图谱仍可用，但父节点累加会偏 —— 必须让调用方看得见，不能静默当成功。
    """
    client = _get_client()
    if not client:
        return {"nodes": [], "degraded": False, "issues": ["AI 服务未配置"]}

    # 语境只取备注，不带 category —— 同 quiz.py::_skill_context()：category 是自由分类，
    # 实测 12 条里 5 条是错误默认值，当判据会把 AI 带偏
    context = f"{skill_name}（{notes}）" if notes.strip() else skill_name
    agent = Agent("知识图谱", _GRAPH_SYSTEM_PROMPT)
    graph: list = []
    issues: list[str] = []

    for attempt in range(2):
        msg = f"技能：{context}"
        if issues:
            msg += "\n\n上一次生成有以下结构问题，请修正后重新输出整棵树：\n- " + "\n- ".join(issues)
        raw = await agent.call(msg, json_mode=True, max_tokens=8192)  # 20-30 节点 JSON，1000 必截断
        data = _parse_json_defensive(raw) if raw else {}
        nodes = data.get("nodes") if isinstance(data, dict) else None
        if not isinstance(nodes, list) or not nodes:
            issues = ["返回内容不是合法 JSON，或缺少 nodes 数组"]
            continue
        issues = _validate_graph(nodes)
        if not issues:
            return {"nodes": _assign_ids(nodes), "degraded": False, "issues": []}
        logger.warning(f"知识图谱结构不合格（第 {attempt + 1}/2 次）：{issues}")
        graph = nodes

    return {"nodes": _assign_ids(graph), "degraded": True, "issues": issues}


def _validate_plan_coverage(steps: list, top_ids: list[str]) -> list[str]:
    """校验学习单元对图谱顶层节点的覆盖：不重、不漏、id 都真实存在。

    和 `_validate_graph` 同一个理由 —— 覆盖是**代码可判定**的，不用烧 AI 调用去问评审 agent。
    漏掉一个顶层节点 = 那块知识永远不会被安排学，必须拦。
    """
    issues: list[str] = []
    valid = set(top_ids)
    seen: list[str] = []
    for s in steps:
        if not isinstance(s, dict):
            continue
        title = s.get("title", "?")
        ids = [i for i in (s.get("node_ids") or []) if isinstance(i, str)]
        if not ids:
            issues.append(f"单元「{title}」的 node_ids 是空的，没覆盖任何顶层节点")
            continue
        unknown = [i for i in ids if i not in valid]
        if unknown:
            issues.append(f"单元「{title}」引用了不存在的节点 {unknown}，只能用顶层节点 id {top_ids}")
        seen.extend(i for i in ids if i in valid)
    dup = sorted({i for i in seen if seen.count(i) > 1})
    if dup:
        issues.append(f"顶层节点被多个单元重复覆盖：{dup}")
    missing = [i for i in top_ids if i not in seen]
    if missing:
        issues.append(f"有顶层节点没有任何单元覆盖：{missing}")
    return issues


async def generate_learning_plan(
    skill_name: str,
    required_level: str,
    prior_understanding: str = "",
    graph: list | None = None,
) -> dict:
    """AI 生成学习计划 —— 把知识图谱切分成学习单元（结论 8/9：图谱先生成，计划据图切分）。

    `graph` 是 `POST /api/skills/:id/graph` 落库后读回的那棵树（id 已由服务端分配）。
    覆盖不合格重试一次，仍不合格则接受并带上 coverage_issues —— 一份漏了一个单元的
    真计划，仍好过 _default_learning_plan 那份硬编码占位。
    """
    client = _get_client()
    graph = graph or []
    if not client or not graph:
        return _default_learning_plan(skill_name)

    top_ids = [n["id"] for n in graph if isinstance(n, dict) and "id" in n]
    request = {
        "skill_name": skill_name,
        "required_level": required_level,
        "prior_understanding": prior_understanding,
        "graph": graph,
    }
    review_ctx = f"要求掌握程度：{required_level}；学习者现状：{prior_understanding or '无'}；学习目标：掌握 {skill_name}"
    extra = ""

    def build_msg(feedback: str) -> str:
        base = f"技能：{skill_name}\n要求掌握程度：{required_level}\n我的现状理解：{prior_understanding}".rstrip()
        return base + _feedback_block(feedback) + extra

    best: dict = {}
    for attempt in range(2):
        content, _ = await review_pipeline(
            _plan_gen,
            build_msg,
            [(_lecturer, review_ctx), (_sim_user, review_ctx)],
            request=request,
            max_rounds=1,  # 评审不过 → 带反馈重写一轮（棘轮保证只变好不变差）
            json_mode=True,
            # 推理模型会把预算先烧在思考上，大技能（6-10 步 JSON）1000 必截断，截断 JSON 解析失败会静默降级
            max_tokens=8192,
        )
        result = _parse_json_defensive(content) if content else {}
        if not result.get("steps"):
            extra = "\n\n上一次没有产出合法的 steps 数组，请重新输出完整 JSON。"
            continue
        issues = _validate_plan_coverage(result["steps"], top_ids)
        if not issues:
            return result
        logger.warning(f"学习计划覆盖不合格（第 {attempt + 1}/2 次）：{issues}")
        best = result
        extra = "\n\n上一次的单元切分有以下问题，请修正后重新输出完整计划：\n- " + "\n- ".join(issues)

    if best:
        best["coverage_issues"] = _validate_plan_coverage(best["steps"], top_ids)
        return best
    return _default_learning_plan(skill_name)


def _default_jd_analysis(jd_text: str) -> dict:
    return {
        "suggested_title": "JD 分析",
        "tech_stack": [],
        "key_requirements": [jd_text[:200]],
        "role_summary": "AI 服务未配置，请设置 DEEPSEEK_API_KEY",
        "experience_years": "待分析",
        "education": "待分析",
    }


async def parse_resume_from_text(text: str) -> dict:
    """AI 解析简历文本为结构化 sections 数据"""
    client = _get_client()
    if not client:
        return _default_parsed_resume(text)

    system_prompt = """你是一位简历解析专家。请将以下简历文本解析为结构化 JSON 数据。

必须返回以下 JSON 结构（严格按此格式）：
{
  "sections": {
    "header": {
      "name": "姓名",
      "email": "邮箱",
      "phone": "电话",
      "location": "所在地",
      "title": "求职意向/目标职位"
    },
    "summary": {
      "content": "个人摘要"
    },
    "experience": [
      {"id": "imported_1", "company": "公司", "position": "职位", "start_date": "开始时间", "end_date": "结束时间", "current": false, "description": "工作描述"}
    ],
    "education": [
      {"id": "imported_1", "school": "学校", "degree": "学历", "major": "专业", "start_date": "开始时间", "end_date": "结束时间"}
    ],
    "skills": [
      {"id": "imported_1", "name": "技能名", "level": "intermediate"}
    ],
    "projects": [
      {"id": "imported_1", "name": "项目名", "role": "角色", "tech_stack": "技术栈", "description": "描述", "url": ""}
    ],
    "certifications": [
      {"id": "imported_1", "name": "证书名", "issuer": "机构", "date": ""}
    ],
    "languages": [
      {"id": "imported_1", "name": "语言", "proficiency": "conversational"}
    ]
  },
  "title": "建议的简历标题",
  "target_position": "目标职位",
  "target_company": "目标公司"
}

注意事项：
- level 可选值: beginner, intermediate, advanced, expert
- proficiency 可选值: basic, conversational, fluent, native
- id 格式: 使用 "imported_1", "imported_2" 递增编号
- 字段缺失时用空字符串或空数组
- 只返回 JSON，不要多余文字"""

    user_prompt = f"简历文本：\n{text}"

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=8192,
            timeout=60,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return result
    except (json.JSONDecodeError, AttributeError, KeyError, APIConnectionError, APIError):
        return _default_parsed_resume(text)


async def generate_quiz_questions(
    mode: str,
    skill_names: list[str],
    jd_context: str = "",
    counts: dict | None = None,
    block_context: str = "",
) -> list[dict]:
    """AI 生成面试题。block_context 非空时限定单元块（带 id 的缩进树）。

    有块就要求每题标 node_id —— 这是分数落回图谱的挂点（一个节点答对多少，
    它就拿多少分）。没块（普通刷题）不要求，node_id 留空、不计分。
    """
    client = _get_client()
    if not client:
        return _default_quiz_questions(mode, counts)

    if counts is None:
        counts = {"single_choice": 5, "multi_choice": 5, "essay": 2}

    node_rule = (
        "- 本次给了「本单元内容边界」（带 id 的缩进列表）：每道题都必须考边界内的知识点，"
        "并把该题考的节点 id 填进 node_id；id 必须原样照抄列表里的，不许自己编\n"
        "- 返回格式里每题多一个 \"node_id\" 字段"
        if block_context else
        "- 本次没有内容边界：每题 node_id 填空字符串 \"\""
    )
    system_prompt = f"""你是一位面试出题专家。请生成一套面试题，严格返回 JSON 数组。

要求：
- 按目标公司的平均水平出题，偏基础
- 选择题选项要有迷惑性
- 问答题附带评分要点作为 correct_answer
- 每题标注 type (single_choice/multi_choice/essay)
- 多选题 correct_answer 用英文逗号连接的选项字母（如 "A,C"），不要空格、不要数组、不要中文顿号
- 技能名可能一词多义（如 harness 既可能是 Agent Harness，也可能是 Harness.io CI/CD）：必须先读技能后面括号里的备注，按备注确定所指的具体技术再出题，不要按字面联想
{node_rule}

返回格式：
[
  {{
    "type": "single_choice",
    "question_text": "题目内容",
    "options": [{{"key": "A", "text": "选项A"}}, {{"key": "B", "text": "选项B"}}, {{"key": "C", "text": "选项C"}}, {{"key": "D", "text": "选项D"}}],
    "correct_answer": "A",
    "node_id": "1.2"
  }},
  {{
    "type": "multi_choice",
    "question_text": "题目内容（多选）",
    "options": [{{"key": "A", "text": "选项A"}}, {{"key": "B", "text": "选项B"}}, {{"key": "C", "text": "选项C"}}, {{"key": "D", "text": "选项D"}}],
    "correct_answer": "A,C",
    "node_id": "1.2"
  }},
  {{
    "type": "essay",
    "question_text": "问答题",
    "options": [],
    "correct_answer": "评分要点和参考回答",
    "node_id": "1.2"
  }}
]

题型数量：{counts.get('single_choice', 5)} 道单选题、{counts.get('multi_choice', 5)} 道多选题、{counts.get('essay', 2)} 道问答题"""

    user_prompt = f"面试模式：{'模拟面试' if mode == 'exam' else '刷题练习'}\n"
    if skill_names:
        # 逐行列：每项可能带「分类/说明」，逗号拼一行会糊成一团
        user_prompt += "涉及技能：\n" + "\n".join(f"- {s}" for s in skill_names) + "\n"
    if block_context:
        user_prompt += f"本单元内容边界（题只能出在这里面，node_id 只能取这里的 id）：\n{block_context}\n"
    if jd_context:
        # 只传 ID 等于没传 —— AI 看不到内容。要传的是岗位 + 技术栈 + JD 原文（调用方拼好）
        user_prompt += f"目标岗位语境（出题往这个岗位的技术栈上靠）：\n{jd_context}\n"
    user_prompt += "\n请生成题目。"

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.5,
            max_tokens=8192,
            timeout=60,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        result = json.loads(content)
        if isinstance(result, dict) and "questions" in result:
            return result["questions"]
        if isinstance(result, list):
            return result
        return _default_quiz_questions(mode, counts)
    except (json.JSONDecodeError, AttributeError, Exception):
        return _default_quiz_questions(mode, counts)


def _render_cornell(cornell: str) -> str:
    """笔记是 {cues, notes, summary} 的 JSON 串，拆成三栏给 AI 读。

    原样丢一串 JSON 模型也能读，但 Cornell 的三栏各有各的角色（线索是问题、笔记是内容、
    总结是收敛），摊平了它才好对着判「哪栏在糊弄」。解不开就原样给，别把内容丢了。
    """
    try:
        d = json.loads(cornell)
        cues = [c for c in (d.get("cues") or []) if isinstance(c, str) and c.strip()]
        parts = []
        if cues:
            parts.append("【线索栏】\n" + "\n".join(f"- {c}" for c in cues))
        if str(d.get("notes") or "").strip():
            parts.append(f"【笔记栏】\n{d['notes']}")
        if str(d.get("summary") or "").strip():
            parts.append(f"【总结栏】\n{d['summary']}")
        return "\n\n".join(parts) if parts else cornell
    except (json.JSONDecodeError, AttributeError, TypeError):
        return cornell


_NOTES_CHAT_PROMPT = """你是「问一问」—— 用户学习笔记的对话伙伴。用户在一个学习单元里写了 Cornell 笔记（线索 / 笔记 / 总结三栏），你的工作是先读懂他，然后陪他聊。

对话历史为空（开场）：读一遍笔记，做一段**简短**的开场 —— 先用一两句复述你读到的他的思路，再指出明显没说到、没想清楚的地方。开场要短，别写小作文、别罗列成报告、别客套。

有来有回之后：就当普通聊天接话，始终结合语境里的笔记和【内容边界】。

规矩：
- 笔记可能还没写完 —— 按现状读，别催他补全。
- 不判分、不给等级、不宣布「通过」。你不是考官。
- 没发现明显缺口就别硬凑：说一句这块记得比较完整，然后给两个出口 —— ① 换个角度让他再讲两句 ② 去费曼房间把这块讲一遍。
- 【内容边界】里的 id 可以引用（说清是哪个知识点没被提到），但别把回话写成清单。
- 只说中文。"""

# 对话历史最多带这么多条（10 轮）。再往前的靠笔记本身承载 —— 语境是笔记，不是聊天记录（结论 10）
_CHAT_HISTORY_LIMIT = 20


async def notes_chat_stream(
    skill_name: str, skill_notes: str, cornell: str, graph_block: str = "", messages: list[dict] | None = None
) -> AsyncGenerator[str, None]:
    """问一问（结论 5）：读这块笔记 → 轻点评 + 指不足，然后接着聊。

    messages 是前端给的对话历史（[{role: "user"|"ai", content}]），[] = 开场。
    语境每次请求现拼（技能备注 + 这块图谱 + 最新笔记原文），服务端不存会话 —— 无状态（结论 4/10）。
    不判分、不落库（结论 27）。事件：{content, done} 逐字块，失败在收尾事件带 error。
    """
    client = _get_client()
    if not client:
        yield json.dumps({"content": "", "done": True, "error": "AI 服务未配置，请设置 DEEPSEEK_API_KEY"})
        return

    # 语境只取备注，不带 category —— 同 quiz.py::_skill_context()
    context = f"{skill_name}（{skill_notes}）" if skill_notes.strip() else skill_name
    block_section = (
        f"【内容边界】这块笔记对应的知识点（id 是它在图谱里的位置）\n{graph_block}"
        if graph_block
        else "【内容边界】（这个单元还没有图谱，按技能整体聊）"
    )
    system_prompt = (
        f"{_NOTES_CHAT_PROMPT}\n\n【语境】\n技能：{context}\n\n"
        f"{block_section}\n\n【笔记原文】\n{_render_cornell(cornell)}"
    )

    history = [
        {"role": "assistant" if m.get("role") == "ai" else "user", "content": m.get("content") or ""}
        for m in (messages or [])
    ][-_CHAT_HISTORY_LIMIT:]
    if not history:
        history.append({"role": "user", "content": "（请先读一遍这份笔记，做简短的开场点评）"})

    try:
        stream = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[{"role": "system", "content": system_prompt}, *history],
            temperature=0.7,
            # 推理模型的思考也吃预算：2000 会被烧穿返回空（2026-10-10 实证），直接给 4096
            max_tokens=4096,
            timeout=120,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield json.dumps({"content": delta.content, "done": False})
        yield json.dumps({"content": "", "done": True})
    except Exception as e:
        logger.error(f"notes_chat_stream 失败: {e}")
        yield json.dumps({"content": "", "done": True, "error": f"AI 回复失败: {str(e)}"})


async def grade_essay_answer(question: str, user_answer: str, reference_answer: str) -> dict:
    """AI 评阅问答题"""
    client = _get_client()
    if not client:
        return {"score": 0, "feedback": "AI 评分服务未配置", "reference": reference_answer}

    system_prompt = """你是一位面试评分专家。请评阅以下问答题的回答，返回 JSON：
{
  "score": 0-100,
  "feedback": "详细的评语，指出优点和不足",
  "reference": "参考答案（如果原有参考答案不完整，请补充）"
}

评分标准：
- 正确性 (40%)：答案是否准确
- 完整性 (30%)：是否涵盖了核心要点
- 表述 (30%)：是否清晰有条理"""

    user_prompt = f"题目：{question}\n\n用户回答：{user_answer}\n\n参考回答：{reference_answer}"

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
            timeout=120,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except (json.JSONDecodeError, AttributeError, Exception):
        return {"score": 50, "feedback": "AI 评分暂不可用", "reference": reference_answer}


async def extract_text_from_image(image_bytes: bytes) -> str:
    """从图片中提取文字（使用 Tesseract OCR）"""
    try:
        import pytesseract
        from PIL import Image
        import io

        # Configure pytesseract for Windows
        tesseract_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for p in tesseract_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                break

        # Use user-writable tessdata directory if available
        user_tessdata = os.path.expanduser(r"~\.tesseract\tessdata")
        if os.path.isdir(user_tessdata):
            os.environ["TESSDATA_PREFIX"] = user_tessdata

        image = Image.open(io.BytesIO(image_bytes))
        # Try Chinese + English, fallback to English only
        try:
            text = pytesseract.image_to_string(image, lang="chi_sim+eng")
        except Exception:
            text = pytesseract.image_to_string(image, lang="eng")
        return text.strip()
    except ImportError:
        return ""
    except Exception:
        return ""


def _default_quiz_questions(mode: str, counts: dict | None = None) -> list[dict]:
    """AI 不可用时的降级题库"""
    return [
        {
            "type": "single_choice",
            "question_text": "AI 服务未配置，请设置 DEEPSEEK_API_KEY 后重新生成题目",
            "options": [{"key": "A", "text": "配置 API Key"}, {"key": "B", "text": "忽略"}],
            "correct_answer": "A",
        },
    ]


def _default_learning_plan(skill_name: str) -> dict:
    """AI 不可用时的降级学习计划"""
    return {
        "required_level": "待分析",
        "steps": [
            {"step": 1, "title": f"{skill_name} 入门基础", "description": "AI 服务未配置，请设置 DEEPSEEK_API_KEY 后重新生成", "estimated_hours": 0, "topics": []},
        ],
        "milestones": [],
    }


def _default_parsed_resume(text: str) -> dict:
    """AI 不可用时的降级解析：将全文放入 summary"""
    return {
        "sections": {
            "summary": {"content": text[:2000]},
        },
        "title": "导入的简历",
        "target_position": "",
        "target_company": "",
    }


# ═══ 模拟面试 AI ═══


INTERVIEW_TYPE_PROMPTS = {
    "comprehensive": """面试范围：综合面试。涵盖技术基础、项目经验、场景设计、行为问题等全方位考察。""",
    "algorithm": """面试范围：算法与数据结构专项面试。重点考察：
- 数据结构：数组、链表、树、图、哈希表、堆、栈、队列
- 算法：排序、搜索、动态规划、贪心、回溯、图算法
- 复杂度分析与优化
- 代码质量与边界条件处理
- 出题应为经典或中等变体，无需运行环境，面试者口述思路即可""",
    "system_design": """面试范围：系统设计专项面试。重点考察：
- 系统架构设计与模块拆分
- 数据库设计（Schema、索引、分库分表）
- 高并发、高可用、可扩展性
- 缓存、消息队列、微服务
- 根据面试者经验调整深度，可讨论具体场景的 trade-off""",
    "behavioral": """面试范围：行为面试。重点考察：
- STAR 法则：情景(Situation)、任务(Task)、行动(Action)、结果(Result)
- 团队协作与冲突处理
- 项目管理与时间规划
- 职业规划与求职动机
- 领导力与影响力
- 失败经历与成长
- 对每个回答追问细节，验证真实性""",
}

DIFFICULTY_PROMPTS = {
    "junior": """当前面试难度：初级（Junior）
- 考察基础概念和常见用法
- 问题直接，不设陷阱
- 对回答宽容，有提示和引导
- 评分标准较温和""",
    "mid": """当前面试难度：中级（Mid-level）
- 考察理解深度和实践经验
- 包含一定 follow-up 追问
- 需要展示原理理解和最佳实践
- 评分标准正常""",
    "senior": """当前面试难度：高级（Senior）
- 考察深度原理、架构视野和决策能力
- 问题开放、多角度、有 trade-off
- 追问深入直至边界
- 评分标准严格，要求完整性和深度""",
}


async def _recent_avg_score(messages: list[dict], n: int = 3) -> float | None:
    """计算最近 N 个用户回答的平均分"""
    scores = []
    for m in reversed(messages):
        if m["role"] == "user":
            meta = m.get("metadata_json", {})
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            score = meta.get("score")
            if isinstance(score, (int, float)):
                scores.append(score)
                if len(scores) >= n:
                    break
    if not scores:
        return None
    return sum(scores) / len(scores)


async def _determine_difficulty(messages: list[dict], current_level: str) -> str:
    """根据近期表现动态调整难度"""
    avg = await _recent_avg_score(messages, 3)
    if avg is None:
        return current_level

    levels = ["junior", "mid", "senior"]
    idx = levels.index(current_level) if current_level in levels else 1

    if avg >= 8.0 and idx < len(levels) - 1:
        return levels[idx + 1]  # 升级
    elif avg <= 4.0 and idx > 0:
        return levels[idx - 1]  # 降级
    return current_level


async def mock_interview_stream(
    position: str,
    company: str,
    messages: list[dict],
    jd_context: str = "",
    interview_type: str = "comprehensive",
    difficulty_level: str = "mid",
) -> AsyncGenerator[str, None]:
    """AI 面试官流式回复。messages: [{role, content}, ...]"""
    client = _get_client()
    if not client:
        yield json.dumps({"content": "AI 服务未配置，请设置 DEEPSEEK_API_KEY", "type": "feedback", "done": True})
        return

    # 构建 system prompt
    jd_section = f"\n职位要求：{jd_context}" if jd_context else ""
    type_guide = INTERVIEW_TYPE_PROMPTS.get(interview_type, INTERVIEW_TYPE_PROMPTS["comprehensive"])
    diff_desc = DIFFICULTY_PROMPTS.get(difficulty_level, DIFFICULTY_PROMPTS["mid"])

    system_prompt = f"""你是一位资深技术面试官，正在进行一场中文模拟面试。
面试岗位：{position}
目标公司：{company}{jd_section}

{type_guide}

{diff_desc}

你的回复格式：
1. 每次回复以「**评分：X/10**」开头（满分10分），后跟简要评语
2. 然后提出下一个问题
3. 如果用户回答为空或答非所问，可以追问引导
4. 所有对话使用中文
5. 面试应自然推进，避免机械感"""

    # 构建对话历史（映射 ai → assistant 以符合 DeepSeek API）
    chat_history = []
    for m in messages:
        role = "assistant" if m["role"] == "ai" else "user"
        # 只保留 content，跳过 metadata 相关字段
        chat_history.append({"role": role, "content": m["content"]})

    # 如果消息为空（首次），AI 做自我介绍
    if not chat_history:
        chat_history.append({"role": "user", "content": "请开始面试。"})

    try:
        stream = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                *chat_history,
            ],
            temperature=0.7,
            max_tokens=1024,
            timeout=60,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield json.dumps({"content": delta.content, "type": "feedback", "done": False})

        yield json.dumps({"content": "", "type": "feedback", "done": True})
    except Exception as e:
        logger.error(f"mock_interview_stream 失败: {e}")
        yield json.dumps({"content": f"AI 回复失败: {str(e)}", "type": "feedback", "done": True})


async def evaluate_mock_answer(question: str, user_answer: str, position: str) -> dict:
    """评估单次回答，返回分数和评语"""
    client = _get_client()
    if not client:
        return {"score": 5, "feedback": "AI 评估暂不可用", "strengths": [], "weaknesses": []}

    system_prompt = """你是一位面试评分专家。请评估面试者对该面试问题的回答，返回 JSON：
{
  "score": 1-10,
  "feedback": "简要评语，指出优点和不足（20字以内）",
  "strengths": ["优点1"],
  "weaknesses": ["不足1"]
}

评分标准：
- 技术准确性 (40%)
- 表达清晰度 (30%)
- 深度与广度 (30%)"""

    user_prompt = f"面试岗位：{position}\n面试问题：{question}\n\n面试者回答：{user_answer}"

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=500,
            response_format={"type": "json_object"},
            timeout=120,
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"evaluate_mock_answer 失败: {e}")
        return {"score": 5, "feedback": "评估暂不可用", "strengths": [], "weaknesses": []}


async def generate_interview_feedback(position: str, company: str, messages: list[dict]) -> dict:
    """生成面试综合评价"""
    client = _get_client()
    if not client:
        return {"summary_score": 0, "strengths": [], "weaknesses": [], "suggestions": []}

    # 构建对话摘要
    dialogue = "\n".join(
        f"{'面试官' if m['role'] == 'ai' else '面试者'}: {m['content'][:200]}"
        for m in messages
    )

    system_prompt = """你是一位资深面试官。请根据整场面试对话，给出综合评价，返回 JSON：
{
  "summary_score": 0-100,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": ["改进建议1", "改进建议2"]
}

评分标准：
- 技术能力 (40%)
- 沟通表达 (30%)
- 综合素质 (30%)"""

    user_prompt = f"面试岗位：{position}\n目标公司：{company}\n\n面试记录：\n{dialogue}"

    try:
        response = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"},
            timeout=120,
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"generate_interview_feedback 失败: {e}")
        return {"summary_score": 0, "strengths": [], "weaknesses": [], "suggestions": []}

