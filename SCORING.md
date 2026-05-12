# Risk Scoring & Claims Analysis Methodology

## Risk Score (0-100)

The actuarial risk model produces a single score combining five weighted dimensions.

### Dimensions and Weights

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Condition burden | 30% | Severity-weighted active ICD-10 diagnoses |
| Utilization | 30% | ER visits, hospitalizations, total spend |
| Medication complexity | 20% | Polypharmacy risk, high-risk drug classes |
| Age | 10% | Non-linear age curve (risk accelerates post-50) |
| Social determinants | 10% | SDOH flags: food insecurity, housing, transport |

### Risk Tiers

| Score | Tier | Action |
|-------|------|--------|
| 0–30 | Low | Standard outreach cadence |
| 31–60 | Medium | Targeted preventive campaigns |
| 61–80 | High | Case management enrollment |
| 81–100 | Critical | Immediate care coordination |

### Comorbidity Multiplier

Having multiple conditions is worse than their sum. When ≥2 conditions are active, a multiplier amplifies the raw score:

- 2–3 conditions: 1.15×
- 4+ conditions: 1.35×

This reflects the clinical reality that comorbidities interact (e.g., CKD + T2DM + HTN dramatically increases cardiovascular event risk beyond each condition alone).

### Condition Severity Weights

ICD-10 codes are mapped to severity weights (0–1):

| Code | Condition | Weight |
|------|-----------|--------|
| I50 | Heart Failure | 1.00 |
| N18 | Chronic Kidney Disease | 0.95 |
| C* | Cancer (any) | 0.95 |
| I25 | Ischemic Heart Disease | 0.85 |
| E10 | Type 1 Diabetes | 0.80 |
| E11 | Type 2 Diabetes | 0.75 |
| J44 | COPD | 0.70 |
| I10 | Hypertension | 0.55 |
| F32/F33 | Depression | 0.45–0.50 |
| F41 | Anxiety | 0.40 |

Primary condition contributes fully; each additional condition adds at diminishing rate (×0.4^n).

### Predicted Annual Cost

Blended from two signals:
- **Risk-curve baseline**: actuarial PMPM bands ($2,400 at risk 30 → $17,000+ at risk 60+)
- **Historical observed cost**: actual claims total for the period

When ≥6 claims exist (sufficient history): 60% projection + 40% observed.
Sparse data: projection only (confidence flagged lower).

---

## Claims Analysis Engine

### Cost Driver Categories

Claims are bucketed by CPT code range:

| Category | CPT Range | Clinical Meaning |
|----------|-----------|-----------------|
| Emergency care | 99281–99285 | ED visit |
| Inpatient | 99221–99239 | Hospital stay |
| Primary care | 99201–99215 | Office visit |
| Specialist | 99241–99245 | Consult |
| Preventive | 99381–99397, G-codes | Wellness / screening |
| Lab | 80000–89999 | Pathology / chemistry |
| Imaging | 70000–79999 | Radiology |

### Pattern Detection

Four patterns are detected automatically:

1. **ER Overutilization** — ≥3 ER visits signals unmanaged chronic conditions or care access barriers
2. **No PCP Follow-up** — hospitalization with zero subsequent PCP visits → readmission risk
3. **Preventive Gap** — no preventive CPT codes in claims despite ≥3 total claims
4. **30-day Readmission** — hospitalization within 30 days of a prior admission

### Prevention Gaps (Condition-Specific)

| Gap | Trigger Condition | Savings Estimate |
|-----|-------------------|-----------------|
| HbA1c Monitoring | T2/T1 Diabetes (E11, E10) | $1,200/year |
| Diabetic Retinopathy Screening | T2 Diabetes (E11) | $3,500/year |
| Hypertension Management Visit | Hypertension (I10) | $4,200/year |
| Colorectal Cancer Screening | All members (fallback) | $8,500/year |

### Example Calculation

Member: 65-year-old with T2DM + HTN + CKD, 4 ER visits, 5 medications

```
condition_score = 0.75*100 (E11) + 0.95*100*0.4 + 0.55*100*0.16 = 75 + 38 + 8.8 = 121.8 → capped 100
utilization_score = 4 ER*15 + 0 hosp = 60
medication_score = 5*8 + 10 (poly) = 50
age_score = 42 + (65-50)*2 = 72
sdoh_score = 0

raw = 100*0.30 + 60*0.30 + 50*0.20 + 72*0.10 + 0*0.10 = 30+18+10+7.2 = 65.2
comorbidity multiplier (3 conditions) = 1.15
overall_risk = 65.2 * 1.15 = 74.98 → tier: HIGH
```
