import type { MemberRow, ClaimRow, TriageHistoryRow, ChatHistoryRow, PreventiveCampaignRow } from './supabase';

// ─── Members ─────────────────────────────────────────────────────────────────

export const MOCK_MEMBERS: MemberRow[] = [
  {
    id: 'mbr_001', age: 67, gender: 'M',
    conditions: ['Type 2 Diabetes', 'Hypertension', 'Chronic Kidney Disease Stage 2'],
    medications: ['Metformin 1000mg', 'Lisinopril 20mg', 'Atorvastatin 40mg'],
    risk_score: 87, plan_type: 'PPO', enrollment_date: '2019-01-15', created_at: '2019-01-15T00:00:00Z',
  },
  {
    id: 'mbr_002', age: 54, gender: 'F',
    conditions: ['Asthma', 'Obesity', 'Depression'],
    medications: ['Fluticasone 250mcg inhaler', 'Albuterol inhaler PRN', 'Sertraline 100mg'],
    risk_score: 62, plan_type: 'HMO', enrollment_date: '2020-03-01', created_at: '2020-03-01T00:00:00Z',
  },
  {
    id: 'mbr_003', age: 72, gender: 'M',
    conditions: ['Coronary Artery Disease', 'Atrial Fibrillation', 'Heart Failure NYHA II'],
    medications: ['Metoprolol 50mg', 'Warfarin 5mg', 'Furosemide 40mg', 'Lisinopril 10mg'],
    risk_score: 94, plan_type: 'PPO', enrollment_date: '2018-06-20', created_at: '2018-06-20T00:00:00Z',
  },
  {
    id: 'mbr_004', age: 45, gender: 'F',
    conditions: ['Rheumatoid Arthritis', 'Osteoporosis'],
    medications: ['Methotrexate 15mg weekly', 'Folic Acid 1mg', 'Calcium 600mg', 'Vitamin D3 2000IU'],
    risk_score: 55, plan_type: 'PPO', enrollment_date: '2021-08-10', created_at: '2021-08-10T00:00:00Z',
  },
  {
    id: 'mbr_005', age: 38, gender: 'M',
    conditions: ['Hyperlipidemia'],
    medications: ['Rosuvastatin 10mg'],
    risk_score: 22, plan_type: 'HDHP', enrollment_date: '2022-01-01', created_at: '2022-01-01T00:00:00Z',
  },
  {
    id: 'mbr_006', age: 61, gender: 'F',
    conditions: ['Type 2 Diabetes', 'Peripheral Neuropathy', 'Hypertension', 'Obesity'],
    medications: ['Insulin Glargine 30u', 'Metformin 500mg', 'Gabapentin 300mg', 'Amlodipine 10mg'],
    risk_score: 81, plan_type: 'HMO', enrollment_date: '2017-11-05', created_at: '2017-11-05T00:00:00Z',
  },
  {
    id: 'mbr_007', age: 29, gender: 'F',
    conditions: ['Anxiety Disorder', 'Migraine'],
    medications: ['Escitalopram 10mg', 'Sumatriptan 50mg PRN'],
    risk_score: 18, plan_type: 'HMO', enrollment_date: '2023-02-14', created_at: '2023-02-14T00:00:00Z',
  },
  {
    id: 'mbr_008', age: 78, gender: 'M',
    conditions: ['COPD', 'Type 2 Diabetes', 'Hypertension', 'Chronic Kidney Disease Stage 3'],
    medications: ['Tiotropium inhaler', 'Formoterol/Budesonide', 'Insulin Lispro', 'Losartan 100mg', 'Amlodipine 5mg'],
    risk_score: 96, plan_type: 'PPO', enrollment_date: '2016-04-30', created_at: '2016-04-30T00:00:00Z',
  },
  {
    id: 'mbr_009', age: 50, gender: 'F',
    conditions: ['Breast Cancer (remission)', 'Lymphedema'],
    medications: ['Tamoxifen 20mg', 'Compression therapy'],
    risk_score: 48, plan_type: 'PPO', enrollment_date: '2020-09-12', created_at: '2020-09-12T00:00:00Z',
  },
  {
    id: 'mbr_010', age: 42, gender: 'M',
    conditions: ['Crohn\'s Disease', 'Anemia'],
    medications: ['Adalimumab 40mg biweekly', 'Azathioprine 100mg', 'Ferrous Sulfate 325mg'],
    risk_score: 59, plan_type: 'PPO', enrollment_date: '2019-07-22', created_at: '2019-07-22T00:00:00Z',
  },
  {
    id: 'mbr_011', age: 35, gender: 'F',
    conditions: [], medications: [],
    risk_score: 8, plan_type: 'HDHP', enrollment_date: '2023-01-01', created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 'mbr_012', age: 68, gender: 'F',
    conditions: ['Osteoarthritis', 'Hypertension', 'Hypothyroidism'],
    medications: ['Levothyroxine 75mcg', 'Hydrochlorothiazide 25mg', 'Acetaminophen 500mg PRN'],
    risk_score: 44, plan_type: 'HMO', enrollment_date: '2018-12-01', created_at: '2018-12-01T00:00:00Z',
  },
  {
    id: 'mbr_013', age: 55, gender: 'M',
    conditions: ['Prostate Cancer (active surveillance)', 'Hypertension'],
    medications: ['Dutasteride 0.5mg', 'Metoprolol 25mg'],
    risk_score: 52, plan_type: 'PPO', enrollment_date: '2021-03-15', created_at: '2021-03-15T00:00:00Z',
  },
  {
    id: 'mbr_014', age: 47, gender: 'F',
    conditions: ['Multiple Sclerosis (relapsing-remitting)'],
    medications: ['Dimethyl Fumarate 240mg', 'Baclofen 10mg PRN'],
    risk_score: 71, plan_type: 'PPO', enrollment_date: '2019-05-08', created_at: '2019-05-08T00:00:00Z',
  },
  {
    id: 'mbr_015', age: 63, gender: 'M',
    conditions: ['Type 2 Diabetes', 'Diabetic Retinopathy', 'Hypertension'],
    medications: ['Metformin 1000mg', 'Glipizide 10mg', 'Lisinopril 40mg', 'Aspirin 81mg'],
    risk_score: 78, plan_type: 'HMO', enrollment_date: '2017-08-20', created_at: '2017-08-20T00:00:00Z',
  },
  // Members 016-050 — varied profiles
  {
    id: 'mbr_016', age: 32, gender: 'M', conditions: ['ADHD'], medications: ['Adderall XR 20mg'],
    risk_score: 12, plan_type: 'HMO', enrollment_date: '2023-06-01', created_at: '2023-06-01T00:00:00Z',
  },
  {
    id: 'mbr_017', age: 75, gender: 'F',
    conditions: ['Alzheimer\'s Disease (mild)', 'Hypertension', 'Osteoporosis'],
    medications: ['Donepezil 10mg', 'Amlodipine 5mg', 'Alendronate 70mg weekly'],
    risk_score: 83, plan_type: 'PPO', enrollment_date: '2015-03-10', created_at: '2015-03-10T00:00:00Z',
  },
  {
    id: 'mbr_018', age: 44, gender: 'M',
    conditions: ['HIV (controlled)', 'Hypertension'],
    medications: ['Bictegravir/TAF/FTC', 'Lisinopril 10mg'],
    risk_score: 38, plan_type: 'PPO', enrollment_date: '2020-11-01', created_at: '2020-11-01T00:00:00Z',
  },
  {
    id: 'mbr_019', age: 58, gender: 'F',
    conditions: ['Fibromyalgia', 'Depression', 'Insomnia'],
    medications: ['Duloxetine 60mg', 'Cyclobenzaprine 5mg PRN', 'Melatonin 5mg'],
    risk_score: 41, plan_type: 'HMO', enrollment_date: '2021-01-20', created_at: '2021-01-20T00:00:00Z',
  },
  {
    id: 'mbr_020', age: 70, gender: 'M',
    conditions: ['Parkinson\'s Disease', 'Depression', 'Hypertension'],
    medications: ['Carbidopa/Levodopa 25/100mg', 'Pramipexole 0.5mg', 'Sertraline 50mg', 'Losartan 50mg'],
    risk_score: 77, plan_type: 'PPO', enrollment_date: '2018-09-15', created_at: '2018-09-15T00:00:00Z',
  },
  {
    id: 'mbr_021', age: 27, gender: 'F', conditions: ['Endometriosis'],
    medications: ['Norethindrone 5mg', 'Ibuprofen 600mg PRN'],
    risk_score: 24, plan_type: 'HDHP', enrollment_date: '2023-04-01', created_at: '2023-04-01T00:00:00Z',
  },
  {
    id: 'mbr_022', age: 51, gender: 'M',
    conditions: ['Sleep Apnea', 'Obesity', 'Hypertension'],
    medications: ['CPAP therapy', 'Lisinopril 20mg'],
    risk_score: 46, plan_type: 'HMO', enrollment_date: '2020-07-15', created_at: '2020-07-15T00:00:00Z',
  },
  {
    id: 'mbr_023', age: 66, gender: 'F',
    conditions: ['Type 2 Diabetes', 'Chronic Kidney Disease Stage 4'],
    medications: ['Insulin Glargine 40u', 'Insulin Aspart sliding scale', 'Sevelamer 800mg', 'Erythropoietin'],
    risk_score: 91, plan_type: 'PPO', enrollment_date: '2016-10-01', created_at: '2016-10-01T00:00:00Z',
  },
  {
    id: 'mbr_024', age: 39, gender: 'M',
    conditions: ['Psoriasis', 'Psoriatic Arthritis'],
    medications: ['Adalimumab 40mg biweekly', 'Methotrexate 10mg weekly'],
    risk_score: 43, plan_type: 'PPO', enrollment_date: '2021-05-01', created_at: '2021-05-01T00:00:00Z',
  },
  {
    id: 'mbr_025', age: 82, gender: 'M',
    conditions: ['CHF', 'Atrial Fibrillation', 'COPD', 'CKD Stage 3'],
    medications: ['Digoxin 0.125mg', 'Apixaban 5mg', 'Carvedilol 25mg', 'Furosemide 80mg', 'Spironolactone 25mg'],
    risk_score: 98, plan_type: 'PPO', enrollment_date: '2014-01-01', created_at: '2014-01-01T00:00:00Z',
  },
  {
    id: 'mbr_026', age: 33, gender: 'F', conditions: ['Bipolar Disorder II'],
    medications: ['Lamotrigine 200mg', 'Quetiapine 50mg PRN'],
    risk_score: 29, plan_type: 'HMO', enrollment_date: '2022-08-01', created_at: '2022-08-01T00:00:00Z',
  },
  {
    id: 'mbr_027', age: 57, gender: 'M',
    conditions: ['Liver Cirrhosis (compensated)', 'Type 2 Diabetes'],
    medications: ['Lactulose 30ml', 'Nadolol 40mg', 'Metformin 500mg (low dose)'],
    risk_score: 74, plan_type: 'PPO', enrollment_date: '2019-02-28', created_at: '2019-02-28T00:00:00Z',
  },
  {
    id: 'mbr_028', age: 48, gender: 'F',
    conditions: ['Lupus (SLE)', 'Hypertension'],
    medications: ['Hydroxychloroquine 400mg', 'Prednisone 5mg', 'Lisinopril 10mg'],
    risk_score: 65, plan_type: 'PPO', enrollment_date: '2020-04-15', created_at: '2020-04-15T00:00:00Z',
  },
  {
    id: 'mbr_029', age: 40, gender: 'M', conditions: ['Gout', 'Hypertension'],
    medications: ['Allopurinol 300mg', 'Colchicine 0.6mg PRN', 'Hydrochlorothiazide 12.5mg'],
    risk_score: 31, plan_type: 'HMO', enrollment_date: '2022-03-01', created_at: '2022-03-01T00:00:00Z',
  },
  {
    id: 'mbr_030', age: 73, gender: 'F',
    conditions: ['Breast Cancer (on treatment)', 'Hypertension', 'Osteoporosis'],
    medications: ['Anastrozole 1mg', 'Zoledronic acid IV quarterly', 'Amlodipine 10mg'],
    risk_score: 79, plan_type: 'PPO', enrollment_date: '2017-06-01', created_at: '2017-06-01T00:00:00Z',
  },
  {
    id: 'mbr_031', age: 22, gender: 'M', conditions: ['Type 1 Diabetes'],
    medications: ['Insulin Glargine 20u', 'Insulin Lispro sliding scale', 'CGM device'],
    risk_score: 35, plan_type: 'HDHP', enrollment_date: '2023-09-01', created_at: '2023-09-01T00:00:00Z',
  },
  {
    id: 'mbr_032', age: 60, gender: 'F',
    conditions: ['COPD', 'Anxiety', 'Hypertension'],
    medications: ['Tiotropium', 'Albuterol PRN', 'Buspirone 10mg', 'Metoprolol 50mg'],
    risk_score: 64, plan_type: 'HMO', enrollment_date: '2018-11-15', created_at: '2018-11-15T00:00:00Z',
  },
  {
    id: 'mbr_033', age: 53, gender: 'M',
    conditions: ['Morbid Obesity', 'Hypertension', 'Pre-diabetes'],
    medications: ['Phentermine 37.5mg', 'Losartan 100mg', 'Metformin 500mg'],
    risk_score: 57, plan_type: 'HMO', enrollment_date: '2021-12-01', created_at: '2021-12-01T00:00:00Z',
  },
  {
    id: 'mbr_034', age: 36, gender: 'F', conditions: ['Polycystic Ovary Syndrome', 'Pre-diabetes'],
    medications: ['Metformin 1000mg', 'Spironolactone 100mg', 'OCP'],
    risk_score: 27, plan_type: 'HMO', enrollment_date: '2022-06-01', created_at: '2022-06-01T00:00:00Z',
  },
  {
    id: 'mbr_035', age: 69, gender: 'M',
    conditions: ['Prostate Cancer (on treatment)', 'Osteoporosis', 'Hypertension'],
    medications: ['Leuprolide acetate', 'Denosumab 60mg', 'Amlodipine 5mg'],
    risk_score: 72, plan_type: 'PPO', enrollment_date: '2019-08-01', created_at: '2019-08-01T00:00:00Z',
  },
  {
    id: 'mbr_036', age: 43, gender: 'F',
    conditions: ['Epilepsy', 'Depression'],
    medications: ['Lamotrigine 150mg', 'Levetiracetam 500mg', 'Bupropion 150mg'],
    risk_score: 39, plan_type: 'PPO', enrollment_date: '2020-10-01', created_at: '2020-10-01T00:00:00Z',
  },
  {
    id: 'mbr_037', age: 76, gender: 'F',
    conditions: ['Macular Degeneration', 'Hypertension', 'Hypothyroidism'],
    medications: ['Anti-VEGF injections monthly', 'Lisinopril 10mg', 'Levothyroxine 50mcg'],
    risk_score: 55, plan_type: 'PPO', enrollment_date: '2016-07-15', created_at: '2016-07-15T00:00:00Z',
  },
  {
    id: 'mbr_038', age: 49, gender: 'M',
    conditions: ['Kidney Stones', 'Hypertension'],
    medications: ['Hydrochlorothiazide 25mg', 'Potassium Citrate', 'Lisinopril 10mg'],
    risk_score: 33, plan_type: 'HDHP', enrollment_date: '2022-02-01', created_at: '2022-02-01T00:00:00Z',
  },
  {
    id: 'mbr_039', age: 64, gender: 'F',
    conditions: ['Type 2 Diabetes', 'Hypertension', 'Depression', 'Obesity'],
    medications: ['Empagliflozin 10mg', 'Metformin 1000mg', 'Lisinopril 20mg', 'Fluoxetine 20mg'],
    risk_score: 73, plan_type: 'HMO', enrollment_date: '2017-04-01', created_at: '2017-04-01T00:00:00Z',
  },
  {
    id: 'mbr_040', age: 31, gender: 'M', conditions: ['Ulcerative Colitis'],
    medications: ['Mesalamine 4.8g', 'Infliximab IV bimonthly'],
    risk_score: 41, plan_type: 'PPO', enrollment_date: '2023-01-15', created_at: '2023-01-15T00:00:00Z',
  },
  {
    id: 'mbr_041', age: 59, gender: 'M',
    conditions: ['Lung Cancer (Stage II, treated)', 'COPD', 'Hypertension'],
    medications: ['Cisplatin/Etoposide (completed)', 'Tiotropium', 'Atenolol 50mg'],
    risk_score: 80, plan_type: 'PPO', enrollment_date: '2018-01-01', created_at: '2018-01-01T00:00:00Z',
  },
  {
    id: 'mbr_042', age: 46, gender: 'F', conditions: ['Hypothyroidism', 'Anemia'],
    medications: ['Levothyroxine 100mcg', 'Ferrous Sulfate 325mg', 'Vitamin B12 1000mcg'],
    risk_score: 19, plan_type: 'HMO', enrollment_date: '2022-09-01', created_at: '2022-09-01T00:00:00Z',
  },
  {
    id: 'mbr_043', age: 74, gender: 'M',
    conditions: ['CHF', 'Type 2 Diabetes', 'CKD Stage 3', 'Afib'],
    medications: ['Dapagliflozin 10mg', 'Sacubitril/Valsartan', 'Rivaroxaban 20mg', 'Carvedilol 12.5mg'],
    risk_score: 93, plan_type: 'PPO', enrollment_date: '2015-06-01', created_at: '2015-06-01T00:00:00Z',
  },
  {
    id: 'mbr_044', age: 37, gender: 'F', conditions: ['Celiac Disease', 'Anemia'],
    medications: ['Gluten-free diet', 'Iron supplementation', 'Vitamin D3'],
    risk_score: 16, plan_type: 'HDHP', enrollment_date: '2023-03-01', created_at: '2023-03-01T00:00:00Z',
  },
  {
    id: 'mbr_045', age: 56, gender: 'M',
    conditions: ['Hypertension', 'Hyperlipidemia', 'Pre-diabetes', 'Obesity'],
    medications: ['Atorvastatin 40mg', 'Losartan 50mg', 'Metformin 500mg'],
    risk_score: 54, plan_type: 'HMO', enrollment_date: '2020-01-15', created_at: '2020-01-15T00:00:00Z',
  },
  {
    id: 'mbr_046', age: 71, gender: 'F',
    conditions: ['Atrial Fibrillation', 'Hypertension', 'Hypothyroidism'],
    medications: ['Apixaban 5mg', 'Digoxin 0.125mg', 'Amlodipine 5mg', 'Levothyroxine 75mcg'],
    risk_score: 69, plan_type: 'PPO', enrollment_date: '2016-11-01', created_at: '2016-11-01T00:00:00Z',
  },
  {
    id: 'mbr_047', age: 41, gender: 'M', conditions: ['Obesity', 'Sleep Apnea', 'Pre-diabetes'],
    medications: ['CPAP therapy', 'Metformin 500mg'],
    risk_score: 42, plan_type: 'HMO', enrollment_date: '2021-10-01', created_at: '2021-10-01T00:00:00Z',
  },
  {
    id: 'mbr_048', age: 65, gender: 'M',
    conditions: ['Type 2 Diabetes', 'Peripheral Arterial Disease', 'Hypertension'],
    medications: ['Metformin 1000mg', 'Clopidogrel 75mg', 'Aspirin 81mg', 'Atorvastatin 80mg', 'Amlodipine 10mg'],
    risk_score: 85, plan_type: 'PPO', enrollment_date: '2017-02-28', created_at: '2017-02-28T00:00:00Z',
  },
  {
    id: 'mbr_049', age: 52, gender: 'F',
    conditions: ['Rheumatoid Arthritis', 'Hypertension', 'Depression'],
    medications: ['Etanercept 50mg weekly', 'Hydroxychloroquine 200mg', 'Amlodipine 5mg', 'Citalopram 20mg'],
    risk_score: 60, plan_type: 'PPO', enrollment_date: '2019-09-01', created_at: '2019-09-01T00:00:00Z',
  },
  {
    id: 'mbr_050', age: 25, gender: 'M', conditions: [], medications: [],
    risk_score: 5, plan_type: 'HDHP', enrollment_date: '2024-01-01', created_at: '2024-01-01T00:00:00Z',
  },
];

// ─── Claims ───────────────────────────────────────────────────────────────────

export const MOCK_CLAIMS: ClaimRow[] = [
  // Member 001 (Diabetic, HTN, CKD) — high utilizer
  { id: 'clm_001', member_id: 'mbr_001', date: '2024-01-08', diagnosis_code: 'E11.65', procedure_code: '99214', cost: 285, category: 'Office Visit', provider_type: 'PCP', paid_amount: 228 },
  { id: 'clm_002', member_id: 'mbr_001', date: '2024-01-08', diagnosis_code: 'E11.65', procedure_code: '83036', cost: 120, category: 'Lab', provider_type: 'Lab', paid_amount: 96 },
  { id: 'clm_003', member_id: 'mbr_001', date: '2024-02-15', diagnosis_code: 'N18.2', procedure_code: '80047', cost: 210, category: 'Lab', provider_type: 'Lab', paid_amount: 168 },
  { id: 'clm_004', member_id: 'mbr_001', date: '2024-03-01', diagnosis_code: 'I10', procedure_code: '99213', cost: 195, category: 'Office Visit', provider_type: 'PCP', paid_amount: 156 },
  { id: 'clm_005', member_id: 'mbr_001', date: '2024-04-12', diagnosis_code: 'E11.65', procedure_code: '99214', cost: 285, category: 'Office Visit', provider_type: 'Endocrinologist', paid_amount: 228 },
  { id: 'clm_006', member_id: 'mbr_001', date: '2024-06-20', diagnosis_code: 'E11.65', procedure_code: '99285', cost: 1850, category: 'Emergency', provider_type: 'ED', paid_amount: 1480 },
  { id: 'clm_007', member_id: 'mbr_001', date: '2024-07-01', diagnosis_code: 'E11.65', procedure_code: '99232', cost: 8400, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 6720 },

  // Member 003 (CAD, Afib, CHF) — very high cost
  { id: 'clm_008', member_id: 'mbr_003', date: '2024-01-15', diagnosis_code: 'I50.9', procedure_code: '99215', cost: 420, category: 'Office Visit', provider_type: 'Cardiologist', paid_amount: 336 },
  { id: 'clm_009', member_id: 'mbr_003', date: '2024-02-01', diagnosis_code: 'I48.0', procedure_code: '93000', cost: 380, category: 'Diagnostic', provider_type: 'Cardiologist', paid_amount: 304 },
  { id: 'clm_010', member_id: 'mbr_003', date: '2024-03-08', diagnosis_code: 'I50.9', procedure_code: '99285', cost: 2100, category: 'Emergency', provider_type: 'ED', paid_amount: 1680 },
  { id: 'clm_011', member_id: 'mbr_003', date: '2024-03-09', diagnosis_code: 'I50.9', procedure_code: '99233', cost: 24500, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 19600 },
  { id: 'clm_012', member_id: 'mbr_003', date: '2024-05-20', diagnosis_code: 'I25.10', procedure_code: '93454', cost: 4200, category: 'Diagnostic', provider_type: 'Cardiologist', paid_amount: 3360 },
  { id: 'clm_013', member_id: 'mbr_003', date: '2024-08-15', diagnosis_code: 'I50.9', procedure_code: '99285', cost: 1950, category: 'Emergency', provider_type: 'ED', paid_amount: 1560 },

  // Member 006 (DM2, Neuropathy, HTN) — missed screenings
  { id: 'clm_014', member_id: 'mbr_006', date: '2024-01-20', diagnosis_code: 'E11.40', procedure_code: '99213', cost: 195, category: 'Office Visit', provider_type: 'PCP', paid_amount: 156 },
  { id: 'clm_015', member_id: 'mbr_006', date: '2024-04-05', diagnosis_code: 'E11.40', procedure_code: '99285', cost: 1650, category: 'Emergency', provider_type: 'ED', paid_amount: 1320 },
  { id: 'clm_016', member_id: 'mbr_006', date: '2024-04-06', diagnosis_code: 'E11.40', procedure_code: '99231', cost: 6800, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 5440 },
  { id: 'clm_017', member_id: 'mbr_006', date: '2024-06-10', diagnosis_code: 'G62.9', procedure_code: '95910', cost: 890, category: 'Diagnostic', provider_type: 'Neurologist', paid_amount: 712 },

  // Member 008 (COPD, DM2, HTN, CKD3) — highest risk
  { id: 'clm_018', member_id: 'mbr_008', date: '2024-01-05', diagnosis_code: 'J44.1', procedure_code: '99215', cost: 420, category: 'Office Visit', provider_type: 'Pulmonologist', paid_amount: 336 },
  { id: 'clm_019', member_id: 'mbr_008', date: '2024-01-20', diagnosis_code: 'J44.1', procedure_code: '94060', cost: 350, category: 'Diagnostic', provider_type: 'Pulmonologist', paid_amount: 280 },
  { id: 'clm_020', member_id: 'mbr_008', date: '2024-02-08', diagnosis_code: 'J44.1', procedure_code: '99285', cost: 2200, category: 'Emergency', provider_type: 'ED', paid_amount: 1760 },
  { id: 'clm_021', member_id: 'mbr_008', date: '2024-02-09', diagnosis_code: 'J44.1', procedure_code: '99232', cost: 18900, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 15120 },
  { id: 'clm_022', member_id: 'mbr_008', date: '2024-04-15', diagnosis_code: 'E11.65', procedure_code: '83036', cost: 120, category: 'Lab', provider_type: 'Lab', paid_amount: 96 },
  { id: 'clm_023', member_id: 'mbr_008', date: '2024-06-01', diagnosis_code: 'J44.1', procedure_code: '99285', cost: 1900, category: 'Emergency', provider_type: 'ED', paid_amount: 1520 },
  { id: 'clm_024', member_id: 'mbr_008', date: '2024-06-02', diagnosis_code: 'J44.1', procedure_code: '99233', cost: 22100, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 17680 },

  // Member 015 (DM2, Retinopathy, HTN) — preventable complications
  { id: 'clm_025', member_id: 'mbr_015', date: '2024-01-10', diagnosis_code: 'E11.319', procedure_code: '92134', cost: 450, category: 'Diagnostic', provider_type: 'Ophthalmologist', paid_amount: 360 },
  { id: 'clm_026', member_id: 'mbr_015', date: '2024-03-15', diagnosis_code: 'E11.65', procedure_code: '99214', cost: 285, category: 'Office Visit', provider_type: 'Endocrinologist', paid_amount: 228 },
  { id: 'clm_027', member_id: 'mbr_015', date: '2024-05-20', diagnosis_code: 'E11.319', procedure_code: '67028', cost: 1200, category: 'Procedure', provider_type: 'Ophthalmologist', paid_amount: 960 },
  { id: 'clm_028', member_id: 'mbr_015', date: '2024-08-01', diagnosis_code: 'I10', procedure_code: '99213', cost: 195, category: 'Office Visit', provider_type: 'PCP', paid_amount: 156 },

  // Member 023 (DM2, CKD4) — near ESRD
  { id: 'clm_029', member_id: 'mbr_023', date: '2024-01-12', diagnosis_code: 'N18.4', procedure_code: '99215', cost: 420, category: 'Office Visit', provider_type: 'Nephrologist', paid_amount: 336 },
  { id: 'clm_030', member_id: 'mbr_023', date: '2024-01-12', diagnosis_code: 'N18.4', procedure_code: '80069', cost: 290, category: 'Lab', provider_type: 'Lab', paid_amount: 232 },
  { id: 'clm_031', member_id: 'mbr_023', date: '2024-03-08', diagnosis_code: 'N18.4', procedure_code: '99285', cost: 1800, category: 'Emergency', provider_type: 'ED', paid_amount: 1440 },
  { id: 'clm_032', member_id: 'mbr_023', date: '2024-03-09', diagnosis_code: 'N18.4', procedure_code: '99232', cost: 14200, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 11360 },

  // Member 025 (CHF, Afib, COPD, CKD3) — highest risk score 98
  { id: 'clm_033', member_id: 'mbr_025', date: '2024-01-08', diagnosis_code: 'I50.9', procedure_code: '99215', cost: 420, category: 'Office Visit', provider_type: 'Cardiologist', paid_amount: 336 },
  { id: 'clm_034', member_id: 'mbr_025', date: '2024-02-01', diagnosis_code: 'I50.9', procedure_code: '99285', cost: 2400, category: 'Emergency', provider_type: 'ED', paid_amount: 1920 },
  { id: 'clm_035', member_id: 'mbr_025', date: '2024-02-02', diagnosis_code: 'I50.9', procedure_code: '99233', cost: 32000, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 25600 },
  { id: 'clm_036', member_id: 'mbr_025', date: '2024-04-15', diagnosis_code: 'J44.1', procedure_code: '94060', cost: 350, category: 'Diagnostic', provider_type: 'Pulmonologist', paid_amount: 280 },
  { id: 'clm_037', member_id: 'mbr_025', date: '2024-06-20', diagnosis_code: 'I50.9', procedure_code: '99285', cost: 2100, category: 'Emergency', provider_type: 'ED', paid_amount: 1680 },
  { id: 'clm_038', member_id: 'mbr_025', date: '2024-06-21', diagnosis_code: 'I50.9', procedure_code: '99233', cost: 28500, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 22800 },

  // Member 043 (CHF, DM2, CKD3, Afib) — risk score 93
  { id: 'clm_039', member_id: 'mbr_043', date: '2024-01-25', diagnosis_code: 'I50.9', procedure_code: '99215', cost: 420, category: 'Office Visit', provider_type: 'Cardiologist', paid_amount: 336 },
  { id: 'clm_040', member_id: 'mbr_043', date: '2024-03-10', diagnosis_code: 'I50.9', procedure_code: '99285', cost: 2200, category: 'Emergency', provider_type: 'ED', paid_amount: 1760 },
  { id: 'clm_041', member_id: 'mbr_043', date: '2024-03-11', diagnosis_code: 'I50.9', procedure_code: '99232', cost: 19800, category: 'Inpatient', provider_type: 'Hospital', paid_amount: 15840 },

  // Low-risk members — preventive visits, wellness
  { id: 'clm_042', member_id: 'mbr_005', date: '2024-02-20', diagnosis_code: 'Z00.00', procedure_code: '99395', cost: 180, category: 'Preventive', provider_type: 'PCP', paid_amount: 180 },
  { id: 'clm_043', member_id: 'mbr_011', date: '2024-03-15', diagnosis_code: 'Z00.00', procedure_code: '99385', cost: 175, category: 'Preventive', provider_type: 'PCP', paid_amount: 175 },
  { id: 'clm_044', member_id: 'mbr_050', date: '2024-04-01', diagnosis_code: 'Z00.00', procedure_code: '99385', cost: 175, category: 'Preventive', provider_type: 'PCP', paid_amount: 175 },
  { id: 'clm_045', member_id: 'mbr_007', date: '2024-05-01', diagnosis_code: 'F41.1', procedure_code: '99213', cost: 195, category: 'Office Visit', provider_type: 'Psychiatrist', paid_amount: 156 },
  { id: 'clm_046', member_id: 'mbr_012', date: '2024-02-28', diagnosis_code: 'M19.90', procedure_code: '99213', cost: 195, category: 'Office Visit', provider_type: 'PCP', paid_amount: 156 },
  { id: 'clm_047', member_id: 'mbr_045', date: '2024-01-18', diagnosis_code: 'E78.5', procedure_code: '80061', cost: 95, category: 'Lab', provider_type: 'Lab', paid_amount: 76 },
  { id: 'clm_048', member_id: 'mbr_045', date: '2024-04-10', diagnosis_code: 'I10', procedure_code: '99213', cost: 195, category: 'Office Visit', provider_type: 'PCP', paid_amount: 156 },
  { id: 'clm_049', member_id: 'mbr_048', date: '2024-02-12', diagnosis_code: 'I73.9', procedure_code: '93971', cost: 680, category: 'Diagnostic', provider_type: 'Vascular', paid_amount: 544 },
  { id: 'clm_050', member_id: 'mbr_048', date: '2024-05-15', diagnosis_code: 'E11.65', procedure_code: '99214', cost: 285, category: 'Office Visit', provider_type: 'Endocrinologist', paid_amount: 228 },
];

// ─── Triage History ───────────────────────────────────────────────────────────

export const MOCK_TRIAGE_HISTORY: TriageHistoryRow[] = [
  {
    id: 'tri_001', member_id: 'mbr_001',
    symptoms: 'Blood sugar 380 mg/dL, extreme thirst, blurry vision',
    recommended_care: 'urgent_care',
    actual_care_used: 'urgent_care',
    cost_saved: 1400,
    confidence: 92,
    date: '2024-05-10',
  },
  {
    id: 'tri_002', member_id: 'mbr_001',
    symptoms: 'Chest tightness, shortness of breath at rest',
    recommended_care: 'emergency',
    actual_care_used: 'emergency',
    cost_saved: 0,
    confidence: 96,
    date: '2024-06-20',
  },
  {
    id: 'tri_003', member_id: 'mbr_003',
    symptoms: 'Sudden weight gain 8lbs in 3 days, leg swelling, shortness of breath',
    recommended_care: 'emergency',
    actual_care_used: 'emergency',
    cost_saved: 0,
    confidence: 98,
    date: '2024-03-08',
  },
  {
    id: 'tri_004', member_id: 'mbr_006',
    symptoms: 'Severe foot pain, redness, swelling, unable to walk — diabetic patient',
    recommended_care: 'emergency',
    actual_care_used: 'emergency',
    cost_saved: 0,
    confidence: 94,
    date: '2024-04-04',
  },
  {
    id: 'tri_005', member_id: 'mbr_007',
    symptoms: 'Mild headache, feeling stressed, difficulty sleeping',
    recommended_care: 'pcp',
    actual_care_used: 'pcp',
    cost_saved: 1600,
    confidence: 88,
    date: '2024-05-15',
  },
  {
    id: 'tri_006', member_id: 'mbr_008',
    symptoms: 'Worsening cough, increased sputum, mild fever 99.8F — known COPD',
    recommended_care: 'urgent_care',
    actual_care_used: 'urgent_care',
    cost_saved: 1800,
    confidence: 85,
    date: '2024-01-18',
  },
  {
    id: 'tri_007', member_id: 'mbr_008',
    symptoms: 'Severe dyspnea, SpO2 88% at home, can\'t complete sentences',
    recommended_care: 'emergency',
    actual_care_used: 'emergency',
    cost_saved: 0,
    confidence: 99,
    date: '2024-02-08',
  },
  {
    id: 'tri_008', member_id: 'mbr_015',
    symptoms: 'New floaters in vision, flashing lights — diabetic patient',
    recommended_care: 'specialist',
    actual_care_used: 'specialist',
    cost_saved: 0,
    confidence: 91,
    date: '2024-01-05',
  },
  {
    id: 'tri_009', member_id: 'mbr_022',
    symptoms: 'Sore throat, mild fever 100.2F, runny nose',
    recommended_care: 'telehealth',
    actual_care_used: 'telehealth',
    cost_saved: 780,
    confidence: 90,
    date: '2024-06-08',
  },
  {
    id: 'tri_010', member_id: 'mbr_039',
    symptoms: 'Blood sugar 320, fatigue — but no ketones, drinking fluids',
    recommended_care: 'telehealth',
    actual_care_used: 'telehealth',
    cost_saved: 1200,
    confidence: 82,
    date: '2024-07-12',
  },
];

// ─── Chat History ─────────────────────────────────────────────────────────────

export const MOCK_CHAT_HISTORY: ChatHistoryRow[] = [
  {
    id: 'chat_001', member_id: 'mbr_001',
    message: 'My blood sugar has been running high, around 300-350 for the past 3 days. Should I be worried?',
    response: 'Blood sugar readings persistently above 300 mg/dL require prompt attention. Based on your history with Type 2 Diabetes and CKD, this level increases your risk of DKA and further kidney stress. I recommend checking for ketones immediately. If ketones are present, go to the ER. If no ketones and you feel okay, contact your endocrinologist today — do not wait. In the meantime, drink water, avoid carbohydrates, and check your sugar every 2 hours. **This is a time-sensitive situation — please act today.**',
    timestamp: '2024-05-08T14:32:00Z',
    embedding: null,
  },
  {
    id: 'chat_002', member_id: 'mbr_006',
    message: 'I noticed my foot looks different — there\'s a small dark spot near my toe. It doesn\'t really hurt. Is this normal?',
    response: 'A dark discoloration on a diabetic foot — even without pain — is a serious warning sign. Diabetic neuropathy can mask pain, meaning the absence of pain does not indicate safety. This could be early ischemia or necrotic tissue. **Please see a wound care specialist or podiatrist TODAY.** Do not walk on it excessively. If the area grows, spreads, or you develop fever, go to the ER immediately. Your diabetes and neuropathy history make foot complications a high-risk area for you.',
    timestamp: '2024-03-20T09:15:00Z',
    embedding: null,
  },
  {
    id: 'chat_003', member_id: 'mbr_022',
    message: 'I missed using my CPAP for a week while traveling. Now I have a headache every morning.',
    response: 'Morning headaches after missing CPAP therapy are a classic sign of oxygen desaturation during sleep. When sleep apnea goes untreated, it stresses your cardiovascular system — this is especially important given your hypertension history. I recommend resuming CPAP immediately. Your morning headaches should improve within 2-3 days. If they persist or worsen, contact your PCP. Going forward, travel CPAPs (like AirMini) can help maintain compliance on the road.',
    timestamp: '2024-06-05T08:45:00Z',
    embedding: null,
  },
];

// ─── Preventive Campaigns ─────────────────────────────────────────────────────

export const MOCK_PREVENTIVE_CAMPAIGNS: PreventiveCampaignRow[] = [
  {
    id: 'camp_001', member_id: 'mbr_001',
    campaign_type: 'Annual HbA1c + Kidney Function Panel',
    status: 'engaged',
    projected_savings: 4200,
    outcome: 'Member completed HbA1c — result 8.9%, medication adjusted',
    created_at: '2024-03-01T00:00:00Z',
    completed_at: '2024-03-15T00:00:00Z',
  },
  {
    id: 'camp_002', member_id: 'mbr_001',
    campaign_type: 'Diabetic Eye Exam',
    status: 'pending',
    projected_savings: 2800,
    outcome: null,
    created_at: '2024-07-01T00:00:00Z',
    completed_at: null,
  },
  {
    id: 'camp_003', member_id: 'mbr_003',
    campaign_type: 'CHF Remote Monitoring Enrollment',
    status: 'completed',
    projected_savings: 12000,
    outcome: 'Enrolled in remote weight monitoring — caught 6lb gain before hospitalization',
    created_at: '2024-01-20T00:00:00Z',
    completed_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'camp_004', member_id: 'mbr_006',
    campaign_type: 'Annual Foot Exam + Podiatry Referral',
    status: 'pending',
    projected_savings: 8500,
    outcome: null,
    created_at: '2024-06-01T00:00:00Z',
    completed_at: null,
  },
  {
    id: 'camp_005', member_id: 'mbr_008',
    campaign_type: 'COPD Care Management Enrollment',
    status: 'engaged',
    projected_savings: 22000,
    outcome: 'Enrolled in disease management — action plan created for exacerbations',
    created_at: '2024-01-15T00:00:00Z',
    completed_at: null,
  },
  {
    id: 'camp_006', member_id: 'mbr_023',
    campaign_type: 'CKD Stage 4 Nephrology Intensive — Pre-Dialysis Planning',
    status: 'sent',
    projected_savings: 45000,
    outcome: null,
    created_at: '2024-04-01T00:00:00Z',
    completed_at: null,
  },
  {
    id: 'camp_007', member_id: 'mbr_025',
    campaign_type: 'CHF Advanced Care Management + Palliative Consult',
    status: 'completed',
    projected_savings: 35000,
    outcome: 'Enrolled in palliative care — reduced unnecessary ED visits by 60%',
    created_at: '2024-01-10T00:00:00Z',
    completed_at: '2024-01-25T00:00:00Z',
  },
  {
    id: 'camp_008', member_id: 'mbr_015',
    campaign_type: 'Diabetic Retinopathy Monitoring + Tight Glycemic Control',
    status: 'engaged',
    projected_savings: 6500,
    outcome: 'Referred to retinal specialist — laser treatment initiated early',
    created_at: '2024-01-08T00:00:00Z',
    completed_at: null,
  },
  {
    id: 'camp_009', member_id: 'mbr_045',
    campaign_type: 'Metabolic Syndrome Lifestyle Intervention',
    status: 'pending',
    projected_savings: 9800,
    outcome: null,
    created_at: '2024-05-01T00:00:00Z',
    completed_at: null,
  },
  {
    id: 'camp_010', member_id: 'mbr_043',
    campaign_type: 'CHF + Diabetes + CKD Multi-Condition Care Coordination',
    status: 'engaged',
    projected_savings: 28000,
    outcome: 'Care coordinator assigned — SGLT2 inhibitor added, dapagliflozin reducing hospitalizations',
    created_at: '2024-02-01T00:00:00Z',
    completed_at: null,
  },
];

// ─── Demo Scenarios ──────────────────────────────────────────────────────────

export const DEMO_SCENARIOS = {
  memberA: {
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_001')!,
    scenario: 'Diabetic member missed annual HbA1c screening. System detects gap, generates campaign.',
    outcome: 'Member completed HbA1c (8.9%), medication adjusted. Estimated $4,200 ED visit prevented.',
  },
  memberB: {
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_003')!,
    scenario: 'CHF member presents with sudden 8lb weight gain and dyspnea.',
    outcome: 'System recommends ER. Member hospitalized, treated. Remote monitoring enrolled post-discharge.',
  },
  memberC: {
    member: MOCK_MEMBERS.find(m => m.id === 'mbr_025')!,
    scenario: 'High-claims member with 4 chronic conditions. System generates targeted campaigns.',
    outcome: 'Palliative care enrolled. ED visits reduced 60%. $35,000 savings projected annually.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getMemberById(id: string): MemberRow | undefined {
  return MOCK_MEMBERS.find(m => m.id === id);
}

export function getClaimsForMember(memberId: string): ClaimRow[] {
  return MOCK_CLAIMS.filter(c => c.member_id === memberId);
}

export function getTriageHistoryForMember(memberId: string): TriageHistoryRow[] {
  return MOCK_TRIAGE_HISTORY.filter(t => t.member_id === memberId);
}

export function getCampaignsForMember(memberId: string): PreventiveCampaignRow[] {
  return MOCK_PREVENTIVE_CAMPAIGNS.filter(c => c.member_id === memberId);
}

export function getHighRiskMembers(threshold = 70): MemberRow[] {
  return MOCK_MEMBERS.filter(m => m.risk_score >= threshold).sort((a, b) => b.risk_score - a.risk_score);
}

export function getTotalClaimsCost(memberId: string): number {
  return getClaimsForMember(memberId).reduce((sum, c) => sum + c.cost, 0);
}
