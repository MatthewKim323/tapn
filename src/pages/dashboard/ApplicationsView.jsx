import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_FILTERS = [
  { key: "all", label: "all" },
  { key: "applied", label: "applied" },
  { key: "interview_scheduled", label: "interviewing" },
  { key: "offer", label: "offers" },
  { key: "rejected", label: "rejected" },
];

export default function ApplicationsView({ applications, timeAgo }) {
  const [filter, setFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    let result = applications;
    if (filter !== "all") {
      result = result.filter((a) => a.status === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.company_name?.toLowerCase().includes(q) ||
          a.job_title?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [applications, filter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts = { all: applications.length };
    applications.forEach((a) => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    return counts;
  }, [applications]);

  // Pending follow-ups: applied > 5 days ago, no follow-up sent
  const needsFollowUp = useMemo(() => {
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    return applications.filter(
      (a) =>
        a.status === "applied" &&
        !a.follow_up_sent_at &&
        new Date(a.applied_at).getTime() < fiveDaysAgo
    );
  }, [applications]);

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
          <h1 className="view-title">applications</h1>
          <p className="view-subtitle">
            {applications.length} total · {statusCounts.interview_scheduled || 0} interviewing
          </p>
        </div>
        <div className="view-search">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="search company or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </motion.div>

      {/* Follow-up Alert */}
      {needsFollowUp.length > 0 && (
        <motion.div
          className="followup-alert"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <span className="followup-icon">⚡</span>
          <span>
            {needsFollowUp.length} application{needsFollowUp.length > 1 ? "s" : ""} applied 5+ days
            ago with no follow-up
          </span>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        className="filter-bar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="filter-count">{statusCounts[f.key] || 0}</span>
          </button>
        ))}
      </motion.div>

      {/* Table */}
      <motion.div
        className="applications-table full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="app-table-header wide">
          <span>company</span>
          <span>role</span>
          <span>status</span>
          <span>resume</span>
          <span>mock</span>
          <span>applied</span>
        </div>
        {filtered.length === 0 ? (
          <div className="table-empty">
            <span className="table-empty-icon">◌</span>
            <p>
              {applications.length === 0
                ? "no applications yet. run the pipeline to start applying."
                : "no applications match your filter."}
            </p>
          </div>
        ) : (
          filtered.map((app, i) => (
            <motion.div
              key={app.id}
              className={`app-table-row wide ${selectedApp?.id === app.id ? "selected" : ""}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              onClick={() => setSelectedApp(selectedApp?.id === app.id ? null : app)}
            >
              <span className="app-company">{app.company_name}</span>
              <span className="app-role">{app.job_title}</span>
              <span className={`app-status-badge ${app.status}`}>{app.status?.replace(/_/g, " ")}</span>
              <span className="app-resume-indicator">
                {app.tailored_resume_path ? (
                  <span className="indicator-yes">✓</span>
                ) : (
                  <span className="indicator-no">—</span>
                )}
              </span>
              <span className="app-mock-indicator">
                {app.mock_interview_ready ? (
                  <span className="indicator-yes">
                    {app.mock_interview_score ? `${app.mock_interview_score}%` : "ready"}
                  </span>
                ) : (
                  <span className="indicator-no">—</span>
                )}
              </span>
              <span className="app-date">{timeAgo(app.applied_at)}</span>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedApp && (
          <motion.div
            className="app-detail-panel"
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="detail-header">
              <div>
                <h3 className="detail-company">{selectedApp.company_name}</h3>
                <span className="detail-role">{selectedApp.job_title}</span>
              </div>
              <button className="detail-close" onClick={() => setSelectedApp(null)}>
                ✕
              </button>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">status</span>
                <span className={`app-status-badge ${selectedApp.status}`}>
                  {selectedApp.status?.replace(/_/g, " ")}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">applied</span>
                <span className="detail-value">
                  {selectedApp.applied_at
                    ? new Date(selectedApp.applied_at).toLocaleDateString()
                    : "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">follow-up sent</span>
                <span className="detail-value">
                  {selectedApp.follow_up_sent_at
                    ? new Date(selectedApp.follow_up_sent_at).toLocaleDateString()
                    : "not yet"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">mock interview</span>
                <span className="detail-value">
                  {selectedApp.mock_interview_ready
                    ? selectedApp.mock_interview_score
                      ? `scored ${selectedApp.mock_interview_score}%`
                      : "ready — not taken"
                    : "not configured"}
                </span>
              </div>
            </div>

            {selectedApp.job_url && (
              <a
                href={selectedApp.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-link"
              >
                view job posting ↗
              </a>
            )}

            {selectedApp.job_description && (
              <div className="detail-jd">
                <span className="detail-label">job description</span>
                <pre className="detail-jd-text">{selectedApp.job_description}</pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
