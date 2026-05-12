"""
Claims analysis engine — parses raw claims records into structured intelligence.
Operates on ICD-10 / CPT coded data and surfaces cost drivers, care gaps, and patterns.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any


# ICD-10 chapters that are high-cost chronic conditions
_CHRONIC_CONDITION_PREFIXES: dict[str, str] = {
    "E11": "Type 2 Diabetes",
    "E10": "Type 1 Diabetes",
    "I10": "Hypertension",
    "I25": "Chronic Ischemic Heart Disease",
    "I50": "Heart Failure",
    "J44": "COPD",
    "J45": "Asthma",
    "N18": "Chronic Kidney Disease",
    "F32": "Major Depressive Disorder",
    "F33": "Recurrent Depressive Disorder",
    "F41": "Anxiety Disorders",
    "M16": "Osteoarthritis – Hip",
    "M17": "Osteoarthritis – Knee",
    "G43": "Migraine",
    "K74": "Liver Fibrosis/Cirrhosis",
    "C": "Cancer (any)",
    "Z79": "Long-term medication use",
}

# CPT code ranges for care setting detection
_ER_CPT_CODES = {"99281", "99282", "99283", "99284", "99285"}
_HOSPITALIZATION_CPT_CODES = {"99221", "99222", "99223", "99231", "99232", "99233", "99238", "99239"}
_PREVENTIVE_CPT_CODES = {"99381", "99382", "99383", "99384", "99385", "99386", "99387",
                          "99391", "99392", "99393", "99394", "99395", "99396", "99397",
                          "G0008", "G0009", "G0010"}
_SPECIALIST_CODES = {"99241", "99242", "99243", "99244", "99245"}
_PCP_CPT_CODES = {"99201", "99202", "99203", "99204", "99205",
                  "99211", "99212", "99213", "99214", "99215"}


@dataclass
class CostDriver:
    category: str
    total_cost: float
    claim_count: int
    icd10_codes: list[str]
    description: str


@dataclass
class CarePattern:
    pattern_type: str        # er_overuse | no_pcp_followup | medication_gap | preventive_gap | high_readmission
    description: str
    severity: str            # low | medium | high
    evidence: list[str]      # supporting claim IDs or codes


@dataclass
class PreventionGap:
    screening_type: str
    last_performed: str | None
    recommended_frequency: str
    estimated_savings: float
    icd10_for_gap: str


@dataclass
class ClaimsAnalysis:
    member_id: str
    total_cost: float
    claim_count: int
    date_range: tuple[str, str]
    cost_drivers: list[CostDriver]
    patterns: list[CarePattern]
    chronic_conditions: list[str]
    prevention_gaps: list[PreventionGap]
    er_visit_count: int
    hospitalization_count: int
    pcp_visit_count: int
    avg_cost_per_claim: float
    highest_cost_claim: float


def analyze_claims(member_id: str, claims: list[dict[str, Any]]) -> ClaimsAnalysis:
    """
    Main entry point. Takes a list of claim dicts with keys:
      claim_id, service_date, cpt_code, icd10_codes (list), amount_billed, amount_paid,
      provider_type, place_of_service
    """
    if not claims:
        return _empty_analysis(member_id)

    total_cost = sum(float(c.get("amount_paid", 0)) for c in claims)
    claim_count = len(claims)
    dates = [_parse_date(c.get("service_date", "")) for c in claims if c.get("service_date")]
    date_range = (
        min(dates).isoformat() if dates else "unknown",
        max(dates).isoformat() if dates else "unknown",
    )

    cost_drivers = _identify_cost_drivers(claims)
    chronic_conditions = _identify_chronic_conditions(claims)
    er_visits = _count_setting(claims, _ER_CPT_CODES)
    hospitalizations = _count_setting(claims, _HOSPITALIZATION_CPT_CODES)
    pcp_visits = _count_setting(claims, _PCP_CPT_CODES)

    patterns = _detect_patterns(claims, er_visits, hospitalizations, pcp_visits, dates)
    prevention_gaps = _find_prevention_gaps(claims, chronic_conditions)

    costs = [float(c.get("amount_paid", 0)) for c in claims]

    return ClaimsAnalysis(
        member_id=member_id,
        total_cost=total_cost,
        claim_count=claim_count,
        date_range=date_range,
        cost_drivers=cost_drivers,
        patterns=patterns,
        chronic_conditions=chronic_conditions,
        prevention_gaps=prevention_gaps,
        er_visit_count=er_visits,
        hospitalization_count=hospitalizations,
        pcp_visit_count=pcp_visits,
        avg_cost_per_claim=total_cost / claim_count if claim_count else 0,
        highest_cost_claim=max(costs) if costs else 0,
    )


def _identify_cost_drivers(claims: list[dict]) -> list[CostDriver]:
    buckets: dict[str, dict] = {}

    for claim in claims:
        cpt = claim.get("cpt_code", "")
        icd_codes = claim.get("icd10_codes", [])
        paid = float(claim.get("amount_paid", 0))

        category = _categorize_cpt(cpt)
        if category not in buckets:
            buckets[category] = {"total": 0.0, "count": 0, "codes": set()}
        buckets[category]["total"] += paid
        buckets[category]["count"] += 1
        buckets[category]["codes"].update(icd_codes)

    drivers = [
        CostDriver(
            category=cat,
            total_cost=round(v["total"], 2),
            claim_count=v["count"],
            icd10_codes=list(v["codes"])[:10],
            description=_describe_category(cat),
        )
        for cat, v in buckets.items()
    ]
    return sorted(drivers, key=lambda d: d.total_cost, reverse=True)


def _identify_chronic_conditions(claims: list[dict]) -> list[str]:
    found: set[str] = set()
    for claim in claims:
        for code in claim.get("icd10_codes", []):
            for prefix, label in _CHRONIC_CONDITION_PREFIXES.items():
                if code.startswith(prefix):
                    found.add(label)
    return sorted(found)


def _count_setting(claims: list[dict], cpt_set: set[str]) -> int:
    return sum(1 for c in claims if c.get("cpt_code", "") in cpt_set)


def _detect_patterns(
    claims: list[dict],
    er_visits: int,
    hospitalizations: int,
    pcp_visits: int,
    dates: list[date],
) -> list[CarePattern]:
    patterns: list[CarePattern] = []
    total = len(claims)

    # ER overutilization: > 2 ER visits without PCP follow-up within 14 days
    if er_visits >= 3:
        severity = "high" if er_visits >= 5 else "medium"
        patterns.append(CarePattern(
            pattern_type="er_overuse",
            description=f"{er_visits} ER visits detected. High utilization may indicate unmanaged chronic conditions.",
            severity=severity,
            evidence=[f"ER visit count: {er_visits}"],
        ))

    # No PCP after hospitalization
    if hospitalizations >= 1 and pcp_visits == 0:
        patterns.append(CarePattern(
            pattern_type="no_pcp_followup",
            description="Hospitalization(s) with no subsequent PCP follow-up visit detected. Readmission risk is elevated.",
            severity="high",
            evidence=[f"Hospitalizations: {hospitalizations}", f"PCP visits: {pcp_visits}"],
        ))

    # Preventive gap: no preventive visit in the dataset
    preventive_visits = sum(1 for c in claims if c.get("cpt_code", "") in _PREVENTIVE_CPT_CODES)
    if preventive_visits == 0 and total >= 3:
        patterns.append(CarePattern(
            pattern_type="preventive_gap",
            description="No annual preventive visit found. Preventive screenings may be overdue.",
            severity="medium",
            evidence=["Zero preventive CPT codes in claims history"],
        ))

    # Readmission signal: hospitalization within 30 days of another
    if hospitalizations >= 2 and dates:
        hosp_dates = sorted([
            _parse_date(c.get("service_date", ""))
            for c in claims
            if c.get("cpt_code", "") in _HOSPITALIZATION_CPT_CODES and c.get("service_date")
        ])
        for i in range(1, len(hosp_dates)):
            if (hosp_dates[i] - hosp_dates[i - 1]).days <= 30:
                patterns.append(CarePattern(
                    pattern_type="high_readmission",
                    description="Readmission within 30 days detected. Signals care transition failure or uncontrolled condition.",
                    severity="high",
                    evidence=[f"Readmission on {hosp_dates[i]}"],
                ))
                break

    return patterns


def _find_prevention_gaps(claims: list[dict], chronic_conditions: list[str]) -> list[PreventionGap]:
    gaps: list[PreventionGap] = []

    has_diabetes = any("Diabetes" in c for c in chronic_conditions)
    has_hypertension = any("Hypertension" in c for c in chronic_conditions)

    # A1C check for diabetics — CPT 83036
    if has_diabetes:
        a1c_claims = [c for c in claims if c.get("cpt_code") == "83036"]
        last = max((c.get("service_date", "") for c in a1c_claims), default=None)
        gaps.append(PreventionGap(
            screening_type="HbA1c Monitoring",
            last_performed=last,
            recommended_frequency="Every 3 months (diabetics)",
            estimated_savings=1200.0,
            icd10_for_gap="E11.9",
        ))

    # Annual eye exam for diabetics — CPT 92002/92004
    if has_diabetes:
        eye_claims = [c for c in claims if c.get("cpt_code") in {"92002", "92004"}]
        last = max((c.get("service_date", "") for c in eye_claims), default=None)
        gaps.append(PreventionGap(
            screening_type="Diabetic Retinopathy Screening",
            last_performed=last,
            recommended_frequency="Annually",
            estimated_savings=3500.0,
            icd10_for_gap="E11.311",
        ))

    # Blood pressure monitoring for hypertensive patients — CPT 93000
    if has_hypertension:
        bp_claims = [c for c in claims if c.get("cpt_code") in {"99213", "99214", "99215"}]
        if len(bp_claims) < 2:
            gaps.append(PreventionGap(
                screening_type="Hypertension Management Visit",
                last_performed=None,
                recommended_frequency="Every 3-6 months",
                estimated_savings=4200.0,
                icd10_for_gap="I10",
            ))

    # Colorectal cancer screening (age-based, fallback)
    colonoscopy = [c for c in claims if c.get("cpt_code") in {"45378", "45380", "45385", "G0105", "G0121"}]
    if not colonoscopy:
        gaps.append(PreventionGap(
            screening_type="Colorectal Cancer Screening",
            last_performed=None,
            recommended_frequency="Every 10 years (age 45+)",
            estimated_savings=8500.0,
            icd10_for_gap="Z12.11",
        ))

    return gaps


def _categorize_cpt(cpt: str) -> str:
    if cpt in _ER_CPT_CODES:
        return "emergency_care"
    if cpt in _HOSPITALIZATION_CPT_CODES:
        return "inpatient"
    if cpt in _PREVENTIVE_CPT_CODES:
        return "preventive"
    if cpt in _PCP_CPT_CODES:
        return "primary_care"
    if cpt in _SPECIALIST_CODES:
        return "specialist"
    if cpt.startswith(("70", "71", "72", "73", "74", "75", "76", "77", "78", "79")):
        return "imaging"
    if cpt.startswith(("80", "81", "82", "83", "84", "85", "86", "87", "88", "89")):
        return "lab"
    return "other"


def _describe_category(cat: str) -> str:
    return {
        "emergency_care": "Emergency department visits",
        "inpatient": "Hospital inpatient stays",
        "preventive": "Preventive screenings and wellness visits",
        "primary_care": "Primary care office visits",
        "specialist": "Specialist consultations",
        "imaging": "Diagnostic imaging (X-ray, MRI, CT)",
        "lab": "Laboratory and pathology",
        "other": "Other medical services",
    }.get(cat, cat)


def _parse_date(date_str: str) -> date:
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except (ValueError, TypeError):
            continue
    return date.today()


def _empty_analysis(member_id: str) -> ClaimsAnalysis:
    return ClaimsAnalysis(
        member_id=member_id,
        total_cost=0.0,
        claim_count=0,
        date_range=("unknown", "unknown"),
        cost_drivers=[],
        patterns=[],
        chronic_conditions=[],
        prevention_gaps=[],
        er_visit_count=0,
        hospitalization_count=0,
        pcp_visit_count=0,
        avg_cost_per_claim=0.0,
        highest_cost_claim=0.0,
    )
