"""Output filtering and guardrails before returning AI responses to clients."""

import re
from dataclasses import dataclass
from typing import Optional

from .input_validation import redact_pii_for_logs


DISCLAIMER = (
    "\n\n---\n*This guidance is for informational purposes only and does not constitute "
    "medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider "
    "for medical decisions.*"
)

CRISIS_DISCLAIMER = (
    "If you are experiencing a medical emergency, call 911 immediately. "
    "For mental health crises, call or text 988."
)

# Patterns that should never appear in AI output
_BLOCKED_OUTPUT_PATTERNS = [
    (r"\byou (have|likely have|probably have|definitely have)\b.{0,60}\b(cancer|tumor|diabetes|lupus|ms|hiv|aids)\b", "diagnosis"),
    (r"\btake \d+\s*(mg|milligrams|pills?|tablets?)\b", "dosing_instruction"),
    (r"\bI (diagnose|am diagnosing)\b", "diagnosis"),
    (r"\bI (prescribe|recommend taking|advise taking)\b.{0,30}\b(mg|milligrams)\b", "prescription"),
    (r"\byou (don't need|don't require) (a )?(doctor|physician|hospital|ER|emergency)\b", "dismissive"),
    (r"\bno need to see (a )?(doctor|physician|specialist)\b", "dismissive"),
]

_HIGH_CONFIDENCE_THRESHOLD = 0.65


@dataclass
class FilterResult:
    allowed: bool
    output: str
    blocked_reason: Optional[str] = None
    disclaimer_added: bool = False
    confidence_flagged: bool = False


def filter_output(text: str, confidence: float = 1.0, add_disclaimer: bool = True) -> FilterResult:
    """Main output filter pipeline. Call before returning any AI response to a client."""
    for pattern, reason in _BLOCKED_OUTPUT_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            safe_response = _safe_fallback(reason)
            return FilterResult(
                allowed=False,
                output=safe_response,
                blocked_reason=reason,
                disclaimer_added=True,
            )

    confidence_flagged = False
    if confidence < _HIGH_CONFIDENCE_THRESHOLD:
        text = f"*Note: confidence is lower than usual for this assessment ({confidence:.0%}).*\n\n" + text
        confidence_flagged = True

    text = redact_pii_for_logs(text)

    if add_disclaimer:
        text = text + DISCLAIMER
        return FilterResult(allowed=True, output=text, disclaimer_added=True, confidence_flagged=confidence_flagged)

    return FilterResult(allowed=True, output=text, disclaimer_added=False, confidence_flagged=confidence_flagged)


def filter_medical_advice(text: str) -> FilterResult:
    """Standalone check for harmful medical advice patterns."""
    return filter_output(text, add_disclaimer=False)


def add_disclaimers(text: str, is_emergency: bool = False) -> str:
    """Inject appropriate disclaimers based on context."""
    if is_emergency:
        return f"{CRISIS_DISCLAIMER}\n\n{text}{DISCLAIMER}"
    return text + DISCLAIMER


def confidence_check(confidence: float) -> bool:
    """Return True if confidence is high enough to surface the recommendation."""
    return confidence >= _HIGH_CONFIDENCE_THRESHOLD


def _safe_fallback(blocked_reason: str) -> str:
    messages = {
        "diagnosis": (
            "I'm not able to provide a diagnosis. Based on your symptoms, I can help route you "
            "to the most appropriate care setting. Please consult a healthcare provider for any diagnosis."
            + DISCLAIMER
        ),
        "dosing_instruction": (
            "I'm not able to provide specific dosing instructions. Please consult your pharmacist "
            "or prescribing physician for medication guidance." + DISCLAIMER
        ),
        "prescription": (
            "I'm not able to prescribe medications. For prescription needs, please contact your "
            "primary care physician or visit an urgent care facility." + DISCLAIMER
        ),
        "dismissive": (
            "Based on your symptoms, I want to make sure you get the right care. "
            "Please consult a healthcare provider to evaluate your situation." + DISCLAIMER
        ),
    }
    return messages.get(blocked_reason, "I'm unable to provide that response. Please consult a healthcare provider." + DISCLAIMER)
