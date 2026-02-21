import { useEffect } from 'react';
import { motion } from 'framer-motion';
import './LoadingScreen.css';
import { useSceneStore } from '../store/sceneStore';

const LoadingScreen = () => {
  const { setIsLoading, setIntroComplete } = useSceneStore();

  useEffect(() => {
    const introTimer = setTimeout(() => {
      setIntroComplete();
    }, 2300);

    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
    }, 4000);

    return () => {
      clearTimeout(introTimer);
      clearTimeout(loadingTimer);
    };
  }, [setIsLoading, setIntroComplete]);

  return (
    <motion.div
      className="loading-screen"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1, delay: 2.5 }}
    >
      <motion.div
        className="loading-content"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={[
          { opacity: 1, scale: 1 },
          { opacity: 0 },
        ]}
        transition={{
          duration: 0.6,
          times: [0, 1],
          delay: 0,
        }}
      >
        <motion.div
          className="loading-pulse"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>
    </motion.div>
  );
};

export default LoadingScreen;
