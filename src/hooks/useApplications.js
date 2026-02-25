import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Realtime subscription to applications table, scoped to the current user.
 * Auto-updates on INSERT and UPDATE.
 */
export function useApplications(userId) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }

    // Initial load — filtered by user_id
    supabase
      .from('applications')
      .select('*')
      .eq('user_id', userId)
      .order('applied_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setApplications(data);
        setLoading(false);
      });

    // Live subscription
    const channel = supabase
      .channel('applications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications',
        },
        (payload) => {
          // Only process events for this user
          if (payload.new?.user_id && payload.new.user_id !== userId) return;
          if (payload.eventType === 'DELETE') {
            setApplications((prev) => prev.filter((a) => a.id !== payload.old.id));
            return;
          }
          setApplications((prev) => {
            const idx = prev.findIndex((a) => a.id === payload.new.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = payload.new;
              return updated;
            }
            return [payload.new, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { applications, loading };
}
