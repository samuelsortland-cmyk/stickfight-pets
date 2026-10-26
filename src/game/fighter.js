'use strict';
/* A stickman fighter: state machine, platformer physics (dash, air dash, wall
 * cling + wall jump, backflip), posing and a verlet ragdoll for knockdowns,
 * throws and being picked up by the cursor. */
// Tuned for fast, snappy fights.
const GRAV = 0.74, JUMP_V = 14, WALK = 3.1, RUN = 7.4, MAX_FALL = 19;
const DASH_T = 13, BACKFLIP_T = 26, WALL_MAX_T = 80;
const ACTIONABLE = new Set(['idle', 'walk', 'run', 'crouch', 'block', 'sit', 'sleep', 'wave', 'victory', 'taunt']);

const PALETTE = [
  { name: 'Orange', color: '#ff7a1a', arch: 'Brawler', el: 'spark' },
  { name: 'Blue', color: '#2f7dff', arch: 'Tactician', el: 'volt' },
  { name: 'Red', color: '#ff2a2a', arch: 'Acrobat', el: 'shadow' },
  { name: 'Green', color: '#27d35c', arch: 'Zoner', el: 'spark' },
  { name: 'Purple', color: '#a24dff', arch: 'Tactician', el: 'shadow' },
  { name: 'Yellow', color: '#ffd21a', arch: 'Brawler', el: 'volt' },
  { name: 'Cyan', color: '#1fd8f0', arch: 'Acrobat', el: 'volt' },
  { name: 'Pink', color: '#ff58b4', arch: 'Zoner', el: 'spark' },
  { name: 'Lime', color: '#a6ee2c', arch: 'Brawler', el: 'fire' },
  { name: 'White', color: '#f2f2f2', arch: 'Tactician', el: 'volt' },
  { name: 'Teal', color: '#12b5a2', arch: 'Acrobat', el: 'shadow' },
  { name: 'Black', color: '#333338', arch: 'Zoner', el: 'fire' },
];
// Element -> effect colors. Each fighter's hits, aura and projectiles use its element.
const ELEMENTS = {
  fire: { main: '#ff8a1a', hot: '#ffe14d', core: '#ffffff', dark: '#d8340f' },
  volt: { main: '#29c6ff', hot: '#9ef0ff', core: '#ffffff', dark: '#1468ff' },
  shadow: { main: '#ff2a2a', hot: '#ff6a4d', core: '#0b0b0b', dark: '#6a0000' },
  spark: { main: '#8fe35a', hot: '#d6ff9a', core: '#ffffff', dark: '#3c9a2a' },
};
const ARCH_NAMES = ['Brawler', 'Tactician', 'Acrobat', 'Zoner'];

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function loadStats(name) {
  try {
    const s = JSON.parse(localStorage.getItem('stickfight.' + name));
    if (s) return Object.assign({ wins: 0, losses: 0, w: {} }, s);
  } catch (e) { /* storage unavailable */ }
  return { wins: 0, losses: 0, w: {} };
}
function saveStats(f) {
  try { localStorage.setItem('stickfight.' + f.name, JSON.stringify(f.stats)); } catch (e) { /* ignore */ }
}

class Fighter {
  constructor(world, cfg) {
    this.world = world;
    this.S = world.S;
    this.id = cfg.id;
    this.name = cfg.name;
    this.color = cfg.color;
    this.dark = shade(cfg.color, -0.38);
    this.light = shade(cfg.color, 0.55);
    this.outline = '#0a0a0a';
    // Very dark fighters get a faint light rim so they stay visible on dark desktops.
    this.rim = parseInt(cfg.color.slice(1, 3), 16) < 80;
    this.el = cfg.el || 'spark';
    this.elc = ELEMENTS[this.el];
    this.archName = cfg.arch;
    this.arch = ARCHETYPES[cfg.arch];
    this.team = cfg.team || 0;
    this.stats = loadStats(this.name);
    this.x = cfg.x; this.y = cfg.y; this.vx = 0; this.vy = 0;
    this.facing = chance(0.5) ? 1 : -1;
    this.onGround = false; this.plat = null;
    this.state = 'air'; this.stateT = 0;
    this.move = null; this.moveKey = null; this.moveT = 0; this.moveHit = null; this.hitWin = -1;
    this.hitList = new Set(); this.attackId = 0;
    this.hp = 100; this.meter = 0; this.hitstun = 0; this.hitstop = 0;
    this.combo = 0; this.juggle = 0; this.juggled = false; this.landLag = 0;
    this.invuln = 0; this.flash = 0; this.airJumps = 1; this.airAttacks = 0; this.airDashes = 1; this.adT = 0;
    this.dropT = 0; this.flip = 0; this.dashDir = 1; this.wallSide = 1;
    this.blockLow = false; this.blockStart = -99; this.hitType = 'high'; this.rollDir = 1;
    this.rag = null; this.getupFrom = null; this.rot = 0; this.oy = 42; this.lock = 'air';
    this.pose = copyPose({}, POSES.fall); this.tmpPose = copyPose({}, POSES.relaxed);
    this.local = null;
    this.pts = {};
    for (const j of JOINTS) this.pts[j] = { x: this.x, y: this.y };
    this.target = null; this.input = blankInput(); this.ai = null;
    this.trail = []; this.ghosts = []; this.hist = []; this.bubble = null; this.walkPh = 0;
    this.grabbed = null; this.grabber = null; this.lastHitBy = null; this.recentDmgT = 0;
    // Arsenal: held weapon, eaten power, grenades, giant form, frozen timer.
    this.weapon = null; this.ability = cfg.ability || null; this.abilityCD = 0; this.castAb = null; this.castTarget = null;
    this.grenades = 0; this.giantT = 0; this.frozenT = 0;
    this.skeleton();
  }

  get level() { return 1 + Math.floor(this.stats.wins / 3); }

  setState(s, force) {
    if (this.state === s && !force) return;
    this.state = s;
    this.stateT = 0;
    if (ACTIONABLE.has(s)) { this.combo = 0; this.juggle = 0; this.juggled = false; }
  }

  say(text, t = 150) { this.bubble = { text, t }; }

  learn(key, r) {
    if (!key) return;
    const w = this.stats.w[key] == null ? 1 : this.stats.w[key];
    this.stats.w[key] = clamp(w + 0.08 * r, 0.25, 3);
  }

  phase() {
    const m = this.move;
    if (!m) return null;
    const t = this.moveT, h = m.hits;
    return t < h[0][0] ? 'startup' : t <= h[h.length - 1][1] ? 'active' : 'recovery';
  }

  // Properties of the hit window currently out (per-hit overrides for multi-hit moves).
  hitProps() {
    const m = this.move;
    const o = m.hitData && m.hitData[this.hitWin];
    return o ? Object.assign({}, m, o) : m;
  }

  recordHist() {
    const h = this.hist;
    h.push({
      x: this.x, y: this.y, vx: this.vx, vy: this.vy, state: this.state, onGround: this.onGround,
      move: this.moveKey, moveT: this.moveT, phase: this.phase(), attackId: this.attackId,
      blockLow: this.blockLow,
    });
    if (h.length > 40) h.shift();
  }

  update() {
    this.recordHist();
    if (this.hitstop > 0) { this.hitstop--; this.skeleton(); return; }
    this.stateT++;
    if (this.abilityCD > 0) this.abilityCD--;
    if (this.giantT > 0) this.giantT--;
    // Buddha form scales the whole fighter up.
    const targetS = this.world.S * (this.giantT > 0 ? 1.75 : 1);
    if (Math.abs(this.S - targetS) > 0.001) this.S = lerp(this.S, targetS, 0.1);
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.dropT > 0) this.dropT--;
    if (this.recentDmgT > 0) this.recentDmgT--;
    if (this.bubble && --this.bubble.t <= 0) this.bubble = null;
    if (this.rag) { this.ragStep(); this.updateTrail(); return; }
    const inp = this.input;
    const st = this.state, S = this.S;
    if (ACTIONABLE.has(st)) this.groundControl(inp);
    else switch (st) {
      case 'air': this.airControl(inp); break;
      case 'attack': this.attackUpdate(inp); break;
      case 'hitstun':
        this.hitstun--;
        if (this.onGround) this.vx *= 0.85;
        if (this.hitstun <= 0) this.setState(this.onGround ? 'idle' : 'air');
        break;
      case 'blockstun':
        this.hitstun--;
        this.vx *= 0.8;
        if (this.hitstun <= 0) { this.setState('block'); this.blockStart = -99; }
        break;
      case 'land':
        this.vx *= 0.7;
        if (this.stateT >= this.landLag) this.setState('idle');
        break;
      case 'getup':
        this.vx = 0;
        if (this.stateT >= 16) { this.getupFrom = null; this.setState('idle'); }
        break;
      case 'roll': {
        const D = 24, t = this.stateT;
        this.vx = this.rollDir * 6.5 * S * (1 - (t / D) * 0.6);
        this.invuln = t < 17 ? 2 : 0;
        this.rot = (t / D) * TAU * (this.rollDir === this.facing ? 1 : -1);
        if (t >= D) { this.rot = 0; this.setState('idle'); }
        break;
      }
      case 'dash': {
        const t = this.stateT;
        this.vx = this.dashDir * 12.5 * S * (1 - (t / DASH_T) * 0.55);
        if (t % 2 === 0) this.world.speedLine(this);
        // Dash attacks: cancel the dash into any ground move after a few frames.
        if (t >= 4 && inp.attack && this.tryAttack(inp.attack)) { this.vx *= 0.7; return this.finishUpdate(); }
        if (t >= 4 && inp.jump) { this.doJump(this.dashDir, 1.05); break; }
        if (t >= DASH_T) this.setState(inp.move === this.dashDir ? 'run' : 'idle');
        break;
      }
      case 'backflip': {
        const t = this.stateT;
        this.invuln = t < 14 ? 2 : 0;
        this.rot = -Math.min(1, t / BACKFLIP_T) * TAU;
        if (inp.attack && t > 10 && this.tryAttack(inp.attack)) return this.finishUpdate();
        if (!this.onGround && t > BACKFLIP_T + 20) this.setState('air');
        break;
      }
      case 'wall': this.wallControl(inp); break;
      case 'cast': {
        const ab = this.castAb;
        this.vx *= 0.8;
        if (this.stateT < ab.cast && ab.charge) ab.charge(this, this.world);
        if (this.stateT === ab.cast) ab.fire.call(ab, this, this.world, this.castTarget);
        if (this.stateT >= ab.cast + ab.after) { this.castAb = null; this.setState(this.onGround ? 'idle' : 'air'); }
        break;
      }
      case 'frozen':
        this.vx *= 0.85;
        if (--this.frozenT <= 0) { shatterIce(this.world, this); this.setState(this.onGround ? 'idle' : 'air'); }
        break;
      case 'grabbing':
        this.vx = 0;
        if (this.stateT === 22) this.throwVictim();
        if (this.stateT >= 34) this.setState('idle');
        break;
      case 'grabbed':
        this.followGrabber();
        this.updatePose();
        this.skeleton();
        return;
    }
    this.finishUpdate();
  }

  finishUpdate() {
    this.physics();
    this.updatePose();
    this.skeleton();
    this.updateTrail();
  }

  groundControl(inp) {
    const S = this.S;
    if (inp.face) this.facing = inp.face;
    if (inp.attack && this.tryAttack(inp.attack)) return;
    if (inp.roll) { this.startRoll(inp.roll); return; }
    if (inp.dash) { this.startDash(inp.dash); return; }
    if (inp.backflip) { this.startBackflip(); return; }
    if (inp.jump) { this.doJump(inp.move); return; }
    if (inp.drop && this.plat && !this.plat.floor) {
      this.dropT = 14; this.onGround = false; this.plat = null; this.y += 2;
      this.setState('air');
      return;
    }
    if (inp.block) {
      if (this.state !== 'block') { this.blockStart = this.world.tick; this.setState('block'); }
      this.blockLow = !!inp.crouch;
      this.vx *= 0.6;
      return;
    }
    if (inp.crouch) { this.setState('crouch'); this.vx *= 0.6; return; }
    if (inp.pet && !inp.move) { this.setState(inp.pet); this.vx *= 0.7; return; }
    if (inp.move) {
      const sp = (inp.run ? RUN : WALK) * S * (inp.speed || 1);
      this.vx = lerp(this.vx, inp.move * sp, 0.3 * this.traction());
      this.setState(inp.run ? 'run' : 'walk');
      if (inp.run || !inp.face) this.facing = inp.move;
    } else {
      this.vx *= 1 - 0.3 * this.traction();
      this.setState('idle');
    }
  }

  airControl(inp) {
    const S = this.S;
    if (this.adT > 0) {
      this.adT--;
      if (this.adT % 2 === 0) this.world.speedLine(this);
      if (inp.attack && this.adT < 6 && this.tryAttack(inp.attack)) return;
      return;
    }
    if (inp.attack && this.tryAttack(inp.attack)) return;
    if (inp.airdash && this.airDashes > 0) { this.startAirDash(inp.airdash); return; }
    if (inp.jump && this.airJumps > 0 && this.vy > -4 * S) { this.doJump(inp.move, 0.85, true); return; }
    if (inp.move) this.vx = clamp(this.vx + inp.move * 0.32 * S, -RUN * S, RUN * S);
    else this.vx *= 0.99;
    if (inp.face) this.facing = inp.face;
    if (this.flip > 0) {
      this.flip++;
      this.rot = Math.min(1, this.flip / 26) * TAU;
      if (this.flip > 26) { this.flip = 0; this.rot = 0; }
    }
  }

  wallControl(inp) {
    const S = this.S, w = this.world;
    this.vx = 0;
    this.vy = Math.min(this.vy + 0.18 * S, 2.2 * S);
    this.facing = this.wallSide;
    if (this.stateT % 6 === 0 && this.vy > 1 * S) w.dust(this.x - this.wallSide * 5 * S, this.y - 5 * S, 1);
    if (inp.jump) { this.wallJump(); return; }
    if (inp.attack) {
      const key = MOVES[inp.attack] && MOVES[inp.attack].air ? inp.attack : 'wallDive';
      this.vx = this.wallSide * 2 * S;
      if (this.tryAttack(key)) { this.vy = -2 * S; return; }
    }
    if (this.stateT > WALL_MAX_T || inp.move === this.wallSide) { this.vx = this.wallSide * 1.5 * S; this.setState('air'); }
  }

  wallJump() {
    const S = this.S;
    this.vy = -JUMP_V * 1.02 * S;
    this.vx = this.wallSide * 6.8 * S;
    this.facing = this.wallSide;
    this.airJumps = 1; this.airDashes = 1; this.airAttacks = 0;
    this.flip = 1;
    this.setState('air', true);
    this.world.ring(this.x - this.wallSide * 6 * S, this.y - 30 * S, '#ffffff', 22 * S);
    this.world.dust(this.x - this.wallSide * 6 * S, this.y - 10 * S, 4);
  }

  tryAttack(key) {
    const m = MOVES[key];
    if (!m) return false;
    if (m.wpn) {
      const W = this.weapon && WEAPONS[this.weapon.kind];
      if (!W || (key === 'airslash' ? W.move === 'shoot' : W.move !== key)) return false;
    }
    if (!!m.air === this.onGround) return false;
    if (m.cost && this.meter < m.cost) return false;
    if (m.air && this.airAttacks >= 2) return false;
    this.startMove(key);
    return true;
  }

  startMove(key) {
    const m = MOVES[key];
    this.move = m; this.moveKey = key; this.moveT = 0; this.moveHit = null; this.hitWin = -1;
    this.hitList.clear(); this.attackId++;
    if (this.ai) { this.ai.recent.push(key); if (this.ai.recent.length > 4) this.ai.recent.shift(); }
    if (m.air) this.airAttacks++;
    this.flip = 0; this.adT = 0;
    if (m.cost) this.meter -= m.cost;
    this.setState('attack', true);
    this.trail.length = 0;
    if (m.superMove) this.world.superFlash(this, ULT_DEFAULT.name, this.elc.main);
  }

  attackUpdate(inp) {
    const m = this.move, S = this.S, w = this.world;
    const t = ++this.moveT;
    if (t === m.s + 1) {
      if (m.step) this.vx += this.facing * m.step * S;
      if (m.hop && this.onGround) { this.vy = m.hop * S; this.onGround = false; this.plat = null; }
      if (m.projectile) w.spawnProjectile(this);
      if (m.dmg >= 12) w.whoosh(this);
    }
    if (m.dashV && t <= m.s) { this.vx = this.facing * m.dashV * S; if (t % 2 === 0) w.speedLine(this); }
    if (m.projectile && t < m.s) w.charge(this, this.pts.h1);
    if (m.pound) {
      if (t <= m.s) { this.vy = Math.min(this.vy, 0) * 0.7; this.vx *= 0.85; this.rot += 0.45; }
      else { this.vy = 17 * S; this.vx = 0; this.rot = 0; }
    }
    if (m.spin) this.rot += m.spin * (t > m.s ? 1 : 0.3);
    // Which hit window (if any) is out this frame.
    let win = -1;
    for (let i = 0; i < m.hits.length; i++) if (t >= m.hits[i][0] && t <= m.hits[i][1]) { win = i; break; }
    if (win !== this.hitWin) { this.hitWin = win; if (win >= 0) this.hitList.clear(); }
    const active = win >= 0;
    if (m.slideV && active) this.vx = this.facing * m.slideV * S * (1 - (t - m.s) / (m.a + 6));
    if (m.superMove && active) this.vx = this.facing * 1.6 * S;
    if (m.dive && active) { this.vx = this.facing * m.dive[0] * S; this.vy = m.dive[1] * S; }
    if (m.quake && t === m.s + 1 && this.onGround) {
      // Hammer smash cracks the ground.
      const tip = this.weaponTip() || this.pts.h1;
      w.crack(tip.x, this.y, 0, 14); w.dust(tip.x, this.y, 8); w.shake = Math.max(w.shake, 9);
      w.fx.push({ type: 'wave', x: tip.x, y: this.y, r: 60 * S, life: 14, max: 14, color: '#ffffff' });
    }
    if (active && !m.projectile) {
      w.checkHit(this);
      if (this.move && this.ai && this.ai.angry > 0) w.checkCursorHit(this);
    }
    if (!this.move) return; // a grab, clash or parry ended the move
    if (this.moveHit && t > m.s) {
      if (inp.attack && inp.attack !== this.moveKey && m.cancels.includes(inp.attack) && this.tryAttack(inp.attack)) return;
      if (inp.jump && this.moveHit === 'hit' && m.cancels.includes('jc') && t > m.s + 2) {
        this.move = null;
        this.doJump(inp.move || this.facing, 1.12);
        return;
      }
    }
    if (t >= m.s + m.a + m.r || (m.superMove && t === m.hits[0][1] + 1 && !this.moveHit)) { this.endMove(); return; }
    if (this.onGround && !m.slideV) this.vx *= 0.8;
  }

  endMove() {
    if (!this.moveHit && this.move) this.learn(this.moveKey, -0.12);
    this.move = null;
    this.rot = 0;
    this.setState(this.onGround ? 'idle' : 'air', true);
  }

  doJump(dir, mult = 1, air = false) {
    const S = this.S;
    this.vy = -JUMP_V * S * mult;
    if (dir) this.vx = dir * Math.max(Math.abs(this.vx), WALK * 1.5 * S);
    this.onGround = false; this.plat = null;
    if (air) {
      this.airJumps--; this.flip = 1;
      this.world.ring(this.x, this.y, '#ffffff', 18 * S);
    }
    this.setState('air', true);
    this.world.dust(this.x, this.y, 3);
  }

  startRoll(dir) { this.rollDir = dir; this.setState('roll', true); }

  // Grip on the ground: ice platforms and frozen floors are slippery.
  traction() {
    if (!this.onGround) return 1;
    return (this.plat && this.plat.ice) || mapIceAt(this.world, this.x, this.y) ? 0.12 : 1;
  }

  // ---- ultimates ---------------------------------------------------------
  useUltimate(key, target) {
    if (this.meter < 100 || !ACTIONABLE.has(this.state) || !this.onGround) return false;
    if (key === 'flurry') return this.tryAttack('super');
    const u = ULTS[key];
    if (!u) return false;
    this.meter = 0;
    this.castAb = u;
    this.castTarget = target || null;
    this.move = null;
    if (target) this.facing = sign(target.x - this.x) || this.facing;
    this.setState('cast', true);
    this.world.superFlash(this, u.name, u.color);
    return true;
  }

  // ---- arsenal -----------------------------------------------------------
  useAbility(target) {
    const ab = ABILITIES[this.ability];
    if (!ab || this.abilityCD > 0) return false;
    this.castAb = ab;
    this.castTarget = target || null;
    this.abilityCD = ab.cd;
    this.move = null;
    if (target) this.facing = sign(target.x - this.x) || this.facing;
    this.setState('cast', true);
    const w = this.world;
    w.text(this.pts.head.x, this.pts.head.y - 30 * this.S, ab.call, ab.color, 16);
    w.ring(this.pts.neck.x, this.pts.neck.y, ab.color, 50 * w.S);
    return true;
  }

  throwGrenade(target) {
    if (!this.grenades) return false;
    this.grenades--;
    const w = this.world, S = w.S, g = GRAV * S, T = 42;
    this.facing = sign(target.x - this.x) || this.facing;
    const h = this.pts.h1;
    const dx = target.x - h.x, dy = target.y - 10 * S - h.y;
    spawnItem(w, 'grenade', h.x, h.y, { vx: dx / T, vy: (dy - 0.5 * g * T * T) / T, fuse: 70, thrower: this });
    this.castAb = { cast: 1, after: 12, pose: POSES.throwPose, fire() {} };
    this.setState('cast', true);
    return true;
  }

  weaponTip() {
    if (!this.weapon) return null;
    const W = WEAPONS[this.weapon.kind], h = this.pts.h1, e = this.pts.e1;
    const dx = h.x - e.x, dy = h.y - e.y, n = Math.hypot(dx, dy) || 1;
    return { x: h.x + (dx / n) * W.len * this.S, y: h.y + (dy / n) * W.len * this.S };
  }

  dropWeapon(vx = 0, vy = -4) {
    if (!this.weapon) return;
    const h = this.pts.h1;
    spawnItem(this.world, this.weapon.kind, h.x, h.y, { vx, vy: vy * this.world.S, uses: this.weapon.uses });
    this.weapon = null;
  }

  breakWeapon() {
    const w = this.world, tip = this.weaponTip() || this.pts.h1;
    for (let i = 0; i < 10; i++) w.fx.push({ type: 'sq', x: tip.x, y: tip.y, vx: rand(-4, 4) * w.S, vy: rand(-5, 1) * w.S, size: 4 * w.S, life: 22, max: 22, color: '#dfe6ee' });
    w.text(tip.x, tip.y - 14 * w.S, 'BROKE!', '#dfe6ee', 8);
    this.weapon = null;
  }

  startDash(dir) {
    this.dashDir = dir;
    this.facing = dir;
    this.setState('dash', true);
    this.world.dust(this.x, this.y, 4);
  }

  startAirDash(dir) {
    this.airDashes--;
    this.adT = 10;
    this.vx = dir * 11.5 * this.S;
    this.vy = -0.5 * this.S;
    this.facing = dir;
    this.flip = 0; this.rot = 0;
    this.world.ring(this.x - dir * 10 * this.S, this.y - 45 * this.S, '#ffffff', 22 * this.S);
  }

  startBackflip() {
    const S = this.S;
    this.vy = -8.5 * S;
    this.vx = -this.facing * 4.8 * S;
    this.onGround = false; this.plat = null;
    this.setState('backflip', true);
    this.world.dust(this.x, this.y, 3);
  }

  physics() {
    const w = this.world, S = this.S;
    const prevY = this.y;
    if (!this.onGround) {
      let g = GRAV * S * w.gravMul;
      if (this.state === 'hitstun') g *= 0.8;
      if (this.state === 'attack' && this.move && (this.move.dive || this.move.pound) && this.phase() === 'active') g = 0;
      if (this.adT > 0 || this.state === 'wall') g = 0;
      this.vy = Math.min(this.vy + g, MAX_FALL * S);
    }
    this.x += this.vx;
    this.y += this.vy;
    if (this.y > w.floorY && this.vy < 0) this.y = w.floorY; // never rise up from under the floor
    const L = w.left + 18 * S, R = w.right - 18 * S; // keep limbs, not just the hip, off the walls
    if (this.x < L || this.x > R) {
      const side = this.x < L ? 1 : -1;
      this.x = this.x < L ? L : R;
      if (this.state === 'hitstun' && Math.abs(this.vx) > 6 * S) {
        // Wall bounce.
        this.vx = side * Math.abs(this.vx) * 0.45;
        w.wallHit(this.x - side * 4 * S, this.y - 45 * S, side, 10);
      } else if (!this.onGround && (this.state === 'air' || this.state === 'backflip') && this.vy > -6 * S && this.stateT > 3 &&
                 (this.input.move === -side || this.input.wall)) {
        this.wallSide = side;
        this.vy = Math.min(this.vy, 1 * S);
        this.setState('wall', true);
        this.flip = 0; this.rot = 0;
        w.dust(this.x - side * 5 * S, this.y - 20 * S, 3);
      } else this.vx = 0;
    }
    if (this.onGround) {
      const p = this.plat;
      if (!p) this.onGround = false;
      else if (p.floor) this.y = w.floorY;
      else if (p.dead || this.x < p.x1 - 3 * S || this.x > p.x2 + 3 * S) {
        this.onGround = false; this.plat = null;
        if (ACTIONABLE.has(this.state) || this.state === 'land' || this.state === 'dash') this.setState('air');
      } else this.y = p.yAt(this.x);
      if (!this.onGround) this.vy = 0;
    } else if (this.vy >= 0) {
      const p = w.findLanding(this.x, prevY, this.y, this.dropT > 0);
      if (p) {
        this.y = p.floor ? w.floorY : p.yAt(this.x);
        this.land(p);
      }
    }
  }

  land(p) {
    const S = this.S, wasVy = this.vy, w = this.world;
    if (p.pad && this.state !== 'grabbed') {
      // Jump pad / mushroom: launch straight back up.
      this.vy = -p.pad * this.world.S; this.onGround = false; this.plat = null;
      this.airJumps = 1; this.airDashes = 1; this.airAttacks = 0;
      if (this.state === 'hitstun' && this.juggled) { this.vy *= 0.7; return; }
      if (ACTIONABLE.has(this.state) || this.state === 'air' || this.state === 'land' || this.state === 'backflip') { this.setState('air', true); this.flip = 1; }
      w.ring(this.x, this.y, '#ffd21a', 30 * S); w.dust(this.x, this.y, 4);
      return;
    }
    this.onGround = true; this.plat = p; this.vy = 0;
    this.airJumps = 1; this.airAttacks = 0; this.airDashes = 1; this.adT = 0; this.flip = 0;
    this.rot = 0;
    if (this.state === 'hitstun' && this.juggled) {
      // Juggled fighters crumple when they hit the ground.
      this.startRagdoll(this.vx * 0.6, -wasVy * 0.25, -0.06 * sign(this.vx));
      return;
    }
    if (this.state === 'attack' && this.move && this.move.pound) {
      this.move = null; this.landLag = 14; this.setState('land', true);
      w.shockwave(this);
      return;
    }
    if (this.state === 'attack' && this.move && this.move.air) {
      this.move = null; this.landLag = 7; this.setState('land', true);
    } else if (this.state === 'air' || this.state === 'backflip' || this.state === 'wall') {
      this.landLag = wasVy > 9 * S ? 6 : 3; this.setState('land', true);
    }
    if (wasVy > 6 * S) w.dust(this.x, this.y, wasVy > 12 * S ? 8 : 4);
    if (wasVy > 13 * S) w.ring(this.x, this.y, '#ffffff', 30 * S);
    if (!p.floor && p.kind === 'win' && p.ref.title && !w.inCombat && chance(0.12)) {
      const t = p.ref.title.length > 26 ? p.ref.title.slice(0, 24) + '…' : p.ref.title;
      this.say(pick(LINES.window).replace('%s', t), 200);
    }
  }

  updatePose() {
    const st = this.state, w = this.world, tp = this.tmpPose;
    const fight = w.inCombat && this.target;
    const t = w.tick + this.id * 37;
    let target = POSES.relaxed, rate = 0.22;
    this.lock = this.onGround ? 'feet' : 'air';
    switch (st) {
      case 'idle': {
        copyPose(tp, fight ? POSES.stance : POSES.relaxed);
        const b = Math.sin(t * 0.08);
        tp.a1 += 0.05 * b; tp.a2 += 0.05 * b; tp.lean += 0.025 * b;
        target = tp; rate = 0.2;
        break;
      }
      case 'walk':
        this.walkPh += Math.abs(this.vx) / (6 * this.S);
        target = walkPose(tp, this.walkPh, fight); rate = 0.3;
        break;
      case 'run':
        this.walkPh += Math.abs(this.vx) / (9 * this.S);
        target = runPose(tp, this.walkPh); rate = 0.35;
        break;
      case 'dash': target = POSES.dash; rate = 0.5; break;
      case 'crouch': target = POSES.crouch; rate = 0.35; break;
      case 'block': case 'blockstun': target = this.blockLow ? POSES.blockLow : POSES.block; rate = 0.55; break;
      case 'attack': {
        const m = this.move, ph = this.phase();
        if (ph === 'startup') { target = m.wind; rate = 0.45; }
        else if (ph === 'active') {
          let wi = this.hitWin;
          if (wi < 0) for (let i = 0; i < m.hits.length; i++) if (this.moveT > m.hits[i][1]) wi = i;
          target = m.winPoses ? m.winPoses[Math.max(0, wi)] : m.hit;
          rate = 0.7;
        } else {
          const rt = (this.moveT - m.hits[m.hits.length - 1][1]) / m.r;
          const last = m.winPoses ? m.winPoses[m.winPoses.length - 1] : m.hit;
          target = rt < 0.45 ? last : (this.onGround ? POSES.stance : POSES.fall);
          rate = rt < 0.45 ? 0.5 : 0.2;
        }
        break;
      }
      case 'hitstun':
        if (this.juggled && !this.onGround) { target = POSES.tumble; this.rot -= 0.14; }
        else target = this.hitType === 'gut' ? POSES.hitGut : POSES.hitHigh;
        rate = 0.5;
        break;
      case 'air':
        target = this.adT > 0 ? POSES.dash : this.vy < 0 ? POSES.jump : POSES.fall;
        rate = this.adT > 0 ? 0.5 : 0.18;
        break;
      case 'wall': target = POSES.wall; rate = 0.4; break;
      case 'cast': {
        const ab = this.castAb;
        target = this.stateT < ab.cast ? ab.pose : (ab.pose2 || ab.pose);
        rate = 0.35;
        break;
      }
      case 'frozen': target = this.pose; rate = 0; break;
      case 'backflip': target = POSES.jump; rate = 0.4; break;
      case 'land': target = POSES.land; rate = 0.5; break;
      case 'roll': target = POSES.roll; rate = 0.5; break;
      case 'getup': target = POSES.stance; rate = 0.3; break;
      case 'grabbing': target = this.stateT < 14 ? POSES.grab : POSES.throwPose; rate = 0.35; break;
      case 'grabbed': target = POSES.hitHigh; rate = 0.4; this.lock = 'air'; break;
      case 'sit': target = POSES.sit; this.lock = 'hip'; rate = 0.15; break;
      case 'sleep': target = POSES.sleep; this.lock = 'hip'; rate = 0.05; break;
      case 'wave':
        copyPose(tp, POSES.relaxed);
        tp.a1 = 2.6; tp.e1 = 0.5 + Math.sin(t * 0.25) * 0.45;
        target = tp; rate = 0.3;
        break;
      case 'taunt':
        copyPose(tp, POSES.stance);
        tp.a1 = 1.3; tp.e1 = 1.0 + Math.sin(t * 0.3) * 0.6; tp.lean = -0.05;
        target = tp; rate = 0.3;
        break;
      case 'victory':
        copyPose(tp, POSES.victory);
        tp.e1 += Math.sin(t * 0.2) * 0.15;
        tp.a2 = 0.15 + Math.max(0, Math.sin(t * 0.1)) * 0.6;
        target = tp; rate = 0.2;
        break;
    }
    lerpPose(this.pose, this.pose, target, rate);
    const m = this.move;
    const spinning = st === 'roll' || st === 'backflip' || (st === 'air' && this.flip > 0) || (st === 'hitstun' && this.juggled) ||
      (st === 'attack' && m && (m.spin || (m.pound && this.moveT <= m.s)));
    if (!spinning) this.rot *= 0.5;
  }

  skeleton() {
    const pts = this.pts;
    if (this.rag) {
      const r = this.rag.p;
      for (let i = 0; i < 11; i++) { const q = pts[JOINTS[i]]; q.x = r[i].x; q.y = r[i].y; }
      return;
    }
    const L = (this.local = poseLocal(this.pose, this.facing, this.rot, this.local));
    let oy;
    if (this.lock === 'feet') oy = L.low;
    else if (this.lock === 'hip') oy = 0;
    else oy = lerp(this.oy, BODY.thigh + BODY.shin, 0.2);
    this.oy = oy;
    const S = this.S;
    for (let i = 0; i < 11; i++) {
      const q = pts[JOINTS[i]];
      q.x = this.x + L.x[i] * S;
      q.y = this.y + (L.y[i] - oy) * S;
    }
    if (this.state === 'getup' && this.getupFrom) {
      const k = ease(Math.min(1, this.stateT / 13));
      for (let i = 0; i < 11; i++) {
        const q = pts[JOINTS[i]], f = this.getupFrom[i];
        q.x = lerp(f.x, q.x, k); q.y = lerp(f.y, q.y, k);
      }
    }
  }

  updateTrail() {
    const m = this.move;
    if (this.state === 'attack' && m && m.joint && !m.projectile && this.moveT >= m.hits[0][0] - 2 && this.phase() !== 'recovery') {
      const p = this.hitWin >= 0 ? this.hitProps() : m;
      const armed = this.weapon && WEAPONS[this.weapon.kind].len > 20 && (p.joint === 'h1' || p.wpn);
      const j = armed ? this.weaponTip() : this.pts[p.joint];
      this.trail.push({ x: j.x, y: j.y });
      if (this.trail.length > 8) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    const fast = this.state === 'roll' || this.state === 'run' || this.state === 'dash' || this.state === 'backflip' ||
      this.flip > 0 || this.adT > 0 || (m && (m.dashV || m.slideV || m.spin || m.dive || m.pound)) ||
      (this.rag && this.rag.thrower && this.rag.t < 40);
    if (fast && this.world.tick % 3 === 0) {
      this.ghosts.push({ pts: JOINTS.map((j) => ({ x: this.pts[j].x, y: this.pts[j].y })), life: 12 });
    }
    for (const g of this.ghosts) g.life--;
    while (this.ghosts.length && this.ghosts[0].life <= 0) this.ghosts.shift();
  }

  // ---- grabs -------------------------------------------------------------
  grabVictim(d) {
    this.grabbed = d; d.grabber = this;
    d.move = null; d.facing = -this.facing;
    d.setState('grabbed', true);
    this.move = null;
    this.setState('grabbing', true);
  }

  followGrabber() {
    const g = this.grabber, S = this.S;
    if (!g || g.state !== 'grabbing' || g.grabbed !== this) {
      this.grabber = null;
      this.setState('air', true);
      return;
    }
    const lift = g.stateT < 14 ? 4 : 30;
    this.x = g.x + g.facing * (g.stateT < 14 ? 20 : 10) * S;
    this.y = g.y - lift * S;
    this.vx = this.vy = 0;
    this.onGround = false; this.plat = null;
  }

  throwVictim() {
    const d = this.grabbed, w = this.world, S = this.S;
    this.grabbed = null;
    if (!d || d.grabber !== this) return;
    d.grabber = null;
    w.damage(d, MOVES.grab.dmg, this);
    w.impact(d.pts.neck.x, d.pts.neck.y, this.facing, 12, this.light);
    w.shake = Math.max(w.shake, 8);
    d.startRagdoll(this.facing * 10 * S, -8 * S, this.facing * 0.2, d.hp > 0 ? 'ragdoll' : 'ko');
    d.rag.thrower = this;
    if (d.hp <= 0) w.onKO(d, this);
  }

  // ---- ragdoll -----------------------------------------------------------
  startRagdoll(vx, vy, spin = 0, state = 'ragdoll') {
    const hip = this.pts.hip, p = [];
    for (let i = 0; i < 11; i++) {
      const q = this.pts[JOINTS[i]];
      const rx = q.x - hip.x, ry = q.y - hip.y;
      const ux = vx - spin * ry, uy = vy + spin * rx;
      p.push({ x: q.x, y: q.y, ox: q.x - ux, oy: q.y - uy, touch: false });
    }
    const cons = [];
    for (const [a, b] of BONES.concat([[0, 2]])) {
      cons.push([a, b, Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y) || 1]);
    }
    if (this.grabbed) { const v = this.grabbed; this.grabbed = null; v.grabber = null; }
    if (this.grabber) { this.grabber.grabbed = null; this.grabber = null; }
    // Big hits can knock the weapon out of your hand; a K.O. always does.
    if (this.weapon && state !== 'held' && (state === 'ko' || chance(0.3))) this.dropWeapon(vx * 0.5, -6);
    this.castAb = null; this.frozenT = 0;
    this.rag = { p, cons, t: 0, still: 0, slamT: 0, pin: -1, thrower: null, hitSet: new Set() };
    this.move = null; this.onGround = false; this.plat = null;
    this.rot = 0; this.flip = 0; this.hitstun = 0; this.juggled = false; this.adT = 0;
    this.setState(state, true);
  }

  ragStep() {
    const r = this.rag, w = this.world, S = this.S, g = GRAV * S * w.gravMul;
    r.t++;
    if (r.slamT > 0) r.slamT--;
    const L = w.left, R = w.right, F = w.floorY;
    let maxV = 0;
    for (let i = 0; i < 11; i++) {
      const p = r.p[i];
      let vx = (p.x - p.ox) * 0.992, vy = (p.y - p.oy) * 0.992 + g;
      const rr = i === 0 ? BODY.headR * S : 2 * S;
      p.ox = p.x; p.oy = p.y;
      if (p.x + vx < L + rr || p.x + vx > R - rr) {
        if (Math.abs(vx) > 9 * S && i <= 2) this.slam(Math.abs(vx), p.x, p.y, p.x < (L + R) / 2 ? 1 : -1);
        vx = -vx * 0.45;
      }
      if (p.y + vy > F - rr) {
        if (vy > 9 * S && i <= 2) this.slam(vy, p.x, F, 0);
        vy = -vy * 0.3; vx *= 0.75;
      }
      p.x += vx; p.y += vy;
    }
    if (r.pin >= 0) {
      const c = w.cursor, p = r.p[r.pin];
      p.x = c.x; p.y = c.y; p.ox = c.x - c.vx; p.oy = c.y - c.vy;
    }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, len] of r.cons) {
        const A = r.p[a], B = r.p[b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const wa = a === r.pin ? 0 : 1, wb = b === r.pin ? 0 : 1, sum = wa + wb;
        if (!sum) continue;
        const k = (d - len) / d / sum;
        A.x += dx * k * wa; A.y += dy * k * wa;
        B.x -= dx * k * wb; B.y -= dy * k * wb;
      }
      for (let i = 0; i < 11; i++) this.ragCollide(r.p[i], i);
    }
    let low = -1e9;
    for (const p of r.p) {
      if (p.touch) p.ox = p.x - (p.x - p.ox) * 0.8;
      if (p.y > low) low = p.y;
      maxV = Math.max(maxV, Math.abs(p.x - p.ox) + Math.abs(p.y - p.oy));
    }
    this.x = r.p[2].x;
    this.y = low;
    r.still = maxV < 0.7 * S ? r.still + 1 : 0;
    if (this.state === 'ragdoll' && r.t > 26 && (r.still > 6 || r.t > 150)) this.getUp();
    else this.skeleton();
  }

  ragCollide(p, i) {
    const w = this.world, S = this.S;
    const rr = i === 0 ? BODY.headR * S : 2 * S;
    p.touch = false;
    if (p.x < w.left + rr) p.x = w.left + rr;
    if (p.x > w.right - rr) p.x = w.right - rr;
    if (p.y > w.floorY - rr) { p.y = w.floorY - rr; p.touch = true; }
    for (const pl of w.platforms) {
      if (p.x < pl.x1 || p.x > pl.x2) continue;
      const yp = pl.yAt(p.x) - rr;
      if (p.oy <= yp + 1 && p.y > yp) {
        p.y = yp; p.touch = true;
        if (pl.pad) p.oy = p.y + pl.pad * S * 0.7; // ragdolls bounce off jump pads too
      }
    }
  }

  slam(speed, x, y, side) {
    const r = this.rag, w = this.world, S = this.S;
    if (r.slamT > 0 || r.pin >= 0) return;
    r.slamT = 20;
    const power = speed / S;
    if (side) w.wallHit(x, y, side, Math.min(16, power));
    else {
      w.impact(x, y, Math.random() < 0.5 ? 1 : -1, Math.min(16, power), '#ffffff');
      if (power > 13) w.crack(x, y, 0, power);
    }
    w.dust(x, y, 6);
    w.shake = Math.max(w.shake, Math.min(14, power * 0.8));
    if (w.phase === 'fight' && this.hp > 0) {
      const by = r.thrower && r.thrower.name ? r.thrower : null;
      w.damage(this, Math.min(12, (power - 9) * 0.9 + 2), by);
      if (this.hp <= 0) { this.state = 'ko'; w.onKO(this, by); }
    }
  }

  getUp() {
    const r = this.rag, w = this.world, S = this.S;
    const hip = r.p[2];
    this.x = clamp(hip.x, w.left + 18 * S, w.right - 18 * S);
    // Search from the hip, not the lowest limb: a leg dangling off a window edge
    // must not make us stand up on the floor far below.
    const p = w.surfaceBelow(this.x, hip.y - 6 * S);
    const py = p.floor ? w.floorY : p.yAt(this.x);
    this.vx = 0; this.vy = 0;
    this.rag = null;
    if (this.target) this.facing = sign(this.target.x - this.x) || this.facing;
    if (py - hip.y > 40 * S) {
      // Hanging off an edge: drop down instead of teleporting.
      this.y = hip.y + (BODY.thigh + BODY.shin) * S;
      this.onGround = false; this.plat = null;
      copyPose(this.pose, POSES.fall);
      this.setState('air', true);
      this.skeleton();
      return;
    }
    this.y = py;
    this.plat = p; this.onGround = true;
    this.getupFrom = r.p.map((q) => ({ x: q.x, y: q.y }));
    this.invuln = 20;
    copyPose(this.pose, POSES.crouch);
    this.setState('getup', true);
    this.skeleton();
  }
}
