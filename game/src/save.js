// save.js — localStorage persistence for Marisol Heat: money, respect, story
// progress, position, weapons and ammo, collected token ids and lifetime stats.
// Saved on mission/job completion, on pause and every few seconds while playing.

const SAVE_KEY = 'marisol-heat-save-v1';

export function defaultStats() {
  return { missionsDone: 0, carsStolen: 0, tokensFound: 0, jobsDone: 0, arrests: 0, deaths: 0, earned: 0, shotsFired: 0, carsWrecked: 0 };
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function writeSave(G) {
  try {
    const p = G.player;
    const data = {
      money: G.money, respect: G.respect, missionIndex: G.missionIndex, storyDone: G.storyDone,
      hour: G.hour, x: p.x, y: p.y, health: p.health, armor: p.armor,
      weapons: p.weapons, ammo: p.ammo, tokens: [...G.tokensCollected],
      stats: G.stats, carId: p.car ? p.car.id : null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}
