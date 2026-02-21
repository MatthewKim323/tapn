import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Aggregate stats for the dashboard.
 */
export function useDashboardStats() {
  const [stats, setStats] = useState({
    applications: 0,
    interviews: 0,
    resumesGenerated: 0,
    pipelineRuns: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    async function fetchStats() {
      const [
        { count: totalApps },
        { count: interviews },
        { count: resumes },
        { count: pipelineRuns },
      ] = await Promise.all([
        supabase
          .from('applications')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'interview_scheduled'),
        supabase
          .from('agent_logs')
          .select('*', { count: 'exact', head: true })
          .eq('agent_name', 'taylor')
          .eq('action', 'resume_tailored'),
        supabase
          .from('agent_logs')
          .select('*', { count: 'exact', head: true })
          .eq('agent_name', 'tapn')
          .eq('action', 'pipeline_completed'),
      ]);

      setStats({
        applications: totalApps || 0,
        interviews: interviews || 0,
        resumesGenerated: resumes || 0,
        pipelineRuns: pipelineRuns || 0,
      });
      setLoading(false);
    }

    fetchStats();

    // Re-fetch when new data comes in
    const channel = supabase
      .channel('dashboard-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        () => fetchStats()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_logs' },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { stats, loading };
}
