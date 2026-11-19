// police.js — the Policía de Marisol answers heat in six tiers: patrol cars,
// then roadblocks, SWAT vans, black agent sedans whose drivers shoot, and at six
// stars an armoured carrier that simply rams. Units spawn on the road network
// out of sight, pursue with prediction, box the player in, and put officers on
// foot when the chase slows down. When a police car stops near Dario for a
// while, its officer gets out — that is who fills the bust meter.

import { RC } from './city.js';
import { makeCar, stepCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { adoptAsTraffic } from './traffic.js';
import { clamp, angDiff, dist, chance } from './util.js';

function nearestRC(v) {
  let best = RC[0];
  for (const c of RC) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

export function desiredUnits(stars) {
  switch (stars) {
    case 0: return [];
    case 1: return ['patrol', 'patrol'];
    case 2: return ['patrol', 'patrol', 'patrol'];
    case 3: return ['patrol', 'patrol', 'patrol', 'patrol'];
    case 4: return ['patrol', 'patrol', 'patrol', 'swat', 'swat'];
    case 5: return ['patrol', 'patrol', 'patrol', 'swat', 'swat', 'agent', 'agent'];
    default: return ['patrol', 'patrol', 'patrol', 'swat', 'swat', 'agent', 'agent', 'carrier'];
  }
}

function roadPointNear(G, minD, maxD, aheadOfPlayer) {
  const p = G.player;
  for (let tries = 0; tries < 14; tries++) {
    let x, y;
    if (aheadOfPlayer && p.car && Math.abs(p.car.speed) > 60) {
      const a = p.car.angle;
      x = p.x + Math.cos(a) * (minD + Math.random() * (maxD - minD));
      y = p.y + Math.sin(a) * (minD + Math.random() * (maxD - minD));
    } else {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d;
    }
    // snap to the nearest road crossing so units arrive on tarmac
    let bx = RC[0], by = RC[0];
    for (const c of RC) { if (Math.abs(c - x) < Math.abs(bx - x)) bx = c; if (Math.abs(c - y) < Math.abs(by - y)) by = c; }
    x = bx + (chance(0.5) ? 34 : -34); y = by + (chance(0.5) ? 34 : -34);
    if (x < 60 || y < 60 || x > 4500 || y > 4300) continue;
    if (G.city.isWater(x, y)) continue;
    return { x, y };
  }
  return null;
}

export function spawnPoliceUnit(G, model) {
  const pos = roadPointNear(G, 640, 980, true);
  if (!pos) return null;
  const tier = { patrol: 1, swat: 4, agent: 5, carrier: 6 }[model] ?? 1;
  const car = makeCar(model, pos.x, pos.y, Math.atan2(G.player.y - pos.y, G.player.x - pos.x),
    { driver: 'police', police: true, tier });
  car.officerSpawned = false; car.stopT = 0; car.blockT = 0;
  G.cars.push(car);
  return car;
}

export function updatePolice(G, dt) {
  const p = G.player;
  // heat gone: units stand down and simply drive off as traffic
  if (G.stars === 0) {
    for (const car of G.cars) {
      if (car.police && !car.dead && !car.wrecked && (car.driver === 'police' || car.driver === 'roadblock')) {
        car.driver = 'traffic';
        adoptAsTraffic(car);
      }
    }
  }
  const want = desiredUnits(G.stars);
  const counts = {};
  let active = 0;
  for (const car of G.cars) {
    if (!car.police || car.dead) continue;
    const dp = dist(car.x, car.y, p.x, p.y);
    if (dp > 1650 && G.stars === 0) { car.dead = true; continue; }
    if (dp > 1900) { car.dead = true; continue; }
    if (car.driver === 'police' && !car.wrecked) { counts[car.model] = (counts[car.model] ?? 0) + 1; active++; }
  }
  // top up the response, one unit at a time
  G.policeSpawnT -= dt;
  if (G.stars > 0 && G.policeSpawnT <= 0) {
    for (const model of want) {
      const have = counts[model] ?? 0;
      const need = want.filter((m) => m === model).length;
      if (have < need) { if (spawnPoliceUnit(G, model)) { G.policeSpawnT = 1.6; } break; }
    }
  }
  // roadblocks from three stars
  if (G.stars >= 3 && p.car) {
    G.roadblockT -= dt;
    if (G.roadblockT <= 0) { placeRoadblock(G); G.roadblockT = 16 + Math.random() * 8; }
  }
  for (const car of G.cars) {
    if (!car.police || car.dead || car.wrecked || car.driver === 'roadblock') continue;
    if (car.driver === 'police') drivePursuit(G, car, dt);
  }
  // roadblock cars wake up when the player is close or past them
  for (const car of G.cars) {
    if (car.driver !== 'roadblock' || car.dead || car.wrecked) continue;
    car.blockT += dt;
    const dp = dist(car.x, car.y, p.x, p.y);
    if (dp < 190 || car.blockT > 30) { car.driver = 'police'; }
  }
  updateOfficers(G, dt);
}

function placeRoadblock(G) {
  const p = G.player;
  if (!p.car) return;
  const pos = roadPointNear(G, 480, 620, true);
  if (!pos) return;
  // two patrol cars parked nose-to-nose across the road ahead
  const a = Math.atan2(p.y - pos.y, p.x - pos.x) + Math.PI / 2;
  for (let i = -1; i <= 1; i += 2) {
    const car = makeCar('patrol', pos.x + Math.cos(a) * i * 20, pos.y + Math.sin(a) * i * 20, a + (i > 0 ? 0.22 : -0.22 + Math.PI),
      { driver: 'roadblock', police: true, tier: 3 });
    car.blockT = 0;
    G.cars.push(car);
  }
}

// Where a pursuing unit should aim: the player directly at close range, but
// from further out it must navigate the grid — first to an intersection if it
// is off-road, then along its row to Dario's column, then down the column.
function pursuitTarget(G, car) {
  const p = G.player;
  const d = dist(car.x, car.y, p.x, p.y);
  if (d < 170) return { x: p.x, y: p.y, direct: true };
  const colX = nearestRC(p.x), rowY = nearestRC(p.y);
  const onCol = RC.some((c) => Math.abs(car.x - c) < 112);
  const onRow = RC.some((c) => Math.abs(car.y - c) < 112);
  if (!onCol && !onRow) return { x: nearestRC(car.x), y: nearestRC(car.y), direct: false };
  if (Math.abs(car.x - colX) > 52) return { x: colX, y: nearestRC(car.y), direct: false };
  return { x: colX, y: rowY, direct: false };
}

function drivePursuit(G, car, dt) {
  const p = G.player;
  const pvx = p.car ? Math.cos(p.car.angle) * p.car.speed : 0;
  const pvy = p.car ? Math.sin(p.car.angle) * p.car.speed : 0;
  const d = dist(car.x, car.y, p.x, p.y);
  const nav = pursuitTarget(G, car);
  const lead = clamp(d / 500, 0.1, 0.55);
  let tx = nav.x, ty = nav.y;
  if (nav.direct) { tx = p.x + pvx * lead; ty = p.y + pvy * lead; }
  // at close range aim for the player's rear quarter: a ram, not a kiss
  if (d < 120 && p.car) { tx = p.x - Math.cos(p.car.angle) * 26; ty = p.y - Math.sin(p.car.angle) * 26; }
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angDiff(car.angle, want);
  const steer = clamp(diff * 2.6, -1, 1);
  let throttle = 1, brake = false;
  const topSpeed = car.maxSpeed * (G.stars >= 5 ? 1 : 0.94);
  if (!p.car && d < 74) { // on foot: pull up alongside and stop
    throttle = d < 52 ? 0 : 0.5;
    brake = d < 52;
    car.stopT += dt;
    if (car.stopT > 1.1 && !car.officerSpawned && G.stars >= 1) {
      car.officerSpawned = true;
      const officer = makePed(car.x + 16, car.y + 10, { role: 'officer', shirt: '#22355c', health: 40 });
      G.peds.push(officer);
    }
  } else car.stopT = 0;
  if (Math.abs(diff) > 2.2 && d < 90) { throttle = -0.6; } // overshot: reverse out
  if (car.speed > topSpeed) brake = true;
  stepCar(G, car, { throttle, steer, brake }, dt);
  // a stuck police car backs up and tries again; one that wedges twice far
  // from the action quietly re-enters from a side street (never in view)
  if (Math.abs(car.speed) < 8 && d > 120) {
    car.stuckT += dt;
    if (car.stuckT > 1.4) { car.stuckT = -1.6; car.stuckCycles = (car.stuckCycles ?? 0) + 1; }
  } else if (car.stuckT < 0) {
    stepCar(G, car, { throttle: -0.8, steer: -steer, brake: false }, dt);
    car.stuckT += dt;
    if (car.stuckT >= 0 && Math.abs(car.speed) < 8 && d > 520 && (car.stuckCycles ?? 0) >= 2) {
      const pos = roadPointNear(G, 560, 780, false);
      if (pos) {
        car.x = pos.x; car.y = pos.y;
        car.angle = Math.atan2(p.y - pos.y, p.x - pos.x);
        car.speed = 0; car.stuckCycles = 0;
      }
    }
  } else { car.stuckT = Math.max(0, car.stuckT - dt * 0.4); if (Math.abs(car.speed) > 30) car.stuckCycles = 0; }
}

function updateOfficers(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.role !== 'officer' || ped.dead) continue;
    ped.px = ped.x; ped.py = ped.y;
    if (ped.state === 'down') { ped.downT -= dt; if (ped.downT <= 0) { ped.state = 'walk'; ped.health = ped.maxHealth; } continue; }
    const d = dist(ped.x, ped.y, p.x, p.y);
    if (d > 1200 || G.stars === 0) { ped.dead = true; continue; }
    if (p.car && Math.abs(p.car.speed) > 120) { /* cannot chase a moving car */ }
    else {
      const want = Math.atan2(p.y - ped.y, p.x - ped.x);
      ped.angle = want;
      const sp = d > 24 ? 172 : 0;
      ped.speed = sp;
      ped.walkPhase += dt * sp * 0.055;
      ped.x += Math.cos(want) * sp * dt;
      ped.y += Math.sin(want) * sp * dt;
      G.city.collideEntity(ped);
    }
  }
}

// The nearest live police unit, for the siren mix.
export function nearestPoliceDist(G) {
  let best = 1e9;
  for (const car of G.cars) {
    if (!car.police || car.dead || car.wrecked) continue;
    best = Math.min(best, dist(car.x, car.y, G.player.x, G.player.y));
  }
  return best;
}
