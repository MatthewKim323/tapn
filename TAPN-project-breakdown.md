# TAPN — The Autonomous Professional Network

## Project Breakdown

---

## What TAPN Is

TAPN is an AI-powered, multi-agent job application pipeline built on the OpenClaw agent framework. It automates the end-to-end job search lifecycle — from identifying companies that are actively hiring, to tailoring resumes, submitting applications, scheduling interviews, and preparing mock interview sessions.

The system runs on a single OpenClaw Gateway with one orchestrator agent (Tapn) coordinating five specialized sub-agents, each with its own isolated workspace, session store, and operating instructions. Communication with the human operator (Ted) happens exclusively through Telegram.

---

## Architecture Overview

```
Ted (Human)
  │
  │  Telegram
  ▼
🎯 Tapn (Conductor / Orchestrator)
  │
  ├── 🔍 Scout      →  Job Discovery (Live Data Technologies API + careers page scraping)
  ├── 📝 Taylor     →  Resume Tailoring (JD analysis → LaTeX → ATS-optimized PDF)
  ├── 🌐 Echo       →  Application Submission (browser automation on ATS platforms)
  ├── 📅 Hermes     →  Interview Scheduling (Gmail + Google Calendar via gog CLI)
  └── 🎤 Aria       →  Interview Prep (question generation + ElevenLabs mock interviews)
```

### Infrastructure

| Component | Technology |
|-----------|-----------|
| Agent Framework | OpenClaw (single Gateway at ws://127.0.0.1:18789) |
| LLM | Anthropic Claude Sonnet 4.5 (all agents) |
| Human Comms | Telegram (Ted ↔ Tapn only) |
| Job Market Data | Live Data Technologies People API |
| Resume Generation | LaTeX → PDF (pdflatex) |
| Browser Automation | OpenClaw managed browser (echo-browser profile) |
| Email / Calendar | Google Workspace via gog CLI (matthewykim.tapn@gmail.com) |
| Mock Interviews | ElevenLabs Conversational AI |
| Database | Supabase (PostgreSQL — applications, agent_logs, mock_interviews) |
| Logging | Supabase REST API via tapn-logger shared skill |

---

## Agent Roster

### 🎯 Tapn (Conductor)

**Role:** Pipeline orchestrator. Does not perform any task directly — spawns, sequences, and monitors sub-agents. Only agent that communicates with Ted via Telegram.

**Responsibilities:**
- Trigger nightly pipeline runs (Scout → Taylor → Echo → Aria)
- Route data between agents (Scout's positions → Taylor, Taylor's resumes → Echo, etc.)
- Monitor for errors and surface them to Ted when human intervention is needed
- Run scheduled cron jobs (nightly pipeline, follow-up checks, interview inbox monitoring)
- Post pipeline summaries to Ted via Telegram
- Maintain end-to-end traceability for every run

**Spawns:** Scout, Taylor, Echo, Hermes, Aria

---

### 🔍 Scout (Job Discovery)

**Role:** Intelligence analyst. Finds companies actively hiring for Ted's target roles using workforce data, then verifies open positions on careers pages.

**Input:** Target titles, industries, blacklist, keyword filters from USER.md

**Workflow:**
1. Authenticate with Live Data Technologies People API
2. Query for people who started data-related roles in the last 30 days
3. Aggregate results by company → rank by hiring velocity
4. Filter out blacklisted companies, already-applied companies, deal-breaker keywords
5. For top 10 companies: browse careers pages, find matching open positions
6. Extract full job descriptions (untruncated), job URLs, requirements
7. Build structured JSON report and announce back to Tapn

**Output:** JSON report with ranked positions including company info, hiring signals, job URLs, full JD text, keyword matches, and status flags

**Key Constraint:** Full job descriptions must be passed through untruncated — all downstream agents depend on the complete text.

---

### 📝 Taylor (Resume Tailoring)

**Role:** Resume specialist. Takes Ted's base resume + a specific JD and produces an ATS-optimized, keyword-matched, single-page PDF tailored to that exact role.

**Input:** One position from Scout's report (company, title, URL, full JD, key requirements)

**Workflow:**
1. Read base resume (read-only) and USER.md for full background context
2. Analyze JD: extract hard skills, soft skills, domain keywords, action verbs
3. Build keyword priority list (Tier 1: must appear, Tier 2: should appear, Tier 3: bonus)
4. Map Ted's experience to JD requirements, score relevance of each section
5. Rewrite bullet points with JD language, quantified results, and specific tools
6. Build skills section as strategic ATS keyword surface area
7. Generate LaTeX → compile to PDF (single page, single column, ATS-friendly)
8. Self-review against checklist, then announce back to Tapn with file path + changes summary

**Output:** Tailored PDF resume + changes summary + keyword coverage report + full JD passthrough

**Key Constraint:** Never fabricates skills or experience. Never modifies the base resume file. Resume must be exactly one page.

---

### 🌐 Echo (Application Submission)

**Role:** Form-filling operator. Navigates to job application pages, fills out forms using Ted's info, uploads the tailored resume, writes cover letters if needed, and submits.

**Input:** One position with job URL, full JD, tailored resume path, keyword matches

**Workflow:**
1. Validate inputs (URL legitimacy, resume file exists, USER.md readable)
2. Navigate to job_url in sandboxed echo-browser profile
3. Identify application form (handle Greenhouse, Lever, Workday, LinkedIn Easy Apply, direct)
4. Fill all fields from USER.md field mapping
5. Upload tailored resume (never the base resume)
6. Generate cover letter if required (3-4 paragraphs, ~250 words, human-sounding)
7. Handle screening questions using USER.md + JD context
8. Review all fields, then submit
9. Verify submission confirmation
10. Announce back to Tapn with status + full JD passthrough

**Output:** Application status (applied/failed) + method + confirmation details + full JD passthrough

**Security Constraints:**
- URL allowlist: only job_url, known ATS domains, company domains, Google OAuth
- Never enters SSN, banking info, credit card, government IDs
- Prompt injection detection: stops immediately if injected instructions detected
- Only uses matthewykim.tapn@gmail.com, never personal accounts

---

### 📅 Hermes (Interview Scheduling)

**Role:** Calendar manager. Monitors the job inbox for interview invitations, checks calendar availability, drafts responses, and creates calendar events.

**Input:** Triggered on cron (every 2 hours, 9AM-5PM weekdays) or on-demand by Tapn

**Workflow:**
1. Scan Gmail inbox for unread interview-related emails (last 7 days)
2. Classify each email: interview invitation vs. rejection/confirmation/newsletter
3. For interview invitations:
   - If time proposed + available → confirm and create calendar event
   - If time proposed + conflict → propose 3 alternatives
   - If asking for availability → send 3-5 available slots
4. Mark processed emails as read, label "TAPN-Processed"
5. Announce back to Tapn with scheduling status

**Output:** Interview scheduling status + calendar event confirmation + response sent/pending

**Constraints:**
- Availability window: Mon-Fri, 10AM-4PM PST only
- Minimum 48-hour notice
- 30-minute buffer around existing events
- No back-to-back interviews (1-hour gap minimum)
- Never clicks scheduling links (Calendly/cal.com) — reports to Tapn for manual handling
- Never replies to rejections

---

### 🎤 Aria (Interview Prep)

**Role:** Career coach. Generates company-specific interview prep materials and configures ElevenLabs Conversational AI for voice mock interviews. Scores performance and debriefs.

**Input:** Confirmed interview details (company, title, JD, tailored resume, interview date/format)

**Workflow — Phase 1 (Research & Prep):**
1. Analyze JD: extract required skills, implied skills, team context, seniority signals
2. Research company interview patterns (Glassdoor, recent experiences)
3. Generate 15-20 questions across 4 categories:
   - Technical (5-7): based on JD's required technical skills
   - Behavioral (4-5): STAR-framework with Ted's specific experience angles
   - Company/Role-Specific (3-4): show research depth
   - Questions to Ask Interviewer (3-4): smart, non-Googleable
4. Save prep document to workspace

**Workflow — Phase 2 (Mock Interview):**
5. Generate ElevenLabs interviewer system prompt (dynamic per interview)
6. Configure and launch mock interview session via API
7. Ted talks to the AI interviewer in the browser (real-time voice)

**Workflow — Phase 3 (Debrief):**
8. Retrieve transcript from ElevenLabs
9. Score each answer (relevance, specificity, structure, conciseness, technical accuracy)
10. Generate overall assessment with strongest/weakest areas + top 3 practice priorities
11. Announce debrief to Tapn

**Output:** Prep document + mock interview session config + transcript + scored debrief

**Key Constraint:** Never generates generic questions. Every question must connect to the specific JD, company, or role. Never scores generously — honest feedback prepares Ted better.

---

## Pipeline Flows

### Primary Flow: Nightly Pipeline

```
1:00 AM PST — Tapn triggers full pipeline
│
├─ Tapn spawns Scout
│   └─ Scout discovers positions → announces JSON report to Tapn
│
├─ For each verified position:
│   ├─ Tapn spawns Taylor with position data
│   │   └─ Taylor tailors resume → announces file path + JD passthrough to Tapn
│   │
│   ├─ Tapn spawns Echo with position + tailored resume
│   │   └─ Echo submits application → announces status + JD passthrough to Tapn
│   │
│   └─ Tapn spawns Aria with application details
│       └─ Aria generates prep + mock interview config → announces to Tapn
│
└─ Tapn posts nightly summary to Ted via Telegram
```

### Interview Scheduling Flow

```
Every 2 hours (9AM-5PM weekdays) — Tapn spawns Hermes
│
├─ Hermes scans inbox
├─ Processes interview invitations
├─ Responds to companies
├─ Creates calendar events
└─ Announces results to Tapn → Tapn notifies Ted if action needed
```

### Follow-Up Flow

```
9:00 AM PST — Tapn queries Supabase for applications:
  status = "applied" AND follow_up_sent_at IS NULL AND applied_at < (now - 5 business days)
│
├─ For each qualifying application:
│   └─ Tapn drafts/sends follow-up email via Gmail
│       (personalized, references specific JD, 3-5 sentences max)
│
└─ Updates applications table: follow_up_sent_at = now()
```

---

## Data Flow & Passthrough Rules

A critical design principle: **the full job description text must be passed through every stage of the pipeline untruncated.** Each agent depends on it:

```
Scout extracts full JD
  → passes to Tapn
    → Tapn passes to Taylor (for keyword matching)
      → Taylor passes back to Tapn in announce-back
        → Tapn passes to Echo (for form context + cover letters)
          → Echo passes back to Tapn in announce-back
            → Tapn passes to Aria (for interview question generation)
```

If any agent drops or truncates the JD, downstream agents lose the context they need.

---

## Supabase Schema

### Tables

**applications**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Ted's user ID |
| company_name | text | Company name |
| job_title | text | Job title |
| job_url | text | Direct URL to posting |
| job_description | text | Full JD text |
| tailored_resume_path | text | Path to tailored PDF |
| status | text | applied / interview_scheduled / rejected / offer |
| applied_at | timestamptz | When application was submitted |
| follow_up_sent_at | timestamptz | When follow-up was sent (null = not sent) |
| interview_scheduled_at | timestamptz | When interview is scheduled |
| mock_interview_ready | boolean | Whether mock interview is available |
| mock_interview_score | numeric | Score from Aria's debrief |

**agent_logs**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Ted's user ID |
| agent_name | text | scout / taylor / echo / hermes / aria / tapn |
| action | text | What was done |
| details | jsonb | Structured details |
| status | text | success / error / warning / skipped |
| tokens_used | integer | Token count (optional) |
| cost_estimate | numeric | Cost estimate (optional) |
| created_at | timestamptz | Auto-generated |

**mock_interviews**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Ted's user ID |
| company | text | Company name |
| job_title | text | Job title |
| overall_score | numeric | 1-10 score |
| transcript | jsonb | Full conversation transcript |
| debrief | text | Markdown debrief |
| strongest_area | text | Top strength |
| weakest_area | text | Top area for improvement |
| recommendation | text | ready / practice_more / focus_on_x |

---

## Cron Schedule

| Time | Job | Agent | Description |
|------|-----|-------|-------------|
| 1:00 AM PST | Nightly Pipeline | Tapn → Scout → Taylor → Echo → Aria | Full discovery-to-prep pipeline |
| 9:00 AM PST | Follow-Up Check | Tapn | Query for 5+ day old applications, send follow-ups |
| 9AM-5PM/2hrs | Interview Monitor | Tapn → Hermes | Check inbox for interview invitations |

---

## Shared Infrastructure

### Shared Skill: tapn-logger

All agents log to Supabase via the tapn-logger shared skill after every significant action. Required fields: agent_name, action, details (JSON), status. Logging happens before any announcements.

### USER.md (Shared Across All Agents)

Every agent gets an identical copy of USER.md containing Ted's personal info, career goals, target roles, application preferences, scheduling constraints, and communication style. When Ted's situation changes, USER.md is updated in every workspace.

### Environment Variables (Required)

```
LIVE_DATA_CLIENT_ID          # Live Data Technologies API
LIVE_DATA_CLIENT_SECRET
LIVE_DATA_ORG_ID

SUPABASE_URL                 # Supabase database
SUPABASE_SERVICE_KEY
USER_UUID                    # Ted's user ID in Supabase

ELEVENLABS_API_KEY           # ElevenLabs mock interviews
ELEVENLABS_AGENT_ID
ELEVENLABS_VOICE_ID

TELEGRAM_BOT_TOKEN           # Telegram (Ted ↔ Tapn)
TELEGRAM_CHAT_ID
```

---

## File System Layout

```
~/.openclaw/
├── workspace/                    # Tapn (Conductor) — main agent
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── USER.md
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   └── skills/
│       └── tapn-logger/SKILL.md
│
├── workspace-scout/              # Scout
│   ├── SOUL.md
│   ├── AGENTS.md
│   └── USER.md
│
├── workspace-taylor/             # Taylor
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── USER.md
│   └── resumes/
│       ├── matt_base_resume.pdf  # READ ONLY
│       └── tailored/             # Output directory
│
├── workspace-echo/               # Echo
│   ├── SOUL.md
│   ├── AGENTS.md
│   └── USER.md
│
├── workspace-hermes/             # Hermes
│   ├── SOUL.md
│   ├── AGENTS.md
│   └── USER.md
│
├── workspace-aria/               # Aria
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── USER.md
│   ├── prep/                     # Interview prep documents
│   ├── sessions/                 # ElevenLabs session configs
│   └── debriefs/                 # Scored debrief documents
│
├── skills/                       # Shared skills
│   └── tapn-logger/SKILL.md
│
└── openclaw.json                 # Agent registry + config
```

---

## Error Handling Philosophy

Every agent follows the same escalation pattern:

1. **Retry once** on transient errors (timeouts, rate limits, API blips)
2. **Skip and continue** if one item in a batch fails (don't block the pipeline)
3. **Report to Tapn** with specific error details (never hide failures)
4. **Tapn reports to Ted** only when human intervention is needed (CAPTCHAs, auth failures, ambiguous situations)

Errors that require Ted's attention are surfaced via Telegram with clear context: what failed, why, and what action is needed.

---

## Security Boundaries

- Echo's browser is sandboxed (echo-browser profile) — no personal accounts, no non-job sites
- Echo has a strict URL allowlist (job URLs + known ATS domains only)
- Hermes only accesses matthewykim.tapn@gmail.com — no other email accounts
- No agent ever stores or transmits SSN, banking info, or government IDs
- Prompt injection detection on all form-filling pages
- All inter-agent data stays on local filesystem and Supabase — nothing leaves the system except emails to companies and application form submissions

---

## Key Design Decisions

1. **One agent per spawn per position.** Taylor gets spawned once per job. Echo gets spawned once per application. No batch processing within a single agent session.

2. **Telegram only, not Slack.** All human communication flows through Telegram between Ted and Tapn. There are no Slack channels.

3. **JD passthrough is sacred.** The full job description text flows through the entire pipeline unmodified. Every agent passes it forward in their announce-back.

4. **Honest over helpful.** Taylor never fabricates resume content. Aria never inflates mock interview scores. Scout never editorializes about hiring signals.

5. **Skip, don't block.** If one application fails, the pipeline moves to the next. Perfect completion of every item is less important than throughput.
