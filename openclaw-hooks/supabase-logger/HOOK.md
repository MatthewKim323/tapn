---
name: supabase-logger
description: "Log all agent command events to Supabase agent_logs table"
metadata:
  {
    "openclaw":
      {
        "emoji": "🗃️",
        "events": ["command"],
        "install": [{ "id": "local", "kind": "local", "label": "TAPN Supabase Logger" }],
      },
  }
---

# Supabase Logger Hook

Logs all agent command events to the `agent_logs` table in Supabase, enabling real-time dashboard monitoring of the TAPN agent ecosystem.

## What It Does

Every time an agent processes a command:

1. **Extracts agent identity** from the session key
2. **Writes a row** to `agent_logs` in Supabase with agent name, action, status, and details
3. **Enables real-time** dashboard updates via Supabase Realtime subscriptions

## Environment Variables

Set these in your shell or `.env` before starting the gateway:

```
TAPN_SUPABASE_URL=https://your-project.supabase.co
TAPN_SUPABASE_SERVICE_KEY=your-service-role-key
TAPN_USER_ID=your-auth-user-uuid
```

## Requirements

- `@supabase/supabase-js` npm package (installed automatically)
