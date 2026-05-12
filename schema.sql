-- ============================================================
-- Arlo Health AI Platform — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable pgvector extension for semantic search embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Members ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS members (
  id              TEXT PRIMARY KEY,
  age             INTEGER NOT NULL CHECK (age > 0 AND age < 130),
  gender          TEXT NOT NULL CHECK (gender IN ('M', 'F', 'Other')),
  conditions      TEXT[] NOT NULL DEFAULT '{}',
  medications     TEXT[] NOT NULL DEFAULT '{}',
  risk_score      INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  plan_type       TEXT NOT NULL CHECK (plan_type IN ('PPO', 'HMO', 'HDHP', 'EPO')),
  enrollment_date DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_members_risk_score ON members (risk_score DESC);
CREATE INDEX idx_members_plan_type  ON members (plan_type);

-- ─── Claims ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS claims (
  id              TEXT PRIMARY KEY,
  member_id       TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  diagnosis_code  TEXT NOT NULL,   -- ICD-10
  procedure_code  TEXT NOT NULL,   -- CPT
  cost            NUMERIC(12,2) NOT NULL CHECK (cost >= 0),
  category        TEXT NOT NULL CHECK (category IN (
                    'Office Visit', 'Emergency', 'Inpatient', 'Lab',
                    'Diagnostic', 'Preventive', 'Procedure', 'Pharmacy', 'DME'
                  )),
  provider_type   TEXT NOT NULL,
  paid_amount     NUMERIC(12,2) NOT NULL CHECK (paid_amount >= 0)
);

CREATE INDEX idx_claims_member_id ON claims (member_id);
CREATE INDEX idx_claims_date       ON claims (date DESC);
CREATE INDEX idx_claims_category   ON claims (category);
CREATE INDEX idx_claims_diagnosis  ON claims (diagnosis_code);

-- ─── Triage History ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS triage_history (
  id                  TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  member_id           TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  symptoms            TEXT NOT NULL,
  recommended_care    TEXT NOT NULL CHECK (recommended_care IN (
                        'emergency', 'urgent_care', 'telehealth', 'pcp', 'specialist', 'self_care'
                      )),
  actual_care_used    TEXT CHECK (actual_care_used IN (
                        'emergency', 'urgent_care', 'telehealth', 'pcp', 'specialist', 'self_care'
                      )),
  cost_saved          NUMERIC(12,2),
  confidence          INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  reasoning           TEXT,
  date                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triage_member_id ON triage_history (member_id);
CREATE INDEX idx_triage_date       ON triage_history (date DESC);

-- ─── Chat History ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_history (
  id          TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  response    TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedding   vector(1536)  -- for semantic similarity search
);

CREATE INDEX idx_chat_member_id ON chat_history (member_id);
CREATE INDEX idx_chat_timestamp  ON chat_history (timestamp DESC);
-- Enables similarity search on embeddings
CREATE INDEX idx_chat_embedding ON chat_history USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── Preventive Campaigns ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS preventive_campaigns (
  id               TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  member_id        TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  campaign_type    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                     'pending', 'sent', 'engaged', 'completed', 'declined'
                   )),
  projected_savings NUMERIC(12,2) NOT NULL DEFAULT 0,
  outcome          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_member_id ON preventive_campaigns (member_id);
CREATE INDEX idx_campaigns_status     ON preventive_campaigns (status);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
-- Immutable — no UPDATE or DELETE allowed (enforced via RLS)

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  action      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  resource    TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT
);

CREATE INDEX idx_audit_user_id   ON audit_logs (user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX idx_audit_action    ON audit_logs (action);
CREATE INDEX idx_audit_resource  ON audit_logs (resource);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims               ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE preventive_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- Service role (backend) has full access; anon has no access
-- Members can only see their own data (when auth is wired up)

CREATE POLICY "service_role_full_access_members" ON members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_claims" ON claims
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_triage" ON triage_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_chat" ON chat_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_campaigns" ON preventive_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit logs: service role can insert and select, but never update/delete
CREATE POLICY "service_role_audit_insert" ON audit_logs
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_audit_select" ON audit_logs
  FOR SELECT TO service_role USING (true);
-- No UPDATE or DELETE policies = immutable log

-- ─── Useful Views ─────────────────────────────────────────────────────────────

-- High-risk member summary
CREATE OR REPLACE VIEW high_risk_members AS
SELECT
  m.id,
  m.age,
  m.gender,
  m.conditions,
  m.risk_score,
  m.plan_type,
  COALESCE(SUM(c.cost), 0) AS total_claims_cost,
  COUNT(c.id) AS total_claims,
  COUNT(CASE WHEN c.category = 'Emergency' THEN 1 END) AS ed_visits
FROM members m
LEFT JOIN claims c ON c.member_id = m.id
WHERE m.risk_score >= 70
GROUP BY m.id
ORDER BY m.risk_score DESC;

-- Campaign ROI summary
CREATE OR REPLACE VIEW campaign_roi AS
SELECT
  pc.campaign_type,
  COUNT(*) AS total_campaigns,
  COUNT(CASE WHEN pc.status = 'completed' THEN 1 END) AS completed,
  SUM(pc.projected_savings) AS total_projected_savings,
  AVG(pc.projected_savings) AS avg_projected_savings
FROM preventive_campaigns pc
GROUP BY pc.campaign_type
ORDER BY total_projected_savings DESC;
