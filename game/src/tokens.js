// tokens.js — fifty golden "Sol Tokens" scattered over Marisol Bay: along the
// promenade, around the marina and lighthouse, in plazas, car parks and side
// streets. Each one pays a small bounty and ticks the HUD counter; the set is
// saved, so a completion run survives across sessions.

import { mulberry32, dist } from './util.js';
import { RC, PROMENADE_Y, BEACH_Y, WORLD_W } from './city.js';

export const TOKEN_COUNT = 50;

export function tokenPositions(G) {
  if (G.tokenSpots) return G.tokenSpots;
  const rng = mulberry32(777);
  const spots = [];
  const L = G.city.locations;
  // hand-placed at landmarks
  spots.push(
    { x: L.lighthouse.x - 70, y: L.lighthouse.y + 30 },
    { x: L.luluKiosk.x - 60, y: L.luluKiosk.y - 24 },
    { x: L.hotel.doorX + 60, y: L.hotel.doorY + 10 },
    { x: L.policeStation.doorX + 80, y: L.policeStation.doorY },
    { x: L.workshop.doorX - 90, y: L.workshop.doorY + 16 },
    { x: 3200, y: 4560 }, { x: 3560, y: 4620 }, // on the piers
  );
  // a promenade line
  for (let x = 320; x < WORLD_W - 200 && spots.length < 20; x += 330) {
    spots.push({ x: x + rng() * 60, y: PROMENADE_Y + 34 + rng() * 26 });
  }
  // beach scatter
  while (spots.length < 27) {
    spots.push({ x: 200 + rng() * (WORLD_W - 400), y: BEACH_Y + 20 + rng() * 90 });
  }
  // city scatter: rejection-sampled onto walkable ground (not in buildings, not in water)
  let guard = 0;
  while (spots.length < TOKEN_COUNT && guard++ < 3000) {
    const x = 80 + rng() * (WORLD_W - 160), y = 80 + rng() * 4200;
    if (G.city.isWater(x, y)) continue;
    let inside = false;
    for (const b of G.city.buildings) {
      if (x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 8) { inside = true; break; }
    }
    if (inside) continue;
    if (spots.some((s) => dist(s.x, s.y, x, y) < 130)) continue;
    spots.push({ x, y });
  }
  void RC;
  G.tokenSpots = spots.slice(0, TOKEN_COUNT);
  return G.tokenSpots;
}

export function updateTokens(G, dt) {
  const spots = tokenPositions(G);
  const p = G.player;
  for (let i = 0; i < spots.length; i++) {
    if (G.tokensCollected.has(i)) continue;
    const s = spots[i];
    if (dist(p.x, p.y, s.x, s.y) < 36) {
      G.tokensCollected.add(i);
      G.stats.tokensFound++;
      G.addMoney(25, s.x, s.y - 10);
      G.audio.pickup();
      G.particles.burst(s.x, s.y, 10, { color: ['#ffd76a', '#f7c548', '#fff3b0'], spLo: 20, spHi: 90, lifeLo: 0.25, lifeHi: 0.55, sizeLo: 1.6, sizeHi: 3 });
      G.saveSoon();
    }
  }
  void dt;
}

export function drawTokens(ctx, G) {
  const spots = tokenPositions(G);
  const v = G.view;
  for (let i = 0; i < spots.length; i++) {
    if (G.tokensCollected.has(i)) continue;
    const s = spots[i];
    if (s.x < v.x0 - 30 || s.x > v.x1 + 30 || s.y < v.y0 - 30 || s.y > v.y1 + 30) continue;
    const spin = Math.abs(Math.cos(G.time * 2.6 + i * 1.7));
    const bob = Math.sin(G.time * 2 + i) * 2.4;
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.scale(0.35 + spin * 0.65, 1);
    ctx.fillStyle = '#f7c548';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a87b1e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#7a5410';
    ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('S', 0, 3.5);
    ctx.restore();
  }
}
