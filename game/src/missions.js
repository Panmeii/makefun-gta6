// missions.js — Dario Venn's story in five chapters, all of it driven from the
// MISSIONS table below: named givers, dialogue, objectives, timers and pay.
// A generic step runner walks each mission's steps (go, steal, deliver, pick up,
// drop, kill, checkpoints, escort, escape); per-mission setup hooks spawn the
// marked car, the package heat, the collectors and Bruno Serra himself.
// Finishing a chapter raises Dario's Respect multiplier, which pays on
// everything from then on.

import { makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { dist } from './util.js';

export const MISSIONS = [
  {
    id: 'first-wheels', no: '01', title: 'First Wheels', giver: 'Lulu Ferrer', pay: 450, respect: 0.15,
    blurb: 'Lulu needs a clean coupe lifted from Centro Coral — and delivered to Taller Brisa.',
  },
  {
    id: 'hot-package', no: '02', title: 'Hot Package', giver: 'Lulu Ferrer', pay: 800, respect: 0.15,
    blurb: 'A package waits at the end of the marina pier. The whole port will watch you take it.',
  },
  {
    id: 'the-collector', no: '03', title: 'The Collector', giver: 'Héctor Ruiz', pay: 1100, respect: 0.2,
    blurb: "Bruno Serra's debt collectors came to Taller Brisa. Héctor needs them gone — and a ride out.",
  },
  {
    id: 'harbor-lights', no: '04', title: 'Harbor Lights', giver: 'Vera Lindqvist', pay: 1400, respect: 0.2,
    blurb: "Vera's guests want a tour of the harbour lights. Five stops, one clock, no questions.",
  },
  {
    id: 'serras-last-night', no: '05', title: "Serra's Last Night", giver: 'Capt. Inés Salas', pay: 3000, respect: 0.3,
    blurb: 'A captain of police is tired of Bruno Serra. Tonight he walks to the lighthouse. End it.',
  },
];

const DIALOGUES = {
  'first-wheels': {
    intro: [
      ['Lulu Ferrer', 'Dario Venn. Heard you drive like the road owes you money.'],
      ['Dario Venn', 'Depends who is paying, Lulu.'],
      ['Lulu Ferrer', 'A coupe sits in Centro Coral, keys in, owner at lunch until forever. Lift it.'],
      ['Lulu Ferrer', 'Take it to Héctor at Taller Brisa. No scratches you cannot explain.'],
    ],
    outro: [
      ['Héctor Ruiz', 'Clean lift, clean car. Lulu said you were good.'],
      ['Dario Venn', 'Tell her the city agrees.'],
    ],
  },
  'hot-package': {
    intro: [
      ['Lulu Ferrer', 'End of the marina pier, blue crate. You pick it up, every camera in Puerto Azul wakes up.'],
      ['Dario Venn', 'And then?'],
      ['Lulu Ferrer', 'Then you drive like the package is on fire. Vera is waiting at the Hotel Serena. Four minutes.'],
    ],
    outro: [
      ['Vera Lindqvist', 'You smell of salt and sirens, Mr Venn. The package is intact.'],
      ['Dario Venn', 'So am I. Mostly.'],
    ],
  },
  'the-collector': {
    intro: [
      ['Héctor Ruiz', 'Serra sent his collectors. Three of them, in my yard, with guns and paperwork.'],
      ['Dario Venn', 'Which do I answer first?'],
      ['Héctor Ruiz', 'The guns, Dario. Then drive me to my cousin in Barrio Brisa. I am done hiding in my own taller.'],
    ],
    outro: [
      ['Héctor Ruiz', 'Brisa air. I forgot what it smells like without petrol.'],
      ['Dario Venn', 'Stay low, Héctor. Serra counts his men.'],
    ],
  },
  'harbor-lights': {
    intro: [
      ['Vera Lindqvist', 'My guests paid to see the harbour lights, Mr Venn. All five, before the last ferry.'],
      ['Dario Venn', 'I am a driver, not a tour guide.'],
      ['Vera Lindqvist', 'Tonight you are both. The clock is the small price of a large envelope.'],
    ],
    outro: [
      ['Vera Lindqvist', 'Five lights, and the ferry still waited. You have a gift, Mr Venn.'],
      ['Dario Venn', 'So everyone keeps telling me. It never feels like one.'],
    ],
  },
  'serras-last-night': {
    intro: [
      ['Capt. Inés Salas', 'Off the record, Venn. Bruno Serra walks to the Faro tonight, like he owns the dark.'],
      ['Dario Venn', 'And the Policía does nothing?'],
      ['Capt. Inés Salas', 'The Policía is doing something. She is talking to you. Finish it, then disappear.'],
    ],
    outro: [
      ['Lulu Ferrer', 'They say the lighthouse went dark for one minute. The whole bay saw it.'],
      ['Dario Venn', 'Then the whole bay can sleep now.'],
      ['Lulu Ferrer', 'Marisol is yours, Dario Venn. Try not to spend it all in one night.'],
    ],
  },
};

export const missions = {
  availableDef(G) {
    if (G.mission || G.job || G.storyDone) return null;
    return MISSIONS[G.missionIndex] ?? null;
  },
  giverPed(G, def) {
    return G.peds.find((p) => p.role === 'npc' && p.name === def.giver) ?? null;
  },
  start(G, def) {
    const M = {
      def, stepI: 0, data: {}, timer: null, targets: [], failed: false,
      onTargetDown: null, onTargetHurt: null, onEnterCar: null,
    };
    G.mission = M;
    const dlg = DIALOGUES[def.id];
    startDialogue(G, dlg.intro, () => { setupStep(G, M); });
    G.banner('Chapter ' + def.no, def.title);
  },
  fail(G, reason) {
    const M = G.mission;
    if (!M) return;
    cleanupMissionEntities(G, M);
    G.mission = null;
    G.objectiveText = '';
    G.marker = null;
    G.banner('Mission failed', reason + ' — talk to ' + M.def.giver + ' to try again.');
    G.audio.fail();
    G.saveSoon();
  },
  complete(G) {
    const M = G.mission;
    const def = M.def;
    cleanupMissionEntities(G, M);
    G.mission = null;
    G.objectiveText = '';
    G.marker = null;
    const pay = Math.round(def.pay * G.respect);
    G.money += pay;
    G.stats.earned += pay;
    G.stats.missionsDone++;
    G.respect = Math.round((G.respect + def.respect) * 100) / 100;
    G.missionIndex++;
    if (def.id === 'serras-last-night') G.storyDone = true;
    G.audio.success();
    G.saveSoon();
    const dlg = DIALOGUES[def.id];
    startDialogue(G, dlg.outro, () => {
      G.banner(def.title + ' — complete', '+' + '$' + pay.toLocaleString('en-US') + ' · Respect ×' + G.respect.toFixed(2));
      if (G.storyDone) setTimeout(() => G.banner('MARISOL HEAT', 'Story complete — the bay is yours. Free roam, jobs and tokens remain.'), 3600);
    });
  },
  update(G, dt) {
    const M = G.mission;
    if (!M || G.dialogue) return;
    const step = M.def.steps[M.stepI];
    if (!step) { missions.complete(G); return; }
    if (M.timer !== null && M.timer !== undefined) {
      M.timer -= dt;
      if (M.timer <= 0) { missions.fail(G, 'Out of time'); return; }
    }
    stepUpdate(G, M, step, dt);
  },
};

// The step lists live outside MISSIONS so the table stays readable; each entry
// is built by buildSteps with the live city locations.
function buildSteps(G, def) {
  const L = G.city.locations;
  switch (def.id) {
    case 'first-wheels': return [
      { type: 'steal', text: 'Steal the marked coupe in Centro Coral', x: 2840, y: 2058 },
      { type: 'deliver', text: 'Deliver the coupe to Taller Brisa', x: L.workshop.bay.x + 70, y: L.workshop.bay.y + 60 },
    ];
    case 'hot-package': return [
      { type: 'goto', text: 'Pick up the package at the end of the pier', x: 3200, y: 4620, r: 44 },
      { type: 'drop', text: 'Get the package to Vera at Hotel Serena', x: L.hotel.doorX, y: L.hotel.doorY + 8, timer: 240 },
    ];
    case 'the-collector': return [
      { type: 'kill', text: "Deal with Serra's collectors in the yard", x: L.workshop.doorX, y: L.workshop.doorY + 60 },
      { type: 'escort', text: 'Drive Héctor to his cousin in Barrio Brisa', npc: 'Héctor Ruiz', x: 790, y: 1030 },
    ];
    case 'harbor-lights': return [
      {
        type: 'checkpoints', text: 'Show the harbour lights', perTime: 26, startTime: 70,
        points: [
          { x: 3200, y: 4620 }, { x: 3560, y: 4620 }, { x: 4330, y: 4470 },
          { x: 500, y: 4352 }, { x: L.hotel.doorX, y: L.hotel.doorY + 8 },
        ],
      },
      { type: 'escape', text: 'Lose the Policía' },
    ];
    case 'serras-last-night': return [
      { type: 'goto', text: 'Go to the Faro de Marisol', x: 4330, y: 4470, r: 60 },
      { type: 'kill', text: 'End Bruno Serra and his guard', x: 4400, y: 4420 },
      { type: 'escape', text: 'Lose the Policía' },
      { type: 'drop', text: 'Meet Lulu at the Quiosco', x: L.luluKiosk.x, y: L.luluKiosk.y, r: 50 },
    ];
    default: return [];
  }
}

function setupStep(G, M) {
  const def = M.def;
  if (!def.steps) def.steps = buildSteps(G, def);
  const step = def.steps[M.stepI];
  if (!step) return;
  M.timer = step.timer ?? (step.type === 'checkpoints' ? step.startTime : null);
  G.objectiveText = step.text;
  // per-step spawns
  if (step.type === 'steal' && !M.data.markedCar) {
    const car = makeCar('coupe', step.x, step.y, 0, { driver: 'parked', color: '#b02020' });
    car.missionTag = 'mark';
    M.data.markedCar = car;
    G.cars.push(car);
  }
  if (step.type === 'kill' && def.id === 'the-collector' && !M.data.spawned) {
    M.data.spawned = true;
    const L = G.city.locations;
    M.targets = [
      spawnGunman(G, L.workshop.doorX - 60, L.workshop.doorY + 90, 'Collector'),
      spawnGunman(G, L.workshop.doorX + 90, L.workshop.doorY + 130, 'Collector'),
      spawnGunman(G, L.workshop.doorX - 10, L.workshop.doorY + 190, 'Collector'),
    ];
    wireTargets(G, M);
  }
  if (step.type === 'kill' && def.id === 'serras-last-night' && !M.data.spawned) {
    M.data.spawned = true;
    const bruno = spawnGunman(G, 4362, 4462, 'Bruno Serra', 130);
    bruno.shirt = '#5c1a1a';
    M.targets = [
      bruno,
      spawnGunman(G, 4310, 4400, 'Serra guard'), spawnGunman(G, 4460, 4480, 'Serra guard'),
      spawnGunman(G, 4290, 4500, 'Serra guard'), spawnGunman(G, 4490, 4360, 'Serra guard'),
    ];
    wireTargets(G, M);
    G.banner('Bruno Serra', 'He brought friends. So did you: a full magazine.');
  }
  if (step.type === 'checkpoints') {
    M.data.cpI = 0;
  }
  updateMarker(G, M, step);
}

function wireTargets(G, M) {
  M.onTargetDown = (ped) => {
    M.targets = M.targets.filter((t) => t !== ped);
    if (M.targets.length === 0) advanceStep(G, M);
  };
}

export function spawnGunman(G, x, y, name, health = 60) {
  const ped = makePed(x, y, { role: 'gunman', name, health, shirt: '#33302e' });
  ped.missionTag = 'target';
  G.peds.push(ped);
  return ped;
}

function updateMarker(G, M, step) {
  if (!step) { G.marker = null; return; }
  if (step.type === 'checkpoints') {
    const pt = step.points[M.data.cpI ?? 0];
    G.marker = pt ? { x: pt.x, y: pt.y, color: '#ffd76a' } : null;
  } else if (step.type === 'escape') {
    G.marker = null;
  } else if (step.type === 'steal') {
    const car = M.data.markedCar;
    G.marker = car ? { x: car.x, y: car.y, color: '#ffd76a' } : null;
  } else {
    G.marker = { x: step.x, y: step.y, color: '#ffd76a' };
  }
}

function advanceStep(G, M) {
  M.stepI++;
  M.onTargetDown = null;
  const step = M.def.steps[M.stepI];
  if (!step) { missions.complete(G); return; }
  G.audio.blip();
  setupStep(G, M);
}

function stepUpdate(G, M, step, dt) {
  const p = G.player;
  updateMarker(G, M, step);
  switch (step.type) {
    case 'goto': case 'drop': case 'pickup': {
      if (dist(p.x, p.y, step.x, step.y) < (step.r ?? 40)) {
        if (M.def.id === 'hot-package' && step.type === 'goto') {
          G.sys.wanted.addHeat(210);
          G.banner('Package taken', 'Every camera in Puerto Azul just woke up. Drive!');
          G.audio.sting(false);
        }
        advanceStep(G, M);
      }
      break;
    }
    case 'steal': {
      const car = M.data.markedCar;
      if (!car || car.wrecked) { missions.fail(G, 'The coupe is wrecked'); return; }
      if (p.car === car) advanceStep(G, M);
      break;
    }
    case 'deliver': {
      const car = M.data.markedCar;
      if (!car || car.wrecked) { missions.fail(G, 'The coupe is wrecked'); return; }
      if (p.car === car && dist(car.x, car.y, step.x, step.y) < 74) {
        // hand the car over: it stays at the taller as a parked trophy
        G.sys.player.exitCar(true);
        car.driver = 'parked';
        advanceStep(G, M);
      }
      break;
    }
    case 'kill': {
      // spawning is lazy for Serra (his step starts as a goto); targets wire themselves
      if (M.targets.length === 0 && M.data.spawned) advanceStep(G, M);
      break;
    }
    case 'escort': {
      const npc = G.peds.find((q) => q.role === 'npc' && q.name === step.npc);
      if (!npc) { advanceStep(G, M); break; }
      if (!M.data.aboard) {
        G.marker = { x: npc.x, y: npc.y, color: '#7fe0a8' };
        if (p.car && dist(p.x, p.y, npc.x, npc.y) < 90 && Math.abs(p.car.speed) < 12) {
          M.data.aboard = true;
          npc.state = 'passenger';
          npc.hidden = true;
          G.banner(step.npc + ' is in', 'Keep the car in one piece.');
        }
      } else {
        npc.x = p.x; npc.y = p.y;
        if (!p.car) { M.data.aboard = false; npc.state = 'walk'; npc.hidden = false; npc.x = p.x + 20; npc.y = p.y + 8; }
        else {
          G.marker = { x: step.x, y: step.y, color: '#ffd76a' };
          if (dist(p.x, p.y, step.x, step.y) < 56) {
            npc.state = 'walk'; npc.hidden = false; npc.home = { x: step.x, y: step.y }; npc.homeBound = true;
            npc.x = step.x + 14; npc.y = step.y;
            advanceStep(G, M);
          }
        }
      }
      break;
    }
    case 'checkpoints': {
      const pt = step.points[M.data.cpI ?? 0];
      if (!pt) { advanceStep(G, M); break; }
      G.objectiveText = step.text + ' — stop ' + ((M.data.cpI ?? 0) + 1) + ' of ' + step.points.length;
      if (dist(p.x, p.y, pt.x, pt.y) < 62) {
        M.data.cpI++;
        M.timer = Math.min(150, (M.timer ?? 0) + step.perTime);
        G.audio.pickup();
        G.addMoney(60, pt.x, pt.y);
        if (M.data.cpI >= step.points.length) advanceStep(G, M);
      }
      break;
    }
    case 'escape': {
      if (G.stars === 0 && G.heat <= 0) advanceStep(G, M);
      break;
    }
  }
  void dt;
}

function cleanupMissionEntities(G, M) {
  for (const car of G.cars) if (car.missionTag) car.dead = true;
  for (const ped of G.peds) if (ped.missionTag) ped.dead = true;
  if (M.data.markedCar) M.data.markedCar.missionTag = null;
}

export function startDialogue(G, lines, onDone) {
  G.dialogue = { lines, i: 0, onDone: onDone ?? null };
  G.audio.blip();
}
export function advanceDialogue(G) {
  const d = G.dialogue;
  if (!d) return;
  d.i++;
  G.audio.blip();
  if (d.i >= d.lines.length) {
    G.dialogue = null;
    if (d.onDone) d.onDone();
  }
}
