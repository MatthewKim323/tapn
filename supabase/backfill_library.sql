-- ═══════════════════════════════════════════════════════════
-- Backfill interview_library from existing completed sessions
-- Run AFTER migration_multi_tenant.sql
-- This populates the shared library with any interviews that
-- were completed before the auto-publish code was deployed.
-- ═══════════════════════════════════════════════════════════

INSERT INTO interview_library (
  created_by,
  company,
  job_title,
  interviewer_name,
  estimated_duration_minutes,
  questions_summary,
  agent_id,
  times_practiced,
  created_at
)
SELECT DISTINCT ON (company, job_title)
  user_id,
  company,
  job_title,
  COALESCE(interviewer_name, 'Alex'),
  COALESCE(estimated_duration_minutes, 25),
  questions_summary,
  agent_id,
  1,
  created_at
FROM mock_interview_sessions
WHERE status = 'completed'
  AND company IS NOT NULL
  AND job_title IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM interview_library lib
    WHERE lib.company = mock_interview_sessions.company
      AND lib.job_title = mock_interview_sessions.job_title
  )
ORDER BY company, job_title, created_at DESC;

-- Check what got added:
SELECT company, job_title, interviewer_name, times_practiced
FROM interview_library
ORDER BY created_at DESC;
