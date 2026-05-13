"""
KB Search — loads healthcare_kb_decision_rules.json at startup and provides
keyword-based search returning the top-N matching rules.

Usage:
    from src.backend.knowledge_base.kb_search import load_decision_rules, search_kb

    load_decision_rules()          # call once at server startup
    rules = search_kb("chest pain sweating nausea", top_k=3)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_KB_PATH = Path(__file__).parent / "healthcare_kb_decision_rules.json"

# In-memory cache populated by load_decision_rules()
KB_RULES: list[dict] = []

# Stop words to skip when scoring — keeps term matching focused on clinical content
_STOP_WORDS = {
    "a", "an", "the", "or", "and", "with", "in", "of", "to", "for",
    "on", "is", "are", "be", "that", "this", "it", "by", "at", "from",
    "has", "have", "not", "no", "may", "can", "as", "if",
}


def load_decision_rules() -> int:
    """Load healthcare_kb_decision_rules.json into KB_RULES cache.

    Returns the number of rules loaded. Safe to call multiple times — only
    loads once if cache is already populated.
    """
    global KB_RULES
    if KB_RULES:
        return len(KB_RULES)

    if not _KB_PATH.exists():
        logger.error(f"KB decision rules file not found: {_KB_PATH}")
        return 0

    try:
        with open(_KB_PATH, "r") as f:
            data = json.load(f)
        KB_RULES = data if isinstance(data, list) else []
        logger.info(f"KB loaded: {len(KB_RULES)} decision rules from {_KB_PATH.name}")
        return len(KB_RULES)
    except Exception as exc:
        logger.error(f"Failed to load KB decision rules: {exc}")
        return 0


def search_kb(
    query: str,
    top_k: int = 3,
    category: Optional[str] = None,
    min_confidence: float = 0.0,
) -> list[dict]:
    """Return top_k KB rules most relevant to query using keyword scoring.

    Scoring:
    - +1 for each query term found anywhere in symptom_or_topic or reasoning
    - +3 bonus if a query term matches a whole word in symptom_or_topic
    - +5 bonus if the full query substring appears in symptom_or_topic
    - Results sorted by (score DESC, confidence DESC)

    Args:
        query: Free-text symptom description.
        top_k: Maximum number of rules to return.
        category: If set, filter to only rules with this category value.
        min_confidence: Exclude rules below this confidence threshold.

    Returns:
        List of matching rule dicts (original fields preserved, score added).
    """
    if not KB_RULES:
        logger.warning("search_kb called before load_decision_rules(); loading now")
        load_decision_rules()

    if not KB_RULES:
        return []

    query_lower = query.lower()
    query_terms = [t for t in query_lower.split() if t not in _STOP_WORDS and len(t) > 2]

    scored: list[tuple[float, dict]] = []

    for rule in KB_RULES:
        if category and rule.get("category") != category:
            continue
        confidence = float(rule.get("confidence", 0.0))
        if confidence < min_confidence:
            continue

        topic = rule.get("symptom_or_topic", "").lower()
        reasoning = rule.get("reasoning", "").lower()
        search_text = topic + " " + reasoning

        score = 0.0

        # Term-in-text score
        for term in query_terms:
            if term in search_text:
                score += 1.0
            # Bonus for whole-word match in topic
            if f" {term} " in f" {topic} ":
                score += 3.0

        # Substring bonus for phrase-level match in topic
        if query_lower in topic:
            score += 5.0

        if score > 0:
            scored.append((score, rule))

    scored.sort(key=lambda x: (-x[0], -float(x[1].get("confidence", 0))))

    results = [rule for _, rule in scored[:top_k]]

    if results:
        matched_ids = [r["id"] for r in results]
        logger.info(f"KB search '{query[:60]}' → matched rules: {matched_ids}")
    else:
        logger.debug(f"KB search '{query[:60]}' → no matches")

    return results


def format_kb_rules_for_prompt(rules: list[dict]) -> str:
    """Render matched KB rules as a structured block for injection into a system prompt."""
    if not rules:
        return ""

    lines = [
        "\n--- KNOWLEDGE BASE RULES (verified clinical guidelines) ---",
    ]
    for rule in rules:
        sources_text = "; ".join(
            f"{s['title']} ({s['url']})"
            for s in rule.get("sources", [])
        )
        lines.append(
            f"\nRule {rule['id']} | Category: {rule['category']} | Confidence: {rule['confidence']}"
            f"\nSymptom/Topic: {rule['symptom_or_topic']}"
            f"\nDecision: {rule['decision']}"
            f"\nReasoning: {rule['reasoning']}"
            f"\nSources: {sources_text}"
        )
    lines.append("--- END KNOWLEDGE BASE RULES ---\n")
    return "\n".join(lines)
