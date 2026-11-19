// render.js — the frame painter. Camera follows Dario with a speed lead and
// a speed zoom, the static city comes from pre-rendered chunks, entities are
// culled to the view, and everything is ordered ground-up: skids, tokens,
// markers, cars, people sorted by depth, bullets, particles, the night
// overlay, headlight cones — then HUD, minimap, shop and state screens.

import { drawChunks } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { drawTokens } from './tokens.js';
import { drawBullets } from './combat.js';
import { drawNightOverlay, darkness, headlightCone } from './daynight.js';
import { drawHUD } from './hud.js';
import { drawMinimap } from './minimap.js';
import { shop } from './shop.js';
import { JOB_DEFS } from './jobs.js';
import { MISSIONS } from './missions.js';
import { fmtMoney, clamp, lerp } from './util.js';
import { hasSave } from './save.js';

export const cam = { x: 2280, y: 4240, zoom: 0.92 };

export function updateCamera(G, dt) {
  const W = G.canvas.width, H = G.canvas.height;
  if (G.state === 'menu') {
    // slow drift along the promenade and up into Centro Coral
    const t = G.time * 0.014;
    cam.x = 2280 + Math.sin(t) * 900;
    cam.y = 4000 - (Math.sin(t * 0.6) * 0.5 + 0.5) * 1500;
    cam.zoom = lerp(cam.zoom, 0.9, 1 - Math.exp(-dt * 2));
  } else {
    const p = G.player;
    const speed = p.car ? Math.abs(p.car.speed) : 0;
    const lead = p.car ? clamp(speed * 0.55, 0, 190) : 0;
    const tx = p.x + Math.cos(p.angle) * lead;
    const ty = p.y + Math.sin(p.angle) * lead;
    const k = 1 - Math.exp(-dt * 5.2);
    cam.x = lerp(cam.x, tx, k);
    cam.y = lerp(cam.y, ty, k);
    const targetZoom = p.car ? clamp(1.02 - speed / 620, 0.74, 1.0) : 1.0;
    cam.zoom = lerp(cam.zoom, targetZoom, 1 - Math.exp(-dt * 2.4));
  }
  const hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom;
  G.view = { x0: cam.x - hw - 60, y0: cam.y - hh - 60, x1: cam.x + hw + 60, y1: cam.y + hh + 60 };
}

export function draw(G) {
  const ctx = G.ctx, W = G.canvas.width, H = G.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#173d5c';
  ctx.fillRect(0, 0, W, H);
  const shx = G.shake > 0.1 ? (Math.random() - 0.5) * G.shake * 2 : 0;
  const shy = G.shake > 0.1 ? (Math.random() - 0.5) * G.shake * 2 : 0;
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shx, -cam.y + shy);
  const v = G.view;
  drawChunks(ctx, G.city, v);
  G.particles.drawSkids(ctx, v);
  drawTokens(ctx, G);
  drawBeacon(ctx, G);
  drawPhones(ctx, G);
  // entities, depth-sorted people around the cars
  for (const car of G.cars) if (!car.dead && car.x > v.x0 - 80 && car.x < v.x1 + 80 && car.y > v.y0 - 80 && car.y < v.y1 + 80) drawCar(ctx, G, car);
  const folk = [];
  for (const ped of G.peds) if (!ped.dead && ped.x > v.x0 && ped.x < v.x1 && ped.y > v.y0 && ped.y < v.y1) folk.push(ped);
  if (G.state !== 'menu') folk.push(G.player);
  folk.sort((a, b) => a.y - b.y);
  for (const e of folk) {
    if (e.kind === 'player') drawPlayer(ctx, G);
    else drawPed(ctx, G, e);
  }
  drawBullets(ctx, G);
  G.particles.draw(ctx, v);
  drawFloaters(ctx, G);
  drawNightOverlay(G, ctx);
  drawHeadlights(ctx, G);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (G.state !== 'menu') {
    drawMinimap(ctx, G);
    drawHUD(ctx, G);
  }
  shop.draw(ctx, G);
  drawScreens(ctx, G);
}

function drawPlayer(ctx, G) {
  const p = G.player;
  const dark = darkness(G.hour) > 0.55;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 5, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  const step = Math.sin(p.walkPhase) * (p.speed > 1 ? 3.4 : 0);
  ctx.fillStyle = '#22303e';
  ctx.fillRect(-2 + step * 0.4, -7.5, 5, 4.4);
  ctx.fillRect(-2 - step * 0.4, 3.1, 5, 4.4);
  // aim arm toward the mouse while firing stance
  if (G.input.mouse.down && !p.car) {
    ctx.fillStyle = '#e8b08a';
    ctx.fillRect(6, -2.2, 9, 4);
    ctx.fillStyle = '#15181f';
    ctx.fillRect(13, -1.8, p.weapon === 'smg' ? 12 : 8, 3.4);
  } else {
    ctx.fillStyle = '#e8b08a';
    ctx.fillRect(2, -8.6, 6, 3.6);
    ctx.fillRect(2, 5, 6, 3.6);
  }
  ctx.fillStyle = '#0f766e'; // Dario's teal jacket
  ctx.beginPath(); ctx.arc(0, 0, 8.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b08a';
  ctx.beginPath(); ctx.arc(1.6, 0, 5.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark ? '#ffd76a' : '#123a5c'; // his cap
  ctx.beginPath(); ctx.arc(1.2, 0, 5.6, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(3.4, -5.4, 4.6, 10.8);
  ctx.restore();
  if (p.car) return;
}

function drawBeacon(ctx, G) {
  const m = G.marker;
  if (!m || G.state === 'menu') return;
  const color = m.color ?? '#ffd76a';
  const pulse = 0.55 + Math.sin(G.time * 4.4) * 0.2;
  const grad = ctx.createLinearGradient(0, m.y - 340, 0, m.y);
  grad.addColorStop(0, 'rgba(255,215,106,0)');
  grad.addColorStop(1, hexA(color, pulse * 0.5));
  ctx.fillStyle = grad;
  ctx.fillRect(m.x - 13, m.y - 340, 26, 340);
  ctx.strokeStyle = hexA(color, 0.9);
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(m.x, m.y, 22 + Math.sin(G.time * 4.4) * 3.4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color;
  const bob = Math.sin(G.time * 3.2) * 5;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y - 44 + bob);
  ctx.lineTo(m.x - 9, m.y - 58 + bob);
  ctx.lineTo(m.x + 9, m.y - 58 + bob);
  ctx.closePath(); ctx.fill();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawPhones(ctx, G) {
  if (G.state === 'menu') return;
  const v = G.view;
  for (const def of JOB_DEFS) {
    const loc = G.city.locations[def.phone];
    if (loc.x < v.x0 || loc.x > v.x1 || loc.y < v.y0 || loc.y > v.y1) continue;
    const busy = G.mission || G.job;
    ctx.fillStyle = '#232a3d';
    ctx.fillRect(loc.x - 11, loc.y - 14, 22, 26);
    ctx.fillStyle = busy ? '#5a6274' : def.color;
    ctx.fillRect(loc.x - 12, loc.y - 18, 24, 6);
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = busy ? '#8d97b5' : def.color;
    ctx.fillText('$', loc.x, loc.y - 24 + Math.sin(G.time * 2.6 + loc.x) * 2.4);
    ctx.textAlign = 'left';
  }
  // mission giver: a gold "!" over the next chapter's giver
  const def = G.sys.missions.availableDef(G);
  if (def) {
    const giver = G.sys.missions.giverPed(G, def);
    if (giver && giver.x > v.x0 && giver.x < v.x1 && giver.y > v.y0 && giver.y < v.y1) {
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd76a';
      ctx.fillText('!', giver.x, giver.y - 34 + Math.sin(G.time * 3) * 3);
      ctx.textAlign = 'left';
    }
  }
}

function drawFloaters(ctx, G) {
  ctx.textAlign = 'center';
  ctx.font = '700 15px system-ui, sans-serif';
  for (const f of G.floaters) {
    ctx.globalAlpha = clamp(1 - f.t / f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - f.t * 36);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawHeadlights(ctx, G) {
  const dark = darkness(G.hour);
  if (dark < 0.22) return;
  const v = G.view;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const draw = (x, y, angle) => headlightCone(ctx, x, y, angle, 195);
  for (const car of G.cars) {
    if (car.dead || car.wrecked || car.x < v.x0 || car.x > v.x1 || car.y < v.y0 || car.y > v.y1) continue;
    if (car.driver === 'parked' && !car.police) continue;
    draw(car.x, car.y, car.angle);
  }
  if (G.player.car) draw(G.player.x, G.player.y, G.player.angle);
  ctx.restore();
}

// --- state screens -------------------------------------------------------------
export function menuLayout(W, H) {
  const bw = 300, bh = 52, cx = W / 2 - bw / 2;
  return {
    newBtn: { x: cx, y: H - 268, w: bw, h: bh },
    contBtn: { x: cx, y: H - 202, w: bw, h: bh },
  };
}

function drawScreens(ctx, G) {
  const W = G.canvas.width, H = G.canvas.height;
  if (G.state === 'menu') drawMenu(ctx, G, W, H);
  else if (G.state === 'pause') drawPause(ctx, G, W, H);
  else if (G.state === 'busted') {
    ctx.fillStyle = (G.time * 2.2) % 1 < 0.5 ? 'rgba(194,39,27,0.20)' : 'rgba(43,75,216,0.20)';
    ctx.fillRect(0, 0, W, H);
    bigWord(ctx, W, H, 'BUSTED', '#ff6b5e', 'The Policía de Marisol thanks you for stopping.');
  } else if (G.state === 'wasted') {
    ctx.fillStyle = 'rgba(30,6,6,0.45)';
    ctx.fillRect(0, 0, W, H);
    bigWord(ctx, W, H, 'WASTED', '#c9ccd6', 'Hospital San Coral patches Dario up — for a fee.');
  }
}

function bigWord(ctx, W, H, word, color, sub) {
  ctx.textAlign = 'center';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(word, W / 2 + 3, H / 2 - 37);
  ctx.fillStyle = color;
  ctx.fillText(word, W / 2, H / 2 - 40);
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillStyle = '#f2f0e6';
  ctx.fillText(sub, W / 2, H / 2 + 4);
  ctx.textAlign = 'left';
}

function drawMenu(ctx, G, W, H) {
  const grad = ctx.createLinearGradient(0, H * 0.42, 0, H);
  grad.addColorStop(0, 'rgba(8,10,22,0)');
  grad.addColorStop(0.55, 'rgba(8,10,22,0.82)');
  grad.addColorStop(1, 'rgba(8,10,22,0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.42, W, H * 0.58);
  ctx.textAlign = 'center';
  const tg = ctx.createLinearGradient(0, H - 420, 0, H - 330);
  tg.addColorStop(0, '#ffe9a8');
  tg.addColorStop(0.55, '#ffb347');
  tg.addColorStop(1, '#ff5e7a');
  ctx.fillStyle = tg;
  ctx.font = '900 76px system-ui, sans-serif';
  ctx.fillText('MARISOL HEAT', W / 2, H - 348);
  ctx.fillStyle = '#f2f0e6';
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText('Marisol Bay. One driver. Fifty gold tokens. Six stars of trouble.', W / 2, H - 316);
  const { newBtn, contBtn } = menuLayout(W, H);
  button(ctx, newBtn, 'NEW GAME', true, G.hoverBtn === 'new');
  if (hasSave()) button(ctx, contBtn, 'CONTINUE', true, G.hoverBtn === 'cont');
  else button(ctx, contBtn, 'CONTINUE — no save yet', false, false);
  ctx.fillStyle = '#aebadd';
  ctx.font = '13.5px system-ui, sans-serif';
  ctx.fillText('WASD drive & walk · Mouse aim · Click shoot · E interact / enter car', W / 2, H - 118);
  ctx.fillText('Shift sprint · Space handbrake · Q swap weapon · P / Esc pause · M mute', W / 2, H - 94);
  ctx.fillText('A full day–night cycle, working traffic lights, rain — the bay never sleeps', W / 2, H - 70);
  ctx.fillStyle = '#6d7794';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('An original game about Dario Venn — no relation to any other bay, city, or heat.', W / 2, H - 34);
  ctx.textAlign = 'left';
}

function button(ctx, r, label, enabled, hover) {
  ctx.fillStyle = !enabled ? 'rgba(40,46,66,0.8)' : hover ? '#ffd76a' : 'rgba(20,26,44,0.92)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = enabled ? '#ffd76a' : '#4a5268';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = !enabled ? '#6d7794' : hover ? '#141a2c' : '#ffe9b0';
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y + 34);
  ctx.textAlign = 'left';
}

function drawPause(ctx, G, W, H) {
  ctx.fillStyle = 'rgba(6,8,18,0.72)';
  ctx.fillRect(0, 0, W, H);
  const pw = 460, ph = 430, px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.fillStyle = '#121828';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = '800 32px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, py + 52);
  ctx.fillStyle = '#f2f0e6';
  ctx.font = '600 16px system-ui, sans-serif';
  const s = G.stats;
  const next = G.storyDone ? 'Story complete — the bay is yours' : 'Next chapter: ' + (MISSIONS[G.missionIndex]?.title ?? '—');
  const rows = [
    ['Cash', fmtMoney(G.money)],
    ['Respect', '×' + G.respect.toFixed(2)],
    ['Story', next],
    ['Missions completed', String(s.missionsDone)],
    ['Side jobs done', String(s.jobsDone)],
    ['Cars stolen', String(s.carsStolen)],
    ['Cars wrecked', String(s.carsWrecked)],
    ['Serra tokens', G.tokensCollected.size + ' / 50'],
    ['Times busted', String(s.arrests)],
    ['Times wasted', String(s.deaths)],
    ['Total earned', fmtMoney(s.earned)],
  ];
  rows.forEach((r, i) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aebadd';
    ctx.fillText(r[0], px + 34, py + 100 + i * 27);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(r[1], px + pw - 34, py + 100 + i * 27);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8d97b5';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Esc / P — resume · Progress saves automatically', W / 2, py + ph - 18);
  ctx.textAlign = 'left';
}
