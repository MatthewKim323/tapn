import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { useAgentActivity } from "../hooks/useAgentActivity";
import { useApplications } from "../hooks/useApplications";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { useDashboardStats } from "../hooks/useDashboardStats";
import FaultyTerminal from "../components/FaultyTerminal";

import OverviewView from "./dashboard/OverviewView";
import ApplicationsView from "./dashboard/ApplicationsView";
import AgentsView from "./dashboard/AgentsView";
import PipelineView from "./dashboard/PipelineView";
import ResumesView from "./dashboard/ResumesView";
import InterviewerView from "./dashboard/InterviewerView";

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

const NAV_ITEMS = [
  { key: "overview", icon: "◉", label: "overview" },
  { key: "applications", icon: "◎", label: "applications" },
  { key: "agents", icon: "⬡", label: "agents" },
  { key: "pipeline", icon: "▹", label: "pipeline" },
  { key: "resumes", icon: "◇", label: "resumes" },
  { key: "interviewer", icon: "🎤", label: "interviewer" },
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
  const [agentDetailId, setAgentDetailId] = useState(null);

  // Live data hooks
  const { events: activityEvents } = useAgentActivity();
  const { applications } = useApplications();
  const {
    getAgentStatus,
    getLastAction,
    gatewayOnline,
    refresh: refreshAgents,
  } = useAgentStatus();
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
      const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/gateway`;
      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Gateway connection timed out"));
        }, 10000);

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "session.create",
              params: {
                agentId: "main",
                payload: {
                  kind: "agentTurn",
                  message:
                    "Run the nightly pipeline — discover positions, tailor resumes, submit applications, and queue interview prep.",
                },
              },
              id: crypto.randomUUID(),
            })
          );
        };

        ws.onmessage = (event) => {
          clearTimeout(timeout);
          console.log("Gateway response:", event.data);
          ws.close();
          resolve();
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          resolve();
        };
      });

      refreshAgents();
    } catch (err) {
      console.error("Failed to initialize pipeline:", err);
    } finally {
      setPipelineLoading(false);
    }
  }, [refreshAgents]);

  // Navigate between views — supports passing an agent ID for deep-linking
  function handleNavigate(page, agentId) {
    setActivePage(page);
    if (page === "agents" && agentId) {
      setAgentDetailId(agentId);
    } else {
      setAgentDetailId(null);
    }
  }

  const userName =
    profile?.full_name || session?.user?.email?.split("@")[0] || "operator";

  // Render active view
  function renderView() {
    switch (activePage) {
      case "overview":
        return (
          <OverviewView
            userName={userName}
            gatewayOnline={gatewayOnline}
            pipelineLoading={pipelineLoading}
            initializePipeline={initializePipeline}
            stats={stats}
            agents={AGENTS}
            getAgentStatus={getAgentStatus}
            getLastAction={getLastAction}
            activityEvents={activityEvents}
            applications={applications}
            onNavigate={handleNavigate}
            timeAgo={timeAgo}
          />
        );
      case "applications":
        return (
          <ApplicationsView applications={applications} timeAgo={timeAgo} />
        );
      case "agents":
        return (
          <AgentsView
            agents={AGENTS}
            getAgentStatus={getAgentStatus}
            getLastAction={getLastAction}
            gatewayOnline={gatewayOnline}
            timeAgo={timeAgo}
            initialAgentId={agentDetailId}
          />
        );
      case "pipeline":
        return (
          <PipelineView
            gatewayOnline={gatewayOnline}
            pipelineLoading={pipelineLoading}
            initializePipeline={initializePipeline}
            activityEvents={activityEvents}
            timeAgo={timeAgo}
          />
        );
      case "resumes":
        return (
          <ResumesView applications={applications} timeAgo={timeAgo} />
        );
      case "interviewer":
        return (
          <InterviewerView applications={applications} timeAgo={timeAgo} />
        );
      default:
        return null;
    }
  }

  return (
    <div className="dashboard-page">
      {/* FaultyTerminal WebGL background */}
      <div className="dashboard-terminal-bg">
        <FaultyTerminal
          scale={1.5}
          gridMul={[2, 1]}
          digitSize={1.2}
          timeScale={0.3}
          scanlineIntensity={0.3}
          glitchAmount={0.8}
          flickerAmount={0.6}
          noiseAmp={0.6}
          curvature={0.05}
          tint="#FF6B6B"
          mouseReact
          mouseStrength={0.3}
          pageLoadAnimation
          brightness={0.2}
        />
      </div>

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
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-link ${activePage === item.key ? "active" : ""}`}
              onClick={() => handleNavigate(item.key)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
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
              <span
                className={`status-indicator ${gatewayOnline ? "running" : "offline"}`}
              />
              {gatewayOnline ? "gateway connected" : "gateway offline"}
            </span>
            <span className="topbar-user">{userName}</span>
          </div>
        </header>

        {/* Content */}
        <div className="dashboard-content">{renderView()}</div>
      </main>
    </div>
  );
}
