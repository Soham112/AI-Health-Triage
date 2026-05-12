"""Input validation and sanitization for the health AI backend."""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ValidationResult(Enum):
    VALID = "valid"
    INJECTION_DETECTED = "injection_detected"
    PII_DETECTED = "pii_detected"
    PRESCRIPTION_REQUEST = "prescription_request"
    DIAGNOSIS_REQUEST = "diagnosis_request"
    SELF_HARM = "self_harm"
    EMPTY_INPUT = "empty_input"
    TOO_LONG = "too_long"


@dataclass
class ValidationOutcome:
    valid: bool
    result: ValidationResult
    reason: Optional[str] = None
    redacted_input: Optional[str] = None


# Patterns that signal prompt injection / jailbreak attempts
_INJECTION_PATTERNS = [
    r"ignore (previous|above|all) instructions",
    r"you are now",
    r"act as (a |an )?(doctor|physician|pharmacist|prescriber)",
    r"forget (your|all) (guidelines|instructions|rules|training)",
    r"(system prompt|system message)\s*:",
    r"<\s*script",
    r";\s*(drop|delete|insert|update|select)\s+",  # SQL injection
    r"--\s*(drop|delete|insert|select)",
]

_SELF_HARM_PATTERNS = [
    r"\b(suicide|suicidal|kill myself|end my life|want to die|self.?harm|hurt myself)\b",
]

_PII_PATTERNS = {
    "ssn": r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
    "credit_card": r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b",
    "phone": r"\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "email": r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b",
}

_PRESCRIPTION_PATTERNS = [
    r"\bprescribe\b",
    r"\bprescription for\b",
    r"\bwrite me a (script|rx|prescription)\b",
    r"\bgive me (opioids?|benzos?|adderall|xanax|oxycontin|hydrocodone|fentanyl)\b",
    r"\bhow (much|many) (mg|milligrams|pills|tablets) (should I|can I) take\b",
]

_DIAGNOSIS_PATTERNS = [
    r"\bdo I have\b.{0,30}\b(cancer|diabetes|lupus|ms|hiv|aids|hepatitis)\b",
    r"\bdiagnose me\b",
    r"\bam I (sick|dying|infected|contagious)\b",
    r"\bwhat (disease|condition|disorder) do I have\b",
]

MAX_INPUT_LENGTH = 2000


def validate_symptoms(text: str) -> ValidationOutcome:
    """Full validation pipeline for symptom input. Returns on first critical failure."""
    if not text or not text.strip():
        return ValidationOutcome(valid=False, result=ValidationResult.EMPTY_INPUT, reason="Empty input")

    if len(text) > MAX_INPUT_LENGTH:
        return ValidationOutcome(
            valid=False,
            result=ValidationResult.TOO_LONG,
            reason=f"Input exceeds {MAX_INPUT_LENGTH} characters",
        )

    # Self-harm check is highest priority — return crisis resource immediately
    outcome = detect_self_harm(text)
    if not outcome.valid:
        return outcome

    outcome = detect_prompt_injection(text)
    if not outcome.valid:
        return outcome

    outcome = validate_medical_context(text)
    if not outcome.valid:
        return outcome

    # PII check — warn but still allow (just redact)
    pii_outcome = detect_pii(text)
    if not pii_outcome.valid:
        # Redact and continue — PII in clinical input is a warning, not a block
        return ValidationOutcome(
            valid=True,
            result=ValidationResult.VALID,
            reason="PII detected and redacted",
            redacted_input=pii_outcome.redacted_input,
        )

    return ValidationOutcome(valid=True, result=ValidationResult.VALID, redacted_input=text)


def detect_self_harm(text: str) -> ValidationOutcome:
    lower = text.lower()
    for pattern in _SELF_HARM_PATTERNS:
        if re.search(pattern, lower):
            return ValidationOutcome(
                valid=False,
                result=ValidationResult.SELF_HARM,
                reason=(
                    "If you're in crisis, please call or text 988 (Suicide & Crisis Lifeline). "
                    "You can also text HOME to 741741 (Crisis Text Line). Help is available 24/7."
                ),
            )
    return ValidationOutcome(valid=True, result=ValidationResult.VALID)


def detect_prompt_injection(text: str) -> ValidationOutcome:
    lower = text.lower()
    for pattern in _INJECTION_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            return ValidationOutcome(
                valid=False,
                result=ValidationResult.INJECTION_DETECTED,
                reason="Input contains disallowed instruction patterns",
            )
    return ValidationOutcome(valid=True, result=ValidationResult.VALID)


def detect_pii(text: str) -> ValidationOutcome:
    """Detect and redact PII. Returns redacted_input even on success."""
    redacted = text
    found: list[str] = []

    for label, pattern in _PII_PATTERNS.items():
        matches = re.findall(pattern, redacted)
        if matches:
            found.append(label)
            redacted = re.sub(pattern, f"[{label.upper()}_REDACTED]", redacted)

    if found:
        return ValidationOutcome(
            valid=False,
            result=ValidationResult.PII_DETECTED,
            reason=f"PII detected: {', '.join(found)}",
            redacted_input=redacted,
        )

    return ValidationOutcome(valid=True, result=ValidationResult.VALID, redacted_input=text)


def validate_medical_context(text: str) -> ValidationOutcome:
    lower = text.lower()

    for pattern in _PRESCRIPTION_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            return ValidationOutcome(
                valid=False,
                result=ValidationResult.PRESCRIPTION_REQUEST,
                reason="This service helps navigate care, not prescribe medications. Please consult your provider.",
            )

    for pattern in _DIAGNOSIS_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            return ValidationOutcome(
                valid=False,
                result=ValidationResult.DIAGNOSIS_REQUEST,
                reason="This service helps route you to the right care, not diagnose conditions. Please see a provider.",
            )

    return ValidationOutcome(valid=True, result=ValidationResult.VALID)


def redact_pii_for_logs(text: str) -> str:
    """Redact all PII before writing to audit logs. Always returns a string."""
    if not text:
        return text
    redacted = text
    for label, pattern in _PII_PATTERNS.items():
        redacted = re.sub(pattern, f"[{label.upper()}_REDACTED]", redacted)
    return redacted
