# TAPN

**The Autonomous Professional Network** — an AI-powered job application pipeline that finds, tailors, applies, schedules, and preps interviews for you.

TAPN pairs a React dashboard with a 6-agent [OpenClaw](https://openclaw.dev) ecosystem. You fill out a quick profile, the agents go to work, and your dashboard lights up with live progress.

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │     TAPN WEBAPP (Vercel)     │
                    │     React + Vite + Framer    │
                    │                              │
                    │  Landing → Login → Onboard   │
                    │         → Dashboard          │
                    └──────────────┬───────────────┘
                                   │
                        Supabase Realtime + REST
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                     SUPABASE (shared, hosted)                       │
│                                                                     │
│  profiles          agent_logs          applications                  │
│  (per user)        (per user)          (per user)                    │
│                                                                     │
│  mock_interview_sessions               interview_library             │
│  (per user)                            (SHARED — all users browse)   │
│                                                                     │
│  Row Level Security scopes every table to auth.uid()                 │
│  interview_library is readable by all authenticated users            │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │                              │
               │  service_role key            │  ElevenLabs API
               │                              │
┌──────────────▼──────────────┐    ┌──────────▼──────────────┐
│  OPENCLAW GATEWAY (local)   │    │  ElevenLabs Conv. AI    │
│  Each user runs their own   │    │  Voice mock interviews  │
│                              │    │  Shared agent, signed   │
│  6 agents:                   │    │  URLs from Vercel API   │
│  TAPN · Scout · Taylor       │    └─────────────────────────┘
│  Echo · Hermes · Aria        │
│                              │
│  supabase-logger hook        │
│  → writes to shared Supabase │
│    tagged with user_id       │
└──────────────────────────────┘
```

### What's shared vs. per-user

| Resource | Scope | How |
|---|---|---|
| Supabase database | **Shared** (one instance for everyone) | Hosted by the TAPN team |
| Webapp (Vercel) | **Shared** (one deployment) | Everyone uses the same URL |
| `interview_library` | **Shared** (all users can browse) | Completed interviews auto-publish |
| `profiles` | Per user | RLS: `auth.uid() = id` |
| `agent_logs` | Per user | RLS: `auth.uid() = user_id` |
| `applications` | Per user | RLS: `auth.uid() = user_id` |
| `mock_interview_sessions` | Per user | RLS: `auth.uid() = user_id` |
| OpenClaw gateway | Per user (runs locally) | Each user installs + runs their own |

---

## The 6 Agents

| Agent    | Role                     | What It Does                                                                                  |
|----------|--------------------------|-----------------------------------------------------------------------------------------------|
| **Tapn** | Conductor / Orchestrator | Coordinates the full pipeline, delegates tasks, reports progress via Telegram                  |
| **Scout**| Job Discovery            | Scrapes career pages and workforce data to find companies actively hiring for your target roles|
| **Taylor**| Resume Tailoring        | Analyzes each job description and produces an ATS-optimized, keyword-matched resume            |
| **Echo** | Application Submission   | Navigates application portals, fills fields, uploads resumes, hits submit                      |
| **Hermes**| Interview Scheduling    | Monitors your inbox for interview invitations, checks availability, books time slots           |
| **Aria** | Interview Prep           | Generates prep materials and conducts AI voice mock interviews via ElevenLabs                  |

---

## User Flow

```
1. LANDING PAGE
   Galaxy shader background — click "get tapped in"

2. LOGIN / SIGN UP
   Email + password auth via Supabase

3. ONBOARDING (5 steps)
   01 — Identity: name, email, phone, location, links
   02 — Career: current title, experience, target roles/industries, bio
   03 — Skills: technical skills, strengths, education
   04 — Preferences: work type, salary, company size, must-haves, deal-breakers
   05 — Schedule: available hours, timezone, communication style
   → Generates USER.md for the agent ecosystem
   → Saves profile to Supabase

4. DASHBOARD
   Overview · Applications · Agents · Pipeline · Resumes · Interviewer
   All data scoped to your account via RLS
   Mock Interview Library is shared across all users
```

---

## Dashboard Pages

- **Overview** — Welcome panel, gateway status, agent cards with live status, recent activity, recent applications
- **Applications** — Table of all your tracked job applications with status, follow-up alerts
- **Agents** — Visual profile cards for each agent with avatar, role, last action, status indicator
- **Pipeline** — Pipeline stages visualization, trigger runs via OpenClaw
- **Resumes** — Your generated resume variants and their target companies
- **Interviewer** — Two tabs:
  - **My Interviews** — your prepped + completed mock interviews
  - **Interview Library** — shared templates from all users. Click "practice" to start any interview.

---

## Tech Stack

| Layer          | Technology                                                                 |
|----------------|----------------------------------------------------------------------------|
| Framework      | React 19 + Vite 7                                                          |
| Hosting        | Vercel (SPA + serverless API routes)                                       |
| Routing        | react-router-dom v7                                                        |
| State          | Zustand (scene state), React hooks (everything else)                       |
| Animation      | Framer Motion, GSAP                                                        |
| 3D / Shaders   | React Three Fiber + Drei, OGL (faulty terminal), Three.js                  |
| Auth + DB      | Supabase (PostgreSQL, Auth, Realtime, Row Level Security)                  |
| Agent Backend  | OpenClaw (WebSocket gateway, multi-agent orchestration)                    |
| Voice AI       | ElevenLabs Conversational AI (@elevenlabs/react SDK)                       |
| Styling        | Custom CSS with design tokens, backdrop-filter translucency                |

---

## Setup

There are two setup paths:

1. **Admin setup** (one time) — deploy the webapp + configure Supabase
2. **User setup** — each user who wants agents connects their own OpenClaw gateway

---

### Admin Setup (Deploy TAPN)

This is for whoever hosts the webapp. You only do this once.

#### 1. Clone & Install

```bash
git clone https://github.com/MatthewKim323/tapn.git
cd tapn
npm install
```

#### 2. Supabase Project

Create a project at [supabase.com](https://supabase.com), then run the full schema SQL in the SQL Editor. The schema is in `supabase/migration_multi_tenant.sql` or you can use the SQL below:

<details>
<summary>Click to expand full SQL schema</summary>

```sql
-- profiles (stores onboarding data)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  current_title TEXT,
  years_experience TEXT,
  target_roles TEXT[],
  target_industries TEXT[],
  bio TEXT,
  technical_skills TEXT[],
  top_strengths TEXT[],
  education_degree TEXT,
  education_field TEXT,
  education_school TEXT,
  education_year TEXT,
  work_authorization TEXT,
  work_type_preference TEXT,
  min_salary TEXT,
  company_size TEXT,
  must_have_criteria TEXT[],
  deal_breaker_keywords TEXT[],
  blacklisted_companies TEXT[],
  available_hours TEXT,
  timezone TEXT,
  communication_style TEXT,
  user_md_content TEXT,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- agent_logs (OpenClaw hook writes here, scoped to user)
CREATE TABLE IF NOT EXISTS agent_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  agent_name TEXT NOT NULL,
  action TEXT,
  status TEXT DEFAULT 'success',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON agent_logs (user_id, created_at DESC);
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own logs" ON agent_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own logs" ON agent_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- applications (per-user)
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  company_name TEXT,
  job_title TEXT,
  status TEXT DEFAULT 'applied',
  tailored_resume_path TEXT,
  mock_interview_ready BOOLEAN DEFAULT FALSE,
  mock_interview_score NUMERIC,
  follow_up_sent_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own applications" ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own applications" ON applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own applications" ON applications FOR UPDATE USING (auth.uid() = user_id);

-- mock_interview_sessions (per-user)
CREATE TABLE IF NOT EXISTS mock_interview_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  library_id UUID,
  agent_id TEXT,
  company TEXT,
  job_title TEXT,
  interviewer_name TEXT,
  interview_date TIMESTAMPTZ,
  estimated_duration_minutes INT,
  questions_summary JSONB,
  status TEXT DEFAULT 'ready',
  overall_score NUMERIC,
  strongest_area TEXT,
  weakest_area TEXT,
  transcript JSONB,
  debrief TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mock_interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sessions" ON mock_interview_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions" ON mock_interview_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON mock_interview_sessions FOR UPDATE USING (auth.uid() = user_id);

-- interview_library (SHARED — all authenticated users can browse)
CREATE TABLE IF NOT EXISTS interview_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id),
  company TEXT NOT NULL,
  job_title TEXT NOT NULL,
  interviewer_name TEXT DEFAULT 'Alex',
  interviewer_persona TEXT,
  estimated_duration_minutes INT DEFAULT 25,
  questions_summary JSONB,
  question_categories TEXT[],
  difficulty TEXT DEFAULT 'medium',
  times_practiced INT DEFAULT 0,
  avg_score NUMERIC,
  agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE interview_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users browse library" ON interview_library FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users publish to library" ON interview_library FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update own template" ON interview_library FOR UPDATE USING (auth.uid() = created_by);

-- Helper: increment times_practiced (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION increment_library_practiced(lib_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE interview_library
  SET times_practiced = COALESCE(times_practiced, 0) + 1
  WHERE id = lib_id;
END;
$$;
```

</details>

Also disable **email confirmation** in Supabase → Auth → Settings (for development).

#### 3. Environment Variables

Create a `.env` file in the project root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# ElevenLabs (API key is server-side only — no VITE_ prefix)
ELEVENLABS_API_KEY=sk_your_api_key
VITE_ELEVENLABS_AGENT_ID=agent_your_agent_id
```

#### 4. Deploy to Vercel

```bash
# Install Vercel CLI (if you haven't)
npm i -g vercel

# Deploy
vercel
```

Or import the repo at [vercel.com/new](https://vercel.com/new).

In **Vercel → Project Settings → Environment Variables**, add the same env vars:

| Variable | Type |
|---|---|
| `VITE_SUPABASE_URL` | Client (build-time) |
| `VITE_SUPABASE_ANON_KEY` | Client (build-time) |
| `ELEVENLABS_API_KEY` | Server-only (runtime) |
| `VITE_ELEVENLABS_AGENT_ID` | Client (build-time) |

#### 5. Local Development

```bash
npm run dev
```

The app starts at `http://localhost:5173` (or next available port).

---

### User Setup (Connect Your Agents)

This is for each user who wants to run the AI agent pipeline. The webapp itself works without this — you can still browse the dashboard, do mock interviews from the library, etc. OpenClaw is only needed if you want the agents to discover jobs, tailor resumes, submit applications, and prep interviews for you.

#### 1. Install OpenClaw

```bash
pip install openclaw
```

See [openclaw.dev](https://openclaw.dev) for full docs.

#### 2. Get Your User ID

After signing up on the TAPN webapp:

1. Log in to the TAPN dashboard
2. Open browser DevTools → Console
3. Run: `(await (await import('./lib/supabase')).supabase.auth.getUser()).data.user.id`
4. Copy the UUID — this is your `TAPN_USER_ID`

Or ask the admin to find it in **Supabase → Authentication → Users**.

#### 3. Set Environment Variables

In the terminal where you'll run OpenClaw:

```bash
export TAPN_SUPABASE_URL=https://your-tapn-supabase.supabase.co
export TAPN_SUPABASE_SERVICE_KEY=ask-the-admin-for-this
export TAPN_USER_ID=your-uuid-from-step-2
```

> **Note:** The `service_role` key is sensitive. The admin should provide it securely. It lets the OpenClaw hook write to Supabase on your behalf.

#### 4. Install the Supabase Logger Hook

```bash
cd tapn
openclaw hook install ./openclaw-hooks/supabase-logger
```

#### 5. Place Your USER.md

After completing onboarding, download your `USER.md` from the dashboard (sidebar → "user.md" button). Place it in your OpenClaw workspace:

```bash
cp ~/Downloads/USER.md ~/.openclaw/USER.md
```

#### 6. Start the Gateway

```bash
openclaw gateway
```

Your agents will now run and their activity will show up on your personal TAPN dashboard. All stats, logs, and applications are scoped to your account — no one else can see them.

---

## Interview Library

The interview library is a shared resource across all TAPN users.

- When you complete a mock interview, the interview template (company, role, questions) is automatically published to the library
- Any user can browse the library and practice any interview
- Each practice session creates a personal record — your transcript and score are private
- The library tracks how many times each template has been practiced

---

## Project Structure

```
tapn/
├── api/                       # Vercel serverless functions
│   └── interview/
│       ├── signed-url.js      # ElevenLabs signed URL (keeps API key server-side)
│       └── conversations.js   # List past ElevenLabs conversations
├── public/
│   ├── assets/                # 3D models (galaxy.glb) + textures
│   └── profiles/              # Agent profile images
├── src/
│   ├── components/            # Reusable UI + visual effects
│   │   ├── Galaxy.jsx         # OGL star field shader
│   │   ├── Galaxy3D.jsx       # R3F galaxy model
│   │   ├── FaultyTerminal.jsx # OGL faulty terminal shader
│   │   ├── StarNest.jsx       # Star nest shader effect
│   │   ├── Dither.jsx         # Dither background effect
│   │   └── ...
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAgentActivity.js    # Realtime agent log feed
│   │   ├── useAgentStatus.js      # Agent status + gateway health
│   │   ├── useApplications.js     # Realtime applications
│   │   └── useDashboardStats.js   # Aggregated metrics
│   ├── lib/
│   │   ├── supabase.js            # Supabase client
│   │   └── generateUserMd.js      # USER.md generator
│   ├── pages/
│   │   ├── LandingPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── OnboardingPage.jsx
│   │   ├── DashboardPage.jsx
│   │   └── dashboard/
│   │       ├── OverviewView.jsx
│   │       ├── ApplicationsView.jsx
│   │       ├── AgentsView.jsx
│   │       ├── PipelineView.jsx
│   │       ├── ResumesView.jsx
│   │       └── InterviewerView.jsx  # Mock interviews + library
│   └── store/
│       └── sceneStore.js
├── openclaw-hooks/
│   └── supabase-logger/       # OpenClaw hook → logs agent events to Supabase
├── supabase/
│   ├── migration_multi_tenant.sql  # Full DB migration script
│   └── backfill_library.sql        # Populate library from existing interviews
├── vercel.json                # Vercel deployment config
├── vite.config.js             # Vite + dev middleware
└── .env                       # Environment variables (gitignored)
```

---

## Security Notes

- The ElevenLabs API key (`sk_...`) is **server-side only** — served by Vercel serverless functions (production) or Vite middleware (development). Never touches the client bundle.
- Supabase anon key is safe to expose — RLS handles all authorization.
- `.env` is gitignored. Never commit secrets.
- Row Level Security ensures every user only sees their own data. The `interview_library` is the only shared table.
- The OpenClaw `service_role` key bypasses RLS — only share it with users you trust. Each user's gateway tags logs with their `TAPN_USER_ID`.

---

## Team

Matthew Kim · Brendan Chung · Sou Hamura · Sabrina Nguyen · Allison Gu

---

## License

Private project.
