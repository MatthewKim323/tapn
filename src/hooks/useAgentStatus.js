import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AGENT_NAMES = ['tapn', 'scout', 'taylor', 'echo', 'hermes', 'aria'];

/**
 * Fetches the most recent log entry for each agent from Supabase.
 * Pings the OpenClaw gateway root URL to determine if it's online.
 * The gateway uses WebSocket (not REST), so we just check reachability.
 */
export function useAgentStatus() {
  const [agentLogs, setAgentLogs] = useState({});
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch last action per agent from Supabase
  const fetchAgentLogs = useCallback(async () => {
    if (!supabase) return;

    const results = await Promise.all(
      AGENT_NAMES.map(async (agent) => {
        const { data } = await supabase
          .from('agent_logs')
          .select('agent_name, action, details, status, created_at')
          .eq('agent_name', agent)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        return { agent, data };
      })
    );

    const logs = {};
    results.forEach(({ agent, data }) => {
      logs[agent] = data || null;
    });
    setAgentLogs(logs);
    setLoading(false);
  }, []);

  // Ping the gateway root URL to check if OpenClaw is running
  // The gateway is WebSocket-based — all we can check via HTTP is reachability
  const pingGateway = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway-health', { method: 'HEAD' });
      setGatewayOnline(res.ok);
    } catch {
      setGatewayOnline(false);
    }
  }, []);

  useEffect(() => {
    fetchAgentLogs();
    pingGateway();

    // Poll gateway health every 10 seconds
    const interval = setInterval(pingGateway, 10000);

    // Subscribe to new agent logs for live updates
    if (supabase) {
      const channel = supabase
        .channel('agent-status')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_logs',
          },
          () => {
            fetchAgentLogs();
          }
        )
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }

    return () => clearInterval(interval);
  }, [fetchAgentLogs, pingGateway]);

  /**
   * Determine agent status: 'running' | 'idle' | 'error' | 'offline'
   *
   * - Gateway online + recent log (< 5 min) → running
   * - Gateway online + no recent log          → idle (standing by)
   * - Gateway offline + recent log (< 1 hr)   → idle
   * - Gateway offline + stale/no log           → offline
   */
  function getAgentStatus(agentName) {
    const log = agentLogs[agentName];

    // No logs at all
    if (!log) {
      // Gateway is up → agents are loaded and standing by
      return gatewayOnline ? 'idle' : 'offline';
    }

    const lastTime = new Date(log.created_at).getTime();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Last log was an error → show error regardless
    if (log.status === 'error') return 'error';

    // Gateway online + recent activity → running
    if (gatewayOnline && lastTime > fiveMinAgo) return 'running';

    // Gateway online but no recent activity → idle (standing by)
    if (gatewayOnline) return 'idle';

    // Gateway offline but logged within the hour → idle
    if (lastTime > oneHourAgo) return 'idle';

    return 'offline';
  }

  function getLastAction(agentName) {
    return agentLogs[agentName] || null;
  }

  return {
    loading,
    gatewayOnline,
    getAgentStatus,
    getLastAction,
    refresh: () => {
      fetchAgentLogs();
      pingGateway();
    },
  };
}
