// input.js — keyboard and mouse state for Marisol Heat: held keys, keys pressed this
// frame, mouse position in canvas pixels and click edges. No DOM UI: every menu in
// the game is drawn on the canvas and driven from this state.

export const input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false, rdown: false },
};

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyP', 'KeyM', 'KeyQ',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'Enter', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Tab',
]);

export function initInput(canvas) {
  addEventListener('keydown', (ev) => {
    if (GAME_KEYS.has(ev.code)) ev.preventDefault();
    if (!ev.repeat) input.pressed.add(ev.code);
    input.keys.add(ev.code);
  });
  addEventListener('keyup', (ev) => input.keys.delete(ev.code));
  addEventListener('blur', () => { input.keys.clear(); input.mouse.down = false; });
  canvas.addEventListener('mousemove', (ev) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = (ev.clientX - r.left) * (canvas.width / r.width);
    input.mouse.y = (ev.clientY - r.top) * (canvas.height / r.height);
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) { input.mouse.down = true; input.mouse.clicked = true; }
    if (ev.button === 2) input.mouse.rdown = true;
  });
  addEventListener('mouseup', (ev) => {
    if (ev.button === 0) input.mouse.down = false;
    if (ev.button === 2) input.mouse.rdown = false;
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

export function endFrameInput() {
  input.pressed.clear();
  input.mouse.clicked = false;
}

export function keyDown(...codes) { return codes.some((c) => input.keys.has(c)); }
export function keyPressed(...codes) { return codes.some((c) => input.pressed.has(c)); }
