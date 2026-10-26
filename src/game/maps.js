'use strict';
/* Maps: compact arenas built along the bottom of the screen.
 *
 * A map definition's build(b) receives screen bounds (b.L, b.R, b.F, b.S) and
 * returns its pieces:
 *   plats   one-way platforms. Optional flags: style (look), body (how far the
 *           solid part extends down: a number of px or 'floor'), move (motion
 *           function of time -> {dx, dy}), pad (jump pad launch power), conveyor
 *           (px/tick push), ice (slippery), crate (breakable, drops an item)
 *   zones   floor areas: lava (burns and launches), water (bounces back out),
 *           ice (slippery floor)
 *   portals pairs of linked portals
 *   decor   background props drawn behind the fighters
 *   gravity optional gravity multiplier
 * Everything is kept to roughly the bottom 280 units (about a quarter of a 1080p screen). */

const MAP_H = 280; // tallest structure, in fighter units

function mkPlat(b, x1f, x2f, h, style, o = {}) {
  const x1 = b.L + (b.R - b.L) * x1f, x2 = b.L + (b.R - b.L) * x2f, y = b.F - h * b.S;
  const p = new Plat('m' + (++b.n), x1, y, x2, y, 'map', null);
  return Object.assign(p, { style, body: 10 * b.S, bx1: x1, bx2: x2, by: y }, o);
}

const MAPS = {
  rooftops: {
    name: 'Rooftops', desc: 'Leap between city rooftops.',
    sky: '#1d2340',
    build(b) {
      const plats = [
        mkPlat(b, 0.04, 0.2, 95, 'roof', { body: 'floor', seed: 1 }),
        mkPlat(b, 0.26, 0.42, 150, 'roof', { body: 'floor', seed: 2 }),
        mkPlat(b, 0.47, 0.56, 60, 'roof', { body: 'floor', seed: 3 }),
        mkPlat(b, 0.62, 0.79, 125, 'roof', { body: 'floor', seed: 4 }),
        mkPlat(b, 0.84, 0.97, 80, 'roof', { body: 'floor', seed: 5 }),
        mkPlat(b, 0.3, 0.38, 230, 'steel', { body: 6 * b.S }),
      ];
      return { plats, decor: [{ type: 'antenna', x: b.L + (b.R - b.L) * 0.34, y: plats[1].y1, h: 80 * b.S }, { type: 'antenna', x: b.L + (b.R - b.L) * 0.7, y: plats[3].y1, h: 50 * b.S }] };
    },
  },
  isles: {
    name: 'Floating Isles', desc: 'Grassy islands drifting up and down.',
    build(b) {
      const isle = (x1, x2, h, ph) => mkPlat(b, x1, x2, h, 'island', { body: 34 * b.S, move: (t) => ({ dx: 0, dy: Math.sin(t * 0.02 + ph) * 22 * b.S }) });
      return {
        plats: [isle(0.06, 0.18, 80, 0), isle(0.25, 0.37, 160, 1.5), isle(0.44, 0.56, 95, 3), isle(0.63, 0.75, 175, 4.2), isle(0.82, 0.94, 105, 5.3)],
        decor: [{ type: 'cloud', x: 0.3, y: 250 }, { type: 'cloud', x: 0.72, y: 265 }].map((d) => ({ type: d.type, x: b.L + (b.R - b.L) * d.x, y: b.F - d.y * b.S })),
      };
    },
  },
  dojo: {
    name: 'Dojo', desc: 'A wooden stage with balconies and lanterns.',
    build(b) {
      const plats = [
        mkPlat(b, 0.22, 0.78, 45, 'wood', { body: 'floor' }),
        mkPlat(b, 0.08, 0.26, 135, 'wood', { body: 12 * b.S }),
        mkPlat(b, 0.74, 0.92, 135, 'wood', { body: 12 * b.S }),
        mkPlat(b, 0.42, 0.58, 205, 'wood', { body: 12 * b.S }),
      ];
      const decor = [0.3, 0.5, 0.7].map((x) => ({ type: 'lantern', x: b.L + (b.R - b.L) * x, y: b.F - 250 * b.S }));
      decor.push({ type: 'pillar', x: plats[1].x1 + 10 * b.S, y1: plats[1].y1, y2: b.F }, { type: 'pillar', x: plats[2].x2 - 10 * b.S, y1: plats[2].y1, y2: b.F });
      return { plats, decor };
    },
  },
  construction: {
    name: 'Construction Site', desc: 'Girders, a swinging crane and breakable crates.',
    build(b) {
      const W = b.R - b.L;
      const plats = [
        mkPlat(b, 0.05, 0.3, 90, 'steel'),
        mkPlat(b, 0.7, 0.95, 90, 'steel'),
        mkPlat(b, 0.35, 0.65, 165, 'steel'),
        mkPlat(b, 0.42, 0.58, 250, 'steel', { move: (t) => ({ dx: Math.sin(t * 0.012) * W * 0.25, dy: 0 }), hook: true }),
        mkPlat(b, 0.12, 0.16, 90 + 34, 'crate', { body: 34 * b.S, crate: true }),
        mkPlat(b, 0.84, 0.88, 90 + 34, 'crate', { body: 34 * b.S, crate: true }),
        mkPlat(b, 0.48, 0.52, 165 + 34, 'crate', { body: 34 * b.S, crate: true }),
      ];
      return { plats, decor: [{ type: 'crane', x: b.L + W * 0.5, y: b.F - MAP_H * b.S - 20 * b.S }] };
    },
  },
  volcano: {
    name: 'Volcano', desc: 'Rocks over a lava pool that erupts.',
    build(b) {
      const W = b.R - b.L;
      return {
        plats: [
          mkPlat(b, 0.18, 0.34, 70, 'rock', { body: 'floor' }),
          mkPlat(b, 0.66, 0.82, 70, 'rock', { body: 'floor' }),
          mkPlat(b, 0.44, 0.56, 120, 'rock', { body: 22 * b.S, move: (t) => ({ dx: 0, dy: Math.sin(t * 0.025) * 45 * b.S }) }),
          mkPlat(b, 0.05, 0.14, 160, 'rock', { body: 20 * b.S }),
          mkPlat(b, 0.86, 0.95, 160, 'rock', { body: 20 * b.S }),
        ],
        zones: [{ type: 'lava', x1: b.L + W * 0.34, x2: b.L + W * 0.66 }],
      };
    },
  },
  frozen: {
    name: 'Frozen Lake', desc: 'Slippery ice and icicle ledges.',
    build(b) {
      const W = b.R - b.L;
      return {
        plats: [
          mkPlat(b, 0.1, 0.28, 110, 'ice', { ice: true }),
          mkPlat(b, 0.72, 0.9, 110, 'ice', { ice: true }),
          mkPlat(b, 0.4, 0.6, 185, 'ice', { ice: true }),
        ],
        zones: [{ type: 'ice', x1: b.L + W * 0.05, x2: b.L + W * 0.95 }],
        decor: [{ type: 'snow' }],
      };
    },
  },
  trampoline: {
    name: 'Trampoline Park', desc: 'Jump pads launch fighters sky high.',
    build(b) {
      const pad = (x1, x2) => mkPlat(b, x1, x2, 10, 'pad', { pad: 21, body: 'floor' });
      return {
        plats: [pad(0.08, 0.15), pad(0.32, 0.39), pad(0.61, 0.68), pad(0.85, 0.92),
          mkPlat(b, 0.17, 0.3, 230, 'neon'), mkPlat(b, 0.7, 0.83, 230, 'neon'), mkPlat(b, 0.43, 0.57, 150, 'neon')],
      };
    },
  },
  factory: {
    name: 'Factory', desc: 'Conveyor belts and pumping pistons.',
    build(b) {
      return {
        plats: [
          mkPlat(b, 0.06, 0.4, 70, 'conveyor', { conveyor: 2.2 }),
          mkPlat(b, 0.6, 0.94, 70, 'conveyor', { conveyor: -2.2 }),
          mkPlat(b, 0.44, 0.56, 110, 'steel', { body: 'floor', move: (t) => ({ dx: 0, dy: -Math.abs(Math.sin(t * 0.02)) * 110 * b.S }), piston: true }),
          mkPlat(b, 0.2, 0.32, 175, 'steel'),
          mkPlat(b, 0.68, 0.8, 175, 'steel'),
        ],
        decor: [{ type: 'gear', x: b.L + (b.R - b.L) * 0.26, y: b.F - 240 * b.S, r: 26 * b.S }, { type: 'gear', x: b.L + (b.R - b.L) * 0.75, y: b.F - 245 * b.S, r: 20 * b.S }],
      };
    },
  },
  temple: {
    name: 'Temple', desc: 'A stepped pyramid with burning torches.',
    build(b) {
      const plats = [];
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const inset = i * 0.055;
        plats.push(mkPlat(b, 0.25 + inset, 0.75 - inset, 32 + i * 42, 'stone', { body: 'floor' }));
      }
      const decor = [{ type: 'torch', x: b.L + (b.R - b.L) * 0.27, y: plats[0].y1 }, { type: 'torch', x: b.L + (b.R - b.L) * 0.73, y: plats[0].y1 },
        { type: 'torch', x: b.L + (b.R - b.L) * 0.48, y: plats[4].y1 }, { type: 'torch', x: b.L + (b.R - b.L) * 0.52, y: plats[4].y1 }];
      return { plats, decor };
    },
  },
  space: {
    name: 'Space Station', desc: 'Low gravity, floating panels and portals.',
    gravity: 0.45,
    build(b) {
      const W = b.R - b.L;
      const plats = [
        mkPlat(b, 0.08, 0.22, 120, 'panel', { move: (t) => ({ dx: Math.sin(t * 0.01) * 20 * b.S, dy: 0 }) }),
        mkPlat(b, 0.78, 0.92, 120, 'panel', { move: (t) => ({ dx: -Math.sin(t * 0.01) * 20 * b.S, dy: 0 }) }),
        mkPlat(b, 0.38, 0.62, 200, 'panel'),
        mkPlat(b, 0.3, 0.38, 70, 'panel'),
        mkPlat(b, 0.62, 0.7, 70, 'panel'),
      ];
      const portals = [
        { a: { x: b.L + W * 0.04, y: b.F - 40 * b.S }, b: { x: b.L + W * 0.5, y: plats[2].y1 - 45 * b.S }, color: '#2fd3ff' },
        { a: { x: b.L + W * 0.96, y: b.F - 40 * b.S }, b: { x: b.L + W * 0.15, y: plats[0].y1 - 45 * b.S }, color: '#ff58b4' },
      ];
      return { plats, portals, decor: [{ type: 'stars' }] };
    },
  },
  pirate: {
    name: 'Pirate Bay', desc: 'Two rocking ships over the water.',
    build(b) {
      const W = b.R - b.L;
      const rock = (ph) => (t) => ({ dx: 0, dy: Math.sin(t * 0.03 + ph) * 8 * b.S });
      const plats = [
        mkPlat(b, 0.04, 0.36, 70, 'deck', { body: 50 * b.S, move: rock(0) }),
        mkPlat(b, 0.64, 0.96, 70, 'deck', { body: 50 * b.S, move: rock(2) }),
        mkPlat(b, 0.16, 0.24, 210, 'wood', { body: 8 * b.S, move: rock(0), nest: true }),
        mkPlat(b, 0.76, 0.84, 210, 'wood', { body: 8 * b.S, move: rock(2), nest: true }),
        mkPlat(b, 0.45, 0.55, 140, 'wood', { body: 8 * b.S, move: (t) => ({ dx: Math.sin(t * 0.015) * W * 0.06, dy: 0 }) }),
      ];
      return {
        plats,
        zones: [{ type: 'water', x1: b.L + W * 0.36, x2: b.L + W * 0.64 }],
        decor: [{ type: 'mast', p: 0 }, { type: 'mast', p: 1 }],
      };
    },
  },
  jungle: {
    name: 'Jungle', desc: 'Swinging vines and bouncy mushrooms.',
    build(b) {
      const W = b.R - b.L;
      const vine = (x1, x2, h, ph) => mkPlat(b, x1, x2, h, 'vine', { body: 4 * b.S, move: (t) => ({ dx: Math.sin(t * 0.022 + ph) * W * 0.05, dy: Math.abs(Math.cos(t * 0.022 + ph)) * -8 * b.S }) });
      return {
        plats: [
          mkPlat(b, 0.1, 0.16, 18, 'mushroom', { pad: 18, body: 'floor' }),
          mkPlat(b, 0.84, 0.9, 18, 'mushroom', { pad: 18, body: 'floor' }),
          mkPlat(b, 0.47, 0.53, 18, 'mushroom', { pad: 16, body: 'floor' }),
          vine(0.22, 0.34, 170, 0), vine(0.66, 0.78, 170, 2), vine(0.42, 0.58, 235, 1),
          mkPlat(b, 0.02, 0.1, 120, 'wood', { body: 10 * b.S }), mkPlat(b, 0.9, 0.98, 120, 'wood', { body: 10 * b.S }),
        ],
        decor: [{ type: 'tree', x: b.L + W * 0.06 }, { type: 'tree', x: b.L + W * 0.94 }, { type: 'tree', x: b.L + W * 0.5 }],
      };
    },
  },
  arena: {
    name: 'Neon Arena', desc: 'A glowing ring between two towers.',
    build(b) {
      return {
        plats: [
          mkPlat(b, 0.3, 0.7, 85, 'neon', { body: 'floor' }),
          mkPlat(b, 0.06, 0.16, 175, 'neon', { body: 'floor' }),
          mkPlat(b, 0.84, 0.94, 175, 'neon', { body: 'floor' }),
          mkPlat(b, 0.43, 0.57, 195, 'neon'),
          mkPlat(b, 0.2, 0.25, 10, 'pad', { pad: 19, body: 'floor' }),
          mkPlat(b, 0.75, 0.8, 10, 'pad', { pad: 19, body: 'floor' }),
        ],
      };
    },
  },
};
const MAP_KEYS = Object.keys(MAPS);

// Build a map for the given bounds (pure: also used for UI thumbnails).
function buildMap(key, b) {
  const def = MAPS[key];
  if (!def) return null;
  const bb = { L: b.L, R: b.R, F: b.F, S: b.S, n: 0 };
  const m = Object.assign({ plats: [], zones: [], portals: [], decor: [] }, def.build(bb));
  for (const z of m.zones) { z.y1 = b.F - 6 * b.S; z.y2 = b.F + 4; }
  m.key = key; m.def = def; m.gravity = def.gravity || 1; m.t = 0;
  for (const p of m.plats) { p.baseX1 = p.x1; p.baseX2 = p.x2; p.baseY = p.y1; }
  return m;
}

// ---- world integration ---------------------------------------------------------

function setWorldMap(w, key) {
  const old = w.map;
  if (old) for (const p of old.plats) p.dead = true;
  w.mapKey = key && MAPS[key] ? key : null;
  w.map = w.mapKey ? buildMap(w.mapKey, { L: w.left, R: w.right, F: w.floorY, S: w.S }) : null;
  w.mapBounds = boundsKey(w);
  w.gravMul = w.map ? w.map.gravity : 1;
  w.rebuildPlatforms();
  if (w.map) {
    // Drop everyone in from above so nobody ends up inside a building.
    const top = w.floorY - MAP_H * w.S - 60 * w.S;
    for (const f of w.fighters) {
      if (!f.rag) { f.y = Math.min(f.y, top); f.onGround = false; f.plat = null; if (f.state !== 'held') f.setState('air', true); continue; }
      if (f.rag.pin >= 0) continue; // being held by the cursor
      // Knocked-out bodies get lifted above the new map too.
      const dy = Math.min(0, top - Math.max(...f.rag.p.map((q) => q.y)));
      for (const q of f.rag.p) { q.y += dy; q.oy += dy; q.touch = false; }
      f.rag.still = 0;
    }
  }
}

function boundsKey(w) { return [w.left, w.right, w.floorY, w.S].map((v) => Math.round(v)).join(','); }

function mapPlats(w) {
  return w.map ? w.map.plats.filter((p) => !p.dead) : [];
}

function updateMap(w) {
  const m = w.map;
  if (!m) return;
  if (w.mapBounds !== boundsKey(w)) { setWorldMap(w, w.mapKey); return; } // screen or dock changed
  m.t++;
  const S = w.S;
  // Moving platforms carry whoever stands on them.
  for (const p of m.plats) {
    if (!p.move) continue;
    const o = p.move(m.t);
    const nx1 = p.baseX1 + o.dx, ny = p.baseY + o.dy;
    const dx = nx1 - p.x1;
    p.x1 = nx1; p.x2 = p.baseX2 + o.dx; p.y1 = p.y2 = ny;
    for (const f of w.fighters) if (f.onGround && f.plat === p) f.x += dx;
    for (const it of w.items) if (it.onGround && it.plat === p) it.x += dx;
  }
  // Conveyors.
  for (const f of w.fighters) if (f.onGround && f.plat && f.plat.conveyor && !f.rag) f.x += f.plat.conveyor * S;
  for (const it of w.items) if (it.onGround && it.plat && it.plat.conveyor) it.x += it.plat.conveyor * S;
  // Crates come back after a while.
  for (const p of m.plats) if (p.crate && p.dead && --p.respawn <= 0) { p.dead = false; p.hp = 3; w.rebuildPlatforms(); w.puff((p.x1 + p.x2) / 2, p.y1); }
  // Lava, water.
  for (const z of m.zones) {
    if (z.type === 'ice') continue;
    for (const f of w.fighters) {
      if (f.state === 'held') continue;
      const x = f.rag ? f.rag.p[2].x : f.x, y = f.rag ? Math.max(...f.rag.p.map((q) => q.y)) : f.y;
      if (x < z.x1 || x > z.x2 || y < z.y1) continue;
      if ((f.zoneT || 0) > w.tick) continue;
      f.zoneT = w.tick + 20;
      const up = (z.type === 'lava' ? 15 : 13) * S, side = (x - (z.x1 + z.x2) / 2) > 0 ? 1 : -1;
      if (z.type === 'lava') {
        if (w.phase === 'fight' && f.hp > 0) w.damage(f, 7, null);
        w.elemFx('fire', x, z.y1, 1, 14); w.elemFx('fire', x, z.y1, -1, 14);
        w.text(x, y - 90 * S, 'HOT!', '#ff8a1a', 8);
      } else {
        for (let i = 0; i < 12; i++) w.fx.push({ type: 'sq', x: x + rand(-14, 14) * S, y: z.y1, vx: rand(-2, 2) * S, vy: rand(-6, -2) * S, size: 4 * S, life: 26, max: 26, color: chance(0.5) ? '#bff0ff' : '#3f9ae8' });
      }
      if (f.rag) { for (const q of f.rag.p) { q.oy = q.y + up; q.ox = q.x - side * 3 * S; } }
      else {
        f.move = null; f.vy = -up; f.vx = side * 3 * S; f.onGround = false; f.plat = null;
        if (f.hp > 0) f.setState(z.type === 'lava' ? 'hitstun' : 'air', true);
        if (z.type === 'lava') { f.hitstun = 30; f.juggled = false; f.flash = 6; }
      }
      if (f.hp <= 0 && w.phase === 'fight' && !f.rag) { f.startRagdoll(0, -up, 0.1, 'ko'); w.onKO(f, null); }
    }
    if (z.type === 'lava' && w.tick % 4 === 0) w.fx.push({ type: 'flame', x: rand(z.x1, z.x2), y: z.y1 - 2, vx: 0, vy: rand(-2, -0.6) * S, r: rand(3, 6) * S, life: 18, max: 18, E: ELEMENTS.fire });
  }
  // Portals: fighters, ragdolls, items and projectiles all go through.
  for (const pr of m.portals) {
    const r = 26 * S;
    for (const [from, to] of [[pr.a, pr.b], [pr.b, pr.a]]) {
      for (const f of w.fighters) {
        if ((f.portalT || 0) > w.tick || f.state === 'held') continue;
        const hx = f.rag ? f.rag.p[2].x : f.pts.hip.x, hy = f.rag ? f.rag.p[2].y : f.pts.hip.y;
        if (Math.hypot(hx - from.x, hy - from.y) > r) continue;
        // Arrive with the hips at the exit portal, never below the floor.
        const dx = to.x - hx, dy = Math.min(to.y - hy, w.floorY - (f.rag ? Math.max(...f.rag.p.map((q) => q.y)) : f.y));
        f.portalT = w.tick + 45;
        if (f.rag) for (const q of f.rag.p) { q.x += dx; q.ox += dx; q.y += dy; q.oy += dy; }
        else { f.x += dx; f.y += dy; f.onGround = false; f.plat = null; if (ACTIONABLE.has(f.state)) f.setState('air', true); f.skeleton(); }
        w.ring(from.x, from.y, pr.color, 40 * S); w.ring(to.x, to.y, pr.color, 40 * S);
      }
      for (const p of w.projectiles) {
        if ((p.portalT || 0) > w.tick || Math.hypot(p.x - from.x, p.y - from.y) > r) continue;
        p.portalT = w.tick + 30; p.x += to.x - from.x; p.y += to.y - from.y;
      }
    }
  }
}

// Map pieces that react to the fighters.
function mapIceAt(w, x, y) {
  if (!w.map) return false;
  for (const z of w.map.zones) if (z.type === 'ice' && x >= z.x1 && x <= z.x2 && y >= z.y1) return true;
  return false;
}

function hitCrates(w, a, probes, rad) {
  if (!w.map) return;
  for (const p of w.map.plats) {
    if (!p.crate || p.dead || a.hitList.has(p)) continue;
    const top = p.y1, bot = p.y1 + p.body;
    if (!probes.some((q) => q.x > p.x1 - rad && q.x < p.x2 + rad && q.y > top - rad && q.y < bot + rad)) continue;
    a.hitList.add(p);
    damageCrate(w, p, 1, a.facing);
  }
}

function damageCratesNear(w, x, y, R) {
  if (!w.map) return;
  for (const p of w.map.plats) {
    if (!p.crate || p.dead) continue;
    const cx = (p.x1 + p.x2) / 2, cy = p.y1 + p.body / 2;
    if (Math.hypot(cx - x, cy - y) < R) damageCrate(w, p, 3, sign(cx - x) || 1);
  }
}

function damageCrate(w, p, n, dir) {
  const S = w.S, cx = (p.x1 + p.x2) / 2, cy = p.y1 + p.body / 2;
  p.hp = (p.hp == null ? 3 : p.hp) - n;
  w.impact(cx, cy, dir, 6, '#e0b070');
  if (p.hp > 0) return;
  p.dead = true;
  p.respawn = 1200;
  w.rebuildPlatforms();
  for (let i = 0; i < 12; i++) w.fx.push({ type: 'sq', x: cx + rand(-12, 12) * S, y: cy + rand(-12, 12) * S, vx: rand(-4, 4) * S, vy: rand(-6, 0) * S, size: rand(4, 8) * S, life: 30, max: 30, color: chance(0.5) ? '#a8693a' : '#6e4022' });
  w.text(cx, p.y1 - 10 * S, 'CRATE!', '#e0b070', 8);
  const loot = Object.keys(WEAPONS).concat(Object.keys(CONSUMABLES), ABILITY_KEYS);
  spawnItem(w, pick(loot), cx, cy - 10 * S, { vy: -6 * S });
}

// ---- drawing ------------------------------------------------------------------

const MAP_COLORS = {
  roof: ['#2b3150', '#3d4670', '#ffd66b'], wood: ['#8a5a32', '#b07a45', '#5a3a20'], steel: ['#4f6170', '#7f95a8', '#2c3842'],
  rock: ['#4a3a34', '#6e5850', '#2c221e'], ice: ['#7fd2f0', '#e6fbff', '#3a8fb8'], island: ['#6b4a32', '#4fc35a', '#2f7d38'],
  stone: ['#8c8270', '#b3a78f', '#5e5648'], panel: ['#4b5568', '#9fb0c8', '#2fd3ff'], deck: ['#7a4b28', '#a26a3c', '#4a2c16'],
  neon: ['#1b1f3a', '#ff4fd8', '#2fd3ff'], pad: ['#3a3a46', '#ff3b3b', '#ffd21a'], mushroom: ['#e8e0cf', '#ff3b5c', '#ffffff'],
  vine: ['#2f7d38', '#5ad46a', '#1f5a26'], conveyor: ['#30343c', '#5c6370', '#ffd21a'], crate: ['#a8693a', '#d39a5c', '#6e4022'],
};

function drawMapBack(ctx, w, m, t) {
  for (const d of m.decor) drawDecor(ctx, w, m, d, t);
  for (const z of m.zones) drawZone(ctx, w, z, t);
  for (const p of m.plats) if (!p.dead) drawMapPlat(ctx, w, p, t);
  for (const pr of m.portals) for (const end of [pr.a, pr.b]) drawPortal(ctx, w, end, pr.color, t);
}

function bodyBottom(w, p) {
  return p.body === 'floor' ? w.floorY : p.y1 + p.body;
}

function drawMapPlat(ctx, w, p, t) {
  const [base, top, accent] = MAP_COLORS[p.style] || MAP_COLORS.steel;
  const S = w.S, x = p.x1, y = p.y1, wd = p.x2 - p.x1, bot = bodyBottom(w, p), h = Math.max(4, bot - y);
  const ink = INK, o = Math.max(T, 2.2 * S);
  const box = (bx, by, bw, bh, col) => { ctx.fillStyle = ink; ctx.fillRect(bx - o, by - o, bw + 2 * o, bh + 2 * o); ctx.fillStyle = col; ctx.fillRect(bx, by, bw, bh); };
  switch (p.style) {
    case 'roof': {
      box(x, y, wd, h, base);
      ctx.fillStyle = top; ctx.fillRect(x, y, wd, 6 * S);
      // Lit windows.
      const cols = Math.max(1, Math.floor(wd / (22 * S))), rows = Math.floor((h - 16 * S) / (26 * S));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const lit = Math.sin((p.seed || 1) * 99 + r * 7.1 + c * 3.3) > -0.1;
        ctx.fillStyle = lit ? accent : '#1a1e33';
        ctx.fillRect(x + 7 * S + c * (wd - 14 * S) / cols, y + 16 * S + r * 26 * S, 9 * S, 12 * S);
      }
      break;
    }
    case 'island': {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.moveTo(x - o, y); ctx.lineTo(x + wd + o, y); ctx.lineTo(x + wd * 0.5, y + h + o * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + wd, y); ctx.lineTo(x + wd * 0.5, y + h); ctx.closePath(); ctx.fill();
      box(x, y - 2 * S, wd, 9 * S, top);
      break;
    }
    case 'wood': case 'deck': {
      box(x, y, wd, h, base);
      ctx.fillStyle = top; ctx.fillRect(x, y, wd, 5 * S);
      ctx.fillStyle = accent;
      for (let px = x + 18 * S; px < x + wd - 4; px += 24 * S) ctx.fillRect(px, y + 5 * S, T, Math.min(h - 5 * S, 14 * S));
      if (p.style === 'deck') {
        ctx.fillStyle = ink; ctx.fillRect(x - o, y + h - 2, wd + 2 * o, o + 2);
        for (let px = x + 20 * S; px < x + wd - 10 * S; px += 34 * S) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(px, y + h * 0.55, 5 * S, 0, TAU); ctx.fill(); }
      }
      break;
    }
    case 'steel': {
      box(x, y, wd, h, base);
      ctx.strokeStyle = top; ctx.lineWidth = T;
      for (let px = x; px < x + wd - h; px += h * 2) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + h, y + h); ctx.lineTo(px + h * 2, y); ctx.stroke(); }
      if (p.hook) { ctx.strokeStyle = ink; ctx.lineWidth = 2 * T; ctx.beginPath(); ctx.moveTo(x + wd / 2, y); ctx.lineTo(x + wd / 2, w.floorY - MAP_H * S - 20 * S); ctx.stroke(); }
      if (p.piston) { box(x + wd * 0.35, y + h, wd * 0.3, Math.max(0, w.floorY - y - h), accent); }
      break;
    }
    case 'rock': {
      box(x, y, wd, h, base);
      ctx.fillStyle = top; ctx.fillRect(x, y, wd, 6 * S);
      ctx.fillStyle = accent;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + wd * (0.15 + i * 0.22), y + 14 * S + (i % 2) * 10 * S, 8 * S, 5 * S);
      break;
    }
    case 'ice': {
      box(x, y, wd, h, base);
      ctx.fillStyle = top; ctx.fillRect(x, y, wd, 4 * S);
      ctx.fillStyle = base;
      for (let px = x + 6 * S; px < x + wd - 6 * S; px += 16 * S) { ctx.beginPath(); ctx.moveTo(px - 5 * S, y + h); ctx.lineTo(px, y + h + 18 * S); ctx.lineTo(px + 5 * S, y + h); ctx.fill(); }
      break;
    }
    case 'stone': {
      box(x, y, wd, h, base);
      ctx.fillStyle = top; ctx.fillRect(x, y, wd, 5 * S);
      ctx.fillStyle = accent;
      for (let px = x + 14 * S; px < x + wd; px += 30 * S) ctx.fillRect(px, y + 5 * S, T, Math.min(h, 36 * S) - 5 * S);
      break;
    }
    case 'panel': {
      box(x, y, wd, h, base);
      ctx.fillStyle = top; ctx.fillRect(x, y, wd, 3 * S);
      ctx.fillStyle = (t >> 4) % 2 ? accent : '#1a5f72';
      ctx.fillRect(x + wd / 2 - 3 * S, y + h / 2 - 2 * S, 6 * S, 4 * S);
      break;
    }
    case 'neon': {
      box(x, y, wd, h, base);
      ctx.strokeStyle = (t >> 5) % 2 ? top : accent; ctx.lineWidth = 2 * T;
      ctx.strokeRect(x + 2 * S, y + 2 * S, wd - 4 * S, Math.min(h, 40 * S) - 4 * S);
      break;
    }
    case 'pad': case 'mushroom': {
      if (p.style === 'mushroom') {
        box(x + wd * 0.35, y + 6 * S, wd * 0.3, Math.max(0, w.floorY - y - 6 * S), base);
        ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(x + wd / 2, y + 6 * S, wd / 2 + o, 14 * S + o, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(x + wd / 2, y + 6 * S, wd / 2, 14 * S, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = accent; ctx.fillRect(x + wd * 0.25, y - 2 * S, 4 * S, 4 * S); ctx.fillRect(x + wd * 0.65, y - 4 * S, 4 * S, 4 * S);
      } else {
        box(x, y + 4 * S, wd, Math.max(4, w.floorY - y - 4 * S), base);
        box(x + 2 * S, y, wd - 4 * S, 5 * S, top);
        ctx.fillStyle = accent;
        for (let px = x + 6 * S; px < x + wd - 4 * S; px += 10 * S) ctx.fillRect(px, y + 9 * S, 4 * S, 3 * S);
      }
      break;
    }
    case 'vine': {
      ctx.strokeStyle = accent; ctx.lineWidth = 2 * T;
      ctx.beginPath(); ctx.moveTo(x + wd * 0.2, y); ctx.lineTo(x + wd * 0.2 - (p.x1 - p.baseX1) * 0.3, y - 120 * S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + wd * 0.8, y); ctx.lineTo(x + wd * 0.8 - (p.x1 - p.baseX1) * 0.3, y - 120 * S); ctx.stroke();
      box(x, y, wd, 6 * S, top);
      break;
    }
    case 'conveyor': {
      box(x, y, wd, 16 * S, base);
      ctx.fillStyle = accent;
      const off = ((t * p.conveyor * 0.6) % (16 * S) + 16 * S) % (16 * S);
      for (let px = x + off; px < x + wd - 4 * S; px += 16 * S) ctx.fillRect(px, y + 2 * S, 7 * S, 3 * S);
      ctx.fillStyle = ink;
      for (const cx of [x + 8 * S, x + wd - 8 * S]) { ctx.beginPath(); ctx.arc(cx, y + 10 * S, 5 * S, 0, TAU); ctx.fill(); }
      box(x + 6 * S, y + 16 * S, 6 * S, Math.max(0, w.floorY - y - 16 * S), '#3a3f48');
      box(x + wd - 12 * S, y + 16 * S, 6 * S, Math.max(0, w.floorY - y - 16 * S), '#3a3f48');
      break;
    }
    case 'crate': {
      box(x, y, wd, h, base);
      ctx.strokeStyle = accent; ctx.lineWidth = 2 * T;
      ctx.strokeRect(x + 3 * S, y + 3 * S, wd - 6 * S, h - 6 * S);
      ctx.beginPath(); ctx.moveTo(x + 3 * S, y + 3 * S); ctx.lineTo(x + wd - 3 * S, y + h - 3 * S); ctx.stroke();
      if (p.hp != null && p.hp < 3) { ctx.strokeStyle = ink; ctx.lineWidth = T; ctx.beginPath(); ctx.moveTo(x + wd * 0.6, y); ctx.lineTo(x + wd * 0.45, y + h * 0.5); ctx.stroke(); }
      break;
    }
    default:
      box(x, y, wd, h, base);
  }
}

function drawZone(ctx, w, z, t) {
  const S = w.S, wd = z.x2 - z.x1, y = z.y1;
  if (z.type === 'lava') {
    ctx.fillStyle = INK; ctx.fillRect(z.x1, y - 2 * S, wd, w.floorY - y + 4);
    ctx.fillStyle = '#ff5a1a'; ctx.fillRect(z.x1, y, wd, w.floorY - y + 2);
    ctx.fillStyle = '#ffd21a';
    for (let px = z.x1; px < z.x2; px += 22 * S) ctx.fillRect(px + Math.sin(t * 0.05 + px) * 6 * S + 8 * S, y + 1, 8 * S, 2 * S);
  } else if (z.type === 'water') {
    ctx.fillStyle = '#1d5fa8'; ctx.fillRect(z.x1, y - 4 * S, wd, w.floorY - y + 6 * S);
    ctx.fillStyle = '#7fd2ff';
    for (let px = z.x1; px < z.x2; px += 26 * S) ctx.fillRect(px + Math.sin(t * 0.04 + px * 0.1) * 6 * S, y - 4 * S, 12 * S, 2 * S);
  } else if (z.type === 'ice') {
    ctx.fillStyle = 'rgba(160,230,255,0.75)'; ctx.fillRect(z.x1, y + 2 * S, wd, 6 * S);
    ctx.fillStyle = '#ffffff';
    for (let px = z.x1 + 20 * S; px < z.x2; px += 90 * S) ctx.fillRect(px, y + 3 * S, 24 * S, T);
  }
}

function drawPortal(ctx, w, p, color, t) {
  const S = w.S, r = 22 * S;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.55 + 3 * T, r + 3 * T, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.55, r, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  const k = (Math.sin(t * 0.1) + 1) / 2;
  ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.25 * (0.6 + k * 0.4), r * 0.55 * (0.6 + k * 0.4), 0, 0, TAU); ctx.fill();
}

function drawDecor(ctx, w, m, d, t) {
  const S = w.S;
  switch (d.type) {
    case 'antenna':
      ctx.strokeStyle = INK; ctx.lineWidth = 2 * T;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - d.h); ctx.stroke();
      ctx.fillStyle = (t >> 5) % 2 ? '#ff3b3b' : '#5a1010';
      ctx.fillRect(d.x - 3 * S, d.y - d.h - 4 * S, 6 * S, 6 * S);
      break;
    case 'cloud':
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [ox, oy, r] of [[0, 0, 18], [20, -6, 22], [42, 0, 16]]) { ctx.beginPath(); ctx.arc(d.x + ox * S + Math.sin(t * 0.004) * 20 * S, d.y + oy * S, r * S, 0, TAU); ctx.fill(); }
      break;
    case 'lantern': {
      ctx.strokeStyle = INK; ctx.lineWidth = T;
      ctx.beginPath(); ctx.moveTo(d.x, d.y - 30 * S); ctx.lineTo(d.x, d.y); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(d.x, d.y + 10 * S, 11 * S, 14 * S, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff4a2a'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 10 * S, 9 * S, 12 * S, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd66b'; ctx.fillRect(d.x - 2 * S, d.y + 4 * S, 4 * S, 10 * S);
      break;
    }
    case 'pillar':
      ctx.fillStyle = INK; ctx.fillRect(d.x - 7 * S, d.y1, 14 * S, d.y2 - d.y1);
      ctx.fillStyle = '#b8322a'; ctx.fillRect(d.x - 5 * S, d.y1, 10 * S, d.y2 - d.y1);
      break;
    case 'crane':
      ctx.fillStyle = INK; ctx.fillRect(w.left + (w.right - w.left) * 0.2, d.y - 6 * S, (w.right - w.left) * 0.6, 10 * S);
      ctx.fillStyle = '#ffb020'; ctx.fillRect(w.left + (w.right - w.left) * 0.2 + 2, d.y - 4 * S, (w.right - w.left) * 0.6 - 4, 6 * S);
      break;
    case 'snow':
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const x = w.left + ((i * 97.3 + t * (0.3 + (i % 5) * 0.1)) % (w.right - w.left));
        const y = w.floorY - MAP_H * S + ((i * 53.1 + t * (0.6 + (i % 3) * 0.2)) % (MAP_H * S));
        ctx.fillRect(x, y, 2 * T, 2 * T);
      }
      break;
    case 'stars':
      for (let i = 0; i < 30; i++) {
        const x = w.left + ((i * 131.7) % (w.right - w.left)), y = w.floorY - MAP_H * S + ((i * 71.3) % (MAP_H * S));
        ctx.fillStyle = (t + i * 13) % 60 < 30 ? '#ffffff' : '#7f8fb0';
        ctx.fillRect(x, y, T, T);
      }
      break;
    case 'gear': {
      const a = t * 0.02 * (d.r > 22 * S ? 1 : -1.3);
      ctx.fillStyle = INK;
      for (let i = 0; i < 8; i++) { const aa = a + i * TAU / 8; ctx.fillRect(d.x + Math.cos(aa) * d.r - 5 * S, d.y + Math.sin(aa) * d.r - 5 * S, 10 * S, 10 * S); }
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7f8794'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r - 3 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'torch': {
      ctx.fillStyle = INK; ctx.fillRect(d.x - 3 * S, d.y - 34 * S, 6 * S, 34 * S);
      const fl = Math.sin(t * 0.3 + d.x) * 2 * S;
      ctx.fillStyle = '#ff8a1a'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 40 * S, 7 * S, 10 * S + fl, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 38 * S, 3 * S, 5 * S, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'mast': {
      const deck = m.plats[d.p], nest = m.plats[2 + d.p];
      if (!deck || !nest) break;
      const x = (nest.x1 + nest.x2) / 2;
      ctx.fillStyle = INK; ctx.fillRect(x - 5 * S, nest.y1, 10 * S, deck.y1 - nest.y1);
      ctx.fillStyle = '#6e4022'; ctx.fillRect(x - 3 * S, nest.y1, 6 * S, deck.y1 - nest.y1);
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath(); ctx.moveTo(x + 5 * S, nest.y1 + 20 * S); ctx.lineTo(x + 5 * S + (d.p ? -1 : 1) * 60 * S, deck.y1 - 30 * S); ctx.lineTo(x + 5 * S, deck.y1 - 20 * S); ctx.fill();
      break;
    }
    case 'tree': {
      const top = w.floorY - 250 * S;
      ctx.fillStyle = INK; ctx.fillRect(d.x - 9 * S, top, 18 * S, w.floorY - top);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(d.x - 7 * S, top, 14 * S, w.floorY - top);
      ctx.fillStyle = '#2f7d38';
      for (const [ox, oy, r] of [[0, 0, 34], [-26, 14, 24], [26, 14, 24]]) { ctx.beginPath(); ctx.arc(d.x + ox * S, top + oy * S, r * S, 0, TAU); ctx.fill(); }
      break;
    }
  }
}
