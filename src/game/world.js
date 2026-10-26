'use strict';
/* The world: screen bounds, platforms (window title bars + drawn lines), hit
 * resolution, clashes, projectiles, effects, sandbox tools, cursor interaction,
 * team coordination and the round loop. */

class Plat {
  constructor(id, x1, y1, x2, y2, kind, ref) {
    if (x1 > x2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }
    Object.assign(this, { id, x1, y1, x2, y2, kind, ref, dead: false, floor: false });
  }
  yAt(x) {
    if (this.x2 === this.x1) return this.y1;
    return this.y1 + (this.y2 - this.y1) * clamp((x - this.x1) / (this.x2 - this.x1), 0, 1);
  }
}

const TEAM_COLORS = ['#ff4d4d', '#3d8bff'];
const TEAM_NAMES = ['RED TEAM', 'BLUE TEAM'];
const MAX_FIGHTERS = 12;

class World {
  constructor(opts) {
    this.size = opts.size || 90;
    this.S = this.size / 100;
    this.fighters = [];
    this.projectiles = [];
    this.items = [];
    this.hazards = [];
    this.itemId = 0;
    this.map = null;
    this.mapKey = null;
    this.gravMul = 1;
    this.useWindows = true;
    this.powerTags = true;
    this.fx = [];
    this.decals = [];
    this.winPlats = [];
    this.drawn = [];
    this.platforms = [];
    this.drawing = null;
    this.drawId = 0;
    this.tick = 0;
    this.shake = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.slowmo = false;
    this.freezeT = 0;
    this.freezeOwner = null;
    this.dimT = 0;
    this.impactT = 0;
    this.cinematic = opts.cinematic !== false;
    this.peace = false;
    this.match = opts.match || 'ffa';
    this.phase = 'peace';
    this.phaseT = 0;
    this.round = 0;
    this.winner = null;
    this.winTeam = -1;
    this.inCombat = false;
    this.banners = [];
    this.restTicks = opts.restTicks || 300;
    this.debug = false;
    this.cursor = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0, on: false, held: null, lastMove: -9999 };
    this.floor = { id: 'floor', floor: true, kind: 'floor', x1: -1e9, x2: 1e9, dead: false, yAt: () => this.floorY };
    this.resize(opts.width, opts.height, opts.workArea);
  }

  resize(width, height, workArea) {
    this.width = width;
    this.height = height;
    const wa = workArea || { x: 0, y: 0, width, height };
    this.left = wa.x;
    this.baseRight = wa.x + wa.width;
    this.right = this.baseRight - (this.insetRight || 0);
    this.floorY = wa.y + wa.height - 1;
  }

  // The control panel on the right edge acts as a wall.
  setInsetRight(px) {
    this.insetRight = px;
    this.right = this.baseRight - px;
  }

  // ---- fighters ----------------------------------------------------------
  addFighter(opts = {}) {
    if (this.fighters.length >= MAX_FIGHTERS) return null;
    const used = new Set(this.fighters.map((f) => f.name));
    let cfg = opts.name ? PALETTE.find((p) => p.name === opts.name) : null;
    if (cfg && used.has(cfg.name)) cfg = null;
    if (!cfg) cfg = PALETTE.find((p) => !used.has(p.name));
    if (!cfg) return null;
    const S = this.S;
    const arch = opts.arch && ARCHETYPES[opts.arch] ? opts.arch : cfg.arch;
    const f = new Fighter(this, {
      id: this.fighters.length ? Math.max(...this.fighters.map((q) => q.id)) + 1 : 1,
      name: cfg.name, color: cfg.color, el: cfg.el, arch, ability: opts.ability && ABILITIES[opts.ability] ? opts.ability : null,
      x: opts.x != null ? clamp(opts.x, this.left + 20 * S, this.right - 20 * S) : rand(this.left + 80 * S, this.right - 80 * S),
      y: opts.y != null ? opts.y : -120 * S,
    });
    this.fighters.push(f);
    this.assignTeams();
    // A latecomer sits out the current round.
    if (this.phase === 'fight' || this.phase === 'ko') f.hp = 0;
    if (opts.x != null) this.puff(f.x, opts.y);
    return f;
  }

  removeFighter(f) {
    f = f || this.fighters[this.fighters.length - 1];
    if (!f) return;
    this.fighters = this.fighters.filter((q) => q !== f);
    if (this.cursor.held === f) this.cursor.held = null;
    for (const o of this.fighters) {
      if (o.target === f) o.target = null;
      if (o.grabbed === f) { o.grabbed = null; o.setState('idle'); }
    }
    this.puff(f.pts.hip.x, f.pts.hip.y);
    this.assignTeams();
    if (this.phase !== 'peace') this.setPhase('rest');
  }

  clearFighters() {
    for (const f of this.fighters.slice()) this.puff(f.pts.hip.x, f.pts.hip.y);
    this.fighters = [];
    this.cursor.held = null;
    this.setPhase('peace');
  }

  assignTeams() {
    this.fighters.forEach((f, i) => { f.team = this.match === 'teams' ? i % 2 : i; });
  }

  setMatch(m) {
    this.match = m;
    this.assignTeams();
    if (this.phase !== 'peace') this.setPhase('rest');
    this.phaseT = this.restTicks - 60;
  }

  isEnemy(a, b) {
    return a !== b && a.team !== b.team;
  }

  healAll() {
    for (const f of this.fighters) {
      if (f.hp <= 0 && this.phase === 'fight') continue;
      f.hp = 100;
      this.ring(f.pts.hip.x, f.pts.hip.y, '#7dffb0', 30 * this.S);
    }
  }

  // ---- platforms ---------------------------------------------------------
  setWindows(list) {
    const S = this.S, plats = [];
    const minW = 40 * S;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const y = r.y;
      if (y < 95 * S || y > this.floorY - 25 * S || r.w < minW) continue;
      let segs = [[r.x, r.x + r.w]];
      for (let j = 0; j < i && segs.length; j++) {
        const o = list[j];
        if (o.y <= y + 1 && o.y + o.h > y - 1) segs = subtractRange(segs, o.x, o.x + o.w);
      }
      segs.forEach((s, k) => {
        const x1 = Math.max(s[0], this.left), x2 = Math.min(s[1], this.right);
        if (x2 - x1 >= minW) plats.push(new Plat('w' + r.id + '_' + k, x1, y, x2, y, 'win', r));
      });
    }
    // Fighters standing on a window ride along when it moves.
    for (const f of this.fighters) {
      if (!f.onGround || !f.plat || f.plat.kind !== 'win') continue;
      const old = f.plat.ref;
      const nx = (p) => f.x + (p.ref.x - old.x);
      const np = plats.find((p) => p.ref.id === old.id && nx(p) >= p.x1 - 3 * S && nx(p) <= p.x2 + 3 * S);
      if (np) { f.x = nx(np); f.y = np.yAt(f.x); f.plat = np; }
    }
    for (const p of this.winPlats) p.dead = true;
    this.winPlats = plats;
    this.rebuildPlatforms();
  }

  rebuildPlatforms() {
    const win = this.useWindows === false ? [] : this.winPlats;
    this.platforms = win.concat(this.drawn.map((d) => d.plat), mapPlats(this));
  }

  findLanding(x, y0, y1, ignorePlats) {
    let best = null, by = Infinity;
    if (!ignorePlats) {
      for (const p of this.platforms) {
        if (x < p.x1 || x > p.x2) continue;
        const yp = p.yAt(x);
        if (y0 <= yp + 1 && y1 >= yp && yp < by) { best = p; by = yp; }
      }
    }
    if (!best && y1 >= this.floorY) best = this.floor;
    return best;
  }

  surfaceBelow(x, y) {
    let best = this.floor, by = this.floorY;
    for (const p of this.platforms) {
      if (x < p.x1 || x > p.x2) continue;
      const yp = p.yAt(x);
      if (yp >= y && yp < by) { best = p; by = yp; }
    }
    return best;
  }

  drawStart(x, y) { this.drawing = { x1: x, y1: y, x2: x, y2: y }; }
  drawMove(x, y) { if (this.drawing) { this.drawing.x2 = x; this.drawing.y2 = y; } }
  drawEnd() {
    const d = this.drawing;
    this.drawing = null;
    if (!d) return;
    const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
    if (Math.hypot(dx, dy) < 25) return;
    if (Math.abs(dx) < 1 || Math.abs(dy / dx) > 1.4) { this.puff((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2); return; }
    const plat = new Plat('d' + (++this.drawId), d.x1, d.y1, d.x2, d.y2, 'draw', null);
    this.drawn.push({ plat, t: 0, life: 60 * 60 });
    this.rebuildPlatforms();
  }
  eraseAt(x, y) {
    const keep = [];
    for (const d of this.drawn) {
      const p = d.plat;
      if (distToSeg(x, y, p.x1, p.y1, p.x2, p.y2) < 14) { p.dead = true; this.puff(x, y); } else keep.push(d);
    }
    if (keep.length !== this.drawn.length) { this.drawn = keep; this.rebuildPlatforms(); }
  }
  clearDrawn() {
    for (const d of this.drawn) d.plat.dead = true;
    this.drawn = [];
    this.rebuildPlatforms();
  }

  // ---- cursor ------------------------------------------------------------
  cursorMove(x, y) {
    const c = this.cursor;
    if (x !== c.x || y !== c.y) c.lastMove = this.tick;
    c.x = x; c.y = y; c.on = true;
  }

  fighterAt(x, y, tol) {
    let best = null, bd = tol;
    for (const f of this.fighters) {
      const d = this.hurtDist(f, x, y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  grabFighter(f) {
    const c = this.cursor;
    if (f.grabber) { f.grabber.grabbed = null; f.grabber.setState('idle'); f.grabber = null; }
    let pin = 0, bd = Infinity;
    for (let i = 0; i < JOINTS.length; i++) {
      const q = f.pts[JOINTS[i]];
      const d = Math.hypot(q.x - c.x, q.y - c.y);
      if (d < bd) { bd = d; pin = i; }
    }
    f.startRagdoll(0, 0, 0, 'held');
    f.rag.pin = pin;
    c.held = f;
    c.heldAt = this.tick;
    c.heldFrom = { x: c.x, y: c.y };
    f.say(pick(LINES.held), 90);
  }

  releaseHeld() {
    const c = this.cursor, f = c.held;
    c.held = null;
    if (!f || !f.rag) return;
    const r = f.rag;
    r.pin = -1;
    r.t = 0;
    f.state = f.hp > 0 ? 'ragdoll' : 'ko';
    const speed = Math.hypot(c.vx, c.vy);
    const quick = this.tick - c.heldAt < 15 && Math.hypot(c.x - c.heldFrom.x, c.y - c.heldFrom.y) < 6;
    if (quick) {
      // A click rather than a drag: that's a poke.
      const dir = sign(f.x - c.x) || 1;
      for (const p of r.p) { p.ox = p.x - dir * 3 * this.S; p.oy = p.y + 4 * this.S; }
      this.poked(f);
    } else if (speed > 2) {
      for (const p of r.p) { p.ox = p.x - c.vx * 0.9; p.oy = p.y - c.vy * 0.9; }
      r.thrower = 'cursor';
    }
  }

  poked(f) {
    this.impact(this.cursor.x, this.cursor.y, 1, 5, '#ffffff');
    f.say(pick(LINES.poke), 110);
    if (f.ai && this.phase !== 'fight') f.ai.angry = 420;
  }

  checkCursorHit(f) {
    const c = this.cursor, m = f.move;
    if (!m || f.hitList.has('cursor')) return;
    const j = f.pts[f.hitProps().joint];
    if (Math.hypot(j.x - c.x, j.y - c.y) < (m.rad + 14) * this.S) {
      f.hitList.add('cursor');
      f.moveHit = 'hit';
      this.hitFx(f, c.x, c.y, f.facing, 10);
      this.burst(c.x, c.y, 60 * this.S, f.elc.hot);
      this.text(c.x, c.y - 14, pick(['POW!', 'BAM!', 'WHACK!']), '#fff', 18);
      this.shake = Math.max(this.shake, 5);
      f.ai.angry = Math.max(0, f.ai.angry - 160);
      if (f.ai.angry === 0 || chance(0.4)) f.say(pick(LINES.gotcha), 100);
    }
  }

  // ---- sandbox tools -----------------------------------------------------
  explode(x, y) {
    const S = this.S, R = 120 * S;
    damageCratesNear(this, x, y, R);
    this.flashFx(x, y, R * 0.6);
    this.burst(x, y, R * 1.4);
    this.ring(x, y, '#ffd23f', R);
    this.ring(x, y, '#ffffff', R * 0.6);
    this.impact(x, y, 1, 16, '#ffb347');
    this.impact(x, y, -1, 16, '#ff6a3d');
    this.dust(x, y, 16);
    this.shake = Math.max(this.shake, 18);
    if (this.floorY - y < 40 * S) this.crack(x, this.floorY, 0, 22);
    for (const f of this.fighters) {
      const hip = f.pts.hip;
      const dx = hip.x - x, dy = hip.y - y, d = Math.hypot(dx, dy);
      if (d > R || f.state === 'held') continue;
      const k = 1 - d / R;
      const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
      if (this.phase === 'fight' && f.hp > 0) this.damage(f, 6 + 14 * k, null);
      if (f.rag) {
        for (const p of f.rag.p) { p.ox -= nx * 14 * k * S; p.oy -= (ny - 0.8) * 14 * k * S; }
      } else {
        f.startRagdoll(nx * 14 * k * S, (ny - 0.8) * 13 * k * S, (sign(nx) || 1) * 0.2 * k, f.hp > 0 ? 'ragdoll' : 'ko');
      }
      if (f.hp <= 0 && this.phase === 'fight') this.onKO(f, null);
    }
    for (const p of this.projectiles) if (Math.hypot(p.x - x, p.y - y) < R) p.life = 0;
  }

  smite(x, y) {
    const S = this.S;
    let target = this.fighterAt(x, y, 45 * S);
    const tx = target ? target.pts.neck.x : x, ty = target ? target.pts.neck.y : y;
    const pts = [];
    let px = tx + rand(-40, 40), py = Math.min(-10, ty - 600);
    while (py < ty) {
      pts.push({ x: px, y: py });
      py += rand(25, 55);
      px += rand(-28, 28);
      px = lerp(px, tx, 0.18);
    }
    pts.push({ x: tx, y: ty });
    this.fx.push({ type: 'bolt', pts, life: 14, max: 14 });
    this.flashFx(tx, ty, 50 * S);
    this.burst(tx, ty, 110 * S);
    this.impact(tx, ty, 1, 14, '#bfe6ff');
    this.impact(tx, ty, -1, 14, '#bfe6ff');
    this.shake = Math.max(this.shake, 12);
    this.impactT = 3;
    if (target && target.state !== 'held') {
      if (this.phase === 'fight' && target.hp > 0) this.damage(target, 15, null);
      target.flash = 10;
      target.startRagdoll(rand(-3, 3) * S, -9 * S, rand(-0.2, 0.2), target.hp > 0 ? 'ragdoll' : 'ko');
      if (target.hp <= 0 && this.phase === 'fight') this.onKO(target, null);
      this.text(tx, ty - 30 * S, 'ZAP!', '#bfe6ff', 20);
    } else {
      this.crack(tx, Math.min(this.floorY, ty), 0, 14);
    }
  }

  // ---- combat ------------------------------------------------------------
  hurtDist(o, x, y) {
    const P = o.pts, S = this.S, br = 4 * S;
    let d = Math.hypot(P.head.x - x, P.head.y - y) - BODY.headR * S;
    d = Math.min(d,
      distToSeg(x, y, P.hip.x, P.hip.y, P.neck.x, P.neck.y) - br,
      distToSeg(x, y, P.hip.x, P.hip.y, P.k1.x, P.k1.y) - br,
      distToSeg(x, y, P.k1.x, P.k1.y, P.f1.x, P.f1.y) - br * 0.7,
      distToSeg(x, y, P.hip.x, P.hip.y, P.k2.x, P.k2.y) - br,
      distToSeg(x, y, P.k2.x, P.k2.y, P.f2.x, P.f2.y) - br * 0.7);
    return d;
  }

  vulnerable(d) {
    return d.hp > 0 && !d.rag && d.invuln <= 0 && d.state !== 'grabbed' && d.state !== 'getup';
  }

  checkHit(a) {
    if (!a.move || this.phase !== 'fight') return;
    let m = a.hitProps();
    // A held weapon extends front-hand attacks: probe along the whole blade.
    const W = a.weapon && !m.projectile && !m.grab && (m.wpn || m.joint === 'h1') ? WEAPONS[a.weapon.kind] : null;
    let probes = [a.pts[m.joint]];
    if (W && W.len > 20) {
      const tip = a.weaponTip(), h = a.pts.h1;
      probes = [tip, { x: (tip.x + h.x) / 2, y: (tip.y + h.y) / 2 }, h];
    }
    const boost = (W ? W.dmg : 1) * (a.giantT > 0 ? 1.4 : 1), kbB = (W ? W.kb : 1) * (a.giantT > 0 ? 1.4 : 1);
    if (m.kb && (boost !== 1 || kbB !== 1)) m = Object.assign({}, m, { dmg: m.dmg * boost, kb: [m.kb[0] * kbB, m.kb[1] * kbB] });
    const rad = m.rad * a.S;
    const j = probes[0];
    hitCrates(this, a, probes, rad);
    for (const d of this.fighters) {
      if (!this.isEnemy(a, d) || a.hitList.has(d) || d.hp <= 0) continue;
      // Clash: both attacks are out and the fists/feet meet.
      if (d.state === 'attack' && d.hitWin >= 0 && !d.move.projectile && !d.hitList.has(a)) {
        const dm = d.hitProps();
        const dj = d.pts[dm.joint];
        if (Math.hypot(dj.x - j.x, dj.y - j.y) < (m.rad + dm.rad) * this.S * 0.8 && d.facing === -a.facing) {
          this.clash(a, d, (j.x + dj.x) / 2, (j.y + dj.y) / 2);
          return;
        }
      }
      if (!this.vulnerable(d)) continue;
      let at = null;
      for (const p of probes) if (this.hurtDist(d, p.x, p.y) <= rad) { at = p; break; }
      if (!at) continue;
      a.hitList.add(d);
      this.resolveHit(a, d, m, at);
      if (W && a.weapon && --a.weapon.uses <= 0) a.breakWeapon();
      if (!a.move) return;
    }
  }

  clash(a, b, x, y) {
    const S = this.S;
    for (const f of [a, b]) {
      f.hitList.add(f === a ? b : a);
      f.move = null;
      f.vx = -f.facing * 5 * S;
      f.hitstop = 12;
      f.landLag = 12;
      f.setState(f.onGround ? 'land' : 'air', true);
      f.meter = Math.min(100, f.meter + 10);
    }
    this.flashFx(x, y, 34 * S);
    this.burst(x, y, 120 * S);
    this.ring(x, y, '#ffffff', 50 * S);
    this.hitFx(a, x, y, -1, 14);
    this.hitFx(b, x, y, 1, 14);
    this.text(x, y - 30 * S, 'CLASH!', '#ffffff', 22);
    this.shake = Math.max(this.shake, 10);
    this.impactT = 3;
  }

  resolveHit(a, d, m, at) {
    const S = this.S, key = a.moveKey;
    if (m.grab) {
      if (!d.onGround) return;
      a.moveHit = 'hit';
      a.learn(key, 0.6);
      a.grabVictim(d);
      return;
    }
    const facesAttacker = sign(a.x - d.x) === d.facing || Math.abs(a.x - d.x) < 3 * S;
    const guarding = (d.state === 'block' || d.state === 'blockstun') && facesAttacker;
    const blocked = guarding && !(m.low && !d.blockLow) && !(m.overhead && d.blockLow) && !m.finisher;
    if (blocked && d.state === 'block' && this.tick - d.blockStart <= 6) {
      // Parry: a block started within 6 frames of impact staggers the attacker.
      a.moveHit = 'block';
      a.learn(key, -0.4);
      a.move = null;
      a.hitstun = 26; a.hitType = 'high';
      a.setState('hitstun', true);
      a.vx = -a.facing * 2 * S;
      a.hitstop = 14; d.hitstop = 10;
      d.meter = Math.min(100, d.meter + 20);
      this.ring(at.x, at.y, '#7fd8ff', 30 * S);
      this.burst(at.x, at.y, 70 * S, '#7fd8ff');
      this.text(at.x, at.y - 20 * S, 'PARRY!', '#7fd8ff', 20);
      return;
    }
    if (blocked) {
      a.moveHit = 'block';
      a.learn(key, -0.1);
      d.hitstun = m.bs || 12;
      d.setState('blockstun', true);
      d.vx = a.facing * m.kb[0] * 0.7 * S;
      this.damage(d, m.dmg * 0.1, a, true);
      a.hitstop = d.hitstop = Math.round(m.stop * 0.6);
      a.meter = Math.min(100, a.meter + 3);
      d.meter = Math.min(100, d.meter + 5);
      this.impact(at.x, at.y, a.facing, 4, '#cfe8ff');
      return;
    }
    // Clean hit.
    const counter = d.state === 'attack' && d.phase() !== 'recovery';
    if (d.state === 'attack' && d.phase() === 'recovery') d.learn(d.moveKey, -0.5);
    let dmg = m.dmg * Math.max(0.35, 1 - 0.12 * d.combo) * (1 + Math.min(0.2, 0.03 * (a.level - 1)));
    if (counter) dmg *= 1.2;
    dmg *= 1.25; // fast rounds
    if (d.state === 'frozen') {
      // Hitting a frozen fighter shatters the ice for bonus damage.
      dmg *= 1.4;
      shatterIce(this, d);
      this.text(at.x, at.y - 18 * S, 'SHATTER!', '#bfefff', 16);
    }
    this.damage(d, dmg, a);
    d.combo++;
    a.moveHit = 'hit';
    a.learn(key, 0.4 + m.dmg / 20);
    if (!a.move.superMove) a.meter = Math.min(100, a.meter + m.dmg * 1.4);
    d.meter = Math.min(100, d.meter + m.dmg * 0.7);
    a.hitstop = d.hitstop = m.stop + (counter ? 3 : 0);
    d.flash = 4;
    d.lastHitBy = a;
    d.lastHitT = this.tick;
    this.shake = Math.max(this.shake, m.stop * 0.7);
    this.hitFx(a, at.x, at.y, a.facing, m.dmg);
    if (m.dmg >= 10 || m.finisher) { this.burst(at.x, at.y, (70 + m.dmg * 5) * S, a.elc.hot); this.impactT = m.finisher ? 4 : 2; }
    if (counter) this.text(at.x, at.y - 24 * S, 'COUNTER', '#ffd23f', 14);
    if (d.combo >= 2) {
      const big = d.combo >= 5;
      this.text(d.pts.head.x, d.pts.head.y - 30 * S, d.combo + (big ? ' HIT COMBO!' : ' HITS'), a.color, big ? 20 : 16);
    }
    // Extra horizontal knockback spreads fights across the screen.
    const kx = a.facing * m.kb[0] * S * 1.4, ky = m.kb[1] * S;
    if (d.hp <= 0) {
      d.move = null;
      d.startRagdoll(kx * 1.6, Math.min(ky, -6 * S) * 1.3, a.facing * 0.15, 'ko');
      d.rag.thrower = a;
      this.onKO(d, a);
      return;
    }
    if (m.knockdown || d.combo >= 9 || d.juggle >= 6) {
      d.startRagdoll(kx * 1.2, ky ? ky * 1.1 : -4 * S, a.facing * 0.1);
      if (m.dmg >= 12) d.rag.thrower = a;
      return;
    }
    d.move = null;
    d.hitType = m.joint[0] === 'f' && !m.air ? 'gut' : 'high';
    if (m.launch || !d.onGround) {
      d.juggled = true;
      d.juggle++;
      d.onGround = false; d.plat = null;
      d.vx = kx;
      d.vy = ky < 0 ? ky : (ky > 0 ? ky : -5 * S);
      d.hitstun = Math.max(10, (m.hs || 18) - d.juggle * 3);
    } else {
      d.vx = kx;
      if (ky < 0) { d.vy = ky; d.onGround = false; d.plat = null; }
      d.hitstun = m.hs;
    }
    d.setState('hitstun', true);
  }

  damage(d, amt, attacker, chip) {
    if (d.hp <= 0) return;
    d.hp = Math.max(chip ? 1 : 0, d.hp - amt);
    d.recentDmgT = 180;
    if (!chip && amt >= 1) this.text(d.pts.neck.x + rand(-8, 8), d.pts.neck.y - 10, String(Math.round(amt)), '#ffffff', 12);
  }

  onKO(d, a) {
    if (this.phase !== 'fight') return;
    d.hp = 0;
    this.slowT = 50;
    this.shake = Math.max(this.shake, 16);
    this.impactT = 4;
    this.ring(d.pts.hip.x, d.pts.hip.y, '#ffffff', 80 * this.S);
    this.burst(d.pts.hip.x, d.pts.hip.y, 180 * this.S);
    const alive = this.fighters.filter((f) => f.hp > 0);
    const teamsLeft = new Set(alive.map((f) => f.team)).size;
    this.banner(teamsLeft <= 1 ? 'K.O.' : d.name.toUpperCase() + ' DOWN', teamsLeft <= 1 ? 80 : 50, '#ff4d4d');
    if (a && a.name) a.learn(a.moveKey, 0.3);
  }

  // Ultimate start: everyone else freezes for a dramatic beat and the name flashes up.
  superFlash(f, name = ULT_DEFAULT.name, color = '#ffffff') {
    const S = this.S;
    this.freezeT = 28;
    this.freezeOwner = f;
    if (this.cinematic) this.dimT = 70;
    this.ring(f.pts.neck.x, f.pts.neck.y, color, 70 * S);
    this.ring(f.pts.neck.x, f.pts.neck.y, '#ffffff', 40 * S);
    this.burst(f.pts.neck.x, f.pts.neck.y, 150 * S, color);
    this.elemFx(f.el, f.pts.neck.x, f.pts.neck.y, f.facing, 16);
    this.elemFx(f.el, f.pts.neck.x, f.pts.neck.y, -f.facing, 16);
    this.text(f.pts.head.x, f.pts.head.y - 40 * S, f.name, f.light, 16);
    this.banner(name + '!', 70, color);
    f.say(pick(['Here goes!', 'Full power!', 'Watch this.', 'HAAAA!', 'Ultimate!']), 60);
  }

  shockwave(f) {
    const S = this.S, R = 90 * S;
    const x = f.x, y = f.y;
    this.fx.push({ type: 'wave', x, y, r: R * 1.2, life: 22, max: 22, color: f.light });
    this.fx.push({ type: 'wave', x, y, r: R * 0.7, life: 16, max: 16, color: '#ffffff' });
    this.burst(x, y - 10 * S, 120 * S);
    this.dust(x, y, 14);
    this.crack(x, y, 0, 18);
    this.shake = Math.max(this.shake, 14);
    this.impactT = 2;
    if (this.phase !== 'fight') return;
    for (const d of this.fighters) {
      if (!this.isEnemy(f, d) || !this.vulnerable(d)) continue;
      const dx = d.x - x;
      if (Math.abs(dx) > R || Math.abs(d.y - y) > 45 * S || !d.onGround) continue;
      const dir = sign(dx) || 1;
      if ((d.state === 'block' || d.state === 'blockstun') && d.facing === -dir) {
        d.hitstun = 16; d.setState('blockstun', true); d.vx = dir * 4 * S;
        this.damage(d, 1, f, true);
        continue;
      }
      const k = 1 - Math.abs(dx) / R * 0.5;
      this.damage(d, 9 * k * Math.max(0.35, 1 - 0.12 * d.combo), f);
      d.combo++;
      f.moveHit = 'hit';
      f.learn('pound', 0.6);
      d.startRagdoll(dir * 7 * k * S, -8 * k * S, dir * 0.12, d.hp > 0 ? 'ragdoll' : 'ko');
      if (d.hp <= 0) this.onKO(d, f);
    }
  }

  spawnProjectile(f) {
    const S = this.S, h = f.pts.h1;
    if (f.move && f.move.shoot) {
      const tip = f.weaponTip() || h;
      this.projectiles.push({ owner: f, kind: 'bullet', dmg: 6, x: tip.x, y: tip.y, vx: f.facing * 17 * S, r: 4 * S, life: 70, t: 0, trail: [] });
      f.vx -= f.facing * 1.5 * S;
      this.shake = Math.max(this.shake, 2);
      return;
    }
    this.projectiles.push({ owner: f, x: h.x + f.facing * 8 * S, y: h.y, vx: f.facing * 7.5 * S, r: 9 * S, life: 220, t: 0, trail: [] });
    this.ring(h.x, h.y, f.light, 20 * S);
    this.flashFx(h.x, h.y, 14 * S);
  }

  updateProjectiles() {
    const S = this.S;
    for (const p of this.projectiles) {
      p.t++; p.life--;
      p.x += p.vx;
      if (p.vy) p.y += p.vy;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();
      if (p.x < this.left - 40 || p.x > this.right + 40) p.life = 0;
      for (const q of this.projectiles) {
        if (q === p || q.owner.team === p.owner.team || q.life <= 0) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < p.r + q.r) {
          p.life = q.life = 0;
          const x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
          this.ring(x, y, '#ffffff', 40 * S);
          this.burst(x, y, 90 * S);
          this.impact(x, y, 1, 10, '#ffffff');
          this.impact(x, y, -1, 10, '#ffffff');
        }
      }
      if (p.life <= 0) continue;
      for (const o of this.fighters) {
        if (!this.isEnemy(p.owner, o) || !this.vulnerable(o) || this.phase !== 'fight') continue;
        if (this.hurtDist(o, p.x, p.y) > p.r) continue;
        p.life = 0;
        const dir = sign(p.vx);
        if ((o.state === 'block' || o.state === 'blockstun') && o.facing === -dir) {
          o.hitstun = 14; o.setState('blockstun', true); o.vx = dir * 2 * S;
          this.damage(o, 1, p.owner, true);
          this.impact(p.x, p.y, dir, 6, '#cfe8ff');
          p.owner.learn('blast', -0.1);
        } else {
          this.damage(o, (p.dmg || 12) * Math.max(0.35, 1 - 0.12 * o.combo), p.owner);
          o.combo++;
          o.flash = 4; o.hitstop = 6;
          this.hitFx(p.owner, p.x, p.y, dir, 12);
          this.burst(p.x, p.y, 80 * S, p.owner.elc.hot);
          this.shake = Math.max(this.shake, 6);
          p.owner.learn('blast', 0.5);
          if (o.hp <= 0) { o.startRagdoll(dir * 8 * S, -7 * S, dir * 0.1, 'ko'); this.onKO(o, p.owner); }
          else if (!o.onGround) { o.juggled = true; o.vx = dir * 4 * S; o.vy = -5 * S; o.hitstun = 20; o.setState('hitstun', true); }
          else { o.move = null; o.hitType = 'gut'; o.hitstun = p.kind === 'bullet' ? 10 : 22; o.vx = dir * (p.kind === 'bullet' ? 2 : 4) * S; o.setState('hitstun', true); }
        }
        break;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  // Ragdolls flung by a throw, a heavy hit or the cursor bowl over whoever they hit.
  thrownHits() {
    const S = this.S;
    for (const f of this.fighters) {
      const r = f.rag;
      if (!r || !r.thrower || r.pin >= 0) continue;
      if (r.t > 150) { r.thrower = null; continue; }
      const hip = r.p[2];
      const vx = hip.x - hip.ox, vy = hip.y - hip.oy, v = Math.hypot(vx, vy);
      if (v < 7 * S) continue;
      const thrower = r.thrower.name ? r.thrower : null;
      for (const o of this.fighters) {
        if (o === f || o === r.thrower || r.hitSet.has(o) || o.rag || o.invuln > 0 || o.state === 'grabbed') continue;
        if (thrower && !this.isEnemy(thrower, o)) continue;
        if (this.hurtDist(o, hip.x, hip.y) > 12 * S) continue;
        r.hitSet.add(o);
        if (this.phase === 'fight') this.damage(o, Math.min(14, (v / S) * 0.9), thrower || f);
        this.impact(hip.x, hip.y, sign(vx) || 1, 12, '#ffffff');
        this.burst(hip.x, hip.y, 90 * S);
        this.shake = Math.max(this.shake, 10);
        o.startRagdoll(vx * 0.7, vy * 0.5 - 3 * S, 0.1 * (sign(vx) || 1), o.hp > 0 ? 'ragdoll' : 'ko');
        if (o.hp <= 0) this.onKO(o, thrower || f);
        for (const p of r.p) { p.ox = p.x - (p.x - p.ox) * 0.5; p.oy = p.y - (p.y - p.oy) * 0.5; }
      }
    }
  }

  separate() {
    const S = this.S, F = this.fighters;
    for (let i = 0; i < F.length; i++) {
      const a = F[i];
      if (a.rag || a.state === 'grabbed' || a.state === 'wall') continue;
      for (let j = i + 1; j < F.length; j++) {
        const b = F[j];
        if (b.rag || b.state === 'grabbed' || b.state === 'wall' || a.grabbed === b || b.grabbed === a) continue;
        const dx = b.x - a.x;
        if (Math.abs(dx) < 34 * S && Math.abs(a.y - b.y) < 40 * S) {
          const push = ((34 * S - Math.abs(dx)) / 2) * 0.5 * (sign(dx) || (a.id < b.id ? 1 : -1));
          a.x -= push; b.x += push;
        }
      }
    }
  }

  /* Targeting and team tactics. Each team picks a focus target (weak and close),
   * sends up to two attackers at it (the second flanks from the other side),
   * sends someone to break up combos on a teammate, and pulls badly hurt
   * members back into a support role. In free-for-all, fighters prefer
   * opponents who are already busy with someone else. */
  updateTactics() {
    if (this.tick % 20 !== 0) return;
    const alive = this.fighters.filter((f) => f.hp > 0);
    const teams = new Map();
    for (const f of alive) {
      if (!teams.has(f.team)) teams.set(f.team, []);
      teams.get(f.team).push(f);
    }
    for (const [team, members] of teams) {
      const enemies = alive.filter((o) => o.team !== team);
      if (!enemies.length) { for (const f of members) { f.target = null; f.role = 'idle'; } continue; }
      // Focus: weakest + closest enemy, with a bias for enemies busy fighting someone else.
      const cx = members.reduce((s, f) => s + f.x, 0) / members.length;
      // FFA: pick fresh opponents so the screen splits into separate duels instead of one pile.
      const ffa = this.match !== 'teams';
      const score = (o) => o.hp * 1.5 + Math.abs(o.x - cx) / this.S * 0.4 + (ffa ? this.attackers(o, team) * 70 : (this.isBusy(o) ? -40 : 0));
      let focus = enemies[0];
      for (const o of enemies) if (score(o) < score(focus)) focus = o;
      // Break up combos on a teammate.
      const victim = members.find((m) => m.combo >= 2 && m.lastHitBy && m.lastHitBy.hp > 0 && this.tick - (m.lastHitT || 0) < 40);
      let assigned = 0;
      const sorted = members.slice().sort((a, b) => Math.abs(a.x - focus.x) - Math.abs(b.x - focus.x));
      for (const f of sorted) {
        const prev = f.role;
        if (members.length > 1 && f.hp < 25 && enemies.length > 0 && members.some((m) => m !== f && m.hp > f.hp + 20)) {
          f.role = 'support';
          f.target = nearest(f, enemies);
        } else if (victim && victim !== f && !f.rescueT) {
          f.role = 'rescue';
          f.target = victim.lastHitBy;
          f.rescueT = 90;
        } else if (assigned < 2 || enemies.length === 1) {
          f.role = assigned === 0 ? 'lead' : 'flank';
          f.target = focus;
          assigned++;
        } else {
          f.role = 'lead';
          // Extra members spread to the least-crowded enemy instead of piling on.
          const others = enemies.filter((o) => o !== focus);
          others.sort((p, q) => this.attackers(p, team) - this.attackers(q, team) || Math.abs(p.x - f.x) - Math.abs(q.x - f.x));
          f.target = others[0] || focus;
        }
        if (f.rescueT) f.rescueT = Math.max(0, f.rescueT - 20);
        if (this.match === 'teams' && prev !== f.role && !f.bubble && chance(0.25)) {
          const lines = { rescue: ['Hang on!', "I've got you!", 'Get off them!'], flank: ['Flanking!', 'Going around!', 'Pincer!'],
            support: ['Cover me!', 'Falling back!', 'Need a sec!'], lead: ['On it!', 'Focus ' + f.target.name + '!', 'Push!'] };
          if (lines[f.role]) f.say(pick(lines[f.role]), 70);
        }
      }
    }
  }

  attackers(o, exceptTeam) {
    let n = 0;
    for (const f of this.fighters) if (f.target === o && f.hp > 0 && f.team !== exceptTeam) n++;
    return n;
  }

  isBusy(o) {
    return this.fighters.some((f) => f.target === o && f.hp > 0 && Math.abs(f.x - o.x) < 90 * this.S && f.team !== o.team && f.state === 'attack');
  }

  // ---- round flow --------------------------------------------------------
  setPhase(p) { this.phase = p; this.phaseT = 0; }

  startRound() {
    this.round++;
    this.assignTeams();
    for (const f of this.fighters) this.revive(f);
    this.winner = null;
    this.winTeam = -1;
    this.projectiles = [];
    this.hazards = [];
    this.items = this.items.filter((it) => !it.fuse);
    this.banner('ROUND ' + this.round, 60, '#ffffff');
    if (this.match === 'teams') this.banner('RED vs BLUE', 60, '#ffd23f');
    for (const f of this.fighters) if (chance(0.3)) f.say(pick(LINES.ready), 80);
    this.setPhase('intro');
  }

  revive(f) {
    if (f.rag && f.rag.pin < 0) { f.state = 'ragdoll'; f.getUp(); }
    f.hp = 100; f.meter = 0; f.combo = 0;
    if (f.ai) f.ai.angry = 0;
  }

  updateRound() {
    this.phaseT++;
    if (this.peace || this.fighters.length < 2) {
      if (this.phase !== 'peace') {
        this.setPhase('peace');
        for (const f of this.fighters) if (f.hp <= 0) this.revive(f);
      }
      this.inCombat = false;
      return;
    }
    const alive = this.fighters.filter((f) => f.hp > 0);
    const teamsLeft = new Set(alive.map((f) => f.team));
    switch (this.phase) {
      case 'peace':
        if (this.phaseT > 90) this.startRound();
        break;
      case 'rest':
        // The between-matches map picker can hold the next round back while it's open.
        if (this.phaseT >= this.restTicks && !this.holdRest) this.startRound();
        break;
      case 'intro':
        if (this.phaseT === 30) this.banner('FIGHT!', 40, '#ffd23f');
        if (this.phaseT >= 42) this.setPhase('fight');
        break;
      case 'fight':
        if (teamsLeft.size <= 1) {
          this.winTeam = alive.length ? alive[0].team : -1;
          this.winner = alive.length === 1 ? alive[0] : (alive[0] || null);
          this.setPhase('ko');
        }
        break;
      case 'ko':
        if (this.phaseT >= 70) {
          for (const f of this.fighters) {
            const won = f.team === this.winTeam && this.winTeam >= 0;
            if (won) { f.stats.wins++; if (f.hp > 0) f.say(pick(LINES.win), 160); } else f.stats.losses++;
            saveStats(f);
          }
          if (this.match === 'teams' && this.winTeam >= 0) this.banner(TEAM_NAMES[this.winTeam] + ' WINS', 120, TEAM_COLORS[this.winTeam]);
          else if (this.winner) this.banner(this.winner.name.toUpperCase() + ' WINS', 120, this.winner.color);
          this.setPhase('victory');
        }
        break;
      case 'victory':
        if (this.phaseT >= 130) { this.setPhase('rest'); if (this.onMatchEnd) this.onMatchEnd(); }
        break;
    }
    this.inCombat = this.phase === 'intro' || this.phase === 'fight' || this.phase === 'ko';
  }

  // ---- effects -----------------------------------------------------------
  impact(x, y, dir, power, color) {
    const n = 5 + Math.round(power * 0.8);
    for (let i = 0; i < n; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + rand(-1.1, 1.1);
      const sp = rand(2, 4 + power * 0.5) * this.S;
      this.fx.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randi(8, 16), max: 16, len: rand(3, 6) * this.S, color });
    }
    this.flashFx(x, y, (8 + power * 1.6) * this.S, color);
  }
  // Element-flavored hit effects (fire, volt, shadow, spark) in the attacker's style.
  hitFx(a, x, y, dir, power) {
    this.impact(x, y, dir, power, a.elc.hot);
    this.elemFx(a.el, x, y, dir, power);
  }
  elemFx(el, x, y, dir, power) {
    const S = this.S, E = ELEMENTS[el], n = 3 + Math.round(power / 2);
    if (el === 'fire') {
      for (let i = 0; i < n + 3; i++) {
        this.fx.push({ type: 'flame', x: x + rand(-6, 6) * S, y: y + rand(-6, 6) * S, vx: (dir * rand(0.5, 3) + rand(-1, 1)) * S, vy: rand(-2.5, -0.5) * S,
          r: rand(3, 4 + power * 0.35) * S, life: randi(14, 26), max: 26, E });
      }
    } else if (el === 'volt') {
      for (let i = 0; i < Math.ceil(n / 2) + 1; i++) {
        const a = (dir > 0 ? 0 : Math.PI) + rand(-1.6, 1.6);
        this.fx.push({ type: 'zap', pts: jagged(x, y, a, rand(18, 26 + power * 2) * S, 4), life: randi(6, 10), max: 10, E });
      }
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(1, 3.5) * S;
        this.fx.push({ type: 'sq', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rand(3, 5) * S, life: randi(12, 22), max: 22, color: E.main });
      }
    } else if (el === 'shadow') {
      for (let i = 0; i < n; i++) {
        const a = (dir > 0 ? 0 : Math.PI) + rand(-1.3, 1.3);
        this.fx.push({ type: 'spike', x, y, a, len: rand(14, 22 + power * 2.2) * S, w: rand(3, 6) * S, life: randi(9, 14), max: 14, E });
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = rand(6, 14 + power * 1.5) * S;
        this.fx.push({ type: 'star', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: rand(5, 8 + power * 0.4) * S, life: randi(12, 22), max: 22, E });
      }
    }
  }
  // Ambient aura while the meter is charged; stronger when it is full.
  auraFx(f) {
    const S = this.S, E = f.elc, P = f.pts, full = f.meter >= 100;
    const every = full ? 3 : 9;
    if (this.tick % every !== f.id % every) return;
    const hand = chance(0.5) ? P.h1 : P.h2;
    if (f.el === 'fire') {
      this.fx.push({ type: 'flame', x: hand.x + rand(-3, 3) * S, y: hand.y, vx: rand(-0.4, 0.4) * S, vy: rand(-2, -1) * S, r: rand(2.5, full ? 5 : 3.5) * S, life: randi(12, 20), max: 20, E });
    } else if (f.el === 'volt') {
      if (full && chance(0.5)) {
        const a = rand(0, TAU);
        this.fx.push({ type: 'zap', pts: jagged(P.hip.x + Math.cos(a) * 14 * S, P.hip.y - 14 * S + Math.sin(a) * 24 * S, a, rand(10, 18) * S, 3), life: 5, max: 5, E });
      }
      const a = this.tick * 0.12 + f.id;
      this.fx.push({ type: 'sq', x: P.hip.x + Math.cos(a) * 24 * S, y: P.hip.y - 10 * S + Math.sin(a) * 30 * S, vx: 0, vy: -0.3 * S, size: 3.5 * S, life: 12, max: 12, color: E.main });
    } else if (f.el === 'shadow') {
      const a = -Math.PI / 2 + rand(-1.2, 1.2);
      this.fx.push({ type: 'spike', x: P.hip.x + rand(-10, 10) * S, y: P.hip.y + rand(-20, 5) * S, a, len: rand(8, full ? 18 : 12) * S, w: 3 * S, life: 10, max: 10, E });
    } else {
      this.fx.push({ type: 'star', x: P.head.x + rand(-22, 22) * S, y: P.head.y + rand(-22, 14) * S, r: rand(4, full ? 8 : 6) * S, life: 16, max: 16, E });
    }
  }
  flashFx(x, y, r, color) { this.fx.push({ type: 'flash', x, y, life: 6, max: 6, r, color: color || '#ffffff' }); }
  burst(x, y, r, color) {
    // Anime-style radial impact lines.
    const n = 18, rays = [];
    for (let i = 0; i < n; i++) rays.push({ a: (i / n) * TAU + rand(-0.12, 0.12), w: rand(0.03, 0.09), l: rand(0.55, 1) });
    this.fx.push({ type: 'burst', x, y, r, rays, life: 9, max: 9, color: color || '#ffffff' });
  }
  ring(x, y, color, r) { this.fx.push({ type: 'ring', x, y, life: 18, max: 18, r, color }); }
  text(x, y, str, color, size) { this.fx.push({ type: 'text', x, y, str, color, size, life: 50, max: 50 }); }
  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.fx.push({ type: 'dust', x: x + rand(-6, 6) * this.S, y, vx: rand(-1.6, 1.6) * this.S, vy: rand(-1.2, -0.2) * this.S, life: randi(14, 26), max: 26, r: rand(2, 4.5) * this.S });
    }
  }
  speedLine(f) {
    const S = this.S, dir = sign(f.vx) || f.facing;
    for (let i = 0; i < 2; i++) {
      this.fx.push({ type: 'line', x: f.x - dir * rand(10, 30) * S, y: f.y - rand(10, 85) * S, dx: -dir * rand(20, 45) * S, life: 8, max: 8, color: chance(0.5) ? f.elc.main : '#ffffff' });
    }
  }
  charge(f, at) {
    const S = this.S, a = rand(0, TAU), d = rand(25, 45) * S;
    this.fx.push({ type: 'charge', x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, tx: at, life: 10, max: 10, color: f.elc.hot });
  }
  crack(x, y, side, power) {
    // A jagged crack decal in the floor (side 0) or a screen edge (side ±1).
    const branches = [];
    const n = 3 + Math.round(power / 5);
    for (let i = 0; i < n; i++) {
      const pts = [{ x, y }];
      let a = side ? (side > 0 ? 0 : Math.PI) + rand(-1.2, 1.2) : -Math.PI / 2 + rand(-1.3, 1.3);
      let px = x, py = y;
      const len = rand(12, 18 + power * 2) * this.S;
      for (let k = 0; k < 4; k++) {
        a += rand(-0.5, 0.5);
        px += Math.cos(a) * len / 4; py += Math.sin(a) * len / 4;
        if (!side) py = Math.min(py, y);
        pts.push({ x: px, y: py });
      }
      branches.push(pts);
    }
    this.decals.push({ branches, life: 240, max: 240 });
    if (this.decals.length > 20) this.decals.shift();
  }
  wallHit(x, y, side, power) {
    this.impact(x, y, side, power, '#ffffff');
    if (power > 9) { this.crack(side > 0 ? this.left + 1 : this.right - 1, y, side, power); this.burst(x, y, 90 * this.S); }
  }
  puff(x, y) { this.dust(x, y, 10); this.ring(x, y, '#ffffff', 25 * this.S); }
  whoosh(f) { this.ring(f.pts[f.move.joint].x, f.pts[f.move.joint].y, f.light, 18 * this.S); }
  zzz(f) { this.fx.push({ type: 'text', x: f.pts.head.x + 8 * this.S, y: f.pts.head.y - 8 * this.S, str: 'z', color: '#ffffff', size: 13, life: 70, max: 70, vy: -0.4 }); }
  banner(str, life, color) { this.banners.push({ str, life, max: life, color }); }

  updateFx() {
    for (const e of this.fx) {
      e.life--;
      if (e.type === 'spark') { e.x += e.vx; e.y += e.vy; e.vx *= 0.88; e.vy *= 0.88; }
      else if (e.type === 'dust') { e.x += e.vx; e.y += e.vy; e.vx *= 0.93; }
      else if (e.type === 'text') e.y += e.vy || -0.6;
      else if (e.type === 'charge') { e.x = lerp(e.x, e.tx.x, 0.25); e.y = lerp(e.y, e.tx.y, 0.25); }
      else if (e.type === 'flame') { e.x += e.vx; e.y += e.vy; e.vx *= 0.92; e.vy -= 0.04 * this.S; }
      else if (e.type === 'sq') { e.x += e.vx; e.y += e.vy; e.vx *= 0.9; e.vy *= 0.9; }
    }
    this.fx = this.fx.filter((e) => e.life > 0);
    for (const d of this.decals) d.life--;
    this.decals = this.decals.filter((d) => d.life > 0);
    for (const b of this.banners) b.life--;
    this.banners = this.banners.filter((b) => b.life > 0);
  }

  // ---- main tick ---------------------------------------------------------
  update() {
    this.tick++;
    const c = this.cursor;
    c.vx = lerp(c.vx, c.x - c.px, 0.5);
    c.vy = lerp(c.vy, c.y - c.py, 0.5);
    c.px = c.x; c.py = c.y;
    if (this.dimT > 0) this.dimT--;
    if (this.impactT > 0) this.impactT--;
    if (this.freezeT > 0) {
      // Super flash: everyone except the attacker freezes.
      this.freezeT--;
      const f = this.freezeOwner;
      if (f && this.fighters.includes(f)) {
        if (this.tick % 2 === 0) this.charge(f, f.pts.neck);
        f.skeleton();
      }
      this.updateFx();
      return;
    }
    updateMap(this);
    this.updateRound();
    this.updateTactics();
    for (const f of this.fighters) aiThink(f, this);
    for (const f of this.fighters) f.update();
    this.separate();
    this.updateProjectiles();
    this.thrownHits();
    updateArsenal(this);
    for (const f of this.fighters) {
      if (f.meter >= 50 && !f.rag && f.hp > 0) this.auraFx(f);
    }
    this.updateFx();
    let changed = false;
    for (const d of this.drawn) if (++d.t > d.life) { d.plat.dead = true; changed = true; }
    if (changed) { this.drawn = this.drawn.filter((d) => !d.plat.dead); this.rebuildPlatforms(); }
    if (this.slowT > 0) this.slowT--;
    this.timeScale = this.slowT > 0 ? 0.3 : this.slowmo ? 0.4 : 1;
    this.shake *= 0.85;
  }
}

// A jagged lightning polyline from (x, y) heading at angle a.
function jagged(x, y, a, len, segs) {
  const pts = [{ x, y }];
  for (let i = 1; i <= segs; i++) {
    const d = (len * i) / segs, off = i < segs ? rand(-0.45, 0.45) * len / segs : 0;
    pts.push({ x: x + Math.cos(a) * d - Math.sin(a) * off, y: y + Math.sin(a) * d + Math.cos(a) * off });
  }
  return pts;
}

function nearest(f, list) {
  let best = null, bd = Infinity;
  for (const o of list) {
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 0.5;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function subtractRange(segs, a, b) {
  const out = [];
  for (const [s, e] of segs) {
    if (b <= s || a >= e) { out.push([s, e]); continue; }
    if (a > s) out.push([s, a]);
    if (b < e) out.push([b, e]);
  }
  return out;
}
