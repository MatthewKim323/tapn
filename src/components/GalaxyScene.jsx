import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { NoToneMapping } from 'three';
import {
  EffectComposer,
  Bloom,
  Selection,
  Select,
} from '@react-three/postprocessing';
import Galaxy3D from './Galaxy3D';

export default function GalaxyScene() {
  return (
    <Canvas
      className="galaxy-scene-canvas"
      camera={{ position: [0, -10, 4.5], fov: 75 }}
      gl={{ alpha: true, toneMapping: NoToneMapping }}
    >
      <Suspense fallback={null}>
        <Selection>
          <EffectComposer multisampling={0} disableNormalPass>
            <Bloom
              intensity={2.5}
              luminanceThreshold={0.08}
              luminanceSmoothing={0.1}
              height={1024}
              mipmapBlur
            />
          </EffectComposer>
          <Select enabled>
            <Galaxy3D />
          </Select>
        </Selection>
      </Suspense>
    </Canvas>
  );
}
