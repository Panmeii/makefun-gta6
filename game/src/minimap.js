// minimap.js — the bottom-left map of Marisol Bay: roads, shore and water,
// gold token dots, the mission marker, phone booths and shop pins, flashing
// police blips and Dario's white arrow. North-up, whole-city, always on.

import { RC, WORLD_W, WORLD_H, WATER_Y, BEACH_Y } from './city.js';
import { darkness } from './daynight.js';

const SIZE = 196;
const SCALE = SIZE / WORLD_H; // fit the taller axis; x uses the same scale

export function drawMinimap(ctx, G) {
  const H = G.canvas.height;
  const ox = 14, oy = H - SIZE - 14;
  const px = (x) => ox + x * SCALE;
  const py = (y) => oy + y * SCALE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, SIZE, SIZE);
  ctx.clip();
  // sea and land
  ctx.fillStyle = '#1d5f8a';
  ctx.fillRect(ox, oy, SIZE, SIZE);
  ctx.fillStyle = darkness(G.hour) > 0.5 ? '#4c5546' : '#77875f';
  ctx.fillRect(ox, oy, SIZE, WATER_Y * SCALE);
  ctx.fillStyle = '#d9bd85';
  ctx.fillRect(ox, py(BEACH_Y), SIZE, (WATER_Y - BEACH_Y) * SCALE);
  // roads
  ctx.strokeStyle = 'rgba(30,32,38,0.85)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const c of RC) {
    ctx.moveTo(px(c), oy); ctx.lineTo(px(c), py(WATER_Y));
    ctx.moveTo(ox, py(c)); ctx.lineTo(ox + SIZE, py(c));
  }
  ctx.stroke();
  // tokens
  ctx.fillStyle = '#ffd76a';
  const spots = G.tokenSpots ?? [];
  for (let i = 0; i < spots.length; i++) {
    if (G.tokensCollected.has(i)) continue;
    ctx.fillRect(px(spots[i].x) - 1, py(spots[i].y) - 1, 2, 2);
  }
  // fixed pins: shops and phones
  const L = G.city.locations;
  ctx.fillStyle = '#f2f0e6';
  ctx.fillRect(px(L.gunShop.doorX) - 2, py(L.gunShop.doorY) - 2, 4, 4);
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(px(L.workshop.doorX) - 2, py(L.workshop.doorY) - 2, 4, 4);
  // police blips flash blue/red
  const flash = (G.time * 2.4) % 1 < 0.5;
  for (const car of G.cars) {
    if (!car.police || car.dead || car.wrecked) continue;
    ctx.fillStyle = flash ? '#ff5040' : '#4d7cff';
    ctx.beginPath(); ctx.arc(px(car.x), py(car.y), 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // objective marker
  if (G.marker) {
    const pulse = 3 + Math.sin(G.time * 5) * 1.1;
    ctx.fillStyle = G.marker.color ?? '#ffd76a';
    ctx.beginPath(); ctx.arc(px(G.marker.x), py(G.marker.y), pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(px(G.marker.x), py(G.marker.y), pulse + 2.4, 0, Math.PI * 2); ctx.stroke();
  }
  // player arrow
  const p = G.player;
  ctx.translate(px(p.x), py(p.y));
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4.4, -3.6); ctx.lineTo(-4.4, 3.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // frame
  ctx.strokeStyle = 'rgba(10,12,24,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox, oy, SIZE, SIZE);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 1.5, oy + 1.5, SIZE - 3, SIZE - 3);
  void WORLD_W;
}
