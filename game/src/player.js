// player.js — Dario Venn himself: on-foot movement with mouse aim, sprinting,
// getting into cars (politely or by yanking the driver out onto the tarmac),
// and the driving controls. The car he sits in is just a car whose driver
// field says 'player'; every other system reads it from there.

import { stepCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { keyDown, keyPressed } from './input.js';
import { clamp, dist } from './util.js';

export function makePlayer(x, y) {
  return {
    kind: 'player', x, y, px: x, py: y, r: 11, angle: -Math.PI / 2, speed: 0,
    walkPhase: 0, health: 100, armor: 0, hurtT: 0, godT: 0,
    weapons: { pistol: true, smg: false }, weapon: 'pistol',
    ammo: { pistol: 90, smg: 0 }, car: null, dead: false,
  };
}

export const player = {
  update(G, dt) {
    const p = G.player;
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.godT = Math.max(0, p.godT - dt);
    if (G.dialogue || G.shopOpen || G.repaintT > 0) {
      if (p.car) stepCar(G, p.car, { throttle: 0, steer: 0, brake: true }, dt), syncToCar(G);
      return;
    }
    if (p.car) drivePlayer(G, dt);
    else walkPlayer(G, dt);
  },
  enterCar(G, car) {
    const p = G.player;
    if (car.wrecked) { G.banner('Wrecked', 'That one is not driving anywhere.'); return false; }
    if (car.driver === 'traffic') {
      // yank the driver out: a new, very upset pedestrian appears at the door
      const door = makePed(car.x + Math.cos(car.angle + Math.PI / 2) * 18, car.y + Math.sin(car.angle + Math.PI / 2) * 18,
        { role: 'civilian', shirt: '#bc6c25' });
      door.state = 'flee'; door.panicT = 2.6; door.panicFrom = { x: p.x, y: p.y };
      G.peds.push(door);
      G.sys.wanted.reportCrime('theft', car.x, car.y);
      G.stats.carsStolen++;
      car.everStolen = true;
    } else if (car.police) {
      G.sys.wanted.reportCrime('theft', car.x, car.y, 40);
      G.sys.wanted.addHeat(26);
      G.stats.carsStolen++;
      car.everStolen = true;
      car.driver = 'parked'; // the unit is now stolen, not on duty
      car.policeStolen = true;
    } else if (!car.everStolen && car.driver === 'parked') {
      G.sys.wanted.reportCrime('theft', car.x, car.y, 18);
      G.stats.carsStolen++;
      car.everStolen = true;
    }
    car.driver = 'player';
    p.car = car;
    syncToCar(G);
    G.audio.blip();
    return true;
  },
  exitCar() {
    const G = this.G;
    const p = G.player;
    if (!p.car) return;
    const car = p.car;
    if (car.policeStolen) { car.police = false; car.policeStolen = false; }
    car.driver = 'parked';
    // step out on the left side
    p.x = car.x + Math.cos(car.angle - Math.PI / 2) * (car.wid / 2 + 15);
    p.y = car.y + Math.sin(car.angle - Math.PI / 2) * (car.wid / 2 + 15);
    p.car = null;
    G.city.collideEntity(p);
  },
};

function syncToCar(G) {
  const p = G.player, car = p.car;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  p.speed = car.speed;
}

function drivePlayer(G, dt) {
  const p = G.player, car = p.car;
  const ctl = {
    throttle: (keyDown('KeyW', 'ArrowUp') ? 1 : 0) + (keyDown('KeyS', 'ArrowDown') ? -1 : 0),
    steer: (keyDown('KeyD', 'ArrowRight') ? 1 : 0) + (keyDown('KeyA', 'ArrowLeft') ? -1 : 0),
    brake: keyDown('Space'),
  };
  stepCar(G, car, ctl, dt);
  syncToCar(G);
  const ratio = Math.abs(car.speed) / car.maxSpeed;
  G.audio.engine(ratio, true);
}

function walkPlayer(G, dt) {
  const p = G.player;
  let mx = (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (keyDown('KeyS', 'ArrowDown') ? 1 : 0) - (keyDown('KeyW', 'ArrowUp') ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const sprint = keyDown('ShiftLeft', 'ShiftRight');
  const speed = sprint ? 232 : 148;
  p.px = p.x; p.py = p.y;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.walkPhase += dt * speed * 0.055;
    if (!G.input.mouse.down) p.angle = Math.atan2(my, mx);
    p.speed = speed;
  } else p.speed = 0;
  // aim with the mouse while the trigger is down
  if (G.input.mouse.down) {
    const w = G.screenToWorld(G.input.mouse.x, G.input.mouse.y);
    p.angle = Math.atan2(w.y - p.y, w.x - p.x);
  }
  G.city.collideEntity(p);
  // cars are solid to walk into, and dangerous when fast
  G.hash.query(p.x, p.y, 60, (car) => {
    if (car.kind !== 'car') return false;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < car.r + p.r - 2 && d > 0.01) {
      const nx = (p.x - car.x) / d, ny = (p.y - car.y) / d;
      p.x = car.x + nx * (car.r + p.r - 2);
      p.y = car.y + ny * (car.r + p.r - 2);
      if (Math.abs(car.speed) > 130 && car.driver !== 'player') {
        G.sys.combat.hurtPlayer(11, 'crash');
        G.shake = Math.max(G.shake, 4);
        p.godT = 0.9;
      }
    }
    return false;
  });
  G.audio.engine(0, false);
  void clamp; void keyPressed;
}
