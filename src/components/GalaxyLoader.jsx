import { Renderer, Program, Mesh, Color, Triangle } from "ogl";
import { useEffect, useRef } from "react";
import "./GalaxyLoader.css";

/* ── Vertex ── */
const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/* ── Fragment — Mermersk galaxy shader, ported from Shadertoy ── */
const fragmentShader = `
precision highp float;

varying vec2 vUv;
uniform float iTime;
uniform vec3  iResolution;

#define PI  3.1415926
#define PI2 6.283186
#define E_VAL 2.71828

/* ── hashes / noise ── */

float hashwithoutsine11(float p) {
  p = fract(p * .1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float noise1d(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hashwithoutsine11(i), hashwithoutsine11(i + 1.0), smoothstep(0.0, 1.0, f));
}

vec2 random2(vec2 st) {
  st = vec2(dot(st, vec2(127.1, 711.7)),
            dot(st, vec2(619.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(st) * 23758.545123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(random2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/* ── rotation ── */

vec3 rotZ(vec3 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * p;
}

/* ── fbm ── */

float fbm(vec2 uv, float seed, int o, float l, float g, float a, float f, float doRot, float doAbs) {
  float result = 0.0;
  float amplitude = a;
  float frequency = f;
  uv += seed;

  for (int i = 0; i < 8; i++) {
    float active = 1.0 - step(float(o), float(i));
    float nv = amplitude * noise(uv * frequency);
    if (doAbs > 0.5) nv = abs(nv);
    result += nv * active;
    if (doRot > 0.5) uv = rotZ(vec3(uv, 0.0), float(i)).xy;
    frequency *= l;
    amplitude *= g;
  }
  return result;
}

/* ── logarithmic spiral SDF ── */

float logarithmicSpiral(vec2 polarUV, float a, float b) {
  float len   = polarUV.x;
  float angle = polarUV.y;

  float logSpiralAngle     = log(len / a) / b;
  float intersectMain      = a * pow(E_VAL, b * (angle + PI2 * floor(logSpiralAngle / PI2)));
  float intersectNextRev   = a * pow(E_VAL, b * (angle + PI2 * floor(logSpiralAngle / PI2 + 1.0)));
  float intersectPrevRev   = a * pow(E_VAL, b * (angle + PI2 * floor(logSpiralAngle / PI2 - 1.0)));

  float fr = min(abs(len - intersectMain), abs(len - intersectNextRev));
  fr = min(fr, abs(len - intersectPrevRev));
  return fr;
}

/* ── oriented vesica SDF (IQ) ── */

float sdOrientedVesica(vec2 p, vec2 a, vec2 b, float w) {
  float r = 0.5 * length(b - a);
  float d = 0.5 * (r * r - w * w) / w;
  vec2 v = (b - a) / r;
  vec2 c = (b + a) * 0.5;
  vec2 q = 0.5 * abs(mat2(v.y, v.x, -v.x, v.y) * (p - c));
  vec3 h = (r * q.x < d * (q.y - r)) ? vec3(0.0, r, 0.0) : vec3(-d, 0.0, d + w);
  return length(q - h.xy) - h.z;
}

/* ── galaxy ── */

vec3 galaxy(vec2 uv, vec2 polarUV) {
  float size  = 5.0;
  float len   = polarUV.x * size;
  float angle = polarUV.y;

  /* four spiral arms */
  float s1 = logarithmicSpiral(vec2(len, angle),              0.59, 0.25);
  s1 += len * smoothstep(5.5, 8.3, len);

  float s2 = logarithmicSpiral(vec2(len, angle),              0.41, 0.26);
  s2 += len * smoothstep(5.6, 8.1, len);

  float s3 = logarithmicSpiral(vec2(len, atan(uv.y, uv.x)),  0.59, 0.25);
  s3 += len * smoothstep(5.5, 8.0, len);

  float s4 = logarithmicSpiral(vec2(len, atan(uv.y, uv.x)),  0.41, 0.25);
  s4 += len * smoothstep(5.0, 7.5, len);

  float spiralD = min(s1, min(s2, min(s3, s4)));

  float hazeSpiralD = 1.0 - smoothstep(0.0, 1.4, spiralD);
  spiralD           = 1.0 - smoothstep(0.0, 0.65, spiralD);

  /* noise layers */
  float starN      = fbm(uv, 244.0, 8, 2.0,  0.5,  0.68, 2.7,  1.0, 1.0);
  float starN2     = fbm(uv, 69.0,  8, 1.6,  0.85, 0.5,  13.0, 1.0, 1.0);
  float innerBandN = fbm(uv, 539.0, 6, 1.4,  0.85, 0.55, 17.0, 1.0, 1.0);

  innerBandN = innerBandN * innerBandN * innerBandN;
  starN      = starN  * starN  * starN  * starN;
  starN2     = starN2 * starN2 * starN2;

  /* per-arm colour */
  float ci        = len * 0.1 + 499.2 + noise1d(angle + 55.0);
  vec3 galaxyCol  = mix(hash31(ceil(ci)), hash31(ceil(ci + 1.0)), smoothstep(0.5, 1.0, fract(ci)));
  /* boost red heavily → orange arms; keep moderate blue → purple arms */
  galaxyCol      *= vec3(2.2, 0.45, 1.15);

  vec3 starCol  = mix(vec3(0.0), galaxyCol, 1.0 - exp(starN  * 50.0));
  vec3 starCol2 = mix(vec3(0.0), vec3(1.0),  1.0 - exp(starN2 * 10.0));
  vec3 combined = max(starCol / (starCol2 + 0.001), vec3(0.0));

  vec3 finalCol = mix(vec3(0.0), combined, spiralD);

  /* background haze — warm purple/magenta */
  vec3 bgHaze = vec3(95.0/255.0, 42.0/255.0, 88.0/255.0);
  finalCol += mix(vec3(0.0), bgHaze * vec3(2.2, 0.8, 1.8), smoothstep(1.7, 0.33, length(uv))) * 0.15;
  finalCol += mix(vec3(0.0), bgHaze * vec3(1.8, 0.6, 1.6), hazeSpiralD * hazeSpiralD * 0.18);

  /* glowing vesica centre — hot orange core */
  float vesicaD = sdOrientedVesica(uv, vec2(0.085, -0.085), vec2(-0.085, 0.085), 0.025);
  vec3 centerCol      = vec3(1.0, 0.55, 0.12);
  vec3 galaxyCenterCol = (1.0 / max(vesicaD, 0.005)) * 0.005 * mix(galaxyCol, centerCol, 0.55);
  galaxyCenterCol     *= smoothstep(2.0, 0.0, length(uv));
  finalCol            += galaxyCenterCol;

  /* narrow inner-arm star band */
  vec3 narrowCol = mix(vec3(0.0), vec3(1.5, 0.0, 0.0), smoothstep(0.1, 0.2, innerBandN));
  narrowCol      = mix(narrowCol, vec3(2.0),             smoothstep(0.2, 0.25, innerBandN));
  finalCol      += narrowCol * smoothstep(0.7, 0.9, spiralD);

  return finalCol;
}

/* ── main ── */

void main() {
  vec2 uv = vUv;
  uv = uv * 2.0 - 1.0;

  float ar = iResolution.x / iResolution.y;
  uv.x *= ar;

  uv = rotZ(vec3(uv, 0.0), -iTime * 0.06).xy;
  uv *= 2.6;

  vec2 polarUV = vec2(length(uv), atan(uv.y, uv.x) + PI);

  vec3 col = galaxy(uv, polarUV);

  /* saturation */
  float gray = dot(min(col, 1.0), vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(gray), col, 0.77), 0.0, 1.0);

  /* gamma */
  col = pow(col, vec3(0.4545));

  /* vignette — smooth fade to pure black at edges so canvas blends into the page */
  float dist = length(vUv - 0.5) * 2.0;
  float vignette = 1.0 - smoothstep(0.35, 0.92, dist);
  col *= vignette;

  /* subtle breathing brightness */
  float breath = 0.92 + 0.08 * sin(iTime * 1.2);
  col *= breath;

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function GalaxyLoader({ fading = false }) {
  const containerRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const ctn = containerRef.current;
    if (!ctn) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new Renderer({ dpr });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);

    const geometry = new Triangle(gl);

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new Color(
            gl.canvas.width,
            gl.canvas.height,
            gl.canvas.width / gl.canvas.height
          ),
        },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      if (!ctn || !renderer) return;
      renderer.setSize(ctn.offsetWidth, ctn.offsetHeight);
      program.uniforms.iResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / gl.canvas.height
      );
    }

    const ro = new ResizeObserver(resize);
    ro.observe(ctn);
    resize();

    const startTime = performance.now();

    const update = () => {
      rafRef.current = requestAnimationFrame(update);
      const elapsed = (performance.now() - startTime) * 0.001;
      program.uniforms.iTime.value = elapsed;
      renderer.render({ scene: mesh });
    };

    rafRef.current = requestAnimationFrame(update);
    ctn.appendChild(gl.canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      if (gl.canvas.parentElement === ctn) ctn.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div className={`galaxy-loader-screen ${fading ? "galaxy-loader-fadeout" : ""}`}>
      {/* subtle glow halo behind the canvas — CSS only */}
      <div className="galaxy-loader-glow" />
      {/* WebGL canvas — NO border-radius, NO overflow hidden. Shader vignette fades to pure #000 */}
      <div ref={containerRef} className="galaxy-loader-canvas" />
    </div>
  );
}
