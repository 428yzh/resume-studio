"""分数落回图谱节点，自下而上累加（结论 12/13）。

每个节点用自己的 0-100 尺子量，父节点 = 有证据的子节点分的平均，
所以子节点全满分时父节点就是满分（「一个主题分 4 个子主题、全学完 = 100」
是同一件事的等权说法）。技能总分 = 顶层节点平均，能逐层拆回去验算。

只认证据。没测过的节点是「未测」（None），不是 0 —— 也不能摊进平均：
把「没学过」算成「学得差」，两者要的动作完全不同（去学 vs 去补）。

⚠️ 未测不摊平均的副作用：一个单元只有 1/4 的子节点测过且满分，它的分也是 100。
   所以分数**必须和覆盖率成对显示**（结论 15），只显示分数就是更漂亮的假分数。
"""
from typing import Optional

# 证据来源，从深到浅。取最深的那条，不平均 —— 平均会把「选择题 90 分 +
# 讲不出来 L1」抹成一个中等的分，恰好把漏洞藏起来（结论 21：探测器只能证伪）。
# 加新来源：这里加一行 + 写一个折算函数产出 0-100 的分数列表，算分逻辑不用动。
SOURCE_PRIORITY = ("feynman", "quiz", "notes")


def compute_scores(nodes: list, evidence: dict[str, dict[str, list[int]]]) -> dict:
    """evidence: {节点 id: {来源: [每条证据的 0-100 分]}}

    当前只有 quiz（选择题 0/100，问答题取 AI 分）；费曼按等级折算、笔记按完成度折算
    还没接，接的时候只管往 evidence 里塞，这里一行不用改。

    返回 {节点 id: {"score": int | None, "answered": int, "own": int}}；score=None 即未测。
    answered 含子树（这个节点底下总共有几条证据）；**own 只数直接证据** ——
    覆盖率用 own：父节点的分是子节点算出来的，不证明父节点本身被测过。
    子节点全没测时退回节点自己那条证据 —— 单元级出题会挂在顶层节点上，丢掉等于白考。
    """
    out: dict[str, dict] = {}

    def walk(n: dict) -> tuple[Optional[int], int]:
        nid = n.get("id")
        kids = [c for c in (n.get("children") or []) if isinstance(c, dict) and c.get("id")]
        kid_results = [walk(k) for k in kids]
        kid_scores = [s for s, _ in kid_results if s is not None]
        buckets = evidence.get(nid) or {}
        own = sum(len(v) for v in buckets.values() if v)

        if kid_scores:
            score = round(sum(kid_scores) / len(kid_scores))
            answered = own + sum(a for _, a in kid_results)
        else:
            score = _deepest(buckets)
            answered = own
        out[nid] = {"score": score, "answered": answered, "own": own}
        return score, answered

    for n in nodes or []:
        if isinstance(n, dict) and n.get("id"):
            walk(n)
    return out


def _deepest(buckets: dict) -> Optional[int]:
    """同一来源内取平均；跨来源取优先级最高的那条。全空 → None（未测）。"""
    for src in SOURCE_PRIORITY:
        vals = [v for v in (buckets.get(src) or []) if isinstance(v, (int, float))]
        if vals:
            return round(sum(vals) / len(vals))
    return None
