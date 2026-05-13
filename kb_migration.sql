-- ============================================================
-- Arlo Health AI — Knowledge Base Schema & Migration
-- Run AFTER the main schema.sql (requires pgvector extension)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Requires: CREATE EXTENSION IF NOT EXISTS vector; (already in schema.sql)

-- ─── KB Entries Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_entries (
  id                TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  kb_type           TEXT NOT NULL CHECK (kb_type IN ('triage', 'conditions', 'preventive')),
  entry_id          TEXT NOT NULL UNIQUE,           -- e.g. TRIAGE_001, CONDITION_T2DM_001
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,                  -- Full text for embedding
  metadata          JSONB NOT NULL DEFAULT '{}',    -- All structured fields from JSON
  embedding         vector(1536),                   -- text-embedding-3-small or equivalent
  confidence        NUMERIC(4,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_document   TEXT NOT NULL,
  source_date       DATE NOT NULL,
  last_validated    DATE NOT NULL,
  kb_version        TEXT NOT NULL DEFAULT '1.0.0',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_type          ON kb_entries (kb_type);
CREATE INDEX idx_kb_entry_id      ON kb_entries (entry_id);
CREATE INDEX idx_kb_confidence    ON kb_entries (confidence DESC);
CREATE INDEX idx_kb_active        ON kb_entries (is_active);
CREATE INDEX idx_kb_validated     ON kb_entries (last_validated);
-- Semantic similarity index (IVFFlat for cosine similarity)
CREATE INDEX idx_kb_embedding ON kb_entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ─── KB Audit Log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_audit_log (
  id              TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  entry_id        TEXT NOT NULL REFERENCES kb_entries(entry_id),
  action          TEXT NOT NULL CHECK (action IN ('created', 'updated', 'reviewed', 'approved', 'deprecated')),
  reviewed_by     TEXT,                             -- Reviewer name / credential
  review_date     DATE,
  approved        BOOLEAN DEFAULT false,
  notes           TEXT,
  kb_version      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_audit_entry    ON kb_audit_log (entry_id);
CREATE INDEX idx_kb_audit_approved ON kb_audit_log (approved);
CREATE INDEX idx_kb_audit_action   ON kb_audit_log (action);

-- ─── KB Conflicts Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_conflicts (
  id                TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  conflict_id       TEXT NOT NULL UNIQUE,           -- e.g. CONFLICT_001
  affected_entries  TEXT[] NOT NULL,               -- Array of entry_ids
  topic             TEXT NOT NULL,
  description       TEXT NOT NULL,
  resolution        TEXT,                           -- How conflict was resolved
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolved_by       TEXT,
  resolved_date     DATE,
  priority          TEXT NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_conflicts_resolved ON kb_conflicts (resolved);

-- ─── KB Query Log (for analytics + safety monitoring) ────────────────────────

CREATE TABLE IF NOT EXISTS kb_query_log (
  id              TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  session_id      TEXT NOT NULL,
  member_id       TEXT REFERENCES members(id) ON DELETE SET NULL,
  query_text      TEXT NOT NULL,                    -- PII-redacted query
  kb_type         TEXT NOT NULL CHECK (kb_type IN ('triage', 'conditions', 'preventive', 'all')),
  matched_entries TEXT[] NOT NULL DEFAULT '{}',     -- entry_ids returned
  top_confidence  NUMERIC(4,2),
  response_time_ms INTEGER,
  fallback_used   BOOLEAN DEFAULT false,            -- True if no KB match, fell back to Claude
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_query_member    ON kb_query_log (member_id);
CREATE INDEX idx_kb_query_timestamp ON kb_query_log (timestamp DESC);
CREATE INDEX idx_kb_query_kb_type   ON kb_query_log (kb_type);
CREATE INDEX idx_kb_query_fallback  ON kb_query_log (fallback_used);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE kb_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_conflicts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_query_log   ENABLE ROW LEVEL SECURITY;

-- Service role: full access to all KB tables
CREATE POLICY "service_role_kb_entries" ON kb_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_kb_audit" ON kb_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_kb_conflicts" ON kb_conflicts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Query log: service can insert and select, never update/delete (immutable)
CREATE POLICY "service_role_kb_query_insert" ON kb_query_log
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_kb_query_select" ON kb_query_log
  FOR SELECT TO service_role USING (true);

-- ─── Updated_at Trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kb_entries_updated_at
  BEFORE UPDATE ON kb_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Useful Views ─────────────────────────────────────────────────────────────

-- KB health dashboard
CREATE OR REPLACE VIEW kb_health AS
SELECT
  kb_type,
  COUNT(*) AS total_entries,
  COUNT(*) FILTER (WHERE is_active = true) AS active_entries,
  ROUND(AVG(confidence)::numeric, 3) AS avg_confidence,
  MIN(confidence) AS min_confidence,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS entries_vectorized,
  COUNT(*) FILTER (WHERE last_validated < NOW() - INTERVAL '18 months') AS stale_entries,
  MIN(last_validated) AS oldest_validated
FROM kb_entries
GROUP BY kb_type
ORDER BY kb_type;

-- Unapproved entries (waiting for medical review)
CREATE OR REPLACE VIEW kb_pending_review AS
SELECT
  e.entry_id,
  e.kb_type,
  e.title,
  e.confidence,
  e.source_document,
  e.source_date,
  e.created_at,
  COALESCE(
    (SELECT approved FROM kb_audit_log al WHERE al.entry_id = e.entry_id AND al.action = 'approved' ORDER BY created_at DESC LIMIT 1),
    false
  ) AS is_approved
FROM kb_entries e
WHERE is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM kb_audit_log al
    WHERE al.entry_id = e.entry_id AND al.action = 'approved' AND al.approved = true
  )
ORDER BY e.confidence ASC;

-- Stale entries needing re-validation
CREATE OR REPLACE VIEW kb_stale_entries AS
SELECT
  entry_id,
  kb_type,
  title,
  last_validated,
  source_date,
  confidence,
  NOW()::DATE - last_validated AS days_since_validated
FROM kb_entries
WHERE is_active = true
  AND last_validated < NOW() - INTERVAL '18 months'
ORDER BY last_validated ASC;

-- ─── Seed: KB Conflicts ───────────────────────────────────────────────────────
-- Insert the 6 known conflicts from kb_conflicts.md

INSERT INTO kb_conflicts (conflict_id, affected_entries, topic, description, priority, resolved)
VALUES
  ('CONFLICT_001',
   ARRAY['CONDITION_HTN_001'],
   'Blood Pressure Target for Adults 60+',
   'JNC8 (2014) uses <150/90 for age 60+; ACC/AHA 2017 uses <130/80. SPRINT trial data supports aggressive target but excludes high-risk patients.',
   'HIGH',
   false),
  ('CONFLICT_002',
   ARRAY['SCREEN_BREAST_001'],
   'Mammography Screening Start Age and Frequency',
   'USPSTF 2024: biennial starting 40. ACS: annual starting 45 (option 40). ACR/SBI: annual starting 40. Major disagreement on frequency and age.',
   'HIGH',
   false),
  ('CONFLICT_003',
   ARRAY['SCREEN_CERVICAL_001'],
   'Cervical Cancer Screening Method Preference',
   'USPSTF 2018 accepts Pap, co-test, or hrHPV-alone. ACS 2020 prefers hrHPV-alone starting 25. ACOG prefers co-testing.',
   'MEDIUM',
   false),
  ('CONFLICT_004',
   ARRAY['CONDITION_CAD_001'],
   'Aspirin for Primary Cardiovascular Prevention',
   'USPSTF 2022: Against aspirin for primary prevention in adults 60+ (Grade D). Reversed 2016 recommendation. ACC/AHA 2019: individualize for 40-70 at high risk.',
   'HIGH',
   false),
  ('CONFLICT_005',
   ARRAY['CONDITION_T2DM_001', 'CONDITION_OBESITY_001'],
   'GLP-1 Agonist Coverage Inconsistency (Ozempic vs. Wegovy)',
   'Same molecule (semaglutide) covered for T2DM indication but often excluded for obesity indication. Medicare Part D statutory exclusion for weight loss drugs as of 2024.',
   'MEDIUM',
   false),
  ('CONFLICT_006',
   ARRAY['SCREEN_DIABETES_001'],
   'Diabetes Screening BMI Thresholds for Asian Americans',
   'USPSTF uses BMI ≥25 threshold. ADA 2024 uses BMI ≥23 for Asian Americans. Creates disparate screening access.',
   'HIGH',
   false)
ON CONFLICT (conflict_id) DO NOTHING;

-- ─── Function: KB Semantic Search ────────────────────────────────────────────
-- Used by kb_loader.py for semantic retrieval

CREATE OR REPLACE FUNCTION kb_semantic_search(
  query_embedding vector(1536),
  kb_type_filter TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 5,
  min_confidence NUMERIC DEFAULT 0.70
)
RETURNS TABLE (
  entry_id TEXT,
  kb_type TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  confidence NUMERIC,
  source_document TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    e.entry_id,
    e.kb_type,
    e.title,
    e.content,
    e.metadata,
    e.confidence,
    e.source_document,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM kb_entries e
  WHERE
    e.is_active = true
    AND e.embedding IS NOT NULL
    AND e.confidence >= min_confidence
    AND (kb_type_filter IS NULL OR e.kb_type = kb_type_filter)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── Function: Mark KB Entry Approved ────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_kb_entry(
  p_entry_id TEXT,
  p_reviewed_by TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE SQL AS $$
  INSERT INTO kb_audit_log (entry_id, action, reviewed_by, review_date, approved, notes, kb_version)
  SELECT entry_id, 'approved', p_reviewed_by, NOW()::DATE, true, p_notes, kb_version
  FROM kb_entries WHERE entry_id = p_entry_id;
$$;

-- ============================================================
-- Verification Queries (run after migration to confirm success)
-- ============================================================

-- 1. Confirm tables exist
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'kb%';

-- 2. Confirm conflicts seeded
-- SELECT conflict_id, topic, priority FROM kb_conflicts ORDER BY conflict_id;

-- 3. Confirm views work
-- SELECT * FROM kb_health;
-- SELECT * FROM kb_pending_review LIMIT 5;

-- 4. Confirm semantic search function
-- SELECT entry_id, title, similarity FROM kb_semantic_search(NULL::vector(1536), NULL, 5) LIMIT 5;
