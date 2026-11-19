// wanted.js — heat, stars and the bust meter. Crimes only raise heat when someone
// sees them: a pedestrian within earshot-and-eyeshot, or any police unit nearby.
// Heat cools when nobody has seen Dario for a while. Six stars is the ceiling,
// and each star unlocks a heavier answer from the Policía de Marisol.

import { dist } from './util.js';

export const HEAT_PER_STAR = 100;
export const HEAT_MAX = 600;

export const CRIME_HEAT = {
  theft: 34, hitPed: 42, killPed: 115, shot: 7, crash: 9,
  hitPolice: 48, destroy: 55, copKill: 160, explosion: 60, mission: 100,
};

// Is there a witness at (x, y)? Police see further than civilians.
export function crimeSeen(G, x, y) {
  let seen = false;
  G.hash.query(x, y, 430, (e) => {
    if (e.kind === 'car' && e.police && e.driver === 'police' && !e.wrecked) { seen = true; return true; }
    if (e.kind === 'ped' && !e.dead && e.state !== 'down') {
      const d = dist(x, y, e.x, e.y);
      if (e.role === 'officer' && d < 430) { seen = true; return true; }
      if (d < 265) { seen = true; return true; }
    }
    return false;
  });
  return seen;
}

export function playerSeen(G) {
  const p = G.player;
  let seen = false;
  G.hash.query(p.x, p.y, 580, (e) => {
    if (e.kind === 'car' && e.police && e.driver === 'police' && !e.wrecked) { seen = true; return true; }
    if (e.kind === 'ped' && e.role === 'officer' && !e.dead && !e.corpse) { seen = true; return true; }
    return false;
  });
  G.seenNow = seen;
  return seen;
}

export function starsFor(heat) {
  if (heat <= 0) return 0;
  return Math.min(6, Math.ceil(heat / HEAT_PER_STAR));
}

export const wanted = {
  reportCrime(type, x, y, amountOverride) {
    const G = this.G;
    if (!G) return;
    const amount = amountOverride ?? CRIME_HEAT[type] ?? 10;
    const seen = crimeSeen(G, x, y);
    const loud = type === 'shot' || type === 'explosion' || type === 'copKill';
    if (seen) {
      G.heat = Math.min(HEAT_MAX, G.heat + amount);
      G.lastCrimeT = G.time;
      G.lastSeenT = G.time;
    } else if (!loud) {
      G.heat = Math.min(HEAT_MAX, G.heat + amount * 0.15); // word gets around, slowly
      G.lastCrimeT = G.time;
    }
    if (type === 'shot' || type === 'explosion') G.sys.pedestrians.scarePeds(G, x, y, 300, type);
  },
  addHeat(n) {
    const G = this.G;
    G.heat = Math.min(HEAT_MAX, Math.max(0, G.heat + n));
    if (n > 0) { G.lastCrimeT = G.time; G.lastSeenT = G.time; }
  },
  clearHeat() { if (this.G) { this.G.heat = 0; this.G.bustMeter = 0; } },
  update(dt) {
    const G = this.G;
    const p = G.player;
    if (playerSeen(G)) G.lastSeenT = G.time;
    const unseenFor = G.time - G.lastSeenT;
    if (G.heat > 0 && unseenFor > 3.5 && G.time - G.lastCrimeT > 2.5) {
      const rate = G.stars >= 4 ? 2.1 : 3.4;
      G.heat = Math.max(0, G.heat - rate * dt);
    }
    G.stars = starsFor(G.heat);
    // --- bust meter ---------------------------------------------------------
    let pressure = 0;
    if (G.state === 'play' && !G.dialogue && G.stars > 0 && G.time > (G.noBustUntil ?? 0)) {
      if (!p.car) {
        G.hash.query(p.x, p.y, 130, (e) => {
          if (e.kind === 'car' && e.police && !e.wrecked && e.driver !== 'player' && Math.abs(e.speed) < 30) pressure = Math.max(pressure, 0.5);
          if (e.kind === 'ped' && e.role === 'officer' && !e.dead && e.state !== 'down') {
            const d = dist(p.x, p.y, e.x, e.y);
            if (d < 46) pressure = Math.max(pressure, 0.95);
            else if (d < 90) pressure = Math.max(pressure, 0.55);
          }
          return false;
        });
      } else if (Math.abs(p.car.speed) < 26) {
        G.hash.query(p.x, p.y, 84, (e) => {
          if (e.kind === 'car' && e.police && !e.wrecked && e.driver !== 'player') pressure = Math.max(pressure, 0.5);
          return false;
        });
      }
    }
    if (pressure > 0) G.bustMeter = Math.min(1, G.bustMeter + pressure * dt * 0.62);
    else G.bustMeter = Math.max(0, G.bustMeter - dt * 0.55);
    if (G.bustMeter >= 1 && G.state === 'play') G.onBusted();
  },
};
