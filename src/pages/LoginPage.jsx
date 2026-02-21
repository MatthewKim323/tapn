import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import FaultyTerminal from "../components/FaultyTerminal";
import "./LoginPage.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!supabase) {
      setError("supabase not configured — check .env");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        navigate("/onboarding");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Check if onboarding is complete
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_complete")
          .eq("id", data.user.id)
          .single();

        if (profile?.onboarding_complete) {
          navigate("/dashboard");
        } else {
          navigate("/onboarding");
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* FaultyTerminal WebGL background */}
      <div className="login-terminal-bg">
        <FaultyTerminal
          scale={1.5}
          gridMul={[2, 1]}
          digitSize={1.2}
          timeScale={0.4}
          scanlineIntensity={0.4}
          glitchAmount={1}
          flickerAmount={0.8}
          noiseAmp={0.8}
          curvature={0.08}
          tint="#FF6B6B"
          mouseReact
          mouseStrength={0.4}
          pageLoadAnimation
          brightness={0.35}
        />
      </div>

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Terminal header bar */}
        <div className="login-terminal-bar">
          <div className="terminal-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <span className="terminal-title">tapn://auth</span>
        </div>

        <div className="login-card-body">
          <motion.div
            className="login-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <span className="login-label">operator access</span>
            <h1 className="login-title">tapn</h1>
            <p className="login-subtitle">
              {mode === "signin"
                ? "sign in to your dashboard"
                : "create your operator account"}
            </p>
          </motion.div>

          <motion.form
            className="login-form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <div className="login-field">
              <label className="field-label">email_</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@tapn.io"
                required
                className="field-input"
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <label className="field-label">password_</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="field-input"
                minLength={6}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  className="login-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <span className="error-prefix">err:</span> {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? (
                <span className="loading-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              ) : mode === "signin" ? (
                "authenticate →"
              ) : (
                "initialize account →"
              )}
            </button>
          </motion.form>

          <motion.div
            className="login-toggle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          >
            {mode === "signin" ? (
              <button
                className="toggle-btn"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                no account?{" "}
                <span className="toggle-accent">create one →</span>
              </button>
            ) : (
              <button
                className="toggle-btn"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
              >
                already registered?{" "}
                <span className="toggle-accent">sign in →</span>
              </button>
            )}
          </motion.div>
        </div>

        {/* Status line */}
        <div className="login-status-bar">
          <span className="status-dot" />
          <span>system ready</span>
          <span className="status-spacer" />
          <span>v0.1.0</span>
        </div>
      </motion.div>
    </div>
  );
}
