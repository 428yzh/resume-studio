"""简历与 JD 的匹配度计算（对应前端 computeGaps）"""

import json
from typing import Any


def compute_gaps(sections: dict, tech_stack: list[dict]) -> dict:
    """计算简历技能与 JD 技术栈的差距

    Args:
        sections: 简历的 sections 数据 (dict, 含 skills/experience)
        tech_stack: JD 的技术栈列表 [{name, category, required_level, priority}]

    Returns:
        {match_percentage, match_count, total_required, matched_skills, missing_skills, suggestions}
    """
    # 提取简历技能名
    resume_skills = set()
    for s in sections.get("skills", []):
        if isinstance(s, dict) and s.get("name"):
            resume_skills.add(s["name"].lower().strip())

    # 从工作经历描述中提取技术提及
    experience_text = ""
    for e in sections.get("experience", []):
        if isinstance(e, dict):
            experience_text += f"{e.get('company', '')} {e.get('position', '')} {e.get('description', '')} ".lower()

    matched = []
    missing = []

    for tech in tech_stack:
        name = tech.get("name", "").lower().strip()
        if not name:
            continue

        in_skill_list = name in resume_skills
        in_experience = not in_skill_list and name in experience_text

        if in_skill_list or in_experience:
            level = "mentioned in experience"
            if in_skill_list:
                for s in sections.get("skills", []):
                    if isinstance(s, dict) and s.get("name", "").lower().strip() == name:
                        level = s.get("level", "unknown")
                        break
            matched.append({
                "name": tech["name"],
                "category": tech.get("category", ""),
                "level": level,
            })
        else:
            missing.append({
                "name": tech["name"],
                "category": tech.get("category", ""),
                "required_level": tech.get("required_level", ""),
                "priority": tech.get("priority", 0),
            })

    total = len(tech_stack)
    match_count = len(matched)
    pct = round(match_count / total * 100) if total > 0 else 0

    suggestions = []
    if pct >= 80:
        suggestions.append("你的技能与职位要求高度匹配，可以突出简历中的相关经验。")
    elif pct >= 50:
        suggestions.append("你的技能基本覆盖职位要求，建议补充缺失的几项技术。")
    else:
        suggestions.append("与该职位存在较大技能差距，建议优先学习缺失的关键技术。")
    if missing:
        top3 = [m["name"] for m in missing[:3]]
        rest = "等" if len(missing) > 3 else ""
        suggestions.append(f"建议重点学习：{'、'.join(top3)}{rest}")

    return {
        "match_percentage": pct,
        "match_count": match_count,
        "total_required": total,
        "matched_skills": matched,
        "missing_skills": missing,
        "suggestions": suggestions,
    }
