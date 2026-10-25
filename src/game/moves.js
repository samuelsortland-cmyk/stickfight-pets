'use strict';
/* Move list with frame data at 60 ticks/second (see FIGHTING_DESIGN.md).
 *   s/a/r   startup / active / recovery frames
 *   dmg     damage out of 100 HP
 *   hs/bs   hitstun / blockstun frames on the defender
 *   kb      knockback [forward, up(-)] in units per tick
 *   stop    hitstop (impact freeze) frames applied to both fighters
 *   joint   which joint carries the hitbox, rad = hitbox radius
 *   cancels moves this can be cancelled into once it connects ('jc' = jump cancel)
 *   ai      base preference weight for the AI
 */
const MOVES = {
  jab: {
    s: 4, a: 3, r: 9, dmg: 4, hs: 13, bs: 9, kb: [2.5, 0], stop: 5, joint: 'h1', rad: 7, step: 1.5, ai: 1.4,
    wind: P({ lean: 0.1, a1: 0.35, e1: 2.3, a2: 0.1, e2: 2.6, l1: 0.4, k1: -0.3, l2: -0.35, k2: -0.15 }),
    hit: P({ lean: 0.28, a1: 1.55, e1: 0.05, a2: 0.15, e2: 2.6, l1: 0.45, k1: -0.25, l2: -0.4, k2: -0.1 }),
    cancels: ['cross', 'kick', 'uppercut', 'grab'],
  },
  cross: {
    s: 6, a: 3, r: 13, dmg: 6, hs: 16, bs: 11, kb: [3.5, 0], stop: 6, joint: 'h2', rad: 7, step: 2.5, ai: 1,
    wind: P({ lean: 0.0, a1: 0.6, e1: 1.8, a2: -0.1, e2: 2.4, l1: 0.35, k1: -0.25, l2: -0.35, k2: -0.2 }),
    hit: P({ lean: 0.45, head: 0.05, a1: 0.3, e1: 2.1, a2: 1.6, e2: 0.0, l1: 0.55, k1: -0.4, l2: -0.55, k2: 0.0 }),
    cancels: ['kick', 'uppercut', 'sweep', 'heavy', 'blast'],
  },
  kick: {
    s: 8, a: 4, r: 16, dmg: 8, hs: 19, bs: 12, kb: [5, -1], stop: 7, joint: 'f1', rad: 8, step: 1, ai: 1.1,
    wind: P({ lean: -0.1, a1: 0.7, e1: 1.6, a2: -0.3, e2: 1.8, l1: 1.4, k1: -2.3, l2: -0.1, k2: -0.05 }),
    hit: P({ lean: -0.4, head: 0.2, a1: 0.9, e1: 1.0, a2: -0.6, e2: 0.9, l1: 1.65, k1: -0.05, l2: -0.12, k2: 0 }),
    cancels: ['heavy', 'blast', 'uppercut'],
  },
  uppercut: {
    s: 7, a: 4, r: 22, dmg: 8, hs: 32, bs: 12, kb: [1.5, -12.5], stop: 8, launch: true, joint: 'h2', rad: 9, hop: -4, step: 1.5, ai: 0.5,
    wind: P({ lean: 0.45, head: -0.2, a1: 0.7, e1: 1.8, a2: 0.0, e2: 0.9, l1: 1.0, k1: -1.5, l2: -0.2, k2: -0.9 }),
    hit: P({ lean: -0.12, head: -0.3, a1: 0.4, e1: 1.6, a2: 2.3, e2: 0.4, l1: 0.25, k1: -0.05, l2: -0.3, k2: -0.05 }),
    cancels: ['jc'],
  },
  sweep: {
    s: 8, a: 4, r: 20, dmg: 7, hs: 0, bs: 12, kb: [2.5, -5], stop: 6, low: true, knockdown: true, joint: 'f1', rad: 9, ai: 0.6,
    wind: P({ lean: 0.5, a1: 0.9, e1: 1.2, a2: 0.4, e2: 1.4, l1: 1.0, k1: -2.0, l2: 0.6, k2: -2.3 }),
    hit: P({ lean: 0.55, head: -0.2, a1: 1.1, e1: 0.6, a2: -0.4, e2: 0.5, l1: 1.55, k1: 0.05, l2: 1.0, k2: -2.5 }),
    cancels: [],
  },
  heavy: {
    s: 15, a: 5, r: 24, dmg: 13, hs: 0, bs: 16, kb: [13, -6], stop: 12, knockdown: true, joint: 'f2', rad: 11, step: 3, ai: 0.6,
    wind: P({ lean: 0.35, head: -0.2, a1: -0.4, e1: 1.0, a2: 0.9, e2: 1.5, l1: 0.2, k1: -0.5, l2: 1.3, k2: -2.4 }),
    hit: P({ lean: -0.65, head: 0.3, a1: -0.8, e1: 0.8, a2: 0.6, e2: 1.0, l1: 0.05, k1: -0.05, l2: 1.85, k2: 0.0 }),
    cancels: [],
  },
  grab: {
    s: 5, a: 3, r: 24, dmg: 10, grab: true, joint: 'h1', rad: 11, step: 2, ai: 0.5,
    wind: P({ lean: 0.1, a1: 0.9, e1: 1.2, a2: 0.8, e2: 1.3, l1: 0.4, k1: -0.3, l2: -0.35, k2: -0.1 }),
    hit: POSES.grab,
    cancels: [],
  },
  blast: {
    s: 12, a: 2, r: 18, dmg: 10, projectile: true, cost: 50, joint: 'h1', rad: 0, ai: 0,
    wind: P({ lean: -0.1, a1: 0.25, e1: 0.9, a2: 0.2, e2: 1.0, l1: 0.45, k1: -0.4, l2: -0.4, k2: -0.2 }),
    hit: P({ lean: 0.25, a1: 1.57, e1: 0.0, a2: 1.5, e2: 0.05, l1: 0.5, k1: -0.3, l2: -0.45, k2: -0.05 }),
    cancels: [],
  },
  airPunch: {
    air: true, s: 4, a: 4, r: 10, dmg: 5, hs: 18, kb: [2.5, -6], stop: 5, joint: 'h1', rad: 8, ai: 1,
    wind: P({ lean: 0.1, a1: 0.5, e1: 2.2, a2: 0.3, e2: 2.4, l1: 1.0, k1: -1.6, l2: 0.5, k2: -1.3 }),
    hit: P({ lean: 0.3, a1: 1.8, e1: 0.0, a2: 0.4, e2: 2.2, l1: 0.8, k1: -1.4, l2: 0.2, k2: -1.0 }),
    cancels: ['airKick', 'airSpike'],
  },
  airKick: {
    air: true, s: 5, a: 14, r: 10, dmg: 8, hs: 20, kb: [5, -3], stop: 7, joint: 'f1', rad: 9, dive: [6, 7], ai: 1,
    wind: P({ lean: -0.1, a1: 1.4, e1: 0.6, a2: 1.8, e2: 0.5, l1: 1.6, k1: -2.2, l2: 0.3, k2: -1.6 }),
    hit: P({ lean: -0.3, head: 0.1, a1: -0.5, e1: 0.6, a2: -0.9, e2: 0.4, l1: 0.95, k1: 0.0, l2: 0.2, k2: -1.7 }),
    cancels: [],
  },
  airSpike: {
    air: true, s: 8, a: 5, r: 14, dmg: 10, hs: 0, kb: [3, 11], stop: 10, overhead: true, knockdown: true, joint: 'f1', rad: 10, ai: 0.7,
    wind: P({ lean: -0.3, a1: 2.0, e1: 0.4, a2: 1.6, e2: 0.5, l1: 2.9, k1: -0.1, l2: 0.1, k2: -0.8 }),
    hit: P({ lean: 0.45, a1: 0.8, e1: 0.6, a2: 0.4, e2: 0.6, l1: 0.9, k1: -0.05, l2: -0.3, k2: -0.6 }),
    cancels: [],
  },
};

/* Flashier moves. Multi-hit moves list their hit windows in `hits` ([from, to]
 * in move frames) with optional per-hit overrides in `hitData` and poses in `winPoses`. */
Object.assign(MOVES, {
  // Low sliding kick that pops the opponent up for a juggle.
  slide: {
    s: 11, a: 10, r: 22, dmg: 6, hs: 26, bs: 12, kb: [2, -9], stop: 6, low: true, launch: true, joint: 'f1', rad: 9, slideV: 6, ai: 0.3,
    wind: P({ lean: 0.2, a1: 0.6, e1: 1.6, a2: 0.2, e2: 2.0, l1: 0.9, k1: -1.4, l2: -0.2, k2: -0.8 }),
    hit: P({ lean: -1.05, head: 0.5, a1: -1.4, e1: 0.4, a2: -1.7, e2: 0.4, l1: 1.5, k1: 0.0, l2: 0.9, k2: -1.6 }),
    cancels: ['jc'],
  },
  // Three-hit spinning air kick.
  tornado: {
    air: true, s: 5, a: 18, r: 12, dmg: 3, hs: 16, kb: [2.5, -4.5], stop: 4, joint: 'f1', rad: 11, spin: 0.55, ai: 0.8,
    hits: [[6, 8], [12, 14], [18, 22]],
    hitData: [null, null, { dmg: 6, kb: [7, -5], stop: 9, hs: 22 }],
    wind: P({ lean: -0.2, a1: 2.2, e1: 0.4, a2: 1.8, e2: 0.5, l1: 1.6, k1: -2.2, l2: 0.3, k2: -1.6 }),
    hit: P({ lean: -0.5, head: 0.2, a1: 1.6, e1: 0.1, a2: -1.4, e2: 0.2, l1: 1.6, k1: 0.0, l2: 0.6, k2: -1.5 }),
    cancels: [],
  },
  // Off-the-wall diving kick.
  wallDive: {
    air: true, s: 3, a: 18, r: 10, dmg: 9, hs: 22, kb: [7, -4], stop: 8, joint: 'f1', rad: 10, dive: [9, 3.5], ai: 1,
    wind: P({ lean: -0.1, a1: 1.4, e1: 0.6, a2: 1.8, e2: 0.5, l1: 1.6, k1: -2.2, l2: 0.3, k2: -1.6 }),
    hit: P({ lean: -0.45, head: 0.2, a1: -0.6, e1: 0.6, a2: -1.0, e2: 0.4, l1: 1.35, k1: 0.0, l2: 0.3, k2: -1.7 }),
    cancels: ['tornado'],
  },
  // Plummet from the air and send out a shockwave on landing.
  pound: {
    air: true, s: 8, a: 60, r: 16, dmg: 7, hs: 0, kb: [3, 10], stop: 8, overhead: true, knockdown: true, joint: 'f1', rad: 10, pound: true, ai: 0.7,
    wind: POSES.pound,
    hit: P({ lean: 0.3, a1: 2.4, e1: 0.4, a2: 2.2, e2: 0.5, l1: 0.15, k1: -0.05, l2: -0.2, k2: -0.1 }),
    cancels: [],
  },
  // Super (needs a full meter): dash in, 5-hit flurry, launching uppercut.
  super: {
    s: 12, a: 26, r: 22, dmg: 3, hs: 20, bs: 8, kb: [1.2, -1], stop: 3, joint: 'h1', rad: 11, cost: 100, superMove: true, ai: 0,
    hits: [[13, 14], [17, 18], [21, 22], [25, 26], [29, 30], [33, 38]],
    hitData: [null, { joint: 'h2' }, null, { joint: 'h2' }, null, { joint: 'h2', dmg: 12, kb: [4, -15], stop: 16, hs: 40, launch: true, finisher: true }],
    wind: POSES.dash,
    hit: MOVES.jab.hit,
    winPoses: [MOVES.jab.hit, MOVES.cross.hit, MOVES.jab.hit, MOVES.cross.hit, MOVES.jab.hit, MOVES.uppercut.hit],
    dashV: 10,
    cancels: [],
  },
});
MOVES.cross.cancels.push('slide', 'super');
MOVES.kick.cancels.push('super');
MOVES.heavy.cancels.push('super');
MOVES.airPunch.cancels.push('tornado');

// Precompute horizontal reach (in units) from each move's extended pose, for AI spacing.
for (const key of Object.keys(MOVES)) {
  const m = MOVES[key];
  m.key = key;
  if (!m.hits) m.hits = [[m.s + 1, m.s + m.a]];
  const L = poseLocal(m.hit, 1, 0);
  const travel = (m.step || 0) * 3 + (m.dive ? m.dive[0] * 4 : 0) + (m.slideV || 0) * 5 + (m.dashV || 0) * 7;
  m.reach = m.projectile ? 400 : Math.max(0, L.x[JI[m.joint]]) + m.rad + 6 + travel;
}
const GROUND_MOVES = Object.keys(MOVES).filter((k) => !MOVES[k].air);

// Height (units above the feet) and forward offset of each ground move's hitbox
// at full extension; used to aim attacks at the cursor.
for (const key of GROUND_MOVES) {
  const m = MOVES[key];
  const L = poseLocal(m.hit, 1, 0);
  m.height = L.low - L.y[JI[m.joint]] - (m.hop || 0) * 2;
  m.fwd = L.x[JI[m.joint]];
}
