// util.js — small shared helpers for Marisol Heat: maths, angles, seeded randomness,
// formatting and the circle-vs-building collision resolution every mover uses.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.hypot(dx, dy); }
export function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }

export function angNorm(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function angDiff(a, b) { return angNorm(b - a); }
export function angLerp(a, b, t) { return a + angDiff(a, b) * clamp(t, 0, 1); }
export function angToward(a, target, maxStep) {
  const d = angDiff(a, target);
  return a + clamp(d, -maxStep, maxStep);
}

export function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
export function randi(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
export function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function chance(p) { return Math.random() < p; }

// Deterministic RNG for city generation, so Marisol Bay is the same city on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(hours) {
  const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Push a circle (entity with x, y, r) out of an axis-aligned rect; returns true on contact.
export function pushOutOfRect(e, r) {
  const nx = clamp(e.x, r.x, r.x + r.w), ny = clamp(e.y, r.y, r.y + r.h);
  const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
  if (d2 > e.r * e.r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2), push = (e.r - d) / d;
    e.x += dx * push; e.y += dy * push;
  } else {
    // centre inside the rect: leave through the nearest face
    const left = e.x - r.x, right = r.x + r.w - e.x, top = e.y - r.y, bot = r.y + r.h - e.y;
    const m = Math.min(left, right, top, bot);
    if (m === left) e.x = r.x - e.r; else if (m === right) e.x = r.x + r.w + e.r;
    else if (m === top) e.y = r.y - e.r; else e.y = r.y + r.h + e.r;
  }
  return true;
}

export function pointInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
