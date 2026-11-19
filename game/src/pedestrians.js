// pedestrians.js — the people of Marisol Bay: civilians strolling the sidewalks,
// promenade and beach, named story characters waiting at their spots, and the
// panic system — a gunshot, an explosion or a car mounting the pavement sends
// everyone nearby running. Getting knocked down by a car is a witnessed crime.

import { RC, ROAD_HALF, PROMENADE_Y, WORLD_W } from './city.js';
import { clamp, dist, choice, chance, angToward } from './util.js';

export const PED_TARGET = 30;
const SHIRTS = ['#e07a5f', '#3d8bc2', '#f2cc8f', '#81b29a', '#bc6c25', '#e8e4da', '#7a6a9e', '#c8553d', '#4a9e52'];
const PANTS = ['#2c3440', '#5c4a38', '#3a4a5c', '#6e5732', '#23272e'];

let nextPedId = 1;
export function makePed(x, y, opts = {}) {
  return {
    id: nextPedId++, kind: 'ped', x, y, px: x, py: y, r: 10,
    angle: Math.random() * Math.PI * 2, speed: 0, walkPhase: Math.random() * 6,
    state: opts.state ?? 'walk', role: opts.role ?? 'civilian', name: opts.name ?? null,
    shirt: opts.shirt ?? choice(SHIRTS), pants: choice(PANTS), skin: choice(['#f2c49b', '#c68863', '#8a5a3b', '#ffdbb4']),
    health: opts.health ?? 30, maxHealth: opts.health ?? 30,
    waypoint: null, road: null, panicT: 0, panicFrom: null, downT: 0, dead: false, corpse: false, corpseT: 0,
    home: { x, y }, car: null, fireT: 0, burstT: 0, strafeDir: chance(0.5) ? 1 : -1, homeBound: !!opts.homeBound,
  };
}

function sidewalkPointNear(x, y) {
  // a random point on a sidewalk near (x, y): pick one of the two nearest road axes
  const vertical = Math.random() < 0.5;
  if (vertical) {
    let c = RC[0]; for (const r of RC) if (Math.abs(r - x) < Math.abs(c - x)) c = r;
    return { x: c + (chance(0.5) ? 1 : -1) * (ROAD_HALF + 24), y: clamp(y + (Math.random() - 0.5) * 620, 60, 4460) };
  }
  let c = RC[0]; for (const r of RC) if (Math.abs(r - y) < Math.abs(c - y)) c = r;
  return { x: clamp(x + (Math.random() - 0.5) * 620, 60, WORLD_W - 60), y: c + (chance(0.5) ? 1 : -1) * (ROAD_HALF + 24) };
}

export function spawnAmbientPed(G) {
  const a = Math.random() * Math.PI * 2, d = 380 + Math.random() * 260;
  let x = G.player.x + Math.cos(a) * d, y = G.player.y + Math.sin(a) * d;
  if (y > PROMENADE_Y - 40 && chance(0.6)) { // beachgoers and promenade strollers
    x = clamp(x, 60, WORLD_W - 60); y = PROMENADE_Y + 20 + Math.random() * 130;
  } else {
    const p = sidewalkPointNear(x, y);
    x = p.x; y = p.y;
  }
  if (G.city.isWater(x, y) || x < 30 || y < 30 || x > WORLD_W - 30) return null;
  const ped = makePed(x, y);
  ped.waypoint = sidewalkPointNear(x, y);
  G.peds.push(ped);
  return ped;
}

export function placeStoryCharacters(G) {
  const L = G.city.locations;
  const cast = [
    makePed(L.luluKiosk.x + 14, L.luluKiosk.y - 6, { role: 'npc', name: 'Lulu Ferrer', shirt: '#d6336c', homeBound: true }),
    makePed(L.workshop.doorX + 30, L.workshop.doorY + 30, { role: 'npc', name: 'Héctor Ruiz', shirt: '#4a9e52', homeBound: true }),
    makePed(L.hotel.doorX - 26, L.hotel.doorY + 14, { role: 'npc', name: 'Vera Lindqvist', shirt: '#e8e4da', homeBound: true }),
    makePed(L.policeStation.doorX - 40, L.policeStation.doorY + 10, { role: 'npc', name: 'Capt. Inés Salas', shirt: '#2c4a7c', homeBound: true }),
  ];
  for (const p of cast) G.peds.push(p);
  return cast;
}

export function scarePeds(G, x, y, radius, cause) {
  for (const ped of G.peds) {
    if (ped.dead || ped.state === 'down' || ped.role === 'gunman' || ped.role === 'officer') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee'; ped.panicT = 1.6 + Math.random() * 1.6; ped.panicFrom = { x, y };
    }
  }
  void cause;
}

export function updatePedestrians(G, dt) {
  let ambient = 0;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (ped.corpse) { if (G.time - ped.corpseT > 120) ped.dead = true; continue; }
    if (ped.role === 'civilian') {
      const dp = dist(ped.x, ped.y, G.player.x, G.player.y);
      if (dp > 1350 && ped.state !== 'down') { ped.dead = true; continue; }
      ambient++;
    }
    if (ped.role !== 'civilian' && ped.role !== 'npc') continue; // officers/gunmen update elsewhere
    updateWalker(G, ped, dt);
    checkCarHits(G, ped, dt);
  }
  if (ambient < PED_TARGET && Math.random() < dt * 2.2) spawnAmbientPed(G);
}

function updateWalker(G, ped, dt) {
  ped.px = ped.x; ped.py = ped.y;
  let speed = 0;
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0 && ped.health > 0) { ped.state = 'walk'; ped.waypoint = null; }
    return;
  }
  if (ped.state === 'flee' && ped.panicFrom) {
    ped.panicT -= dt;
    const away = Math.atan2(ped.y - ped.panicFrom.y, ped.x - ped.panicFrom.x);
    ped.angle = angToward(ped.angle, away, dt * 10);
    speed = 205;
    if (ped.panicT <= 0) { ped.state = 'walk'; ped.waypoint = null; }
  } else if (ped.role === 'npc') {
    // story characters idle at their spot, turning slowly, unless scared (handled above)
    if (dist(ped.x, ped.y, ped.home.x, ped.home.y) > 26) {
      ped.angle = angToward(ped.angle, Math.atan2(ped.home.y - ped.y, ped.home.x - ped.x), dt * 6);
      speed = 60;
    } else {
      ped.angle += Math.sin(G.time * 0.4 + ped.id) * dt * 0.4;
      speed = 0;
    }
  } else {
    if (!ped.waypoint || dist(ped.x, ped.y, ped.waypoint.x, ped.waypoint.y) < 16) {
      ped.waypoint = ped.y > PROMENADE_Y - 30
        ? { x: clamp(ped.x + (Math.random() - 0.5) * 700, 50, WORLD_W - 50), y: PROMENADE_Y + 16 + Math.random() * 140 }
        : sidewalkPointNear(ped.x, ped.y);
      if (chance(0.18)) ped.state = 'wait', ped.downT = 1 + Math.random() * 2.5;
    }
    if (ped.state === 'wait') {
      ped.downT -= dt;
      if (ped.downT <= 0) ped.state = 'walk';
    } else {
      ped.angle = angToward(ped.angle, Math.atan2(ped.waypoint.y - ped.y, ped.waypoint.x - ped.x), dt * 7);
      speed = 82;
    }
  }
  ped.speed = speed;
  ped.walkPhase += dt * (speed > 10 ? speed * 0.055 : 0);
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  G.city.collideEntity(ped);
}

function checkCarHits(G, ped, dt) {
  if (ped.state === 'down') return;
  G.hash.query(ped.x, ped.y, 46, (e) => {
    if (e.kind !== 'car' || e.wrecked) return false;
    const d = dist(ped.x, ped.y, e.x, e.y);
    if (d < e.r + ped.r - 3 && Math.abs(e.speed) > 85) {
      ped.state = 'down'; ped.downT = 5.5;
      ped.health -= Math.abs(e.speed) * 0.09;
      G.particles.hitPuff(ped.x, ped.y, 8);
      G.particles.dust(ped.x, ped.y, 5);
      if (e.driver === 'player') {
        G.sys.wanted.reportCrime(ped.health <= 0 ? 'killPed' : 'hitPed', ped.x, ped.y);
        G.shake = Math.max(G.shake, 3.5);
        G.audio.crash(0.35);
        if (ped.health <= 0) killPed(G, ped);
      } else if (ped.health <= 0) killPed(G, ped);
      // shove the ped clear of the car
      const a = Math.atan2(ped.y - e.y, ped.x - e.x);
      ped.x += Math.cos(a) * 14; ped.y += Math.sin(a) * 14;
      return true;
    }
    return false;
  });
  void dt;
}

export function killPed(G, ped) {
  ped.corpse = true; ped.corpseT = G.time; ped.state = 'down'; ped.downT = 9999;
  G.particles.hitPuff(ped.x, ped.y, 12);
}

export function drawPed(ctx, G, ped) {
  if (ped.hidden) return;
  const v = G.view;
  if (ped.x < v.x0 - 30 || ped.x > v.x1 + 30 || ped.y < v.y0 - 30 || ped.y > v.y1 + 30) return;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  // shadow
  ctx.fillStyle = 'rgba(15,15,25,0.3)';
  ctx.beginPath(); ctx.ellipse(1.5, 2.5, 9, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-5, -13, 10, 20);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-5, 7, 10, 12);
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(0, -17, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  // legs scissoring while walking
  const sw = ped.speed > 5 ? Math.sin(ped.walkPhase) * 4.4 : 0;
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-2.6 + sw * 0.4, -6.4, 5.4, 4.6);
  ctx.fillRect(-2.6 - sw * 0.4, 1.8, 5.4, 4.6);
  // body
  ctx.fillStyle = ped.role === 'officer' ? '#22355c' : ped.role === 'gunman' ? '#33302e' : ped.shirt;
  ctx.beginPath(); ctx.ellipse(0, 0, 8.6, 6.8, 0, 0, Math.PI * 2); ctx.fill();
  // arms
  ctx.fillRect(3.4, -8.6 + sw * 0.3, 4.6, 3.4);
  ctx.fillRect(3.4, 5.2 - sw * 0.3, 4.6, 3.4);
  // head
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(2.4, 0, 4.9, 0, Math.PI * 2); ctx.fill();
  if (ped.role === 'officer') {
    ctx.fillStyle = '#16233f';
    ctx.beginPath(); ctx.arc(2.4, 0, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd76a'; ctx.fillRect(5.6, -1.4, 2.4, 2.8);
  }
  if (ped.role === 'gunman') {
    ctx.fillStyle = '#101114';
    ctx.fillRect(6, -1.6, 11, 3.2); // rifle
  }
  ctx.restore();
  // name tag for story characters
  if (ped.role === 'npc' && ped.name) {
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,12,24,0.66)';
    const w = ctx.measureText(ped.name).width + 10;
    ctx.fillRect(ped.x - w / 2, ped.y - 34, w, 15);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(ped.name, ped.x, ped.y - 23);
  }
}
