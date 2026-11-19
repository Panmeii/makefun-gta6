// Marisol Heat — a gta6-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: "Marisol Heat", an original
// top-down open-world crime game in vanilla JavaScript + Canvas 2D (no
// libraries, no network requests, fully offline). Dario Venn works his way up
// Marisol Bay through five story chapters for fixer Lulu Ferrer — stealing
// cars, running packages, escorting friends and ending Bruno Serra — under a
// six-star wanted system with traffic, pedestrians, a weapon shop, a repaint
// garage, fifty collectible tokens, side jobs, a day–night cycle and rain.
//
// This program validates the entry against the scorer's caps BEFORE copying
// anything (so a bad entry fails here, with a readable reason, instead of at
// the gate), then copies game/ and screenshots/ to the output directory and
// writes dossier.json with the vendored make.fun library — byte-for-byte the
// summary the judge reads.
//
// Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it: serve the game/ folder with any static file server and open
//          index.html in a desktop browser.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- caps (the scorer's own, reference/gate.json) ---------------------------
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const INDEX_HTML_MAX_BYTES = 1024 * 1024;

// --- pre-flight validation (authored for this entry) -------------------------
function fail(reason) {
  throw new Error('marisol-heat: pre-flight validation failed — ' + reason);
}

// Walk a directory tree with lstat so symlinks are seen, not followed.
// Returns the list of file paths relative to root. Refuses dotfiles, dot
// directories and symlinks anywhere in the tree.
function walkFiles(root, label) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) fail(label + ': dotfile or dot-directory is not allowed: ' + name);
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) fail(label + ': symlink is not allowed: ' + relative(root, full));
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile()) files.push(full);
      else fail(label + ': special file is not allowed: ' + relative(root, full));
    }
  }
  return files.sort();
}

function validate() {
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(gameDir)) fail('game/ directory is missing');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const indexBytes = lstatSync(join(gameDir, 'index.html')).size;
  if (indexBytes > INDEX_HTML_MAX_BYTES) {
    fail('game/index.html is ' + indexBytes + ' bytes, over the 1 MiB cap');
  }
  const gameFiles = walkFiles(gameDir, 'game/');
  if (gameFiles.length > CAPS.game_max_files) {
    fail('game/ holds ' + gameFiles.length + ' files, over the ' + CAPS.game_max_files + ' cap');
  }
  let gameBytes = 0;
  for (const full of gameFiles) {
    const rel = relative(gameDir, full);
    if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) {
      fail('game/ path over the ' + CAPS.game_path_max_bytes + '-byte cap: ' + rel);
    }
    gameBytes += lstatSync(full).size;
  }
  if (gameBytes > CAPS.game_max_bytes) {
    fail('game/ totals ' + gameBytes + ' bytes, over the ' + CAPS.game_max_bytes + ' cap');
  }
  if (!existsSync(shotsDir)) fail('screenshots/ directory is missing');
  const shots = walkFiles(shotsDir, 'screenshots/');
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    fail('screenshots/ must hold 3 or 4 images, found ' + shots.length);
  }
  for (const full of shots) {
    const size = lstatSync(full).size;
    if (size > CAPS.screenshots.max_bytes) {
      fail('screenshot over the 256 KiB cap (' + size + ' bytes): ' + relative(shotsDir, full));
    }
    if (!/\.(png|jpe?g)$/i.test(full)) {
      fail('screenshot is not a PNG or JPEG: ' + relative(shotsDir, full));
    }
  }
  return { gameFiles: gameFiles.length, gameBytes, screenshots: shots.length };
}

const summary = validate();

// --- hand the entry in (the starter's plumbing) ------------------------------
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

console.log(
  'marisol-heat: handed in ' + summary.gameFiles + ' game files (' + summary.gameBytes + ' bytes) and ' +
  summary.screenshots + ' screenshots to ' + out,
);
