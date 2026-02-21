import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AGENT_NAMES = ['tapn', 'scout', 'taylor', 'echo', 'hermes', 'aria'];

/**
 * Fetches the most recent log entry for each agent.
 * Also polls the OpenClaw gateway for live session status.
 */
export function useAgentStatus() {
  const [agentLogs, setAgentLogs] = useState({});
  const [gatewaySessions, setGatewaySessions] = useState(null);
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

  // Poll OpenClaw gateway for live session status
  const fetchGatewayStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/sessions');
      if (res.ok) {
        const sessions = await res.json();
        setGatewaySessions(sessions);
        setGatewayOnline(true);
      } else {
        setGatewayOnline(false);
      }
    } catch {
      setGatewayOnline(false);
    }
  }, []);

  useEffect(() => {
    fetchAgentLogs();
    fetchGatewayStatus();

    // Poll gateway every 10 seconds
    const interval = setInterval(fetchGatewayStatus, 10000);

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
            // Re-fetch all agent statuses when any new log comes in
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
  }, [fetchAgentLogs, fetchGatewayStatus]);

  /**
   * Determine agent status: 'running' | 'idle' | 'error' | 'offline'
   */
  function getAgentStatus(agentName) {
    // Check gateway sessions first (live running status)
    if (gatewaySessions && Array.isArray(gatewaySessions)) {
      const isRunning = gatewaySessions.some(
        (s) => s.agentId === agentName || s.agentId === (agentName === 'tapn' ? 'main' : agentName)
      );
      if (isRunning) return 'running';
    }

    // Fall back to last log entry
    const log = agentLogs[agentName];
    if (!log) return 'offline';

    // If last action was within 5 minutes, consider "idle" (recently active)
    const lastTime = new Date(log.created_at).getTime();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (lastTime > fiveMinAgo) {
      return log.status === 'error' ? 'error' : 'idle';
    }

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
      fetchGatewayStatus();
    },
  };
}
