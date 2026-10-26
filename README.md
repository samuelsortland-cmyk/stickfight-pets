# StickFight Pets

AI stickman desktop pets that fight each other right on top of your screen, inspired by Alan Becker's *Animator vs. Animation*.
They wall-jump, air-dash, backflip, throw supers, stand on your windows, and get blown up by your bombs.

## Run it

You need [Node.js](https://nodejs.org) (the LTS version).

- **Windows:** double-click **`Start StickFight.bat`**. The first run installs everything, which takes a minute.
- **Any OS:** open a terminal in this folder and run `npm install` once, then `npm start`.

A transparent overlay covers your main monitor. Clicks pass through to your apps everywhere except on the stickmen and the control panel.

**Try it without installing:** open `src/index.html` in a browser for a demo desktop with fake windows.

## The tool dock

A retro toolbox sits on the right edge of the screen. Hover a button to see its name. The dock acts as a wall for the fighters, so they wall-jump off it. The **»** button at the bottom tucks it away into a small tab.

**Tools** (top half)

| Tool | What it does |
|---|---|
| Hand | Drag a fighter to dangle and throw it, click one to poke it. A poked pet comes after your cursor |
| Pencil | Drag to draw platforms (they last a minute) |
| Eraser | Drag over drawn lines to erase them |
| Bomb | Click to blow everyone nearby into the air |
| Lightning | Click a fighter to smite it |
| Spawn | Click anywhere to drop a new fighter there |

`Esc` or right-click switches back to the hand. While any other tool is active, the overlay takes your clicks.

**Cards** (bottom half)
- **Fighters:** all 12 fighters as portraits. Click an empty slot to add that fighter, and hover a fighter to remove it with ✕. You can pick the fighting style new fighters use, add a random fighter, heal everyone, or clear the screen.
- **Match:** pick FFA, Teams or Peace, then hit **Fight!** There are also Slow-mo and Pause switches.
- **Settings:** fighter size, pixel size (Fine is high resolution, Classic and Chunky are blockier), the break between rounds, cinematic supers, showing detected window platforms, clearing drawings, resetting the AI's memory, updates, hiding the pets, and quitting.

**Armory** (sword button): pick a weapon, item or power fruit, then click a fighter to hand it over, or click anywhere to drop it on the ground. Fighters also walk over and grab what they need on their own. The Armory has Weapons, Items and Powers tabs; **Rain** drops 8 random things from the sky, **Clear** removes items on screen and **Unpower** takes every power away.

| Weapons | What they do |
|---|---|
| Katana | Longer, harder slashes with sweeping trails; also slashes in the air |
| Hammer | Slow overhead smash that cracks the ground and launches people |
| Spear | Longest reach in the game, fast thrusts |
| Blaster | Fires bullets from range |

Weapons wear out (they break with a "BROKE!") and get knocked out of hands by big hits.

| Items | |
|---|---|
| Medkit | Heals 45 |
| Energy | Fills the super meter |
| Grenade | Fighters lob it at enemies; explodes after a short fuse |

**Power fruits** (Blox Fruits / anime inspired). Eat one to gain a destructive power; the AI casts it on cooldown and calls it out. A colored bar under a fighter's health shows when it's ready.

| Power | Move |
|---|---|
| Flame | **Fire Fist**: a giant fireball that explodes and leaves the ground burning |
| Ice | **Ice Age**: a wave of ice spikes that freezes enemies solid (hit them to shatter the ice) |
| Light | **Light Speed**: teleports between up to 3 enemies, kicking each one |
| Quake | **Seaquake**: punches the air so hard the screen cracks |
| Dark | **Black Hole**: drags everyone in, then implodes |
| Rumble | **El Thor**: a storm of lightning bolts on every enemy |
| Gravity | **Meteor**: drops a meteor that leaves a crater |
| Buddha | **Buddha**: grows into a golden giant for 8 seconds |
| Ki Beam | **Kamehameha**: charges up and fires a beam across the whole screen |

Powers leave marks: scorch marks, craters, shattered-glass cracks, ice spikes and burning ground. Explosions also break platforms you've drawn. Outside fights, pets with powers show off now and then (no damage, but the screen still gets wrecked). Powers are saved per fighter.

**Hotkeys** (Ctrl is Cmd on macOS):

| Keys | Action |
|---|---|
| `Ctrl+Alt+Shift+U` | Show / tuck away the dock |
| `Ctrl+Alt+Shift+B` | Fight now |
| `Ctrl+Alt+Shift+N` | Add a fighter |
| `Ctrl+Alt+Shift+H` | Hide / show the pets |
| `Ctrl+Alt+Shift+Q` | Quit |

## The look

Everything is drawn on a pixel grid with hard edges, in the style of Animator vs. Animation pixel fan art. By default the grid is fine (one art pixel per screen pixel) for smooth, high-resolution stickmen; switch **Pixel size** to Classic or Chunky in Settings for a blockier look. Text and health bars always stay chunky so they're readable:
- Stickmen have thick black-outlined limbs and hollow ring heads.
- All text uses a custom 5×7 pixel font (`assets/stickpix.ttf`, built by `tools/build-font.py`).

Each fighter has an element that colors its hit sparks, afterimages, aura and projectiles:

| Element | Fighters |
|---|---|
| Fire | Lime, Black |
| Lightning | Blue, Yellow, Cyan, White |
| Shadow (black spikes with red edges) | Red, Purple, Teal |
| Sparkle (green stars) | Orange, Green, Pink |

## How they fight

**Movement**
- Dash and dash-attack.
- Air dash and double jump with flips.
- Wall cling, wall slide and wall jump.
- Backflip evade with invincibility, and roll.

**Moves**
- Ground: jab, cross, roundhouse, launcher uppercut, low sweep, launching slide kick, spinning heavy, grab and throw, energy blast.
- Air: air punch, dive kick, 3-hit tornado kick, axe-kick spike, ground pound (shockwave on landing), and a dive kick off the wall.
- **Super:** with a full meter (they glow), a fighter can unleash a 6-hit "Omni Flurry". Everything freezes for a dramatic beat first.

**Effects**
- Anime impact bursts, and black-and-white impact frames on huge hits.
- Shockwaves, cracks in the floor and screen edges, smear trails, afterimages, speed lines.
- Lightning bolts, energy auras, combo counters, a slow-motion K.O.
- Clashes: when two attacks meet, both fighters bounce off.

**Tactics**
- **Reaction time:** fighters react 8–20 frames late, like a human.
- **Neutral game:** they play footsies around a preferred range, punish whiffs (dashing in from far away), anti-air jumpers and block high or low.
- **Defense:** some parry on purpose.
- **Combos:** they confirm hits into combos.
- **Corners:** they wall-jump over you to escape.
- **Learning:** they learn which moves work against whom. That memory, plus levels and wins, is saved.
- **Teams mode:**
  - Each team focuses the weakest nearby enemy, and the second attacker flanks from the other side.
  - Someone breaks up combos on a teammate, and badly hurt fighters fall back to support.
  - They call it out ("Flanking!", "Cover me!", "I've got you!").
- **FFA:** fighters like jumping whoever is already busy with someone else.

See [FIGHTING_DESIGN.md](FIGHTING_DESIGN.md) for the research behind the combat.

## Self-updating

The app checks for a new version on startup and every few hours. You can also use **Check for updates** in the panel, or untick **Auto**.

How it works:
- It reads `version.json` from the GitHub repo named in `update.json` (default `samuelsortland-cmyk/stickfight-pets`, which must be public).
- It downloads only the changed files and checks every file against its SHA-256 checksum.
- It replaces the files only if all downloads check out, then restarts itself.
- Only the app's own files can be written, and a failed or tampered download changes nothing.

**Publishing an update** (for whoever maintains the repo):
1. Bump `"version"` in `package.json`.
2. Run `npm run manifest -- "what changed"`.
3. Commit and push to `main`.

To host updates somewhere else, put `{ "baseUrl": "https://your.host/path/" }` in `update.json`.

## Platform notes

| OS | Window platforms | Notes |
|---|---|---|
| Windows 10/11 | Yes (PowerShell + user32/dwmapi, nothing to install) | |
| macOS | Yes (CoreGraphics via `osascript`) | If window detection fails, grant Screen Recording permission |
| Linux (X11) | Yes, with `wmctrl` (`sudo apt install wmctrl`) | Needs a compositor for transparency |
| Linux (Wayland) | No (floor only) | |

Other notes:
- Only the primary monitor is used.
- The floor is the top of your taskbar or dock.
- If the folder is inside OneDrive, consider moving it out so OneDrive doesn't sync `node_modules`.

## Project layout

```
main.js             Electron overlay, tray, hotkeys, cursor polling, update scheduling
preload.js          Safe IPC bridge to the page
updater.js          Self-updater (manifest + SHA-256 verified file swap)
update.json         Where updates come from
version.json        Update manifest (generated by tools/make-manifest.js)
Start StickFight.bat  Windows double-click launcher
src/windows.js      Per-OS desktop window tracker
src/index.html      Page shell, dock markup and styles
assets/stickpix.ttf Pixel font (tools/build-font.py)
src/ui.js           Tool dock, cards and pixel-art icons
src/app.js          Bootstrap, input, tools, click-through toggling, game loop
src/game/poses.js   Math, skeleton proportions, pose library, forward kinematics
src/game/moves.js   Move list with frame data
src/game/fighter.js State machine, movement, posing, verlet ragdoll
src/game/ai.js      Fighting AI, learning, pet behaviors
src/game/world.js   Platforms, hits, clashes, tools, team tactics, effects, rounds
src/game/render.js  Canvas drawing
src/game/arsenal.js Weapons, items, power fruits, destruction decals
```
