import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import { generateUserMd } from "../lib/generateUserMd";
import "./OnboardingPage.css";

const STEPS = [
  { id: "identity", num: "01", title: "identity", subtitle: "who are you?" },
  { id: "career", num: "02", title: "career", subtitle: "what do you want?" },
  { id: "skills", num: "03", title: "skills", subtitle: "what can you do?" },
  {
    id: "preferences",
    num: "04",
    title: "preferences",
    subtitle: "what matters to you?",
  },
  {
    id: "schedule",
    num: "05",
    title: "schedule",
    subtitle: "how do you work best?",
  },
];

/* ═══ Tag Input Component ═══ */

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState("");

  function handleKeyDown(e) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      if (!value.includes(input.trim())) {
        onChange([...value, input.trim()]);
      }
      setInput("");
    } else if (e.key === "Backspace" && !input && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(idx) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="tag-input-container">
      <div className="tag-input-tags">
        {value.map((tag, i) => (
          <span key={i} className="tag">
            {tag}
            <button
              className="tag-remove"
              onClick={() => removeTag(i)}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="field-input tag-field"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : "add more..."}
      />
    </div>
  );
}

/* ═══ Field Component ═══ */

function Field({ label, hint, required, children }) {
  return (
    <div className="onboarding-field">
      <label className="field-label">
        {label}
        {required && <span className="field-req">*</span>}
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* ═══ Main Component ═══ */

export default function OnboardingPage({ session, onProfileUpdate }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    location: "",
    linkedinUrl: "",
    portfolioUrl: "",
    currentTitle: "",
    yearsExperience: "",
    targetRoles: [],
    targetIndustries: [],
    bio: "",
    technicalSkills: [],
    topStrengths: [],
    educationDegree: "",
    educationField: "",
    educationSchool: "",
    educationYear: "",
    workAuthorization: "",
    workTypePreference: "",
    minSalary: "",
    companySize: "",
    mustHaveCriteria: [],
    dealBreakerKeywords: [],
    blacklistedCompanies: [],
    availableHours: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    communicationStyle: "",
  });

  function updateField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvance() {
    if (step === 0) return formData.fullName.trim().length > 0;
    if (step === 1) return formData.targetRoles.length > 0;
    return true;
  }

  function goNext() {
    if (step < STEPS.length - 1 && canAdvance()) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }

  function goPrev() {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }

  function downloadUserMd() {
    const userMd = generateUserMd({
      ...formData,
      email: session?.user?.email || "",
    });
    const blob = new Blob([userMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "USER.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFinish() {
    setSaving(true);
    setError("");

    const userMd = generateUserMd({
      ...formData,
      email: session?.user?.email || "",
    });

    const profileData = {
      id: session.user.id,
      email: session.user.email,
      full_name: formData.fullName,
      phone: formData.phone,
      location: formData.location,
      linkedin_url: formData.linkedinUrl,
      portfolio_url: formData.portfolioUrl,
      current_title: formData.currentTitle,
      years_experience: formData.yearsExperience,
      target_roles: formData.targetRoles,
      target_industries: formData.targetIndustries,
      bio: formData.bio,
      technical_skills: formData.technicalSkills,
      top_strengths: formData.topStrengths,
      education_degree: formData.educationDegree,
      education_field: formData.educationField,
      education_school: formData.educationSchool,
      education_year: formData.educationYear,
      work_authorization: formData.workAuthorization,
      work_type_preference: formData.workTypePreference,
      min_salary: formData.minSalary,
      company_size: formData.companySize,
      must_have_criteria: formData.mustHaveCriteria,
      deal_breaker_keywords: formData.dealBreakerKeywords,
      blacklisted_companies: formData.blacklistedCompanies,
      available_hours: formData.availableHours,
      timezone: formData.timezone,
      communication_style: formData.communicationStyle,
      user_md_content: userMd,
      onboarding_complete: true,
    };

    try {
      if (!supabase) throw new Error("supabase not configured");

      const { data, error: dbError } = await supabase
        .from("profiles")
        .upsert(profileData, { onConflict: "id" })
        .select()
        .single();

      if (dbError) throw dbError;
      if (onProfileUpdate) onProfileUpdate(data);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-grid-bg" />

      {/* Progress bar */}
      <div className="onboarding-progress-bar">
        <motion.div
          className="progress-fill"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>

      {/* Step indicator */}
      <div className="onboarding-step-indicator">
        <span className="step-num">{STEPS[step].num}</span>
        <span className="step-sep">/</span>
        <span className="step-total">05</span>
      </div>

      {/* Back to home */}
      <button className="onboarding-back-home" onClick={() => navigate("/")}>
        ← tapn
      </button>

      {/* Main content */}
      <div className="onboarding-content">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="onboarding-step"
          >
            <div className="step-header">
              <span className="step-label">
                {STEPS[step].num} — {STEPS[step].title}
              </span>
              <h2 className="step-title">{STEPS[step].subtitle}</h2>
            </div>

            <div className="step-fields">
              {/* ═══ Step 1: Identity ═══ */}
              {step === 0 && (
                <>
                  <Field label="full_name" required>
                    <input
                      className="field-input"
                      value={formData.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      placeholder="your name"
                    />
                  </Field>
                  <Field label="phone">
                    <input
                      className="field-input"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+1 (555) 000-0000"
                    />
                  </Field>
                  <Field label="location">
                    <input
                      className="field-input"
                      value={formData.location}
                      onChange={(e) => updateField("location", e.target.value)}
                      placeholder="city, state"
                    />
                  </Field>
                  <Field label="linkedin_url">
                    <input
                      className="field-input"
                      value={formData.linkedinUrl}
                      onChange={(e) =>
                        updateField("linkedinUrl", e.target.value)
                      }
                      placeholder="linkedin.com/in/..."
                    />
                  </Field>
                  <Field label="portfolio_url">
                    <input
                      className="field-input"
                      value={formData.portfolioUrl}
                      onChange={(e) =>
                        updateField("portfolioUrl", e.target.value)
                      }
                      placeholder="github.com/..."
                    />
                  </Field>
                </>
              )}

              {/* ═══ Step 2: Career ═══ */}
              {step === 1 && (
                <>
                  <Field label="current_title">
                    <input
                      className="field-input"
                      value={formData.currentTitle}
                      onChange={(e) =>
                        updateField("currentTitle", e.target.value)
                      }
                      placeholder="e.g. data engineer"
                    />
                  </Field>
                  <Field label="years_experience">
                    <input
                      className="field-input"
                      value={formData.yearsExperience}
                      onChange={(e) =>
                        updateField("yearsExperience", e.target.value)
                      }
                      placeholder="e.g. 3"
                    />
                  </Field>
                  <Field label="target_roles" hint="press enter to add" required>
                    <TagInput
                      value={formData.targetRoles}
                      onChange={(v) => updateField("targetRoles", v)}
                      placeholder="e.g. ml engineer, data scientist"
                    />
                  </Field>
                  <Field label="target_industries" hint="press enter to add">
                    <TagInput
                      value={formData.targetIndustries}
                      onChange={(v) => updateField("targetIndustries", v)}
                      placeholder="e.g. tech, finance, healthcare"
                    />
                  </Field>
                  <Field label="professional_summary">
                    <textarea
                      className="field-input field-textarea"
                      value={formData.bio}
                      onChange={(e) => updateField("bio", e.target.value)}
                      placeholder="2-3 sentences about your background and what you bring..."
                      rows={3}
                    />
                  </Field>
                </>
              )}

              {/* ═══ Step 3: Skills ═══ */}
              {step === 2 && (
                <>
                  <Field label="technical_skills" hint="press enter to add">
                    <TagInput
                      value={formData.technicalSkills}
                      onChange={(v) => updateField("technicalSkills", v)}
                      placeholder="python, sql, tensorflow, react..."
                    />
                  </Field>
                  <Field label="top_strengths" hint="press enter to add">
                    <TagInput
                      value={formData.topStrengths}
                      onChange={(v) => updateField("topStrengths", v)}
                      placeholder="e.g. system design, fast learner"
                    />
                  </Field>
                  <div className="field-row">
                    <Field label="degree">
                      <input
                        className="field-input"
                        value={formData.educationDegree}
                        onChange={(e) =>
                          updateField("educationDegree", e.target.value)
                        }
                        placeholder="b.s."
                      />
                    </Field>
                    <Field label="field_of_study">
                      <input
                        className="field-input"
                        value={formData.educationField}
                        onChange={(e) =>
                          updateField("educationField", e.target.value)
                        }
                        placeholder="computer science"
                      />
                    </Field>
                  </div>
                  <div className="field-row">
                    <Field label="school">
                      <input
                        className="field-input"
                        value={formData.educationSchool}
                        onChange={(e) =>
                          updateField("educationSchool", e.target.value)
                        }
                        placeholder="university name"
                      />
                    </Field>
                    <Field label="grad_year">
                      <input
                        className="field-input"
                        value={formData.educationYear}
                        onChange={(e) =>
                          updateField("educationYear", e.target.value)
                        }
                        placeholder="2024"
                      />
                    </Field>
                  </div>
                  <Field label="work_authorization">
                    <select
                      className="field-input field-select"
                      value={formData.workAuthorization}
                      onChange={(e) =>
                        updateField("workAuthorization", e.target.value)
                      }
                    >
                      <option value="">select...</option>
                      <option value="us_citizen">us citizen</option>
                      <option value="permanent_resident">
                        permanent resident
                      </option>
                      <option value="h1b_visa">h1b visa</option>
                      <option value="opt_stem">opt / stem opt</option>
                      <option value="other">other</option>
                    </select>
                  </Field>
                </>
              )}

              {/* ═══ Step 4: Preferences ═══ */}
              {step === 3 && (
                <>
                  <Field label="work_type">
                    <div className="radio-group">
                      {["remote", "hybrid", "onsite", "flexible"].map((opt) => (
                        <button
                          key={opt}
                          className={`radio-btn ${formData.workTypePreference === opt ? "active" : ""}`}
                          onClick={() =>
                            updateField("workTypePreference", opt)
                          }
                          type="button"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="minimum_salary">
                    <input
                      className="field-input"
                      value={formData.minSalary}
                      onChange={(e) => updateField("minSalary", e.target.value)}
                      placeholder="e.g. $120,000"
                    />
                  </Field>
                  <Field label="company_size_preference">
                    <div className="radio-group">
                      {["startup", "mid-size", "enterprise", "any"].map(
                        (opt) => (
                          <button
                            key={opt}
                            className={`radio-btn ${formData.companySize === opt ? "active" : ""}`}
                            onClick={() => updateField("companySize", opt)}
                            type="button"
                          >
                            {opt}
                          </button>
                        )
                      )}
                    </div>
                  </Field>
                  <Field label="must_have_criteria" hint="press enter to add">
                    <TagInput
                      value={formData.mustHaveCriteria}
                      onChange={(v) => updateField("mustHaveCriteria", v)}
                      placeholder="e.g. health insurance, 401k"
                    />
                  </Field>
                  <Field label="deal_breaker_keywords" hint="press enter to add">
                    <TagInput
                      value={formData.dealBreakerKeywords}
                      onChange={(v) => updateField("dealBreakerKeywords", v)}
                      placeholder="keywords that disqualify a job..."
                    />
                  </Field>
                  <Field label="blacklisted_companies" hint="press enter to add">
                    <TagInput
                      value={formData.blacklistedCompanies}
                      onChange={(v) => updateField("blacklistedCompanies", v)}
                      placeholder="companies to skip..."
                    />
                  </Field>
                </>
              )}

              {/* ═══ Step 5: Schedule ═══ */}
              {step === 4 && (
                <>
                  <Field label="available_hours">
                    <input
                      className="field-input"
                      value={formData.availableHours}
                      onChange={(e) =>
                        updateField("availableHours", e.target.value)
                      }
                      placeholder="e.g. mon-fri, 10am-4pm"
                    />
                  </Field>
                  <Field label="timezone">
                    <input
                      className="field-input"
                      value={formData.timezone}
                      onChange={(e) =>
                        updateField("timezone", e.target.value)
                      }
                      placeholder="e.g. america/los_angeles"
                    />
                  </Field>
                  <Field label="communication_style">
                    <div className="radio-group">
                      {["brief", "detailed", "casual", "formal"].map((opt) => (
                        <button
                          key={opt}
                          className={`radio-btn ${formData.communicationStyle === opt ? "active" : ""}`}
                          onClick={() =>
                            updateField("communicationStyle", opt)
                          }
                          type="button"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* USER.md Preview */}
                  <div className="usermd-preview">
                    <div className="preview-header">
                      <span className="preview-label">user.md preview</span>
                      <button
                        className="preview-download"
                        onClick={downloadUserMd}
                        type="button"
                      >
                        ↓ download
                      </button>
                    </div>
                    <pre className="preview-content">
                      {generateUserMd({
                        ...formData,
                        email: session?.user?.email || "",
                      }).slice(0, 600)}
                      ...
                    </pre>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="onboarding-nav">
          <button
            className="nav-btn nav-prev"
            onClick={goPrev}
            disabled={step === 0}
          >
            ← back
          </button>

          {error && <span className="nav-error">{error}</span>}

          {step < STEPS.length - 1 ? (
            <button
              className="nav-btn nav-next"
              onClick={goNext}
              disabled={!canAdvance()}
            >
              continue →
            </button>
          ) : (
            <button
              className="nav-btn nav-finish"
              onClick={handleFinish}
              disabled={saving}
            >
              {saving ? "initializing..." : "deploy agents →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
