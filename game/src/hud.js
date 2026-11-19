// hud.js — everything pinned to the screen edges: cash and Respect top-left,
// the objective line and its timer top-centre, six big stars, the clock and
// district top-right, health and armour over the minimap, weapon and speed
// bottom-right, the contextual prompt, the BUSTED pressure bar, dialogue
// boxes with named speakers, and the centre banner for mission beats.

import { WEAPONS } from './combat.js';
import { districtAt } from './city.js';
import { fmtMoney, fmtTime, clamp } from './util.js';

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(10,12,20,0.65)') {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(frac, 0, 1)), h - 2);
}

export function drawHUD(ctx, G) {
  const W = G.canvas.width, H = G.canvas.height;
  const p = G.player;
  ctx.textAlign = 'left';
  // --- top-left: money, respect, tokens ------------------------------------
  ctx.fillStyle = 'rgba(10,12,24,0.55)';
  ctx.fillRect(12, 12, 208, 74);
  ctx.fillStyle = '#7fe0a8';
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText(fmtMoney(G.money), 24, 44);
  ctx.fillStyle = '#cfd6ea';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('RESPECT ×' + G.respect.toFixed(2), 24, 64);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('◉ Serra tokens  ' + G.tokensCollected.size + ' / 50', 24, 80);
  // --- top-centre: objective + timer ----------------------------------------
  if (G.objectiveText) {
    ctx.textAlign = 'center';
    ctx.font = '700 17px system-ui, sans-serif';
    const tw = ctx.measureText(G.objectiveText).width + 36;
    ctx.fillStyle = 'rgba(10,12,24,0.55)';
    ctx.fillRect((W - tw) / 2, 12, tw, 30);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(G.objectiveText, W / 2, 34);
    const timer = G.mission?.timer ?? G.job?.timer;
    if (timer !== null && timer !== undefined) {
      const t = Math.max(0, timer);
      const label = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillStyle = t < 15 ? (Math.sin(G.time * 10) > 0 ? '#ff6b5e' : '#ffb0a5') : '#f2f0e6';
      ctx.fillText(label, W / 2, 66);
    }
    ctx.textAlign = 'left';
  }
  // --- top-right: stars, clock, district -------------------------------------
  const sx = W - 24;
  for (let i = 0; i < 6; i++) {
    const cx = sx - i * 34 - 13;
    const lit = i < G.stars;
    starPath(ctx, cx, 30, 13);
    if (lit) {
      ctx.fillStyle = G.bustMeter > 0.02 && Math.sin(G.time * 9) > 0 ? '#ff5040' : '#ffd76a';
      ctx.fill();
    }
    ctx.strokeStyle = lit ? '#8a6d1f' : 'rgba(240,240,240,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f2f0e6';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText(fmtTime(G.hour), sx, 66);
  ctx.fillStyle = '#aebadd';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(districtAt(p.x, p.y).toUpperCase(), sx, 84);
  if (G.seenNow && G.stars > 0) {
    ctx.fillStyle = '#ff8a7a';
    ctx.fillText('IN SIGHT', sx, 102);
  }
  ctx.textAlign = 'left';
  // --- bust pressure -----------------------------------------------------------
  if (G.bustMeter > 0.02) {
    const bw = 240, bx = W - 24 - bw, by = 112;
    ctx.fillStyle = Math.sin(G.time * 9) > 0 ? '#c2271b' : '#2b4bd8';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('BUSTED', W - 24, by - 4);
    ctx.textAlign = 'left';
    bar(ctx, bx, by, bw, 10, G.bustMeter, '#ff5040');
  }
  // --- bottom-left: health & armour (above the minimap) -------------------------
  const bw2 = 196;
  bar(ctx, 14, H - 246, bw2, 13, p.health / 100, p.health > 30 ? '#53d769' : '#ff5040');
  bar(ctx, 14, H - 228, bw2, 8, p.armor / 100, '#7fb2ff');
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillText('DARIO', 18, H - 236);
  if (p.armor > 0) ctx.fillText('ARMOUR', 18, H - 221);
  // --- bottom-right: weapon & speed ---------------------------------------------
  ctx.textAlign = 'right';
  const wep = WEAPONS[p.weapon];
  ctx.fillStyle = '#f2f0e6';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(wep.name.toUpperCase(), W - 20, H - 44);
  ctx.fillStyle = '#ffd76a';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText('AMMO ' + p.ammo[p.weapon], W - 20, H - 22);
  if (p.car) {
    ctx.fillStyle = '#cfd6ea';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.32) + ' km/h', W - 20, H - 74);
  }
  ctx.textAlign = 'left';
  // --- prompt ---------------------------------------------------------------------
  if (G.prompt && !G.dialogue && !G.shopOpen) {
    ctx.textAlign = 'center';
    ctx.font = '600 16px system-ui, sans-serif';
    const tw = ctx.measureText(G.prompt).width + 30;
    ctx.fillStyle = 'rgba(10,12,24,0.62)';
    ctx.fillRect((W - tw) / 2, H - 118, tw, 28);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(G.prompt, W / 2, H - 98);
    ctx.textAlign = 'left';
  }
  // --- hurt vignette -----------------------------------------------------------------
  if (p.hurtT > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, 'rgba(200,30,20,0)');
    g.addColorStop(1, 'rgba(200,30,20,' + (0.42 * clamp(p.hurtT, 0, 1)) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  drawBanner(ctx, G);
  drawDialogue(ctx, G);
}

function drawBanner(ctx, G) {
  const b = G.bannerData;
  if (!b) return;
  const W = G.canvas.width;
  const a = b.t < 0.25 ? b.t / 0.25 : b.t > 2.9 ? Math.max(0, (3.5 - b.t) / 0.6) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(10,12,24,0.55)';
  const tw = Math.max(ctx.measureText(b.title).width, b.sub ? ctx.measureText(b.sub).width * 0.62 : 0) + 56;
  ctx.fillRect((W - tw) / 2, 128, tw, b.sub ? 84 : 56);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(b.title, W / 2, 172);
  if (b.sub) {
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#f2f0e6';
    ctx.fillText(b.sub, W / 2, 198);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawDialogue(ctx, G) {
  const d = G.dialogue;
  if (!d) return;
  const W = G.canvas.width, H = G.canvas.height;
  const line = d.lines[d.i];
  if (!line) return;
  const bw = Math.min(780, W - 90), bh = 108, bx = (W - bw) / 2, by = H - bh - 26;
  ctx.fillStyle = 'rgba(10,13,26,0.9)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffd76a';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(line[0].toUpperCase(), bx + 20, by + 28);
  ctx.fillStyle = '#f5f3ea';
  ctx.font = '17px system-ui, sans-serif';
  wrapText(ctx, line[1], bx + 20, by + 56, bw - 40, 22);
  ctx.fillStyle = '#aebadd';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', bx + bw - 16, by + bh - 12);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w; yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
