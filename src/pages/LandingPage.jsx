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
              text="your autonomous job pipeline"
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
                <span className="enter-button-text">get started</span>
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
