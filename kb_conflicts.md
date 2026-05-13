# Knowledge Base: Source Conflicts Log

**Version:** 1.0.0  
**Created:** 2026-05-13  
**Status:** Requires medical advisor resolution before deployment

---

## How to Use This Document

Each conflict is logged with:
- The two (or more) conflicting sources
- What specifically they disagree on
- The resolution applied in the KB
- Who needs to review and sign off

**Resolution policy:** When sources conflict, we include ALL positions and flag with `note_conflict` in the entry. We NEVER silently pick one. Medical advisor must review flagged entries.

---

## CONFLICT_001: Blood Pressure Target for Adults 60+

**KB Entry:** `CONDITION_HTN_001`  
**Conflict Type:** Guideline Disagreement (Major Society Guideline vs. Updated Guideline)

### Source 1 — JNC8 (2014)
- **Recommendation:** For adults ≥60, treat to goal <150/90 mmHg  
- **Evidence basis:** Systematic review of RCTs; prioritized reducing overtreatment harms in elderly  
- **Date:** 2014-12-18  
- **URL:** JAMA 2014;311(5):507-520

### Source 2 — ACC/AHA 2017 High Blood Pressure Guideline
- **Recommendation:** Treat all adults (including ≥60) to <130/80 mmHg when appropriate  
- **Evidence basis:** SPRINT trial (2015) — <120 systolic target reduced cardiovascular events 25% and death 27%  
- **Date:** 2017-11-13  
- **URL:** Hypertension. 2018;71(6):1269-1324

### Source 3 — ESC/ESH 2018 European Guidelines
- **Recommendation:** Adults 65-79: target 130-139/70-79 mmHg. Adults 80+: 130-139 systolic if tolerated.  
- **Date:** 2018-08-25  
- **Note:** European guidelines use different BP categories and targets than US guidelines.

### Disagreement Summary
JNC8 allows <150/90 for age ≥60 (to prevent overtreatment). ACC/AHA 2017 says <130/80 for most adults including 60+. SPRINT trial showed benefit of intensive control but excluded high-risk patients (DM, prior stroke, advanced CKD).

### Resolution Applied in KB
The KB follows **ACC/AHA 2017 as current US standard** (`confidence: 0.97`), notes the JNC8 position for elderly/frail patients with individualized targets, and flags that "older frail patients" may appropriately use <140/90 or <150/90 per shared decision-making. The SPRINT trial exclusion criteria are noted.

### Medical Advisor Action Required
- [ ] Confirm whether Arlo's clinical team adopts ACC/AHA 2017 or a hybrid approach for elderly patients
- [ ] Specify frailty threshold for relaxed targets
- [ ] Confirm whether ESC targets are relevant for Arlo's member population

---

## CONFLICT_002: Mammography Screening Start Age and Frequency

**KB Entry:** `SCREEN_BREAST_001`  
**Conflict Type:** Major Society Guideline Disagreement

### Source 1 — USPSTF 2024 (Final)
- **Recommendation:** Screening mammography every 2 years, starting at age 40  
- **Prior recommendation (2016):** Start at 50; ages 40-49 individual decision  
- **Date:** 2024-04-30  
- **Grade:** B

### Source 2 — American Cancer Society 2015 (current as of KB creation)
- **Recommendation:** Annual mammography starting at 45 (option to start at 40); continue annually ages 45-54; biennial ok from 55+  
- **Date:** 2015-10-20

### Source 3 — American College of Radiology (ACR) and Society of Breast Imaging (SBI)
- **Recommendation:** Annual mammography starting at 40 for average-risk women  
- **Rationale:** Maximum mortality reduction with annual screening; interval cancers are more aggressive  
- **Date:** 2023 (most recent statement)

### Source 4 — ACOG (American College of Obstetricians and Gynecologists) 2023
- **Recommendation:** Annual or biennial mammography offered to average-risk women at age 40  
- **Date:** 2023-01-01

### Disagreement Summary

| Society | Start Age | Frequency |
|---------|-----------|-----------|
| USPSTF 2024 | 40 | Every 2 years |
| ACS 2015 | 45 (option 40) | Annual 45-54, then biennial |
| ACR/SBI | 40 | Annual |
| ACOG 2023 | 40 | Annual or biennial (shared decision) |

Disagreement centers on: (1) false positive rate and overdiagnosis harms from annual screening starting at 40; (2) magnitude of mortality benefit in 40-49 age group (USPSTF: moderate benefit justifies B grade). The ACR argues annual screening saves more lives and the harms of false positives are manageable.

### Resolution Applied in KB
KB follows **USPSTF 2024** as the basis (federal guideline determining ACA coverage/Medicare coverage), with `note_conflict` flagging the ACR/ACS positions and noting that **annual starting at 40 is a clinically defensible alternative** per shared decision-making. Confidence set at 0.97 (high evidence, active guideline disagreement on details).

### Medical Advisor Action Required
- [ ] Specify which recommendation Arlo will use as default in triage routing
- [ ] Confirm shared decision-making language for 40-49 age group
- [ ] Determine whether Arlo's gap detection uses USPSTF (biennial) or ACR (annual) as the compliance threshold

---

## CONFLICT_003: Cervical Cancer Screening Method Preference (Pap vs HPV-alone)

**KB Entry:** `SCREEN_CERVICAL_001`  
**Conflict Type:** Preferred Test Disagreement

### Source 1 — USPSTF 2018 (current)
- **Recommendation:** Pap every 3 years (21-65) OR co-testing every 5 years (30-65) OR hrHPV alone every 5 years (30-65) — all acceptable
- **Date:** 2018-08-21

### Source 2 — ACS 2020
- **Recommendation:** HPV test alone (primary hrHPV testing) every 5 years preferred for ages 25-65. Co-test or Pap-alone are acceptable alternatives only if primary HPV not available.  
- **Date:** 2020-07-07  
- **Rationale:** Primary HPV testing superior sensitivity; ATHENA trial showed HPV-first detects CIN3+ better than cytology alone

### Source 3 — ACOG 2021
- **Recommendation:** Co-testing every 5 years is preferred for 30-65 (vs. HPV alone); Pap alone every 3 years acceptable for 21-65  
- **Date:** 2021-04-01

### Disagreement Summary
ACS prefers HPV-alone testing starting at 25. USPSTF allows any of three strategies. ACOG prefers co-testing. Primary disagreement is whether HPV-alone is preferred or whether co-testing adds value over HPV-alone.

### Resolution Applied in KB
KB follows **USPSTF 2018** as all three strategies are acceptable, notes ACS preference for hrHPV-first, and specifies that gap detection uses the most permissive criteria (Pap in past 3 years OR HPV/co-test in past 5 years) to avoid false positives in gap identification.

### Medical Advisor Action Required
- [ ] Confirm which strategy Arlo recommends in outreach campaigns
- [ ] Confirm gap detection threshold (3-year or 5-year rule)

---

## CONFLICT_004: Aspirin for Primary Cardiovascular Prevention

**KB Entry:** `CONDITION_CAD_001` (primary prevention note)  
**Conflict Type:** Reversal of Prior Recommendation

### Source 1 — USPSTF 2022 (current)
- **Age 60+:** Recommends AGAINST initiating aspirin for primary CVD prevention (Grade D)
- **Age 40-59 with ≥10% 10-year CVD risk:** Individual decision (Grade C) — evidence that harms (GI bleeding) increasingly outweigh benefits with age
- **Date:** 2022-04-26

### Source 2 — Prior USPSTF 2016
- **Prior recommendation:** Aspirin for adults 50-59 with ≥10% 10-year CVD risk (Grade B)
- **This recommendation is now SUPERSEDED**

### Source 3 — ACC/AHA 2019 Primary Prevention Guideline
- **Recommendation:** Low-dose aspirin "might be considered" for select adults 40-70 at higher ASCVD risk without increased bleeding risk. Should NOT be administered on routine basis for primary prevention in adults >70.
- **Date:** 2019-03-17

### Disagreement Summary
The major clinical trials (ASCEND, ASPREE, ARRIVE) published 2018-2019 showed that bleeding risk cancels CVD benefit for primary prevention in modern patients (already on statins, BP controlled). USPSTF 2022 reversed its 2016 recommendation. Some cardiologists still individualize for high-risk 40-59 patients.

### Resolution Applied in KB
KB uses **USPSTF 2022** as the current standard, explicitly notes that aspirin for *secondary* prevention (established CVD) remains recommended, and flags the 2022 reversal. The triage system will not recommend aspirin initiation for primary prevention.

### Medical Advisor Action Required
- [ ] Confirm messaging for members currently on aspirin for primary prevention (do not abruptly stop — PCP discussion)
- [ ] Confirm age cutoff guidance

---

## CONFLICT_005: GLP-1 Agonists — Weight Loss Indication vs. Diabetes Indication Coverage

**KB Entries:** `CONDITION_T2DM_001`, `CONDITION_OBESITY_001`  
**Conflict Type:** Insurance Coverage Policy Inconsistency (not clinical)

### Issue
The same drug (semaglutide) is FDA-approved for two indications:
- **Ozempic (semaglutide 0.5-2mg):** T2DM indication — widely covered by insurance
- **Wegovy (semaglutide 2.4mg):** Obesity/weight loss indication — frequently NOT covered

Members with T2DM and obesity may have Ozempic covered but Wegovy excluded, despite both containing the same molecule. This creates a clinically incoherent situation.

### Medicare-Specific Issue
As of 2024, Medicare Part D generally EXCLUDES anti-obesity medications (weight loss drugs) by statute (Social Security Act §1860D-2(e)(2)(A)). Medicare covers Ozempic for T2DM but not Wegovy for obesity. CMS proposed expanding coverage — policy status evolving.

### Resolution Applied in KB
Both entries note the coverage inconsistency. Triage and care partner responses should NOT recommend specific formulary decisions — always tell members to check their specific plan formulary and consult their PCP/endocrinologist.

### Medical Advisor Action Required
- [ ] Determine if Arlo's plan formulary covers anti-obesity medications
- [ ] Prepare member-facing language explaining the Ozempic vs. Wegovy coverage distinction

---

## CONFLICT_006: Diabetes Screening Age — General Population vs. High-Risk Populations

**KB Entry:** `SCREEN_DIABETES_001`  
**Conflict Type:** Guideline Population Threshold Disagreement

### Source 1 — USPSTF 2021
- **Recommendation:** Screen overweight/obese adults aged 35-70  
- **Start age:** 35

### Source 2 — ADA Standards of Care 2024
- **Recommendation:** Screen adults 35+ (any BMI). Screen earlier if BMI ≥23 in Asian Americans. Screen younger if prediabetes risk factors present (gestational DM, first-degree relative, high-risk race/ethnicity).  
- **Notable difference:** ADA uses BMI ≥23 threshold for Asian Americans vs. USPSTF ≥25 threshold

### Disagreement Summary
USPSTF says 35-70 with BMI ≥25. ADA says 35+ regardless of BMI, with lower BMI threshold for Asian Americans. The ADA approach is more sensitive for high-risk minority populations where T2DM develops at lower BMIs.

### Resolution Applied in KB
Gap detection uses **ADA 2024 thresholds** to avoid missing high-risk minority members. The USPSTF threshold is noted for insurance coverage (Medicare follows USPSTF). This means our detection is more sensitive than Medicare's coverage mandate — members may need to advocate with their PCP for testing if insurance uses USPSTF criteria.

### Medical Advisor Action Required
- [ ] Confirm which threshold Arlo will use for outreach (ADA or USPSTF)
- [ ] Confirm disparate impact review process for screening criteria

---

## Summary: Unresolved Items Requiring Medical Advisor Sign-Off

| ID | Topic | Priority | Assigned To |
|----|-------|----------|-------------|
| CONFLICT_001 | BP target age 60+ | HIGH | Medical Director |
| CONFLICT_002 | Mammography age/frequency | HIGH | Medical Director |
| CONFLICT_003 | Cervical screening method | MEDIUM | Clinical Team |
| CONFLICT_004 | Aspirin primary prevention | HIGH | Medical Director |
| CONFLICT_005 | GLP-1 coverage inconsistency | MEDIUM | Pharmacy + Medical Director |
| CONFLICT_006 | Diabetes screening BMI thresholds | HIGH | Medical Director + DEIA Officer |

**All conflicts must be resolved before KB deployment.**

---

*Generated by Arlo Health AI KB Builder | Last updated: 2026-05-13*
