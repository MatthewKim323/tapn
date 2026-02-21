import { Points, useGLTF } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useMemo, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Color, MathUtils, TextureLoader, Vector3 } from 'three';
import { useSceneStore } from '../store/sceneStore';

// Galaxy config (from evolve)
const GALAXY_MODEL_PATH = '/assets/models/galaxy.glb';
const DISC_TEXTURE_PATH = '/assets/img/discs/disc.png';

const STAR_ZOOM_EFFECT_DISTANCE = 0.25;
const SOLAR_SYSTEM_STAR = {
  INIT_POSITION: new Vector3(0.038105392881217164, -2.745814737039023, 0.7172299984047412),
  INIT_SIZE: [0.01, 32, 32],
  COLOR: 0xFFFFCC,
  CAMERA_OFFSET: new Vector3(0, -0.185, 0.185 / 2),
  SIZE_MIN: 0.01,
  SIZE_MAX: 15,
  ZOOMED_IN_FOV: 25,
};

const INITIAL_CAMERA_POS = new Vector3(0, -10, 4.5);
const INITIAL_FOV = 75;

export default function Galaxy3D() {
  const { camera } = useThree();
  const { navigationState, setOverlayColor, resetNavigation } = useSceneStore();

  const galaxyRef = useRef();
  const solarSystemStarRef = useRef();

  const starTexture = useLoader(TextureLoader, DISC_TEXTURE_PATH);

  // Load the galaxy model (exact same as evolve)
  const { nodes } = useGLTF(GALAXY_MODEL_PATH);
  const [positions, colors] = useMemo(() => {
    nodes.Object_2.geometry.center();
    const positions = new Float32Array(
      nodes.Object_2.geometry.attributes.position.array.buffer
    );
    const colors = new Float32Array(positions.length);

    const getDistanceToCenter = (x, y, z) =>
      Math.sqrt(x * x + y * y + z * z);

    // Colors: reddish near center, blueish further away
    const color = new Color();
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const distanceToCenter = getDistanceToCenter(x, y, z);
      const normalizedDistanceToCenter = distanceToCenter / 100;

      color.setRGB(
        Math.cos(normalizedDistanceToCenter),
        MathUtils.randFloat(0, 0.8),
        Math.sin(normalizedDistanceToCenter)
      );
      color.toArray(colors, i);
    }
    return [positions, colors];
  }, [nodes]);

  // Rotate the galaxy slowly
  useFrame(({ clock }) => {
    if (galaxyRef.current) {
      galaxyRef.current.rotation.z = clock.getElapsedTime() / 15;
    }

    // Scale star based on distance to camera
    if (solarSystemStarRef?.current) {
      const objectPosition = new Vector3();
      solarSystemStarRef.current.getWorldPosition(objectPosition);

      const dist = objectPosition.distanceTo(camera.position);
      let starSize = 1 / (dist * 0.5);
      starSize = Math.max(SOLAR_SYSTEM_STAR.SIZE_MIN, Math.min(starSize, SOLAR_SYSTEM_STAR.SIZE_MAX));
      solarSystemStarRef.current.scale.set(starSize, starSize, starSize);
    }
  });

  // Zoom-in animation (exact same as evolve)
  function zoomInGalaxyFunction() {
    setOverlayColor('#ffffff');

    if (!solarSystemStarRef.current) return;

    const initial = INITIAL_CAMERA_POS.clone();
    const tweenObj = { progress: 0 };

    const tl = gsap.timeline({
      onUpdate: function () {
        const solarSystemStarPosition = new Vector3();
        solarSystemStarRef.current.getWorldPosition(solarSystemStarPosition);

        const material = solarSystemStarRef.current.material;

        const distanceToSolarSystemStar = solarSystemStarPosition.distanceTo(camera.position);
        if (distanceToSolarSystemStar < STAR_ZOOM_EFFECT_DISTANCE) {
          camera.position.copy(solarSystemStarPosition).add(SOLAR_SYSTEM_STAR.CAMERA_OFFSET.clone());

          const minFov = SOLAR_SYSTEM_STAR.ZOOMED_IN_FOV;
          const maxFov = camera.fov;
          camera.fov = MathUtils.lerp(maxFov, minFov, 0.9);

          material.color.set(0x000000);
        } else {
          const minFov = camera.fov;
          const maxFov = INITIAL_FOV;
          camera.fov = MathUtils.lerp(maxFov, minFov, 0.1);

          material.color.set(SOLAR_SYSTEM_STAR.COLOR);
        }

        camera.updateProjectionMatrix();
      },
      onComplete: () => {
        // Zoom complete — you can hook into this later
      }
    });

    tl.to(tweenObj, {
      progress: 1,
      duration: 2,
      ease: "power2.inOut",
      onUpdate: function () {
        let dynamicTarget = (() => {
          const pos = new Vector3();
          solarSystemStarRef.current.getWorldPosition(pos);
          pos.add(SOLAR_SYSTEM_STAR.CAMERA_OFFSET.clone());
          return pos;
        })();

        const newPosition = initial.clone().lerp(dynamicTarget, tweenObj.progress);
        camera.position.copy(newPosition);

        camera.updateProjectionMatrix();
      }
    });
  }

  // Zoom-out animation (exact same as evolve)
  function zoomOutGalaxyFunction() {
    setOverlayColor('#ffffff');

    if (!solarSystemStarRef.current) return;

    const initial = INITIAL_CAMERA_POS.clone();
    const solarSystemStarPosition = new Vector3();
    solarSystemStarRef.current.getWorldPosition(solarSystemStarPosition);
    const startPosition = solarSystemStarPosition.clone().add(SOLAR_SYSTEM_STAR.CAMERA_OFFSET.clone());

    const tweenObj = { progress: 0 };

    const tl = gsap.timeline({
      onComplete: () => {
        resetNavigation();
      }
    });

    tl.to(tweenObj, {
      progress: 1,
      duration: 2,
      ease: "power2.inOut",
      onUpdate: function () {
        const newPosition = startPosition.clone().lerp(initial, tweenObj.progress);
        camera.position.copy(newPosition);

        const startFov = SOLAR_SYSTEM_STAR.ZOOMED_IN_FOV;
        const endFov = INITIAL_FOV;
        camera.fov = MathUtils.lerp(startFov, endFov, tweenObj.progress);

        camera.updateProjectionMatrix();
      }
    });
  }

  useEffect(() => {
    if (navigationState === 'zoomingIn') {
      zoomInGalaxyFunction();
    } else if (navigationState === 'zoomingOut') {
      zoomOutGalaxyFunction();
    }
  }, [navigationState]);

  return (
    <group dispose={null} ref={galaxyRef} position={[0, -5.0, 0]}>
      <ambientLight intensity={0.1} />

      <Points scale={0.065} positions={positions} colors={colors}>
        <pointsMaterial
          transparent
          depthWrite={false}
          vertexColors
          opacity={1}
          size={0.01}
          sizeAttenuation={true}
          blending={2} // THREE.AdditiveBlending
        />
      </Points>

      <group name="SolarSystemStar">
        <mesh
          ref={solarSystemStarRef}
          position={SOLAR_SYSTEM_STAR.INIT_POSITION}
        >
          <sphereGeometry args={SOLAR_SYSTEM_STAR.INIT_SIZE} />
          <meshStandardMaterial
            map={starTexture}
            color={SOLAR_SYSTEM_STAR.COLOR}
            emissive={0xffffff}
            emissiveIntensity={2}
          />
        </mesh>
      </group>
    </group>
  );
}
