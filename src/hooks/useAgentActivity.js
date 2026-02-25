import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Realtime subscription to agent_logs, scoped to the current user.
 * Returns the latest 100 events, auto-updated via Supabase Realtime.
 */
export function useAgentActivity(userId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }

    // Initial load — filtered by user_id
    supabase
      .from('agent_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!error && data) setEvents(data);
        setLoading(false);
      });

    // Live subscription
    const channel = supabase
      .channel('agent-activity')
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
          setEvents((prev) => [payload.new, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { events, loading };
}
