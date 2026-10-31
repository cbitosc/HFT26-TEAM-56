/**
 * The How it works journey: one particle system that morphs through five
 * shapes as the page scrolls (the hero's knot, portfolio, code, tests, score
 * ring).
 * Loaded on demand by Journey; owns its renderer, render loop and listeners.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import { buildShapes, SCORE } from "@/components/story/journey-shapes";
import {
  LAST,
  progressFor,
  STICKY_TOP,
  stepFor,
} from "@/components/story/journey-timing";

type Pose = { rx: number; ry: number; rz: number; z: number };

/** Group orientation per shape: the camera angle each scene is seen from. */
const POSES: Pose[] = [
  { rx: 0.35, ry: 0.4, rz: 0.1, z: -0.5 },
  { rx: 0.3, ry: -0.5, rz: 0.04, z: 0 },
  { rx: -0.16, ry: 0.42, rz: -0.03, z: 0.4 },
  { rx: 0.14, ry: -0.36, rz: 0.02, z: 0.3 },
  { rx: 0, ry: 0, rz: 0, z: 0.6 },
];

const vertexShader = /* glsl */ `
  uniform float uP;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uSweep;
  uniform float uFill;
  /** 1 when the viewer prefers reduced motion: no flight or drift. */
  uniform float uCalm;

  attribute vec3 p0;
  attribute vec3 p1;
  attribute vec3 p2;
  attribute vec3 p3;
  attribute vec3 p4;
  attribute vec2 t0;
  attribute vec2 t1;
  attribute vec2 t2;
  attribute vec2 t3;
  attribute vec2 t4;
  attribute float o3;
  attribute float o4;
  attribute vec4 aRnd;

  varying vec3 vColor;
  varying float vAlpha;

  vec3 shapePosition(int i) {
    if (i == 0) return p0;
    if (i == 1) return p1;
    if (i == 2) return p2;
    if (i == 3) return p3;
    return p4;
  }

  vec2 shapeTone(int i) {
    if (i == 0) return t0;
    if (i == 1) return t1;
    if (i == 2) return t2;
    if (i == 3) {
      // Tests resolve in order: dim until the sweep reaches them.
      float done = smoothstep(o3 - 0.03, o3, uSweep);
      return vec2(t3.x * done, mix(0.8, t3.y, done));
    }
    if (o4 < ${(SCORE / 100).toFixed(2)}) {
      // The scored arc fills clockwise from the top.
      float lit = smoothstep(o4 - 0.02, o4, uFill);
      return vec2(t4.x, mix(0.84, t4.y, lit));
    }
    return t4;
  }

  void main() {
    float p = clamp(uP, 0.0, ${LAST.toFixed(1)});
    int i = int(min(floor(p), ${(LAST - 1).toFixed(1)}));
    float f = p - float(i);

    // Hold each shape for the first part of its scroll, then morph with a
    // per-particle delay so the change ripples instead of snapping.
    float m = clamp((f - 0.35) / 0.65, 0.0, 1.0);
    float t = clamp((m - aRnd.x * 0.4) / 0.6, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);

    vec3 pos = mix(shapePosition(i), shapePosition(i + 1), t);

    // Particles lift off their path mid-flight, then settle.
    float flight = sin(t * 3.14159) * (1.0 - uCalm);
    vec3 dir = normalize(aRnd.yzw - 0.5 + 0.0001);
    pos += dir * flight * (0.5 + aRnd.y * 0.9);

    // A slow drift so nothing is ever perfectly still.
    pos += 0.022 * (1.0 - uCalm) * vec3(
      sin(uTime * 0.7 + aRnd.y * 40.0),
      cos(uTime * 0.6 + aRnd.z * 40.0),
      sin(uTime * 0.5 + aRnd.w * 40.0)
    );

    vec2 tone = mix(shapeTone(i), shapeTone(i + 1), t);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * (0.6 + aRnd.z * 0.8) * (1.0 + flight * 0.5);
    gl_PointSize = size * uPixelRatio * (10.0 / -mv.z);

    vColor = mix(vec3(1.0, 0.97, 0.97), vec3(0.78, 0.22, 0.31), tone.x);
    vAlpha = mix(0.9, 0.08, tone.y) * (1.0 - flight * 0.35);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
  }
`;

export type JourneyCallbacks = {
  /** -1 before the first scene forms, then 0–3. */
  onStep: (step: number) => void;
  /** Pinned scroll progress, 0–1. */
  onProgress: (progress: number) => void;
  /** The score as the ring fills, 0–SCORE. */
  onScore: (score: number) => void;
};

export type JourneyOptions = JourneyCallbacks & {
  track: HTMLElement;
  canvas: HTMLCanvasElement;
  /** The hero's knot, pushed back as the journey's copy of it arrives. */
  hero: HTMLElement | null;
  /** The text block. On narrow screens the shape fits in the space above it. */
  copy: HTMLElement | null;
};

/** Rough extent of the largest shape, in world units, for fitting it on screen. */
const SHAPE_WIDTH = 9;
const SHAPE_HEIGHT = 7;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Throws if WebGL is unavailable; the caller falls back to the static story. */
export function createJourney({
  track,
  canvas,
  hero,
  copy,
  onStep,
  onProgress,
  onScore,
}: JourneyOptions) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  const compact = window.matchMedia("(max-width: 767px)").matches;
  const count = compact ? 3600 : 7200;
  const shapes = buildShapes(count);

  const geometry = new BufferGeometry();
  shapes.forEach((shape, index) => {
    geometry.setAttribute(`p${index}`, new BufferAttribute(shape.positions, 3));
    geometry.setAttribute(`t${index}`, new BufferAttribute(shape.tones, 2));
  });
  geometry.setAttribute("o3", new BufferAttribute(shapes[3].order, 1));
  geometry.setAttribute("o4", new BufferAttribute(shapes[4].order, 1));
  // `position` is required by three for bounds; the shader never reads it.
  geometry.setAttribute("position", new BufferAttribute(shapes[0].positions, 3));
  const random = new Float32Array(count * 4);
  for (let i = 0; i < random.length; i++) random[i] = Math.random();
  geometry.setAttribute("aRnd", new BufferAttribute(random, 4));

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uP: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: compact ? 4.2 : 3.9 },
      uPixelRatio: { value: 1 },
      uSweep: { value: 0 },
      uFill: { value: 0 },
      uOpacity: { value: 0 },
      uCalm: { value: 0 },
    },
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // Resolution: capped at 2x, and dropped to 1x if frames run long.
  let maxRatio = 2;

  // Layout: the shape sits right of the copy on wide screens, and in the
  // space above the copy on narrow ones.
  const layout = { x: 0, y: 0, scale: 1 };
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    material.uniforms.uPixelRatio.value = ratio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const visibleHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const visibleWidth = visibleHeight * camera.aspect;
    if (width >= 1024) {
      layout.x = visibleWidth * 0.17;
      layout.y = 0;
      layout.scale = Math.min(1, (visibleWidth * 0.6) / 9);
    } else {
      // Free band between the top of the stage and the top of the copy.
      const canvasTop = canvas.getBoundingClientRect().top;
      const copyTop = copy
        ? copy.getBoundingClientRect().top - canvasTop
        : height * 0.55;
      const band = Math.max(copyTop - 24, height * 0.3);
      const unitsPerPixel = visibleHeight / height;
      layout.x = 0;
      layout.y = (height / 2 - (band / 2 + 12)) * unitsPerPixel;
      layout.scale = Math.min(
        1,
        (visibleWidth * 0.92) / SHAPE_WIDTH,
        (band * unitsPerPixel) / SHAPE_HEIGHT,
      );
    }
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  if (copy) resizeObserver.observe(copy);
  resize();

  // Reduced motion keeps the scroll-driven journey but drops everything that
  // moves on its own: particle flight and drift, ambient sway and parallax.
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let calm = reducedQuery.matches;
  const onReducedChange = () => {
    calm = reducedQuery.matches;
  };
  reducedQuery.addEventListener("change", onReducedChange);

  // Pointer parallax, eased.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function onPointerMove(event: PointerEvent) {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  let current = 0;
  let opacity = 0;
  let lastStep = -2;
  let lastScore = -1;
  let lastHero = -1;
  let frame = 0;
  let running = false;
  const slowFrames: number[] = [];
  let previous = performance.now();
  const start = previous;

  function readScroll() {
    const rect = track.getBoundingClientRect();
    const viewport = window.innerHeight;
    const intro = clamp01((viewport - rect.top) / (viewport - STICKY_TOP));
    const distance = rect.height - (viewport - STICKY_TOP);
    const pinned = clamp01((STICKY_TOP - rect.top) / Math.max(distance, 1));
    return { intro, pinned };
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const elapsed = now - previous;
    const dt = Math.min(elapsed / 1000, 0.25);
    previous = now;

    // If the last 90 frames averaged over 24ms, render at 1x from then on.
    if (maxRatio > 1 && elapsed < 250) {
      slowFrames.push(elapsed);
      if (slowFrames.length > 90) slowFrames.shift();
      const average =
        slowFrames.reduce((sum, value) => sum + value, 0) / slowFrames.length;
      if (slowFrames.length === 90 && average > 24) {
        maxRatio = 1;
        resize();
      }
    }

    const { intro, pinned } = readScroll();
    const target = progressFor(intro, pinned);
    const ease = 1 - Math.exp(-dt * 5);
    current += (target - current) * ease;
    if (Math.abs(target - current) < 0.0005) current = target;
    opacity += (smooth(intro) - opacity) * (1 - Math.exp(-dt * 8));

    if (calm) {
      pointer.tx = 0;
      pointer.ty = 0;
    }
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));

    const time = (now - start) / 1000;
    const u = material.uniforms;
    u.uP.value = current;
    u.uTime.value = time;
    // Exit: over the last stretch of the pin the ring recedes into the
    // smoke and the copy fades, so the next section takes over cleanly.
    const exit = intro >= 1 ? smooth(clamp01((pinned - 0.88) / 0.12)) : 0;
    u.uOpacity.value = opacity * (1 - 0.85 * exit);
    if (copy) copy.style.opacity = exit > 0 ? `${1 - exit}` : "";
    u.uCalm.value = calm ? 1 : 0;
    u.uSweep.value = clamp01((current - 2.75) / 0.55);
    u.uFill.value = clamp01((current - 3.6) / 0.36);

    // Orientation: blend between the two poses around the current morph.
    const index = Math.min(Math.floor(current), LAST - 1);
    const blend = smooth(clamp01((current - index - 0.35) / 0.65));
    const a = POSES[index];
    const b = POSES[index + 1];
    const mix = (from: number, to: number) => from + (to - from) * blend;
    const ambient = calm ? 0 : Math.sin(time * 0.2) * 0.12;
    points.rotation.set(
      mix(a.rx, b.rx) + pointer.y * 0.12,
      mix(a.ry, b.ry) + ambient + pointer.x * 0.2,
      mix(a.rz, b.rz),
    );
    points.position.set(layout.x, layout.y - exit * 0.8, mix(a.z, b.z) - exit * 5);
    points.scale.setScalar(layout.scale);

    renderer.render(scene, camera);

    const step = stepFor(current);
    if (step !== lastStep) {
      lastStep = step;
      onStep(step);
    }
    onProgress(pinned);
    const score = Math.round(u.uFill.value * SCORE);
    if (score !== lastScore) {
      lastScore = score;
      onScore(score);
    }

    // Push the hero's knot back into the dark as the journey's knot arrives.
    if (hero && Math.abs(intro - lastHero) > 0.001) {
      lastHero = intro;
      const k = smooth(intro);
      hero.style.opacity = `${1 - 0.9 * k}`;
      hero.style.transform = `translateY(${-48 * k}px) scale(${1 - 0.06 * k})`;
    }
  }

  function play() {
    if (running) return;
    running = true;
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(frame);
  }

  // Only render while the journey (or its approach) is on screen.
  const visibility = new IntersectionObserver(
    ([entry]) => (entry?.isIntersecting ? play() : pause()),
    { rootMargin: "100% 0px" },
  );
  visibility.observe(track);

  return () => {
    pause();
    visibility.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    reducedQuery.removeEventListener("change", onReducedChange);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    if (hero) {
      hero.style.opacity = "";
      hero.style.transform = "";
    }
    if (copy) copy.style.opacity = "";
  };
}
