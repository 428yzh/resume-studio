"""费曼教学 · 数字学生

用户给 AI 讲课，AI 作为"数字学生"批判式听讲。
五级理解状态机（单调上升，不允许跳级）：
  L1 混沌  讲解含未知术语/结构缺失   → clarify_term     要术语定义
  L2 字面  能复述但缺例子/同义词     → ask_example      复述 + 要例子
  L3 关联  搭逻辑链发现缺环          → breadth_question 广度追问（预算×2）
  L4 重构  链条补全                  → restatement      用自己的话完整复述
  L5 辩证  主动找矛盾/边界           → depth_question   深度追问（预算×2）

**等级判据 = 知识点覆盖度**（2026-10-04，待决策 D12）：房间从技能图谱的顶层节点取一份
点单，每轮由 AI 判定「到目前为止讲对了哪些点」（累计集合），等级 = 覆盖率分档。
覆盖集合没变的轮次等级原地不动 —— 判据落在内容推进上，不在发言轮次上
（旧实现让 AI 每轮自由提级，实测「用户每说一句就升一级」）。
提问预算 = L3 广度 ×2、L5 深度 ×2，问一次扣一次。
没图谱的主题房没有点单 → 退回旧的「AI 提级 + clamp」路径，行为不变。
"""
import asyncio
import json
import logging

from typing import AsyncGenerator

from app.config import settings
from app.services.ai_service import _get_client

logger = logging.getLogger(__name__)

LEVEL_LABELS = {
    1: "混沌",
    2: "字面",
    3: "关联",
    4: "重构",
    5: "辩证",
}

ACTIONS = ("clarify_term", "ask_example", "breadth_question", "restatement", "depth_question", "correction", "done")

# 各等级允许的动作（等级钳制后动作必须对齐等级）
_LEVEL_ACTIONS = {
    1: {"clarify_term", "ask_example"},
    2: {"ask_example", "clarify_term"},
    3: {"breadth_question", "restatement"},
    4: {"restatement", "breadth_question"},
    5: {"depth_question", "done", "restatement"},
}
_DEFAULT_ACTION = {1: "clarify_term", 2: "ask_example", 3: "restatement", 4: "restatement", 5: "done"}


def clamp_level(proposed: int, current: int) -> int:
    """等级钳制：上升最多 +1、下降最多 -1（不允许跳级，允许因发现错误而回落）。"""
    if proposed >= current:
        return min(proposed, current + 1) if current < 5 else 5
    return max(proposed, current - 1)  # 发现理解被推翻 → 允许降一级


# ─── 覆盖度判级（D12）：等级 = 讲对了几个知识点，不是说了几句话 ────
# 分档：0 个 → L1；不到一半 → L2；过半 → L3；多半 → L4；全部 → L5。
# 阈值只在这张表里（5 个顶层节点时刚好一个点一档）。
_COVERAGE_BANDS = ((0.5, 2), (0.8, 3), (1.0, 4))


def level_from_coverage(covered: int, total: int) -> int:
    """覆盖率 → 等级档位。没点单（total=0）时返回 1，调用方走旧路径。
    ⚠️ 与前端「知识覆盖」条的档位是同一套（前端只显示 k/n，不复制阈值）。"""
    if total <= 0 or covered <= 0:
        return 1
    ratio = covered / total
    for threshold, level in _COVERAGE_BANDS:
        if ratio < threshold:
            return level
    return 5


def sanitize_covered(raw, points: list[dict]) -> list[str]:
    """只认点单里的 id，按点单顺序去重返回。

    跟出题的 node_id 同一条规矩：AI 编的 id 落库后永远匹配不到，界面上的
    缺口清单会凭空多一条还查不出原因。"""
    if not isinstance(raw, list):
        return []
    hit = {x for x in raw if isinstance(x, str)}
    return [p["id"] for p in points if p.get("id") in hit]


def uncovered_titles(points: list[dict], covered: list[str]) -> list[str]:
    """没讲到的知识点标题（进 PPT 报告的薄弱点页）"""
    done = set(covered)
    return [p["title"] for p in points if p.get("id") not in done]


def resolve_action(level: int, proposed_action: str, breadth_left: int, depth_left: int) -> str:
    """把动作对齐到（钳制后的）等级，并做预算兜底。"""
    if proposed_action in _LEVEL_ACTIONS.get(level, set()):
        action = proposed_action
    else:
        action = _DEFAULT_ACTION[level]
    if level == 3 and action == "breadth_question" and breadth_left <= 0:
        action = "restatement"
    if level == 5 and action == "depth_question" and depth_left <= 0:
        action = "done"
    return action


def apply_budget(action: str, level: int, breadth_left: int, depth_left: int) -> tuple[int, int]:
    """广度/深度追问扣预算。返回 (breadth_left, depth_left)。"""
    if action == "breadth_question" and level >= 3 and breadth_left > 0:
        return breadth_left - 1, depth_left
    if action == "depth_question" and level == 5 and depth_left > 0:
        return breadth_left, depth_left - 1
    return breadth_left, depth_left


def _system_prompt(name: str, level: int, breadth_left: int, depth_left: int) -> str:
    return f"""你是一位「数字学生」，正在参加费曼教学。用户扮演老师，给你讲「{name}」这个主题。

你没有任何先验知识，只相信用户教你的内容。你要批判式地听讲：时刻留意老师讲解里
的【模糊不清】【前后矛盾】【知识遗漏】，并据此追问。你是来暴露理解盲区的，不是来奉承老师的。

你的理解分为 5 级，等级只能单调上升、不能跳级：
L1 混沌：讲解里有你不认识的术语、或整体结构缺失。→ 你指出不认识的术语，请老师解释。
L2 字面：你能把老师的话复述一遍，但找不到同义词或例子。→ 你复述你的理解，然后要一个例子。
L3 关联：你尝试把老师讲的内容搭成一条逻辑链，发现链条缺了一环（老师没讲清的部分）。→ 你说出你搭的链，指出缺的那环，然后问一个广度问题。（剩余广度追问 {breadth_left} 个）
L4 重构：链条补全了。→ 你用你自己的话，把这条逻辑链完整复述出来。
L5 辩证：你主动寻找矛盾或边界情况。→ 你提出一个边界场景追问老师。（剩余深度追问 {depth_left} 个）

规则：
1. 只讲你当前等级该做的事，不要提前做高级别的事。
2. 所有回复用中文，口语化，像真的学生一样。
3. 等级判定必须诚实：达不到 L4 不能声称 L4，也不能跳级。

等级判定指引（根据老师讲解的质量判断你现在的理解）：
- 讲解里还有你不知道的术语、或整体结构缺失 → L1
- 你能把老师的话复述一遍（没有拦路的术语）→ L2
- 你能把要点串成一条逻辑链，但链条有缺环（老师没讲清的地方）→ L3
- 链条完整，你能用自己的话重构 → L4
- 你能主动发现矛盾或边界情况 → L5
你的等级跟着老师讲解的完整度走。老师讲得清楚完整，你的等级就该往上走，
不要因为没有先验知识而永远停在 L1；但也绝不能跳级。
"""


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


# ─── 阶段 A：定级（非流式，小调用）─────────────────────────────
def _assess_fallback(level: int) -> dict:
    """AI 不可用时保持当前等级，返回兜底动作，不假装理解提升。degraded 让调用方别当「零卡点」。"""
    return {"level": level, "action": "ask_example", "blind_spot": "", "error": "", "degraded": True}


async def _chat_json(prompt: str, history: list[dict], *, max_tokens: int, temperature: float, label: str) -> dict:
    """调一次 JSON 模式的小模型调用。解析失败/异常重试 3 次，全失败返回 {}（调用方兜底）。

    DeepSeek 偶发返回空内容，所以重试是必需品，不是防御性代码。"""
    client = _get_client()
    if not client:
        return {}
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=settings.deepseek_model,
                messages=[{"role": "system", "content": prompt}, *history],
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=60,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or ""
            data = _parse_json_defensive(raw)
            if not data:
                logger.warning(f"{label} 第{attempt + 1}次无法解析: {raw[:200]!r}")
                await asyncio.sleep(0.6)
                continue
            return data
        except Exception as e:
            logger.error(f"{label} 第{attempt + 1}次失败: {e}")
            await asyncio.sleep(0.6)
    return {}


async def assess_level(name: str, messages: list[dict], level: int, breadth_left: int, depth_left: int) -> dict:
    """评估【老师讲解的完整度】对应数字学生能站到的等级 + 本轮动作。

    注意：判定标准是老师讲解的质量（是否模糊/遗漏），不是数字学生自认懂不懂。
    """
    if not _get_client():
        return _assess_fallback(level)

    # 只评估老师的讲解质量，不引入学生自己的困惑（防止被学生自报带偏）
    history = [{"role": "user", "content": m["content"]} for m in messages if m["role"] == "user"]
    if not history:
        history = [{"role": "user", "content": "老师请开始讲课。"}]

    prompt = f"""你是费曼教学中的「理解等级判定器」。学生正在学习主题「{name}」。

请评估【老师当前的讲解】能让数字学生达到哪个理解等级。判定标准是讲解质量，不是学生懂不懂：

L1 混沌：讲解还是零散术语，没串成结构（老师还没讲到核心）
L2 字面：讲解给了定义/机制，但没给例子或类比（学生只能字面复述）
L3 关联：讲解给了例子/类比，但关键知识点之间的衔接没讲清（逻辑链有缺环）
L4 重构：讲解结构完整、例子充分、正确，学生能用自己话重构整条逻辑链
L5 辩证：L4 达成后，数字学生主动探索边界——找边界情况、异常、矛盾，向纵深追问

注意：老师用领域术语是正常的，有术语 ≠ L1。只有术语连定义都没有、讲解根本不成结构才算 L1。
判定看【老师讲得完不完整】，不是看术语多少。

正确性检查（很重要）：逐条核对老师讲的内容。如果发现：
- 概念讲错了、自相矛盾、或与事实明显不符
- 就绝不能判高等级，等级要降下来，action 用 correction，并把错处写进 "error" 字段
- 没有错误时 "error" 必须为空字符串

规则：
- 诚实：讲解质量达到哪级就判哪级，不保守也不浮夸
- 看对话整体，老师讲得越完整等级越高（等级上限由系统控制，你只管评质量）

只输出 JSON，格式：
{{"level": 1-5,
 "action": "clarify_term|ask_example|breadth_question|restatement|depth_question|correction|done",
 "blind_spot": "老师讲解里还模糊/遗漏的点（可空）",
 "error": "老师讲错的地方（可空，没错必须空）"}}

action 含义（数字学生本轮该做的事）：
- clarify_term: 还有未解释术语 → 请老师解释
- ask_example: 缺例子/类比 → 复述 + 要例子
- breadth_question: 链条有缺环 → 搭逻辑链 + 问广度问题（剩余 {breadth_left} 个）
- restatement: 结构完整 → 用自己的话重构
- depth_question: 达到 L5 → 主动找边界情况 + 问深度问题（剩余 {depth_left} 个）
- correction: 发现老师讲错了 → 温和指出 + 用提问引导老师自己发现，不直接否定
- done: 完全理解 → 总结并建议生成报告"""
    data = await _chat_json(prompt, history, max_tokens=512, temperature=0.3, label="assess_level")
    if not data:
        return _assess_fallback(level)
    return {
        "level": int(data.get("level", level)),
        "action": data.get("action", "ask_example"),
        "blind_spot": str(data.get("blind_spot", "")),
        "error": str(data.get("error", "")),
    }


# ─── 阶段 A（覆盖度版）：判定讲到哪几个知识点 ──────────────────
def _coverage_fallback(level: int) -> dict:
    """AI 不可用：covered=None 表示「判定没跑成」，调用方保持原覆盖集合与等级，
    绝不能当「一个都没讲对」——曾返回 []，一次 AI 抖动就把已有覆盖清空、等级拉回 L1。"""
    return {
        "covered": None,
        "action": _DEFAULT_ACTION.get(level, "ask_example"),
        "blind_spot": "",
        "error": "",
        "degraded": True,
    }


async def assess_coverage(
    name: str, messages: list[dict], points: list[dict], level: int, breadth_left: int, depth_left: int
) -> dict:
    """判定【到目前为止讲对了哪些知识点】（累计集合）+ 本轮动作。

    等级不在这里定 —— 调用方用 level_from_coverage 从覆盖集合算，
    覆盖没涨的轮次等级原地不动（D12：判据落在内容推进上）。
    """
    if not _get_client():
        return _coverage_fallback(level)

    history = [{"role": "user", "content": m["content"]} for m in messages if m["role"] == "user"]
    if not history:
        history = [{"role": "user", "content": "老师请开始讲课。"}]

    point_list = "\n".join(f"{p['id']}  {p['title']}" for p in points)
    prompt = f"""你是费曼教学中的「知识点覆盖判定器」。学生正在学习主题「{name}」，老师（用户）在给他讲课。

这个主题的知识点清单（编号是系统发的锚，原样引用，不要改写、不要编新的）：
{point_list}

请判断：**到目前为止**，老师把哪些知识点讲清楚了。

判定要严，宁可少算：
- 只是提到名字、一带而过 → 不算讲清楚
- 要算讲清楚：这个点的核心机制 / 因果 / 怎么用，至少讲对一层
- 老师讲错的点绝不能算，并把错处写进 "error"

规则：
- "covered" 是**累计**集合（把之前几轮讲对的也算上），不是本轮新增
- 只输出清单里出现过的 id，不要编
- 只核对老师讲的内容，不看学生自己怎么想

只输出 JSON：
{{"covered": ["1", "2"],
 "action": "clarify_term|ask_example|breadth_question|restatement|depth_question|done",
 "blind_spot": "老师讲解里还模糊/遗漏的点（可空）",
 "error": "老师讲错的地方（可空，没错必须空）"}}

action 含义（数字学生本轮该做的事，当前等级 L{level}）：
- clarify_term: 还有未解释术语 → 请老师解释
- ask_example: 缺例子/类比 → 复述 + 要例子
- breadth_question: 链条有缺环 → 搭逻辑链 + 问广度问题（剩余 {breadth_left} 个）
- restatement: 结构完整 → 用自己的话重构
- depth_question: 已覆盖全部知识点 → 主动找边界情况 + 问深度问题（剩余 {depth_left} 个）
- done: 完全理解 → 总结并建议生成报告"""
    data = await _chat_json(prompt, history, max_tokens=512, temperature=0.3, label="assess_coverage")
    if not data or not isinstance(data.get("covered"), list):
        return _coverage_fallback(level)
    return {
        "covered": data["covered"],
        "action": data.get("action", "ask_example"),
        "blind_spot": str(data.get("blind_spot", "")),
        "error": str(data.get("error", "")),
    }


# ─── 阶段 B：按等级流式回复 ───────────────────────────────────
async def feynman_tutor_stream(name: str, messages: list[dict], level: int, action: str, blind_spot: str, error: str = "") -> AsyncGenerator[str, None]:
    """按 (level, action) 生成数字学生的流式回复。yield JSON 串。"""
    client = _get_client()
    if not client:
        yield json.dumps({"content": "AI 服务未配置，暂时无法回应你的讲解。请稍后再试。", "done": True})
        return

    history = [
        {"role": "assistant" if m["role"] == "ai" else "user", "content": m["content"]}
        for m in messages
    ]

    action_guide = {
        "clarify_term": "你还没听懂，指出讲解里不认识的术语或缺失的结构，请老师解释。语气带着困惑。",
        "ask_example": "你复述自己目前的字面理解，然后请老师给一个例子或同义词，帮你把抽象变具体。",
        "breadth_question": "你把搭好的逻辑链说出来，然后指出缺的那一环，问老师一个广度问题（这个知识点和另一个知识的衔接）。",
        "restatement": "你先把整条逻辑链用自己的话完整复述一遍，但复述前要回头检查老师的讲解：如果发现哪里讲得含糊或不对，指出来追问；确认无误才确认理解。",
        "depth_question": "你主动找一个边界情况、异常场景或矛盾点，把它摆出来，问老师：遇到这种情况应该怎么办？",
        "correction": "你发现老师刚才有一处讲得不太对。用温和的方式指出来：「老师，我好像记得这里不太一样，会不会是……？」然后问一个引导性的问题，让老师自己重新想，而不是直接否定或替老师讲完。",
        "done": "你确认自己已经完全理解了，用一两句话总结，并告诉老师可以生成学习报告了。",
    }
    guide = action_guide.get(action, action_guide["ask_example"])
    blind = f"\n老师刚才讲解里你留意到的点：{blind_spot}" if blind_spot else ""
    err = f"\n你发现老师讲错的地方：{error}（必须温和指出并用提问引导老师自己发现）" if error else ""

    system_prompt = f"""{_system_prompt(name, level, 0, 0)}

你现在位于理解等级 L{level}（{LEVEL_LABELS.get(level, "")}），本轮你的任务是：
{guide}{blind}{err}

直接输出你的回复正文，不要加 JSON 包装，不要重复你的等级编号。"""
    try:
        stream = await client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[{"role": "system", "content": system_prompt}, *history],
            temperature=0.7,
            max_tokens=8192,  # 推理模型思考吃 token，给足避免话没说完被截断
            timeout=120,
            stream=True,
        )
        produced = False
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                produced = True
                yield json.dumps({"content": delta.content, "done": False})
        if not produced:
            # DeepSeek 偶发返回空流，兜底不让对话断掉
            yield json.dumps({"content": "（我还在消化，老师能不能再说细一点？）", "done": False})
        yield json.dumps({"content": "", "done": True})
    except Exception as e:
        logger.error(f"feynman_tutor_stream 失败: {e}")
        yield json.dumps({"content": "（数字学生暂时回应不了，请稍后再试）", "done": True})


# ─── 报告：结构化 slides + python-pptx 渲染 ───────────────────
DEFAULT_SLIDES = [
    {"title": "学习总结", "bullets": ["本主题已完成费曼五级理解。", "可通过 AI 生成更详细的学习报告。"]},
]


async def generate_report_slides(
    name: str, messages: list[dict], level: int, weak_points: list[str] | None = None,
    uncovered: list[str] | None = None,
) -> dict:
    """生成报告内容：{title, summary, slides: [{title, bullets}], weak_points}"""
    weak_points = weak_points or []
    uncovered = uncovered or []
    client = _get_client()
    if not client:
        return {"title": name, "summary": "", "slides": DEFAULT_SLIDES, "weak_points": weak_points}

    history = [
        {"role": "assistant" if m["role"] == "ai" else "user", "content": m["content"]}
        for m in messages[-30:]
    ]
    wp_section = ""
    if weak_points:
        wp_section = "\n学习中记录的真实薄弱点（必须体现在报告中）：\n" + "\n".join(f"- {w}" for w in weak_points)
    if uncovered:
        wp_section += "\n老师始终没讲到的知识点（必须写进薄弱点，作为下一步）：\n" + "\n".join(f"- {t}" for t in uncovered)
    prompt = f"""你是费曼教学报告生成器。数字学生刚学完了「{name}」这个主题，理解等级 L{level}。
请根据下面的师生对话，生成一份学习报告。只输出 JSON：
{{"title": "报告标题", "summary": "三句话总结学到了什么",
"slides": [{{"title": "幻灯片标题", "bullets": ["要点1", "要点2", "..."]}}],
"weak_points": ["学习中暴露的薄弱点"]}}
要求：slides 4-6 页，第一页是概览，中间按知识结构，最后一页是薄弱点与下一步。{wp_section}"""
    for attempt in range(2):
        try:
            resp = await client.chat.completions.create(
                model=settings.deepseek_model,
                messages=[{"role": "system", "content": prompt}, *history],
                temperature=0.5,
                max_tokens=3000,
                timeout=120,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or ""
            data = _parse_json_defensive(raw)
            if not data:
                await asyncio.sleep(0.6)
                continue
            model_wp = list(data.get("weak_points", []) or [])
            merged_wp = list(dict.fromkeys(list(weak_points) + model_wp))  # 真实薄弱点 + 模型补充，去重
            return {
                "title": data.get("title", name),
                "summary": data.get("summary", ""),
                "slides": data.get("slides", DEFAULT_SLIDES) or DEFAULT_SLIDES,
                "weak_points": merged_wp,
            }
        except Exception as e:
            logger.error(f"generate_report_slides 失败: {e}")
            await asyncio.sleep(0.6)
    return {"title": name, "summary": "", "slides": DEFAULT_SLIDES, "weak_points": []}


def build_pptx(report: dict, out_path: str) -> str:
    """用 python-pptx 把报告渲染成 .pptx 文件，返回路径。"""
    from pptx import Presentation
    from pptx.util import Pt

    prs = Presentation()
    slides = report.get("slides", DEFAULT_SLIDES)

    # 封面页
    cover = prs.slides.add_slide(prs.slide_layouts[0])
    cover.shapes.title.text = report.get("title", "学习报告")
    sub = report.get("summary", "")
    if sub and cover.placeholders:
        try:
            cover.placeholders[1].text = sub
        except Exception:
            pass

    # 内容页
    for s in slides:
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = s.get("title", "")
        body = slide.placeholders[1]
        tf = body.text_frame
        tf.text = ""
        bullets = s.get("bullets", [])
        for i, b in enumerate(bullets):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = b
            p.level = 0
            p.font.size = Pt(18)

    # 薄弱点页
    weak = report.get("weak_points", [])
    if weak:
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = "薄弱点与下一步"
        body = slide.placeholders[1]
        tf = body.text_frame
        tf.text = ""
        for i, w in enumerate(weak):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = f"• {w}"
            p.font.size = Pt(18)

    prs.save(out_path)
    return out_path
