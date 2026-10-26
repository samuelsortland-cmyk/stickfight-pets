'use strict';
/* Fighter AI.
 * - Perceives its opponent through a reaction delay (~8-20 frames, like a human
 *   at 60fps) by reading the opponent's state history, not the live state.
 * - Defends against attacks it "sees" coming (block high/low, roll, backflip,
 *   jump the sweep, tech the grab), and some personalities late-block to parry.
 * - Plays footsies around a preferred spacing, dashes in, whiff-punishes recovery
 *   frames (with dash-in punishes from range), anti-airs and hit-confirms into combos.
 * - Uses the whole screen: wall-jump crossups out of the corner, air dashes,
 *   ground pounds, slides and supers.
 * - Follows the team plan from World.updateTactics (lead / flank / rescue / support).
 * - Learns per-move weights from what lands and what gets punished.
 * - Outside fights it behaves like a desktop pet. */
const ARCHETYPES = {
  Brawler:   { aggr: 1.0,  def: 0.35, react: [12, 20], combo: 0.85, spacing: 40,  jumpy: 0.2,  zoning: 0.1, parry: 0.1,  mobility: 0.5 },
  Tactician: { aggr: 0.75, def: 0.65, react: [9, 15],  combo: 0.8,  spacing: 60,  jumpy: 0.15, zoning: 0.3, parry: 0.35, mobility: 0.45 },
  Zoner:     { aggr: 0.6,  def: 0.5,  react: [11, 18], combo: 0.6,  spacing: 150, jumpy: 0.12, zoning: 0.9, parry: 0.15, mobility: 0.6 },
  Acrobat:   { aggr: 0.9,  def: 0.4,  react: [10, 17], combo: 0.8,  spacing: 65,  jumpy: 0.6,  zoning: 0.2, parry: 0.2,  mobility: 1 },
};

const LINES = {
  poke: ['Hey!', 'Ow!', 'Quit it!', 'Rude.', "I'm busy!", 'You wanna go?!', 'Not cool, animator.'],
  held: ['Put me down!', 'Wheee!', 'AAAA!', 'Careful!', 'I can fly!', 'Let go!'],
  win: ['Too easy.', 'GG', "Who's next?", 'Yesss!', 'Another one.', 'Flawless. Almost.'],
  hi: ['Hi!', 'o/', 'Hello, animator.', 'Oh hey!', "What're you working on?"],
  idle: ['*yawn*', 'Nice cursor.', 'I could take that window.', 'Bored...', 'Rematch soon?', 'hmm', 'Stretching...'],
  window: ['Nice view from %s.', 'Chilling on %s.', '%s is comfy.', 'I live on %s now.'],
  gotcha: ['Got you!', 'Take that!', 'Ha!', 'Not so tough now!'],
  ready: ['Bring it.', "Let's go!", 'You again?', 'Round two!', 'Ready.'],
};

function blankInput() {
  return { move: 0, run: false, jump: false, crouch: false, block: false, attack: null, roll: 0, drop: false, face: 0, pet: null, speed: 1,
    dash: 0, airdash: 0, backflip: false, wall: false };
}
function resetInput(i) {
  i.move = 0; i.run = false; i.jump = false; i.crouch = false; i.block = false;
  i.attack = null; i.roll = 0; i.drop = false; i.face = 0; i.pet = null; i.speed = 1;
  i.dash = 0; i.airdash = 0; i.backflip = false; i.wall = false;
}

function newBrain() {
  return {
    t: 0, seed: Math.random() * 100, react: 14, blockHold: 0, blockLowHold: false, delayBlock: 0,
    lastSeen: '', comboFor: -1, queued: null, airChase: 0, climb: 0, runT: 0, taunt: 0,
    wallPlan: 0, crossT: 0, crossDir: 0, afterDash: null, airPlan: null, wallT: 0,
    pet: null, petT: 0, goal: 0, goalPlat: null, angry: 0, oppBlock: 0, oppSeen: 1,
    projSeen: new WeakSet(), chatT: rand(600, 1800), recent: [],
  };
}

function aiThink(f, w) {
  const inp = f.input;
  resetInput(inp);
  if (!f.ai) f.ai = newBrain();
  const ai = f.ai;
  ai.t++;
  if (f.rag || f.state === 'grabbed' || f.state === 'getup' || f.hitstop > 0) return;
  if (w.phase === 'fight' && f.target && f.target.hp > 0 && f.hp > 0) { combatThink(f, w, inp, ai); return; }
  ai.blockHold = 0; ai.delayBlock = 0;
  if (f.state === 'wall') { inp.jump = true; return; }
  if (w.phase === 'intro' && f.target) { inp.face = sign(f.target.x - f.x) || f.facing; return; }
  if ((w.phase === 'victory' || w.phase === 'ko') && w.winTeam === f.team && f.hp > 0) {
    if (f.onGround) inp.pet = 'victory';
    return;
  }
  petThink(f, w, inp, ai);
}

function combatThink(f, w, inp, ai) {
  const o = f.target, A = f.arch, S = f.S;
  if (ai.t % 30 === 0) ai.react = Math.max(6, randi(A.react[0], A.react[1]) - Math.min(5, f.level - 1));
  const seen = o.hist[Math.max(0, o.hist.length - 1 - ai.react)];
  if (!seen) return;
  const dx = seen.x - f.x, adx = Math.abs(dx), dy = seen.y - f.y;
  const dir = adx > 2 * S ? sign(dx) : f.facing;
  inp.face = dir;
  const lowHp = f.hp < 30;
  const role = f.role || 'lead';
  const aggr = A.aggr * (role === 'rescue' ? 1.5 : role === 'support' ? 0.5 : 1);
  ai.oppSeen++;
  if (seen.state === 'block' || seen.state === 'blockstun') ai.oppBlock++;
  if (ai.oppSeen > 600) { ai.oppSeen *= 0.5; ai.oppBlock *= 0.5; }

  // Mid-attack: hit-confirm into the next link of a combo.
  if (f.state === 'attack') {
    if (f.moveHit === 'hit' && ai.comboFor !== f.attackId) {
      ai.comboFor = f.attackId;
      ai.queued = chance(A.combo + 0.02 * f.level) ? pickCancel(f, o) : null;
    }
    if (ai.queued === 'jc') { inp.jump = true; inp.move = dir; ai.airChase = 50; }
    else if (ai.queued) inp.attack = ai.queued;
    return;
  }
  ai.queued = null;

  if (f.state === 'wall') { wallThink(f, o, inp, ai, S); return; }
  if (f.state === 'dash') {
    // Dash-in attack once in range.
    const key = ai.afterDash || 'jab';
    if (adx < MOVES[key].reach * S * 0.9) { inp.attack = key; ai.afterDash = null; }
    else inp.move = dir;
    return;
  }
  if (!f.onGround) { airThink(f, o, inp, ai, dir, w); return; }
  if (!ACTIONABLE.has(f.state) && f.state !== 'blockstun') return;

  // Defense.
  if (ai.delayBlock > 0) {
    if (--ai.delayBlock === 0) ai.blockHold = 14;
    else return;
  }
  if (ai.blockHold > 0) { ai.blockHold--; inp.block = true; inp.crouch = ai.blockLowHold; return; }
  const key = o.id + ':' + seen.attackId;
  if (isThreat(seen, f, S) && ai.lastSeen !== key) {
    ai.lastSeen = key;
    const m = MOVES[seen.move];
    const def = A.def + (lowHp ? 0.15 : 0) + 0.02 * (f.level - 1);
    if (chance(def)) {
      if (m.grab) {
        if (chance(0.5)) { inp.jump = true; inp.move = -dir; } else inp.backflip = true;
        return;
      }
      if (m.superMove) {
        // Supers are scary: get out of the way.
        if (chance(0.5)) { inp.jump = true; inp.move = dir; } else inp.backflip = true;
        return;
      }
      if (!m.air && chance(0.1 + A.mobility * 0.12)) { inp.roll = chance(0.5) ? dir : -dir; return; }
      if (!m.air && chance(A.mobility * 0.12)) { inp.backflip = true; return; }
      if (m.low && chance(A.jumpy)) { inp.jump = true; inp.move = dir; ai.airChase = 30; return; }
      const framesLeft = m.s - (seen.moveT + ai.react) + 1;
      if (framesLeft > 3 && chance(A.parry)) {
        // Deliberately block late so the guard lands inside the parry window.
        ai.delayBlock = framesLeft - 2;
        ai.blockLowHold = !!m.low;
        return;
      }
      ai.blockHold = Math.max(6, m.s + m.a - seen.moveT + 4);
      ai.blockLowHold = !!m.low;
      inp.block = true; inp.crouch = !!m.low;
      return;
    }
  }

  // Incoming projectiles.
  for (const p of w.projectiles) {
    if (p.owner.team === f.team || ai.projSeen.has(p)) continue;
    const pdx = f.x - p.x;
    if (sign(pdx) !== sign(p.vx) || Math.abs(pdx) > 150 * S || Math.abs(p.y - (f.y - 45 * S)) > 60 * S) continue;
    ai.projSeen.add(p);
    if (!chance(A.def + 0.1)) continue;
    if (f.meter >= 50 && chance(A.zoning * 0.5)) { inp.attack = 'blast'; return; }
    if (chance(0.35 + A.jumpy * 0.5)) { inp.jump = true; inp.move = -sign(p.vx); ai.airChase = 30; return; }
    if (chance(A.mobility * 0.3)) { inp.roll = -sign(p.vx); return; }
    ai.blockHold = 26; ai.blockLowHold = false; inp.block = true;
    return;
  }

  // Powers: cast when it is likely to land.
  if (f.ability && f.abilityCD <= 0 && chance(0.05 + 0.04 * aggr)) {
    const ab = ABILITIES[f.ability];
    if (ab.ready(f, o, adx, dy, w)) { f.useAbility(o); return; }
  }
  if (f.grenades > 0 && adx > 120 * S && adx < 430 * S && chance(0.02)) { f.throwGrenade(o); return; }
  // Go get gear when there's breathing room.
  if (seekItem(f, w, inp, ai, adx > 140 * S || role === 'support')) return;

  // Whiff punish: the opponent is stuck in recovery.
  if (seen.state === 'attack' && seen.phase === 'recovery') {
    const m = MOVES[seen.move];
    const left = m.s + m.a + m.r - seen.moveT - ai.react;
    if (left > 3 && chance(0.15 + A.combo * 0.3)) {
      const opt = bestPunish(f, adx, left);
      if (opt) { inp.attack = opt; return; }
      // Too far for a normal: dash in and punish.
      if (left > 12 && adx < 160 * S) { inp.dash = dir; ai.afterDash = chance(0.5) ? 'cross' : 'kick'; return; }
    }
  }

  // Ultimate: pick the one that fits (Omni Flurry up close, power/weapon ultimates at range).
  if (f.meter >= 100 && seen.state !== 'block' && chance(0.05 * aggr + (seen.state === 'attack' && seen.phase === 'recovery' ? 0.3 : 0))) {
    const key = chooseUlt(f, o, w, adx, dy);
    if (key && f.useUltimate(key, o)) return;
  }

  // Anti-air.
  if (!seen.onGround && seen.y < f.y - 20 * S && adx < 60 * S && seen.vy > -2 * S && chance(A.def * 0.25)) {
    inp.attack = 'uppercut';
    return;
  }

  // Vertical navigation (the opponent is up on a window or drawn platform).
  if (o.onGround && o.plat && !o.plat.floor && o.y < f.y - 45 * S) {
    if (f.y - o.y < 215 * S) {
      if (navigateTo(f, o.plat, inp, ai, o.x)) return;
    } else if (f.meter >= 50 && chance(0.01)) { inp.attack = 'blast'; return; }
  }
  if (f.plat && !f.plat.floor && seen.y > f.y + 45 * S && chance(0.05)) { inp.drop = true; return; }

  // Maps: take the high ground near the target now and then, so fights use the arena.
  if (w.map && f.onGround) {
    if (ai.platGoal && (ai.platGoal.dead || f.plat === ai.platGoal || --ai.platT <= 0)) ai.platGoal = null;
    if (!ai.platGoal && chance(0.008 + 0.01 * A.mobility)) {
      const cands = w.map.plats.filter((p) => !p.dead && !p.crate && !p.pad && p !== f.plat && f.y - p.y1 < 200 * S && f.y - p.y1 > -10 * S &&
        Math.abs((p.x1 + p.x2) / 2 - o.x) < 280 * S);
      if (cands.length) { ai.platGoal = pick(cands); ai.platT = 160; }
    }
    if (ai.platGoal && navigateTo(f, ai.platGoal, inp, ai, clamp(o.x, ai.platGoal.x1, ai.platGoal.x2))) return;
  }

  const oDown = o.rag || o.state === 'getup' || o.state === 'grabbed' || o.state === 'held';
  let spacing = (A.spacing + (lowHp ? 35 : 0)) * S;
  if (role === 'support') spacing = Math.max(spacing, 170 * S);
  const want = spacing + Math.sin(ai.t * 0.045 + ai.seed) * 14 * S;
  const behindWall = dir > 0 ? f.x - w.left : w.right - f.x;
  const cornered = behindWall < 45 * S;

  if (oDown) {
    // Opponent is down: hover at a safe distance, taunt, or reposition with style.
    if (ai.taunt > 0) { ai.taunt--; inp.pet = 'taunt'; return; }
    // Opponent is down: close in and get ready to pressure the wake-up.
    if (adx > 60 * S) { inp.move = dir; inp.run = adx > 140 * S; }
    else if (adx < 35 * S && !cornered) inp.move = -dir;
    if (chance(0.0015)) ai.taunt = 30;
    else if (chance(0.006 * A.mobility)) inp.backflip = true;
    return;
  }

  // Flanking: when a teammate is already on one side of the target, take the other.
  if (role === 'flank') {
    const ally = w.fighters.find((m) => m !== f && m.team === f.team && m.target === o && m.hp > 0 && Math.abs(m.x - o.x) < 140 * S);
    if (ally) {
      const allySide = sign(ally.x - o.x) || 1;
      const mySide = sign(f.x - o.x) || -allySide;
      if (mySide === allySide && adx < 220 * S) {
        // Wrong side: go around the target by jumping over it.
        if (adx < 75 * S) { inp.jump = true; inp.move = dir; ai.crossT = 40; ai.crossDir = dir; return; }
        inp.move = dir; inp.run = true;
        return;
      }
    }
  }

  // Cornered: wall-jump crossup or roll out.
  if (cornered && adx < 110 * S && chance(0.03 + A.mobility * 0.04)) {
    if (chance(0.55)) { inp.jump = true; inp.move = -dir; ai.wallPlan = 30; }
    else if (chance(0.5)) inp.roll = dir;
    else { inp.jump = true; inp.move = dir; ai.crossT = 30; ai.crossDir = dir; }
    return;
  }

  if (adx > want + 12 * S) {
    inp.move = dir;
    if (adx > 230 * S || ai.runT > 0) inp.run = true;
    if (ai.runT > 0) ai.runT--;
    else if (adx > want + 40 * S && adx < 300 * S && chance(0.03 * aggr * (0.5 + A.mobility))) {
      inp.dash = dir;
      ai.afterDash = pick(['jab', 'cross', 'kick', 'jab', 'heavy']);
      return;
    } else if (adx > 90 * S && chance(0.006 * aggr)) ai.runT = 25;
  } else if (adx < want - 12 * S) {
    if (!cornered) inp.move = -dir;
  }
  if (f.meter >= 50 && adx > 120 * S && Math.abs(dy) < 40 * S && chance(A.zoning * 0.025)) { inp.attack = 'blast'; return; }
  if (adx > 55 * S && adx < 200 * S && chance(A.jumpy * 0.035)) {
    inp.jump = true; inp.move = dir;
    ai.airPlan = chance(A.mobility) ? 'airdash' : null;
    return;
  }
  if (Math.abs(dy) < 30 * S && chance(aggr * 0.17)) {
    const opt = chooseAttack(f, adx, seen, ai);
    if (opt) { inp.attack = opt; inp.move = 0; }
  }
}

function isThreat(seen, f, S) {
  if (seen.state !== 'attack' || !seen.move || seen.phase === 'recovery') return false;
  const m = MOVES[seen.move];
  if (m.projectile) return false;
  return Math.abs(f.x - seen.x) < m.reach * S + 14 * S && Math.abs(f.y - seen.y) < 80 * S;
}

function chooseAttack(f, adx, seen, ai) {
  const S = f.S, opts = [];
  const blockRate = ai.oppBlock / ai.oppSeen;
  for (const key of GROUND_MOVES) {
    const m = MOVES[key];
    if (m.projectile || m.superMove || m.wpn || (m.cost && f.meter < m.cost)) continue;
    const reach = m.reach * S;
    if (adx > reach * 1.05) continue;
    let wgt = m.ai || 1;
    if (m.grab) wgt *= 0.3 + blockRate * 4 + (seen.state === 'block' ? 1.5 : 0);
    if (m.low && (seen.state === 'block' || seen.state === 'blockstun') && !seen.blockLow) wgt *= 2.5;
    if (key === 'heavy') wgt *= 0.5 + (adx > reach * 0.6 ? 0.8 : 0);
    if (key === 'uppercut' && adx > 30 * S) wgt *= 0.3;
    if (key === 'slide' && adx < 40 * S) wgt *= 0.2;
    wgt *= (f.stats.w[key] == null ? 1 : f.stats.w[key]) * variety(ai, key);
    opts.push([key, wgt]);
  }
  if (f.weapon) {
    // Armed fighters lean on their weapon.
    const key = WEAPONS[f.weapon.kind].move, m = MOVES[key];
    if (adx <= m.reach * S * 1.05 && (!m.shoot || Math.abs(seen.y - f.y) < 40 * S)) opts.push([key, (m.shoot ? 5 : 4) * variety(ai, key)]);
  }
  return weightedPick(opts);
}

function pickCancel(f, o) {
  const m = f.move, opts = [];
  const adx = Math.abs(o.x - f.x);
  for (const key of m.cancels) {
    if (key === 'jc') { opts.push([key, f.arch.jumpy * 2 + 0.6 + f.arch.mobility]); continue; }
    const n = MOVES[key];
    if (n.cost && f.meter < n.cost) continue;
    if (!!n.air === f.onGround) continue;
    if (!n.projectile && adx > n.reach * f.S * 1.1) continue;
    const base = n.superMove ? 4 : (n.ai || 0.5) * (n.dmg / 6);
    opts.push([key, base * (f.stats.w[key] == null ? 1 : f.stats.w[key]) * variety(f.ai, key)]);
  }
  return weightedPick(opts);
}

// Mixing it up: each recent use of a move makes it less likely to be picked again.
function variety(ai, key) {
  let k = 1;
  for (const r of ai.recent) if (r === key) k *= 0.35;
  return k;
}

function bestPunish(f, adx, framesLeft) {
  let best = null, score = 0;
  for (const key of GROUND_MOVES) {
    const m = MOVES[key];
    if (m.projectile || m.grab || m.superMove || m.s >= framesLeft || adx > m.reach * f.S) continue;
    if (m.wpn && !(f.weapon && WEAPONS[f.weapon.kind].move === key)) continue;
    const s = m.dmg * (f.stats.w[key] == null ? 1 : f.stats.w[key]) * rand(0.7, 1.3);
    if (s > score) { score = s; best = key; }
  }
  return best;
}

function wallThink(f, o, inp, ai, S) {
  ai.wallT++;
  const dx = o.x - f.x, dy = o.y - f.y;
  const away = f.wallSide;
  // Dive at a target that is out in front, otherwise kick off into the air.
  if (sign(dx) === away && Math.abs(dx) < 260 * S && dy > -30 * S && dy < 160 * S && chance(0.12)) { inp.attack = 'wallDive'; ai.wallT = 0; return; }
  if (ai.wallT > 8 && chance(0.2)) { inp.jump = true; ai.airChase = 40; ai.wallT = 0; }
}

function airThink(f, o, inp, ai, dir, w) {
  const S = f.S;
  const dx = o.x - f.x, dy = o.y - f.y, adx = Math.abs(dx);
  inp.face = dir;
  if (ai.climb && f.y > ai.climb + 4 * S && f.vy > -1.5 * S && f.airJumps > 0) { inp.jump = true; inp.move = dir; }
  if (f.state === 'attack') {
    if (f.moveHit === 'hit' && ai.comboFor !== f.attackId) {
      ai.comboFor = f.attackId;
      ai.queued = chance(f.arch.combo) ? pickCancel(f, o) : null;
    }
    if (ai.queued) inp.attack = ai.queued;
    return;
  }
  ai.queued = null;
  if (ai.airChase > 0) ai.airChase--;
  if (f.state !== 'air' && f.state !== 'backflip') return;
  // Heading for a wall to kick off it.
  if (ai.wallPlan > 0) {
    ai.wallPlan--;
    const wallDir = f.x - w.left < w.right - f.x ? -1 : 1;
    inp.move = wallDir; inp.wall = true; inp.face = wallDir;
    return;
  }
  // Going over the target for a crossup.
  if (ai.crossT > 0) {
    ai.crossT--;
    inp.move = ai.crossDir;
    if (f.vy > -2 * S && f.airJumps > 0 && Math.abs(dx) < 30 * S) inp.jump = true;
    if (sign(o.x - f.x) === -ai.crossDir && Math.abs(dx) > 20 * S) { ai.crossT = 0; if (chance(0.6)) inp.attack = dy > 30 * S ? 'airKick' : 'airPunch'; }
    return;
  }
  inp.move = adx > 12 * S ? dir : 0;
  if (o.rag || o.state === 'getup') return;
  if (ai.airPlan === 'airdash' && f.airDashes > 0 && adx > 45 * S && adx < 170 * S && Math.abs(dy) < 70 * S && f.vy > -6 * S) {
    inp.airdash = dir; ai.airPlan = 'airKick';
    return;
  }
  if (ai.airPlan === 'airKick' && adx < 60 * S) { inp.attack = dy > 15 * S ? 'airKick' : 'tornado'; ai.airPlan = null; return; }
  if (adx < 32 * S && dy > 55 * S && dy < 200 * S && chance(0.15)) { inp.attack = 'pound'; return; }
  const blade = f.weapon && WEAPONS[f.weapon.kind].move !== 'shoot';
  if (adx < (blade ? 80 : 48) * S && Math.abs(dy) < 40 * S && chance(0.25 + (ai.airChase > 0 ? 0.5 : 0))) inp.attack = blade && chance(0.6) ? 'airslash' : chance(0.75) ? 'airPunch' : 'tornado';
  else if (adx < 75 * S && dy > 25 * S && dy < 120 * S && chance(0.12)) inp.attack = dy > 60 * S && adx < 35 * S ? 'airSpike' : 'airKick';
}

// How much a fighter wants an item right now (0 = not at all).
function itemDesire(f, it) {
  if (it.fuse || !wantsItem(f, it)) return 0;
  if (WEAPONS[it.kind]) return 3;
  if (ABILITIES[it.kind]) return 4;
  if (it.kind === 'medkit') return f.hp < 70 ? 5 : 0.5;
  if (it.kind === 'energy') return f.meter < 60 ? 2 : 0.3;
  if (it.kind === 'grenade') return 1.5;
  return 0;
}

// Head for the most wanted item in reach. Returns true while doing so.
function seekItem(f, w, inp, ai, allowed) {
  if (!allowed || !w.items.length || !ACTIONABLE.has(f.state)) return false;
  const S = f.S;
  let best = null, score = 0;
  for (const it of w.items) {
    const dx = Math.abs(it.x - f.x), dy = f.y - it.y;
    if (dx > 420 * S || dy > 200 * S || dy < -260 * S) continue;
    const s = itemDesire(f, it) / (1 + dx / (200 * S));
    if (s > score) { score = s; best = it; }
  }
  if (!best || score < 0.4) return false;
  const dx = best.x - f.x;
  inp.face = sign(dx) || f.facing;
  if (best.y < f.y - 30 * S && Math.abs(dx) < 70 * S) { inp.jump = true; inp.move = sign(dx); return true; }
  if (best.y > f.y + 30 * S && f.plat && !f.plat.floor && Math.abs(dx) < 60 * S) { inp.drop = true; return true; }
  if (Math.abs(dx) > 6 * S) { inp.move = sign(dx); inp.run = Math.abs(dx) > 120 * S; }
  return true;
}

// Walk/jump/double-jump onto platform p (or drop down to it). Returns true while travelling.
function navigateTo(f, p, inp, ai, gx) {
  const S = f.S;
  const tx = clamp(gx == null ? f.x : gx, p.x1 + 15 * S, p.x2 - 15 * S);
  const py = p.yAt(tx);
  const dx = tx - f.x;
  if (!f.onGround) {
    inp.move = Math.abs(dx) > 6 * S ? sign(dx) : 0;
    if (f.y > py && f.vy > -1.5 * S && f.airJumps > 0) inp.jump = true;
    return true;
  }
  if (f.plat === p) { ai.climb = 0; return false; }
  if (py < f.y - 10 * S) {
    if (f.y - py > 225 * S) return false;
    ai.climb = py;
    if (Math.abs(dx) > 40 * S) { inp.move = sign(dx); inp.run = Math.abs(dx) > 150 * S; }
    else { inp.jump = true; inp.move = sign(dx); }
    return true;
  }
  ai.climb = 0;
  if (f.plat && !f.plat.floor && Math.abs(dx) < 120 * S) { inp.drop = true; return true; }
  if (Math.abs(dx) > 8 * S) { inp.move = sign(dx); return true; }
  return false;
}

function petThink(f, w, inp, ai) {
  const c = w.cursor, S = f.S;
  if (f.state === 'wall') { inp.jump = true; return; }
  if (!ACTIONABLE.has(f.state) && f.state !== 'air') return;
  const cdx = c.x - f.x, cadx = Math.abs(cdx);
  const cursorNear = c.on && cadx < 200 * S && Math.abs(c.y - (f.y - 50 * S)) < 220 * S;

  if (--ai.chatT <= 0) {
    ai.chatT = rand(900, 2400);
    if (!f.bubble && chance(0.6)) f.say(pick(LINES.idle));
  }

  // Poked by the cursor: hunt it down and punch it.
  if (ai.angry > 0 && c.on) {
    ai.angry--;
    inp.face = sign(cdx) || f.facing;
    const chestY = f.y - 55 * S;
    if (!f.onGround) {
      inp.move = sign(cdx);
      if (cadx < 45 * S && Math.abs(c.y - chestY) < 50 * S) inp.attack = 'airPunch';
      if (f.vy > -1 * S && c.y < f.y - 120 * S && f.airJumps > 0) inp.jump = true;
      return;
    }
    // Pick the attack whose fist/foot ends up at the cursor's height.
    const rel = (f.y - c.y) / S;
    if (rel > 230 && cadx < 120 * S) {
      // Out of reach: shake a fist at it.
      inp.pet = 'taunt';
      if (!f.bubble && chance(0.01)) f.say(pick(['Come down here!', 'Coward!', 'I see you up there.']));
      return;
    }
    let key = null, best = 22;
    for (const k of ['kick', 'jab', 'cross', 'heavy', 'uppercut']) {
      const err = Math.abs(MOVES[k].height - rel);
      if (err < best) { best = err; key = k; }
    }
    const fwd = key ? MOVES[key].fwd : 30;
    if (cadx > 200 * S && chance(0.05)) inp.dash = sign(cdx);
    else if (cadx > (fwd + 10) * S) { inp.move = sign(cdx); inp.run = cadx > 120 * S; }
    else if (!key) { inp.jump = true; inp.move = sign(cdx); }
    else if (cadx > Math.max(4, fwd - 14) * S) inp.attack = key;
    else inp.move = -sign(cdx) || 1; // too close: back up
    return;
  }

  if (f.onGround && seekItem(f, w, inp, ai, true)) return;
  // Show off a power now and then (no damage outside fights, but the screen still gets wrecked).
  if (f.ability && f.abilityCD <= 0 && f.onGround && ACTIONABLE.has(f.state) && chance(0.0015)) { f.useAbility(null); return; }
  if (!ai.pet || --ai.petT <= 0) choosePet(f, w, ai, cursorNear);
  switch (ai.pet) {
    case 'wander': {
      const d = ai.goal - f.x;
      if (Math.abs(d) < 8 * S || f.state === 'air') { if (f.onGround) { ai.pet = 'idle'; ai.petT = randi(60, 200); } }
      else inp.move = sign(d);
      break;
    }
    case 'climb': {
      const p = ai.goalPlat;
      if (!p || p.dead) { ai.pet = null; break; }
      if (f.onGround && f.plat === p) { ai.pet = chance(0.6) ? 'sit' : 'idle'; ai.petT = randi(300, 800); break; }
      if (!navigateTo(f, p, inp, ai, (p.x1 + p.x2) / 2)) ai.pet = null;
      break;
    }
    case 'sit': inp.pet = 'sit'; break;
    case 'sleep': inp.pet = 'sleep'; if (ai.t % 80 === 0) w.zzz(f); break;
    case 'wave':
      if (cursorNear) { inp.face = sign(cdx) || f.facing; inp.pet = 'wave'; } else ai.petT = 0;
      break;
    case 'follow':
      if (!c.on) break;
      if (cadx > 60 * S) { inp.move = sign(cdx); inp.run = cadx > 250 * S; } else inp.face = sign(cdx) || f.facing;
      break;
    case 'watch': if (c.on) inp.face = sign(cdx) || f.facing; break;
    case 'shadow':
      if (f.onGround && chance(0.06)) inp.attack = pick(['jab', 'cross', 'kick', 'jab', 'uppercut', 'heavy', 'slide']);
      else if (chance(0.008)) inp.jump = true;
      break;
    case 'parkour': {
      // Show off: dash, flip, wall-jump and air-dash around the screen.
      if (!f.onGround) {
        inp.move = ai.goal;
        if (f.airDashes > 0 && chance(0.04)) inp.airdash = ai.goal;
        else if (f.airJumps > 0 && f.vy > -2 * S && chance(0.08)) inp.jump = true;
        else if (chance(0.02)) inp.attack = 'tornado';
        break;
      }
      const toWall = ai.goal > 0 ? w.right - f.x : f.x - w.left;
      if (toWall < 60 * S) { inp.jump = true; inp.move = ai.goal; break; }
      if (chance(0.03)) inp.dash = ai.goal;
      else if (chance(0.02)) inp.backflip = true;
      else if (chance(0.03)) { inp.jump = true; inp.move = ai.goal; }
      else { inp.move = ai.goal; inp.run = true; }
      break;
    }
    default: break;
  }
  // A pet that clung to a wall during parkour turns around.
  if (ai.pet === 'parkour' && f.state === 'air' && (f.x - w.left < 12 * S || w.right - f.x < 12 * S)) {
    ai.goal = f.x - w.left < 12 * S ? 1 : -1;
  }
}

function choosePet(f, w, ai, cursorNear) {
  const S = f.S;
  const hour = new Date().getHours();
  const night = hour >= 23 || hour < 6;
  const plats = w.platforms.filter((p) => p !== f.plat && f.y - p.yAt((p.x1 + p.x2) / 2) < 210 * S);
  ai.pet = weightedPick([
    ['idle', 2], ['wander', 3], ['sit', 1.5], ['watch', 1], ['shadow', 1.2], ['parkour', 1.2 + f.arch.mobility],
    ['sleep', night ? 5 : 0.4], ['wave', cursorNear ? 3 : 0], ['follow', w.cursor.on ? 0.8 : 0],
    ['climb', plats.length ? 2.5 : 0],
  ]);
  ai.petT = randi(120, 480);
  if (ai.pet === 'wander') {
    if (f.plat && !f.plat.floor) ai.goal = rand(f.plat.x1 + 10 * S, f.plat.x2 - 10 * S);
    else ai.goal = rand(w.left + 40 * S, w.right - 40 * S);
    ai.petT = 400;
  } else if (ai.pet === 'climb') {
    ai.goalPlat = pick(plats);
    ai.petT = 600;
  } else if (ai.pet === 'parkour') {
    ai.goal = chance(0.5) ? 1 : -1;
    ai.petT = randi(180, 360);
  } else if (ai.pet === 'sleep') ai.petT = randi(600, 1500);
  else if (ai.pet === 'wave' && chance(0.5)) f.say(pick(LINES.hi));
}
