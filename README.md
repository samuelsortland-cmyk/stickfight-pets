# StickFight Pets

AI stickman desktop pets that fight each other right on top of your screen, inspired by Alan Becker's *Animator vs. Animation*.
They wall-jump, air-dash, backflip, throw supers, stand on your windows, and get blown up by your bombs.

## Run it

You need [Node.js](https://nodejs.org) (the LTS version).

- **Windows:** double-click **`Start StickFight.bat`**. The first run installs everything, which takes a minute.
- **Any OS:** open a terminal in this folder and run `npm install` once, then `npm start`.

A transparent overlay covers your main monitor. Clicks pass through to your apps everywhere except on the stickmen and the control panel.

**Try it without installing:** open `src/index.html` in a browser for a demo desktop with fake windows.

## The control panel

A panel sits on the right edge of the screen (click the **⚔ PETS** tab to fold it away). The panel acts as a wall for the fighters, so they can wall-jump off it.

**Animator tools**

| Tool | What it does |
|---|---|
| ✋ Hand | Drag a fighter to dangle and throw it, click one to poke it. A poked pet comes after your cursor |
| ✏️ Pencil | Drag to draw platforms (they last a minute) |
| 🧽 Eraser | Drag over drawn lines to erase them |
| 💣 Bomb | Click to blow everyone nearby into the air |
| ⚡ Lightning | Click a fighter to smite it |
| ✨ Spawn | Click anywhere to drop a new fighter there |

Right-click or press `Esc` to go back to the hand. While any other tool is active, the overlay takes your clicks.

**Fighters**
- Click a color to add that fighter, up to 12.
- Pick a fighting style first if you want one: Brawler, Tactician, Acrobat or Zoner.
- Each fighter's row shows its health, level and wins, with a ✕ to remove it.

**Match**
- **FFA:** everyone for themselves.
- **Teams:** red vs blue, with coordinated tactics.
- **Peace:** pets only, no fighting.
- **Fight now** starts a round, and there are **Slow-mo** and **Pause** toggles.

**Settings:** fighter size, the break between rounds, cinematic supers (briefly dims the screen), debug outlines of detected window platforms, and "Reset AI memory".

**Hotkeys** (Ctrl is Cmd on macOS):

| Keys | Action |
|---|---|
| `Ctrl+Alt+Shift+U` | Show / hide the panel |
| `Ctrl+Alt+Shift+B` | Fight now |
| `Ctrl+Alt+Shift+N` | Add a fighter |
| `Ctrl+Alt+Shift+H` | Hide / show the pets |
| `Ctrl+Alt+Shift+Q` | Quit |

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
src/index.html      Page shell, control panel markup and styles
src/ui.js           Control panel wiring
src/app.js          Bootstrap, input, tools, click-through toggling, game loop
src/game/poses.js   Math, skeleton proportions, pose library, forward kinematics
src/game/moves.js   Move list with frame data
src/game/fighter.js State machine, movement, posing, verlet ragdoll
src/game/ai.js      Fighting AI, learning, pet behaviors
src/game/world.js   Platforms, hits, clashes, tools, team tactics, effects, rounds
src/game/render.js  Canvas drawing
```
