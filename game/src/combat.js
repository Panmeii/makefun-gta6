// combat.js — gunplay in Marisol Bay: Dario's mouse-aimed pistol and the buyable
// full-auto "Ráfaga" SMG, tracer bullets that spark off cars and buildings, and
// the armed men who shoot back — Bruno Serra's debt collectors, his lighthouse
// guard, and the black-sedan agents at five stars. Armour soaks most of a hit;
// at zero health the hospital takes its cut.

import { clamp, dist } from './util.js';
import { damageCar } from './vehicles.js';
import { killPed } from './pedestrians.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', rate: 0.27, dmg: 26, spread: 0.018, speed: 880, range: 470, auto: false },
  smg: { name: 'Ráfaga SMG', rate: 0.092, dmg: 17, spread: 0.05, speed: 920, range: 430, auto: true },
};

export const combat = {
  fireCooldown: 0,
  update(dt) {
    const G = this.G;
    this.fireCooldown -= dt;
    updatePlayerFire(G, dt);
    updateGunmen(G, dt);
    updateBullets(G, dt);
  },
  hurtPlayer(dmg, cause) {
    const G = this.G;
    if (!G || G.state !== 'play' || G.player.godT > 0) return;
    const p = G.player;
    let rest = dmg;
    if (p.armor > 0) {
      const soaked = Math.min(p.armor, dmg * 0.62);
      p.armor -= soaked;
      rest = dmg - soaked;
    }
    p.health -= rest;
    p.hurtT = 0.35;
    if (cause === 'bullet') G.shake = Math.max(G.shake, 2.2);
    if (p.health <= 0) { p.health = 0; G.onWasted(); }
  },
  damagePed(ped, dmg, byPlayer) {
    const G = this.G;
    if (ped.dead || ped.corpse) return;
    ped.health -= dmg;
    G.particles.hitPuff(ped.x, ped.y, 5);
    if (ped.health <= 0) {
      const wasCivilian = ped.role === 'civilian' || ped.role === 'npc';
      killPed(G, ped);
      if (byPlayer && wasCivilian) G.sys.wanted.reportCrime('killPed', ped.x, ped.y);
      if (byPlayer && ped.role === 'officer') G.sys.wanted.reportCrime('copKill', ped.x, ped.y);
      if (ped.role === 'gunman' && byPlayer) {
        G.addMoney(45, ped.x, ped.y);
        if (G.mission) G.mission.onTargetDown?.(ped);
      }
    } else if (ped.role === 'civilian' || ped.role === 'npc') {
      ped.state = 'flee'; ped.panicT = 2.4; ped.panicFrom = { x: G.player.x, y: G.player.y };
    } else if (ped.role === 'gunman' && G.mission) {
      G.mission.onTargetHurt?.(ped);
    }
  },
};

function fireBullet(G, from, x, y, ang, spec, dmgScale = 1) {
  G.bullets.push({
    x, y, vx: Math.cos(ang) * spec.speed, vy: Math.sin(ang) * spec.speed,
    from, life: spec.range / spec.speed, dmg: spec.dmg * dmgScale, dead: false,
  });
}

function updatePlayerFire(G, dt) {
  const p = G.player;
  if (G.state !== 'play' || G.dialogue || G.shopOpen) return;
  const wantFire = G.input.mouse.down;
  if (!wantFire) return;
  const weaponKey = p.weapon;
  const spec = WEAPONS[weaponKey];
  if (combat.fireCooldown > 0) return;
  // the pistol is semi-auto: a fresh click fires at once; holding the button
  // only refires after a deliberate pause, the SMG simply streams
  if (!spec.auto && !G.input.mouse.clicked && combat.fireCooldown > -0.28) return;
  if (p.ammo[weaponKey] <= 0) {
    combat.fireCooldown = 0.3;
    G.audio.dryFire();
    return;
  }
  p.ammo[weaponKey]--;
  combat.fireCooldown = spec.rate;
  G.stats.shotsFired++;
  const target = G.screenToWorld(G.input.mouse.x, G.input.mouse.y);
  const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
  const ang = baseAng + (Math.random() - 0.5) * 2 * spec.spread + (p.car ? (Math.random() - 0.5) * 0.03 : 0);
  const mx = p.x + Math.cos(baseAng) * 14, my = p.y + Math.sin(baseAng) * 14;
  p.angle = baseAng;
  fireBullet(G, 'player', mx, my, ang, spec);
  G.particles.muzzle(mx, my, ang);
  G.audio.gunshot();
  G.sys.wanted.reportCrime('shot', p.x, p.y);
  if (!p.car) G.shake = Math.max(G.shake, 1.1);
  void dt;
}

function updateGunmen(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.role !== 'gunman' || ped.dead || ped.state === 'down') continue;
    const d = dist(ped.x, ped.y, p.x, p.y);
    ped.px = ped.x; ped.py = ped.y;
    if (d > 460) {
      // close the distance
      const a = Math.atan2(p.y - ped.y, p.x - ped.x);
      ped.angle = a;
      ped.x += Math.cos(a) * 120 * dt; ped.y += Math.sin(a) * 120 * dt;
      G.city.collideEntity(ped);
      continue;
    }
    // fighting range: strafe slowly, fire in bursts
    const a = Math.atan2(p.y - ped.y, p.x - ped.x);
    ped.angle = a;
    const radial = d < 140 ? -1 : d > 250 ? 1 : 0;
    const strafe = Math.sin(G.time * 0.7 + ped.id * 2.1) > 0 ? 1 : -1;
    ped.x += (Math.cos(a) * radial * 62 + Math.cos(a + Math.PI / 2) * strafe * 44) * dt;
    ped.y += (Math.sin(a) * radial * 62 + Math.sin(a + Math.PI / 2) * strafe * 44) * dt;
    G.city.collideEntity(ped);
    ped.burstT -= dt;
    ped.fireT -= dt;
    if (ped.burstT <= 0) {
      ped.burstT = 1.1 + Math.random() * 1.3;
      ped.shotsLeft = 3 + (Math.random() * 3 | 0);
      ped.fireT = 0.25;
    }
    if (ped.shotsLeft > 0 && ped.fireT <= 0 && d < 400) {
      ped.shotsLeft--;
      ped.fireT = 0.16;
      const aimErr = (Math.random() - 0.5) * 0.13;
      const spec = WEAPONS.pistol;
      fireBullet(G, 'npc', ped.x + Math.cos(a) * 13, ped.y + Math.sin(a) * 13, a + aimErr, spec, 0.55);
      G.particles.muzzle(ped.x + Math.cos(a) * 13, ped.y + Math.sin(a) * 13, a);
      if (d < 640) G.audio.gunshot();
    }
  }
}

function updateBullets(G, dt) {
  const p = G.player;
  for (const b of G.bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    const steps = 3;
    for (let s = 0; s < steps && !b.dead; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      // buildings stop bullets
      let hitWall = false;
      for (const bd of G.city.buildings) {
        if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) { hitWall = true; break; }
      }
      if (hitWall || G.city.isWater(b.x, b.y)) {
        G.particles.sparks(b.x, b.y, 3);
        b.dead = true;
        break;
      }
      // cars
      const hitCar = G.hash.query(b.x, b.y, 34, (e) => e.kind === 'car' && !e.wrecked && Math.abs(b.x - e.x) < e.len * 0.55 && Math.abs(b.y - e.y) < e.len * 0.55 && dist(b.x, b.y, e.x, e.y) < e.r + 4);
      if (hitCar) {
        if (b.from === 'player' || hitCar.driver !== 'police' || true) {
          damageCar(G, hitCar, b.dmg, 'bullet');
          G.particles.sparks(b.x, b.y, 4);
          if (b.from === 'player' && hitCar.police) G.sys.wanted.reportCrime('hitPolice', b.x, b.y, 22);
          if (b.from === 'player' && hitCar.driver === 'traffic') G.sys.wanted.reportCrime('crash', b.x, b.y, 12);
        }
        b.dead = true;
        break;
      }
      // pedestrians
      if (b.from === 'player') {
        const hitPed = G.hash.query(b.x, b.y, 16, (e) => e.kind === 'ped' && !e.dead && e.state !== 'down');
        if (hitPed) { combat.damagePed(hitPed, b.dmg, true); b.dead = true; break; }
      } else if (dist(b.x, b.y, p.x, p.y) < (p.car ? p.car.r : 12)) {
        if (!p.car || dist(b.x, b.y, p.x, p.y) < p.car.r * 0.8) {
          combat.hurtPlayer(b.dmg, 'bullet');
          b.dead = true;
          break;
        }
      }
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);
}

export function drawBullets(ctx, G) {
  ctx.strokeStyle = '#ffe9a3';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (const b of G.bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
export { clamp };
