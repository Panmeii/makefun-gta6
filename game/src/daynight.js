// daynight.js — Marisol Bay's clock and weather: a full day in twelve minutes,
// golden-hour tints, night darkness with lit windows, streetlight pools and car
// headlight cones, plus occasional tropical rain showers that roll in and pass.

import { clamp, lerp } from './util.js';

export const DAY_LENGTH = 720; // real seconds per 24 game hours

export function makeWeather() {
  return { state: 'clear', timer: 40 + Math.random() * 50, intensity: 0, drops: [] };
}

export function updateWeather(G, dt) {
  const w = G.weather;
  w.timer -= dt;
  if (w.state === 'clear' && w.timer <= 0) { w.state = 'rain'; w.timer = 26 + Math.random() * 30; G.audio.rain(true); }
  else if (w.state === 'rain' && w.timer <= 0) { w.state = 'clear'; w.timer = 55 + Math.random() * 70; G.audio.rain(false); }
  const target = w.state === 'rain' ? 1 : 0;
  w.intensity += (target - w.intensity) * Math.min(1, dt * 0.7);
  // rain streaks around the camera
  if (w.intensity > 0.05 && Math.random() < w.intensity) {
    const v = G.view;
    for (let i = 0; i < 3; i++) {
      G.particles.spawn(v.x0 + Math.random() * (v.x1 - v.x0), v.y0 - 10, {
        vx: -60, vy: 620, life: 0.75, size: 1.3, color: '#a8c8e8', alpha: 0.5 * w.intensity,
      });
    }
  }
}

// 0 at full day, 1 at deepest night; smooth shoulders at dawn and dusk.
export function darkness(hour) {
  if (hour >= 7 && hour <= 17.5) return 0;
  if (hour > 17.5 && hour < 20) return (hour - 17.5) / 2.5;
  if (hour >= 20 || hour <= 4.5) return 1;
  return 1 - (hour - 4.5) / 2.5; // 4.5 → 7 dawn
}

export function skyTint(hour) {
  // returns [r, g, b, alpha] of the colour wash laid over the world
  const d = darkness(hour);
  if (hour > 17 && hour < 20.5) { // sunset gold
    const t = 1 - Math.abs(hour - 18.8) / 1.8;
    return [255, 130, 50, 0.11 * Math.max(0, t) + 0.22 * d];
  }
  if (hour > 4.5 && hour < 7.5) return [255, 170, 90, 0.10 * (1 - d) + 0.3 * d];
  return [10, 14, 46, 0.42 * d];
}

export function drawNightOverlay(G, ctx) {
  const d = darkness(G.hour);
  const [r, g, b, a] = skyTint(G.hour);
  const v = G.view;
  ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
  ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  if (G.weather.intensity > 0.03) {
    ctx.fillStyle = `rgba(40,55,80,${(0.14 * G.weather.intensity).toFixed(3)})`;
    ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  }
  if (d <= 0.04) return;
  // streetlight pools along the roads
  const grad = G.lightSprite;
  for (const s of G.city.streetlights) {
    if (s.x < v.x0 - 90 || s.x > v.x1 + 90 || s.y < v.y0 - 90 || s.y > v.y1 + 90) continue;
    ctx.globalAlpha = 0.34 * d;
    ctx.drawImage(grad, s.x - 85, s.y - 85, 170, 170);
  }
  ctx.globalAlpha = 1;
  // lit windows on the buildings in view
  ctx.fillStyle = '#ffd98a';
  for (const b of G.city.buildings) {
    if (b.x + b.w < v.x0 || b.x > v.x1 || b.y + b.h < v.y0 || b.y > v.y1) continue;
    const cols = Math.max(1, (b.w / 26) | 0), rows = Math.max(1, (b.h / 26) | 0);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const seed = Math.sin(b.x * 12.9898 + b.y * 78.233 + i * 37.7 + j * 17.3) * 43758.5453;
      if ((seed - Math.floor(seed)) > 0.42) continue; // ~58% of windows lit
      ctx.globalAlpha = 0.75 * d;
      ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 9, 6);
    }
  }
  ctx.globalAlpha = 1;
}

export function makeLightSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,140,0.85)');
  grad.addColorStop(0.55, 'rgba(255,190,110,0.28)');
  grad.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export function headlightCone(ctx, x, y, ang, len = 120) {
  const spread = 0.34;
  const grad = ctx.createRadialGradient(x, y, 6, x, y, len);
  grad.addColorStop(0, 'rgba(255,240,190,0.30)');
  grad.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, len, ang - spread, ang + spread);
  ctx.closePath();
  ctx.fill();
}

export function advanceClock(G, dt) {
  G.hour = (G.hour + (dt / DAY_LENGTH) * 24) % 24;
}
export function lerpHour(a, b, t) { return lerp(a, b, t); }
export { clamp };
