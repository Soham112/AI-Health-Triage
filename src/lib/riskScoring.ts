import type { MemberRow, ClaimRow } from './supabase';

export interface RiskFactor {
  name: string;
  weight: number;
  description: string;
  category: 'chronic' | 'utilization' | 'medication' | 'social' | 'claims_pattern';
}

export interface PreventiveOpportunity {
  intervention: string;
  rationale: string;
  projectedSavings: number;
  urgency: 'high' | 'medium' | 'low';
  evidenceBase: string;
}

export interface RiskScoreResult {
  overallRisk: number;
  riskTier: 'critical' | 'high' | 'moderate' | 'low';
  riskFactors: RiskFactor[];
  predictedAnnualCost: number;
  hospitalizationProbability: number;
  preventiveOpportunities: PreventiveOpportunity[];
  riskDriverSummary: string;
}

// ICD-10 groupings for chronic condition complexity
const HIGH_RISK_CONDITIONS: Record<string, { weight: number; category: string }> = {
  // Cardiovascular
  'Heart Failure':             { weight: 25, category: 'cardiovascular' },
  'CHF':                       { weight: 25, category: 'cardiovascular' },
  'Coronary Artery Disease':   { weight: 20, category: 'cardiovascular' },
  'Atrial Fibrillation':       { weight: 18, category: 'cardiovascular' },
  'Peripheral Arterial Disease': { weight: 15, category: 'cardiovascular' },
  // Metabolic / endocrine
  'Type 2 Diabetes':           { weight: 20, category: 'metabolic' },
  'Type 1 Diabetes':           { weight: 18, category: 'metabolic' },
  'Diabetic Retinopathy':      { weight: 12, category: 'metabolic' },
  'Peripheral Neuropathy':     { weight: 10, category: 'metabolic' },
  // Renal
  'Chronic Kidney Disease Stage 4': { weight: 28, category: 'renal' },
  'Chronic Kidney Disease Stage 3': { weight: 18, category: 'renal' },
  'Chronic Kidney Disease Stage 2': { weight: 10, category: 'renal' },
  // Pulmonary
  'COPD':                      { weight: 20, category: 'pulmonary' },
  'Asthma':                    { weight: 8, category: 'pulmonary' },
  // Oncology
  'Lung Cancer':               { weight: 22, category: 'oncology' },
  'Breast Cancer (on treatment)': { weight: 18, category: 'oncology' },
  'Prostate Cancer (on treatment)': { weight: 14, category: 'oncology' },
  // Neurological
  "Alzheimer's Disease":       { weight: 20, category: 'neurological' },
  "Parkinson's Disease":       { weight: 15, category: 'neurological' },
  'Multiple Sclerosis':        { weight: 15, category: 'neurological' },
  // Other high-cost
  'Liver Cirrhosis':           { weight: 22, category: 'hepatic' },
  'Lupus (SLE)':               { weight: 14, category: 'autoimmune' },
  "Crohn's Disease":           { weight: 12, category: 'gi' },
};

const COMPLEX_MEDICATION_PATTERNS = [
  'Warfarin', 'Insulin', 'Insulin Glargine', 'Insulin Lispro',
  'Apixaban', 'Rivaroxaban', 'Digoxin', 'Furosemide',
  'Adalimumab', 'Infliximab', 'Etanercept', 'Methotrexate',
  'Cisplatin', 'Leuprolide', 'Erythropoietin',
];

// Predicted annual costs by risk tier (actuarial estimates)
const COST_BY_TIER = {
  critical: { base: 45000, hospitalizationProb: 0.75 },
  high:     { base: 18000, hospitalizationProb: 0.40 },
  moderate: { base: 8000,  hospitalizationProb: 0.15 },
  low:      { base: 2500,  hospitalizationProb: 0.03 },
};

export function scoreRisk(member: MemberRow, claims: ClaimRow[]): RiskScoreResult {
  const riskFactors: RiskFactor[] = [];
  let rawScore = 0;

  // ── 1. Age factor ──────────────────────────────────────────────────────────
  const ageScore = member.age >= 80 ? 20 : member.age >= 70 ? 15 : member.age >= 60 ? 10 : member.age >= 50 ? 5 : 0;
  if (ageScore > 0) {
    rawScore += ageScore;
    riskFactors.push({
      name: `Age ${member.age}`,
      weight: ageScore,
      description: `Advanced age is a significant risk multiplier for acute events and hospitalizations`,
      category: 'social',
    });
  }

  // ── 2. Chronic condition burden ───────────────────────────────────────────
  let conditionScore = 0;
  for (const condition of member.conditions) {
    for (const [key, val] of Object.entries(HIGH_RISK_CONDITIONS)) {
      if (condition.includes(key)) {
        conditionScore += val.weight;
        riskFactors.push({
          name: condition,
          weight: val.weight,
          description: `${val.category} condition — increases hospitalization risk and care complexity`,
          category: 'chronic',
        });
        break;
      }
    }
  }
  // Comorbidity multiplier — each additional condition compounds risk
  const comorbidityMultiplier = member.conditions.length >= 4 ? 1.4 : member.conditions.length >= 3 ? 1.2 : member.conditions.length >= 2 ? 1.1 : 1.0;
  conditionScore = Math.round(conditionScore * comorbidityMultiplier);
  rawScore += conditionScore;

  // ── 3. High-complexity medications ────────────────────────────────────────
  let medScore = 0;
  const complexMeds = member.medications.filter(med =>
    COMPLEX_MEDICATION_PATTERNS.some(pattern => med.includes(pattern))
  );
  if (complexMeds.length >= 3) {
    medScore = 12;
    riskFactors.push({ name: 'Polypharmacy (complex)', weight: 12, description: `${complexMeds.length} high-complexity medications — adherence and interaction risk`, category: 'medication' });
  } else if (complexMeds.length >= 1) {
    medScore = 6;
    riskFactors.push({ name: 'Complex medication regimen', weight: 6, description: `High-risk medications requiring close monitoring`, category: 'medication' });
  }
  rawScore += medScore;

  // ── 4. Claims utilization patterns ────────────────────────────────────────
  const recentClaims = claims.filter(c => {
    const claimDate = new Date(c.date);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    return claimDate >= cutoff;
  });

  const edVisits = recentClaims.filter(c => c.category === 'Emergency').length;
  const inpatientStays = recentClaims.filter(c => c.category === 'Inpatient').length;
  const totalCost = recentClaims.reduce((sum, c) => sum + c.cost, 0);

  if (edVisits >= 3) {
    rawScore += 20;
    riskFactors.push({ name: `${edVisits} ED visits (12mo)`, weight: 20, description: 'Frequent ED use signals uncontrolled conditions or inadequate ambulatory care access', category: 'utilization' });
  } else if (edVisits >= 2) {
    rawScore += 14;
    riskFactors.push({ name: `${edVisits} ED visits (12mo)`, weight: 14, description: 'Multiple ED visits indicate disease instability', category: 'utilization' });
  } else if (edVisits === 1) {
    rawScore += 7;
    riskFactors.push({ name: '1 ED visit (12mo)', weight: 7, description: 'Single ED visit may indicate acute decompensation', category: 'utilization' });
  }

  if (inpatientStays >= 2) {
    rawScore += 25;
    riskFactors.push({ name: `${inpatientStays} hospitalizations (12mo)`, weight: 25, description: 'Repeat hospitalizations — highest predictor of future acute events', category: 'utilization' });
  } else if (inpatientStays === 1) {
    rawScore += 15;
    riskFactors.push({ name: '1 hospitalization (12mo)', weight: 15, description: 'Prior hospitalization doubles near-term rehospitalization risk', category: 'utilization' });
  }

  if (totalCost > 50000) {
    rawScore += 10;
    riskFactors.push({ name: `High annual cost ($${Math.round(totalCost / 1000)}K)`, weight: 10, description: 'Very high claims spend indicates complex, active disease burden', category: 'claims_pattern' });
  } else if (totalCost > 20000) {
    rawScore += 5;
    riskFactors.push({ name: `Elevated annual cost ($${Math.round(totalCost / 1000)}K)`, weight: 5, description: 'Above-average claims spend indicates active condition management', category: 'claims_pattern' });
  }

  // ── 5. Normalize to 0-100 ─────────────────────────────────────────────────
  const overallRisk = Math.min(100, Math.round(rawScore));

  // ── 6. Risk tier ──────────────────────────────────────────────────────────
  const riskTier: RiskScoreResult['riskTier'] =
    overallRisk >= 85 ? 'critical' :
    overallRisk >= 65 ? 'high' :
    overallRisk >= 35 ? 'moderate' : 'low';

  const tierData = COST_BY_TIER[riskTier];

  // ── 7. Predicted annual cost ───────────────────────────────────────────────
  // Weighted blend of tier baseline and actual recent spend
  const predictedAnnualCost = recentClaims.length > 0
    ? Math.round((tierData.base * 0.6) + (totalCost * 0.4 * 1.1))
    : tierData.base;

  // ── 8. Preventive opportunities ───────────────────────────────────────────
  const preventiveOpportunities = identifyPreventiveOpportunities(member, claims, riskTier);

  const riskDriverSummary = buildRiskDriverSummary(member, riskFactors, riskTier, edVisits, inpatientStays);

  return {
    overallRisk,
    riskTier,
    riskFactors: riskFactors.sort((a, b) => b.weight - a.weight),
    predictedAnnualCost,
    hospitalizationProbability: tierData.hospitalizationProb,
    preventiveOpportunities,
    riskDriverSummary,
  };
}

function identifyPreventiveOpportunities(
  member: MemberRow,
  claims: ClaimRow[],
  riskTier: RiskScoreResult['riskTier'],
): PreventiveOpportunity[] {
  const opportunities: PreventiveOpportunity[] = [];
  const procedures = new Set(claims.map(c => c.procedure_code));
  const conditions = member.conditions;

  // Diabetes management
  if (conditions.some(c => c.includes('Diabetes'))) {
    const hasHbA1c = claims.some(c => c.procedure_code === '83036');
    if (!hasHbA1c) {
      opportunities.push({
        intervention: 'HbA1c Testing (overdue)',
        rationale: 'No HbA1c in claims history — unmonitored glycemia leads to complications costing $8-40K',
        projectedSavings: 4200,
        urgency: 'high',
        evidenceBase: 'ADA Standards of Care: HbA1c every 3 months for uncontrolled, every 6 months stable',
      });
    }
    const hasEyeExam = claims.some(c => ['92134', '92228', '92229'].includes(c.procedure_code));
    if (!hasEyeExam) {
      opportunities.push({
        intervention: 'Diabetic Eye Exam (overdue)',
        rationale: 'Diabetic retinopathy detected early avoids $12-45K laser/vitrectomy procedures',
        projectedSavings: 2800,
        urgency: 'high',
        evidenceBase: 'ADA: annual dilated eye exam for all diabetics',
      });
    }
    if (conditions.some(c => c.includes('Neuropathy') || c.includes('Peripheral'))) {
      opportunities.push({
        intervention: 'Annual Podiatry / Foot Exam',
        rationale: 'Diabetic foot complications: $50-200K per amputation episode. Annual exam reduces risk by 65%',
        projectedSavings: 8500,
        urgency: 'high',
        evidenceBase: 'ADA: annual comprehensive foot exam — reduces lower extremity amputations',
      });
    }
  }

  // CHF remote monitoring
  if (conditions.some(c => c.includes('Heart Failure') || c.includes('CHF'))) {
    opportunities.push({
      intervention: 'Remote Patient Monitoring Enrollment',
      rationale: 'Daily weight/BP telemonitoring catches decompensation before $25-50K hospitalization',
      projectedSavings: 18000,
      urgency: 'high',
      evidenceBase: 'NEJM: RPM reduces CHF hospitalizations by 38%',
    });
    if (riskTier === 'critical') {
      opportunities.push({
        intervention: 'Palliative Care / Advanced Care Planning Consult',
        rationale: 'Stage 4 CHF — advance care planning reduces unwanted ICU admissions and improves quality of life',
        projectedSavings: 35000,
        urgency: 'high',
        evidenceBase: 'AHRQ: early palliative care reduces ICU costs 40%+ while improving patient satisfaction',
      });
    }
  }

  // COPD management
  if (conditions.some(c => c.includes('COPD'))) {
    const hasPFT = claims.some(c => c.procedure_code === '94060');
    if (!hasPFT) {
      opportunities.push({
        intervention: 'Pulmonary Function Testing + Pulmonologist Referral',
        rationale: 'COPD staging guides medication optimization, preventing $18-25K exacerbation hospitalizations',
        projectedSavings: 12000,
        urgency: 'medium',
        evidenceBase: 'GOLD guidelines: spirometry-guided management reduces exacerbations by 25%',
      });
    }
    opportunities.push({
      intervention: 'COPD Disease Management Program Enrollment',
      rationale: 'Structured action plans and care coordination reduce exacerbations and ED visits',
      projectedSavings: 9000,
      urgency: 'medium',
      evidenceBase: 'Cochrane: self-management education reduces COPD hospitalizations by 40%',
    });
  }

  // CKD nephrology
  if (conditions.some(c => c.includes('Chronic Kidney Disease'))) {
    const ckdStage4 = conditions.some(c => c.includes('Stage 4'));
    if (ckdStage4) {
      opportunities.push({
        intervention: 'Pre-Dialysis Nephrology Intensive + AV Fistula Planning',
        rationale: 'Timely AV fistula creation saves $40-60K vs catheter-based HD start; delays progression',
        projectedSavings: 45000,
        urgency: 'high',
        evidenceBase: 'KDIGO: early nephrology referral for CKD 4-5 reduces dialysis complications',
      });
    }
  }

  // Metabolic syndrome / obesity
  if (conditions.some(c => c.includes('Obesity') || c.includes('Pre-diabetes') || c.includes('Metabolic'))) {
    opportunities.push({
      intervention: 'Intensive Lifestyle Intervention Program',
      rationale: '5-7% weight loss prevents T2DM with 58% efficacy, avoiding $8-15K/year diabetic care',
      projectedSavings: 9800,
      urgency: 'medium',
      evidenceBase: 'DPP trial: lifestyle intervention > metformin for diabetes prevention',
    });
  }

  // Cancer screenings (age-based)
  if (member.age >= 45 && member.gender === 'F' && !conditions.some(c => c.includes('Breast Cancer'))) {
    const hasMammo = claims.some(c => ['77067', '77065', '77066'].includes(c.procedure_code));
    if (!hasMammo) {
      opportunities.push({
        intervention: 'Mammography Screening (overdue)',
        rationale: 'Early-stage breast cancer treatment: $80K vs late-stage $300K+; USPSTF recommends biennial screening',
        projectedSavings: 6000,
        urgency: 'medium',
        evidenceBase: 'USPSTF: mammography every 2 years for women 40-74',
      });
    }
  }

  if (member.age >= 45 && !procedures.has('45378') && !procedures.has('45380')) {
    opportunities.push({
      intervention: 'Colorectal Cancer Screening',
      rationale: 'Colonoscopy detects polyps before $120K+ colon cancer treatment; 90% survival if caught early',
      projectedSavings: 4500,
      urgency: member.age >= 55 ? 'high' : 'medium',
      evidenceBase: 'USPSTF: colorectal screening 45-75, colonoscopy every 10 years',
    });
  }

  return opportunities.sort((a, b) => {
    const urgencyOrder = { high: 3, medium: 2, low: 1 };
    return (urgencyOrder[b.urgency] - urgencyOrder[a.urgency]) || (b.projectedSavings - a.projectedSavings);
  });
}

function buildRiskDriverSummary(
  member: MemberRow,
  factors: RiskFactor[],
  tier: RiskScoreResult['riskTier'],
  edVisits: number,
  inpatientStays: number,
): string {
  const topFactors = factors.slice(0, 3).map(f => f.name).join(', ');
  const utilizationNote = edVisits > 0 || inpatientStays > 0
    ? ` with ${edVisits} ED visit(s) and ${inpatientStays} hospitalization(s) in the past year`
    : '';
  return `${member.age}-year-old member with ${tier} risk driven by ${topFactors}${utilizationNote}. Comorbidity burden of ${member.conditions.length} active conditions creates compounding risk.`;
}
