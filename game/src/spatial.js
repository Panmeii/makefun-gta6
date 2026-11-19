// spatial.js — a uniform spatial hash over the dynamic entities (cars, pedestrians,
// gunmen). Rebuilt every frame from scratch: with a few hundred movers that is cheaper
// than incremental bookkeeping and keeps every proximity query (traffic braking,
// witness checks, police awareness, bullet hits) near-constant time.

import { dist2 } from './util.js';

const CELL = 160;

export class SpatialHash {
  constructor() { this.cells = new Map(); }
  clear() { this.cells.clear(); }
  insert(e) {
    const k = ((e.x / CELL) | 0) + ':' + ((e.y / CELL) | 0);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(e);
  }
  rebuild(entities) {
    this.clear();
    for (const e of entities) if (!e.dead) this.insert(e);
  }
  // Visit every entity within radius r of (x, y); fn may return true to stop early.
  query(x, y, r, fn) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    const r2 = r * r;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = this.cells.get(cx + ':' + cy);
      if (!arr) continue;
      for (const e of arr) {
        if (e.dead) continue;
        if (dist2(x, y, e.x, e.y) <= r2 && fn(e)) return e;
      }
    }
    return null;
  }
  nearest(x, y, r, filter) {
    let best = null, bd = r * r;
    this.query(x, y, r, (e) => {
      if (filter && !filter(e)) return false;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
      return false;
    });
    return best;
  }
}
