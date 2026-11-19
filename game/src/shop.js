// shop.js — the two businesses that keep Dario dangerous: Armería Ola in Centro
// Coral (walk in, buy the Ráfaga SMG, ammunition, armour, a healing bocadillo)
// and Taller Brisa in Puerto Azul, whose repaint bay repairs the car and wipes
// the heat — for $300, no questions, while the doors are closed.

import { dist, pointInRect, fmtMoney } from './util.js';

export const GUN_ITEMS = [
  { id: 'smg', label: 'Ráfaga SMG', price: 1200, desc: 'Full-auto. For serious evenings.' },
  { id: 'pistolAmmo', label: 'Pistol rounds ×60', price: 120, desc: 'Standard 9mm, by the box.' },
  { id: 'smgAmmo', label: 'SMG rounds ×120', price: 220, desc: 'The Ráfaga eats these.' },
  { id: 'armor', label: 'Body armour', price: 500, desc: 'Ceramic plates, Marisol cut.' },
  { id: 'snack', label: 'Bocadillo de jamón', price: 60, desc: 'Restores 50 health. Tastes like home.' },
];

export const REPAINT_COST = 300;

export const shop = {
  nearDoor(G) {
    const L = G.city.locations.gunShop;
    return !G.player.car && dist(G.player.x, G.player.y, L.doorX, L.doorY) < 40;
  },
  open(G) {
    G.shopOpen = 'gun';
    G.shopSel = 0;
    G.audio.blip();
  },
  close(G) {
    G.shopOpen = null;
    G.audio.blip();
    G.saveSoon();
  },
  buy(G, item) {
    const p = G.player;
    const owned = item.id === 'smg' && p.weapons.smg;
    if (owned) { G.audio.fail(); return 'Already yours.'; }
    if (item.id === 'smgAmmo' && !p.weapons.smg) { G.audio.fail(); return 'Buy the Ráfaga first.'; }
    if (G.money < item.price) { G.audio.fail(); return 'Not enough cash.'; }
    G.money -= item.price;
    if (item.id === 'smg') { p.weapons.smg = true; p.weapon = 'smg'; p.ammo.smg += 120; }
    if (item.id === 'pistolAmmo') p.ammo.pistol += 60;
    if (item.id === 'smgAmmo') p.ammo.smg += 120;
    if (item.id === 'armor') p.armor = 100;
    if (item.id === 'snack') p.health = Math.min(100, p.health + 50);
    G.audio.cash();
    return 'Sold.';
  },
  // --- Taller Brisa repaint bay ---------------------------------------------
  inBay(G) {
    const bay = G.city.locations.workshop.bay;
    const car = G.player.car;
    return car && pointInRect(car.x, car.y, bay);
  },
  canRepaint(G) {
    const car = G.player.car;
    return shop.inBay(G) && car && (car.health < car.maxHealth - 1 || G.heat > 0);
  },
  repaint(G) {
    const car = G.player.car;
    if (!car || G.money < REPAINT_COST) { G.audio.fail(); return; }
    G.money -= REPAINT_COST;
    G.repaintT = 1.5;
    G.audio.cash();
  },
  update(G, dt) {
    if (G.repaintT > 0) {
      G.repaintT -= dt;
      if (G.repaintT <= 0) {
        const car = G.player.car;
        if (car) {
          car.health = car.maxHealth;
          car.color = ['#3d8bc2', '#c8553d', '#4a9e52', '#e8e4da', '#20242c'][(Math.random() * 5) | 0];
        }
        G.sys.wanted.clearHeat();
        G.banner('Taller Brisa', 'New paint, new plates, no past. The Policía agrees.');
        G.saveSoon();
      }
    }
    void dt;
  },
  // --- overlay ----------------------------------------------------------------
  draw(ctx, G) {
    if (G.shopOpen !== 'gun') return;
    const W = G.canvas.width, H = G.canvas.height;
    ctx.fillStyle = 'rgba(8,10,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const pw = 520, ph = 356, px = (W - pw) / 2, py = (H - ph) / 2;
    ctx.fillStyle = '#141a2c';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd76a';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText('ARMERÍA OLA', px + 26, py + 44);
    ctx.fillStyle = '#aebadd';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Cash: ' + fmtMoney(G.money) + ' — keys 1–5 or click to buy, E or Esc to leave', px + 26, py + 72);
    GUN_ITEMS.forEach((item, i) => {
      const y = py + 108 + i * 44;
      const owned = item.id === 'smg' && G.player.weapons.smg;
      if (G.shopSel === i) { ctx.fillStyle = 'rgba(255,215,106,0.14)'; ctx.fillRect(px + 14, y - 24, pw - 28, 36); }
      ctx.fillStyle = owned ? '#7fe0a8' : '#f2f0e6';
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.fillText((i + 1) + '. ' + item.label, px + 26, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = owned ? '#7fe0a8' : '#ffd76a';
      ctx.fillText(owned ? 'OWNED' : fmtMoney(item.price), px + pw - 26, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8d97b5';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(item.desc, px + 44, y + 15);
    });
    if (G.shopMsg) {
      ctx.fillStyle = '#ffe9b0';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(G.shopMsg, px + 26, py + ph - 14);
    }
  },
};
