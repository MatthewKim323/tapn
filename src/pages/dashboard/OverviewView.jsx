import { motion } from "framer-motion";

const stagger = (i) => ({ duration: 0.4, delay: 0.05 + i * 0.06 });

export default function OverviewView({
  userName,
  gatewayOnline,
  pipelineLoading,
  initializePipeline,
  stats,
  agents,
  getAgentStatus,
  getLastAction,
  activityEvents,
  applications,
  onNavigate,
  timeAgo,
}) {
  const STAT_ITEMS = [
    { label: "applications", value: String(stats.applications) },
    { label: "interviews", value: String(stats.interviews) },
    { label: "resumes generated", value: String(stats.resumesGenerated) },
    { label: "pipeline runs", value: String(stats.pipelineRuns) },
  ];

  return (
    <>
      {/* Welcome */}
      <motion.section
        className="dashboard-welcome"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="welcome-text">
          <h1 className="welcome-title">welcome back, {userName}</h1>
        </div>
        <button
          className="welcome-cta"
          onClick={() => window.open("http://127.0.0.1:18789/__openclaw__/canvas/", "_blank")}
          disabled={!gatewayOnline}
        >
          <span className={`cta-pulse ${gatewayOnline ? "" : "offline"}`} />
          open command center
        </button>
      </motion.section>

      {/* Stats */}
      <motion.section
        className="dashboard-stats"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        {STAT_ITEMS.map((stat) => (
          <div key={stat.label} className="stat-card">
            <span className="stat-icon">{stat.icon}</span>
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </motion.section>

      {/* Agent Fleet (compact — click to go to agents page) */}
      <motion.section
        className="dashboard-agents"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="section-header">
          <h2 className="section-title">agents</h2>
          <button className="section-link" onClick={() => onNavigate("agents")}>
            view all →
          </button>
        </div>
        <div className="agents-grid">
          {agents.map((agent, i) => {
            const status = getAgentStatus(agent.id);
            const lastAction = getLastAction(agent.id);
            return (
              <motion.div
                key={agent.id}
                className="agent-card clickable"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i)}
                onClick={() => onNavigate("agents", agent.id)}
              >
                <div className="agent-top">
                  <span className="agent-emoji">{agent.emoji}</span>
                  <span className={`agent-status-badge ${status}`}>{status}</span>
                </div>
                <h3 className="agent-name">{agent.name}</h3>
                <span className="agent-role">{agent.role}</span>
                <p className="agent-desc">{agent.description}</p>
                <div className="agent-footer">
                  <span className="agent-last-run">
                    {lastAction
                      ? `${lastAction.action} · ${timeAgo(lastAction.created_at)}`
                      : "no activity yet"}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* Activity Feed */}
      <motion.section
        className="dashboard-activity"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="section-header">
          <h2 className="section-title">recent activity</h2>
          {activityEvents.length > 0 && (
            <span className="section-badge">{activityEvents.length} events</span>
          )}
        </div>
        {activityEvents.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">◌</span>
            <p>no activity yet. initialize the pipeline to begin.</p>
          </div>
        ) : (
          <div className="activity-feed">
            {activityEvents.slice(0, 15).map((event) => (
              <div key={event.id} className="activity-row">
                <span className={`activity-dot ${event.status === "error" ? "error" : ""}`} />
                <span className="activity-agent">{event.agent_name}</span>
                <span className="activity-action">{event.action}</span>
                <span className="activity-time">{timeAgo(event.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* Quick Applications Preview */}
      {applications.length > 0 && (
        <motion.section
          className="dashboard-applications"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="section-header">
            <h2 className="section-title">recent applications</h2>
            <button className="section-link" onClick={() => onNavigate("applications")}>
              View All →
            </button>
          </div>
          <div className="applications-table">
            <div className="app-table-header">
              <span>company</span>
              <span>role</span>
              <span>status</span>
              <span>applied</span>
            </div>
            {applications.slice(0, 5).map((app) => (
              <div key={app.id} className="app-table-row">
                <span className="app-company">{app.company_name}</span>
                <span className="app-role">{app.job_title}</span>
                <span className={`app-status-badge ${app.status}`}>{app.status}</span>
                <span className="app-date">{timeAgo(app.applied_at)}</span>
              </div>
            ))}
          </div>
        </motion.section>
      )}
    </>
  );
}
