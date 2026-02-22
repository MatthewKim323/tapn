import "../App.css";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Galaxy from "../components/Galaxy";
import GalaxyScene from "../components/GalaxyScene";
import DecryptedText from "../components/DecryptedText";
import SplitText from "../components/SplitText";
import Vignette from "../components/Vignette";
import Overlay from "../components/Overlay";
import LoadingScreen from "../components/LoadingScreen";
import { motion } from "framer-motion";
import { useSceneStore } from "../store/sceneStore";

const galaxyFocal = [0.5, 0.25];
const galaxyRotation = [1.0, 0.0];

/* ═══ Tech logos for the "built with" marquee ═══ */
const TECH_STACK = [
  { name: "React", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg", url: "https://react.dev" },
  { name: "Vite", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vitejs/vitejs-original.svg", url: "https://vite.dev" },
  { name: "Three.js", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/threejs/threejs-original.svg", url: "https://threejs.org" },
  { name: "Supabase", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/supabase/supabase-original.svg", url: "https://supabase.com" },
  { name: "PostgreSQL", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg", url: "https://www.postgresql.org" },
  { name: "Framer Motion", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/framermotion/framermotion-original.svg", url: "https://www.framer.com/motion" },
  { name: "GSAP", logo: "https://cdn.worldvectorlogo.com/logos/gsap-greensock.svg", url: "https://gsap.com" },
  { name: "JavaScript", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
  { name: "CSS3", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg", url: "https://developer.mozilla.org/en-US/docs/Web/CSS" },
  { name: "Node.js", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg", url: "https://nodejs.org" },
  { name: "ElevenLabs", logo: "https://avatars.githubusercontent.com/u/101422956?s=200&v=4", url: "https://elevenlabs.io" },
  { name: "OpenClaw", logo: "https://avatars.githubusercontent.com/u/193572743?s=200&v=4", url: "https://openclaw.dev" },
  { name: "Zustand", logo: "https://raw.githubusercontent.com/pmndrs/zustand/main/bear.jpg", url: "https://github.com/pmndrs/zustand" },
  { name: "React Router", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/reactrouter/reactrouter-original.svg", url: "https://reactrouter.com" },
  { name: "GitHub", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/github/github-original.svg", url: "https://github.com/MatthewKim323/tapn" },
  { name: "OGL", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/opengl/opengl-original.svg", url: "https://github.com/oframe/ogl" },
];

/* triple the array so the marquee loops seamlessly */
const MARQUEE_ITEMS = [...TECH_STACK, ...TECH_STACK, ...TECH_STACK];

const TEAM = [
  "matthew kim",
  "brendan chung",
  "sou hamura",
  "sabrina nguyen",
  "allison gu",
];

function LandingPage() {
  const { isLoading, isIntroComplete, triggerZoom, navigationState, resetNavigation } =
    useSceneStore();
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const navigate = useNavigate();

  // Reset navigation state on mount (in case user navigated back)
  useEffect(() => {
    resetNavigation();
  }, []);

  // After zoom transition, navigate to login
  useEffect(() => {
    if (navigationState === "zoomingIn") {
      const timer = setTimeout(() => {
        navigate("/login");
      }, 2800);
      return () => clearTimeout(timer);
    }
  }, [navigationState, navigate]);

  const handleMouseMove = (event) => {
    const { clientX, clientY, currentTarget } = event;
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = (clientX - left) / width;
    const y = 1.0 - (clientY - top) / height;
    setMousePosition({ x, y });
  };

  const galaxySceneCanvas = useMemo(() => <GalaxyScene />, []);

  return (
    <div className="app-container" onMouseMove={handleMouseMove}>
      {isLoading && <LoadingScreen />}
      <Overlay />

      {/* Layer 1: Interactive galaxy shader background */}
      <div className="galaxy-background">
        <Galaxy
          focal={galaxyFocal}
          rotation={galaxyRotation}
          mouseRepulsion={true}
          mouseInteraction={false}
          mousePosition={mousePosition}
          density={1.2}
          glowIntensity={0.6}
          saturation={0.6}
          hueShift={200}
          repulsionStrength={1.0}
          twinkleIntensity={0.5}
          rotationSpeed={0.08}
          animateIn={false}
          nebulaIntensity={0}
        />
      </div>

      {/* Layer 2: 3D Galaxy model with bloom */}
      {galaxySceneCanvas}

      {/* Layer 3: Vignette for depth */}
      <Vignette />

      {/* Layer 4: UI Content */}
      <div className="content-container">
        {/* ═══ Glassmorphic Top Bar ═══ */}
        <motion.nav
          className="glass-topbar"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: navigationState === "zoomingIn" ? 0 : 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.9, ease: "easeOut" }}
        >
          {/* Row 1: team */}
          <div className="glass-row glass-row-team">
            <span className="glass-label">team</span>
            <div className="glass-team-names">
              {TEAM.map((name, i) => (
                <span key={name} className="glass-team-name">
                  {name}
                  {i < TEAM.length - 1 && (
                    <span className="glass-team-sep">|</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Row 2: built with label */}
          <div className="glass-row glass-row-built">
            <span className="glass-label">built with</span>
          </div>

          {/* Row 3: scrolling favicons */}
          <div className="glass-row glass-row-icons">
            <div className="glass-marquee-track">
              <div className="glass-marquee-scroll">
                {MARQUEE_ITEMS.map((tech, i) => (
                  <a
                    key={`${tech.name}-${i}`}
                    className="glass-tech-icon"
                    href={tech.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tech.name}
                  >
                    <img
                      src={tech.logo}
                      alt={tech.name}
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </motion.nav>

        <motion.header
          className="page-header"
          initial={{ opacity: 0 }}
          animate={{ opacity: navigationState === "zoomingIn" ? 0 : 1 }}
          transition={{ delay: 0, duration: 1.5 }}
        >
          <h1 className="title">
            {isIntroComplete && (
              <DecryptedText
                text="tapn"
                animateOn="view"
                sequential={true}
                speed={150}
              />
            )}
          </h1>
          {isIntroComplete && (
            <SplitText
              text="your autonomous job assistant"
              className="subhead"
              tag="p"
              delay={100}
              duration={0.6}
              ease="power3.out"
              splitType="words"
              from={{ opacity: 0, y: 20 }}
              to={{ opacity: 1, y: 0 }}
            />
          )}
          {isIntroComplete && (
            <motion.p
              className="tagline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 1.2 }}
            >
              six agents. one pipeline. every application handled.
            </motion.p>
          )}

          {isIntroComplete && (
            <motion.div
              className="cta-wrapper"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
            >
              <button
                className="enter-button"
                onClick={triggerZoom}
                disabled={navigationState !== "idle"}
              >
                <span className="enter-button-text">get tapped in</span>
                <span className="enter-button-glow" />
              </button>
            </motion.div>
          )}
        </motion.header>
      </div>
    </div>
  );
}

export default LandingPage;
