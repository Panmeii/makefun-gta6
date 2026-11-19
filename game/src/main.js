// main.js — Marisol Heat boots here. Builds the world, owns the state machine
// (menu → play ⇄ pause, busted and wasted flows), the E-key interaction
// priority, autosave, the per-frame update order, and a small debug handle
// (window.MH) used by the screenshot pipeline to stage scenes honestly —
// it only moves the player, the clock and the heat; the game does the rest.

import { buildCity } from './city.js';
import { initInput, input, keyPressed, keyDown, endFrameInput } from './input.js';
import { SpatialHash } from './spatial.js';
import { ParticlePool } from './particles.js';
import { AudioEngine } from './audio.js';
import { makeWeather, updateWeather, advanceClock, makeLightSprite } from './daynight.js';
import { wanted } from './wanted.js';
import { combat } from './combat.js';
import * as pedestrians from './pedestrians.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { updatePolice, nearestPoliceDist } from './police.js';
import { collideCars, updateCarFires } from './vehicles.js';
import { makePlayer, player } from './player.js';
import { missions, MISSIONS, advanceDialogue } from './missions.js';
import { jobs } from './jobs.js';
import { shop, GUN_ITEMS } from './shop.js';
import { tokenPositions, updateTokens } from './tokens.js';
import { defaultStats, hasSave, readSave, writeSave } from './save.js';
import { updateCamera, draw, cam, menuLayout } from './render.js';
import { dist } from './util.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
document.getElementById('boot')?.remove();

const G = {
  canvas, ctx, input,
  state: 'menu', time: 0, stateT: 0,
  city: buildCity(), hash: new SpatialHash(), particles: new ParticlePool(),
  audio: new AudioEngine(), weather: makeWeather(), lightSprite: makeLightSprite(),
  cam, view: { x0: 0, y0: 0, x1: 0, y1: 0 },
  player: null, cars: [], peds: [], bullets: [], floaters: [],
  hour: 10.2, money: 250, respect: 1.0,
  heat: 0, stars: 0, bustMeter: 0, lastSeenT: -99, lastCrimeT: -99, seenNow: false,
  policeSpawnT: 0, roadblockT: 8,
  missionIndex: 0, storyDone: false, mission: null, job: null,
  dialogue: null, shopOpen: null, shopSel: 0, shopMsg: '',
  objectiveText: '', marker: null, prompt: '', bannerData: null,
  tokensCollected: new Set(), tokenSpots: null,
  stats: defaultStats(), shake: 0, hitstop: 0, repaintT: 0,
  saveT: 0, savePending: false, hoverBtn: null,
};
G.tokenSpots = tokenPositions(G);
G.sys = { wanted, combat, pedestrians, missions, jobs, shop, player };
wanted.G = G;
combat.G = G;
player.G = G;

G.addMoney = (n, x, y) => {
  G.money += n;
  if (n > 0) G.stats.earned += n;
  if (x !== undefined) G.floaters.push({ x, y, text: (n >= 0 ? '+$' : '-$') + Math.abs(n), color: n >= 0 ? '#ffd76a' : '#ff8a7a', t: 0, life: 1.15 });
};
G.banner = (title, sub = '') => { G.bannerData = { title, sub, t: 0 }; };
G.saveSoon = () => { G.savePending = true; };
G.floater = (x, y, text, color = '#f2f0e6') => G.floaters.push({ x, y, text, color, t: 0, life: 1.15 });
G.screenToWorld = (mx, my) => ({
  x: cam.x + (mx - canvas.width / 2) / cam.zoom,
  y: cam.y + (my - canvas.height / 2) / cam.zoom,
});
G.onBusted = () => {
  if (G.state !== 'play') return;
  G.state = 'busted'; G.stateT = 0;
  G.stats.arrests++;
  G.audio.sting(true);
  G.audio.siren(99999);
};
G.onWasted = () => {
  if (G.state !== 'play') return;
  G.state = 'wasted'; G.stateT = 0;
  G.stats.deaths++;
  G.audio.sting(true);
  G.audio.explosionSound();
};

// --- world setup ---------------------------------------------------------------
function resetWorld() {
  G.cars = []; G.peds = []; G.bullets = []; G.floaters = [];
  G.player = makePlayer(1500, 4292);
  G.mission = null; G.job = null; G.dialogue = null; G.shopOpen = null;
  G.heat = 0; G.stars = 0; G.bustMeter = 0; G.marker = null; G.objectiveText = '';
  G.bannerData = null; G.shake = 0; G.hitstop = 0; G.repaintT = 0;
  pedestrians.placeStoryCharacters(G);
  initTraffic(G);
  cam.x = G.player.x; cam.y = G.player.y; cam.zoom = 1;
}

function startGame(fromSave) {
  resetWorld();
  G.money = 250; G.respect = 1.0; G.missionIndex = 0; G.storyDone = false;
  G.hour = 10.2; G.stats = defaultStats();
  G.tokensCollected = new Set();
  if (fromSave) {
    const s = readSave();
    if (s) {
      G.money = s.money ?? G.money;
      G.respect = s.respect ?? 1;
      G.missionIndex = s.missionIndex ?? 0;
      G.storyDone = !!s.storyDone;
      G.hour = s.hour ?? G.hour;
      const p = G.player;
      if (typeof s.x === 'number') { p.x = s.x; p.y = s.y; }
      p.health = s.health ?? 100; p.armor = s.armor ?? 0;
      if (s.weapons) p.weapons = { pistol: true, smg: !!s.weapons.smg };
      if (s.ammo) p.ammo = { pistol: s.ammo.pistol ?? 90, smg: s.ammo.smg ?? 0 };
      if (p.weapons.smg) p.weapon = 'smg';
      G.tokensCollected = new Set(Array.isArray(s.tokens) ? s.tokens : []);
      G.stats = { ...defaultStats(), ...(s.stats ?? {}) };
      cam.x = p.x; cam.y = p.y;
      G.banner('Welcome back to Marisol Bay', 'Chapter ' + Math.min(5, G.missionIndex + 1) + ' awaits — check the gold "!" on your map.');
    }
  }
  if (!fromSave) {
    G.banner('Marisol Bay', 'Lulu Ferrer is waiting by her kiosk on the promenade. Follow the gold "!".');
  }
  G.state = 'play';
  G.saveSoon();
}

// menu backdrop world (traffic and strollers behind the title)
resetWorld();
G.player.x = 2280; G.player.y = 4240;

// --- respawn flows ---------------------------------------------------------------
function releaseCar() {
  const p = G.player;
  if (p.car) {
    if (p.car.policeStolen) { p.car.police = false; p.car.policeStolen = false; }
    p.car.driver = 'parked';
    p.car = null;
  }
}

function respawnBusted() {
  const fine = Math.min(G.money, 150 + G.stars * 60);
  G.money -= fine;
  releaseCar();
  const L = G.city.locations.policeStation;
  G.player.x = L.doorX; G.player.y = L.doorY + 26;
  G.player.health = 100;
  wanted.clearHeat();
  G.bustMeter = 0;
  G.noBustUntil = G.time + 4;
  G.state = 'play';
  G.banner('Released', 'Fine paid: $' + fine + '. Inés suggests a quieter hobby.');
  G.saveSoon();
}

function respawnWasted() {
  const fee = Math.min(G.money, 200);
  G.money -= fee;
  releaseCar();
  const L = G.city.locations.hospital;
  G.player.x = L.doorX; G.player.y = L.doorY + 26;
  G.player.health = 100; G.player.armor = 0;
  wanted.clearHeat();
  G.noBustUntil = G.time + 4;
  G.state = 'play';
  G.banner('Discharged', 'Hospital bill: $' + fee + '. The bay missed you.');
  G.saveSoon();
}

// --- input & interaction -----------------------------------------------------------
function inRect(mx, my, r) { return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h; }

function menuInput() {
  const { newBtn, contBtn } = menuLayout(canvas.width, canvas.height);
  const m = input.mouse;
  G.hoverBtn = inRect(m.x, m.y, newBtn) ? 'new' : inRect(m.x, m.y, contBtn) && hasSave() ? 'cont' : null;
  if (m.clicked) {
    if (inRect(m.x, m.y, newBtn)) { G.audio.ensure(); G.audio.success(); startGame(false); }
    else if (inRect(m.x, m.y, contBtn) && hasSave()) { G.audio.ensure(); G.audio.success(); startGame(true); }
  }
  if (keyPressed('Enter')) { G.audio.ensure(); startGame(hasSave()); }
}

function nearestEnterableCar() {
  const p = G.player;
  let best = null, bd = 56;
  for (const car of G.cars) {
    if (car.dead || car.driver === 'player') continue;
    const d = dist(p.x, p.y, car.x, car.y) - car.r * 0.4;
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function interact() {
  const p = G.player;
  if (G.dialogue) { advanceDialogue(G); return; }
  if (G.shopOpen) { shop.close(G); return; }
  if (p.car) {
    if (shop.canRepaint(G)) { shop.repaint(G); return; }
    player.exitCar();
    return;
  }
  if (shop.nearDoor(G)) { shop.open(G); return; }
  const phone = jobs.phoneNear(G);
  if (phone) { jobs.start(G, phone); return; }
  const def = missions.availableDef(G);
  if (def) {
    const giver = missions.giverPed(G, def);
    if (giver && dist(p.x, p.y, giver.x, giver.y) < 52) { missions.start(G, def); return; }
  }
  const car = nearestEnterableCar();
  if (car) player.enterCar(G, car);
}

function computePrompt() {
  const p = G.player;
  G.prompt = '';
  if (G.dialogue) { G.prompt = 'E — Continue'; return; }
  if (G.shopOpen || G.state !== 'play') return;
  if (p.car) {
    G.prompt = shop.canRepaint(G)
      ? 'E — Taller Brisa repaint & repair, $300 (clears the heat)'
      : 'E — Exit vehicle · Space — handbrake';
    return;
  }
  if (shop.nearDoor(G)) { G.prompt = 'E — Enter Armería Ola'; return; }
  const phone = jobs.phoneNear(G);
  if (phone) { G.prompt = 'E — ' + phone.name + ' (side job)'; return; }
  const def = missions.availableDef(G);
  if (def) {
    const giver = missions.giverPed(G, def);
    if (giver && dist(p.x, p.y, giver.x, giver.y) < 52) {
      G.prompt = 'E — Talk to ' + def.giver + ' · Chapter: ' + def.title;
      return;
    }
  }
  const car = nearestEnterableCar();
  if (car) G.prompt = car.driver === 'traffic' || car.police ? 'E — Steal the ' + car.model : 'E — Enter the ' + car.model;
}

function playInput() {
  if (keyPressed('KeyM')) { G.audio.ensure(); G.audio.setMuted(!G.audio.muted); G.banner(G.audio.muted ? 'Sound off' : 'Sound on'); }
  if (G.shopOpen) {
    if (keyPressed('Escape') || keyPressed('KeyE')) shop.close(G);
    for (let i = 0; i < 5; i++) {
      if (keyPressed('Digit' + (i + 1))) {
        G.shopSel = i;
        G.shopMsg = shop.buy(G, shopItems()[i]);
      }
    }
    if (input.mouse.clicked) {
      // rows are drawn at fixed offsets in shop.draw — mirror them here
      const W = canvas.width, H = canvas.height;
      const pw = 520, ph = 356, px = (W - pw) / 2, py = (H - ph) / 2;
      for (let i = 0; i < 5; i++) {
        const y = py + 108 + i * 44;
        if (input.mouse.x > px + 14 && input.mouse.x < px + pw - 14 && input.mouse.y > y - 28 && input.mouse.y < y + 16) {
          G.shopSel = i;
          G.shopMsg = shop.buy(G, shopItems()[i]);
        }
      }
    }
    return;
  }
  if (keyPressed('Escape') || keyPressed('KeyP')) { G.state = 'pause'; writeSave(G); return; }
  if (keyPressed('KeyE')) interact();
  if (keyPressed('KeyF') && !G.dialogue) {
    if (G.player.car) player.exitCar();
    else { const car = nearestEnterableCar(); if (car) player.enterCar(G, car); }
  }
  if (keyPressed('KeyQ')) {
    const p = G.player;
    if (p.weapons.smg) { p.weapon = p.weapon === 'smg' ? 'pistol' : 'smg'; G.audio.blip(); }
  }
  if (keyPressed('Tab')) input.mouse; // reserved; Tab is captured by GAME_KEYS
}

function shopItems() { return GUN_ITEMS; }

// --- per-frame update ----------------------------------------------------------------
function cleanup() {
  if (G.cars.some(c => c.dead)) G.cars = G.cars.filter(c => !c.dead);
  if (G.peds.some(p => p.dead)) G.peds = G.peds.filter(p => !p.dead);
  if (G.floaters.length) {
    for (const f of G.floaters) f.t += 1 / 60;
    G.floaters = G.floaters.filter(f => f.t < f.life);
  }
  if (G.bannerData) { G.bannerData.t += 1 / 60; if (G.bannerData.t > 3.6) G.bannerData = null; }
}

function ambientUpdate(dt) {
  updateCamera(G, dt);
  G.hash.rebuild([...G.cars, ...G.peds]);
  updateWeather(G, dt);
  updateTraffic(G, dt);
  pedestrians.updatePedestrians(G, dt);
  G.particles.update(dt);
  cleanup();
}

function playUpdate(dt) {
  if (G.hitstop > 0) {
    G.hitstop -= dt;
    G.particles.update(dt * 0.3);
    updateCamera(G, dt);
    return;
  }
  playInput();
  if (G.state !== 'play') return; // pause may have been toggled
  advanceClock(G, dt);
  updateCamera(G, dt);
  G.hash.rebuild([...G.cars, ...G.peds]);
  updateWeather(G, dt);
  wanted.update(dt);
  if (G.state === 'play') {
    updateTraffic(G, dt);
    updatePolice(G, dt);
    pedestrians.updatePedestrians(G, dt);
    combat.update(dt);
    player.update(G, dt);
    collideCars(G, dt);
    updateCarFires(G, dt);
    updateTokens(G);
    missions.update(G, dt);
    jobs.update(G, dt);
    shop.update(G, dt);
    G.particles.update(dt);
    computePrompt();
    G.audio.siren(nearestPoliceDist(G));
    G.audio.music(dt, true);
    G.saveT += dt;
    if ((G.savePending && G.saveT > 0.5) || G.saveT > 25) { writeSave(G); G.saveT = 0; G.savePending = false; }
  }
  G.shake = Math.max(0, G.shake - dt * 26);
  cleanup();
}

function step(dt) {
  if (input.mouse.clicked || input.pressed.size) G.audio.ensure();
  if (G.state === 'menu') {
    G.time += dt;
    menuInput();
    ambientUpdate(dt);
    G.audio.music(dt, false);
    G.audio.engine(0, false);
  } else if (G.state === 'play') {
    G.time += dt;
    playUpdate(dt);
  } else if (G.state === 'pause') {
    if (keyPressed('Escape') || keyPressed('KeyP')) G.state = 'play';
  } else if (G.state === 'busted' || G.state === 'wasted') {
    G.time += dt;
    G.stateT += dt;
    ambientUpdate(dt);
    G.audio.siren(99999);
    if (G.stateT > 2.8) {
      if (G.state === 'busted') respawnBusted();
      else respawnWasted();
    }
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.033, Math.max(0.0005, (now - last) / 1000));
  last = now;
  step(dt);
  draw(G);
  endFrameInput();
}
initInput(canvas);
requestAnimationFrame(frame);

// debug handle for the screenshot pipeline (state staging only, no cheats in UI)
window.MH = {
  G,
  setHour: (h) => { G.hour = h; },
  addHeat: (n) => wanted.addHeat(n),
  setStars: (s) => { G.heat = s > 0 ? (s - 1) * 100 + 50 : 0; },
  teleport: (x, y) => {
    const p = G.player;
    p.x = x; p.y = y;
    if (p.car) { p.car.x = x; p.car.y = y; }
    cam.x = x; cam.y = y;
  },
  giveMoney: (n) => { G.money += n; },
  giveSmg: () => { G.player.weapons.smg = true; G.player.ammo.smg += 300; G.player.weapon = 'smg'; },
  startMission: (i) => { G.missionIndex = i; G.storyDone = false; if (MISSIONS[i]) missions.start(G, MISSIONS[i]); },
  newGame: () => startGame(false),
  continueGame: () => startGame(true),
  keyDown, // exposed for completeness; tests drive real keyboard events instead
};
