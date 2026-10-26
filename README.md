# StickFight Pets

AI stickman desktop pets that fight each other right on top of your screen, inspired by Alan Becker's *Animator vs. Animation*.
They wall-jump, air-dash, backflip, throw supers, stand on your windows, and get blown up by your bombs.

## Run it

You need [Node.js](https://nodejs.org) (the LTS version).

- **Windows:** double-click **`Start StickFight.bat`**. The first run installs everything, which takes a minute.
- **Any OS:** open a terminal in this folder and run `npm install` once, then `npm start`.

A transparent overlay covers your main monitor. Clicks pass through to your apps everywhere except on the stickmen and the controls.

**Try it without installing:** open `src/index.html` in a browser for a demo desktop with fake windows.

## The controls

A rail sits on the right edge of the screen. Its edge also works as a wall that fighters can wall-jump off. The **»** at the bottom tucks it away into a small tab. **Ctrl+Alt+Shift+U** brings it back.

**Quick tools** (top of the rail)

| Tool | What it does |
|---|---|
| Hand | Drag a fighter to dangle and throw it, click one to poke it. A poked pet comes after your cursor |
| Pencil / Eraser | Draw platforms (they last a minute) / erase them |
| Bomb | Click to blow everyone nearby into the air |
| Lightning | Click a fighter to smite it |
| Spawn | Click anywhere to drop a new fighter there |

`Esc` or right-click goes back to the hand.

**Sections** (each opens a panel)

- **Fighters:** all 12 fighters as a grid. Click an empty slot to add that fighter, or click a fighter to edit it: its fighting style, power and weapon, plus Heal, Fill ultimate and Remove. Badges show each fighter's power and weapon at a glance.
- **Powers:** the 9 power fruits, each with its ultimate. Pick one, then click a fighter on screen, pick a fighter from the "Give to" chips, choose **Everyone**, or click empty ground to drop the fruit. There are also **Random for all** and **Remove all** buttons.
- **Armory:** weapons (each with its own ultimate) and items, given the same way. **Item rain** drops 8 random things from the sky.
- **Maps:** 13 arenas with live previews, plus **No map**. Toggle whether your own windows also count as platforms.
- **Match:** Free-for-all / Teams / Peace, **Fight now**, slow motion, pause, and the break between rounds.
- **Settings:** fighter size, pixel style (Fine is high resolution; Classic and Chunky are blockier), power name tags, cinematic ultimates, showing detected platforms, clearing drawings, resetting the AI's memory, updates, hide, and quit.

### Weapons and items

| Weapon | Moves | Ultimate |
|---|---|---|
| Katana | Long slashes, also in the air | **Thousand Cuts**: dashes 440px through everyone in the way, then dozens of slashes land at once |
| Hammer | Slow ground-cracking smash | **Earthshatter**: a shockwave 400px each way that launches everyone and raises rock spikes |
| Spear | Longest reach | **Dragon Lance**: a flaming lance thrown across the whole screen, piercing everyone |
| Blaster | Shoots | **Bullet Storm**: 22 rapid shots in a spread, then one huge round |

Items: **Medkit** heals 45, **Energy** fills the ultimate meter, and fighters lob **Grenades** at enemies. Weapons wear out and get knocked loose by big hits. Fighters go and pick up what they need by themselves.

### Powers and ultimates

Eat a fruit to gain a power, which the AI casts on cooldown. A full meter unlocks an ultimate, and every ultimate has big range.

| Power | Power move | Ultimate |
|---|---|---|
| Flame | Fire Fist: exploding fireball | **Flame Emperor**: a giant sun dropped on the target, 290px blast and a field of fire |
| Ice | Ice Age: freezing spike wave | **Absolute Zero**: freezes every enemy within 430px |
| Light | Teleport kicks between 3 enemies | **Light Rain**: 20 beams over a 720px area |
| Quake | Cracks the screen like glass | **World Shaker**: launches everyone within 700px, cracking the screen on both sides |
| Dark | Black hole | **Black Vortex**: a black hole twice the size that pulls from 660px away |
| Rumble | Lightning storm | **Raigo**: a giant thunder orb plus chain lightning to every enemy on screen |
| Gravity | Meteor | **Meteor Shower**: 7 meteors across 800px |
| Buddha | Golden giant | **Buddha Palm**: a giant golden palm that sweeps 540px |
| Ki Beam | Kamehameha | **Final Kamehameha**: a beam nearly 3× as wide across the whole screen |

**Choosing an ultimate:** every fighter also keeps the default ultimate, **Omni Flurry** (a 6-hit rush). When the meter fills, the AI picks whichever ultimate fits the moment:
- Omni Flurry when the target is right in front of it.
- Its power's ultimate when several enemies are in range or the target is far away.
- Its weapon's ultimate when that weapon's range lines up.

Ultimates freeze everyone else for a beat and flash their name.

**Telling powers apart:** fighters with a power have glowing gloves in that power's colors, a signature effect (flames from the fists, frost, sparkles, purple smoke, orbiting rocks, a golden halo…) and their power's name above the head. The name tags can be turned off in Settings.

### Maps

13 arenas built along the bottom of the screen. Each uses at most about a quarter of a 1080p screen's height.

| Map | What's special |
|---|---|
| Rooftops | City buildings with lit windows, a steel ledge up high |
| Floating Isles | Grassy islands drifting up and down |
| Dojo | Wooden stage, balconies, lanterns |
| Construction Site | Girders, a crane platform swinging across, breakable crates with loot |
| Volcano | Lava pool that burns and launches, a rising rock |
| Frozen Lake | Slippery ice floor and icicle ledges |
| Trampoline Park | Jump pads that launch fighters sky high |
| Factory | Conveyor belts and a pumping piston |
| Temple | Stepped pyramid with torches |
| Space Station | Low gravity, drifting panels, two portal pairs |
| Pirate Bay | Two rocking ships, crow's nests, water that splashes you back out |
| Jungle | Swinging vines and bouncy mushrooms |
| Neon Arena | A glowing ring between two towers, jump pads |

In fights, fighters chase each other onto the platforms and take the high ground near their target.

**Hotkeys** (Ctrl is Cmd on macOS):

| Keys | Action |
|---|---|
| `Ctrl+Alt+Shift+U` | Show / tuck away the controls |
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
src/index.html      Page shell, control markup and styles
assets/stickpix.ttf Pixel font (tools/build-font.py)
src/ui.js           Rail, panels, icons, portraits and map thumbnails
src/app.js          Bootstrap, input, tools, click-through toggling, game loop
src/game/poses.js   Math, skeleton proportions, pose library, forward kinematics
src/game/moves.js   Move list with frame data
src/game/fighter.js State machine, movement, posing, verlet ragdoll
src/game/ai.js      Fighting AI, learning, pet behaviors
src/game/world.js   Platforms, hits, clashes, tools, team tactics, effects, rounds
src/game/render.js  Canvas drawing
src/game/arsenal.js Weapons, items, power fruits, destruction decals, power indicators
src/game/ultimates.js Weapon and power ultimates, and how the AI picks one
src/game/maps.js    The 13 maps: platforms, moving parts, pads, conveyors, lava, portals, crates
```
