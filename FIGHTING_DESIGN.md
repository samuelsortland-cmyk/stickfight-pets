# Fighting design notes

This is the research behind the combat and where each idea lives in the code.
Sources are listed at the end.

## 1. Frame data is the backbone

Fighting games run at 60 frames per second, so a "frame" is about 16.7 ms.
Every attack is split into three phases:

- **Startup:** frames from the input until the hitbox exists. Useful normal attacks in Street Fighter V are around 4–8 frames.
- **Active:** frames where the hitbox can connect.
- **Recovery:** frames after that before the attacker can act again.

On contact, the defender is frozen in **hitstun** (or **blockstun** if they blocked).
**Frame advantage** is the defender's stun minus the attacker's remaining frames.
Dustloop puts it as `Blockstun − ((Active − 1) + Recovery)`, and a positive number means the attacker gets to act first.

**In the code:** the simulation runs at a fixed 60 ticks/s (`src/app.js`).
Every move in `src/game/moves.js` has `s` (startup), `a` (active), `r` (recovery), `hs` (hitstun) and `bs` (blockstun):

| Move | Startup | Active | Recovery | Damage | Role |
|---|---|---|---|---|---|
| Jab | 4 | 3 | 9 | 4 | Fastest button, combo starter, punisher |
| Cross | 6 | 3 | 13 | 6 | Longer reach, links into enders |
| Kick | 8 | 4 | 16 | 8 | Mid-range poke |
| Uppercut | 7 | 4 | 22 | 8 | Launcher and anti-air. Very unsafe if it whiffs |
| Sweep | 8 | 4 | 20 | 7 | Low attack, must be crouch-blocked, knocks down |
| Heavy | 15 | 5 | 20 | 13 | Slow and huge. Wall-splats, and the body becomes a projectile |
| Grab | 5 | 3 | 24 | 10 | Beats blocking, loses to jumping and rolling |
| Blast | 12 | 2 | 18 | 10 | Projectile, costs 50 meter |
| Air punch / dive kick / axe spike | 4 / 5 / 8 | — | — | 5 / 8 / 10 | Aerial combo tools. The spike is an overhead and can't be crouch-blocked |

**Hitstop:** on impact, both fighters freeze for a few frames (`stop`).
It's what makes hits feel heavy, and it gives the attacker time to confirm the hit before cancelling into a follow-up.
It's paired with screen shake, a white impact flash and radiating sparks.

**Counter hits:** hitting someone during their startup does +20% damage and adds extra hitstop.

## 2. The rock-paper-scissors triangle

- Strikes beat grabs (a grab has slow startup and long recovery).
- Blocks beat strikes.
- Grabs beat blocks.

On top of that, height matters. Lows (sweep) must be blocked crouching, and overheads (axe spike) must be blocked standing.
A **parry** rewards timing: a block that starts within 6 frames of the impact staggers the attacker for 26 frames, long enough for a free punish.

## 3. Neutral, footsies and whiff punishing

Most of a real match is spent in "neutral": both players hover around the range where their best poke reaches.
Community guides describe it like this:

- If your move outranges the opponent's, you win.
- If your move starts up first, you win.
- If you attack after the opponent's active frames, you can punish their recovery.

Footsies is largely about positioning: walking in and out of range to bait a whiff, then punishing the recovery.

**In the code** (`src/game/ai.js`):

- Each personality has a preferred **spacing**. The AI oscillates around it with a slow sine wave (walk in, walk out), dashes in occasionally, and jumps in occasionally.
- Each move's **reach** is computed from its extended pose (forward kinematics in `moves.js`), so the AI only picks attacks that can actually connect from where it stands.
- **Whiff punish:** if the opponent is seen in recovery, the AI works out how many recovery frames are left and picks the most damaging move whose startup fits inside that window and whose reach covers the gap.
- **Corner escape:** with its back to the screen edge, the AI jumps over or rolls through.

## 4. Human-like reactions

Reacting perfectly to a whiff takes near-inhuman timing.
Research on the open-source game *FOOTSIES* trained reinforcement-learning agents under an emulated human reaction delay.
It found that how well the agent coped depended on how well it predicted the opponent, and that training against varied opponents and using dense rewards both mattered.

**In the code:**

- **Reaction delay:** the AI never reads its opponent's live state. Every fighter records a 40-frame history of snapshots, and the AI reads the one from `react` frames ago (8–20 frames depending on personality, faster at higher levels). Attacks with less startup than your reaction time (a 4-frame jab) can't be blocked on pure reaction. That is exactly why fast pokes are strong in real fighting games.
- **Prediction:** Tactician-style fighters know the frame data. When they see an attack starting, they deliberately block *late* so the guard lands inside the parry window.
- **Dense rewards, learning:** every move has a weight per fighter. It goes up a lot on a hit (scaled by damage) and a little on a K.O., and goes down a little on a whiff, a bit more when blocked, and most when punished or parried. Move choice is weighted by these, and they persist in `localStorage`.

## 5. Combos and anti-infinite rules

Chaining hits works by **cancelling**: once a move connects, its recovery can be cut short by starting a listed follow-up.
For example: jab → cross → kick → heavy, or uppercut → jump cancel → air punch → dive kick.
The AI "hit-confirms": it only commits to the next link after seeing the hit land (`moveHit === 'hit'`), and does so with probability equal to its combo skill.

Without limits, combos become infinite. Real games stack several systems: per-hit damage scaling (often −10% per hit), hitstun decay, increasing gravity as hits accumulate, and same-move penalties.
The original Street Fighter II had no scaling, which made repeated hits devastating.

**In the code** (`src/game/world.js → resolveHit`):

- **Damage scaling:** −12% per hit in the combo, with a floor of 35%.
- **Juggle hitstun decay:** −3 frames of hitstun for every juggle hit.
- **Juggle limit:** after 5 juggle hits or 8 total hits, the defender is forced into a knockdown.
- **Landing:** juggled fighters crumple into a ragdoll when they hit the ground, which ends the combo.

## 6. The Animator vs. Animation flavor

In Becker's shorts, a stick figure comes alive and fights its creator using the computer's own interface: the cursor, the tools, the windows.
In part 4 the fight spills out across the whole computer.

**In the code:**

- **The cursor is the animator.** You can grab any limb and dangle a fighter (a verlet ragdoll pinned at that joint), fling it, or poke it. A poked pet hunts down your cursor. It picks the attack whose fist or foot ends up at the cursor's height, jumps for it, and shakes its fist if the cursor is out of reach.
- **Windows are terrain.** Title bars of real windows become one-way platforms. Occlusion is handled, so only the visible part of a title bar counts. Fighters ride a window when you drag it, and fall when it's minimized or closed.
- **Animator mode:** draw your own platforms with the mouse, like the pencil tool in the shorts.
- **Physics-driven violence:** knockdowns, throws and K.O.s switch the stickman to an 11-point verlet ragdoll. Bodies thrown hard enough bowl over other fighters, and slamming into the floor or a screen edge deals damage, with shake and dust. Getting up blends smoothly from wherever the ragdoll landed back into the fighting pose.
- **Animation polish:** smear trails on the striking limb, afterimages during dashes, rolls and flips, a white flash when a fighter is hit, slow-motion on K.O., and X-eyes.

## 7. Version 2: mobility, spectacle and team tactics

**Mobility makes fights travel.** These are in `src/game/fighter.js`:

- **Dash:** 13 frames, cancellable into any ground move from frame 4. This is the "dash attack" used for long-range whiff punishes.
- **Air dash:** one per jump, gravity off for 10 frames.
- **Wall cling and wall jump:** works on screen edges and the control panel. A wall jump resets your air jump and air dash. A fighter clinging to the wall can also launch `wallDive` off it.
- **Backflip:** 14 invincible frames.

The AI uses walls the way players use them in platform fighters. When cornered it jumps toward the wall, clings, and kicks off over the opponent for a crossup (`ai.wallPlan`, `wallThink`). When the target is out in front, it may dive straight off the wall at them instead.

**Multi-hit moves** list their hit windows (`hits`) with per-hit overrides (`hitData`). The hit list resets at every window, so each hit can land.

- **Tornado:** 3 hits.
- **Super (Omni Flurry):** 5 rapid punches and a launching finisher that can't be blocked. It needs a full meter, so it can't be spammed.

The super freezes everyone else for 28 frames, the classic "super flash". It also briefly dims the screen if cinematic supers are on.

**Clashes:** if two active hitboxes meet while their owners face each other, both attacks cancel. The fighters bounce apart with a big burst, a bit like Guilty Gear's clash system.

**Spectacle:**
- **Hitstop and shake** scale with damage.
- **Anime-style radial bursts** go on big hits.
- **Impact frames:** a few frames of pure black-and-white silhouettes on K.O.s, finishers, clashes and lightning.
- **Cracks** on floors and walls after hard slams.
- **Shockwaves** from ground pounds.
- **Speed lines and afterimages** on every fast movement.
- **An energy aura** while the super meter is full.

**Organised chaos: team tactics** (`World.updateTactics`, re-planned every 20 frames):

- **Focus fire:** each team picks one target, scored on low health, closeness, and whether that enemy is already busy with someone else.
- **Lead and flank:** two members attack the focus. The flanker wants the opposite side from the lead and will jump over the target to get there, which creates a pincer. Blocking only works toward one side, so a pincer is genuinely hard to defend.
- **Rescue:** when a teammate is being comboed, a free member re-targets the attacker to interrupt.
- **Support:** members under 25 HP fall back to long range and zone with projectiles while healthier teammates take point.
- **Callouts:** speech bubbles say what each fighter is doing, so you can read the plan.

In free-for-all, the same "busy" bonus makes fighters third-party ongoing fights. That keeps big brawls chaotic but not random.

## Sources

- Dustloop, "Using Frame Data": https://dustloop.com/w/Using_Frame_Data
- Prima Games, Street Fighter V eGuide, "Reading frame data": https://primagames.com/eguides/street-fighter-v-eguide/primer/reading-frame-data
- Dream Cancel, "A Guide to Frame Data": https://dreamcancel.com/?p=2109
- SuperCombo wiki, "Footsies": https://srk.shib.live/w/Footsies
- EventHubs, whiff-punish and footsies primer: https://eventhubs.com/news/2020/apr/27/immediately-level-your-footsies-game-whiff-punish-option-select
- "Reinforcement learning applied to fighting games" (FOOTSIES study): https://oasisbr.ibict.br/vufind/Record/RCAP_1a145faa2cc8011fd8f6c57eb02809e6
- Dustloop, damage scaling and combo systems (GGAC, BBCF, DNF Duel): https://dustloop.com/w/Damage_(GGAC), https://dustloop.com/w/BBCF/Damage, https://dustloop.com/w/DNFD/Damage
- Dustloop, "Infinite Prevention and Combo Mechanics": https://dustloop.com/w/User:Slimegirl-scientist/Infinite_Prevention_and_Combo_Mechanics
- Dustloop, Guilty Gear clash mechanics (general reference for attack clashing): https://dustloop.com/w/GGST/Mechanics
- Wikipedia, "Animator vs. Animation": https://en.wikipedia.org/wiki/Animator_vs._Animation
