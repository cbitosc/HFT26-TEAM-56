/**
 * Background atmosphere: slow burgundy smoke, a key light from the upper left
 * falling through it in soft beams, and a faint light that follows the
 * pointer. One full-screen fragment shader in plain WebGL, rendered at
 * reduced resolution (smoke is soft, so it is never noticed) and scaled up.
 */

const vertexSource = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentSource = `
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uScroll;
uniform vec2 uPointer;
uniform float uPointerStrength;

const vec3 NOIR = vec3(0.031, 0.031, 0.031);
const vec3 NOIR_WARM = vec3(0.09, 0.078, 0.086);
const vec3 WINE = vec3(0.392, 0.118, 0.176);
const vec3 CRIMSON = vec3(0.659, 0.196, 0.275);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.02 + 17.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Smoke: domain-warped noise, drifting slowly and lifting with the scroll.
  float t = uTime * 0.025;
  vec2 q = p * 1.6 + vec2(0.0, uScroll * 0.35);
  vec2 warp = vec2(fbm(q + vec2(t, -t * 0.6)), fbm(q + vec2(5.2 - t * 0.7, 1.3 + t)));
  float smoke = fbm(q + 1.8 * warp + vec2(t * 0.4, 0.0));
  smoke = smoothstep(0.4, 0.95, smoke);

  // Key light just off the top left corner, with soft beams fanning out.
  vec2 lightPos = vec2(-0.1 * aspect, 1.15);
  vec2 toLight = p - lightPos;
  float dist = length(toLight);
  float angle = atan(toLight.y, toLight.x);
  float beams = fbm(vec2(angle * 5.0, t * 1.5));
  beams = smoothstep(0.35, 0.85, beams);
  float falloff = exp(-dist * 1.15);
  float key = falloff * (0.45 + 0.55 * beams);

  // A dimmer fill from the lower right keeps the far side from going flat.
  float fill = exp(-length(p - vec2(1.1 * aspect, -0.15)) * 1.8) * 0.35;

  // The pointer lights the smoke near it.
  vec2 pointer = vec2(uPointer.x * aspect, uPointer.y);
  float glow = exp(-pow(length(p - pointer) * 4.5, 2.0)) * uPointerStrength;

  float light = key + fill + glow * 0.45;

  vec3 color = mix(NOIR, NOIR_WARM, smoothstep(0.0, 1.0, uv.y) * 0.5);
  color += WINE * smoke * light * 0.8;
  color += CRIMSON * pow(smoke, 2.0) * (key * 0.18 + glow * 0.3);
  // Haze: light scattering in clear air, never touching the smoke's shape.
  color += WINE * light * 0.07;

  // Vignette, heavier at the bottom so the page settles into black.
  float vignette = smoothstep(1.25, 0.25, length((uv - vec2(0.45, 0.55)) * vec2(1.0, 1.15)));
  color *= mix(0.55, 1.0, vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Shader could not be created");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * Throws if WebGL is unavailable; the CSS atmosphere underneath stays.
 * `onLost` fires if the context is lost later, so the caller can hide the
 * canvas: a lost canvas paints blank, not dark.
 */
export function createSmoke(
  canvas: HTMLCanvasElement,
  onReady: () => void,
  onLost: () => void,
) {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    depth: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("WebGL unavailable");
  if (gl.isContextLost()) throw new Error("WebGL context lost");

  const program = gl.createProgram();
  if (!program) throw new Error("Program could not be created");
  const vertexShader = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Program failed to link");
  }
  gl.useProgram(program);

  // One triangle that covers the screen.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    time: gl.getUniformLocation(program, "uTime"),
    scroll: gl.getUniformLocation(program, "uScroll"),
    pointer: gl.getUniformLocation(program, "uPointer"),
    pointerStrength: gl.getUniformLocation(program, "uPointerStrength"),
  };

  // Rendered at a fraction of CSS pixels; drops further if frames run long.
  let scale = 0.5;
  function resize() {
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl!.viewport(0, 0, width, height);
    }
    gl!.uniform2f(uniforms.resolution, width, height);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = { x: 0.3, y: 0.7, tx: 0.3, ty: 0.7, strength: 0, target: 0 };
  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointer.tx = event.clientX / window.innerWidth;
    pointer.ty = 1 - event.clientY / window.innerHeight;
    pointer.target = 1;
  }
  function onPointerLeave() {
    pointer.target = 0;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  function onContextLost() {
    cancelAnimationFrame(frame);
    onLost();
  }
  canvas.addEventListener("webglcontextlost", onContextLost);

  let frame = 0;
  let previous = performance.now();
  let clock = 0;
  let scroll = 0;
  let ready = false;
  const frameTimes: number[] = [];

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const elapsed = now - previous;
    const dt = Math.min(elapsed / 1000, 0.1);
    previous = now;

    // Frozen smoke for reduced motion; pointer light still answers the mouse.
    if (!reducedQuery.matches) clock += dt;

    const ease = 1 - Math.exp(-dt * 3);
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
    pointer.strength += (pointer.target - pointer.strength) * (1 - Math.exp(-dt * 2));
    const targetScroll = window.scrollY / window.innerHeight;
    scroll += (targetScroll - scroll) * (1 - Math.exp(-dt * 6));

    gl!.uniform1f(uniforms.time, clock);
    gl!.uniform1f(uniforms.scroll, scroll);
    gl!.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl!.uniform1f(uniforms.pointerStrength, pointer.strength);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    if (!ready) {
      ready = true;
      onReady();
    }

    // If 60 frames average over 28ms, render at a lower resolution.
    if (scale > 0.3 && elapsed < 250) {
      frameTimes.push(elapsed);
      if (frameTimes.length > 60) frameTimes.shift();
      const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
      if (frameTimes.length === 60 && average > 28) {
        scale = 0.3;
        frameTimes.length = 0;
        resize();
      }
    }
  }
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    // Free what this run created but keep the context: Next.js keeps a page
    // it navigates away from mounted (hidden) and reuses this same canvas on
    // the way back, and a deliberately lost context would paint it blank.
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  };
}
