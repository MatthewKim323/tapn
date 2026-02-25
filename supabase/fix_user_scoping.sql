-- ═══════════════════════════════════════════════════════════
-- TAPN — Fix User Scoping
-- Run this in Supabase SQL Editor
--
-- What it does:
--   1. Finds the user_id for matthewykim.tapn@gmail.com
--   2. Assigns ALL orphaned rows (user_id IS NULL) to that user
--   3. Ensures RLS is enabled on every table
--   4. Drops ALL old policies and creates clean user-scoped ones
-- ═══════════════════════════════════════════════════════════

-- ── Step 1: Backfill orphaned data ──────────────────────────
DO $$
DECLARE
  matt_id UUID;
BEGIN
  -- Find the user_id for your main account
  SELECT id INTO matt_id
  FROM auth.users
  WHERE email = 'matthewykim.tapn@gmail.com'
  LIMIT 1;

  IF matt_id IS NULL THEN
    RAISE EXCEPTION 'Could not find user with email matthewykim.tapn@gmail.com';
  END IF;

  RAISE NOTICE 'Found user_id: %', matt_id;

  -- Backfill applications
  UPDATE applications
  SET user_id = matt_id
  WHERE user_id IS NULL;

  RAISE NOTICE 'Backfilled applications';

  -- Backfill agent_logs
  UPDATE agent_logs
  SET user_id = matt_id
  WHERE user_id IS NULL;

  RAISE NOTICE 'Backfilled agent_logs';

  -- Backfill mock_interview_sessions
  UPDATE mock_interview_sessions
  SET user_id = matt_id
  WHERE user_id IS NULL;

  RAISE NOTICE 'Backfilled mock_interview_sessions';
END $$;


-- ── Step 2: Ensure user_id columns exist ────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- mock_interview_sessions should already have user_id from the original schema


-- ── Step 3: Enable RLS on ALL data tables ───────────────────
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_library       ENABLE ROW LEVEL SECURITY;


-- ── Step 4: Drop ALL existing policies (clean slate) ────────

-- profiles
DROP POLICY IF EXISTS "Users can view own profile"    ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
DROP POLICY IF EXISTS "Public read profiles"          ON profiles;

-- applications
DROP POLICY IF EXISTS "Users read own applications"   ON applications;
DROP POLICY IF EXISTS "Users insert own applications" ON applications;
DROP POLICY IF EXISTS "Users update own applications" ON applications;
DROP POLICY IF EXISTS "Public read applications"      ON applications;
DROP POLICY IF EXISTS "Anyone can read applications"  ON applications;
DROP POLICY IF EXISTS "Anyone can insert applications" ON applications;
DROP POLICY IF EXISTS "Anyone can update applications" ON applications;

-- agent_logs
DROP POLICY IF EXISTS "Users read own logs"           ON agent_logs;
DROP POLICY IF EXISTS "Users insert own logs"         ON agent_logs;
DROP POLICY IF EXISTS "Public read agent_logs"        ON agent_logs;
DROP POLICY IF EXISTS "Public insert agent_logs"      ON agent_logs;
DROP POLICY IF EXISTS "Anyone can read agent_logs"    ON agent_logs;
DROP POLICY IF EXISTS "Anyone can insert agent_logs"  ON agent_logs;

-- mock_interview_sessions
DROP POLICY IF EXISTS "Users read own sessions"       ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users insert own sessions"     ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users update own sessions"     ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users delete own sessions"     ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users can view own sessions"   ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users can insert sessions"     ON mock_interview_sessions;
DROP POLICY IF EXISTS "Users can update sessions"     ON mock_interview_sessions;

-- interview_library
DROP POLICY IF EXISTS "Authenticated users browse library"    ON interview_library;
DROP POLICY IF EXISTS "Authenticated users publish to library" ON interview_library;
DROP POLICY IF EXISTS "Creator can update own template"       ON interview_library;


-- ── Step 5: Create clean user-scoped policies ───────────────

-- profiles: user sees only their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- applications: user sees only their own apps
CREATE POLICY "Users read own applications"
  ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own applications"
  ON applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own applications"
  ON applications FOR UPDATE USING (auth.uid() = user_id);

-- agent_logs: user sees only their own logs
-- Note: OpenClaw hook uses service_role key which bypasses RLS
CREATE POLICY "Users read own logs"
  ON agent_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service inserts logs"
  ON agent_logs FOR INSERT WITH CHECK (true);
  -- INSERT uses WITH CHECK(true) because the OpenClaw hook
  -- inserts via service_role key (which already bypasses RLS),
  -- and users may insert client-side logs in the future.

-- mock_interview_sessions: user sees only their own sessions
CREATE POLICY "Users read own sessions"
  ON mock_interview_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions"
  ON mock_interview_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions"
  ON mock_interview_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own sessions"
  ON mock_interview_sessions FOR DELETE USING (auth.uid() = user_id);

-- interview_library: SHARED — all authenticated users can browse
CREATE POLICY "Authenticated users browse library"
  ON interview_library FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users publish to library"
  ON interview_library FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update own template"
  ON interview_library FOR UPDATE USING (auth.uid() = created_by);


-- ── Step 6: Create indexes if missing ───────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_user
  ON applications (user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_user
  ON agent_logs (user_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════
-- DONE — Verify:
--
--   SELECT
--     (SELECT count(*) FROM applications WHERE user_id IS NULL) AS orphan_apps,
--     (SELECT count(*) FROM agent_logs WHERE user_id IS NULL) AS orphan_logs,
--     (SELECT count(*) FROM mock_interview_sessions WHERE user_id IS NULL) AS orphan_sessions;
--
-- All three should be 0.
-- ═══════════════════════════════════════════════════════════
