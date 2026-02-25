import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "../../lib/supabase";

/* ═══════════════════════════════════════════
   INTERVIEWER VIEW — ElevenLabs Voice AI
   Multi-tenant: per-user sessions + shared library
   ═══════════════════════════════════════════ */

export default function InterviewerView({ applications, timeAgo, session }) {
  const userId = session?.user?.id;

  /* ── data state ── */
  const [sessions, setSessions] = useState([]);       // user's own mock_interview_sessions
  const [library, setLibrary] = useState([]);          // shared interview_library
  const [ariaLogs, setAriaLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState(null);

  /* ── tab state ── */
  const [activeTab, setActiveTab] = useState("my"); // "my" | "library"

  /* ── session state ── */
  const [activeSession, setActiveSession] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [sessionPhase, setSessionPhase] = useState("idle");
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
            // Auto-publish to library on completion
            if (sess.company || sess.job_title) {
              autoPublishToLibrary(sess);
            }
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

  /* ── auto-publish completed interview to library ── */
  async function autoPublishToLibrary(sess) {
    if (!supabase || !userId) return;
    const company = sess.company || "general practice";
    const jobTitle = sess.job_title || "mock interview";

    // Check if a library entry already exists for this company+role
    const { data: existing } = await supabase
      .from("interview_library")
      .select("id")
      .eq("company", company)
      .eq("job_title", jobTitle)
      .limit(1);

    if (existing && existing.length > 0) {
      // Already in library — increment practiced count
      await supabase.rpc("increment_library_practiced", { lib_id: existing[0].id });
      return;
    }

    // Publish new library entry
    await supabase.from("interview_library").insert({
      created_by: userId,
      company,
      job_title: jobTitle,
      interviewer_name: sess.interviewer_name || "Alex",
      interviewer_persona: sess.interviewer_persona || null,
      estimated_duration_minutes: sess.estimated_duration_minutes || 25,
      questions_summary: sess.questions_summary || null,
      question_categories: sess.questions_summary
        ? sess.questions_summary.map((q) => q.category || q.topic)
        : null,
      difficulty: "medium",
      agent_id: sess.agent_id || null,
    });
  }

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
     FETCH user's own sessions + aria logs
     Explicitly filtered by user_id
     ═══════════════════════════════════ */
  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return; }

    Promise.all([
      supabase
        .from("mock_interview_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("agent_logs")
        .select("*")
        .eq("user_id", userId)
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
          // Only process events for this user
          if (payload.new?.user_id && payload.new.user_id !== userId) return;
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
  }, [userId]);

  /* ═══════════════════════════════════
     FETCH shared interview library
     (visible to all authenticated users)
     ═══════════════════════════════════ */
  useEffect(() => {
    if (!supabase) { setLibraryLoading(false); return; }

    supabase
      .from("interview_library")
      .select("*")
      .order("times_practiced", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!error && data) setLibrary(data);
        setLibraryLoading(false);
      });

    // live subscription for new library entries
    const channel = supabase
      .channel("library-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "interview_library" },
        (payload) => {
          setLibrary((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((t) => t.id !== payload.old.id);
            }
            const idx = prev.findIndex((t) => t.id === payload.new.id);
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
    const normalized = n <= 10 ? n * 10 : n;
    if (normalized >= 80) return "score-high";
    if (normalized >= 60) return "score-mid";
    return "score-low";
  }

  /* ═══════════════════════════════════
     START interview from library template
     Creates a personal session row first
     ═══════════════════════════════════ */
  const practiceFromLibrary = useCallback(
    async (template) => {
      if (!supabase || !userId) return;

      // Create a personal mock_interview_sessions row linked to the library template
      const { data: newSession, error } = await supabase
        .from("mock_interview_sessions")
        .insert({
          user_id: userId,
          library_id: template.id,
          agent_id: template.agent_id || import.meta.env.VITE_ELEVENLABS_AGENT_ID,
          company: template.company,
          job_title: template.job_title,
          interviewer_name: template.interviewer_name,
          estimated_duration_minutes: template.estimated_duration_minutes,
          questions_summary: template.questions_summary,
          status: "ready",
        })
        .select()
        .single();

      if (error) {
        console.error("failed to create session from library:", error);
        return;
      }

      // Increment practiced count
      await supabase.rpc("increment_library_practiced", { lib_id: template.id });

      // Start the interview with the newly created session
      startInterview(newSession);
    },
    [userId]
  );

  /* ═══════════════════════════════════
     START / END interview
     ═══════════════════════════════════ */
  const startInterview = useCallback(
    async (interviewSession) => {
      setActiveSession(interviewSession);
      setSessionPhase("connecting");
      setMicError(null);
      setTranscript([]);
      setElapsedTime(0);

      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // If this is a real DB row, mark it as in_progress
        if (interviewSession.id && supabase) {
          supabase
            .from("mock_interview_sessions")
            .update({ status: "in_progress" })
            .eq("id", interviewSession.id)
            .then(({ error }) => {
              if (error) console.warn("failed to update session status:", error);
            });
        }

        // build per-interview overrides from session data
        const company = interviewSession.company || interviewSession.company_name || "general practice";
        const role = interviewSession.job_title || "mock interview";
        const interviewer = interviewSession.interviewer_name || "Alex";
        const questions = interviewSession.questions_summary;

        let overrides = undefined;
        if (interviewSession.company || interviewSession.interviewer_name) {
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

        // try signed URL first
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
          const agentId =
            interviewSession.agent_id || import.meta.env.VITE_ELEVENLABS_AGENT_ID;
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

  /* ── quick-start: create a session row then start ── */
  const quickStart = useCallback(async () => {
    const company = qsCompany.trim() || "general practice";
    const role = qsRole.trim() || "mock interview session";

    if (!supabase || !userId) {
      // Fallback: in-memory session (no DB)
      startInterview({ company_name: company, job_title: role });
      return;
    }

    // Insert a real row so it shows in history
    const { data: newSession, error } = await supabase
      .from("mock_interview_sessions")
      .insert({
        user_id: userId,
        company,
        job_title: role,
        status: "ready",
        agent_id: import.meta.env.VITE_ELEVENLABS_AGENT_ID,
      })
      .select()
      .single();

    if (error) {
      console.error("failed to create quick-start session:", error);
      startInterview({ company_name: company, job_title: role });
      return;
    }

    startInterview(newSession);
  }, [qsCompany, qsRole, userId, startInterview]);

  const endInterview = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch {
      /* may already be ended */
    }
    setSessionPhase("ended");
    clearInterval(timerRef.current);

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
          if (activeSession.company || activeSession.job_title) {
            autoPublishToLibrary(activeSession);
          }
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
            <span className="mini-stat-value">{library.length}</span>
            <span className="mini-stat-label">in library</span>
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
                enter company + role for a targeted session, or leave blank for general practice.
                completed interviews auto-publish to the shared library.
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
                onClick={quickStart}
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
            <div className="iv-session-glow" />

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

            <div className="iv-session-body">
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

              {sessionPhase === "active" && (
                <div className="iv-active">
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

      {/* mic error banner */}
      {micError && !activeSession && (
        <motion.div
          className="iv-mic-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="iv-error-label">mic error</span> {micError}
        </motion.div>
      )}

      {/* ═══ TAB SWITCHER: My Interviews / Library ═══ */}
      <motion.div
        className="iv-tabs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <button
          className={`iv-tab ${activeTab === "my" ? "active" : ""}`}
          onClick={() => setActiveTab("my")}
        >
          my interviews
        </button>
        <button
          className={`iv-tab ${activeTab === "library" ? "active" : ""}`}
          onClick={() => setActiveTab("library")}
        >
          interview library
          {library.length > 0 && (
            <span className="iv-tab-badge">{library.length}</span>
          )}
        </button>
      </motion.div>

      {/* ═══ MY INTERVIEWS TAB ═══ */}
      {activeTab === "my" && (
        <>
          {/* ARIA-PREPPED INTERVIEWS (ready) */}
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
                  session, it'll appear here automatically. or browse the shared
                  library to practice community interviews.
                </p>
              </div>
            ) : (
              <div className="iv-ready-grid">
                {readySessions.map((sess, i) => (
                  <motion.div
                    key={sess.id}
                    className="iv-ready-card"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <div className="iv-ready-top">
                      <span className={`iv-ready-badge ${sess.status === "in_progress" ? "iv-badge-retry" : ""}`}>
                        {sess.status === "in_progress" ? "retry" : "ready"}
                      </span>
                      {sess.estimated_duration_minutes && (
                        <span className="iv-ready-duration">
                          ~{sess.estimated_duration_minutes} min
                        </span>
                      )}
                    </div>
                    <h3 className="iv-ready-company">{sess.company}</h3>
                    <span className="iv-ready-role">{sess.job_title}</span>

                    {sess.interviewer_name && (
                      <span className="iv-ready-interviewer">
                        interviewer: {sess.interviewer_name}
                      </span>
                    )}

                    {sess.interview_date && (
                      <span className="iv-ready-date">
                        {new Date(sess.interview_date).toLocaleDateString(
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

                    {sess.questions_summary && (
                      <div className="iv-ready-questions">
                        {sess.questions_summary.map((q, j) => (
                          <span key={j} className="iv-question-chip">
                            {q.category || q.topic}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      className="iv-start-btn"
                      onClick={() => startInterview(sess)}
                      disabled={activeSession !== null}
                    >
                      <span className="iv-start-dot" />
                      {sess.status === "in_progress" ? "retry" : "start"} {sess.company} interview
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>

          {/* COMPLETED INTERVIEWS */}
          <motion.section
            className="iv-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="section-header">
              <h2 className="section-title">your completed interviews</h2>
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
        </>
      )}

      {/* ═══ LIBRARY TAB ═══ */}
      {activeTab === "library" && (
        <motion.section
          className="iv-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="section-header">
            <h2 className="section-title">shared interview library</h2>
            <span className="section-badge">{library.length} templates</span>
          </div>

          <p className="iv-library-desc">
            practice any interview from the community library. each session creates
            your own personal record. completed interviews auto-publish here for everyone.
          </p>

          {libraryLoading ? (
            <div className="panel-loading">
              <span className="loading-dot" /> loading library...
            </div>
          ) : library.length === 0 ? (
            <div className="activity-empty">
              <span className="activity-empty-icon">◈</span>
              <p>
                the library is empty. complete a mock interview and it'll
                automatically be published here for everyone to practice.
              </p>
            </div>
          ) : (
            <div className="iv-library-grid">
              {library.map((template, i) => (
                <motion.div
                  key={template.id}
                  className="iv-library-card"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <div className="iv-library-top">
                    <span className="iv-library-difficulty">
                      {template.difficulty || "medium"}
                    </span>
                    {template.times_practiced > 0 && (
                      <span className="iv-library-practiced">
                        {template.times_practiced} practiced
                      </span>
                    )}
                  </div>

                  <h3 className="iv-library-company">{template.company}</h3>
                  <span className="iv-library-role">{template.job_title}</span>

                  {template.interviewer_name && (
                    <span className="iv-library-interviewer">
                      interviewer: {template.interviewer_name}
                    </span>
                  )}

                  {template.estimated_duration_minutes && (
                    <span className="iv-library-duration">
                      ~{template.estimated_duration_minutes} min
                    </span>
                  )}

                  {template.question_categories && template.question_categories.length > 0 && (
                    <div className="iv-library-categories">
                      {template.question_categories.map((cat, j) => (
                        <span key={j} className="iv-question-chip">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {template.avg_score && (
                    <span className={`iv-library-avg ${scoreColor(template.avg_score)}`}>
                      avg: {Math.round(template.avg_score)}
                    </span>
                  )}

                  <button
                    className="iv-start-btn iv-practice-btn"
                    onClick={() => practiceFromLibrary(template)}
                    disabled={activeSession !== null}
                  >
                    <span className="iv-start-dot" />
                    practice this interview
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>
      )}

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
