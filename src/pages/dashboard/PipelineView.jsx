import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabase";

const PIPELINE_STAGES = [
  { agent: "scout", label: "discovery", emoji: "🔍", desc: "finding companies actively hiring" },
  { agent: "taylor", label: "tailoring", emoji: "📝", desc: "crafting targeted resumes" },
  { agent: "echo", label: "submission", emoji: "🌐", desc: "applying to matched positions" },
  { agent: "aria", label: "interview prep", emoji: "🎤", desc: "generating prep materials" },
];

export default function PipelineView({
  gatewayOnline,
  pipelineLoading,
  initializePipeline,
  activityEvents,
  timeAgo,
}) {
  const [pipelineRuns, setPipelineRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("agent_logs")
      .select("*")
      .eq("agent_name", "tapn")
      .in("action", ["pipeline_started", "pipeline_completed", "pipeline_error"])
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!error && data) setPipelineRuns(data);
        setLoading(false);
      });
  }, []);

  // Build a status view for current pipeline state
  const stageStatus = useMemo(() => {
    const statuses = {};
    PIPELINE_STAGES.forEach((stage) => {
      const lastLog = activityEvents.find((e) => e.agent_name === stage.agent);
      if (!lastLog) {
        statuses[stage.agent] = { status: "waiting", action: null };
      } else {
        const ageMs = Date.now() - new Date(lastLog.created_at).getTime();
        const isRecent = ageMs < 10 * 60 * 1000; // 10 min
        statuses[stage.agent] = {
          status: lastLog.status === "error" ? "error" : isRecent ? "active" : "done",
          action: lastLog.action,
          time: lastLog.created_at,
        };
      }
    });
    return statuses;
  }, [activityEvents]);

  // Cron schedule
  const CRON_SCHEDULE = [
    { time: "1:00 AM PST", job: "nightly pipeline", agent: "tapn → scout → taylor → echo → aria", freq: "daily" },
    { time: "9:00 AM PST", job: "follow-up check", agent: "tapn", freq: "weekdays" },
    { time: "9AM–5PM / 2hrs", job: "interview monitor", agent: "hermes", freq: "weekdays" },
  ];

  return (
    <>
      {/* Header */}
      <motion.div
        className="view-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="view-title">pipeline</h1>
          <p className="view-subtitle">
            scout → taylor → echo → aria · orchestrated by tapn
          </p>
        </div>
        <button
          className="welcome-cta"
          onClick={() => window.open("http://127.0.0.1:18789/__openclaw__/canvas/", "_blank")}
          disabled={!gatewayOnline}
        >
          <span className={`cta-pulse ${gatewayOnline ? "" : "offline"}`} />
          open command center
        </button>
      </motion.div>

      {/* Pipeline Stages Visualization */}
      <motion.div
        className="pipeline-stages"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <h2 className="section-title">pipeline stages</h2>
        <div className="stages-flow">
          {PIPELINE_STAGES.map((stage, i) => {
            const ss = stageStatus[stage.agent] || { status: "waiting" };
            return (
              <div key={stage.agent} className="stage-wrapper">
                <div className={`stage-card ${ss.status}`}>
                  <span className="stage-emoji">{stage.emoji}</span>
                  <span className="stage-label">{stage.label}</span>
                  <span className="stage-desc">{stage.desc}</span>
                  <span className={`stage-status-badge ${ss.status}`}>{ss.status}</span>
                  {ss.action && (
                    <span className="stage-action">
                      {ss.action} · {timeAgo(ss.time)}
                    </span>
                  )}
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="stage-connector">
                    <span className="connector-line" />
                    <span className="connector-arrow">→</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Cron Schedule */}
      <motion.div
        className="pipeline-cron"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h2 className="section-title">scheduled jobs</h2>
        <div className="cron-table">
          <div className="cron-header">
            <span>time</span>
            <span>job</span>
            <span>agents</span>
            <span>frequency</span>
          </div>
          {CRON_SCHEDULE.map((cron, i) => (
            <div key={i} className="cron-row">
              <span className="cron-time">{cron.time}</span>
              <span className="cron-job">{cron.job}</span>
              <span className="cron-agent">{cron.agent}</span>
              <span className="cron-freq">{cron.freq}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Run History */}
      <motion.div
        className="pipeline-history"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2 className="section-title">run history</h2>
        {loading ? (
          <div className="panel-loading">
            <span className="loading-dot" /> loading...
          </div>
        ) : pipelineRuns.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">◌</span>
            <p>no pipeline runs recorded yet.</p>
          </div>
        ) : (
          <div className="activity-feed">
            {pipelineRuns.map((run) => (
              <div key={run.id} className="activity-row">
                <span className={`activity-dot ${run.status === "error" ? "error" : ""}`} />
                <span className="activity-agent">tapn</span>
                <span className="activity-action">{run.action}</span>
                {run.details && run.details.duration && (
                  <span className="run-duration">{run.details.duration}</span>
                )}
                <span className="activity-time">{timeAgo(run.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}
