# TAPN

**The Autonomous Professional Network** — an AI-powered job application pipeline that finds, tailors, applies, schedules, and preps interviews for you.

TAPN pairs a React dashboard with a 6-agent [OpenClaw](https://openclaw.dev) ecosystem. You fill out a quick profile, the agents go to work, and your dashboard lights up with live progress.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   TAPN WEBAPP                    │
│          React + Vite + Framer Motion            │
│                                                  │
│  Landing → Login → Onboarding → Dashboard        │
│           (Supabase Auth)  (5-step)              │
└────────────────────┬────────────────────────────┘
                     │  Supabase Realtime
                     │  (agent_logs, mock_interview_sessions,
                     │   applications, profiles)
                     │
┌────────────────────▼────────────────────────────┐
│              SUPABASE (PostgreSQL)               │
│  profiles │ agent_logs │ applications            │
│  mock_interview_sessions                         │
└────────────────────┬────────────────────────────┘
                     │  REST + service_role key
                     │
┌────────────────────▼────────────────────────────┐
│           OPENCLAW GATEWAY (WebSocket)           │
│          ws://127.0.0.1:18789                    │
│                                                  │
│  ┌──────┐ ┌───────┐ ┌────────┐                  │
│  │ TAPN │ │ Scout │ │ Taylor │   Orchestrator,   │
│  │      │ │       │ │        │   Discovery,      │
│  └──────┘ └───────┘ └────────┘   Tailoring       │
│  ┌──────┐ ┌────────┐ ┌──────┐                    │
│  │ Echo │ │ Hermes │ │ Aria │   Submission,      │
│  │      │ │        │ │      │   Scheduling,      │
│  └──────┘ └────────┘ └──────┘   Interview Prep   │
│                                                  │
│  supabase-logger hook → agent_logs table         │
└──────────────────────────────────────────────────┘
                     │
                     │  ElevenLabs Conversational AI
                     ▼
            ┌──────────────────┐
            │  Voice Mock      │
            │  Interviews      │
            │  (Aria → TAPN    │
            │   Interviewer)   │
            └──────────────────┘
```

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
   Galaxy shader background with stars — click "Get Started"
   Galaxy zooms toward camera → transition to login

2. LOGIN / SIGN UP
   Email + password auth via Supabase
   Faulty terminal shader background (OGL WebGL)

3. ONBOARDING (5 steps)
   01 — Identity: name, email, phone, location, links
   02 — Career: current title, experience, target roles/industries, bio
   03 — Skills: technical skills, strengths, education
   04 — Preferences: work type, salary, company size, must-haves, deal-breakers
   05 — Schedule: available hours, timezone, communication style

   → Generates USER.md (downloadable config file for the agent ecosystem)
   → Saves profile to Supabase `profiles` table

4. DASHBOARD
   Six sections: Overview, Applications, Agents, Pipeline, Resumes, Interviewer
   Real-time updates via Supabase Realtime subscriptions
   Gateway health check pings OpenClaw every 10 seconds
   Faulty terminal shader background bleeds through translucent UI panels
```

---

## Dashboard Pages

- **Overview** — Welcome panel, gateway status, agent cards with live status (running / idle / offline), recent activity feed, recent applications
- **Applications** — Table of all tracked job applications with status, company, role, follow-up alerts
- **Agents** — Visual profile cards for each agent with avatar, role description, last action, status indicator
- **Pipeline** — Pipeline stages visualization, trigger runs via OpenClaw Canvas UI
- **Resumes** — Generated resume variants and their target companies
- **Interviewer** — ElevenLabs voice AI mock interviews. Aria preps the session → you start a live voice conversation with an AI interviewer. Real-time transcript, timer, post-interview debrief with scoring

---

## Tech Stack

| Layer          | Technology                                                                 |
|----------------|----------------------------------------------------------------------------|
| Framework      | React 19 + Vite 7                                                          |
| Routing        | react-router-dom v7                                                        |
| State          | Zustand (scene state), React hooks (everything else)                       |
| Animation      | Framer Motion, GSAP                                                        |
| 3D / Shaders   | React Three Fiber + Drei, OGL (faulty terminal), Three.js                  |
| Auth + DB      | Supabase (PostgreSQL, Auth, Realtime)                                      |
| Agent Backend  | OpenClaw (WebSocket gateway, multi-agent orchestration)                    |
| Voice AI       | ElevenLabs Conversational AI (@elevenlabs/react SDK)                       |
| Styling        | Custom CSS with design tokens, backdrop-filter translucency                |

---

## Setup

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project
- [OpenClaw](https://openclaw.dev) installed (`pip install openclaw`)
- An [ElevenLabs](https://elevenlabs.io) account with a Conversational AI agent

### 1. Clone & Install

```bash
git clone https://github.com/MatthewKim323/tapn.git
cd tapn
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# ElevenLabs (API key is server-side only — no VITE_ prefix)
ELEVENLABS_API_KEY=sk_your_api_key
VITE_ELEVENLABS_AGENT_ID=agent_your_agent_id
VITE_ELEVENLABS_VOICE_ID=your_voice_id
```

### 3. Supabase Tables

Run the following SQL in your Supabase SQL Editor:

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

-- agent_logs (OpenClaw hook writes here)
CREATE TABLE IF NOT EXISTS agent_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  action TEXT,
  status TEXT DEFAULT 'success',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs (agent_name, created_at DESC);
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read agent_logs" ON agent_logs FOR SELECT USING (true);

-- mock_interview_sessions (Aria writes, dashboard reads)
CREATE TABLE IF NOT EXISTS mock_interview_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
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
CREATE POLICY "Users can view own sessions" ON mock_interview_sessions FOR SELECT USING (true);
CREATE POLICY "Users can insert sessions" ON mock_interview_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update sessions" ON mock_interview_sessions FOR UPDATE USING (true);
```

Also disable **email confirmation** in Supabase → Auth → Settings for development.

### 4. OpenClaw Setup

Install the Supabase logger hook:

```bash
openclaw hook install ./openclaw-hooks/supabase-logger
```

Set the env vars before starting the gateway:

```bash
export TAPN_SUPABASE_URL=https://your-project.supabase.co
export TAPN_SUPABASE_SERVICE_KEY=your-service-role-key
openclaw gateway
```

### 5. Run

```bash
npm run dev
```

The app starts at `http://localhost:5173` (or next available port).

---

## Project Structure

```
tapn/
├── public/
│   ├── assets/             # 3D models (galaxy.glb) + textures (disc.png)
│   └── profiles/           # Agent profile images (Tapn.png, Scout.png, etc.)
├── src/
│   ├── components/         # Reusable UI + visual effects
│   │   ├── Galaxy.jsx      # OGL star field shader
│   │   ├── Galaxy3D.jsx    # R3F galaxy model (galaxy.glb)
│   │   ├── GalaxyScene.jsx # R3F Canvas + post-processing (bloom, vignette)
│   │   ├── FaultyTerminal.jsx  # OGL "faulty terminal" shader background
│   │   ├── StarNest.jsx    # Star nest shader effect
│   │   ├── Dither.jsx      # Dither background effect
│   │   ├── DecryptedText.jsx   # Text decrypt animation
│   │   ├── SplitText.jsx   # Split text reveal animation
│   │   ├── Overlay.jsx     # HUD overlay for landing page
│   │   ├── Vignette.jsx    # Edge dimming overlay
│   │   └── LoadingScreen.jsx   # Initial loading screen
│   ├── hooks/              # Custom React hooks
│   │   ├── useAgentActivity.js  # Supabase Realtime → agent log feed
│   │   ├── useAgentStatus.js    # Agent status (running/idle/offline) + gateway health
│   │   ├── useApplications.js   # Supabase Realtime → applications table
│   │   └── useDashboardStats.js # Aggregated dashboard metrics
│   ├── lib/
│   │   ├── supabase.js     # Supabase client init
│   │   └── generateUserMd.js   # USER.md generator from profile data
│   ├── pages/
│   │   ├── LandingPage.jsx     # Galaxy + "Get Started" button
│   │   ├── LoginPage.jsx       # Supabase email/password auth
│   │   ├── OnboardingPage.jsx  # 5-step questionnaire → profile + USER.md
│   │   ├── DashboardPage.jsx   # Main dashboard shell (sidebar, routing, agents)
│   │   └── dashboard/
│   │       ├── OverviewView.jsx     # Welcome, agent cards, activity feed
│   │       ├── ApplicationsView.jsx # Applications table
│   │       ├── AgentsView.jsx       # Agent profile cards + detail panel
│   │       ├── PipelineView.jsx     # Pipeline stages
│   │       ├── ResumesView.jsx      # Resume variants
│   │       └── InterviewerView.jsx  # ElevenLabs voice mock interviews
│   ├── store/
│   │   └── sceneStore.js   # Zustand store for landing page scene state
│   └── styles/
│       └── globals.css     # Design tokens (CSS variables)
├── openclaw-hooks/
│   └── supabase-logger/    # Custom OpenClaw hook → logs to Supabase
│       ├── handler.js
│       ├── HOOK.md
│       └── package.json
├── vite.config.js          # Vite config + ElevenLabs signed-url middleware
├── .env                    # Environment variables (gitignored)
└── .gitignore
```

---

## Security Notes

- The ElevenLabs API key (`sk_...`) is **server-side only** — it's loaded by `vite.config.js` middleware and never included in the client bundle.
- Supabase anon key is safe to expose (RLS handles authorization).
- `.env` is gitignored. Never commit secrets.
- The OpenClaw Supabase logger uses the `service_role` key (bypasses RLS) — set this via shell env vars, not in the webapp's `.env`.

---

## License

Private project.
