// particles.js — pooled particles and fading skid marks: the juice layer. Sparks,
// smoke, dust, muzzle flashes, rain splashes and explosion fire all come from one
// fixed pool, so a five-star pile-up costs the same as a quiet street.

import { rand, clamp } from './util.js';

const MAX_PARTICLES = 700;
const MAX_SKIDS = 500;

export class ParticlePool {
  constructor() {
    this.pool = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', drag: 0, grav: 0, grow: 0, alpha: 1 });
    }
    this.cursor = 0;
    this.skids = [];
  }
  spawn(x, y, opts) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.alive = true; p.x = x; p.y = y;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0;
    p.max = p.life = opts.life ?? 0.5;
    p.size = opts.size ?? 2.5;
    p.color = opts.color ?? '#ffffff';
    p.drag = opts.drag ?? 0; p.grav = opts.grav ?? 0; p.grow = opts.grow ?? 0;
    p.alpha = opts.alpha ?? 1;
    return p;
  }
  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(opts.spLo ?? 20, opts.spHi ?? 120);
      this.spawn(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(opts.lifeLo ?? 0.2, opts.lifeHi ?? 0.6),
        size: rand(opts.sizeLo ?? 1.5, opts.sizeHi ?? 3.5),
        color: Array.isArray(opts.color) ? opts.color[(Math.random() * opts.color.length) | 0] : opts.color,
        drag: opts.drag ?? 2.2, grav: opts.grav ?? 0, grow: opts.grow ?? 0, alpha: opts.alpha ?? 1,
      });
    }
  }
  sparks(x, y, n = 10) { this.burst(x, y, n, { color: ['#ffd76a', '#ffb347', '#fff3b0'], spLo: 60, spHi: 260, lifeLo: 0.1, lifeHi: 0.35, sizeLo: 1, sizeHi: 2.4 }); }
  smoke(x, y, n = 6, dark = false) {
    this.burst(x, y, n, { color: dark ? ['#2c2c30', '#3a3a40', '#232326'] : ['#cfd4d8', '#b9bfc4', '#e6eaed'], spLo: 8, spHi: 42, lifeLo: 0.5, lifeHi: 1.3, sizeLo: 4, sizeHi: 8, grow: 9, drag: 1.2, alpha: 0.5 });
  }
  dust(x, y, n = 6) { this.burst(x, y, n, { color: ['#d8c49a', '#c9b183', '#e8d9b0'], spLo: 15, spHi: 70, lifeLo: 0.25, lifeHi: 0.6, sizeLo: 2.5, sizeHi: 5, grow: 5, drag: 2.5, alpha: 0.55 }); }
  hitPuff(x, y, n = 7) { this.burst(x, y, n, { color: ['#c33', '#e05252', '#8f1d1d'], spLo: 30, spHi: 130, lifeLo: 0.15, lifeHi: 0.4, sizeLo: 1.6, sizeHi: 3.4 }); }
  muzzle(x, y, ang) {
    this.spawn(x, y, { vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, life: 0.05, size: 7, color: '#ffe9a3', alpha: 0.95 });
    this.spawn(x, y, { vx: Math.cos(ang) * 30, vy: Math.sin(ang) * 30, life: 0.09, size: 4, color: '#ffb347', alpha: 0.9 });
  }
  explosion(x, y) {
    this.burst(x, y, 26, { color: ['#ff9d3c', '#ff6b35', '#ffd76a', '#f7c548'], spLo: 40, spHi: 320, lifeLo: 0.2, lifeHi: 0.7, sizeLo: 3, sizeHi: 7 });
    this.smoke(x, y, 16, true);
    this.sparks(x, y, 18);
  }
  addSkid(x1, y1, x2, y2) {
    this.skids.push({ x1, y1, x2, y2, a: 0.5 });
    if (this.skids.length > MAX_SKIDS) this.skids.splice(0, this.skids.length - MAX_SKIDS);
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const d = 1 - Math.min(1, p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size = Math.max(0.4, p.size + p.grow * dt);
    }
    for (let i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].a -= dt * 0.03;
      if (this.skids[i].a <= 0.02) this.skids.splice(i, 1);
    }
  }
  drawSkids(ctx, view) {
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    for (const s of this.skids) {
      if (s.x2 < view.x0 || s.x1 > view.x1 || s.y2 < view.y0 || s.y1 > view.y1) continue;
      ctx.strokeStyle = `rgba(20,18,16,${s.a.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
  }
  draw(ctx, view) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      if (p.x < view.x0 - 20 || p.x > view.x1 + 20 || p.y < view.y0 - 20 || p.y > view.y1 + 20) continue;
      const t = p.life / p.max;
      ctx.globalAlpha = clamp(p.alpha * Math.min(1, t * 2.2), 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
