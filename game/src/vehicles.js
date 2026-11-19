// vehicles.js — every car in Marisol Bay: six civilian models plus the taxi, and
// the police family (patrol, SWAT van, agent sedan, armoured carrier). One arcade
// physics step drives them all — the player, traffic and police differ only in
// who writes the controls. Cars take damage, smoke, burn and end as wrecks.

import { clamp, angToward, dist } from './util.js';

export const CAR_MODELS = {
  sedan:   { len: 46, wid: 22, maxSpeed: 335, accel: 210, grip: 3.4, health: 100, colors: ['#c8553d', '#3d8bc2', '#e8e4da', '#4a9e52', '#d8a03c', '#7a6a9e', '#2f6f6a'] },
  hatch:   { len: 40, wid: 21, maxSpeed: 305, accel: 200, grip: 3.6, health: 90,  colors: ['#e07a5f', '#81b29a', '#f2cc8f', '#6d8ea0', '#bc6c25'] },
  coupe:   { len: 45, wid: 21, maxSpeed: 385, accel: 260, grip: 3.8, health: 95,  colors: ['#b02020', '#20242c', '#e8b10e', '#7a1f5c', '#10606e'] },
  pickup:  { len: 50, wid: 23, maxSpeed: 315, accel: 195, grip: 3.1, health: 120, colors: ['#8a8f7a', '#5c6b73', '#a44a2a', '#33566b'] },
  van:     { len: 55, wid: 24, maxSpeed: 290, accel: 175, grip: 2.9, health: 140, colors: ['#e8e4da', '#b9bcbe', '#6d8ea0', '#c9a227'] },
  wagon:   { len: 48, wid: 22, maxSpeed: 320, accel: 200, grip: 3.3, health: 105, colors: ['#4f772d', '#606c38', '#9e6b30', '#4361ee'] },
  taxi:    { len: 46, wid: 22, maxSpeed: 335, accel: 215, grip: 3.4, health: 100, colors: ['#f7c548'] },
  patrol:  { len: 47, wid: 22, maxSpeed: 372, accel: 245, grip: 3.7, health: 130, colors: ['#eef1f4'] },
  swat:    { len: 57, wid: 25, maxSpeed: 330, accel: 215, grip: 3.2, health: 220, colors: ['#23272e'] },
  agent:   { len: 46, wid: 22, maxSpeed: 392, accel: 265, grip: 3.8, health: 120, colors: ['#14161a'] },
  carrier: { len: 68, wid: 28, maxSpeed: 282, accel: 180, grip: 2.8, health: 340, colors: ['#4b5320'] },
};

let nextCarId = 1;

export function makeCar(model, x, y, angle, opts = {}) {
  const m = CAR_MODELS[model];
  return {
    id: nextCarId++, kind: 'car', model, x, y, px: x, py: y, angle, r: m.len * 0.40,
    speed: 0, steer: 0, len: m.len, wid: m.wid,
    maxSpeed: m.maxSpeed, accel: m.accel, grip: m.grip,
    health: m.health, maxHealth: m.health,
    color: opts.color ?? m.colors[(Math.random() * m.colors.length) | 0],
    driver: opts.driver ?? 'parked', // parked | traffic | player | police | mission
    police: !!opts.police, tier: opts.tier ?? 0,
    wrecked: false, onFire: 0, smokeT: 0, flashT: Math.random(),
    targetSpeed: 0, waypoint: null, path: null, pathI: 0, stuckT: 0, reverseT: 0,
    occupant: null, dead: false, honkT: 0, skidL: null, skidR: null,
  };
}

// One physics step. ctl = { throttle: -1..1, steer: -1..1, brake: bool }.
export function stepCar(G, car, ctl, dt) {
  car.px = car.x; car.py = car.y;
  const m = CAR_MODELS[car.model];
  const spd = car.speed;
  // steering authority grows a little with speed, then fades at very high speed
  const steerAuthority = clamp(Math.abs(spd) / 60, 0, 1) * (1 - clamp((Math.abs(spd) - 300) / 500, 0, 0.35));
  car.steer += clamp(ctl.steer - car.steer, -dt * 7, dt * 7);
  // yaw follows steer x speed: reversing inverts the turn naturally, as a real car does
  car.angle += car.steer * steerAuthority * (spd / m.len) * dt * 1.9;
  // throttle / drag / braking
  let acc = 0;
  if (ctl.throttle > 0) acc = m.accel * ctl.throttle;
  else if (ctl.throttle < 0) acc = (spd > 8 ? -m.accel * 1.15 : m.accel * 0.55 * ctl.throttle);
  if (ctl.brake) acc = spd > 4 ? -m.accel * 1.5 : (spd < -4 ? m.accel : acc);
  car.speed += acc * dt;
  car.speed -= car.speed * 0.55 * dt; // rolling drag
  if (!ctl.throttle && !ctl.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -m.maxSpeed * 0.32, m.maxSpeed);
  if (Math.abs(car.speed) < 1.5 && !ctl.throttle) car.speed = 0;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // skid marks and dust when sliding hard
  const sliding = Math.abs(car.steer) > 0.55 && Math.abs(car.speed) > 190;
  const rx = car.x - Math.cos(car.angle) * car.len * 0.36, ry = car.y - Math.sin(car.angle) * car.len * 0.36;
  const ox = Math.cos(car.angle + Math.PI / 2) * car.wid * 0.36, oy = Math.sin(car.angle + Math.PI / 2) * car.wid * 0.36;
  if (sliding && !car.wrecked) {
    if (car.skidL) G.particles.addSkid(car.skidL[0], car.skidL[1], rx + ox, ry + oy);
    if (car.skidR) G.particles.addSkid(car.skidR[0], car.skidR[1], rx - ox, ry - oy);
    car.skidL = [rx + ox, ry + oy]; car.skidR = [rx - ox, ry - oy];
    if (Math.random() < 0.3) G.particles.dust(rx, ry, 1);
  } else { car.skidL = car.skidR = null; }
}

// Fire and damage smoke tick for every car, driven or not — a parked car that
// was shot up still burns down to a wreck (that is what the Frenzy job counts).
export function updateCarFires(G, dt) {
  for (const car of G.cars) {
    if (car.dead || car.wrecked) continue;
    if (car.health < car.maxHealth * 0.45) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) { car.smokeT = 0.12; G.particles.smoke(car.x + Math.cos(car.angle) * car.len * 0.3, car.y + Math.sin(car.angle) * car.len * 0.3, 1, car.health < car.maxHealth * 0.22); }
    }
    if (car.onFire > 0) {
      car.onFire -= dt;
      if (Math.random() < 0.5) G.particles.burst(car.x, car.y, 2, { color: ['#ff9d3c', '#ff6b35', '#ffd76a'], spLo: 8, spHi: 40, lifeLo: 0.2, lifeHi: 0.45, sizeLo: 3, sizeHi: 6 });
      if (car.onFire <= 0) wreckCar(G, car);
    }
  }
}

export function damageCar(G, car, dmg, cause) {
  if (car.wrecked) return;
  car.health -= dmg;
  if (car.health <= 0) {
    if (car.model === 'carrier' || car.model === 'swat') { car.health = 1; car.onFire = Math.max(car.onFire, 0.6); return; }
    car.onFire = Math.max(car.onFire, 0.5);
  }
  if (cause === 'bullet' && Math.random() < 0.25) G.particles.sparks(car.x, car.y, 3);
}

export function wreckCar(G, car) {
  if (car.wrecked) return;
  car.wrecked = true; car.health = 0; car.speed = 0;
  G.particles.explosion(car.x, car.y);
  G.audio.explosionSound();
  G.shake = Math.max(G.shake, 9);
  if (car.driver === 'player') {
    G.sys.combat.hurtPlayer(26, 'explosion');
  } else if (!G.player.car && Math.hypot(G.player.x - car.x, G.player.y - car.y) < 84) {
    G.sys.combat.hurtPlayer(16, 'explosion');
  }
  G.stats.carsWrecked++;
  if (car.driver === 'traffic' || car.driver === 'police') {
    car.driver = 'parked';
  }
}

// Circle collisions: cars vs buildings, cars vs cars, with impact damage and noise.
export function collideCars(G, dt) {
  const cars = G.cars;
  for (const car of cars) {
    if (car.dead) continue;
    const hit = G.city.collideEntity(car);
    if (hit && Math.abs(car.speed) > 60) {
      const impact = Math.abs(car.speed);
      damageCar(G, car, impact * 0.055, 'crash');
      if (car.driver === 'player') {
        G.shake = Math.max(G.shake, clamp(impact / 38, 2, 10));
        hurtPlayer(G, impact * 0.012, 'crash');
        G.audio.crash(clamp(impact / 300, 0.3, 1));
        G.hitstop = Math.max(G.hitstop, 0.03);
      } else if (dist(car.x, car.y, G.player.x, G.player.y) < 700) G.audio.crash(clamp(impact / 380, 0.15, 0.8));
      G.particles.sparks(car.x + Math.cos(car.angle) * car.len * 0.4, car.y + Math.sin(car.angle) * car.len * 0.4, 8);
      car.speed = -car.speed * 0.25;
      if (carIsCrimeTarget(G, car)) reportCrime(G, 'crash', car.x, car.y, 12);
    } else if (hit) {
      car.speed *= 0.5;
    }
  }
  // car vs car
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i]; if (a.dead) continue;
    G.hash.query(a.x, a.y, a.r + 60, (b) => {
      if (b === a || b.kind !== 'car' || b.dead) return false;
      const d = dist(a.x, a.y, b.x, b.y), min = a.r + b.r;
      if (d > 0.01 && d < min) {
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d, overlap = (min - d) / 2;
        if (!a.wrecked) { a.x -= nx * overlap; a.y -= ny * overlap; }
        if (!b.wrecked) { b.x += nx * overlap; b.y += ny * overlap; }
        const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
        if (rel > 55) {
          damageCar(G, a, rel * 0.05, 'crash'); damageCar(G, b, rel * 0.05, 'crash');
          G.particles.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 7);
          if (a.driver === 'player' || b.driver === 'player') {
            G.shake = Math.max(G.shake, clamp(rel / 30, 2, 11));
            G.audio.crash(clamp(rel / 280, 0.3, 1));
            hurtPlayer(G, rel * 0.014, 'crash');
            G.hitstop = Math.max(G.hitstop, 0.035);
          }
          const other = a.driver === 'player' ? b : a.driver === 'traffic' || a.driver === 'police' ? b : null;
          if (other && (other.police || other.driver === 'traffic')) reportCrime(G, other.police ? 'hitPolice' : 'crash', a.x, a.y, other.police ? 45 : 10);
          if (a.driver === 'traffic') a.stuckT = Math.max(a.stuckT, 0.6);
          if (b.driver === 'traffic') b.stuckT = Math.max(b.stuckT, 0.6);
        }
        const swap = a.speed; if (!a.wrecked) a.speed = b.speed * 0.55; if (!b.wrecked) b.speed = swap * 0.55;
      }
      return false;
    });
  }
}

function carIsCrimeTarget(G, car) { return car.driver === 'player'; }
export function hurtPlayer(G, dmg, cause) { G.sys.combat.hurtPlayer(dmg, cause); }
export function reportCrime(G, type, x, y, amount) { G.sys.wanted.reportCrime(type, x, y, amount); }

export function drawCar(ctx, G, car) {
  const v = G.view;
  if (car.x < v.x0 - 90 || car.x > v.x1 + 90 || car.y < v.y0 - 90 || car.y > v.y1 + 90) return;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len, W = car.wid;
  // shadow
  ctx.fillStyle = 'rgba(15,15,25,0.35)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // body
  ctx.fillStyle = car.wrecked ? '#26262a' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6); ctx.fill();
  if (car.police) {
    ctx.fillStyle = car.model === 'patrol' ? '#20242c' : car.color;
    if (car.model === 'patrol') { roundRect(ctx, -L * 0.18, -W / 2, L * 0.36, W, 4); ctx.fill(); }
    ctx.fillStyle = '#ffd76a';
    ctx.font = '700 8px system-ui'; ctx.textAlign = 'center';
    if (car.model === 'patrol') { ctx.fillStyle = '#20242c'; ctx.fillText('POLICÍA', 0, 3); }
  }
  if (car.model === 'taxi' && !car.wrecked) {
    ctx.fillStyle = '#20242c'; ctx.fillRect(-6, -W / 2 + 3, 12, 4);
    ctx.fillStyle = '#fff'; ctx.font = '700 7px system-ui'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, -W / 2 + 6 + 4);
  }
  // cabin and glass
  ctx.fillStyle = car.wrecked ? '#151517' : '#1d2733';
  roundRect(ctx, -L * 0.16, -W / 2 + 3.5, L * 0.34, W - 7, 3.5); ctx.fill();
  ctx.fillStyle = 'rgba(140,190,225,0.5)';
  ctx.fillRect(L * 0.13, -W / 2 + 4.5, 3.4, W - 9);
  ctx.fillRect(-L * 0.2, -W / 2 + 4.5, 3, W - 9);
  // hood and trunk shading
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(L * 0.24, -W / 2 + 2.5, L * 0.22, W - 5);
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(-L / 2 + 2, -W / 2 + 2.5, L * 0.16, W - 5);
  // wheels
  ctx.fillStyle = '#101114';
  const ww = 7.5, wh = 3.6;
  ctx.fillRect(-L / 2 + 5, -W / 2 - 1.6, ww, wh); ctx.fillRect(-L / 2 + 5, W / 2 - wh + 1.6, ww, wh);
  ctx.fillRect(L / 2 - 5 - ww, -W / 2 - 1.6, ww, wh); ctx.fillRect(L / 2 - 5 - ww, W / 2 - wh + 1.6, ww, wh);
  // damage dents
  if (car.health < car.maxHealth * 0.6 && !car.wrecked) {
    ctx.fillStyle = 'rgba(10,10,12,0.4)';
    ctx.fillRect(L * 0.3, -W * 0.2, 6, 5); ctx.fillRect(-L * 0.38, W * 0.14, 7, 5);
  }
  // headlights / taillights
  ctx.fillStyle = '#ffeeb0';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2.5, 2.4, 4); ctx.fillRect(L / 2 - 2, W / 2 - 6.5, 2.4, 4);
  ctx.fillStyle = '#d23b2e';
  ctx.fillRect(-L / 2 - 0.4, -W / 2 + 2.5, 2.2, 4); ctx.fillRect(-L / 2 - 0.4, W / 2 - 6.5, 2.2, 4);
  // police lightbar
  if (car.police && !car.wrecked) {
    const t = (performance.now() / 280 + car.flashT * 3) % 1;
    ctx.fillStyle = t < 0.5 ? '#ff4040' : '#4060ff';
    ctx.fillRect(-4, -W / 2 + 3, 8, 4.4);
    ctx.fillStyle = t < 0.5 ? '#4060ff' : '#ff4040';
    ctx.fillRect(-4, W / 2 - 7.4, 8, 4.4);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = t < 0.5 ? '#ff4040' : '#4060ff';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
