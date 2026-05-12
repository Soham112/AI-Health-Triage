"""
Actuarial risk scoring engine.
Produces a 0-100 risk score from claims data and member demographics.
Mirrors and extends the TypeScript riskScoring.ts with richer Python-side logic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .claims_analyzer import ClaimsAnalysis, analyze_claims


# Weights must sum to 1.0
_WEIGHTS = {
    "condition_burden": 0.30,
    "utilization": 0.30,
    "medication_complexity": 0.20,
    "age": 0.10,
    "social_determinants": 0.10,
}

# Condition severity multipliers (ICD-10 prefix → weight contribution 0-1)
_CONDITION_WEIGHTS: dict[str, float] = {
    "I50": 1.0,   # Heart failure — highest risk
    "N18": 0.95,  # Chronic kidney disease
    "C":   0.95,  # Cancer
    "I25": 0.85,  # Ischemic heart disease
    "E11": 0.75,  # T2 Diabetes
    "E10": 0.80,  # T1 Diabetes
    "J44": 0.70,  # COPD
    "I10": 0.55,  # Hypertension
    "F32": 0.45,  # MDD
    "F33": 0.50,  # Recurrent depression
    "F41": 0.40,  # Anxiety
    "J45": 0.50,  # Asthma
    "M16": 0.30,
    "M17": 0.30,
    "G43": 0.25,
    "K74": 0.80,
}

_ER_CPT_CODES = {"99281", "99282", "99283", "99284", "99285"}
_HOSP_CPT_CODES = {"99221", "99222", "99223", "99231", "99232", "99233", "99238", "99239"}


@dataclass
class RiskFactor:
    name: str
    score_contribution: float   # 0-100 points this factor adds
    description: str
    evidence: list[str] = field(default_factory=list)


@dataclass
class PreventiveOpportunity:
    intervention: str
    estimated_annual_savings: float
    priority: str           # high | medium | low
    evidence_base: str


@dataclass
class RiskScore:
    member_id: str
    overall_risk: float         # 0-100
    tier: str                   # low | medium | high | critical
    risk_factors: list[RiskFactor]
    predicted_annual_cost: float
    preventive_opportunities: list[PreventiveOpportunity]
    confidence: float           # 0-1; lower when claims data is sparse
    breakdown: dict[str, float] # component scores before weighting


def calculate_risk(
    member_id: str,
    age: int,
    conditions: list[str],      # ICD-10 codes
    medications: list[str],
    claims: list[dict[str, Any]],
    social_risk_flags: list[str] | None = None,
) -> RiskScore:
    """
    Full actuarial risk calculation.

    Args:
        member_id: Member identifier
        age: Member age
        conditions: Active ICD-10 diagnosis codes
        medications: List of current medication names
        claims: Raw claims dicts (same schema as claims_analyzer)
        social_risk_flags: SDOH flags (food_insecurity, transportation, housing_instability)
    """
    social_risk_flags = social_risk_flags or []
    claims_analysis = analyze_claims(member_id, claims)

    condition_score = _score_conditions(conditions)
    utilization_score = _score_utilization(claims_analysis)
    medication_score = _score_medications(medications, conditions)
    age_score = _score_age(age)
    sdoh_score = _score_sdoh(social_risk_flags)

    # Weighted composite
    raw_score = (
        condition_score * _WEIGHTS["condition_burden"]
        + utilization_score * _WEIGHTS["utilization"]
        + medication_score * _WEIGHTS["medication_complexity"]
        + age_score * _WEIGHTS["age"]
        + sdoh_score * _WEIGHTS["social_determinants"]
    )

    # Comorbidity multiplier: 2+ conditions amplify each other
    comorbidity_multiplier = 1.0
    if len(conditions) >= 4:
        comorbidity_multiplier = 1.35
    elif len(conditions) >= 2:
        comorbidity_multiplier = 1.15

    overall = min(raw_score * comorbidity_multiplier, 100.0)

    risk_factors = _build_risk_factors(
        conditions, claims_analysis, medications, age, social_risk_flags,
        condition_score, utilization_score, medication_score, age_score, sdoh_score
    )

    opportunities = _build_opportunities(claims_analysis, conditions, overall)
    predicted_cost = _predict_annual_cost(overall, claims_analysis)
    confidence = _compute_confidence(claims)

    return RiskScore(
        member_id=member_id,
        overall_risk=round(overall, 1),
        tier=_tier(overall),
        risk_factors=risk_factors,
        predicted_annual_cost=round(predicted_cost, 2),
        preventive_opportunities=opportunities,
        confidence=round(confidence, 2),
        breakdown={
            "condition_burden": round(condition_score, 1),
            "utilization": round(utilization_score, 1),
            "medication_complexity": round(medication_score, 1),
            "age": round(age_score, 1),
            "social_determinants": round(sdoh_score, 1),
        },
    )


def _score_conditions(conditions: list[str]) -> float:
    """0-100 based on condition severity weights."""
    if not conditions:
        return 5.0  # Baseline

    scores = []
    for code in conditions:
        for prefix, weight in _CONDITION_WEIGHTS.items():
            if code.startswith(prefix):
                scores.append(weight * 100)
                break

    if not scores:
        return 10.0  # Has conditions but none high-severity

    # Primary condition + diminishing returns for additional
    scores.sort(reverse=True)
    base = scores[0]
    for i, s in enumerate(scores[1:], 1):
        base += s * (0.4 ** i)  # Each additional condition adds diminishing points

    return min(base, 100.0)


def _score_utilization(analysis: ClaimsAnalysis) -> float:
    """0-100 based on ER visits, hospitalizations, and total spend."""
    score = 0.0

    # ER visits: each one is a significant signal
    score += min(analysis.er_visit_count * 15, 45)

    # Hospitalizations
    score += min(analysis.hospitalization_count * 20, 40)

    # Cost signal normalized against a $20,000 annual baseline
    cost_ratio = min(analysis.total_cost / 20_000, 1.0)
    score += cost_ratio * 15

    return min(score, 100.0)


def _score_medications(medications: list[str], conditions: list[str]) -> float:
    """0-100 based on medication count and complexity."""
    count = len(medications)
    base = min(count * 8, 60)

    # Polypharmacy risk (5+ meds)
    if count >= 10:
        base += 30
    elif count >= 7:
        base += 20
    elif count >= 5:
        base += 10

    # Insulin use signals poorly controlled diabetes
    high_risk_meds = ["insulin", "warfarin", "coumadin", "methotrexate", "tacrolimus", "cyclosporine"]
    for med in medications:
        if any(h in med.lower() for h in high_risk_meds):
            base += 10
            break

    return min(base, 100.0)


def _score_age(age: int) -> float:
    """Age-based risk curve. Risk increases non-linearly after 50."""
    if age < 18:
        return 5.0
    if age < 35:
        return 10.0
    if age < 50:
        return 20.0 + (age - 35) * 1.5
    if age < 65:
        return 42.0 + (age - 50) * 2.0
    return min(72.0 + (age - 65) * 1.5, 100.0)


def _score_sdoh(flags: list[str]) -> float:
    """Social determinants of health. Each flag adds independent risk."""
    weights = {
        "food_insecurity": 25.0,
        "transportation": 20.0,
        "housing_instability": 30.0,
        "social_isolation": 20.0,
        "low_health_literacy": 15.0,
    }
    score = sum(weights.get(f, 10.0) for f in flags)
    return min(score, 100.0)


def _build_risk_factors(
    conditions, analysis, medications, age, sdoh_flags,
    cond_score, util_score, med_score, age_score, sdoh_score
) -> list[RiskFactor]:
    factors = []

    if cond_score > 20:
        factors.append(RiskFactor(
            name="Chronic Condition Burden",
            score_contribution=round(cond_score * _WEIGHTS["condition_burden"], 1),
            description=f"{len(conditions)} active chronic condition(s) detected",
            evidence=conditions[:5],
        ))

    if analysis.er_visit_count >= 2:
        factors.append(RiskFactor(
            name="Emergency Department Overutilization",
            score_contribution=round(util_score * _WEIGHTS["utilization"], 1),
            description=f"{analysis.er_visit_count} ER visits — may signal unmanaged chronic conditions",
            evidence=[f"ER visits: {analysis.er_visit_count}"],
        ))

    if analysis.hospitalization_count >= 1:
        factors.append(RiskFactor(
            name="Inpatient Utilization",
            score_contribution=round(analysis.hospitalization_count * 20 * _WEIGHTS["utilization"], 1),
            description=f"{analysis.hospitalization_count} hospitalization(s) in claims history",
            evidence=[f"Hospitalizations: {analysis.hospitalization_count}"],
        ))

    if len(medications) >= 5:
        factors.append(RiskFactor(
            name="Polypharmacy",
            score_contribution=round(med_score * _WEIGHTS["medication_complexity"], 1),
            description=f"{len(medications)} concurrent medications — drug interaction and adherence risk",
            evidence=medications[:5],
        ))

    if age >= 65:
        factors.append(RiskFactor(
            name="Age-Related Risk",
            score_contribution=round(age_score * _WEIGHTS["age"], 1),
            description=f"Age {age}: elevated risk for acute events and functional decline",
            evidence=[f"Age: {age}"],
        ))

    if sdoh_flags:
        factors.append(RiskFactor(
            name="Social Determinants of Health",
            score_contribution=round(sdoh_score * _WEIGHTS["social_determinants"], 1),
            description=f"SDOH flags: {', '.join(sdoh_flags)}",
            evidence=sdoh_flags,
        ))

    return sorted(factors, key=lambda f: f.score_contribution, reverse=True)


def _build_opportunities(
    analysis: ClaimsAnalysis,
    conditions: list[str],
    overall_risk: float,
) -> list[PreventiveOpportunity]:
    opps: list[PreventiveOpportunity] = []

    for gap in analysis.prevention_gaps:
        priority = "high" if overall_risk >= 61 else ("medium" if overall_risk >= 31 else "low")
        opps.append(PreventiveOpportunity(
            intervention=gap.screening_type,
            estimated_annual_savings=gap.estimated_savings,
            priority=priority,
            evidence_base=f"ICD-10: {gap.icd10_for_gap}, recommended frequency: {gap.recommended_frequency}",
        ))

    if analysis.er_visit_count >= 3:
        opps.append(PreventiveOpportunity(
            intervention="Care Management Program Enrollment",
            estimated_annual_savings=4800.0,
            priority="high",
            evidence_base="ER overutilization pattern — care coordination reduces avoidable ED visits by ~30%",
        ))

    return sorted(opps, key=lambda o: o.estimated_annual_savings, reverse=True)


def _predict_annual_cost(risk_score: float, analysis: ClaimsAnalysis) -> float:
    """
    Blend historical cost with a risk-adjusted projection.
    Uses a base cost curve calibrated to actuarial benchmarks.
    """
    # Risk-curve baseline (PMPM actuarial bands)
    if risk_score <= 30:
        baseline = 2_400
    elif risk_score <= 60:
        baseline = 8_000 + (risk_score - 30) * 300
    else:
        baseline = 17_000 + (risk_score - 60) * 600

    # Blend with observed: 60% projection, 40% history if we have 6+ months of data
    if analysis.claim_count >= 6:
        projected = baseline * 0.60 + analysis.total_cost * 0.40
    else:
        projected = baseline

    return projected


def _compute_confidence(claims: list[dict]) -> float:
    """Confidence falls with sparse claims data."""
    if len(claims) >= 12:
        return 0.92
    if len(claims) >= 6:
        return 0.80
    if len(claims) >= 3:
        return 0.65
    return 0.45


def _tier(score: float) -> str:
    if score <= 30:
        return "low"
    if score <= 60:
        return "medium"
    if score <= 80:
        return "high"
    return "critical"
