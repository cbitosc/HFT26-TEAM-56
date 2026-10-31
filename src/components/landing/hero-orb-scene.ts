/**
 * The hero's particle knot. It turns slowly, leans toward the pointer and
 * pushes particles away from it. Loaded on demand by HeroOrb.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  Plane,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { buildKnot } from "@/components/story/journey-shapes";

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uPush;
  uniform float uCalm;
  /** 0 while scattered, 1 once the knot has formed (the opening). */
  uniform float uAssemble;

  attribute vec2 tone;
  attribute vec4 aRnd;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Opening: every particle flies in from a wide scatter, each with its own
    // delay, so the knot condenses out of the dark.
    float delay = aRnd.x * 0.45;
    float t = clamp((uAssemble - delay) / (1.0 - 0.45), 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec3 scatter = (aRnd.yzw - 0.5) * vec3(16.0, 10.0, 12.0);
    vec3 pos = mix(scatter, position, t);

    // Push particles away from the pointer, strongest at its centre.
    vec3 away = pos - uPointer;
    float dist = length(away);
    float push = uPush * smoothstep(1.7, 0.0, dist);
    pos += normalize(away + 0.0001) * push * (0.7 + aRnd.x * 0.6);

    pos += 0.03 * (1.0 - uCalm) * vec3(
      sin(uTime * 0.8 + aRnd.y * 40.0),
      cos(uTime * 0.7 + aRnd.z * 40.0),
      sin(uTime * 0.6 + aRnd.w * 40.0)
    );

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aRnd.z * 0.8) * (1.0 + push * 0.6) * uPixelRatio * (10.0 / -mv.z);

    // Disturbed particles warm toward crimson.
    float accent = clamp(tone.x + push * 0.9, 0.0, 1.0);
    vColor = mix(vec3(1.0, 0.97, 0.97), vec3(0.78, 0.22, 0.31), accent);
    vAlpha = mix(0.9, 0.12, tone.y) * (0.25 + 0.75 * t);
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

/** Throws if WebGL is unavailable; the caller leaves the space empty. */
export function createHeroOrb(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  const compact = window.matchMedia("(max-width: 767px)").matches;
  const count = compact ? 3600 : 7200;
  const shape = buildKnot(count);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(shape.positions, 3));
  geometry.setAttribute("tone", new BufferAttribute(shape.tones, 2));
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
      uTime: { value: 0 },
      uSize: { value: compact ? 4.4 : 4.2 },
      uPixelRatio: { value: 1 },
      uPointer: { value: new Vector3(99, 99, 0) },
      uPush: { value: 0 },
      uCalm: { value: 0 },
      uOpacity: { value: 0 },
      uAssemble: { value: 0 },
    },
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    material.uniforms.uPixelRatio.value = ratio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Fit the knot (about 7 units across) to the shorter side.
    const visibleHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const fit = Math.min(visibleHeight, visibleHeight * camera.aspect) / 7.4;
    points.scale.setScalar(fit);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Pointer: tracked across the page so the knot leans toward it from
  // anywhere, and pushes particles when it is over the knot itself.
  const ndc = new Vector2(0, 0);
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  let inside = false;
  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
    inside = Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
    lean.tx = Math.max(-1, Math.min(1, ndc.x));
    lean.ty = Math.max(-1, Math.min(1, ndc.y));
  }
  function onPointerLeave() {
    inside = false;
    lean.tx = 0;
    lean.ty = 0;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();

  let frame = 0;
  let running = false;
  let previous = performance.now();
  let spin = 0;
  const start = previous;

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    const calm = reducedQuery.matches;
    const u = material.uniforms;

    u.uTime.value = (now - start) / 1000;
    u.uCalm.value = calm ? 1 : 0;
    u.uOpacity.value += (1 - u.uOpacity.value) * (1 - Math.exp(-dt * 2.5));
    // The opening runs once, over about 1.8s; reduced motion skips it.
    u.uAssemble.value = calm ? 1 : Math.min(u.uAssemble.value + dt / 1.8, 1);

    const ease = 1 - Math.exp(-dt * 4);
    lean.x += (lean.tx - lean.x) * ease;
    lean.y += (lean.ty - lean.y) * ease;
    if (!calm) spin += dt * 0.18;

    points.rotation.set(0.35 - lean.y * 0.35, spin + lean.x * 0.5, 0.1);
    points.updateMatrixWorld();

    // Pointer position in the knot's own space, on the plane through its centre.
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      points.worldToLocal(hit);
      (u.uPointer.value as Vector3).lerp(hit, 1 - Math.exp(-dt * 12));
    }
    const targetPush = inside ? 0.9 : 0;
    u.uPush.value += (targetPush - u.uPush.value) * (1 - Math.exp(-dt * 5));

    renderer.render(scene, camera);
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

  const visibility = new IntersectionObserver(([entry]) =>
    entry?.isIntersecting ? play() : pause(),
  );
  visibility.observe(canvas);

  return () => {
    pause();
    visibility.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
