import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Aggregate stats for the dashboard, scoped to the current user.
 */
export function useDashboardStats(userId) {
  const [stats, setStats] = useState({
    applications: 0,
    interviews: 0,
    resumesGenerated: 0,
    pipelineRuns: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !userId) {
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
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'interview_scheduled'),
        supabase
          .from('agent_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('agent_name', 'taylor')
          .eq('action', 'resume_tailored'),
        supabase
          .from('agent_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
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

    // Re-fetch when new data comes in for this user
    const channel = supabase
      .channel('dashboard-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        (payload) => {
          // Only re-fetch if the change is for this user
          if (payload.new?.user_id === userId || payload.old?.user_id === userId) {
            fetchStats();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_logs' },
        (payload) => {
          if (payload.new?.user_id === userId) {
            fetchStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { stats, loading };
}
