import { MOCK_MEMBERS, MOCK_CLAIMS, MOCK_TRIAGE_HISTORY } from './mockData';
import type { MemberRow } from './supabase';

export interface DemoScenario {
  id: string;
  title: string;
  memberId: string;
  member: MemberRow;
  situation: string;
  symptoms: string;
  expectedRecommendation: string;
  actualOutcome: string;
  costImpact: string;
  learningPoint: string;
  claimsContext: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'scenario_a',
    title: 'Diabetic Member — Missed Screening Detected',
    memberId: 'mbr_001',
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_001')!,
    situation: 'John, 67, has Type 2 Diabetes, Hypertension, and CKD Stage 2. His last HbA1c was never filed in claims. Risk score: 87/100.',
    symptoms: 'My blood sugar has been higher than usual for the past 2 weeks, running around 280-320. I\'m more thirsty than normal and tired.',
    expectedRecommendation: 'urgent_care',
    actualOutcome: 'Member followed recommendation to urgent care. HbA1c found at 9.2% — medication adjusted. Prevented likely hospitalization for hyperglycemic crisis.',
    costImpact: 'Urgent care visit: $280 vs projected ED visit: $2,800 + potential hospitalization: $8,400. Total savings: $10,920.',
    learningPoint: 'Context-aware triage recognizes elevated glucose + diabetes history = urgent, not routine. System also flagged missing annual HbA1c screening.',
    claimsContext: '7 claims on file including 1 ED visit and 1 hospitalization in past 12 months for diabetes management.',
  },
  {
    id: 'scenario_b',
    title: 'CHF Member — Emergency Routing',
    memberId: 'mbr_003',
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_003')!,
    situation: 'Robert, 72, has CHF, Atrial Fibrillation, and CAD. On Warfarin. Has 2 prior hospitalizations for CHF exacerbation. Risk score: 94/100.',
    symptoms: 'I\'ve gained 8 pounds in 3 days, my ankles are very swollen, and I feel short of breath when lying down. I had to sleep in a recliner last night.',
    expectedRecommendation: 'emergency',
    actualOutcome: 'Member went to ER. Diagnosed with acute CHF decompensation. 4-day hospitalization, diuresis, medication adjustment. Enrolled in remote monitoring post-discharge.',
    costImpact: 'No cost savings — emergency was correct. Remote monitoring enrollment projected to prevent next $24,500 hospitalization.',
    learningPoint: 'Orthopnea + rapid weight gain + bilateral edema in CHF patient = textbook decompensation. Triage correctly identified this pattern using member history.',
    claimsContext: '6 claims including 2 ED visits and 1 hospitalization in past 6 months. System recognized repeat exacerbation pattern.',
  },
  {
    id: 'scenario_c',
    title: 'High-Cost Member — Preventive Campaign Generation',
    memberId: 'mbr_025',
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_025')!,
    situation: 'George, 82, has CHF, Atrial Fibrillation, COPD, and CKD Stage 3. On 5 medications. Risk score: 98/100. $60,500 in claims over 6 months.',
    symptoms: '',
    expectedRecommendation: 'preventive_campaigns',
    actualOutcome: 'Palliative care consult scheduled. Advanced care plan created. Goals of care documented. ED visits reduced 60% post-enrollment.',
    costImpact: 'Pre-intervention: $120K/year projected. Post-palliative care enrollment: $78K. Savings: $42K/year + significantly improved quality of life.',
    learningPoint: 'Frail, high-risk members with 4+ comorbidities benefit most from care coordination and advance planning — not just more aggressive treatment.',
    claimsContext: '2 hospitalizations ($60,500), 2 ED visits, multiple specialist visits in 6 months. Highest-cost, highest-risk member in population.',
  },
  {
    id: 'scenario_d',
    title: 'Low Acuity — Telehealth Routing',
    memberId: 'mbr_022',
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_022')!,
    situation: 'David, 51, has Sleep Apnea, Obesity, and Hypertension. Generally healthy. Comes in with a common cold.',
    symptoms: 'Sore throat, runny nose, mild fever of 100.2°F, feeling tired. Started yesterday.',
    expectedRecommendation: 'telehealth',
    actualOutcome: 'Member completed telehealth visit in 20 minutes. Provider prescribed supportive care. Resolved in 5 days without complications.',
    costImpact: 'Telehealth: $75 vs ED: $2,800 vs Urgent Care: $280. Saved $205 over urgent care, $2,725 over ED.',
    learningPoint: 'Not every sick member needs in-person care. URI symptoms without red flags → telehealth. System applies member risk context but still routes low-acuity symptoms appropriately.',
    claimsContext: 'Low claims history for acute conditions. No ED visits. Chronic condition claims only.',
  },
];

export function getDemoScenarioById(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find(s => s.id === id);
}

export interface OutcomeTracking {
  memberId: string;
  intervention: string;
  date: string;
  recommendedAction: string;
  actualAction: string;
  costRecommended: number;
  costActual: number;
  costSaved: number;
  outcome: 'followed' | 'not_followed' | 'pending';
  clinicalOutcome: string;
}

export const OUTCOME_TRACKING: OutcomeTracking[] = [
  {
    memberId: 'mbr_001',
    intervention: 'HbA1c + Medication Adjustment',
    date: '2024-03-15',
    recommendedAction: 'Urgent care for glucose management',
    actualAction: 'Urgent care visit completed',
    costRecommended: 280,
    costActual: 280,
    costSaved: 10920,
    outcome: 'followed',
    clinicalOutcome: 'HbA1c 9.2% found, insulin dose adjusted. No hospitalization needed.',
  },
  {
    memberId: 'mbr_003',
    intervention: 'CHF Decompensation Management',
    date: '2024-03-08',
    recommendedAction: 'Emergency evaluation',
    actualAction: 'ED visit + hospitalization',
    costRecommended: 2800,
    costActual: 26500,
    costSaved: 0,
    outcome: 'followed',
    clinicalOutcome: 'CHF exacerbation treated. Remote monitoring enrolled — preventing next episode.',
  },
  {
    memberId: 'mbr_022',
    intervention: 'URI Telehealth Routing',
    date: '2024-06-08',
    recommendedAction: 'Telehealth for upper respiratory symptoms',
    actualAction: 'Telehealth visit completed',
    costRecommended: 75,
    costActual: 75,
    costSaved: 205,
    outcome: 'followed',
    clinicalOutcome: 'URI confirmed, supportive care recommended, resolved in 5 days.',
  },
  {
    memberId: 'mbr_006',
    intervention: 'Diabetic Foot Exam',
    date: '2024-06-01',
    recommendedAction: 'Podiatry referral — annual diabetic foot exam',
    actualAction: 'Pending',
    costRecommended: 250,
    costActual: 0,
    costSaved: 0,
    outcome: 'pending',
    clinicalOutcome: 'Outreach sent. Member has not yet scheduled.',
  },
];
