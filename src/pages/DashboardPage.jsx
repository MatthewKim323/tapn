import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { useAgentActivity } from "../hooks/useAgentActivity";
import { useApplications } from "../hooks/useApplications";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { useDashboardStats } from "../hooks/useDashboardStats";
import "./DashboardPage.css";

const AGENTS = [
  {
    id: "tapn",
    gatewayId: "main",
    emoji: "🎯",
    name: "tapn",
    role: "conductor / orchestrator",
    description:
      "coordinates the pipeline, delegates tasks, reports to you via telegram",
  },
  {
    id: "scout",
    gatewayId: "scout",
    emoji: "🔍",
    name: "scout",
    role: "job discovery",
    description:
      "finds companies actively hiring using workforce data + careers page scraping",
  },
  {
    id: "taylor",
    gatewayId: "taylor",
    emoji: "📝",
    name: "taylor",
    role: "resume tailoring",
    description:
      "analyzes each jd and produces an ats-optimized, keyword-matched resume",
  },
  {
    id: "echo",
    gatewayId: "echo",
    emoji: "🌐",
    name: "echo",
    role: "application submission",
    description:
      "navigates application forms, fills fields, uploads resumes, submits",
  },
  {
    id: "hermes",
    gatewayId: "hermes",
    emoji: "📅",
    name: "hermes",
    role: "interview scheduling",
    description:
      "monitors inbox for invitations, checks availability, books interviews",
  },
  {
    id: "aria",
    gatewayId: "aria",
    emoji: "🎤",
    name: "aria",
    role: "interview prep",
    description:
      "generates prep materials + conducts ai voice mock interviews",
  },
];

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DashboardPage({ session, profile }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [activePage, setActivePage] = useState("overview");

  // Live data hooks
  const { events: activityEvents } = useAgentActivity();
  const { applications } = useApplications();
  const { getAgentStatus, getLastAction, gatewayOnline, refresh: refreshAgents } = useAgentStatus();
  const { stats } = useDashboardStats();

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    navigate("/");
  }

  function downloadUserMd() {
    if (profile?.user_md_content) {
      const blob = new Blob([profile.user_md_content], {
        type: "text/markdown",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "USER.md";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const initializePipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const res = await fetch("/api/gateway/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          payload: {
            kind: "agentTurn",
            message: "Run the nightly pipeline — discover positions, tailor resumes, submit applications, and queue interview prep.",
          },
        }),
      });
      if (!res.ok) throw new Error("Gateway unavailable");
      refreshAgents();
    } catch (err) {
      console.error("Failed to initialize pipeline:", err);
    } finally {
      setPipelineLoading(false);
    }
  }, [refreshAgents]);

  const userName =
    profile?.full_name || session?.user?.email?.split("@")[0] || "operator";

  const STAT_ITEMS = [
    { label: "applications", value: String(stats.applications), icon: "◎" },
    { label: "interviews", value: String(stats.interviews), icon: "◈" },
    { label: "resumes generated", value: String(stats.resumesGenerated), icon: "◇" },
    { label: "pipeline runs", value: String(stats.pipelineRuns), icon: "▹" },
  ];

  return (
    <div className="dashboard-page">
      {/* ═══ Sidebar ═══ */}
      <aside
        className={`dashboard-sidebar ${sidebarOpen ? "open" : "collapsed"}`}
      >
        <div className="sidebar-header">
          <span className="sidebar-logo">{sidebarOpen ? "tapn" : "t"}</span>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? "◂" : "▸"}
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-link ${activePage === "overview" ? "active" : ""}`}
            onClick={() => setActivePage("overview")}
          >
            <span className="sidebar-icon">◉</span>
            {sidebarOpen && <span>overview</span>}
          </button>
          <button
            className={`sidebar-link ${activePage === "applications" ? "active" : ""}`}
            onClick={() => setActivePage("applications")}
          >
            <span className="sidebar-icon">◎</span>
            {sidebarOpen && <span>applications</span>}
          </button>
          <button
            className={`sidebar-link ${activePage === "agents" ? "active" : ""}`}
            onClick={() => setActivePage("agents")}
          >
            <span className="sidebar-icon">⬡</span>
            {sidebarOpen && <span>agents</span>}
          </button>
          <button
            className={`sidebar-link ${activePage === "pipeline" ? "active" : ""}`}
            onClick={() => setActivePage("pipeline")}
          >
            <span className="sidebar-icon">▹</span>
            {sidebarOpen && <span>pipeline</span>}
          </button>
          <button
            className={`sidebar-link ${activePage === "resumes" ? "active" : ""}`}
            onClick={() => setActivePage("resumes")}
          >
            <span className="sidebar-icon">◇</span>
            {sidebarOpen && <span>resumes</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={downloadUserMd}>
            <span className="sidebar-icon">↓</span>
            {sidebarOpen && <span>user.md</span>}
          </button>
          <button className="sidebar-link" onClick={handleLogout}>
            <span className="sidebar-icon">⏻</span>
            {sidebarOpen && <span>sign out</span>}
          </button>
        </div>
      </aside>

      {/* ═══ Main ═══ */}
      <main className="dashboard-main">
        {/* Top bar */}
        <header className="dashboard-topbar">
          <div className="topbar-left">
            <span className="topbar-breadcrumb">dashboard</span>
            <span className="topbar-sep">/</span>
            <span className="topbar-page">{activePage}</span>
          </div>
          <div className="topbar-right">
            <span className="topbar-status">
              <span className={`status-indicator ${gatewayOnline ? "running" : "offline"}`} />
              {gatewayOnline ? "gateway connected" : "gateway offline"}
            </span>
            <span className="topbar-user">{userName}</span>
          </div>
        </header>

        {/* Content */}
        <div className="dashboard-content">
          {/* Welcome */}
          <motion.section
            className="dashboard-welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="welcome-text">
              <h1 className="welcome-title">welcome back, {userName}</h1>
              <p className="welcome-sub">
                {gatewayOnline
                  ? "your agent fleet is connected and standing by."
                  : "start the openclaw gateway to connect your agents."}
              </p>
            </div>
            <button
              className="welcome-cta"
              onClick={initializePipeline}
              disabled={pipelineLoading || !gatewayOnline}
            >
              <span className={`cta-pulse ${gatewayOnline ? "" : "offline"}`} />
              {pipelineLoading ? "spawning..." : "initialize pipeline"}
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

          {/* Agent Fleet */}
          <motion.section
            className="dashboard-agents"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="section-header">
              <h2 className="section-title">agent fleet</h2>
              <span className="section-badge">6 agents</span>
            </div>
            <div className="agents-grid">
              {AGENTS.map((agent, i) => {
                const status = getAgentStatus(agent.id);
                const lastAction = getLastAction(agent.id);
                return (
                  <motion.div
                    key={agent.id}
                    className="agent-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                  >
                    <div className="agent-top">
                      <span className="agent-emoji">{agent.emoji}</span>
                      <span className={`agent-status-badge ${status}`}>
                        {status}
                      </span>
                    </div>
                    <h3 className="agent-name">{agent.name}</h3>
                    <span className="agent-role">{agent.role}</span>
                    <p className="agent-desc">{agent.description}</p>
                    <div className="agent-footer">
                      <span className="agent-last-run">
                        {lastAction
                          ? `${lastAction.action} · ${timeAgo(lastAction.created_at)}`
                          : "last run: —"}
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
                <span className="section-badge">
                  {activityEvents.length} events
                </span>
              )}
            </div>

            {activityEvents.length === 0 ? (
              <div className="activity-empty">
                <span className="activity-empty-icon">◌</span>
                <p>no activity yet. initialize the pipeline to begin.</p>
              </div>
            ) : (
              <div className="activity-feed">
                {activityEvents.slice(0, 20).map((event) => (
                  <div key={event.id} className="activity-row">
                    <span className={`activity-dot ${event.status === "error" ? "error" : ""}`} />
                    <span className="activity-agent">{event.agent_name}</span>
                    <span className="activity-action">{event.action}</span>
                    <span className="activity-time">
                      {timeAgo(event.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>

          {/* Applications Table (if any) */}
          {applications.length > 0 && (
            <motion.section
              className="dashboard-applications"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <div className="section-header">
                <h2 className="section-title">applications</h2>
                <span className="section-badge">
                  {applications.length} tracked
                </span>
              </div>
              <div className="applications-table">
                <div className="app-table-header">
                  <span>company</span>
                  <span>role</span>
                  <span>status</span>
                  <span>applied</span>
                </div>
                {applications.slice(0, 15).map((app) => (
                  <div key={app.id} className="app-table-row">
                    <span className="app-company">{app.company_name}</span>
                    <span className="app-role">{app.job_title}</span>
                    <span className={`app-status-badge ${app.status}`}>
                      {app.status}
                    </span>
                    <span className="app-date">
                      {timeAgo(app.applied_at)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      </main>
    </div>
  );
}
