// traffic.js — Marisol Bay's civilian traffic: cars that pick a destination
// intersection, follow right-hand lanes between waypoints, brake for the car or
// pedestrian ahead, and stop at working traffic lights. Lights run on a simple
// two-phase cycle per intersection; the player and the police ignore them.

import { RC, ROAD_HALF } from './city.js';
import { makeCar, stepCar } from './vehicles.js';
import { clamp, angToward, angDiff, dist, choice, chance } from './util.js';

export const TRAFFIC_TARGET = 24;
const CIVILIAN_MODELS = ['sedan', 'sedan', 'hatch', 'coupe', 'pickup', 'van', 'wagon', 'taxi'];

// Light phase for an intersection: 0..13 s cycle; NS flows on [0,5.6), EW on [6.6,12.2).
export function lightPhase(ix, iy, t) {
  const off = ((ix * 7 + iy * 13) % 5) * 1.7;
  return (t + off) % 13.2;
}
export function lightFor(axis, ix, iy, t) {
  const p = lightPhase(ix, iy, t);
  if (axis === 'NS') return p < 5 ? 'green' : p < 6.2 ? 'yellow' : 'red';
  return p < 6.2 ? 'red' : p < 11.4 ? 'green' : p < 12.6 ? 'yellow' : 'red';
}

function lanePoint(ix, iy, dir) {
  // The point a car aims for when crossing intersection (ix, iy) heading dir.
  // dir: 0 east, 1 south, 2 west, 3 north. Right-hand traffic offsets.
  const x = RC[ix], y = RC[iy], o = 36;
  if (dir === 0) return { x, y: y + o };
  if (dir === 2) return { x, y: y - o };
  if (dir === 1) return { x: x - o, y };
  return { x: x + o, y };
}
function entryPoint(ix, iy, dir) {
  // Where the lane enters the intersection box when heading dir.
  const p = lanePoint(ix, iy, dir);
  if (dir === 0) return { x: RC[ix] - ROAD_HALF - 6, y: p.y };
  if (dir === 2) return { x: RC[ix] + ROAD_HALF + 6, y: p.y };
  if (dir === 1) return { x: p.x, y: RC[iy] - ROAD_HALF - 6 };
  return { x: p.x, y: RC[iy] + ROAD_HALF + 6 };
}

function nearestIntersection(x, y) {
  let bi = 0, bj = 0, bd = 1e12;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const d = (RC[i] - x) ** 2 + (RC[j] - y) ** 2;
    if (d < bd) { bd = d; bi = i; bj = j; }
  }
  return { ix: bi, iy: bj };
}

export function spawnTrafficCar(G, nearPlayer = true) {
  // spawn on a road, away from the player's view but not too far
  for (let tries = 0; tries < 12; tries++) {
    const ix = (Math.random() * 8) | 0, iy = (Math.random() * 8) | 0;
    const dir = (Math.random() * 4) | 0;
    const along = (Math.random() - 0.5) * 380;
    let x, y;
    if (dir === 0 || dir === 2) { x = RC[ix] + along; y = RC[iy] + (dir === 0 ? 36 : -36); }
    else { x = RC[ix] + (dir === 3 ? 36 : -36); y = RC[iy] + along; }
    const dp = dist(x, y, G.player.x, G.player.y);
    if (nearPlayer && (dp < 480 || dp > 1250)) continue;
    if (G.city.isWater(x, y)) continue;
    const car = makeCar(choice(CIVILIAN_MODELS), x, y, dir * Math.PI / 2, { driver: 'traffic' });
    car.ix = ix; car.iy = iy; car.dir = dir;
    planRoute(car);
    G.cars.push(car);
    return car;
  }
  return null;
}

function planRoute(car) {
  // choose a destination intersection, then a Manhattan path (x legs and y legs)
  car.destIx = (Math.random() * 8) | 0;
  car.destIy = (Math.random() * 8) | 0;
  car.leg = 'x';
  computeWaypoint(car);
}
function computeWaypoint(car) {
  // Next intersection to head for, along the current leg.
  let { ix, iy, dir } = car;
  if (car.leg === 'x') {
    if (ix === car.destIx) { car.leg = 'y'; return computeWaypoint(car); }
    const step = Math.sign(car.destIx - ix);
    dir = step > 0 ? 0 : 2;
    car.nextIx = ix + step; car.nextIy = iy;
  } else {
    if (iy === car.destIy) { planRoute(car); return; }
    const step = Math.sign(car.destIy - iy);
    dir = step > 0 ? 1 : 3;
    car.nextIx = ix; car.nextIy = iy + step;
  }
  car.dir = dir;
  car.waypoint = entryPoint(car.nextIx, car.nextIy, dir);
  car.turnPoint = lanePoint(car.nextIx, car.nextIy, dir);
}

// Take over any car as ordinary traffic (used when a police unit stands down:
// it simply drives off into the city and despawns like everyone else).
export function adoptAsTraffic(car) {
  let ix = 0, iy = 0;
  RC.forEach((c, i) => { if (Math.abs(c - car.x) < Math.abs(RC[ix] - car.x)) ix = i; });
  RC.forEach((c, i) => { if (Math.abs(c - car.y) < Math.abs(RC[iy] - car.y)) iy = i; });
  car.ix = ix; car.iy = iy;
  car.dir = ((Math.round(car.angle / (Math.PI / 2)) % 4) + 4) % 4;
  car.waypoint = null; car.turning = false; car.stuckT = 0; car.reverseT = 0;
  planRoute(car);
}

export function initTraffic(G) {  for (let i = 0; i < TRAFFIC_TARGET; i++) spawnTrafficCar(G, false) || spawnTrafficCar(G, true);
  // parked cars from the city's parking spots
  for (const s of G.city.parkedSpots) {
    if (G.cars.length > 90) break;
    const car = makeCar(choice(CIVILIAN_MODELS), s.x, s.y, s.angle + (chance(0.5) ? 0 : Math.PI), { driver: 'parked' });
    G.cars.push(car);
  }
}

export function updateTraffic(G, dt) {
  let live = 0;
  for (const car of G.cars) {
    if (car.driver !== 'traffic') continue;
    if (car.dead || car.wrecked) continue;
    const dp = dist(car.x, car.y, G.player.x, G.player.y);
    if (dp > 1500) { car.dead = true; continue; }
    live++;
    driveTrafficCar(G, car, dt);
  }
  if (live < TRAFFIC_TARGET && Math.random() < dt * 1.6) spawnTrafficCar(G, true);
}

function driveTrafficCar(G, car, dt) {
  if (car.stuckT > 0) {
    car.stuckT -= dt;
    stepCar(G, car, { throttle: car.reverseT > 0 ? -0.7 : 0, steer: -car.steer, brake: car.reverseT <= 0 }, dt);
    if (car.stuckT <= 0.35 && car.reverseT <= 0) car.reverseT = 0.55;
    if (car.reverseT > 0) car.reverseT -= dt;
    return;
  }
  if (!car.waypoint) computeWaypoint(car);
  // which target: entry point, then the crossing point, then advance the route
  const target = car.turning ? car.turnPoint : car.waypoint;
  const dTarget = dist(car.x, car.y, target.x, target.y);
  if (!car.turning && dTarget < 64) car.turning = true;
  else if (car.turning && dTarget < 40) {
    car.ix = car.nextIx; car.iy = car.nextIy; car.turning = false;
    computeWaypoint(car);
  }
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angDiff(car.angle, want);
  const steer = clamp(diff * 2.4, -1, 1);
  // --- decide target speed: lights, traffic ahead, corners -------------------
  let targetSpeed = car.maxSpeed * 0.52;
  if (Math.abs(diff) > 0.5) targetSpeed = car.maxSpeed * 0.3;
  // traffic light at the intersection we are entering
  if (!car.turning) {
    const axis = (car.dir === 0 || car.dir === 2) ? 'EW' : 'NS';
    const light = lightFor(axis, car.nextIx, car.nextIy, G.time);
    if (light !== 'green') {
      const stopD = dist(car.x, car.y, car.waypoint.x, car.waypoint.y);
      if (stopD < 110) targetSpeed = Math.min(targetSpeed, clamp((stopD - 26) * 2.2, 0, targetSpeed));
    }
  }
  // something ahead in our lane?
  const fx = car.x + Math.cos(car.angle) * (car.len * 0.62 + 30);
  const fy = car.y + Math.sin(car.angle) * (car.len * 0.62 + 30);
  let blocked = false;
  G.hash.query(fx, fy, 34, (e) => {
    if (e === car) return false;
    if (e.kind === 'car' || e.kind === 'ped') { blocked = true; return true; }
    return false;
  });
  if (blocked) targetSpeed = 0;
  const ahead2 = G.hash.nearest(car.x + Math.cos(car.angle) * 74, car.y + Math.sin(car.angle) * 74, 40,
    (e) => e !== car && e.kind === 'car' && !e.wrecked);
  if (ahead2 && ahead2.speed < car.speed) targetSpeed = Math.min(targetSpeed, ahead2.speed * 0.92);
  // --- convert to controls ---------------------------------------------------
  let throttle = 0, brake = false;
  if (car.speed < targetSpeed - 6) throttle = 0.75;
  else if (car.speed > targetSpeed + 10) brake = true;
  if (targetSpeed === 0 && car.speed < 4) { throttle = 0; brake = true; }
  stepCar(G, car, { throttle, steer, brake }, dt);
  // stuck detection: wants to move but barely does
  if (throttle > 0 && Math.abs(car.speed) < 6 && targetSpeed > 30) {
    car.stuckT += dt * 0.5;
    if (car.stuckT > 0.9) { car.stuckT = 1.1; car.reverseT = 0; }
  } else car.stuckT = Math.max(0, car.stuckT - dt);
  void angToward;
}
