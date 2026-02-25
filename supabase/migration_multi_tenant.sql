-- ═══════════════════════════════════════════════════════════
-- TAPN Multi-Tenant Migration
-- Run this ENTIRE script in your Supabase SQL Editor (in order)
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- 1. agent_logs — add user_id, scope reads to owner
-- ───────────────────────────────────────────────────────────
ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_agent_logs_user
  ON agent_logs (user_id, created_at DESC);

-- Drop the old wide-open policy
DROP POLICY IF EXISTS "Public read agent_logs"   ON agent_logs;
DROP POLICY IF EXISTS "Public insert agent_logs" ON agent_logs;
DROP POLICY IF EXISTS "Anyone can read agent_logs" ON agent_logs;
DROP POLICY IF EXISTS "Anyone can insert agent_logs" ON agent_logs;

-- Users see only their own logs
CREATE POLICY "Users read own logs"
  ON agent_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own logs (for future client-side logging)
CREATE POLICY "Users insert own logs"
  ON agent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: service_role key (used by OpenClaw hook) bypasses RLS entirely


-- ───────────────────────────────────────────────────────────
-- 2. applications — add user_id, scope reads to owner
-- ───────────────────────────────────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_applications_user
  ON applications (user_id, applied_at DESC);

-- Drop any old open policies
DROP POLICY IF EXISTS "Public read applications"       ON applications;
DROP POLICY IF EXISTS "Anyone can read applications"   ON applications;
DROP POLICY IF EXISTS "Anyone can insert applications" ON applications;
DROP POLICY IF EXISTS "Anyone can update applications" ON applications;

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own applications"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own applications"
  ON applications FOR UPDATE
  USING (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────
-- 3. mock_interview_sessions — tighten RLS to owner only
-- ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own sessions"   ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users can insert sessions"     ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users can update sessions"     ON mock_interview_sessions;

CREATE POLICY "Users read own sessions"
  ON mock_interview_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own sessions"
  ON mock_interview_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own sessions"
  ON mock_interview_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own sessions"
  ON mock_interview_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Add a link back to the shared library template (nullable)
ALTER TABLE mock_interview_sessions
  ADD COLUMN IF NOT EXISTS library_id UUID;


-- ───────────────────────────────────────────────────────────
-- 4. interview_library — shared templates anyone can practice
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_library (
  id                         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by                 UUID REFERENCES auth.users(id),
  company                    TEXT NOT NULL,
  job_title                  TEXT NOT NULL,
  interviewer_name           TEXT DEFAULT 'Alex',
  interviewer_persona        TEXT,          -- full prompt override
  estimated_duration_minutes INT  DEFAULT 25,
  questions_summary          JSONB,         -- [{category, topic, count}]
  question_categories        TEXT[],
  difficulty                 TEXT DEFAULT 'medium',  -- easy / medium / hard
  times_practiced            INT  DEFAULT 0,
  avg_score                  NUMERIC,
  agent_id                   TEXT,           -- ElevenLabs agent ID
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE interview_library ENABLE ROW LEVEL SECURITY;

-- All authenticated users can browse the full library
CREATE POLICY "Authenticated users browse library"
  ON interview_library FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can publish to the library
CREATE POLICY "Authenticated users publish to library"
  ON interview_library FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Only the template creator can update their own entry
CREATE POLICY "Creator can update own template"
  ON interview_library FOR UPDATE
  USING (auth.uid() = created_by);

-- FK from mock_interview_sessions → interview_library
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_library'
  ) THEN
    ALTER TABLE mock_interview_sessions
      ADD CONSTRAINT fk_library
      FOREIGN KEY (library_id)
      REFERENCES interview_library(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for library browsing
CREATE INDEX IF NOT EXISTS idx_library_company
  ON interview_library (company, job_title);
CREATE INDEX IF NOT EXISTS idx_library_popular
  ON interview_library (times_practiced DESC);


-- ───────────────────────────────────────────────────────────
-- 5. Helper function: increment times_practiced
--    Uses SECURITY DEFINER so any user can call it
--    (bypasses the "only creator can update" RLS)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_library_practiced(lib_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE interview_library
  SET times_practiced = COALESCE(times_practiced, 0) + 1
  WHERE id = lib_id;
END;
$$;


-- ───────────────────────────────────────────────────────────
-- 6. Helper function: update library avg_score
--    Called after an interview completes with a score
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_library_avg_score(
  lib_id UUID,
  new_score NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  curr_avg  NUMERIC;
  curr_cnt  INT;
BEGIN
  SELECT COALESCE(avg_score, 0), COALESCE(times_practiced, 0)
  INTO curr_avg, curr_cnt
  FROM interview_library
  WHERE id = lib_id;

  IF curr_cnt > 0 THEN
    UPDATE interview_library
    SET avg_score = ((curr_avg * (curr_cnt - 1)) + new_score) / curr_cnt
    WHERE id = lib_id;
  ELSE
    UPDATE interview_library
    SET avg_score = new_score
    WHERE id = lib_id;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════
-- DONE — Summary of what changed:
--
--   agent_logs           → added user_id, RLS scoped to owner
--   applications         → added user_id, RLS scoped to owner
--   mock_interview_sessions → RLS tightened to owner, added library_id
--   interview_library    → NEW shared table, anyone can browse/practice
--   increment_library_practiced()  → helper RPC
--   update_library_avg_score()     → helper RPC
--
-- IMPORTANT: The OpenClaw supabase-logger hook uses service_role key
-- which bypasses RLS. Set TAPN_USER_ID env var so the hook knows
-- which user to write logs for.
-- ═══════════════════════════════════════════════════════════
