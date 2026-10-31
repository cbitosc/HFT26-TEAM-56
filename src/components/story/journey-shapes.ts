/**
 * Target shapes for the How it works particle journey. Every shape places the
 * same number of particles, so the scene can morph one into the next.
 *
 * Each shape returns, per particle:
 * - position (x, y, z) in world units, centred on the origin
 * - tone (accent, dim): accent 0 is white and 1 is crimson; dim 0 is full
 *   brightness and 1 is nearly invisible
 * - order: a 0–1 key the shader uses to light particles in sequence
 *   (the test rows and the score ring)
 */

export type Shape = {
  positions: Float32Array;
  tones: Float32Array;
  order: Float32Array;
};

/** Index of the test row that fails in the evaluation scene. */
export const FAILED_TEST = 2;
/** The score the ring fills to, out of 100. */
export const SCORE = 86;

/** Deterministic PRNG so the shapes are identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function gaussian(rng: Rng) {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function createShape(count: number): Shape {
  return {
    positions: new Float32Array(count * 3),
    tones: new Float32Array(count * 2),
    order: new Float32Array(count),
  };
}

function put(
  shape: Shape,
  i: number,
  x: number,
  y: number,
  z: number,
  accent = 0,
  dim = 0,
  order = 0,
) {
  shape.positions[i * 3] = x;
  shape.positions[i * 3 + 1] = y;
  shape.positions[i * 3 + 2] = z;
  shape.tones[i * 2] = accent;
  shape.tones[i * 2 + 1] = dim;
  shape.order[i] = order;
}

/** Random permutation, so particles travel to unrelated places between shapes. */
function shuffled(count: number, rng: Rng) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

type Segment = { x0: number; x1: number; y: number; accent?: number; dim?: number };

/** Spreads particles along horizontal segments, weighted by segment length. */
function fillSegments(
  shape: Shape,
  slots: number[],
  segments: Segment[],
  rng: Rng,
  jitter = 0.018,
) {
  const lengths = segments.map((s) => s.x1 - s.x0);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let cursor = 0;
  segments.forEach((segment, index) => {
    const share =
      index === segments.length - 1
        ? slots.length - cursor
        : Math.round((lengths[index] / total) * slots.length);
    for (let k = 0; k < share && cursor < slots.length; k++, cursor++) {
      put(
        shape,
        slots[cursor],
        segment.x0 + rng() * (segment.x1 - segment.x0),
        segment.y + gaussian(rng) * jitter,
        gaussian(rng) * jitter,
        segment.accent ?? 0,
        segment.dim ?? 0,
      );
    }
  });
}

/** Shape 0: the hero's particle knot, a (2, 3) torus knot with a crimson band. */
function knot(count: number, rng: Rng): Shape {
  const shape = createShape(count);
  const slots = shuffled(count, rng);
  const curve = (t: number) => {
    const r = 2 + 0.9 * Math.cos(3 * t);
    return [r * Math.cos(2 * t), r * Math.sin(2 * t), -0.9 * Math.sin(3 * t)];
  };
  const tube = 0.46;
  const e = 0.001;

  for (let k = 0; k < count; k++) {
    const u = rng();
    const t = u * Math.PI * 2;
    const c = curve(t);
    const a = curve(t - e);
    const b = curve(t + e);
    // Frame around the curve: tangent, then curvature normal and binormal.
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    let tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let nx = a[0] + b[0] - 2 * c[0];
    let ny = a[1] + b[1] - 2 * c[1];
    let nz = a[2] + b[2] - 2 * c[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;

    const angle = rng() * Math.PI * 2;
    const radius = tube * (0.82 + 0.18 * Math.sqrt(rng()));
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;
    const band = u < 0.14;
    put(
      shape,
      slots[k],
      c[0] + nx * cos + bx * sin,
      c[1] + ny * cos + by * sin,
      c[2] + nz * cos + bz * sin,
      band || rng() < 0.03 ? 1 : 0,
      band ? 0 : rng() * 0.35,
    );
  }
  return shape;
}

/** Shape 1: projects as clusters, sized by how much work each holds. */
function portfolio(count: number, rng: Rng): Shape {
  const shape = createShape(count);
  const slots = shuffled(count, rng);
  // Commits per project; the first is the project the challenge comes from.
  const weights = [212, 164, 97, 340, 88, 41];
  const total = weights.reduce((sum, value) => sum + value, 0);
  const centers = weights.map((_, index) => {
    const angle = (index / weights.length) * Math.PI * 2 + 0.5;
    return {
      x: Math.cos(angle) * 3.4,
      y: Math.sin(angle * 2) * 0.9 + (index % 2 ? 0.5 : -0.4),
      z: Math.sin(angle) * 2.4,
    };
  });

  const threadShare = 0.14;
  const clusterCount = Math.round(count * (1 - threadShare));
  let cursor = 0;

  weights.forEach((weight, index) => {
    const share =
      index === weights.length - 1
        ? clusterCount - cursor
        : Math.round((weight / total) * clusterCount);
    const radius = 0.35 + Math.sqrt(weight / total) * 1.15;
    const c = centers[index];
    for (let k = 0; k < share; k++, cursor++) {
      const r = radius * Math.cbrt(rng()) * (0.6 + 0.4 * rng());
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      put(
        shape,
        slots[cursor],
        c.x + r * Math.sin(phi) * Math.cos(theta),
        c.y + r * Math.cos(phi),
        c.z + r * Math.sin(phi) * Math.sin(theta),
        index === 0 ? 1 : 0,
        0.15 + rng() * 0.25,
      );
    }
  });

  // Faint threads: skills shared between projects.
  const links: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 5],
  ];
  for (; cursor < count; cursor++) {
    const [a, b] = links[Math.floor(rng() * links.length)];
    const t = rng();
    const from = centers[a];
    const to = centers[b];
    put(
      shape,
      slots[cursor],
      from.x + (to.x - from.x) * t + gaussian(rng) * 0.03,
      from.y + (to.y - from.y) * t + gaussian(rng) * 0.03,
      from.z + (to.z - from.z) * t + gaussian(rng) * 0.03,
      a === 0 ? 0.6 : 0,
      0.72,
    );
  }
  return shape;
}

/** Shape 2: the generated challenge as lines of code. */
function code(count: number, rng: Rng): Shape {
  const shape = createShape(count);
  const slots = shuffled(count, rng);
  const indents = [0, 1, 1, 1, 2, 2, 3, 3, 3, 2, 1, 1, 0, 0];
  const highlighted = new Set([5, 6, 7]);
  const lineHeight = 0.46;
  const top = ((indents.length - 1) * lineHeight) / 2;
  const segments: Segment[] = [];

  indents.forEach((indent, line) => {
    const y = top - line * lineHeight;
    let x = -3 + indent * 0.5;
    const tokens = 2 + Math.floor(rng() * 4);
    for (let t = 0; t < tokens; t++) {
      const length = 0.25 + rng() * 0.95;
      segments.push({
        x0: x,
        x1: x + length,
        y,
        accent: highlighted.has(line) ? 1 : 0,
        dim: highlighted.has(line) ? 0 : 0.18,
      });
      x += length + 0.2;
    }
    // Line number in the gutter.
    segments.push({ x0: -3.8, x1: -3.6, y, dim: 0.75 });
  });

  fillSegments(shape, slots, segments, rng, 0.016);
  return shape;
}

/** Shape 3: the test run. Rows light up in order; one fails. */
function tests(count: number, rng: Rng): Shape {
  const shape = createShape(count);
  const slots = shuffled(count, rng);
  const rows = 7;
  const gap = 0.72;
  const top = ((rows - 1) * gap) / 2;
  const nameLengths = [3.6, 2.9, 4.4, 3.3, 3.9, 2.6, 4.8];
  let cursor = 0;

  for (let row = 0; row < rows; row++) {
    const y = top - row * gap;
    const failed = row === FAILED_TEST;
    const share =
      row === rows - 1 ? count - cursor : Math.floor(count / rows);
    const markerShare = Math.floor(share * 0.16);
    const timeShare = Math.floor(share * 0.08);

    for (let k = 0; k < share; k++, cursor++) {
      let x: number;
      let py: number;
      if (k < markerShare) {
        // Status marker: a small square.
        x = -3.6 + (rng() - 0.5) * 0.26;
        py = y + (rng() - 0.5) * 0.26;
      } else if (k < markerShare + timeShare) {
        // Duration, at the right edge.
        x = 3.1 + rng() * 0.45;
        py = y + gaussian(rng) * 0.02;
      } else {
        // Test name.
        x = -3.1 + rng() * nameLengths[row];
        py = y + gaussian(rng) * 0.02;
      }
      // Each row fills left to right, then the next row starts.
      const along = (x + 3.8) / 7.6;
      put(
        shape,
        slots[cursor],
        x,
        py,
        gaussian(rng) * 0.02,
        failed ? 1 : 0,
        0,
        (row + Math.min(Math.max(along, 0), 1) * 0.6) / rows,
      );
    }
  }
  return shape;
}

/** Shape 4: the report as a score ring that fills to SCORE. */
function ring(count: number, rng: Rng): Shape {
  const shape = createShape(count);
  const slots = shuffled(count, rng);
  const radius = 2.7;
  const main = Math.round(count * 0.74);
  const inner = Math.round(count * 0.14);
  let cursor = 0;

  for (; cursor < main; cursor++) {
    const a = rng();
    const angle = Math.PI / 2 - a * Math.PI * 2;
    const r = radius + gaussian(rng) * 0.06;
    const filled = a < SCORE / 100;
    put(
      shape,
      slots[cursor],
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      gaussian(rng) * 0.06,
      filled ? 0 : 0.8,
      filled ? 0 : 0.78,
      a,
    );
  }
  for (let k = 0; k < inner; k++, cursor++) {
    const angle = rng() * Math.PI * 2;
    const r = radius - 0.55 + gaussian(rng) * 0.02;
    put(shape, slots[cursor], Math.cos(angle) * r, Math.sin(angle) * r, 0, 0, 0.86, 2);
  }
  for (; cursor < count; cursor++) {
    // Loose dust around the ring.
    const angle = rng() * Math.PI * 2;
    const r = radius + 0.5 + rng() * 1.8;
    put(
      shape,
      slots[cursor],
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      gaussian(rng) * 0.6,
      rng() < 0.3 ? 1 : 0,
      0.88,
      2,
    );
  }
  return shape;
}

const SEED = 20261031;

/** The hero's knot. Identical to the journey's first shape for the same count. */
export function buildKnot(count: number): Shape {
  return knot(count, mulberry32(SEED));
}

export function buildShapes(count: number): Shape[] {
  const rng = mulberry32(SEED);
  return [
    knot(count, rng),
    portfolio(count, rng),
    code(count, rng),
    tests(count, rng),
    ring(count, rng),
  ];
}
