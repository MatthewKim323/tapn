import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import GalaxyLoader from "./components/GalaxyLoader";
import { supabase } from "./lib/supabase";

function ProtectedRoute({ children, session }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  /* ── Loader state machine ── */
  const [authReady, setAuthReady] = useState(false);        // Supabase resolved
  const [minTimePassed, setMinTimePassed] = useState(false); // Minimum display time elapsed
  const [loaderFading, setLoaderFading] = useState(false);   // Fade-out in progress
  const [loaderGone, setLoaderGone] = useState(false);       // Loader removed from DOM

  /* Minimum loader display time — let the galaxy spin for a bit */
  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), 2800);
    return () => clearTimeout(t);
  }, []);

  /* Auth check */
  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setAuthReady(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    setAuthReady(true);
  }

  const [contentVisible, setContentVisible] = useState(false);

  /* Stage 2: when both auth + min time are done → cross-fade */
  useEffect(() => {
    if (authReady && minTimePassed && !loaderFading) {
      setLoaderFading(true);
      setContentVisible(true);          // app fades in simultaneously
      const t = setTimeout(() => setLoaderGone(true), 1100);
      return () => clearTimeout(t);
    }
  }, [authReady, minTimePassed, loaderFading]);

  return (
    <>
      {/* App content — hidden behind loader, cross-fades in when loader dissolves */}
      {authReady && (
        <div className={`app-reveal ${contentVisible ? "app-reveal--visible" : ""}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute session={session}>
                <OnboardingPage
                  session={session}
                  onProfileUpdate={setProfile}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute session={session}>
                <DashboardPage session={session} profile={profile} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
      )}

      {/* Galaxy loader overlay — sits on top, fades out when ready */}
      {!loaderGone && <GalaxyLoader fading={loaderFading} />}
    </>
  );
}

export default App;
