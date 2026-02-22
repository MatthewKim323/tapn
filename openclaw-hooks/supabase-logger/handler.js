/**
 * TAPN Supabase Logger Hook
 * 
 * Logs all agent command events to the agent_logs table in Supabase
 * using raw fetch (zero npm dependencies).
 *
 * Required env vars:
 *   TAPN_SUPABASE_URL        — e.g. https://xxx.supabase.co
 *   TAPN_SUPABASE_SERVICE_KEY — service_role key (bypasses RLS)
 */

const SUPABASE_URL = process.env.TAPN_SUPABASE_URL;
const SUPABASE_KEY = process.env.TAPN_SUPABASE_SERVICE_KEY;

/**
 * Extract the agent name from an OpenClaw session key.
 * Session keys look like: "agent:main:main", "agent:scout:topic-123"
 */
function extractAgentName(sessionKey) {
  if (!sessionKey) return "unknown";
  const parts = sessionKey.split(":");
  if (parts.length >= 2) {
    const agentId = parts[1];
    return agentId === "main" ? "tapn" : agentId;
  }
  return "unknown";
}

/**
 * Log command events to Supabase agent_logs table via REST API.
 */
const logToSupabase = async (event) => {
  if (event.type !== "command") return;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "[supabase-logger] Missing TAPN_SUPABASE_URL or TAPN_SUPABASE_SERVICE_KEY"
    );
    return;
  }

  try {
    const agentName = extractAgentName(event.sessionKey);
    const action = event.action || "unknown";
    const source = event.context?.commandSource || "unknown";
    const senderId = event.context?.senderId || "unknown";

    const row = {
      agent_name: agentName,
      action: action,
      status: "success",
      details: {
        sessionKey: event.sessionKey,
        source: source,
        senderId: senderId,
      },
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[supabase-logger] Insert failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.error(
      "[supabase-logger] Error:",
      err instanceof Error ? err.message : String(err)
    );
  }
};

export default logToSupabase;
