// jobs.js — the repeatable work of Marisol Bay, started at three phone booths:
// the green Taxi dispatch in Centro Coral, the yellow Checkpoint Rush on the
// promenade, and the red Frenzy phone in Puerto Azul. Jobs pay through the
// Respect multiplier, just like story work, and never run during a mission.

import { RC } from './city.js';
import { makePed } from './pedestrians.js';
import { dist, clamp } from './util.js';

export const JOB_DEFS = [
  { id: 'taxi', name: 'Taxi Run', phone: 'phoneTaxi', color: '#7fe0a8', blurb: 'Pick up the fare, take them across town, earn the tip.' },
  { id: 'rush', name: 'Checkpoint Rush', phone: 'phoneRush', color: '#ffd76a', blurb: 'Eight checkpoints. The clock pays for what is left of it.' },
  { id: 'frenzy', name: 'Frenzy', phone: 'phoneFrenzy', color: '#ff7a6b', blurb: 'Wreck six cars in ninety seconds. Serra insures half the bay.' },
];

export const jobs = {
  phoneNear(G) {
    if (G.mission || G.job || G.player.car) return null;
    for (const def of JOB_DEFS) {
      const loc = G.city.locations[def.phone];
      if (dist(G.player.x, G.player.y, loc.x, loc.y) < 46) return def;
    }
    return null;
  },
  start(G, def) {
    const J = { def, stage: 'pickup', data: {}, timer: null };
    G.job = J;
    G.audio.blip();
    if (def.id === 'taxi') {
      // a fare waits on a sidewalk a few blocks away
      const a = Math.random() * Math.PI * 2, d = 380 + Math.random() * 420;
      let x = clamp(G.player.x + Math.cos(a) * d, 80, 4480), y = clamp(G.player.y + Math.sin(a) * d, 80, 4300);
      let bx = RC[0]; for (const c of RC) if (Math.abs(c - x) < Math.abs(bx - x)) bx = c;
      x = bx + (Math.random() < 0.5 ? 96 : -96);
      const fare = makePed(x, y, { role: 'passenger', name: 'Fare', shirt: '#f2cc8f' });
      fare.jobTag = 'fare';
      G.peds.push(fare);
      J.data.fare = fare;
      G.objectiveText = 'Pick up the fare';
      G.marker = { x, y, color: def.color };
      G.banner('Taxi Run', 'A fare is waiting. Any car with four wheels and a pulse will do.');
    } else if (def.id === 'rush') {
      J.data.points = [];
      for (let i = 0; i < 8; i++) {
        const ix = (Math.random() * 8) | 0, iy = (Math.random() * 8) | 0;
        J.data.points.push({ x: RC[ix], y: RC[iy] });
      }
      J.data.i = 0;
      J.timer = 42;
      G.objectiveText = 'Checkpoint 1 of 8';
      G.marker = { ...J.data.points[0], color: def.color };
      G.banner('Checkpoint Rush', 'Every gate buys seven more seconds.');
    } else if (def.id === 'frenzy') {
      J.timer = 90;
      J.data.startWrecks = G.stats.carsWrecked;
      G.objectiveText = 'Wreck 6 cars — 0 done';
      G.marker = null;
      G.banner('Frenzy', 'Ninety seconds. Six wrecks. Go and be loud.');
      G.sys.wanted.addHeat(60);
    }
  },
  end(G, paid, why) {
    const J = G.job;
    cleanupJob(G, J);
    G.job = null;
    G.objectiveText = '';
    G.marker = null;
    if (paid > 0) {
      const total = Math.round(paid * G.respect);
      G.money += total;
      G.stats.earned += total;
      G.stats.jobsDone++;
      G.audio.cash();
      G.banner(J.def.name + ' — done', '+$' + total.toLocaleString('en-US') + (why ? ' · ' + why : ''));
    } else {
      G.banner(J.def.name + ' — over', why ?? 'No pay this time.');
      G.audio.fail();
    }
    G.saveSoon();
  },
  update(G, dt) {
    const J = G.job;
    if (!J || G.dialogue) return;
    const p = G.player;
    if (J.timer !== null && J.timer !== undefined) {
      J.timer -= dt;
      if (J.timer <= 0) {
        if (J.def.id === 'frenzy') {
          const done = G.stats.carsWrecked - J.data.startWrecks;
          jobs.end(G, done >= 6 ? 700 : 0, done >= 6 ? 'Six wrecks, as ordered.' : 'Only ' + done + ' of 6 wrecks.');
        } else jobs.end(G, 0, 'Out of time.');
        return;
      }
    }
    if (J.def.id === 'taxi') updateTaxi(G, J, dt);
    else if (J.def.id === 'rush') updateRush(G, J, dt);
    else if (J.def.id === 'frenzy') {
      const done = G.stats.carsWrecked - J.data.startWrecks;
      G.objectiveText = 'Wreck 6 cars — ' + Math.min(6, done) + ' done';
      if (done >= 6) jobs.end(G, 700, 'Six wrecks, as ordered.');
    }
  },
};

function updateTaxi(G, J, dt) {
  const p = G.player;
  const fare = J.data.fare;
  if (!fare || fare.dead) { jobs.end(G, 0, 'The fare gave up waiting.'); return; }
  if (J.stage === 'pickup') {
    G.marker = { x: fare.x, y: fare.y, color: J.def.color };
    if (p.car && dist(p.x, p.y, fare.x, fare.y) < 84 && Math.abs(p.car.speed) < 12) {
      J.stage = 'drop';
      fare.hidden = true;
      fare.state = 'passenger';
      // destination: somewhere far enough to be a ride
      let dx = 0, dy = 0, tries = 0;
      do {
        dx = clamp(p.x + (Math.random() - 0.5) * 3600, 120, 4440);
        dy = clamp(p.y + (Math.random() - 0.5) * 3400, 120, 4260);
        tries++;
      } while (dist(p.x, p.y, dx, dy) < 850 && tries < 12);
      J.data.dest = { x: dx, y: dy };
      J.data.startDist = dist(p.x, p.y, dx, dy);
      J.data.time = 0;
      G.objectiveText = 'Take the fare across town';
      G.banner('Fare aboard', 'Fast and smooth pays a tip.');
    }
  } else {
    J.data.time += dt;
    fare.x = p.x; fare.y = p.y;
    const dest = J.data.dest;
    G.marker = { x: dest.x, y: dest.y, color: J.def.color };
    if (!p.car) { /* fare waits in the car you left; stage stays */ }
    if (dist(p.x, p.y, dest.x, dest.y) < 58 && p.car && Math.abs(p.car.speed) < 30) {
      fare.hidden = false;
      fare.state = 'walk';
      fare.x = dest.x + 16; fare.y = dest.y + 6;
      fare.jobTag = null;
      const base = 55 + J.data.startDist / 11;
      const par = J.data.startDist / 13.5;
      const tip = J.data.time < par ? base * 0.45 : 0;
      jobs.end(G, base + tip, tip ? 'With a fast-driver tip.' : 'Standard fare.');
    }
  }
  void dt;
}

function updateRush(G, J, dt) {
  const p = G.player;
  const pt = J.data.points[J.data.i];
  if (!pt) { jobs.end(G, 0, ''); return; }
  G.marker = { x: pt.x, y: pt.y, color: J.def.color };
  G.objectiveText = 'Checkpoint ' + (J.data.i + 1) + ' of 8';
  if (dist(p.x, p.y, pt.x, pt.y) < 78) {
    J.data.i++;
    J.timer = Math.min(160, J.timer + 7);
    G.audio.pickup();
    G.addMoney(35, pt.x, pt.y);
    if (J.data.i >= J.data.points.length) {
      jobs.end(G, 260 + J.timer * 9, 'Paid by the leftover clock.');
    }
  }
  void dt;
}

function cleanupJob(G, J) {
  if (!J) return;
  if (J.data.fare) {
    if (J.stage === 'pickup') J.data.fare.dead = true;
    else { J.data.fare.hidden = false; J.data.fare.state = 'walk'; J.data.fare.jobTag = null; }
  }
}
