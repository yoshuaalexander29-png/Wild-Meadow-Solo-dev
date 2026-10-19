import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// -----------------------------------------------------------------
// Cinematic Anime Movie Color Grading Shader
// Emulates the lush, vibrant aesthetic of Makoto Shinkai & Studio Ghibli films:
// - Luminous azure skies with soft highlight roll-off
// - Deep, rich emerald greens in shaded vegetation
// - Warm sun-kissed golden highlights
// - Subtle cinematic S-curve for rich depth without muddying darks
// -----------------------------------------------------------------
export const AnimeFilmShader = {
  name: 'AnimeFilmShader',
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.14 },
    uContrast: { value: 1.08 },
    uSunWarmth: { value: 0.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uSunWarmth;
    varying vec2 vUv;

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb;

      // 1. Boost vibrant color saturation (anime film vibrant look)
      vec3 hsv = rgb2hsv(color);
      hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
      color = hsv2rgb(hsv);

      // 2. Cinematic S-curve contrast
      color = (color - 0.5) * uContrast + 0.5;

      // 3. Gentle warm golden sunlight kiss in upper midtones & highlights
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 warmSun = vec3(1.03, 1.015, 0.96);
      color = mix(color, color * warmSun, smoothstep(0.35, 0.9, luma) * uSunWarmth * 2.5);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
    }
  `,
};

export interface CinematicPipeline {
  composer: EffectComposer;
  render: () => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createCinematicPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): CinematicPipeline {
  const width = renderer.domElement.clientWidth || window.innerWidth;
  const height = renderer.domElement.clientHeight || window.innerHeight;

  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
  });

  const composer = new EffectComposer(renderer, renderTarget);

  // 1. Base Scene Pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Dreamy Optical Bloom (Gentle luminous anime glow on sunlight, water, and sparks)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.32, // strength
    0.38, // radius
    0.84 // threshold
  );
  composer.addPass(bloomPass);

  // 3. Anime Movie Color Grading
  const colorPass = new ShaderPass(AnimeFilmShader);
  composer.addPass(colorPass);

  // 4. Output Pass (sRGB gamma transfer)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    composer,
    render: () => {
      composer.render();
    },
    setSize: (w: number, h: number) => {
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    },
    dispose: () => {
      composer.dispose();
      renderTarget.dispose();
    },
  };
}
