import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Realtime subscription to agent_logs.
 * Returns the latest 100 events, auto-updated via Supabase Realtime.
 */
export function useAgentActivity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Initial load
    supabase
      .from('agent_logs')
      .select('*')
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
          setEvents((prev) => [payload.new, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { events, loading };
}
