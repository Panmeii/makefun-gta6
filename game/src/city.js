// city.js — Marisol Bay itself: a 7x7 street grid between eight avenues each way,
// five named districts, a beach and promenade along the south shore, docks and a
// marina reaching into the water, and a lighthouse on the south-east point.
// The whole static city is painted once into 560px chunk canvases (buildings,
// road markings, palms, painted district names), so a frame only blits the
// chunks in view. Buildings double as the collision set for every mover.

import { mulberry32, clamp, pushOutOfRect } from './util.js';

export const WORLD_W = 4560;
export const WORLD_H = 4720;
export const ROAD_PITCH = 560;
export const ROAD_W = 144;
export const ROAD_HALF = ROAD_W / 2;
export const RC = []; // road centre lines, both axes
for (let i = 0; i < 8; i++) RC.push(320 + i * ROAD_PITCH);
export const WATER_Y = 4496;          // south of this line is sea (except the piers)
export const BEACH_Y = 4380;          // sand starts here
export const PROMENADE_Y = 4312;      // boardwalk band along the shore

export const DISTRICTS = ['Barrio Brisa', 'Altos del Faro', 'Centro Coral', 'Playa Serena', 'Puerto Azul'];

const PALETTES = {
  'Barrio Brisa': { roofs: ['#e8b4a0', '#f2d5a0', '#cfe0b0', '#a8c8d8', '#f0c8c0'], ground: '#79a657', floors: [1, 2] },
  'Altos del Faro': { roofs: ['#dfe6ee', '#cfd8e6', '#e8e2d4', '#bcc8d8'], ground: '#a9adb0', floors: [6, 10] },
  'Centro Coral': { roofs: ['#b8c4cc', '#9fb2c0', '#d8cfc0', '#c0b0a0', '#a8b8a0'], ground: '#9aa0a3', floors: [5, 9] },
  'Playa Serena': { roofs: ['#f6e3c0', '#f2cfa8', '#ffffff', '#ffd9a8'], ground: '#b3a98e', floors: [3, 6] },
  'Puerto Azul': { roofs: ['#a89a88', '#8f9aa4', '#b0a090', '#7f8b94'], ground: '#93989c', floors: [1, 2] },
};

// Which district a block belongs to, by block column/row (0..6).
export function districtOfBlock(bc, br) {
  if (br <= 1 && bc <= 2) return 'Barrio Brisa';
  if (br <= 1 && bc >= 3) return 'Altos del Faro';
  if (br >= 4 && bc <= 2) return 'Playa Serena';
  if (br >= 4 && bc >= 4) return 'Puerto Azul';
  return 'Centro Coral';
}
export function districtAt(x, y) {
  if (y >= PROMENADE_Y) return x < 2280 ? 'Playa Serena' : 'Puerto Azul';
  const bc = clamp(Math.floor((x - 248) / ROAD_PITCH), 0, 6);
  const br = clamp(Math.floor((y - 248) / ROAD_PITCH), 0, 6);
  return districtOfBlock(bc, br);
}
// Interior (buildable) rect of block (bc, br): the land between four roads.
export function blockRect(bc, br) {
  return { x: RC[bc] + ROAD_HALF, y: RC[br] + ROAD_HALF, w: ROAD_PITCH - ROAD_W, h: ROAD_PITCH - ROAD_W };
}

export function isOnRoad(x, y) {
  for (const c of RC) if (Math.abs(x - c) <= ROAD_HALF || Math.abs(y - c) <= ROAD_HALF) return true;
  return false;
}

export function buildCity() {
  const rng = mulberry32(20261119);
  const buildings = [];
  const props = [];        // {x, y, type: 'palm'|'bench'|'fountain'|'container'|'crate'|'lamp'}
  const parkedSpots = [];  // {x, y, angle}
  const piers = [
    { x: 3177, y: 4420, w: 46, h: 250 },
    { x: 3537, y: 4420, w: 46, h: 250 },
  ];
  const locations = {};

  function addBuilding(x, y, w, h, district, kind = 'normal', label = null) {
    const pal = PALETTES[district];
    const floors = kind === 'house' ? 1 + (rng() * 2 | 0)
      : Math.round(pal.floors[0] + rng() * (pal.floors[1] - pal.floors[0]));
    const b = { x, y, w, h, floors, kind, label, roof: pal.roofs[(rng() * pal.roofs.length) | 0], district };
    buildings.push(b);
    return b;
  }
  function parking(x, y, w, h, angle) {
    const n = Math.max(1, Math.floor((angle === 0 ? w : h) / 34));
    for (let i = 0; i < n; i++) {
      if (rng() < 0.35) continue; // some stalls stay empty
      parkedSpots.push(angle === 0 ? { x: x + 18 + i * 34, y: y + h / 2, angle: 0 } : { x: x + w / 2, y: y + 18 + i * 34, angle: Math.PI / 2 });
    }
  }

  // --- blocks -------------------------------------------------------------
  const SPECIAL = { '3,2': 'gunshop', '3,3': 'police', '2,4': 'hospital', '1,5': 'hotel', '5,5': 'workshop' };
  for (let br = 0; br < 7; br++) for (let bc = 0; bc < 7; bc++) {
    const R = blockRect(bc, br);
    const district = districtOfBlock(bc, br);
    const key = bc + ',' + br;
    if (SPECIAL[key]) { buildSpecial(R, district, SPECIAL[key]); continue; }
    const roll = rng();
    if (district === 'Puerto Azul') {
      // warehouses, container stacks and a yard
      addBuilding(R.x + 16, R.y + 16, 250, 150, district, 'warehouse');
      addBuilding(R.x + 16, R.y + 216, 250, 150, district, 'warehouse');
      for (let i = 0; i < 5; i++) props.push({ x: R.x + 300 + (i % 2) * 46, y: R.y + 30 + Math.floor(i / 2) * 56, type: 'container', hue: (rng() * 5) | 0 });
      parking(R.x + 286, R.y + 300, 110, 90, Math.PI / 2);
    } else if (district === 'Barrio Brisa') {
      // four pastel houses with little gardens
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        addBuilding(R.x + 24 + i * 200, R.y + 24 + j * 200, 150, 130, district, 'house');
        props.push({ x: R.x + 190 + i * 200, y: R.y + 90 + j * 200, type: 'palm' });
      }
    } else if (roll < 0.16) {
      // plaza: fountain, palms, benches, no buildings
      props.push({ x: R.x + R.w / 2, y: R.y + R.h / 2, type: 'fountain' });
      for (let i = 0; i < 6; i++) props.push({ x: R.x + 40 + rng() * (R.w - 80), y: R.y + 40 + rng() * (R.h - 80), type: rng() < 0.6 ? 'palm' : 'bench' });
    } else if (roll < 0.34) {
      // one tower and a car park
      addBuilding(R.x + 26, R.y + 26, 210, 210, district);
      parking(R.x + 262, R.y + 26, 128, 364, Math.PI / 2);
      props.push({ x: R.x + 130, y: R.y + 330, type: 'palm' });
    } else if (roll < 0.62) {
      // 2x2 mid-rise blocks
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        addBuilding(R.x + 18 + i * 202, R.y + 18 + j * 202, 176, 176, district);
      }
    } else {
      // a row of three plus a parking strip
      for (let i = 0; i < 3; i++) addBuilding(R.x + 16 + i * 134, R.y + 18, 118, 240, district);
      parking(R.x + 16, R.y + 292, 384, 96, 0);
    }
    // sidewalk palms here and there
    if (rng() < 0.5) props.push({ x: R.x + 12, y: R.y + 12, type: 'palm' });
  }

  function buildSpecial(R, district, what) {
    if (what === 'gunshop') {
      const b = addBuilding(R.x + 60, R.y + 60, 290, 240, district, 'shop', 'ARMERÍA OLA');
      locations.gunShop = { x: b.x + b.w / 2, y: b.y + b.h + 26, doorX: b.x + b.w / 2, doorY: b.y + b.h, name: 'Armería Ola' };
      parking(R.x + 40, R.y + 330, 330, 70, 0);
    } else if (what === 'police') {
      const b = addBuilding(R.x + 46, R.y + 40, 320, 200, district, 'police', 'COMISARÍA');
      locations.policeStation = { x: b.x + b.w / 2, y: b.y + b.h + 60, doorX: b.x + b.w / 2, doorY: b.y + b.h, name: 'Comisaría Central' };
      parking(R.x + 46, R.y + 300, 320, 90, 0);
    } else if (what === 'hospital') {
      const b = addBuilding(R.x + 56, R.y + 46, 300, 220, district, 'hospital', 'HOSPITAL SAN CORAL');
      locations.hospital = { x: b.x + b.w / 2, y: b.y + b.h + 56, doorX: b.x + b.w / 2, doorY: b.y + b.h, name: 'Hospital San Coral' };
      parking(R.x + 56, R.y + 320, 300, 76, 0);
    } else if (what === 'hotel') {
      const b = addBuilding(R.x + 66, R.y + 36, 280, 260, district, 'hotel', 'HOTEL SERENA');
      locations.hotel = { x: b.x + b.w / 2, y: b.y + b.h + 52, doorX: b.x + b.w / 2, doorY: b.y + b.h, name: 'Hotel Serena' };
      for (let i = 0; i < 4; i++) props.push({ x: R.x + 30 + i * 100, y: R.y + 360, type: 'palm' });
    } else if (what === 'workshop') {
      const b = addBuilding(R.x + 40, R.y + 30, 250, 170, district, 'workshop', 'TALLER BRISA');
      // open drive-in bay in front of the workshop: drive in to repaint
      locations.workshop = { x: b.x + b.w / 2, y: b.y + b.h + 90, doorX: b.x + b.w / 2, doorY: b.y + b.h, name: 'Taller Brisa', bay: { x: b.x + 55, y: b.y + b.h + 18, w: 140, h: 120 } };
      for (let i = 0; i < 4; i++) props.push({ x: R.x + 320, y: R.y + 40 + i * 60, type: 'crate' });
      parking(R.x + 40, R.y + 320, 300, 76, 0);
    }
  }

  // --- shore: promenade, beach, docks, lighthouse ---------------------------
  for (let x = 120; x < WORLD_W - 100; x += 150) props.push({ x, y: PROMENADE_Y + 26, type: 'palm' });
  for (let x = 260; x < WORLD_W - 100; x += 300) props.push({ x, y: PROMENADE_Y + 52, type: 'bench' });
  locations.luluKiosk = { x: 1500, y: 4348, name: "Lulu's Quiosco" };
  locations.lighthouse = { x: 4400, y: 4420, name: 'Faro de Marisol' };
  locations.marina = { x: 3300, y: 4560, name: 'Marina Azul' };
  locations.phoneTaxi = { x: 2108, y: 1512, name: 'Taxi dispatch' };
  locations.phoneRush = { x: 700, y: 4348, name: 'Checkpoint rush' };
  locations.phoneFrenzy = { x: 3300, y: 2872, name: 'Frenzy phone' };
  buildings.push({ x: 4370, y: 4390, w: 60, h: 60, floors: 6, kind: 'lighthouse', label: null, roof: '#e8e4da', district: 'Puerto Azul' });

  // streetlights: along every road, alternating sides
  const streetlights = [];
  for (let i = 0; i < 8; i++) {
    for (let y = 150; y < 4300; y += 280) streetlights.push({ x: RC[i] + ((((y / 280) | 0) + i) % 2 ? 88 : -88), y });
    for (let x = 150; x < 4400; x += 280) streetlights.push({ x, y: RC[i] + ((((x / 280) | 0) + i) % 2 ? 88 : -88) });
  }

  const city = {
    buildings, props, parkedSpots, piers, locations, streetlights,
    chunks: [], chunkSize: 560, chunkMargin: 30,
    isWater(x, y) {
      if (y <= WATER_Y) return false;
      for (const p of piers) if (x >= p.x - 4 && x <= p.x + p.w + 4 && y >= p.y && y <= p.y + p.h) return false;
      return true;
    },
    collideEntity(e) {
      // buildings
      for (const b of buildings) {
        if (e.x + e.r < b.x - 2 || e.x - e.r > b.x + b.w + 2 || e.y + e.r < b.y - 2 || e.y - e.r > b.y + b.h + 2) continue;
        if (pushOutOfRect(e, b)) return b;
      }
      // world bounds and the sea: step back to the last dry position
      if (e.x < e.r) e.x = e.r;
      if (e.x > WORLD_W - e.r) e.x = WORLD_W - e.r;
      if (e.y < e.r) e.y = e.r;
      if (e.y > WORLD_H - e.r) e.y = WORLD_H - e.r;
      if (city.isWater(e.x, e.y)) {
        if (e.px !== undefined && !city.isWater(e.px, e.y)) e.x = e.px;
        else if (e.py !== undefined && !city.isWater(e.x, e.py)) e.y = e.py;
        else e.y = WATER_Y;
        if (e.speed) e.speed *= 0.4;
      }
      return null;
    },
  };
  city.chunks = renderChunks(city, rng);
  return city;
}

// --- static painting ---------------------------------------------------------
function renderChunks(city, rng) {
  const S = city.chunkSize, M = city.chunkMargin;
  const cols = Math.ceil(WORLD_W / S), rows = Math.ceil(WORLD_H / S);
  const chunks = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const c = document.createElement('canvas');
    c.width = c.height = S + M * 2;
    const g = c.getContext('2d');
    g.translate(-(cx * S - M), -(cy * S - M));
    paintGround(g, city, rng, cx * S - M, cy * S - M, S + M * 2, S + M * 2);
    chunks.push({ canvas: c, x: cx * S, y: cy * S });
  }
  return chunks;
}

function paintGround(g, city, rng, vx, vy, vw, vh) {
  // base land
  g.fillStyle = '#8f9484';
  g.fillRect(vx, vy, vw, vh);
  // block grounds
  for (let br = 0; br < 7; br++) for (let bc = 0; bc < 7; bc++) {
    const R = blockRect(bc, br);
    if (R.x > vx + vw || R.y > vy + vh || R.x + R.w < vx || R.y + R.h < vy) continue;
    g.fillStyle = PALETTES[districtOfBlock(bc, br)].ground;
    g.fillRect(R.x - 14, R.y - 14, R.w + 28, R.h + 28);
  }
  // shore: promenade boards, sand, sea
  g.fillStyle = '#c8a878';
  g.fillRect(vx, PROMENADE_Y, vw, BEACH_Y - PROMENADE_Y);
  g.strokeStyle = 'rgba(120,90,50,0.35)'; g.lineWidth = 2;
  for (let y = PROMENADE_Y + 8; y < BEACH_Y; y += 12) { g.beginPath(); g.moveTo(vx, y); g.lineTo(vx + vw, y); g.stroke(); }
  g.fillStyle = '#ecd29a';
  g.fillRect(vx, BEACH_Y, vw, WATER_Y - BEACH_Y + 30);
  g.fillStyle = 'rgba(190,160,100,0.5)';
  for (let i = 0; i < 26; i++) g.fillRect(vx + rng() * vw, BEACH_Y + rng() * 100, 3, 2);
  const sea = g.createLinearGradient(0, WATER_Y, 0, WORLD_H);
  sea.addColorStop(0, '#3d8bc2'); sea.addColorStop(1, '#1d5f8a');
  g.fillStyle = sea;
  g.fillRect(vx, WATER_Y, vw, WORLD_H - WATER_Y + 40);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 12; i++) {
    const y = WATER_Y + 14 + rng() * (WORLD_H - WATER_Y - 20);
    g.beginPath(); g.moveTo(vx + rng() * vw, y); g.lineTo(vx + rng() * vw + 60, y); g.stroke();
  }
  // piers: wooden planks into the sea, with moored boats alongside
  for (const p of city.piers) {
    g.fillStyle = '#9a7c50';
    g.fillRect(p.x, p.y, p.w, p.h);
    g.strokeStyle = 'rgba(70,50,25,0.5)';
    for (let y = p.y + 10; y < p.y + p.h; y += 14) { g.beginPath(); g.moveTo(p.x, y); g.lineTo(p.x + p.w, y); g.stroke(); }
    g.fillStyle = '#6e5732';
    g.fillRect(p.x - 4, p.y, 5, p.h); g.fillRect(p.x + p.w - 1, p.y, 5, p.h);
  }
  drawBoat(g, 3090, 4560, '#e8e4da'); drawBoat(g, 3660, 4600, '#c8553d'); drawBoat(g, 3420, 4680, '#3d8bc2');
  // roads: sidewalk apron, asphalt, markings
  for (const c of RC) {
    g.fillStyle = '#b9bcbe';
    g.fillRect(c - ROAD_HALF - 18, vy, ROAD_W + 36, vh);
    g.fillRect(vx, c - ROAD_HALF - 18, vw, ROAD_W + 36);
  }
  for (const c of RC) {
    g.fillStyle = '#3c4147';
    g.fillRect(c - ROAD_HALF, vy, ROAD_W, vh);
    g.fillRect(vx, c - ROAD_HALF, vw, ROAD_W);
  }
  g.strokeStyle = '#e8e4da'; g.lineWidth = 3; g.setLineDash([26, 30]);
  for (const c of RC) {
    g.beginPath(); g.moveTo(c, vy); g.lineTo(c, vy + vh); g.stroke();
    g.beginPath(); g.moveTo(vx, c); g.lineTo(vx + vw, c); g.stroke();
  }
  g.setLineDash([]);
  // crosswalks at intersections
  g.fillStyle = 'rgba(232,228,218,0.75)';
  for (const ix of RC) for (const iy of RC) {
    if (ix > vx + vw || iy > vy + vh || ix < vx - 200 || iy < vy - 200) continue;
    for (let i = -3; i <= 3; i++) {
      g.fillRect(ix + i * 18 - 6, iy - ROAD_HALF - 14, 12, 12);
      g.fillRect(ix + i * 18 - 6, iy + ROAD_HALF + 2, 12, 12);
      g.fillRect(ix - ROAD_HALF - 14, iy + i * 18 - 6, 12, 12);
      g.fillRect(ix + ROAD_HALF + 2, iy + i * 18 - 6, 12, 12);
    }
  }
  // painted district names on the asphalt, one per district heart
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.font = '700 44px system-ui, sans-serif';
  g.textAlign = 'center';
  const signs = [
    ['BARRIO BRISA', 1150, 880], ['ALTOS DEL FARO', 3120, 880], ['CENTRO CORAL', 2280, 2280],
    ['PLAYA SERENA', 1150, 3680], ['PUERTO AZUL', 3400, 3680], ['MARISOL BAY', 2280, 4240],
  ];
  for (const [text, x, y] of signs) {
    if (x < vx - 300 || x > vx + vw + 300 || y < vy - 100 || y > vy + vh + 100) continue;
    g.fillText(text, x, y);
  }
  // props that sit on the ground plane
  for (const p of city.props) {
    if (p.x < vx - 60 || p.x > vx + vw + 60 || p.y < vy - 60 || p.y > vy + vh + 60) continue;
    if (p.type === 'fountain') {
      g.fillStyle = '#7fb6c9'; g.beginPath(); g.arc(p.x, p.y, 34, 0, 7); g.fill();
      g.fillStyle = '#a8d4e4'; g.beginPath(); g.arc(p.x, p.y, 22, 0, 7); g.fill();
      g.fillStyle = '#dfe6ee'; g.beginPath(); g.arc(p.x, p.y, 7, 0, 7); g.fill();
    } else if (p.type === 'container') {
      g.fillStyle = ['#c8553d', '#3d8bc2', '#4a9e52', '#d8a03c', '#7a6a9e'][p.hue ?? 0];
      g.fillRect(p.x, p.y, 40, 20);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.strokeRect(p.x, p.y, 40, 20);
    } else if (p.type === 'crate') {
      g.fillStyle = '#a8845c'; g.fillRect(p.x, p.y, 22, 22);
      g.strokeStyle = 'rgba(70,50,25,0.6)'; g.strokeRect(p.x, p.y, 22, 22);
    } else if (p.type === 'bench') {
      g.fillStyle = '#7a5c38'; g.fillRect(p.x - 12, p.y - 4, 24, 8);
    }
  }
  // buildings: shadow, roof, details, label signs
  for (const b of city.buildings) {
    if (b.x + b.w < vx - 60 || b.x > vx + vw + 60 || b.y + b.h < vy - 60 || b.y > vy + vh + 60) continue;
    if (b.kind === 'lighthouse') { drawLighthouse(g, b); continue; }
    const sh = 4 + b.floors * 2.2;
    g.fillStyle = 'rgba(20,20,30,0.30)';
    g.fillRect(b.x + sh, b.y + sh, b.w, b.h);
    g.fillStyle = b.roof;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = 'rgba(30,30,40,0.45)'; g.lineWidth = 2;
    g.strokeRect(b.x, b.y, b.w, b.h);
    // day window grid (faint) — the night pass lights a subset of these cells
    g.fillStyle = 'rgba(40,50,70,0.28)';
    const cols = Math.max(1, (b.w / 26) | 0), rows = Math.max(1, (b.h / 26) | 0);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 9, 6);
    // rooftop clutter
    g.fillStyle = 'rgba(60,60,70,0.35)';
    const n = Math.max(1, ((b.w * b.h) / 26000) | 0);
    for (let i = 0; i < n; i++) {
      const rx = b.x + 14 + ((Math.sin(b.x * 3.1 + i * 47.3) * 0.5 + 0.5) * (b.w - 44));
      const ry = b.y + 14 + ((Math.cos(b.y * 2.3 + i * 31.7) * 0.5 + 0.5) * (b.h - 44));
      g.fillRect(rx, ry, 20, 14);
    }
    if (b.label) {
      g.fillStyle = 'rgba(16,20,34,0.85)';
      const tw = g.measureText(b.label).width;
      g.font = '700 17px system-ui, sans-serif';
      const tw2 = g.measureText(b.label).width + 18;
      g.fillRect(b.x + b.w / 2 - tw2 / 2, b.y + b.h / 2 - 15, tw2, 30);
      g.fillStyle = '#ffd98a';
      g.textAlign = 'center';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6);
      void tw;
    }
  }
  // palms last: canopy over the ground
  for (const p of city.props) {
    if (p.type !== 'palm') continue;
    if (p.x < vx - 60 || p.x > vx + vw + 60 || p.y < vy - 60 || p.y > vy + vh + 60) continue;
    g.strokeStyle = '#8a6a42'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 3, p.y - 3); g.stroke();
    g.strokeStyle = '#3f7d3a'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + p.x;
      g.beginPath(); g.moveTo(p.x, p.y);
      g.quadraticCurveTo(p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 13 - 5, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22 + 3);
      g.stroke();
    }
    g.fillStyle = '#5d8a3c';
    g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill();
  }
}

function drawBoat(g, x, y, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - 34, y); g.lineTo(x + 34, y); g.lineTo(x + 20, y + 14); g.lineTo(x - 20, y + 14);
  g.closePath(); g.fill();
  g.fillStyle = '#e8e4da'; g.fillRect(x - 10, y - 12, 20, 12);
  g.strokeStyle = '#6e5732'; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x, y - 30); g.stroke();
}

function drawLighthouse(g, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  g.fillStyle = '#8f8a80';
  g.beginPath(); g.arc(cx, cy, 44, 0, 7); g.fill();
  g.fillStyle = '#e8e4da';
  g.beginPath(); g.arc(cx, cy, 26, 0, 7); g.fill();
  g.fillStyle = '#c0392b';
  g.beginPath(); g.arc(cx, cy, 26, Math.PI * 0.15, Math.PI * 0.55); g.lineTo(cx, cy); g.closePath(); g.fill();
  g.beginPath(); g.arc(cx, cy, 26, Math.PI * 1.15, Math.PI * 1.55); g.lineTo(cx, cy); g.closePath(); g.fill();
  g.fillStyle = '#2c3440';
  g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill();
  g.fillStyle = '#ffe9a3';
  g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
}

export function drawChunks(ctx, city, view) {
  const S = city.chunkSize, M = city.chunkMargin;
  for (const ch of city.chunks) {
    if (ch.x + S < view.x0 || ch.x > view.x1 || ch.y + S < view.y0 || ch.y > view.y1) continue;
    ctx.drawImage(ch.canvas, ch.x - M, ch.y - M);
  }
}
