# TAPN Webapp Integration Guide

How to connect the OpenClaw agent ecosystem to your webapp. Everything the frontend needs to display agent status, logs, application tracking, hiring signals, and the ElevenLabs mock interview.

---

## Three Systems to Connect

### 1. Supabase (Database — the central nervous system)

Every agent already writes here. Your webapp just reads what they're producing.

```
Project URL:  <YOUR_SUPABASE_URL>
Service Key:  <YOUR_SUPABASE_SERVICE_KEY>
User UUID:    <YOUR_USER_UUID>
```

> **Important:** Use an **anon key** for the frontend client, not the service role key. The service role key bypasses RLS. Generate an anon key from the Supabase dashboard (Settings → API) and set up RLS policies.

### 2. OpenClaw Gateway (Live agent orchestration)

```
URL:    http://localhost:18789
Auth:   Bearer <YOUR_GATEWAY_TOKEN>
Mode:   Local (loopback only)
```

This is where you get live "is this agent running right now" data. Proxy through a Next.js API route — never expose the token to the browser.

### 3. ElevenLabs (Mock interview voice agent)

Aria generates interview configs at:
```
~/.openclaw/workspace-aria/sessions/[company]_interview_config.json
```

The webapp loads this config and connects to ElevenLabs Conversational AI via their React SDK.

```bash
npm install @elevenlabs/react@latest
```

Environment variables needed:
```
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...        # The "TAPN Interviewer" agent
ELEVENLABS_VOICE_ID=...        # Default interviewer voice
```

---

## Supabase Schema

Create these tables if they don't exist. The agents are already configured to write to them.

```sql
-- ═══════════════════════════════════════════════════════
-- 1. AGENT LOGS — every agent writes here for every action
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_name TEXT NOT NULL,          -- 'tapn', 'scout', 'taylor', 'echo', 'hermes', 'aria'
  action TEXT NOT NULL,              -- see "Actions Reference" below
  details JSONB DEFAULT '{}',        -- flexible payload, different per action
  status TEXT DEFAULT 'success',     -- 'success' or 'error'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_logs_user ON agent_logs(user_id, created_at DESC);
CREATE INDEX idx_agent_logs_agent ON agent_logs(agent_name, created_at DESC);


-- ═══════════════════════════════════════════════════════
-- 2. APPLICATIONS — Echo writes, Tapn reads for dedup/follow-up
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT,
  job_description TEXT,              -- full JD text (can be long)
  status TEXT DEFAULT 'applied',     -- applied, rejected, interview_scheduled, offer
  applied_at TIMESTAMPTZ DEFAULT now(),
  follow_up_sent_at TIMESTAMPTZ,    -- null = not yet sent
  mock_interview_ready BOOLEAN DEFAULT false,
  mock_interview_score NUMERIC,
  tailored_resume_path TEXT,
  details JSONB DEFAULT '{}',        -- extra metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, company_name, job_title)
);

CREATE INDEX idx_applications_user ON applications(user_id, applied_at DESC);
CREATE INDEX idx_applications_status ON applications(user_id, status);


-- ═══════════════════════════════════════════════════════
-- 3. MOCK INTERVIEWS — Aria writes after mock session ends
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mock_interviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company TEXT NOT NULL,
  job_title TEXT NOT NULL,
  overall_score NUMERIC,             -- 1-10
  transcript JSONB,                  -- full conversation transcript
  debrief TEXT,                      -- markdown debrief
  strongest_area TEXT,
  weakest_area TEXT,
  recommendation TEXT,               -- 'ready', 'practice_more', 'focus_on_X'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mock_interviews_user ON mock_interviews(user_id, created_at DESC);


-- ═══════════════════════════════════════════════════════
-- 4. SCOUT SIGNALS — per-company hiring scores over time
--    (optional but recommended for trend charts)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scout_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  run_timestamp TIMESTAMPTZ DEFAULT now(),
  company_name TEXT NOT NULL,
  company_domain TEXT,
  hiring_signal_score INTEGER,       -- 0-100
  hire_velocity NUMERIC,
  acceleration_ratio NUMERIC,
  recent_hire_count INTEGER,
  prior_hire_count INTEGER,
  attrition_count INTEGER,
  net_growth INTEGER,
  role_diversity_index INTEGER,
  seniority_mix TEXT,                -- 'junior-heavy', 'senior-heavy', 'mixed'
  model_version TEXT DEFAULT 'workforce_signal_v1',
  UNIQUE(user_id, run_timestamp, company_name)
);

CREATE INDEX idx_scout_signals_user_company
  ON scout_signals(user_id, company_name, run_timestamp DESC);


-- ═══════════════════════════════════════════════════════
-- ENABLE REALTIME (so the webapp gets live updates)
-- ═══════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE agent_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE applications;
ALTER PUBLICATION supabase_realtime ADD TABLE mock_interviews;


-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_signals ENABLE ROW LEVEL SECURITY;

-- Anon key can only read this user's data
CREATE POLICY "User reads own logs" ON agent_logs
  FOR SELECT USING (user_id = 'REDACTED_USER_UUID'::uuid);

CREATE POLICY "User reads own applications" ON applications
  FOR SELECT USING (user_id = 'REDACTED_USER_UUID'::uuid);

CREATE POLICY "User reads own mock interviews" ON mock_interviews
  FOR SELECT USING (user_id = 'REDACTED_USER_UUID'::uuid);

CREATE POLICY "User reads own signals" ON scout_signals
  FOR SELECT USING (user_id = 'REDACTED_USER_UUID'::uuid);
```

---

## Agent Logs — Actions Reference

Every agent writes to `agent_logs`. Here's every action type and what `details` contains:

### Tapn (Conductor)
| Action | Details | When |
|--------|---------|------|
| `pipeline_started` | `{}` | Nightly run kicks off |
| `pipeline_completed` | `{positions_found, resumes_tailored, applications_submitted, applications_failed, mock_interviews_queued}` | Nightly run finishes |
| `agent_spawned` | `{target_agent, task_summary}` | Spawning any sub-agent |
| `agent_completed` | `{target_agent, status, summary}` | Receiving announce-back |
| `agent_error` | `{target_agent, error, context}` | Sub-agent failure |
| `follow_up_sent` | `{company, job_title, days_since_applied}` | Follow-up email sent |
| `dedup_hit` | `{company, job_title}` | Duplicate application caught |
| `human_escalation` | `{reason, context}` | Something needs manual attention |

### Scout
| Action | Details | When |
|--------|---------|------|
| `discovery_complete` | `{model_version, companies_analyzed, positions_found, top_company, top_score, total_hires_30d, total_hires_31_60d, total_departures_30d, avg_acceleration_ratio, data_source}` | Query run complete |

### Taylor
| Action | Details | When |
|--------|---------|------|
| `resume_tailored` | `{company, job_title, resume_path, keywords_matched_count, tier1_coverage}` | Resume generated |

### Echo
| Action | Details | When |
|--------|---------|------|
| `application_submitted` | `{company, job_title, job_url, method, cover_letter, status, error_reason}` | Application submitted or failed |

### Hermes
| Action | Details | When |
|--------|---------|------|
| `interview_found` | `{company, job_title, interview_date, format, meeting_link}` | Interview invitation detected |
| `interview_scheduled` | `{company, job_title, confirmed_date, format}` | Interview confirmed |
| `alternatives_proposed` | `{company, job_title, proposed_times}` | Sent alternative times |

### Aria
| Action | Details | When |
|--------|---------|------|
| `prep_generated` | `{company, job_title, questions_generated, interview_date}` | Prep doc ready |
| `mock_interview_configured` | `{company, job_title, config_path, voice_id}` | ElevenLabs agent configured |
| `debrief_complete` | `{company, job_title, overall_score, strongest_area, weakest_area, recommendation}` | Post-mock debrief done |

---

## Supabase Client Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

// Browser client (uses anon key, respects RLS)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Server client (uses service role key, bypasses RLS — API routes only)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
```

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=<YOUR_SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<YOUR_SUPABASE_ANON_KEY>
SUPABASE_URL=<YOUR_SUPABASE_URL>
SUPABASE_SERVICE_KEY=<YOUR_SUPABASE_SERVICE_KEY>
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=<YOUR_GATEWAY_TOKEN>
```

---

## Realtime Subscriptions

Subscribe to live changes — no polling needed.

```typescript
// hooks/useAgentActivity.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useAgentActivity() {
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    // Initial load
    supabase
      .from('agent_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setEvents(data || []))

    // Live subscription
    const channel = supabase
      .channel('agent-activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_logs',
      }, (payload) => {
        setEvents(prev => [payload.new, ...prev].slice(0, 200))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return events
}
```

```typescript
// hooks/useApplications.ts
export function useApplications() {
  const [apps, setApps] = useState<any[]>([])

  useEffect(() => {
    supabase
      .from('applications')
      .select('*')
      .order('applied_at', { ascending: false })
      .then(({ data }) => setApps(data || []))

    const channel = supabase
      .channel('applications')
      .on('postgres_changes', {
        event: '*',  // INSERT and UPDATE
        schema: 'public',
        table: 'applications',
      }, (payload) => {
        setApps(prev => {
          const idx = prev.findIndex(a => a.id === payload.new.id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = payload.new
            return updated
          }
          return [payload.new, ...prev]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return apps
}
```

---

## OpenClaw Gateway — API Route Proxy

The gateway runs locally and the token must stay server-side.

```typescript
// app/api/agents/status/route.ts
export async function GET() {
  try {
    const res = await fetch(`${process.env.OPENCLAW_GATEWAY_URL}/api/sessions`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`
      }
    })

    if (!res.ok) {
      return Response.json({ error: 'Gateway unavailable' }, { status: 502 })
    }

    const sessions = await res.json()
    return Response.json(sessions)
  } catch {
    return Response.json({ error: 'Gateway offline' }, { status: 503 })
  }
}
```

```typescript
// app/api/agents/spawn/route.ts
export async function POST(req: Request) {
  const { agentId, task } = await req.json()

  const res = await fetch(`${process.env.OPENCLAW_GATEWAY_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agentId,
      payload: {
        kind: 'agentTurn',
        message: task
      }
    })
  })

  return Response.json(await res.json())
}
```

---

## ElevenLabs Mock Interview Integration

### Loading Aria's Config

Aria saves interview configs as JSON files. Serve them through an API route:

```typescript
// app/api/interviews/config/[company]/route.ts
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

export async function GET(
  req: Request,
  { params }: { params: { company: string } }
) {
  const sessionsDir = path.join(
    process.env.HOME!,
    '.openclaw/workspace-aria/sessions'
  )

  // Find the config file for this company
  const files = readdirSync(sessionsDir)
  const configFile = files.find(f =>
    f.toLowerCase().includes(params.company.toLowerCase()) &&
    f.endsWith('_interview_config.json')
  )

  if (!configFile) {
    return Response.json({ error: 'No interview config found' }, { status: 404 })
  }

  const config = JSON.parse(
    readFileSync(path.join(sessionsDir, configFile), 'utf-8')
  )

  return Response.json(config)
}
```

### Mock Interview Component

```tsx
// components/MockInterview.tsx
'use client'

import { useConversation } from '@elevenlabs/react'
import { useCallback, useState } from 'react'

interface MockInterviewProps {
  agentId: string
  company: string
  jobTitle: string
}

export function MockInterview({ agentId, company, jobTitle }: MockInterviewProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'active' | 'ended'>('idle')
  const conversation = useConversation({
    onConnect: () => setStatus('active'),
    onDisconnect: () => setStatus('ended'),
    onError: (error) => console.error('ElevenLabs error:', error),
  })

  const startInterview = useCallback(async () => {
    setStatus('loading')

    // Fetch Aria's generated config for this company
    const res = await fetch(`/api/interviews/config/${company}`)
    if (!res.ok) {
      setStatus('idle')
      return
    }

    const config = await res.json()

    // Request microphone access
    await navigator.mediaDevices.getUserMedia({ audio: true })

    // Start the ElevenLabs conversation with Aria's overrides
    await conversation.startSession({
      agentId,
      ...config.conversation_config_override
    })
  }, [agentId, company, conversation])

  return (
    <div>
      <h2>Mock Interview: {company} — {jobTitle}</h2>

      {status === 'idle' && (
        <button onClick={startInterview}>
          Start Mock Interview
        </button>
      )}

      {status === 'loading' && <p>Configuring interviewer...</p>}

      {status === 'active' && (
        <div>
          <p>🎙️ Interview in progress — speak naturally</p>
          <p>Agent is {conversation.isSpeaking ? 'speaking' : 'listening'}...</p>
          <button onClick={() => conversation.endSession()}>
            End Interview
          </button>
        </div>
      )}

      {status === 'ended' && (
        <p>Interview complete. Aria is generating your debrief...</p>
      )}
    </div>
  )
}
```

### Post-Call Webhook (receives transcript from ElevenLabs)

Set this URL in ElevenLabs agent settings → Webhooks → Post-call:

```typescript
// app/api/interviews/webhook/route.ts
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const payload = await req.json()

  // Save transcript to Supabase
  const { error } = await supabaseAdmin
    .from('mock_interviews')
    .insert({
      user_id: 'REDACTED_USER_UUID',
      company: payload.dynamic_variables?.company || 'Unknown',
      job_title: payload.dynamic_variables?.role || 'Unknown',
      transcript: payload.transcript,
      // Aria will update overall_score and debrief after analyzing
    })

  if (error) console.error('Webhook save error:', error)

  return Response.json({ received: true })
}
```

---

## Serving Aria's Prep Documents

Aria saves interview prep as markdown files:

```
~/.openclaw/workspace-aria/prep/stripe_dataanalyst_prep.md
~/.openclaw/workspace-aria/debriefs/stripe_dataanalyst_debrief.md
```

```typescript
// app/api/interviews/prep/[company]/route.ts
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

export async function GET(
  req: Request,
  { params }: { params: { company: string } }
) {
  const prepDir = path.join(
    process.env.HOME!,
    '.openclaw/workspace-aria/prep'
  )

  const files = readdirSync(prepDir)
  const prepFile = files.find(f =>
    f.toLowerCase().includes(params.company.toLowerCase()) &&
    f.endsWith('_prep.md')
  )

  if (!prepFile) {
    return Response.json({ error: 'No prep document found' }, { status: 404 })
  }

  const content = readFileSync(path.join(prepDir, prepFile), 'utf-8')
  return Response.json({ filename: prepFile, content })
}
```

---

## Key Queries for Each Page

### Dashboard — Pipeline Status

```typescript
// Last pipeline run
const { data: lastRun } = await supabase
  .from('agent_logs')
  .select('*')
  .eq('agent_name', 'tapn')
  .in('action', ['pipeline_started', 'pipeline_completed'])
  .order('created_at', { ascending: false })
  .limit(2)

// Stats
const { count: totalApplied } = await supabase
  .from('applications')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'applied')

const { count: interviewing } = await supabase
  .from('applications')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'interview_scheduled')

const { count: mockInterviewsReady } = await supabase
  .from('applications')
  .select('*', { count: 'exact', head: true })
  .eq('mock_interview_ready', true)
```

### Agent Status — Last Action Per Agent

```typescript
// Get the most recent action for each agent
const agents = ['tapn', 'scout', 'taylor', 'echo', 'hermes', 'aria']

const agentStatuses = await Promise.all(
  agents.map(async (agent) => {
    const { data } = await supabase
      .from('agent_logs')
      .select('agent_name, action, details, status, created_at')
      .eq('agent_name', agent)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    return data
  })
)
```

### Applications — Full Tracker

```typescript
const { data: applications } = await supabase
  .from('applications')
  .select('*')
  .order('applied_at', { ascending: false })

// Pending follow-ups (applied > 5 business days ago, no follow-up sent)
const { data: needsFollowUp } = await supabase
  .from('applications')
  .select('*')
  .eq('status', 'applied')
  .is('follow_up_sent_at', null)
  .lt('applied_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString())
```

### Scout — Hiring Signals

```typescript
// Latest scout run results
const { data: latestScoutRun } = await supabase
  .from('agent_logs')
  .select('details')
  .eq('agent_name', 'scout')
  .eq('action', 'discovery_complete')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

// Signal trends for a specific company
const { data: companyTrend } = await supabase
  .from('scout_signals')
  .select('*')
  .eq('company_name', 'Snowflake')
  .order('run_timestamp', { ascending: true })
```

### Mock Interviews — Debriefs

```typescript
// All mock interviews with scores
const { data: mockInterviews } = await supabase
  .from('mock_interviews')
  .select('*')
  .order('created_at', { ascending: false })

// Available interviews (ready but not yet done)
const { data: available } = await supabase
  .from('applications')
  .select('company_name, job_title')
  .eq('mock_interview_ready', true)
  .is('mock_interview_score', null)
```

---

## The 6 Agents — Reference

| Agent | ID | Emoji | Role | Workspace |
|-------|----|-------|------|-----------|
| Tapn | `main` | 🎯 | Conductor / Orchestrator | `~/.openclaw/workspace` |
| Scout | `scout` | 🔍 | Job Discovery (DuckDB + hiring signals) | `~/.openclaw/workspace-scout` |
| Taylor | `taylor` | 📝 | Resume Tailoring (LaTeX) | `~/.openclaw/workspace-taylor` |
| Echo | `echo` | 🌐 | Application Submission (browser automation) | `~/.openclaw/workspace-echo` |
| Hermes | `hermes` | 📅 | Interview Scheduling (email monitoring) | `~/.openclaw/workspace-hermes` |
| Aria | `aria` | 🎤 | Interview Prep + Mock Interview (ElevenLabs) | `~/.openclaw/workspace-aria` |

### Pipeline Flow

```
Scout → Taylor → Echo → Aria
  │        │        │       │
  │        │        │       └─ Prep materials + mock interview via ElevenLabs
  │        │        └─ Application submitted, status logged to Supabase
  │        └─ Tailored resume (LaTeX → PDF)
  └─ Hiring signals from local DuckDB dataset

Hermes runs independently on cron (every 2hrs, 9-5 weekdays)
  └─ Monitors email for interview invitations → triggers Aria if interview found
```

### Cron Schedule

| Time | Job | Agent |
|------|-----|-------|
| 1:00 AM PST daily | Nightly pipeline | Tapn → Scout → Taylor → Echo → Aria |
| 9:00 AM PST weekdays | Follow-up check | Tapn queries Supabase for 5+ day applications |
| 9AM-5PM/2hrs weekdays | Interview monitor | Hermes checks email inbox |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                      YOUR WEBAPP                          │
│                                                           │
│  ┌───────────┐ ┌────────────┐ ┌────────────────────────┐ │
│  │ Dashboard  │ │ App        │ │ Mock Interview         │ │
│  │ & Agent    │ │ Tracker    │ │ (ElevenLabs embed)     │ │
│  │ Status     │ │            │ │                        │ │
│  └─────┬─────┘ └─────┬──────┘ └───────────┬────────────┘ │
│        │              │                    │              │
│  ┌─────┴──────────────┴────────────────────┘              │
│  │   Next.js API Routes (proxy layer)                     │
│  │   /api/agents/status  → OpenClaw gateway               │
│  │   /api/agents/spawn   → OpenClaw gateway               │
│  │   /api/interviews/*   → Aria's local files             │
│  │   /api/interviews/webhook → ElevenLabs post-call       │
│  └─────┬──────────────────────────────────────────────────┘
│        │
└────────┼──────────────────────────────────────────────────┘
         │
    ┌────┴────┐          ┌─────────────────┐
    │Supabase │          │  ElevenLabs     │
    │         │          │  Conversational │
    │ Tables: │          │  AI WebSocket   │
    │  agent_logs        │                 │
    │  applications      │  (voice agent   │
    │  mock_interviews   │   for mock      │
    │  scout_signals     │   interviews)   │
    │         │          │                 │
    │ Realtime│          └─────────────────┘
    │ (live   │
    │ updates)│
    └────┬────┘
         │
         │  ← agents write via curl
         │
    ┌────┴────────────────────────────────┐
    │       OPENCLAW GATEWAY              │
    │       localhost:18789               │
    │                                     │
    │  🎯 Tapn (conductor)               │
    │    ├─ 🔍 Scout    (DuckDB queries) │
    │    ├─ 📝 Taylor   (LaTeX resumes)  │
    │    ├─ 🌐 Echo     (browser apply)  │
    │    └─ 🎤 Aria     (interview prep) │
    │  📅 Hermes (independent cron)      │
    │                                     │
    │  Config: ~/.openclaw/openclaw.json  │
    └─────────────────────────────────────┘
```

---

## Quick Start Checklist

1. **Create Supabase tables** — Run the SQL schema above in Supabase SQL editor
2. **Enable Realtime** — Run the `ALTER PUBLICATION` statements
3. **Set up RLS policies** — Run the policy statements
4. **Get anon key** — Supabase dashboard → Settings → API → `anon` key
5. **Add env vars** — `.env.local` with Supabase, OpenClaw gateway, and ElevenLabs creds
6. **Install deps** — `@supabase/supabase-js`, `@elevenlabs/react`
7. **Create API routes** — Proxy for OpenClaw gateway and Aria's files
8. **Set up Realtime hooks** — `useAgentActivity`, `useApplications`
9. **Build the mock interview page** — ElevenLabs widget + Aria config loader
10. **Set ElevenLabs webhook URL** — Point post-call webhook to your `/api/interviews/webhook`
