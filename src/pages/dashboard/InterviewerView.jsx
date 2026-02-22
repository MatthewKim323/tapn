import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "../../lib/supabase";

/* ═══════════════════════════════════════════
   INTERVIEWER VIEW — ElevenLabs Voice AI
   Now powered by mock_interview_sessions table
   ═══════════════════════════════════════════ */

export default function InterviewerView({ applications, timeAgo }) {
  /* ── data state ── */
  const [sessions, setSessions] = useState([]);     // all from mock_interview_sessions
  const [ariaLogs, setAriaLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState(null);

  /* ── session state ── */
  const [activeSession, setActiveSession] = useState(null); // the row or quick-start obj
  const [transcript, setTranscript] = useState([]);
  const [sessionPhase, setSessionPhase] = useState("idle");
  // idle → connecting → active → ended
  const [micError, setMicError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const activeSessionRef = useRef(null);
  const transcriptRef = useRef([]);

  // keep refs in sync with state
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  /* ── quick start form ── */
  const [qsCompany, setQsCompany] = useState("");
  const [qsRole, setQsRole] = useState("");

  /* ── ElevenLabs conversation hook ── */
  const conversation = useConversation({
    onConnect: () => {
      setSessionPhase("active");
      setMicError(null);
      timerRef.current = setInterval(
        () => setElapsedTime((t) => t + 1),
        1000
      );
    },
    onDisconnect: () => {
      setSessionPhase("ended");
      clearInterval(timerRef.current);
      // mark session completed in Supabase (via ref for latest values)
      const sess = activeSessionRef.current;
      if (sess?.id && supabase) {
        supabase
          .from("mock_interview_sessions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            transcript: transcriptRef.current,
          })
          .eq("id", sess.id)
          .then(({ error }) => {
            if (error) console.warn("failed to mark session completed:", error);
          });
      }
    },
    onMessage: (message) => {
      setTranscript((prev) => [
        ...prev,
        {
          role: message.source === "ai" ? "ai" : "user",
          text: message.message,
          ts: Date.now(),
        },
      ]);
    },
    onError: (error) => {
      console.error("elevenlabs error:", error);
      setMicError(error?.message || "connection error");
      setSessionPhase("idle");
      clearInterval(timerRef.current);
    },
  });

  /* ── derived status label ── */
  const statusLabel = useMemo(() => {
    if (sessionPhase === "connecting") return "connecting...";
    if (sessionPhase === "ended") return "interview complete";
    if (sessionPhase !== "active") return "";
    if (conversation.isSpeaking) return "interviewer speaking";
    return "listening";
  }, [sessionPhase, conversation.isSpeaking]);

  /* ── auto-scroll transcript ── */
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  /* ── cleanup timer on unmount ── */
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  /* ── format mm:ss ── */
  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  /* ═══════════════════════════════════
     FETCH from mock_interview_sessions
     ═══════════════════════════════════ */
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    Promise.all([
      supabase
        .from("mock_interview_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("agent_logs")
        .select("*")
        .eq("agent_name", "aria")
        .order("created_at", { ascending: false })
        .limit(30),
    ]).then(([sessionsRes, logsRes]) => {
      if (!sessionsRes.error) setSessions(sessionsRes.data || []);
      if (!logsRes.error) setAriaLogs(logsRes.data || []);
      setLoading(false);
    });

    // real-time subscription on mock_interview_sessions
    const channel = supabase
      .channel("mock-sessions-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mock_interview_sessions" },
        (payload) => {
          setSessions((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((s) => s.id !== payload.old.id);
            }
            const idx = prev.findIndex((s) => s.id === payload.new.id);
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

    return () => supabase.removeChannel(channel);
  }, []);

  /* ── split sessions into ready / in_progress / completed ── */
  const readySessions = useMemo(
    () => sessions.filter((s) => s.status === "ready" || s.status === "in_progress"),
    [sessions]
  );

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === "completed"),
    [sessions]
  );

  const avgScore = useMemo(() => {
    const scored = completedSessions.filter((s) => s.overall_score);
    if (scored.length === 0) return null;
    return Math.round(
      scored.reduce((sum, s) => sum + Number(s.overall_score), 0) / scored.length
    );
  }, [completedSessions]);

  /* ── score color helper ── */
  function scoreColor(score) {
    if (!score) return "";
    const n = Number(score);
    // support both 0-10 and 0-100 scales
    const normalized = n <= 10 ? n * 10 : n;
    if (normalized >= 80) return "score-high";
    if (normalized >= 60) return "score-mid";
    return "score-low";
  }

  /* ═══════════════════════════════════
     START / END interview
     ═══════════════════════════════════ */

  const startInterview = useCallback(
    async (session) => {
      // session can be a mock_interview_sessions row or a quick-start object
      setActiveSession(session);
      setSessionPhase("connecting");
      setMicError(null);
      setTranscript([]);
      setElapsedTime(0);

      try {
        // mic permission
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // if this is a real DB row, mark it as in_progress
        if (session.id && supabase) {
          supabase
            .from("mock_interview_sessions")
            .update({ status: "in_progress" })
            .eq("id", session.id)
            .then(({ error }) => {
              if (error) console.warn("failed to update session status:", error);
            });
        }

        // build per-interview overrides from session data
        const company = session.company || session.company_name || "general practice";
        const role = session.job_title || "mock interview";
        const interviewer = session.interviewer_name || "Alex";
        const questions = session.questions_summary;

        let overrides = undefined;
        // only override if we have real session data (not a blank quick-start)
        if (session.company || session.interviewer_name) {
          let promptText = `You are ${interviewer}, a hiring manager at ${company}. You are conducting a mock interview for the ${role} position. Be professional, warm, and neutral — do not give feedback during the interview. Ask one question at a time and wait for the candidate to respond before moving on.`;
          if (questions && questions.length > 0) {
            const cats = questions.map(q => q.category || q.topic).join(", ");
            promptText += ` Cover these areas: ${cats}.`;
          }
          promptText += ` After all questions, ask if the candidate has any questions about the role, then close the interview professionally.`;

          overrides = {
            agent: {
              prompt: { prompt: promptText },
              firstMessage: `Hi, thanks for joining. I'm ${interviewer} from ${company}. I'll be conducting your interview for the ${role} position today. We'll go through a few questions — just relax and answer naturally. Ready to get started?`,
            },
          };
        }

        // try signed URL first (keeps API key server-side)
        let signedUrl = null;
        try {
          const res = await fetch("/api/interview/signed-url");
          if (res.ok) {
            const json = await res.json();
            signedUrl = json.signedUrl;
          }
        } catch {
          // signed-url endpoint may not be available
        }

        if (signedUrl) {
          await conversation.startSession({ signedUrl, overrides });
        } else {
          // fallback: use the agent_id from the session row, or env var
          const agentId =
            session.agent_id || import.meta.env.VITE_ELEVENLABS_AGENT_ID;
          if (!agentId)
            throw new Error("no agent_id found — check session or .env");
          await conversation.startSession({ agentId, overrides });
        }
      } catch (err) {
        console.error("failed to start interview:", err);
        setMicError(err.message || "failed to connect");
        setSessionPhase("idle");
        setActiveSession(null);
      }
    },
    [conversation]
  );

  const endInterview = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch {
      /* may already be ended */
    }
    setSessionPhase("ended");
    clearInterval(timerRef.current);

    // mark the session as completed in Supabase
    if (activeSession?.id && supabase) {
      supabase
        .from("mock_interview_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          transcript: transcript,
        })
        .eq("id", activeSession.id)
        .then(({ error }) => {
          if (error) console.warn("failed to mark session completed:", error);
        });
    }
  }, [conversation, activeSession, transcript]);

  const dismissSession = useCallback(() => {
    setActiveSession(null);
    setSessionPhase("idle");
    setTranscript([]);
    setElapsedTime(0);
  }, []);

  /* ═══════════════════════════════════
     RENDER
     ═══════════════════════════════════ */

  // normalize field names (DB rows use `company`, quick-start uses `company_name`)
  const displayCompany =
    activeSession?.company || activeSession?.company_name || "interview";
  const displayRole =
    activeSession?.job_title || "mock interview session";

  return (
    <div className="interviewer-view">
      {/* ── Header ── */}
      <motion.div
        className="view-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="view-title">mock interview</h1>
          <p className="view-subtitle">
            voice-powered interview prep — aria + elevenlabs
          </p>
        </div>
        <div className="resume-stats-row">
          <div className="mini-stat">
            <span className="mini-stat-value">{readySessions.length}</span>
            <span className="mini-stat-label">ready</span>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-value">{completedSessions.length}</span>
            <span className="mini-stat-label">completed</span>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-value">
              {avgScore !== null ? avgScore : "—"}
            </span>
            <span className="mini-stat-label">avg score</span>
          </div>
        </div>
      </motion.div>

      {/* ═══ QUICK START ═══ */}
      {!activeSession && (
        <motion.div
          className="iv-quickstart"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <div className="iv-quickstart-inner">
            <div className="iv-quickstart-text">
              <h2 className="iv-quickstart-title">start a mock interview</h2>
              <p className="iv-quickstart-desc">
                if aria prepped an interview, enter the company and role below.
                or leave blank for general practice.
              </p>
            </div>
            <div className="iv-quickstart-form">
              <div className="iv-quickstart-fields">
                <input
                  type="text"
                  className="iv-quickstart-input"
                  placeholder="company (e.g. TestCorp)"
                  value={qsCompany}
                  onChange={(e) => setQsCompany(e.target.value)}
                />
                <input
                  type="text"
                  className="iv-quickstart-input"
                  placeholder="role (e.g. Junior Data Analyst)"
                  value={qsRole}
                  onChange={(e) => setQsRole(e.target.value)}
                />
              </div>
              <button
                className="iv-quickstart-btn"
                onClick={() =>
                  startInterview({
                    company_name: qsCompany.trim() || "general practice",
                    job_title: qsRole.trim() || "mock interview session",
                  })
                }
              >
                <span className="iv-start-dot" />
                start interview
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ ACTIVE INTERVIEW SESSION ═══ */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            className="iv-session"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* ambient glow */}
            <div className="iv-session-glow" />

            {/* header */}
            <div className="iv-session-header">
              <div className="iv-session-meta">
                <h2 className="iv-session-company">{displayCompany}</h2>
                <span className="iv-session-role">{displayRole}</span>
                {activeSession?.interviewer_name && (
                  <span className="iv-session-interviewer">
                    interviewer: {activeSession.interviewer_name}
                  </span>
                )}
              </div>
              <div className="iv-session-indicators">
                <span className={`iv-status-chip ${sessionPhase}`}>
                  <span className="iv-status-dot" />
                  {statusLabel}
                </span>
                {sessionPhase === "active" && (
                  <span className="iv-timer">{fmtTime(elapsedTime)}</span>
                )}
              </div>
            </div>

            {/* question categories preview (if available from Aria) */}
            {activeSession?.questions_summary &&
              sessionPhase === "connecting" && (
                <div className="iv-questions-preview">
                  <span className="iv-questions-label">question categories</span>
                  <div className="iv-questions-tags">
                    {activeSession.questions_summary.map((q, i) => (
                      <span key={i} className="iv-question-tag">
                        {q.category || q.topic}
                        {q.count ? ` (${q.count})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* body */}
            <div className="iv-session-body">
              {/* ── CONNECTING ── */}
              {sessionPhase === "connecting" && (
                <div className="iv-connecting">
                  <div className="iv-rings">
                    <span className="iv-ring iv-ring-1" />
                    <span className="iv-ring iv-ring-2" />
                    <span className="iv-ring iv-ring-3" />
                  </div>
                  <p className="iv-connecting-text">
                    connecting to{" "}
                    {activeSession?.interviewer_name || "your interviewer"}...
                  </p>
                  {micError && (
                    <p className="iv-error">
                      <span className="iv-error-label">err</span> {micError}
                    </p>
                  )}
                </div>
              )}

              {/* ── ACTIVE ── */}
              {sessionPhase === "active" && (
                <div className="iv-active">
                  {/* voice visualizer */}
                  <div
                    className={`iv-visualizer ${conversation.isSpeaking ? "speaking" : "listening"}`}
                  >
                    {[...Array(24)].map((_, i) => (
                      <span
                        key={i}
                        className="iv-viz-bar"
                        style={{ animationDelay: `${i * 0.04}s` }}
                      />
                    ))}
                  </div>

                  {/* live transcript */}
                  <div className="iv-transcript">
                    {transcript.length === 0 ? (
                      <p className="iv-transcript-empty">
                        waiting for conversation to begin...
                      </p>
                    ) : (
                      transcript.map((entry, i) => (
                        <div
                          key={i}
                          className={`iv-transcript-entry ${entry.role}`}
                        >
                          <span className="iv-transcript-role">
                            {entry.role === "ai" ? "interviewer" : "you"}
                          </span>
                          <span className="iv-transcript-text">
                            {entry.text}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>

                  {/* controls */}
                  <div className="iv-controls">
                    <span className="iv-hint">
                      speak naturally — the ai interviewer is listening
                    </span>
                    <button className="iv-end-btn" onClick={endInterview}>
                      end interview
                    </button>
                  </div>
                </div>
              )}

              {/* ── ENDED ── */}
              {sessionPhase === "ended" && (
                <div className="iv-ended">
                  <div className="iv-ended-icon">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="iv-ended-title">interview complete</h3>
                  <p className="iv-ended-sub">
                    {fmtTime(elapsedTime)} · {transcript.length} exchanges
                  </p>

                  {/* final transcript preview */}
                  {transcript.length > 0 && (
                    <div className="iv-transcript iv-transcript-final">
                      {transcript.map((entry, i) => (
                        <div
                          key={i}
                          className={`iv-transcript-entry ${entry.role}`}
                        >
                          <span className="iv-transcript-role">
                            {entry.role === "ai" ? "interviewer" : "you"}
                          </span>
                          <span className="iv-transcript-text">
                            {entry.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button className="iv-dismiss-btn" onClick={dismissSession}>
                    close
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* mic error (when no session active) */}
      {micError && !activeSession && (
        <motion.div
          className="iv-mic-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="iv-error-label">mic error</span> {micError}
        </motion.div>
      )}

      {/* ═══ ARIA-PREPPED INTERVIEWS (ready) ═══ */}
      <motion.section
        className="iv-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="section-header">
          <h2 className="section-title">prepped by aria</h2>
          {readySessions.length > 0 && (
            <span className="section-badge">
              {readySessions.length} ready
            </span>
          )}
        </div>

        {loading ? (
          <div className="panel-loading">
            <span className="loading-dot" /> loading...
          </div>
        ) : readySessions.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">◈</span>
            <p>
              no interviews prepped yet. when aria configures an elevenlabs
              session, it'll appear here automatically.
            </p>
          </div>
        ) : (
          <div className="iv-ready-grid">
            {readySessions.map((session, i) => (
              <motion.div
                key={session.id}
                className="iv-ready-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div className="iv-ready-top">
                  <span className={`iv-ready-badge ${session.status === "in_progress" ? "iv-badge-retry" : ""}`}>
                    {session.status === "in_progress" ? "retry" : "ready"}
                  </span>
                  {session.estimated_duration_minutes && (
                    <span className="iv-ready-duration">
                      ~{session.estimated_duration_minutes} min
                    </span>
                  )}
                </div>
                <h3 className="iv-ready-company">{session.company}</h3>
                <span className="iv-ready-role">{session.job_title}</span>

                {/* interviewer name */}
                {session.interviewer_name && (
                  <span className="iv-ready-interviewer">
                    interviewer: {session.interviewer_name}
                  </span>
                )}

                {/* interview date */}
                {session.interview_date && (
                  <span className="iv-ready-date">
                    {new Date(session.interview_date).toLocaleDateString(
                      "en-US",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                  </span>
                )}

                {/* question categories */}
                {session.questions_summary && (
                  <div className="iv-ready-questions">
                    {session.questions_summary.map((q, j) => (
                      <span key={j} className="iv-question-chip">
                        {q.category || q.topic}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  className="iv-start-btn"
                  onClick={() => startInterview(session)}
                  disabled={activeSession !== null}
                >
                  <span className="iv-start-dot" />
                  {session.status === "in_progress" ? "retry" : "start"} {session.company} interview
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>

      {/* ═══ COMPLETED INTERVIEWS ═══ */}
      <motion.section
        className="iv-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="section-header">
          <h2 className="section-title">completed interviews</h2>
          {completedSessions.length > 0 && (
            <span className="section-badge">
              {completedSessions.length} debriefs
            </span>
          )}
        </div>

        {loading ? (
          <div className="panel-loading">
            <span className="loading-dot" /> loading...
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-icon">◌</span>
            <p>no completed mock interviews yet.</p>
          </div>
        ) : (
          <div className="iv-completed-grid">
            {completedSessions.map((interview, i) => (
              <motion.div
                key={interview.id}
                className={`iv-completed-card ${selectedInterview?.id === interview.id ? "selected" : ""}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                onClick={() =>
                  setSelectedInterview(
                    selectedInterview?.id === interview.id ? null : interview
                  )
                }
              >
                <div className="iv-completed-header">
                  <div>
                    <h3 className="iv-completed-company">
                      {interview.company}
                    </h3>
                    <span className="iv-completed-role">
                      {interview.job_title}
                    </span>
                  </div>
                  {interview.overall_score && (
                    <span
                      className={`iv-score ${scoreColor(interview.overall_score)}`}
                    >
                      {interview.overall_score}
                    </span>
                  )}
                </div>

                <div className="iv-completed-tags">
                  {interview.strongest_area && (
                    <span className="iv-tag strength">
                      {interview.strongest_area}
                    </span>
                  )}
                  {interview.weakest_area && (
                    <span className="iv-tag weakness">
                      {interview.weakest_area}
                    </span>
                  )}
                </div>

                <div className="iv-completed-bottom">
                  <span className="iv-completed-date">
                    {timeAgo(interview.completed_at || interview.created_at)}
                  </span>
                  <button
                    className="iv-retry-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      // reset to ready + re-queue
                      if (interview.id && supabase) {
                        supabase
                          .from("mock_interview_sessions")
                          .update({ status: "ready", completed_at: null })
                          .eq("id", interview.id)
                          .then(({ error }) => {
                            if (error) console.warn("failed to reset session:", error);
                          });
                      }
                    }}
                  >
                    retry
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>

      {/* ═══ SELECTED INTERVIEW DEBRIEF ═══ */}
      <AnimatePresence>
        {selectedInterview && (
          <motion.div
            className="iv-debrief-panel"
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="iv-debrief-header">
              <div>
                <h3 className="iv-debrief-company">
                  {selectedInterview.company}
                </h3>
                <span className="iv-debrief-role">
                  {selectedInterview.job_title}
                </span>
              </div>
              <button
                className="iv-debrief-close"
                onClick={() => setSelectedInterview(null)}
              >
                x
              </button>
            </div>

            <div className="iv-debrief-stats">
              <div className="iv-debrief-stat">
                <span
                  className={`iv-debrief-stat-value ${scoreColor(selectedInterview.overall_score)}`}
                >
                  {selectedInterview.overall_score
                    ? `${selectedInterview.overall_score}`
                    : "pending"}
                </span>
                <span className="iv-debrief-stat-label">overall score</span>
              </div>
              <div className="iv-debrief-stat">
                <span className="iv-debrief-stat-value">
                  {selectedInterview.strongest_area || "—"}
                </span>
                <span className="iv-debrief-stat-label">strongest area</span>
              </div>
              <div className="iv-debrief-stat">
                <span className="iv-debrief-stat-value">
                  {selectedInterview.weakest_area || "—"}
                </span>
                <span className="iv-debrief-stat-label">weakest area</span>
              </div>
              <div className="iv-debrief-stat">
                <span className="iv-debrief-stat-value">
                  {selectedInterview.recommendation || "—"}
                </span>
                <span className="iv-debrief-stat-label">recommendation</span>
              </div>
            </div>

            {selectedInterview.debrief && (
              <div className="iv-debrief-body">
                <span className="iv-debrief-label">aria's debrief</span>
                <pre className="iv-debrief-text">
                  {selectedInterview.debrief}
                </pre>
              </div>
            )}

            {selectedInterview.transcript && (
              <div className="iv-debrief-body">
                <span className="iv-debrief-label">transcript</span>
                <div className="iv-transcript iv-transcript-final">
                  {Array.isArray(selectedInterview.transcript) ? (
                    selectedInterview.transcript.map((entry, i) => (
                      <div
                        key={i}
                        className={`iv-transcript-entry ${entry.role || ""}`}
                      >
                        <span className="iv-transcript-role">
                          {entry.role === "ai" || entry.role === "agent"
                            ? "interviewer"
                            : "you"}
                        </span>
                        <span className="iv-transcript-text">
                          {entry.message || entry.text}
                        </span>
                      </div>
                    ))
                  ) : (
                    <pre className="iv-debrief-text">
                      {JSON.stringify(selectedInterview.transcript, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ARIA ACTIVITY ═══ */}
      <motion.section
        className="iv-section"
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
                <span
                  className={`activity-dot ${log.status === "error" ? "error" : ""}`}
                />
                <span className="activity-agent">aria</span>
                <span className="activity-action">{log.action}</span>
                <span className="activity-time">
                  {timeAgo(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  );
}
