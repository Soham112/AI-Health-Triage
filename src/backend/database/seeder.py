"""
Data seeder — generates 100 realistic member profiles and 500+ claims with real
CPT/ICD-10 codes and seeds them into Supabase (or the in-memory mock store).

Run: python -m src.backend.database.seeder
"""

from __future__ import annotations

import json
import logging
import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Seed configuration
# ---------------------------------------------------------------------------

random.seed(42)  # Reproducible data

MEMBER_COUNT = 100
CLAIMS_PER_MEMBER_MIN = 3
CLAIMS_PER_MEMBER_MAX = 15

# ICD-10 codes with associated demographics
_CONDITION_PROFILES = [
    {"codes": ["E11.9", "I10", "Z79.4"], "label": "T2 Diabetes + Hypertension", "weight": 0.20},
    {"codes": ["I25.10", "I10", "Z79.01"], "label": "Ischemic Heart Disease", "weight": 0.12},
    {"codes": ["J44.1", "J45.20"], "label": "COPD + Asthma", "weight": 0.10},
    {"codes": ["F32.9", "F41.1"], "label": "Depression + Anxiety", "weight": 0.18},
    {"codes": ["N18.3", "I10", "E11.9"], "label": "CKD + HTN + T2DM", "weight": 0.08},
    {"codes": ["I50.9", "I25.10"], "label": "Heart Failure", "weight": 0.07},
    {"codes": ["M17.11", "M16.11"], "label": "Osteoarthritis", "weight": 0.10},
    {"codes": ["Z00.00"], "label": "Healthy / Preventive", "weight": 0.15},
]

_MEDICATIONS_BY_CONDITION = {
    "T2 Diabetes + Hypertension": ["Metformin", "Lisinopril", "Amlodipine", "Atorvastatin", "Aspirin"],
    "Ischemic Heart Disease": ["Aspirin", "Metoprolol", "Atorvastatin", "Lisinopril", "Clopidogrel"],
    "COPD + Asthma": ["Albuterol", "Tiotropium", "Fluticasone", "Montelukast", "Prednisone"],
    "Depression + Anxiety": ["Sertraline", "Alprazolam", "Bupropion", "Trazodone"],
    "CKD + HTN + T2DM": ["Lisinopril", "Metformin", "Furosemide", "Erythropoietin", "Insulin Glargine"],
    "Heart Failure": ["Furosemide", "Carvedilol", "Lisinopril", "Spironolactone", "Digoxin"],
    "Osteoarthritis": ["Naproxen", "Celecoxib", "Acetaminophen", "Tramadol"],
    "Healthy / Preventive": [],
}

# CPT codes by care setting with typical cost ranges
_CLAIM_TYPES = [
    {"cpt": "99213", "setting": "pcp", "cost_range": (80, 180)},
    {"cpt": "99214", "setting": "pcp", "cost_range": (150, 280)},
    {"cpt": "99215", "setting": "pcp", "cost_range": (200, 380)},
    {"cpt": "99283", "setting": "er", "cost_range": (800, 2200)},
    {"cpt": "99284", "setting": "er", "cost_range": (1500, 3500)},
    {"cpt": "99285", "setting": "er", "cost_range": (2500, 5500)},
    {"cpt": "99223", "setting": "inpatient", "cost_range": (3500, 12000)},
    {"cpt": "99231", "setting": "inpatient", "cost_range": (2000, 6000)},
    {"cpt": "99395", "setting": "preventive", "cost_range": (150, 350)},
    {"cpt": "99396", "setting": "preventive", "cost_range": (150, 350)},
    {"cpt": "83036", "setting": "lab", "cost_range": (25, 80)},    # HbA1c
    {"cpt": "80053", "setting": "lab", "cost_range": (50, 150)},   # CMP
    {"cpt": "71046", "setting": "imaging", "cost_range": (200, 600)},  # Chest X-ray
    {"cpt": "93000", "setting": "cardiology", "cost_range": (50, 150)},  # EKG
    {"cpt": "45378", "setting": "preventive", "cost_range": (1500, 3500)},  # Colonoscopy
    {"cpt": "92004", "setting": "ophthalmology", "cost_range": (150, 300)},  # Eye exam
    {"cpt": "99244", "setting": "specialist", "cost_range": (250, 550)},
]

_FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "William", "Barbara", "David", "Susan", "Richard", "Jessica", "Joseph", "Sarah",
    "Thomas", "Karen", "Charles", "Lisa", "Christopher", "Nancy", "Daniel", "Betty",
    "Matthew", "Margaret", "Anthony", "Sandra", "Mark", "Ashley", "Donald", "Dorothy",
    "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    "Kenneth", "Carol", "Kevin", "Amanda", "Brian", "Melissa", "George", "Deborah",
    "Timothy", "Stephanie",
]

_LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
    "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen",
    "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera",
    "Campbell", "Mitchell", "Carter", "Roberts",
]

_STATES = ["TX", "CA", "FL", "NY", "IL", "PA", "OH", "GA", "NC", "MI"]
_SDOH_FLAGS = ["food_insecurity", "transportation", "housing_instability", "social_isolation"]
_RISK_TIERS = {"low": (5, 30), "medium": (31, 60), "high": (61, 80), "critical": (81, 100)}


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

def _random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def _pick_condition_profile() -> dict:
    weights = [p["weight"] for p in _CONDITION_PROFILES]
    return random.choices(_CONDITION_PROFILES, weights=weights, k=1)[0]


def generate_member(index: int) -> dict:
    profile = _pick_condition_profile()
    is_high_risk = profile["label"] not in ("Healthy / Preventive",)

    age = random.randint(22, 82)
    # Skew age upward for chronic conditions
    if is_high_risk:
        age = max(age, random.randint(45, 82))

    sdoh = random.choices(_SDOH_FLAGS, k=random.randint(0, 2)) if is_high_risk else []

    return {
        "id": f"MBR{str(index).zfill(4)}",
        "name": f"{random.choice(_FIRST_NAMES)} {random.choice(_LAST_NAMES)}",
        "age": age,
        "state": random.choice(_STATES),
        "conditions": profile["codes"],
        "condition_label": profile["label"],
        "medications": _MEDICATIONS_BY_CONDITION.get(profile["label"], []),
        "social_risk_flags": sdoh,
        "plan_type": random.choice(["HMO", "PPO", "HDHP", "EPO"]),
        "member_since": _random_date(date(2018, 1, 1), date(2023, 12, 31)).isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    }


def generate_claim(member: dict, claim_index: int) -> dict:
    conditions = member.get("conditions", ["Z00.00"])
    label = member.get("condition_label", "Healthy / Preventive")

    # Weight claim types by condition
    if any(c.startswith("I50") or c.startswith("I25") for c in conditions):
        weights = [3, 3, 2, 8, 6, 3, 5, 3, 1, 1, 4, 4, 3, 5, 1, 1, 3]
    elif any(c.startswith("E11") or c.startswith("I10") for c in conditions):
        weights = [5, 5, 3, 4, 2, 1, 2, 1, 2, 2, 8, 6, 2, 3, 1, 3, 2]
    elif any(c.startswith("F3") or c.startswith("F4") for c in conditions):
        weights = [6, 5, 4, 3, 2, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 4]
    else:
        weights = [4, 3, 2, 1, 1, 1, 1, 1, 4, 4, 2, 2, 2, 2, 2, 2, 2]

    claim_type = random.choices(_CLAIM_TYPES, weights=weights, k=1)[0]
    cost = round(random.uniform(*claim_type["cost_range"]), 2)
    paid = round(cost * random.uniform(0.70, 0.92), 2)  # typical insurance payment rate

    service_date = _random_date(
        date.today() - timedelta(days=730),
        date.today() - timedelta(days=7),
    )

    return {
        "id": str(uuid.uuid4()),
        "member_id": member["id"],
        "claim_id": f"CLM{member['id']}{str(claim_index).zfill(3)}",
        "service_date": service_date.isoformat(),
        "cpt_code": claim_type["cpt"],
        "icd10_codes": conditions[:3],
        "place_of_service": claim_type["setting"],
        "amount_billed": cost,
        "amount_paid": paid,
        "provider_type": claim_type["setting"],
        "created_at": datetime.utcnow().isoformat(),
    }


def generate_triage_outcome(member: dict) -> dict:
    """Generate realistic historical triage data."""
    recommendations = ["emergency", "urgent_care", "telehealth", "pcp", "specialist", "self_care"]
    weights = [0.10, 0.20, 0.25, 0.30, 0.10, 0.05]
    recommendation = random.choices(recommendations, weights=weights, k=1)[0]

    symptom_map = {
        "emergency": "chest pain with shortness of breath, diaphoresis",
        "urgent_care": "fever 102°F, productive cough for 3 days",
        "telehealth": "mild sore throat, runny nose, no fever",
        "pcp": "persistent fatigue, increased thirst",
        "specialist": "worsening knee pain limiting mobility",
        "self_care": "mild headache, no other symptoms",
    }

    return {
        "id": str(uuid.uuid4()),
        "member_id": member["id"],
        "symptoms": symptom_map.get(recommendation, "general symptoms"),
        "recommendation": recommendation,
        "confidence": round(random.uniform(0.65, 0.97), 2),
        "reasoning_summary": f"Routed to {recommendation} based on symptom pattern and member history.",
        "cost_analysis": json.dumps({
            "recommended_cost": random.randint(50, 1500),
            "er_cost_avoided": random.randint(0, 3000),
        }),
        "actual_care_used": recommendation if random.random() > 0.3 else None,
        "created_at": (_random_date(date(2023, 1, 1), date.today())).isoformat(),
    }


# ---------------------------------------------------------------------------
# Seed runner
# ---------------------------------------------------------------------------

def seed_all_data(members_count: int = MEMBER_COUNT) -> dict[str, int]:
    """
    Generate and insert all seed data.
    Returns counts of rows inserted per table.
    """
    from .client import db

    members = [generate_member(i + 1) for i in range(members_count)]
    claims = []
    triage_outcomes = []

    for member in members:
        n_claims = random.randint(CLAIMS_PER_MEMBER_MIN, CLAIMS_PER_MEMBER_MAX)
        for j in range(n_claims):
            claims.append(generate_claim(member, j + 1))
        if random.random() > 0.3:
            triage_outcomes.append(generate_triage_outcome(member))

    def _insert(table: str, rows: list[dict]):
        # Batch insert in chunks of 50 to respect Supabase row limits
        for i in range(0, len(rows), 50):
            chunk = rows[i : i + 50]
            db.client.table(table).insert(chunk).execute()

    logger.info(f"Seeding {len(members)} members...")
    _insert("members", members)

    logger.info(f"Seeding {len(claims)} claims...")
    _insert("claims", claims)

    logger.info(f"Seeding {len(triage_outcomes)} triage outcomes...")
    _insert("triage_outcomes", triage_outcomes)

    counts = {
        "members": len(members),
        "claims": len(claims),
        "triage_outcomes": len(triage_outcomes),
    }
    logger.info(f"Seed complete: {counts}")
    return counts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = seed_all_data()
    print(f"Seeded: {result}")
