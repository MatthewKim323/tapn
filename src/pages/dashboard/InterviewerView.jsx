import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";

export default function InterviewerView({ applications, timeAgo }) {
  const [mockInterviews, setMockInterviews] = useState([]);
  const [readyApps, setReadyApps] = useState([]);
  const [ariaLogs, setAriaLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [activeSession, setActiveSession] = useState(null); // For future ElevenLabs integration
  const [sessionStatus, setSessionStatus] = useState("idle"); // idle | loading | active | ended

  // Fetch mock interview data
  useEffect(() => {
    if (!supabase) return;

    Promise.all([
      // Completed mock interviews
      supabase
        .from("mock_interviews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      // Aria's activity logs
      supabase
        .from("agent_logs")
        .select("*")
        .eq("agent_name", "aria")
        .order("created_at", { ascending: false })
        .limit(30),
    ]).then(([interviewsRes, logsRes]) => {
      if (!interviewsRes.error) setMockInterviews(interviewsRes.data || []);
      if (!logsRes.error) setAriaLogs(logsRes.data || []);
      setLoading(false);
    });

    // Live subscription for new interviews
    const channel = supabase
      .channel("interviews")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mock_interviews" },
        (payload) => {
          setMockInterviews((prev) => {
            const idx = prev.findIndex((m) => m.id === payload.new.id);
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

  // Apps ready for mock interview
  useEffect(() => {
    const ready = applications.filter(
      (a) => a.mock_interview_ready && !a.mock_interview_score
    );
    setReadyApps(ready);
  }, [applications]);

  // Score color helper
  function scoreColor(score) {
    if (!score) return "";
    if (score >= 80) return "score-high";
    if (score >= 60) return "score-mid";
    return "score-low";
  }

  // Placeholder for starting an ElevenLabs session
  const startMockInterview = useCallback(async (app) => {
    setActiveSession(app);
    setSessionStatus("loading");

    // In a real integration, this would:
    // 1. Fetch Aria's config: /api/interviews/config/{company}
    // 2. Request microphone access
    // 3. Start ElevenLabs conversation session
    //
    // For now, show the UI state
    setTimeout(() => {
      setSessionStatus("active");
    }, 1500);
  }, []);

  const endMockInterview = useCallback(() => {
    setSessionStatus("ended");
    setTimeout(() => {
      setActiveSession(null);
      setSessionStatus("idle");
    }, 3000);
  }, []);

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
          <h1 className="view-title">interviewer</h1>
          <p className="view-subtitle">
            ai mock interviews powered by aria + elevenlabs
          </p>
        </div>
        <div className="resume-stats-row">
          <div className="mini-stat">
            <span className="mini-stat-value">{readyApps.length}</span>
            <span className="mini-stat-label">ready</span>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-value">{mockInterviews.length}</span>
            <span className="mini-stat-label">completed</span>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-value">
              {mockInterviews.length > 0
                ? Math.round(
                    mockInterviews.reduce((sum, m) => sum + (m.overall_score || 0), 0) /
                      mockInterviews.filter((m) => m.overall_score).length || 0
                  )
                : "—"}
            </span>
            <span className="mini-stat-label">avg score</span>
          </div>
        </div>
      </motion.div>

      {/* Active Interview Session */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            className="interview-session"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <div className="session-header">
              <div>
                <h2 className="session-title">
                  mock interview: {activeSession.company_name}
                </h2>
                <span className="session-role">{activeSession.job_title}</span>
              </div>
              <span className={`session-status ${sessionStatus}`}>
                {sessionStatus === "loading" && "configuring interviewer..."}
                {sessionStatus === "active" && "🎙️ interview in progress"}
                {sessionStatus === "ended" && "generating debrief..."}
              </span>
            </div>

            <div className="session-body">
              {sessionStatus === "loading" && (
                <div className="session-loading">
                  <div className="voice-rings">
                    <span className="ring ring-1" />
                    <span className="ring ring-2" />
                    <span className="ring ring-3" />
                  </div>
                  <p>aria is preparing your interviewer...</p>
                </div>
              )}

              {sessionStatus === "active" && (
                <div className="session-active">
                  <div className="voice-visualizer">
                    {[...Array(12)].map((_, i) => (
                      <span
                        key={i}
                        className="viz-bar"
                        style={{
                          animationDelay: `${i * 0.08}s`,
                          height: `${20 + Math.random() * 40}px`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="session-hint">speak naturally — the ai interviewer is listening</p>
                  <button className="end-interview-btn" onClick={endMockInterview}>
                    end interview
                  </button>
                </div>
              )}

              {sessionStatus === "ended" && (
                <div className="session-ended">
                  <span className="ended-icon">✓</span>
                  <p>interview complete. aria is analyzing your performance...</p>
                </div>
              )}
            </div>

            {sessionStatus === "idle" && (
              <button className="detail-close" onClick={() => setActiveSession(null)}>
                ✕
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready for Interview */}
      <motion.div
        className="interview-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="section-header">
          <h2 className="section-title">ready for mock interview</h2>
          {readyApps.length > 0 && (
            <span className="section-badge">{readyApps.length} available</span>
          )}
        </div>

        {readyApps.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">🎤</span>
            <p>
              no interviews ready yet. aria configures mock interviews after
              echo submits applications.
            </p>
          </div>
        ) : (
          <div className="interview-ready-grid">
            {readyApps.map((app, i) => (
              <motion.div
                key={app.id}
                className="interview-ready-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div className="ready-card-top">
                  <span className="ready-emoji">🎤</span>
                  <span className="ready-badge">ready</span>
                </div>
                <h3 className="ready-company">{app.company_name}</h3>
                <span className="ready-role">{app.job_title}</span>
                <button
                  className="start-interview-btn"
                  onClick={() => startMockInterview(app)}
                  disabled={activeSession !== null}
                >
                  <span className="btn-mic">◉</span>
                  start mock interview
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Completed Interviews */}
      <motion.div
        className="interview-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="section-header">
          <h2 className="section-title">completed interviews</h2>
          {mockInterviews.length > 0 && (
            <span className="section-badge">{mockInterviews.length} debriefs</span>
          )}
        </div>

        {loading ? (
          <div className="panel-loading">
            <span className="loading-dot" /> loading...
          </div>
        ) : mockInterviews.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">◌</span>
            <p>no completed mock interviews yet.</p>
          </div>
        ) : (
          <div className="interviews-list">
            {mockInterviews.map((interview, i) => (
              <motion.div
                key={interview.id}
                className={`interview-card ${selectedInterview?.id === interview.id ? "selected" : ""}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                onClick={() =>
                  setSelectedInterview(
                    selectedInterview?.id === interview.id ? null : interview
                  )
                }
              >
                <div className="interview-card-header">
                  <div>
                    <h3 className="interview-company">{interview.company}</h3>
                    <span className="interview-role">{interview.job_title}</span>
                  </div>
                  {interview.overall_score && (
                    <span className={`interview-score ${scoreColor(interview.overall_score)}`}>
                      {interview.overall_score}%
                    </span>
                  )}
                </div>

                <div className="interview-meta">
                  {interview.strongest_area && (
                    <span className="interview-tag strength">
                      ↑ {interview.strongest_area}
                    </span>
                  )}
                  {interview.weakest_area && (
                    <span className="interview-tag weakness">
                      ↓ {interview.weakest_area}
                    </span>
                  )}
                </div>

                <span className="interview-date">{timeAgo(interview.created_at)}</span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Selected Interview Debrief */}
      <AnimatePresence>
        {selectedInterview && (
          <motion.div
            className="app-detail-panel"
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="detail-header">
              <div>
                <h3 className="detail-company">{selectedInterview.company}</h3>
                <span className="detail-role">{selectedInterview.job_title}</span>
              </div>
              <button
                className="detail-close"
                onClick={() => setSelectedInterview(null)}
              >
                ✕
              </button>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">overall score</span>
                <span
                  className={`detail-value score-lg ${scoreColor(selectedInterview.overall_score)}`}
                >
                  {selectedInterview.overall_score
                    ? `${selectedInterview.overall_score}%`
                    : "pending"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">strongest area</span>
                <span className="detail-value">
                  {selectedInterview.strongest_area || "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">weakest area</span>
                <span className="detail-value">
                  {selectedInterview.weakest_area || "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">recommendation</span>
                <span className="detail-value">
                  {selectedInterview.recommendation || "—"}
                </span>
              </div>
            </div>

            {selectedInterview.debrief && (
              <div className="debrief-section">
                <span className="detail-label">aria's debrief</span>
                <pre className="debrief-text">{selectedInterview.debrief}</pre>
              </div>
            )}

            {selectedInterview.transcript && (
              <div className="transcript-section">
                <span className="detail-label">transcript</span>
                <div className="transcript-body">
                  {Array.isArray(selectedInterview.transcript)
                    ? selectedInterview.transcript.map((entry, i) => (
                        <div key={i} className={`transcript-entry ${entry.role || ""}`}>
                          <span className="transcript-role">
                            {entry.role === "agent" ? "interviewer" : "you"}
                          </span>
                          <span className="transcript-text">{entry.message || entry.text}</span>
                        </div>
                      ))
                    : (
                        <pre className="detail-jd-text">
                          {JSON.stringify(selectedInterview.transcript, null, 2)}
                        </pre>
                      )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aria Activity */}
      <motion.div
        className="interview-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="section-header">
          <h2 className="section-title">aria activity</h2>
        </div>
        {ariaLogs.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">◌</span>
            <p>no aria activity yet.</p>
          </div>
        ) : (
          <div className="activity-feed">
            {ariaLogs.slice(0, 15).map((log) => (
              <div key={log.id} className="activity-row">
                <span className={`activity-dot ${log.status === "error" ? "error" : ""}`} />
                <span className="activity-agent">aria</span>
                <span className="activity-action">{log.action}</span>
                <span className="activity-time">{timeAgo(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}
