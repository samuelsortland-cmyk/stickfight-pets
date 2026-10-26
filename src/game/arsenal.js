'use strict';
/* Items, weapons and powers.
 *
 * Items lie on the ground with physics; fighters pick them up by walking over
 * them (the AI goes looking for what it needs). Weapons change a fighter's
 * hand attacks and unlock a weapon move. Fruits grant a destructive power
 * (Blox Fruits / anime inspired) that the AI casts on cooldown. Powers leave
 * marks on the screen: craters, scorch marks, shattered glass, ice spikes. */

const WEAPONS = {
  sword: { name: 'Katana', len: 40, dmg: 1.35, kb: 1.15, uses: 18, move: 'slash' },
  hammer: { name: 'Hammer', len: 34, dmg: 1.6, kb: 1.7, uses: 10, move: 'smash' },
  spear: { name: 'Spear', len: 62, dmg: 1.25, kb: 1.1, uses: 18, move: 'thrust' },
  blaster: { name: 'Blaster', len: 14, dmg: 1, kb: 1, uses: 16, move: 'shoot' },
};
const CONSUMABLES = {
  medkit: { name: 'Medkit' },
  energy: { name: 'Energy' },
  grenade: { name: 'Grenade' },
};

// Cast poses.
const CAST_POSES = {
  punch: P({ lean: 0.35, a1: 1.57, e1: 0.0, a2: -0.5, e2: 1.2, l1: 0.6, k1: -0.5, l2: -0.5, k2: -0.1 }),
  up: P({ lean: -0.1, head: -0.3, a1: 2.9, e1: 0.1, a2: 2.7, e2: 0.2, l1: 0.3, k1: -0.2, l2: -0.3, k2: -0.1 }),
  charge: P({ lean: -0.05, a1: -0.6, e1: 1.8, a2: -0.7, e2: 1.7, l1: 0.6, k1: -0.9, l2: -0.5, k2: -0.4 }),
  fire: P({ lean: 0.3, a1: 1.55, e1: 0, a2: 1.5, e2: 0.05, l1: 0.6, k1: -0.5, l2: -0.6, k2: 0 }),
  stomp: P({ lean: 0.2, a1: 0.5, e1: 1.0, a2: -0.6, e2: 0.8, l1: 1.3, k1: -1.5, l2: -0.2, k2: -0.1 }),
  slam: P({ lean: 0.5, a1: 0.9, e1: 0.4, a2: 0.7, e2: 0.5, l1: 1.2, k1: -2.0, l2: 0.3, k2: -1.7 }),
};

// ---- helpers ----------------------------------------------------------------

function groundBelow(w, x, y) {
  const p = w.surfaceBelow(x, y - 4);
  return p.floor ? w.floorY : p.yAt(x);
}

// Damage + knockback from a power. Unlike normal hits, powers also batter fighters
// who are already ragdolling (that is what makes them feel destructive).
function hurt(w, f, d, dmg, kx, ky, o = {}) {
  if (w.phase !== 'fight' || d.hp <= 0 || d.state === 'held' || d.state === 'grabbed') return false;
  if (f && !w.isEnemy(f, d)) return false;
  if (d.invuln > 0 && d.state === 'getup') return false;
  w.damage(d, dmg * Math.max(0.4, 1 - 0.08 * d.combo) * (f && f.giantT > 0 ? 1.3 : 1), f);
  d.combo++;
  d.flash = 6;
  d.lastHitBy = f; d.lastHitT = w.tick;
  if (f) f.meter = Math.min(100, f.meter + 2);
  if (d.state === 'frozen') shatterIce(w, d);
  if (d.hp <= 0) {
    if (!d.rag) d.startRagdoll(kx * 1.3, ky * 1.3 - 2 * w.S, (sign(kx) || 1) * 0.15, 'ko');
    else d.state = 'ko';
    if (d.rag && f && f.name) d.rag.thrower = f;
    w.onKO(d, f);
    return true;
  }
  if (o.freeze && !d.rag) { freezeFighter(w, d, o.freeze); return true; }
  if (d.rag) {
    for (const p of d.rag.p) { p.ox -= kx * 0.6; p.oy -= ky * 0.6; }
    d.rag.t = Math.min(d.rag.t, 20);
    return true;
  }
  if (o.stun) {
    d.move = null;
    d.hitstun = o.stun;
    d.vx = kx;
    if (ky < 0) { d.vy = ky; d.onGround = false; d.plat = null; d.juggled = true; }
    d.setState('hitstun', true);
    return true;
  }
  d.startRagdoll(kx, ky, (sign(kx) || 1) * 0.12);
  if (f && f.name) d.rag.thrower = f;
  return true;
}

// Push anything nearby (fighters, ragdolls, items) without damage.
function shove(w, x, y, R, power, except) {
  const S = w.S;
  for (const d of w.fighters) {
    if (d === except || d.state === 'held') continue;
    const dx = d.pts.hip.x - x, dy = d.pts.hip.y - y, dist = Math.hypot(dx, dy);
    if (dist > R) continue;
    const k = (1 - dist / R) * power * S, nx = dist ? dx / dist : 0, ny = dist ? dy / dist : -1;
    if (d.rag) for (const p of d.rag.p) { p.ox -= nx * k; p.oy -= (ny - 0.6) * k; }
  }
  for (const it of w.items) {
    const dx = it.x - x, dy = it.y - y, dist = Math.hypot(dx, dy);
    if (dist > R) continue;
    const k = (1 - dist / R) * power * S;
    it.vx += (dist ? dx / dist : 0) * k; it.vy -= k * 0.8 + 2 * S; it.onGround = false; it.plat = null;
  }
}

// Explosion: damages the caster's enemies, flings everything, scorches the ground,
// and breaks drawn platforms.
function blast(w, x, y, R, dmg, f, color = '#ffb347') {
  const S = w.S;
  w.flashFx(x, y, R * 0.55, color);
  w.burst(x, y, R * 1.3, color);
  w.ring(x, y, color, R);
  w.ring(x, y, '#ffffff', R * 0.6);
  w.impact(x, y, 1, 16, color);
  w.impact(x, y, -1, 16, color);
  w.dust(x, y, 14);
  damageCratesNear(w, x, y, R);
  w.shake = Math.max(w.shake, Math.min(30, R / S / 6));
  w.impactT = Math.max(w.impactT, 2);
  const gy = groundBelow(w, x, y);
  if (gy - y < R * 0.5) addDecal(w, { kind: 'scorch', x, y: gy, r: R * 0.7, life: 900 });
  breakDrawn(w, x, y, R * 0.8);
  for (const d of w.fighters) {
    if (d === f) continue;
    const dx = d.pts.hip.x - x, dy = d.pts.hip.y - y, dist = Math.hypot(dx, dy);
    if (dist > R) continue;
    const k = 1 - dist / R, nx = dist ? dx / dist : (sign(dx) || 1), ny = dist ? dy / dist : -1;
    if (!hurt(w, f, d, dmg * (0.5 + 0.5 * k), nx * 13 * k * S, (ny - 0.9) * 12 * k * S)) {
      if (d.rag && (!f || w.isEnemy(f, d))) for (const p of d.rag.p) { p.ox -= nx * 8 * k * S; p.oy += 8 * k * S; }
    }
  }
  shove(w, x, y, R, 9, f);
  for (const p of w.projectiles) if (Math.hypot(p.x - x, p.y - y) < R) p.life = 0;
}

function breakDrawn(w, x, y, R) {
  let hit = false;
  for (const d of w.drawn) {
    const p = d.plat;
    if (distToSeg(x, y, p.x1, p.y1, p.x2, p.y2) < R) {
      p.dead = true; hit = true;
      for (let i = 0; i < 6; i++) {
        const t = Math.random();
        w.fx.push({ type: 'sq', x: lerp(p.x1, p.x2, t), y: lerp(p.y1, p.y2, t), vx: rand(-3, 3) * w.S, vy: rand(-4, 0) * w.S, size: 4 * w.S, life: 24, max: 24, color: '#ffffff' });
      }
    }
  }
  if (hit) { w.drawn = w.drawn.filter((d) => !d.plat.dead); w.rebuildPlatforms(); }
}

function addDecal(w, d) {
  d.max = d.life;
  w.decals.push(d);
  if (w.decals.length > 40) w.decals.shift();
}

function freezeFighter(w, d, t) {
  d.move = null;
  d.frozenT = t;
  d.vx *= 0.3;
  d.setState('frozen', true);
  w.text(d.pts.head.x, d.pts.head.y - 20 * w.S, 'FROZEN', '#bfefff', 8);
}

function shatterIce(w, d) {
  d.frozenT = 0;
  const S = w.S;
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), sp = rand(2, 6) * S;
    w.fx.push({ type: 'sq', x: d.pts.hip.x + rand(-12, 12) * S, y: d.pts.hip.y + rand(-40, 20) * S, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2 * S, size: rand(3, 6) * S, life: 26, max: 26, color: chance(0.5) ? '#bfefff' : '#ffffff' });
  }
}

function enemiesOf(w, f) {
  return w.fighters.filter((o) => o !== f && o.hp > 0 && w.isEnemy(f, o));
}

function nearestEnemy(w, f) {
  let best = null, bd = Infinity;
  for (const o of enemiesOf(w, f)) {
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 0.5;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ---- powers ------------------------------------------------------------------
/* Each power: cast = wind-up frames (fire() runs at the end of it), after = frames
 * the caster stays locked afterwards, cd = cooldown frames, ready() = AI test. */
const ABILITIES = {
  flame: {
    name: 'Flame', call: 'FIRE FIST!', color: '#ff7a1a', color2: '#ffe14d', cd: 330, cast: 14, after: 14, pose: CAST_POSES.punch,
    desc: 'Giant fireball that explodes and sets the ground on fire.',
    ready: (f, o, adx, dy) => adx < 620 * f.S && Math.abs(dy) < 70 * f.S,
    fire(f, w) {
      const S = w.S, h = f.pts.h1;
      w.hazards.push({
        x: h.x + f.facing * 10 * S, y: h.y, vx: f.facing * 9 * S, r: 22 * S, life: 150, owner: f,
        update(w) {
          this.x += this.vx; this.life--;
          for (let i = 0; i < 3; i++) w.fx.push({ type: 'flame', x: this.x + rand(-1, 1) * this.r, y: this.y + rand(-1, 1) * this.r, vx: -this.vx * 0.2 + rand(-1, 1) * S, vy: rand(-2, 0) * S, r: rand(4, 9) * S, life: randi(14, 24), max: 24, E: ELEMENTS.fire });
          let boom = this.life <= 0 || this.x < w.left || this.x > w.right;
          if (!boom) for (const o of enemiesOf(w, this.owner)) if (!o.rag && w.hurtDist(o, this.x, this.y) < this.r) boom = true;
          if (boom) {
            this.dead = true;
            blast(w, this.x, this.y, 125 * S, 20, this.owner, '#ff8a1a');
            const gy = groundBelow(w, this.x, this.y);
            if (gy - this.y < 140 * S) w.hazards.push(firePatch(w, this.x, gy, 170 * S, 300, this.owner));
          }
        },
        draw(ctx) {
          for (const [k, c] of [[1.25, INK], [1.1, '#d8340f'], [0.9, '#ff8a1a'], [0.6, '#ffe14d'], [0.3, '#ffffff']]) {
            ctx.fillStyle = c; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * k * (1 + Math.sin(w.tick * 0.7) * 0.06), 0, TAU); ctx.fill();
          }
        },
      });
    },
  },

  ice: {
    name: 'Ice', call: 'ICE AGE!', color: '#7fdcff', color2: '#ffffff', cd: 400, cast: 14, after: 16, pose: CAST_POSES.stomp, pose2: CAST_POSES.slam,
    desc: 'A wave of ice spikes that freezes enemies solid.',
    ready: (f, o, adx, dy) => f.onGround && adx < 400 * f.S && Math.abs(dy) < 45 * f.S,
    fire(f, w) {
      const S = w.S, dir = f.facing;
      w.shake = Math.max(w.shake, 8);
      w.hazards.push({
        i: 0, t: 0, x0: f.x, dir, owner: f, hit: new Set(),
        update(w) {
          if (++this.t % 3) return;
          this.i++;
          const x = this.x0 + this.dir * this.i * 30 * S;
          if (this.i > 12 || x < w.left || x > w.right) { this.dead = true; return; }
          const gy = groundBelow(w, x, this.owner.y - 30 * S);
          addDecal(w, { kind: 'ice', x, y: gy, h: rand(38, 62) * S, life: 220, seed: Math.random() });
          for (let k = 0; k < 4; k++) w.fx.push({ type: 'sq', x: x + rand(-10, 10) * S, y: gy - rand(0, 20) * S, vx: rand(-2, 2) * S, vy: rand(-4, -1) * S, size: 4 * S, life: 18, max: 18, color: '#ffffff' });
          for (const o of enemiesOf(w, this.owner)) {
            if (this.hit.has(o) || Math.abs(o.x - x) > 24 * S || Math.abs(o.y - gy) > 50 * S) continue;
            this.hit.add(o);
            hurt(w, this.owner, o, 9, this.dir * 2 * S, -7 * S, { freeze: 90 });
          }
        },
      });
    },
  },

  light: {
    name: 'Light', call: 'LIGHT SPEED!', color: '#ffe95a', color2: '#ffffff', cd: 330, cast: 5, after: 40, pose: CAST_POSES.punch,
    desc: 'Teleports between enemies at the speed of light, kicking each one.',
    ready: (f, o, adx) => adx < 760 * f.S,
    fire(f, w) {
      const S = w.S;
      const targets = enemiesOf(w, f).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x)).slice(0, 3);
      if (!targets.length) targets.push(null);
      f.invuln = 50;
      w.hazards.push({
        owner: f, targets, step: 0, t: 0,
        update(w) {
          const g = this.owner;
          if (g.state !== 'cast' || this.step >= this.targets.length) { this.dead = true; return; }
          if (this.t++ % 9) return;
          const o = this.targets[this.step++];
          const fromX = g.pts.hip.x, fromY = g.pts.hip.y;
          const side = o ? (chance(0.5) ? 1 : -1) : g.facing;
          const tx = clamp(o ? o.x + side * 30 * S : g.x + g.facing * 220 * S, w.left + 20 * S, w.right - 20 * S);
          g.x = tx; g.y = o ? o.y : g.y; g.vx = 0; g.vy = 0;
          g.onGround = !!(o && o.onGround); g.plat = o ? o.plat : g.plat;
          if (o) g.facing = sign(o.x - g.x) || g.facing;
          g.skeleton();
          w.fx.push({ type: 'beamline', x1: fromX, y1: fromY, x2: g.pts.hip.x, y2: g.pts.hip.y, life: 12, max: 12, color: '#ffe95a' });
          w.flashFx(g.pts.hip.x, g.pts.hip.y, 30 * S, '#ffe95a');
          if (o) {
            hurt(w, g, o, 10, g.facing * 9 * S, -7 * S);
            w.burst(o.pts.neck.x, o.pts.neck.y, 90 * S, '#ffe95a');
            w.elemFx('volt', o.pts.neck.x, o.pts.neck.y, g.facing, 10);
          }
        },
      });
    },
  },

  quake: {
    name: 'Quake', call: 'SEAQUAKE!', color: '#f1f1f1', color2: '#9fd8ff', cd: 450, cast: 24, after: 18, pose: CAST_POSES.charge, pose2: CAST_POSES.punch,
    desc: 'Punches the air so hard the screen cracks. Sends everything flying.',
    ready: (f, o, adx, dy) => adx < 250 * f.S && Math.abs(dy) < 90 * f.S,
    charge(f, w) { if (w.tick % 2 === 0) w.shake = Math.max(w.shake, 3); },
    fire(f, w) {
      const S = w.S, h = f.pts.h1, dir = f.facing;
      addDecal(w, { kind: 'glass', x: h.x + dir * 14 * S, y: h.y, r: 150 * S, life: 600, seed: Math.random() });
      w.shake = Math.max(w.shake, 28);
      w.impactT = 5;
      w.burst(h.x, h.y, 220 * S, '#ffffff');
      w.ring(h.x, h.y, '#ffffff', 160 * S);
      w.ring(h.x, h.y, '#9fd8ff', 240 * S);
      for (const o of w.fighters) {
        if (o === f) continue;
        const dx = (o.x - h.x) * dir, dy = o.pts.hip.y - h.y;
        if (dx < -25 * S || dx > 280 * S || Math.abs(dy) > 130 * S) continue;
        const k = 1 - Math.max(0, dx) / (300 * S);
        if (!hurt(w, f, o, 17 * (0.6 + 0.4 * k), dir * 17 * k * S, -9 * k * S) && o.rag) {
          for (const p of o.rag.p) { p.ox -= dir * 10 * k * S; p.oy += 6 * S; }
        }
      }
      shove(w, h.x + dir * 120 * S, h.y, 220 * S, 12, f);
      breakDrawn(w, h.x + dir * 100 * S, h.y, 170 * S);
      if (h.x + dir * 280 * S < w.left || h.x + dir * 280 * S > w.right) w.crack(dir > 0 ? w.right - 1 : w.left + 1, h.y, -dir, 20);
    },
  },

  dark: {
    name: 'Dark', call: 'BLACK HOLE!', color: '#7a2bff', color2: '#1a0030', cd: 540, cast: 16, after: 16, pose: CAST_POSES.up,
    desc: 'A black hole that drags everyone in, then implodes.',
    ready: (f, o, adx) => adx < 520 * f.S,
    fire(f, w, o) {
      const S = w.S;
      const x = o ? o.x : f.x + f.facing * 200 * S, y = (o ? o.y : f.y) - 50 * S;
      blackHole(f, w, x, y, {});
    },
  },

  rumble: {
    name: 'Rumble', call: 'EL THOR!', color: '#3fd0ff', color2: '#ffffff', cd: 420, cast: 18, after: 30, pose: CAST_POSES.up,
    desc: 'Calls down a storm of lightning bolts on every enemy.',
    ready: () => true,
    fire(f, w) {
      const S = w.S;
      w.hazards.push({
        n: 0, t: 0, owner: f,
        update(w) {
          if (this.t++ % 11) return;
          if (++this.n > 6) { this.dead = true; return; }
          const foes = enemiesOf(w, this.owner);
          const o = foes.length ? foes[this.n % foes.length] : null;
          const x = clamp(o ? o.x + rand(-25, 25) * S : this.owner.x + this.owner.facing * rand(80, 300) * S, w.left + 10, w.right - 10);
          const gy = groundBelow(w, x, (o ? o.y : this.owner.y) - 40 * S);
          const pts = [];
          let px = x + rand(-40, 40), py = -10;
          while (py < gy) { pts.push({ x: px, y: py }); py += rand(25, 55); px = lerp(px + rand(-26, 26), x, 0.2); }
          pts.push({ x, y: gy });
          w.fx.push({ type: 'bolt', pts, life: 12, max: 12 });
          w.flashFx(x, gy - 20 * S, 46 * S, '#9ef0ff');
          w.burst(x, gy - 10 * S, 110 * S, '#9ef0ff');
          w.elemFx('volt', x, gy - 20 * S, 1, 14);
          w.shake = Math.max(w.shake, 10);
          addDecal(w, { kind: 'scorch', x, y: gy, r: 40 * S, life: 700 });
          for (const d of enemiesOf(w, this.owner)) {
            if (Math.abs(d.pts.hip.x - x) < 42 * S && d.pts.hip.y > gy - 160 * S && d.pts.hip.y < gy + 10) hurt(w, this.owner, d, 9, rand(-3, 3) * S, -6 * S, { stun: 26 });
          }
          shove(w, x, gy, 60 * S, 6, this.owner);
        },
      });
    },
  },

  gravity: {
    name: 'Gravity', call: 'METEOR!', color: '#b05cff', color2: '#ff8a1a', cd: 600, cast: 20, after: 14, pose: CAST_POSES.up,
    desc: 'Pulls a meteor out of the sky. Leaves a crater.',
    ready: (f, o, adx) => adx > 60 * f.S,
    fire(f, w, o) {
      const S = w.S;
      const tx = clamp(o ? o.x : f.x + f.facing * 260 * S, w.left + 40 * S, w.right - 40 * S);
      const ty = groundBelow(w, tx, (o ? o.y : f.y) - 30 * S);
      const sx = tx - f.facing * 320 * S, sy = -80;
      w.hazards.push({
        tx, ty, sx, sy, t: 0, T: 48, owner: f, r: 30 * S,
        update(w) {
          this.t++;
          const k = this.t / this.T;
          this.x = lerp(this.sx, this.tx, k); this.y = lerp(this.sy, this.ty - this.r * 0.6, k);
          for (let i = 0; i < 3; i++) w.fx.push({ type: 'flame', x: this.x + rand(-1, 1) * this.r, y: this.y + rand(-1, 1) * this.r, vx: rand(-1, 1) * S, vy: rand(-2.5, -0.5) * S, r: rand(5, 10) * S, life: randi(14, 26), max: 26, E: ELEMENTS.fire });
          if (this.t >= this.T) {
            this.dead = true;
            blast(w, this.tx, this.ty - 10 * S, 180 * S, 24, this.owner, '#ff8a1a');
            addDecal(w, { kind: 'crater', x: this.tx, y: this.ty, r: 85 * S, life: 1200, seed: Math.random() });
            w.crack(this.tx, this.ty, 0, 24);
            w.shake = Math.max(w.shake, 30);
            w.impactT = 5;
            for (let i = 0; i < 22; i++) {
              const a = -Math.PI / 2 + rand(-1.2, 1.2), sp = rand(4, 10) * S;
              w.fx.push({ type: 'sq', x: this.tx, y: this.ty - 6 * S, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rand(4, 8) * S, life: 34, max: 34, color: chance(0.5) ? '#6a4a35' : '#3a2a20' });
            }
          }
        },
        draw(ctx) {
          // Target warning.
          const k = this.t / this.T;
          ctx.strokeStyle = w.tick % 6 < 3 ? '#ff2a2a' : '#ffffff';
          ctx.lineWidth = T;
          ctx.setLineDash([4 * T, 3 * T]);
          ctx.beginPath(); ctx.ellipse(this.tx, this.ty, 90 * S * (1.3 - k * 0.5), 20 * S, 0, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          if (this.x == null) return;
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 2 * T, 0, TAU); ctx.fill();
          ctx.fillStyle = '#5a3a28'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#ff8a1a'; ctx.lineWidth = 2 * T;
          for (let i = 0; i < 3; i++) {
            const a = i * 2.1 + 0.4;
            ctx.beginPath(); ctx.moveTo(this.x + Math.cos(a) * this.r * 0.2, this.y + Math.sin(a) * this.r * 0.2);
            ctx.lineTo(this.x + Math.cos(a + 0.4) * this.r * 0.8, this.y + Math.sin(a + 0.4) * this.r * 0.8); ctx.stroke();
          }
        },
      });
    },
  },

  buddha: {
    name: 'Buddha', call: 'BUDDHA!', color: '#ffd21a', color2: '#fff4b0', cd: 1100, cast: 22, after: 6, pose: CAST_POSES.up,
    desc: 'Grows into a golden giant for 8 seconds. Bigger, stronger, scarier.',
    ready: (f, o, adx) => adx < 320 * f.S && !f.giantT,
    fire(f, w) {
      f.giantT = 480;
      w.flashFx(f.pts.neck.x, f.pts.neck.y, 60 * w.S, '#ffd21a');
      w.burst(f.pts.neck.x, f.pts.neck.y, 200 * w.S, '#ffd21a');
      w.ring(f.pts.neck.x, f.pts.neck.y, '#ffd21a', 140 * w.S);
      w.shake = Math.max(w.shake, 14);
    },
  },

  ki: {
    name: 'Ki Beam', call: 'KA-ME-HA-ME...', call2: 'HAAAA!', color: '#59c8ff', color2: '#ffffff', cd: 720, cast: 46, after: 58, pose: CAST_POSES.charge, pose2: CAST_POSES.fire,
    desc: 'Charges up and fires a screen-wide energy beam.',
    ready: (f, o, adx, dy) => f.onGround && Math.abs(dy) < 50 * f.S && adx < 1000 * f.S,
    charge(f, w) {
      const h = { x: (f.pts.h1.x + f.pts.h2.x) / 2, y: (f.pts.h1.y + f.pts.h2.y) / 2 };
      if (w.tick % 2 === 0) w.fx.push({ type: 'charge', x: h.x + rand(-40, 40) * w.S, y: h.y + rand(-40, 40) * w.S, tx: f.pts.h1, life: 12, max: 12, color: chance(0.5) ? '#59c8ff' : '#ffffff' });
    },
    fire(f, w) {
      const S = w.S;
      w.text(f.pts.head.x, f.pts.head.y - 34 * S, this.call2, '#59c8ff', 24);
      kiBeam(f, w, {});
    },
  },
};
const ABILITY_KEYS = Object.keys(ABILITIES);

// Black hole hazard (Dark power and its ultimate).
function blackHole(f, w, x, y, o) {
  const S = w.S;
  w.hazards.push({
    x, y, R: (o.R || 150) * S, life: o.life || 160, max: o.life || 160, owner: f, spin: 0, pullK: o.pull || 1.3,
    update(w) {
      this.life--; this.spin += 0.18;
      for (const d of w.fighters) {
        if (d === this.owner || (w.phase === 'fight' && !w.isEnemy(this.owner, d))) continue;
        const dx = this.x - d.pts.hip.x, dy = this.y - d.pts.hip.y, dist = Math.hypot(dx, dy);
        if (dist > this.R * this.pullK || d.state === 'held') continue;
        const pull = 0.9 * S * (1 - dist / (this.R * this.pullK)) + 0.2 * S;
        if (d.rag) for (const p of d.rag.p) { p.ox -= (dx / (dist || 1)) * pull; p.oy -= (dy / (dist || 1)) * pull + 0.4 * S; }
        else if (dist > 18 * S) { d.vx += (dx / dist) * pull; if (dist < this.R * 0.7 && d.onGround) { d.vy = -3 * S; d.onGround = false; d.plat = null; d.setState('air'); } }
        if (this.life % 16 === 0 && dist < this.R * 0.6) hurt(w, this.owner, d, 2.5, 0, 0, { stun: 12 });
      }
      for (const it of w.items) { const dx = this.x - it.x, dy = this.y - it.y, dist = Math.hypot(dx, dy) || 1; if (dist < this.R) { it.vx += dx / dist * 0.6 * S; it.vy += dy / dist * 0.6 * S; it.onGround = false; } }
      if (w.tick % 2 === 0) {
        const a = rand(0, TAU), d = this.R * rand(0.8, 1.2);
        w.fx.push({ type: 'charge', x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d, tx: this, life: 14, max: 14, color: chance(0.5) ? '#7a2bff' : '#c9a6ff' });
      }
      breakDrawn(w, this.x, this.y, this.R * 0.4);
      if (this.life <= 0) {
        this.dead = true;
        blast(w, this.x, this.y, (o.implode || 170) * S, o.dmg || 16, this.owner, '#7a2bff');
        w.impactT = 4;
      }
    },
    draw(ctx, w) {
      const k = Math.min(1, (this.max - this.life) / 20) * (this.life < 10 ? this.life / 10 : 1);
      const r = this.R * 0.45 * k;
      ctx.fillStyle = 'rgba(122,43,255,0.35)';
      ctx.beginPath(); ctx.arc(this.x, this.y, r * 1.9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7a2bff'; ctx.lineWidth = 4 * T;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        for (let s = 0; s <= 20; s++) {
          const a = this.spin + i * TAU / 4 + s * 0.22, d = r * 1.8 * (1 - s / 20);
          const px = this.x + Math.cos(a) * d, py = this.y + Math.sin(a) * d * 0.8;
          if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c9a6ff'; ctx.lineWidth = 2 * T; ctx.stroke();
    },
  });
}

// Energy beam hazard locked to the caster's hands (Ki Beam power and its ultimate).
function kiBeam(f, w, o) {
  const S = w.S;
  w.hazards.push({
    owner: f, life: o.life || 56, max: o.life || 56, w: (o.width || 24) * S, hits: new Map(), dmg: o.dmg || 3.2,
    update(w) {
      const g = this.owner;
      if (g.state !== 'cast' || g.hp <= 0) { this.dead = true; return; }
      this.life--;
      if (this.life <= 0) { this.dead = true; return; }
      const dir = g.facing;
      this.x0 = (g.pts.h1.x + g.pts.h2.x) / 2 + dir * 6 * S;
      this.y0 = (g.pts.h1.y + g.pts.h2.y) / 2;
      this.x1 = dir > 0 ? w.right : w.left;
      w.shake = Math.max(w.shake, 5);
      for (const d of w.fighters) {
        if (d === g) continue;
        const hx = d.pts.hip.x;
        if ((hx - this.x0) * dir < 0 || Math.abs(d.pts.hip.y - 20 * S - this.y0) > this.w + 35 * S) continue;
        if (w.tick - (this.hits.get(d) || -99) >= 6) {
          this.hits.set(d, w.tick);
          if (!hurt(w, g, d, this.dmg, dir * 6 * S, -3 * S, { stun: 10 }) && d.rag) for (const p of d.rag.p) p.ox -= dir * 4 * S;
        }
      }
      breakDrawn(w, (this.x0 + this.x1) / 2, this.y0, Math.abs(this.x1 - this.x0) / 2);
      if (w.tick % 3 === 0) w.dust(this.x1 - dir * 6 * S, this.y0 + rand(-20, 20) * S, 2);
      if (this.life === 1) addDecal(w, { kind: 'glass', x: this.x1, y: this.y0, r: (o.width ? o.width * 3 : 70) * S, life: 360, seed: Math.random() });
    },
    draw(ctx, w) {
      if (this.x0 == null) return;
      const k = Math.min(1, (this.max - this.life) / 5) * Math.min(1, this.life / 8);
      const wd = this.w * k * (1 + Math.sin(w.tick * 0.9) * 0.08);
      const x = Math.min(this.x0, this.x1), len = Math.abs(this.x1 - this.x0);
      for (const [m, c] of [[1.5, INK], [1.3, '#1468ff'], [1.0, '#59c8ff'], [0.55, '#bff0ff'], [0.3, '#ffffff']]) {
        ctx.fillStyle = c;
        ctx.fillRect(x, this.y0 - wd * m, len, wd * m * 2);
        ctx.beginPath(); ctx.arc(this.x0, this.y0, wd * m * 1.3, 0, TAU); ctx.fill();
      }
    },
  });
}

// ---- items on the ground -----------------------------------------------------

function spawnItem(w, kind, x, y, o = {}) {
  const S = w.S;
  const it = { kind, x: clamp(x, w.left + 14 * S, w.right - 14 * S), y, vx: o.vx || 0, vy: o.vy || 0, onGround: false, plat: null,
    t: 0, uses: o.uses, fuse: o.fuse || 0, thrower: o.thrower || null, id: ++w.itemId };
  w.items.push(it);
  if (w.items.length > 40) w.items.shift();
  return it;
}

function wantsItem(f, it) {
  if (it.fuse) return false;
  if (WEAPONS[it.kind]) return !f.weapon;
  if (ABILITIES[it.kind]) return !f.ability;
  if (it.kind === 'medkit') return f.hp < 100;
  if (it.kind === 'energy') return f.meter < 100;
  if (it.kind === 'grenade') return (f.grenades || 0) < 3;
  return false;
}

// Hand an item to a fighter (by pickup or straight from the Armory).
function giveItem(w, f, kind, o = {}) {
  const S = w.S, at = f.pts.neck;
  if (WEAPONS[kind]) {
    if (f.weapon) f.dropWeapon();
    f.weapon = { kind, uses: o.uses || WEAPONS[kind].uses };
    if (!f.bubble || chance(0.5)) f.say(pick(['Ooh, a ' + WEAPONS[kind].name.toLowerCase() + '!', 'Now we\'re talking.', 'Mine!']), 90);
  } else if (ABILITIES[kind]) {
    const ab = ABILITIES[kind];
    f.ability = kind;
    f.abilityCD = 90;
    w.text(at.x, at.y - 40 * S, ab.name + ' fruit!', ab.color, 16);
    w.ring(at.x, at.y, ab.color, 60 * S);
    w.burst(at.x, at.y, 110 * S, ab.color);
    f.say(pick(['*crunch*', 'Tastes weird...', 'I feel... powerful.', 'Can\'t swim now.']), 100);
  } else if (kind === 'medkit') {
    const heal = Math.min(45, 100 - f.hp);
    f.hp = Math.min(100, f.hp + 45);
    w.text(at.x, at.y - 20 * S, '+' + Math.round(heal), '#40e070', 16);
    w.ring(f.pts.hip.x, f.pts.hip.y, '#40e070', 40 * S);
  } else if (kind === 'energy') {
    f.meter = 100;
    w.text(at.x, at.y - 20 * S, 'FULL POWER', f.elc.hot, 8);
    w.ring(f.pts.hip.x, f.pts.hip.y, f.elc.main, 40 * S);
  } else if (kind === 'grenade') {
    f.grenades = (f.grenades || 0) + 1;
  }
  if (f.ai) f.ai.itemGoal = null;
}

function updateItems(w) {
  const S = w.S, g = GRAV * S * w.gravMul;
  for (const it of w.items) {
    it.t++;
    if (!it.fuse && it.t > 3600) it.dead = true; // unclaimed items vanish after a minute
    if (it.plat && (it.plat.dead || it.x < it.plat.x1 || it.x > it.plat.x2)) { it.onGround = false; it.plat = null; }
    if (!it.onGround) {
      const prevY = it.y;
      it.vy = Math.min(it.vy + g, 16 * S);
      it.x += it.vx; it.y += it.vy;
      if (it.x < w.left + 10 * S || it.x > w.right - 10 * S) { it.x = clamp(it.x, w.left + 10 * S, w.right - 10 * S); it.vx *= -0.5; }
      if (it.vy >= 0) {
        const p = w.findLanding(it.x, prevY, it.y, false);
        if (p) {
          it.y = p.floor ? w.floorY : p.yAt(it.x);
          if (it.vy > 4 * S) { it.vy *= -0.35; it.vx *= 0.6; } else { it.vy = 0; it.vx = 0; it.onGround = true; it.plat = p; }
        }
      }
    } else if (it.plat) it.y = it.plat.floor ? w.floorY : it.plat.yAt(it.x);
    if (it.fuse) {
      it.fuse--;
      if (it.fuse % 8 === 0) w.fx.push({ type: 'sq', x: it.x, y: it.y - 14 * S, vx: rand(-0.5, 0.5) * S, vy: -1 * S, size: 2.5 * S, life: 10, max: 10, color: '#ffd21a' });
      if (it.fuse <= 0) { it.dead = true; blast(w, it.x, it.y - 6 * S, 100 * S, 15, it.thrower, '#ffb347'); }
    }
  }
  // Pickups.
  for (const f of w.fighters) {
    if (f.rag || f.hp <= 0 || f.state === 'grabbed' || f.state === 'frozen') continue;
    for (const it of w.items) {
      if (it.dead || !wantsItem(f, it)) continue;
      if (Math.abs(it.x - f.x) < 24 * f.S && it.y > f.y - 95 * f.S && it.y < f.y + 14 * f.S) {
        it.dead = true;
        w.ring(it.x, it.y - 8 * S, '#ffffff', 22 * S);
        giveItem(w, f, it.kind, { uses: it.uses });
      }
    }
  }
  w.items = w.items.filter((it) => !it.dead);
}

function updateHazards(w) {
  for (const h of w.hazards) h.update(w);
  w.hazards = w.hazards.filter((h) => !h.dead);
}

function firePatch(w, x, y, width, life, owner) {
  const S = w.S;
  addDecal(w, { kind: 'scorch', x, y, r: width * 0.6, life: 900 });
  return {
    x, y, width, life, owner,
    update(w) {
      if (--this.life <= 0) { this.dead = true; return; }
      if (w.tick % 2 === 0) {
        w.fx.push({ type: 'flame', x: this.x + rand(-0.5, 0.5) * this.width, y: this.y - rand(0, 4) * S, vx: rand(-0.3, 0.3) * S, vy: rand(-2.2, -0.8) * S,
          r: rand(3, 7) * S * Math.min(1, this.life / 60), life: randi(14, 24), max: 24, E: ELEMENTS.fire });
      }
      if (this.life % 20 === 0) {
        for (const d of enemiesOf(w, this.owner)) {
          if (!d.rag && d.onGround && Math.abs(d.x - this.x) < this.width / 2 && Math.abs(d.y - this.y) < 16 * S) hurt(w, this.owner, d, 3, 0, -3 * S, { stun: 8 });
        }
      }
    },
  };
}

function updateArsenal(w) {
  updateItems(w);
  updateHazards(w);
  for (const f of w.fighters) {
    if (f.ability && !f.rag && f.hp > 0 && (w.tick + f.id * 3) % 7 === 0) powerAmbience(w, f);
    if (f.giantT > 0 && w.tick % 3 === 0 && !f.rag) {
      w.fx.push({ type: 'star', x: f.pts.head.x + rand(-30, 30) * f.S, y: f.pts.head.y + rand(-30, 40) * f.S, r: rand(4, 7) * f.S, life: 16, max: 16, E: { main: '#ffd21a', hot: '#fff4b0' } });
    }
  }
}

// Constant per-power particles so you can tell who has what at a glance.
function powerAmbience(w, f) {
  const S = f.S, P = f.pts, hand = chance(0.5) ? P.h1 : P.h2;
  switch (f.ability) {
    case 'flame': w.fx.push({ type: 'flame', x: hand.x, y: hand.y, vx: rand(-0.3, 0.3) * S, vy: rand(-1.6, -0.8) * S, r: rand(2.5, 4) * S, life: 14, max: 14, E: ELEMENTS.fire }); break;
    case 'ice': w.fx.push({ type: 'sq', x: hand.x + rand(-6, 6) * S, y: hand.y, vx: 0, vy: 0.4 * S, size: 3 * S, life: 18, max: 18, color: chance(0.5) ? '#bfefff' : '#ffffff' }); break;
    case 'light': w.fx.push({ type: 'star', x: hand.x + rand(-8, 8) * S, y: hand.y + rand(-8, 8) * S, r: 4 * S, life: 12, max: 12, E: { main: '#ffe95a', hot: '#ffffff' } }); break;
    case 'quake': if (w.tick % 28 < 7) w.fx.push({ type: 'ring', x: hand.x, y: hand.y, life: 14, max: 14, r: 14 * S, color: '#ffffff' }); break;
    case 'dark': w.fx.push({ type: 'flame', x: P.hip.x + rand(-10, 10) * S, y: P.hip.y + rand(-30, 10) * S, vx: 0, vy: -0.8 * S, r: rand(3, 5) * S, life: 18, max: 18, E: { core: '#c9a6ff', hot: '#7a2bff', main: '#3a0a7a', dark: '#120024' } }); break;
    case 'rumble': w.fx.push({ type: 'zap', pts: jagged(hand.x, hand.y, rand(0, TAU), rand(8, 14) * S, 3), life: 4, max: 4, E: ELEMENTS.volt }); break;
    case 'gravity': w.fx.push({ type: 'sq', x: P.head.x + rand(-16, 16) * S, y: P.head.y - 18 * S, vx: 0, vy: -0.3 * S, size: 3.5 * S, life: 14, max: 14, color: '#b05cff' }); break;
    case 'buddha': w.fx.push({ type: 'star', x: P.head.x + rand(-14, 14) * S, y: P.head.y - 20 * S, r: 3 * S, life: 12, max: 12, E: { main: '#ffd21a', hot: '#fff4b0' } }); break;
    case 'ki': w.fx.push({ type: 'charge', x: hand.x + rand(-14, 14) * S, y: hand.y + rand(-14, 14) * S, tx: hand, life: 8, max: 8, color: '#59c8ff' }); break;
  }
}

// Power marks drawn on the body: glowing "gloves" in the power's colors, plus a
// signature touch (halo, orbiting rocks, ...).
function drawPowerMarks(ctx, f, w) {
  const ab = ABILITIES[f.ability];
  if (!ab || f.state === 'ko') return;
  const S = f.S, P = f.pts, r = Math.max(2 * U, BODY.limb * S * 0.72);
  const pulse = 1 + Math.sin(w.tick * 0.15 + f.id) * 0.12;
  for (const h of [P.h1, P.h2]) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(h.x, h.y, r * pulse + Math.max(U, 2 * S), 0, TAU); ctx.fill();
    ctx.fillStyle = ab.color; ctx.beginPath(); ctx.arc(h.x, h.y, r * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = ab.color2; ctx.beginPath(); ctx.arc(h.x - r * 0.25, h.y - r * 0.25, r * 0.4, 0, TAU); ctx.fill();
  }
  const hd = P.head, hr = BODY.headR * S;
  if (f.ability === 'buddha') {
    ctx.strokeStyle = '#ffd21a'; ctx.lineWidth = Math.max(U, 2 * S);
    ctx.beginPath(); ctx.arc(hd.x, hd.y, hr * 1.7, 0, TAU); ctx.stroke();
  } else if (f.ability === 'gravity') {
    for (let i = 0; i < 2; i++) {
      const a = w.tick * 0.08 + i * Math.PI;
      const x = hd.x + Math.cos(a) * hr * 2, y = hd.y + Math.sin(a) * hr * 0.7;
      ctx.fillStyle = INK; ctx.fillRect(x - 4 * S, y - 4 * S, 8 * S, 8 * S);
      ctx.fillStyle = '#7a5aa8'; ctx.fillRect(x - 3 * S, y - 3 * S, 6 * S, 6 * S);
    }
  } else if (f.ability === 'light') {
    ctx.strokeStyle = '#ffe95a'; ctx.lineWidth = Math.max(U, 1.5 * S);
    ctx.beginPath(); ctx.arc(hd.x, hd.y, hr + 3 * S, 0, TAU); ctx.stroke();
  }
}

// ---- drawing -----------------------------------------------------------------

const ITEM_COLORS = Object.assign({}, {
  k: '#0a0a0a', w: '#f4f1ea', g: '#9a9aa8', d: '#5c5c6a', n: '#a8693a', N: '#6e4022', r: '#ff2a2a', y: '#ffd21a',
  G: '#3f8f3a', L: '#8fe35a', c: '#29c6ff', s: '#dfe6ee', b: '#2f7dff',
});
// 12x12 item sprites. In fruit sprites X/Y/Z are replaced by the power's colors.
const ITEM_SPRITES = {
  sword: [
    '..........ss', '.........sws', '........sws.', '.......sws..', '......sws...', '.....sws....',
    '....sws.....', '..kksws.....', '...kks......', '..nk.kk.....', '.nn.........', 'nn..........'],
  hammer: [
    '....dddd....', '...dggggd...', '...dggggd...', '...dddddd...', '.....nn.....', '.....nn.....',
    '.....nn.....', '.....nn.....', '.....nn.....', '.....NN.....', '.....NN.....', '.....NN.....'],
  spear: [
    '..........ss', '.........sws', '........sss.', '.......kn...', '......nn....', '.....nn.....',
    '....nn......', '...nn.......', '..nn........', '.nn.........', 'nn..........', '............'],
  blaster: [
    '............', '............', '..kkkkkkkkk.', '.kddddddddck', '.kdggggggdk.', '.kdddddkkk..',
    '.kddk.k.k...', '.kddkkk.....', '.kddk.......', '.kkkk.......', '............', '............'],
  medkit: [
    '............', '....kkkk....', '...k....k...', '.kkkkkkkkkk.', '.kwwwrrwwwk.', '.kwwwrrwwwk.',
    '.kwrrrrrrwk.', '.kwrrrrrrwk.', '.kwwwrrwwwk.', '.kwwwrrwwwk.', '.kkkkkkkkkk.', '............'],
  energy: [
    '....kkkk....', '...kggggk...', '...kbbbbk...', '...kbbybk...', '...kbyybk...', '...kbybbk...',
    '...kyybbk...', '...kbybbk...', '...kbbbbk...', '...kggggk...', '....kkkk....', '............'],
  grenade: [
    '.....gg.....', '....g..g....', '.....kk.....', '....kGGk....', '...kGLGGk...', '..kGLGGGGk..',
    '..kGGGGGGk..', '..kGGGGGGk..', '..kGGGGGGk..', '...kGGGGk...', '....kkkk....', '............'],
  fruit: [
    '.....N.LL...', '.....NLL....', '...kkNkk....', '..kXXXXXXk..', '.kXYYXXYYXk.', '.kXXYXXYXXk.',
    '.kYXXYYXXYk.', '.kXYXXXXYXk.', '.kXXYYYYXXk.', '..kXXXXXXk..', '...kkkkkk...', '............'],
};

function itemSprite(kind) {
  return ABILITIES[kind] ? ITEM_SPRITES.fruit : ITEM_SPRITES[kind];
}
function spriteColor(kind, ch) {
  const ab = ABILITIES[kind];
  if (ab && ch === 'X') return ab.color;
  if (ab && ch === 'Y') return ab.color2;
  return ITEM_COLORS[ch];
}

function drawSprite(ctx, kind, x, y, cell, outline) {
  const rows = itemSprite(kind);
  if (!rows) return;
  const ox = x - 6 * cell, oy = y - 12 * cell;
  if (outline) {
    ctx.fillStyle = outline;
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
      if (rows[r][c] === '.') continue;
      ctx.fillRect(ox + c * cell - cell, oy + r * cell - cell, cell * 3, cell * 3);
    }
  }
  for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
    const col = spriteColor(kind, rows[r][c]);
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
  }
}

function drawItems(ctx, w) {
  const cell = Math.max(U, snap(2.6 * w.S));
  for (const it of w.items) {
    if (!it.fuse && it.t > 3420 && it.t % 10 < 5) continue; // blink before vanishing
    const bob = it.onGround && !it.fuse ? Math.round(Math.sin((w.tick + it.id * 13) * 0.08) * 2) * U : 0;
    const glow = it.fuse ? (it.fuse % 10 < 5 ? '#ff2a2a' : null) : (Math.sin(w.tick * 0.15 + it.id) > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)');
    drawSprite(ctx, it.kind, snap(it.x), snap(it.y - 2 * U + bob), cell, glow);
  }
}

// Weapon held in the front hand, pointing along the forearm.
function drawWeapon(ctx, f, w) {
  if (!f.weapon || f.rag && f.state === 'held') return;
  const W = WEAPONS[f.weapon.kind], S = f.S;
  const h = f.pts.h1, e = f.pts.e1;
  let dx = h.x - e.x, dy = h.y - e.y;
  const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
  const tip = { x: h.x + dx * W.len * S, y: h.y + dy * W.len * S };
  const back = { x: h.x - dx * 6 * S, y: h.y - dy * 6 * S };
  const nx = -dy, ny = dx;
  const line = (a, b, wd, col) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  ctx.lineCap = 'square';
  if (f.weapon.kind === 'sword') {
    line(back, tip, 7 * S, INK); line(h, tip, 3.6 * S, '#e8eef5');
    line({ x: h.x + nx * 7 * S, y: h.y + ny * 7 * S }, { x: h.x - nx * 7 * S, y: h.y - ny * 7 * S }, 4 * S, INK);
    line(back, h, 3 * S, '#a8693a');
  } else if (f.weapon.kind === 'hammer') {
    line(back, tip, 6 * S, INK); line(back, tip, 3 * S, '#a8693a');
    const a = { x: tip.x + nx * 12 * S, y: tip.y + ny * 12 * S }, b = { x: tip.x - nx * 12 * S, y: tip.y - ny * 12 * S };
    line(a, b, 17 * S, INK); line(a, b, 12 * S, '#9a9aa8');
  } else if (f.weapon.kind === 'spear') {
    line(back, tip, 6 * S, INK); line(back, tip, 3 * S, '#a8693a');
    const t2 = { x: tip.x + dx * 12 * S, y: tip.y + dy * 12 * S };
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(t2.x + dx * 2 * S, t2.y + dy * 2 * S); ctx.lineTo(tip.x + nx * 7 * S, tip.y + ny * 7 * S); ctx.lineTo(tip.x - nx * 7 * S, tip.y - ny * 7 * S); ctx.fill();
    ctx.fillStyle = '#dfe6ee';
    ctx.beginPath(); ctx.moveTo(t2.x, t2.y); ctx.lineTo(tip.x + nx * 4.5 * S, tip.y + ny * 4.5 * S); ctx.lineTo(tip.x - nx * 4.5 * S, tip.y - ny * 4.5 * S); ctx.fill();
  } else {
    line(h, tip, 11 * S, INK); line(h, tip, 7 * S, '#5c5c6a');
    line(h, { x: h.x - ny * 0 + nx * -8 * S * f.facing, y: h.y + 8 * S }, 7 * S, INK);
    if (f.state === 'attack' && f.moveKey === 'shoot' && f.phase() === 'active') w.flashFx(tip.x, tip.y, 9 * S, '#ffe14d');
  }
  ctx.lineCap = 'round';
}

function drawHazards(ctx, w) {
  for (const h of w.hazards) if (h.draw) h.draw(ctx, w);
}

function drawIceBlock(ctx, f) {
  const S = f.S;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const j of JOINTS) { const p = f.pts[j]; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = 12 * S;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#9fe6ff';
  ctx.fillRect(x0 - pad, y0 - pad - BODY.headR * S, x1 - x0 + pad * 2, y1 - y0 + pad * 2 + BODY.headR * S);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * T;
  ctx.strokeRect(x0 - pad, y0 - pad - BODY.headR * S, x1 - x0 + pad * 2, y1 - y0 + pad * 2 + BODY.headR * S);
  ctx.beginPath(); ctx.moveTo(x0 - pad + 6 * S, y0 - pad); ctx.lineTo(x0 - pad + 16 * S, y0 - pad - 8 * S); ctx.stroke();
}

function drawDecal(ctx, d, k) {
  const S = 1;
  if (d.kind === 'scorch') {
    ctx.globalAlpha = 0.75 * k;
    ctx.fillStyle = '#1a0d06';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.2, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6 * k;
    ctx.fillStyle = '#3a1c0c';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.6, d.r * 0.12, 0, 0, TAU); ctx.fill();
    if (d.life > d.max - 240) {
      ctx.globalAlpha = (d.life - (d.max - 240)) / 240;
      ctx.fillStyle = '#ff8a1a';
      for (let i = 0; i < 5; i++) ctx.fillRect(snap(d.x + Math.sin(i * 7.3) * d.r * 0.6), snap(d.y - 2), 2 * T, T);
    }
  } else if (d.kind === 'crater') {
    ctx.globalAlpha = k;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.05, d.r * 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0f0805';
    ctx.beginPath(); ctx.ellipse(d.x, d.y + d.r * 0.05, d.r * 0.7, d.r * 0.16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6a4a35';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.fillRect(snap(d.x + Math.cos(a) * d.r), snap(d.y + Math.sin(a) * d.r * 0.3 - 4 * T), 3 * T, 3 * T);
    }
  } else if (d.kind === 'glass') {
    // Shattered-screen web.
    ctx.globalAlpha = k;
    const rays = 11;
    const rnd = (i) => (Math.sin(d.seed * 1000 + i * 12.9898) * 43758.5453) % 1;
    const pts = [];
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + rnd(i) * 0.4;
      const len = d.r * (0.6 + Math.abs(rnd(i + 50)) * 0.6);
      pts.push({ a, len });
    }
    for (const [wd, col] of [[3 * T, 'rgba(255,255,255,0.55)'], [T, INK]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'square';
      for (const p of pts) {
        ctx.beginPath(); ctx.moveTo(d.x, d.y);
        const mx = d.x + Math.cos(p.a + 0.08) * p.len * 0.5, my = d.y + Math.sin(p.a + 0.08) * p.len * 0.5;
        ctx.lineTo(mx, my); ctx.lineTo(d.x + Math.cos(p.a) * p.len, d.y + Math.sin(p.a) * p.len); ctx.stroke();
      }
      for (const ring of [0.25, 0.5]) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const r = Math.min(p.len, d.r) * ring * (1 + rnd(i + 99) * 0.2);
          const x = d.x + Math.cos(p.a) * r, y = d.y + Math.sin(p.a) * r;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(d.x, d.y, 4 * T, 0, TAU); ctx.fill();
    ctx.lineCap = 'round';
  } else if (d.kind === 'ice') {
    const grow = Math.min(1, (d.max - d.life) / 6);
    const h = d.h * grow * (d.life < 30 ? d.life / 30 : 1);
    ctx.globalAlpha = 1;
    const spikes = [[-9, 0.6], [0, 1], [8, 0.75]];
    for (const [ox, hk] of spikes) {
      const x = d.x + ox * (d.h / 50), hh = h * hk;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.moveTo(x - 9 * (d.h / 50) - T, d.y); ctx.lineTo(x, d.y - hh - 2 * T); ctx.lineTo(x + 9 * (d.h / 50) + T, d.y); ctx.fill();
      ctx.fillStyle = d.rock ? '#7a6a5c' : '#9fe6ff';
      ctx.beginPath(); ctx.moveTo(x - 9 * (d.h / 50), d.y); ctx.lineTo(x, d.y - hh); ctx.lineTo(x + 9 * (d.h / 50), d.y); ctx.fill();
      ctx.fillStyle = d.rock ? '#a8968a' : '#ffffff';
      ctx.beginPath(); ctx.moveTo(x - 3 * (d.h / 50), d.y); ctx.lineTo(x, d.y - hh * 0.9); ctx.lineTo(x, d.y); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
