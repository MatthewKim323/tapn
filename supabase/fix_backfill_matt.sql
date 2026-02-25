-- ═══════════════════════════════════════════════════════════
-- Direct backfill — assign ALL existing data to Matt's account
-- UUID: 76aaf86d-e6d9-49a3-8fad-f30f932f30e2
-- ═══════════════════════════════════════════════════════════

-- 1. Ensure user_id columns exist first
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE mock_interview_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);


-- 2. Force-assign ALL existing rows to Matt (regardless of current value)
UPDATE applications
SET user_id = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2';

UPDATE agent_logs
SET user_id = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2';

UPDATE mock_interview_sessions
SET user_id = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2';

UPDATE interview_library
SET created_by = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2'
WHERE created_by IS NULL;


-- 3. Verify — all should return 0
SELECT
  (SELECT count(*) FROM applications WHERE user_id IS NULL) AS orphan_apps,
  (SELECT count(*) FROM agent_logs WHERE user_id IS NULL) AS orphan_logs,
  (SELECT count(*) FROM mock_interview_sessions WHERE user_id IS NULL) AS orphan_sessions;

-- 4. Verify — these should return your actual counts
SELECT
  (SELECT count(*) FROM applications WHERE user_id = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2') AS matt_apps,
  (SELECT count(*) FROM agent_logs WHERE user_id = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2') AS matt_logs,
  (SELECT count(*) FROM mock_interview_sessions WHERE user_id = '76aaf86d-e6d9-49a3-8fad-f30f932f30e2') AS matt_sessions;
