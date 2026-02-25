import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AGENT_NAMES = ['tapn', 'scout', 'taylor', 'echo', 'hermes', 'aria'];

/**
 * Fetches the most recent log entry for each agent from Supabase,
 * scoped to the current user.
 * Pings the OpenClaw gateway root URL to determine if it's online.
 */
export function useAgentStatus(userId) {
  const [agentLogs, setAgentLogs] = useState({});
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch last action per agent from Supabase — filtered by user_id
  const fetchAgentLogs = useCallback(async () => {
    if (!supabase || !userId) return;

    const results = await Promise.all(
      AGENT_NAMES.map(async (agent) => {
        const { data } = await supabase
          .from('agent_logs')
          .select('agent_name, action, details, status, created_at')
          .eq('user_id', userId)
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
  }, [userId]);

  // Ping the gateway root URL to check if OpenClaw is running
  const pingGateway = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway-health', { method: 'HEAD' });
      setGatewayOnline(res.ok);
    } catch {
      setGatewayOnline(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

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
          (payload) => {
            // Only process events for this user
            if (payload.new?.user_id !== userId) return;
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
  }, [userId, fetchAgentLogs, pingGateway]);

  /**
   * Determine agent status: 'running' | 'idle' | 'error' | 'offline'
   */
  function getAgentStatus(agentName) {
    const log = agentLogs[agentName];

    if (!log) {
      return gatewayOnline ? 'idle' : 'offline';
    }

    const lastTime = new Date(log.created_at).getTime();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    if (log.status === 'error') return 'error';
    if (gatewayOnline && lastTime > fiveMinAgo) return 'running';
    if (gatewayOnline) return 'idle';
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
