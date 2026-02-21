import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Realtime subscription to applications table.
 * Auto-updates on INSERT and UPDATE.
 */
export function useApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Initial load
    supabase
      .from('applications')
      .select('*')
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
          event: '*', // INSERT and UPDATE
          schema: 'public',
          table: 'applications',
        },
        (payload) => {
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
  }, []);

  return { applications, loading };
}
