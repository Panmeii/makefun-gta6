# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Panmeii/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Panmeii/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Marisol Heat** — an original top-down open-world crime game in vanilla JavaScript and Canvas 2D. No libraries, no build step, no network requests: just `game/index.html` and its ES modules.

Welcome to **Marisol Bay**: a 7×7 street grid city with a beach, promenade, docks, marina and lighthouse across five named districts — Barrio Brisa, Altos del Faro, Centro Coral, Playa Serena and Puerto Azul. You are **Dario Venn**, a driver with a past, working for fixer **Lulu Ferrer** through five story chapters (steal the coupe, run the hot package, face Serra's collectors, tour the harbour lights, and end Bruno Serra's last night), with a Respect multiplier that grows with every chapter.

In the world: steal and drive 10 car models (yank the driver out, or take a parked one), with traffic AI that keeps right-hand lanes, turns at intersections, brakes for the car ahead and obeys **working traffic lights**; pedestrians who stroll, panic and flee; a **six-star wanted system** where heat only rises when a crime is witnessed and cools when nobody sees you — patrols, roadblocks at 3★, SWAT vans at 4★, armed agents at 5★ and an armoured carrier at 6★, with a bust meter that ends in a fine and a cell-door respawn, or a hospital bill if you get wasted. Buy the full-auto Ráfaga SMG, armour and ammo at **Armería Ola**; clear your heat with a $300 repaint at **Taller Brisa**. Side work between chapters: a taxi job, a checkpoint rush and a wrecking frenzy from three phone booths, plus **50 hidden Serra tokens** tracked on the HUD. Full HUD with minimap (police blips, markers, shop and phone pins), a day–night cycle with lit windows, streetlight pools and headlight cones, occasional rain, synthesized WebAudio engine/siren/gunshot sounds and a generated music loop, and localStorage saves — all at a steady 60 fps via a spatial hash, a particle pool and pre-rendered city chunks.

**Controls:** WASD walk & drive · mouse aim, click to shoot · E interact / enter car · Shift sprint · Space handbrake · Q swap weapon · P/Esc pause · M mute.

## Run it

```sh
# hand the entry in (copies game/ + screenshots/ and writes dossier.json):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

# then play it — serve the game folder and open it in a desktop browser:
python3 -m http.server -d game 8080
# → http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8nt1dqan&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
