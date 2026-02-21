import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";

export default function AgentsView({
  agents,
  getAgentStatus,
  getLastAction,
  gatewayOnline,
  timeAgo,
  initialAgentId,
}) {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentLogs, setAgentLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // If coming from overview with a specific agent pre-selected
  useEffect(() => {
    if (initialAgentId) {
      const agent = agents.find((a) => a.id === initialAgentId);
      if (agent) setSelectedAgent(agent);
    }
  }, [initialAgentId, agents]);

  // Fetch logs when an agent is selected
  useEffect(() => {
    if (!selectedAgent || !supabase) {
      setAgentLogs([]);
      return;
    }

    setLogsLoading(true);
    supabase
      .from("agent_logs")
      .select("*")
      .eq("agent_name", selectedAgent.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) setAgentLogs(data);
        setLogsLoading(false);
      });

    // Live subscription for this agent
    const channel = supabase
      .channel(`agent-detail-${selectedAgent.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_logs",
          filter: `agent_name=eq.${selectedAgent.id}`,
        },
        (payload) => {
          setAgentLogs((prev) => [payload.new, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedAgent]);

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
          <h1 className="view-title">agent fleet</h1>
          <p className="view-subtitle">
            {gatewayOnline ? "gateway connected — 6 agents standing by" : "gateway offline"}
          </p>
        </div>
        <div className="fleet-status-row">
          <span className={`fleet-indicator ${gatewayOnline ? "online" : "offline"}`} />
          <span className="fleet-label">
            {gatewayOnline ? "all systems nominal" : "agents unavailable"}
          </span>
        </div>
      </motion.div>

      <div className="agents-layout">
        {/* Agent Grid */}
        <motion.div
          className="agents-grid-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {agents.map((agent, i) => {
            const status = getAgentStatus(agent.id);
            const lastAction = getLastAction(agent.id);
            const isSelected = selectedAgent?.id === agent.id;

            return (
              <motion.div
                key={agent.id}
                className={`agent-card-full ${isSelected ? "selected" : ""}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                onClick={() => setSelectedAgent(isSelected ? null : agent)}
              >
                <div className="agent-card-header">
                  <div className="agent-identity">
                    <span className="agent-emoji-lg">{agent.emoji}</span>
                    <div>
                      <h3 className="agent-name-lg">{agent.name}</h3>
                      <span className="agent-role-sm">{agent.role}</span>
                    </div>
                  </div>
                  <span className={`agent-status-badge ${status}`}>{status}</span>
                </div>

                <p className="agent-desc">{agent.description}</p>

                <div className="agent-meta-row">
                  <div className="agent-meta">
                    <span className="meta-label">gateway id</span>
                    <span className="meta-value">{agent.gatewayId}</span>
                  </div>
                  <div className="agent-meta">
                    <span className="meta-label">last action</span>
                    <span className="meta-value">
                      {lastAction ? lastAction.action : "—"}
                    </span>
                  </div>
                  <div className="agent-meta">
                    <span className="meta-label">last seen</span>
                    <span className="meta-value">
                      {lastAction ? timeAgo(lastAction.created_at) : "never"}
                    </span>
                  </div>
                </div>

                <div className="agent-card-arrow">
                  {isSelected ? "▾" : "▸"} {isSelected ? "hide logs" : "view logs"}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Agent Detail Panel */}
        <AnimatePresence>
          {selectedAgent && (
            <motion.div
              className="agent-detail-panel"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.3 }}
            >
              <div className="detail-panel-header">
                <div className="detail-panel-identity">
                  <span className="agent-emoji-xl">{selectedAgent.emoji}</span>
                  <div>
                    <h2 className="detail-panel-name">{selectedAgent.name}</h2>
                    <span className="detail-panel-role">{selectedAgent.role}</span>
                  </div>
                </div>
                <button
                  className="detail-close"
                  onClick={() => setSelectedAgent(null)}
                >
                  ✕
                </button>
              </div>

              <div className="detail-panel-desc">
                <p>{selectedAgent.description}</p>
              </div>

              <div className="detail-panel-stats">
                <div className="panel-stat">
                  <span className="panel-stat-value">{agentLogs.length}</span>
                  <span className="panel-stat-label">total logs</span>
                </div>
                <div className="panel-stat">
                  <span className="panel-stat-value">
                    {agentLogs.filter((l) => l.status === "error").length}
                  </span>
                  <span className="panel-stat-label">errors</span>
                </div>
                <div className="panel-stat">
                  <span className="panel-stat-value">
                    {agentLogs.filter((l) => l.status === "success").length}
                  </span>
                  <span className="panel-stat-label">success</span>
                </div>
              </div>

              {/* Activity Log */}
              <div className="detail-panel-logs">
                <h3 className="panel-section-title">activity log</h3>
                {logsLoading ? (
                  <div className="panel-loading">
                    <span className="loading-dot" />
                    loading...
                  </div>
                ) : agentLogs.length === 0 ? (
                  <div className="panel-empty">
                    <span className="panel-empty-icon">◌</span>
                    <p>no activity recorded yet</p>
                  </div>
                ) : (
                  <div className="panel-log-list">
                    {agentLogs.map((log) => (
                      <div key={log.id} className="panel-log-entry">
                        <div className="log-entry-header">
                          <span className={`log-dot ${log.status === "error" ? "error" : ""}`} />
                          <span className="log-action">{log.action}</span>
                          <span className={`log-status ${log.status}`}>{log.status}</span>
                          <span className="log-time">{timeAgo(log.created_at)}</span>
                        </div>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <pre className="log-details">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
