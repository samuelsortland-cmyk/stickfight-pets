'use strict';
/* Ultimates. A full meter (100) buys one ultimate. Every fighter always has the
 * default (Omni Flurry, the 6-hit super), plus one from its weapon and one from
 * its power if it has them. The AI picks whichever fits the situation best:
 * Omni Flurry up close, power ultimates when several enemies are in range or
 * the target is far, weapon ultimates in their sweet spot.
 *
 * Each ultimate: name, color, range (px at S=1), cast/after frames, pose, and
 * fire(f, w, target). They reuse the arsenal helpers (blast, hurt, beams...). */

const ULTS = {
  // ---- weapon ultimates ----
  sword: {
    name: 'THOUSAND CUTS', color: '#e8eef5', range: 440, cast: 12, after: 52, pose: CAST_POSES.charge, pose2: CAST_POSES.punch,
    fire(f, w) {
      const S = w.S, dir = f.facing, x0 = f.x;
      const x1 = clamp(f.x + dir * 440 * S, w.left + 30 * S, w.right - 30 * S);
      const victims = enemiesOf(w, f).filter((o) => (o.x - x0) * dir > -20 * S && (o.x - x1) * dir < 20 * S && Math.abs(o.y - f.y) < 90 * S);
      // Dash straight through everything in the way.
      w.fx.push({ type: 'beamline', x1: x0, y1: f.pts.hip.y, x2: x1, y2: f.pts.hip.y, life: 16, max: 16, color: '#ffffff' });
      f.x = x1; f.invuln = 50; f.skeleton();
      w.hazards.push({
        t: 0, owner: f, victims,
        update(w) {
          this.t++;
          if (this.t > 14 && this.t % 4 === 0 && this.t <= 34) {
            for (const o of this.victims) {
              const a = rand(0, Math.PI);
              const cx = o.pts.neck.x, cy = o.pts.neck.y + 10 * S, r = 46 * S;
              w.fx.push({ type: 'beamline', x1: cx - Math.cos(a) * r, y1: cy - Math.sin(a) * r, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r, life: 8, max: 8, color: '#e8eef5' });
              const last = this.t === 34;
              hurt(w, this.owner, o, last ? 12 : 5, (last ? dir * 11 : dir * 1) * S, (last ? -9 : -2) * S, last ? {} : { stun: 10 });
            }
          }
          if (this.t > 36) this.dead = true;
        },
      });
    },
  },
  hammer: {
    name: 'EARTHSHATTER', color: '#c8ccd4', range: 400, cast: 16, after: 30, pose: CAST_POSES.up, pose2: CAST_POSES.slam,
    fire(f, w) {
      const S = w.S, x = f.x, y = f.y;
      w.shake = Math.max(w.shake, 30); w.impactT = 5;
      w.burst(x, y - 20 * S, 260 * S, '#ffffff');
      for (const side of [-1, 1]) {
        w.fx.push({ type: 'wave', x: x + side * 120 * S, y, r: 260 * S, life: 24, max: 24, color: '#ffffff' });
        for (let i = 1; i <= 6; i++) addDecal(w, { kind: 'ice', x: x + side * i * 62 * S, y: groundBelow(w, x + side * i * 62 * S, y - 30 * S), h: rand(40, 75) * S, life: 260, seed: Math.random(), rock: true });
        w.crack(x + side * 160 * S, y, 0, 24);
      }
      for (const o of enemiesOf(w, f)) {
        const dx = o.x - x;
        if (Math.abs(dx) > 400 * S || Math.abs(o.y - y) > 80 * S) continue;
        hurt(w, f, o, 22 * (1 - Math.abs(dx) / (500 * S)), (sign(dx) || 1) * 6 * S, -16 * S);
      }
      shove(w, x, y, 400 * S, 10, f);
      damageCratesNear(w, x, y, 400 * S);
    },
  },
  spear: {
    name: 'DRAGON LANCE', color: '#ffb020', range: 1000, cast: 18, after: 20, pose: CAST_POSES.charge, pose2: CAST_POSES.fire,
    fire(f, w) {
      const S = w.S, h = f.pts.h1;
      w.hazards.push({
        x: h.x, y: h.y, vx: f.facing * 22 * S, owner: f, hit: new Set(),
        update(w) {
          this.x += this.vx;
          w.fx.push({ type: 'flame', x: this.x - this.vx, y: this.y + rand(-4, 4) * S, vx: 0, vy: rand(-1, 0) * S, r: rand(4, 8) * S, life: 16, max: 16, E: ELEMENTS.fire });
          for (const o of enemiesOf(w, this.owner)) {
            if (this.hit.has(o) || w.hurtDist(o, this.x, this.y) > 18 * S) continue;
            this.hit.add(o);
            hurt(w, this.owner, o, 24, sign(this.vx) * 15 * S, -8 * S);
            w.burst(this.x, this.y, 120 * S, '#ffb020');
          }
          damageCratesNear(w, this.x, this.y, 30 * S);
          if (this.x < w.left || this.x > w.right) {
            this.dead = true;
            w.crack(this.vx > 0 ? w.right - 1 : w.left + 1, this.y, this.vx > 0 ? -1 : 1, 24);
            addDecal(w, { kind: 'glass', x: this.vx > 0 ? w.right - 2 : w.left + 2, y: this.y, r: 90 * S, life: 420, seed: Math.random() });
            w.shake = Math.max(w.shake, 14);
          }
        },
        draw(ctx) {
          const d = sign(this.vx), len = 120 * S;
          ctx.lineCap = 'square';
          for (const [wd, c] of [[16 * S, INK], [10 * S, '#ffb020'], [4 * S, '#fff4b0']]) {
            ctx.strokeStyle = c; ctx.lineWidth = wd;
            ctx.beginPath(); ctx.moveTo(this.x - d * len, this.y); ctx.lineTo(this.x, this.y); ctx.stroke();
          }
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(this.x + d * 26 * S, this.y); ctx.lineTo(this.x, this.y - 11 * S); ctx.lineTo(this.x, this.y + 11 * S); ctx.fill();
          ctx.lineCap = 'round';
        },
      });
    },
  },
  blaster: {
    name: 'BULLET STORM', color: '#ffe14d', range: 800, cast: 8, after: 56, pose: CAST_POSES.fire,
    fire(f, w) {
      const S = w.S;
      w.hazards.push({
        t: 0, owner: f,
        update(w) {
          const g = this.owner;
          if (g.state !== 'cast') { this.dead = true; return; }
          this.t++;
          const tip = g.weaponTip() || g.pts.h1;
          if (this.t % 2 === 0 && this.t <= 44) {
            const a = rand(-0.22, 0.22);
            w.projectiles.push({ owner: g, kind: 'bullet', dmg: 4, x: tip.x, y: tip.y, vx: g.facing * 17 * S * Math.cos(a), vy: 17 * S * Math.sin(a), r: 4 * S, life: 70, t: 0, trail: [] });
            w.flashFx(tip.x, tip.y, 10 * S, '#ffe14d');
            w.shake = Math.max(w.shake, 3);
          }
          if (this.t === 50) {
            w.projectiles.push({ owner: g, kind: 'bullet', dmg: 16, big: true, x: tip.x, y: tip.y, vx: g.facing * 20 * S, vy: 0, r: 10 * S, life: 90, t: 0, trail: [] });
            w.burst(tip.x, tip.y, 90 * S, '#ffe14d');
            this.dead = true;
          }
        },
      });
    },
  },

  // ---- power ultimates (big range) ----
  flame: {
    name: 'FLAME EMPEROR', color: '#ff7a1a', range: 650, cast: 34, after: 16, pose: CAST_POSES.up,
    charge(f, w) {
      const S = w.S, k = f.stateT / 34;
      if (w.tick % 2 === 0) w.fx.push({ type: 'flame', x: f.pts.head.x + rand(-40, 40) * S * k, y: f.pts.head.y - 70 * S + rand(-40, 40) * S * k, vx: 0, vy: rand(-1, 0) * S, r: (8 + 18 * k) * S, life: 14, max: 14, E: ELEMENTS.fire });
    },
    fire(f, w, o) {
      const S = w.S;
      const tx = o ? o.x : f.x + f.facing * 300 * S, ty = o ? groundBelow(w, o.x, o.y - 30 * S) : f.y;
      w.hazards.push({
        x: f.pts.head.x, y: f.pts.head.y - 80 * S, sx: f.pts.head.x, sy: f.pts.head.y - 80 * S, tx, ty, t: 0, T: 36, r: 60 * S, owner: f,
        update(w) {
          this.t++;
          const k = this.t / this.T;
          this.x = lerp(this.sx, this.tx, k); this.y = lerp(this.sy, this.ty - this.r * 0.5, k * k);
          for (let i = 0; i < 4; i++) w.fx.push({ type: 'flame', x: this.x + rand(-1, 1) * this.r, y: this.y + rand(-1, 1) * this.r, vx: 0, vy: rand(-2, 0) * S, r: rand(8, 16) * S, life: 18, max: 18, E: ELEMENTS.fire });
          if (this.t >= this.T) {
            this.dead = true;
            blast(w, this.tx, this.ty - 20 * S, 290 * S, 30, this.owner, '#ff7a1a');
            w.hazards.push(firePatch(w, this.tx, this.ty, 380 * S, 420, this.owner));
            w.shake = Math.max(w.shake, 34); w.impactT = 6;
          }
        },
        draw(ctx, w) {
          for (const [m, c] of [[1.12, INK], [1, '#d8340f'], [0.82, '#ff8a1a'], [0.55, '#ffe14d'], [0.25, '#ffffff']]) {
            ctx.fillStyle = c; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * m * (1 + Math.sin(w.tick * 0.6) * 0.05), 0, TAU); ctx.fill();
          }
        },
      });
    },
  },
  ice: {
    name: 'ABSOLUTE ZERO', color: '#7fdcff', range: 430, cast: 26, after: 20, pose: CAST_POSES.charge, pose2: CAST_POSES.up,
    charge(f, w) { if (w.tick % 3 === 0) w.fx.push({ type: 'sq', x: f.x + rand(-120, 120) * w.S, y: f.y - rand(0, 120) * w.S, vx: 0, vy: -0.5 * w.S, size: 4 * w.S, life: 16, max: 16, color: '#bfefff' }); },
    fire(f, w) {
      const S = w.S, R = 430 * S;
      w.flashFx(f.pts.hip.x, f.pts.hip.y, 120 * S, '#bfefff');
      w.ring(f.pts.hip.x, f.pts.hip.y, '#bfefff', R);
      w.ring(f.pts.hip.x, f.pts.hip.y, '#ffffff', R * 0.6);
      w.shake = Math.max(w.shake, 16); w.impactT = 4;
      for (let i = -7; i <= 7; i++) {
        if (!i) continue;
        const x = f.x + i * 30 * S;
        if (x < w.left || x > w.right) continue;
        addDecal(w, { kind: 'ice', x, y: groundBelow(w, x, f.y - 30 * S), h: rand(50, 95) * S, life: 300, seed: Math.random() });
      }
      for (const o of enemiesOf(w, f)) {
        if (Math.hypot(o.x - f.x, o.y - f.y) > R) continue;
        hurt(w, f, o, 14, 0, -3 * S, { freeze: 160 });
      }
    },
  },
  light: {
    name: 'LIGHT RAIN', color: '#ffe95a', range: 720, cast: 20, after: 50, pose: CAST_POSES.up,
    fire(f, w, o) {
      const S = w.S, cx = o ? o.x : f.x + f.facing * 300 * S;
      w.hazards.push({
        t: 0, owner: f, cx,
        update(w) {
          this.t++;
          if (this.t % 3 === 0 && this.t <= 60) {
            const x = clamp(this.cx + rand(-360, 360) * S, w.left + 10, w.right - 10);
            const gy = groundBelow(w, x, w.floorY - 400 * S);
            w.fx.push({ type: 'beamline', x1: x, y1: -20, x2: x, y2: gy, life: 10, max: 10, color: '#ffe95a' });
            w.flashFx(x, gy - 10 * S, 34 * S, '#ffe95a');
            addDecal(w, { kind: 'scorch', x, y: gy, r: 26 * S, life: 500 });
            for (const d of enemiesOf(w, this.owner)) if (Math.abs(d.pts.hip.x - x) < 40 * S) hurt(w, this.owner, d, 6, rand(-3, 3) * S, -7 * S, { stun: 14 });
            damageCratesNear(w, x, gy, 40 * S);
          }
          if (this.t > 62) this.dead = true;
        },
      });
    },
  },
  quake: {
    name: 'WORLD SHAKER', color: '#f1f1f1', range: 700, cast: 30, after: 24, pose: CAST_POSES.charge, pose2: CAST_POSES.fire,
    charge(f, w) { if (w.tick % 2 === 0) w.shake = Math.max(w.shake, 5); },
    fire(f, w) {
      const S = w.S, R = 700 * S;
      for (const side of [-1, 1]) {
        const hx = f.pts.hip.x + side * 30 * S;
        addDecal(w, { kind: 'glass', x: hx, y: f.pts.neck.y, r: 220 * S, life: 720, seed: Math.random() });
        for (let i = 1; i <= 4; i++) w.crack(f.x + side * i * 150 * S, groundBelow(w, f.x + side * i * 150 * S, f.y - 20 * S), 0, 26);
      }
      w.shake = Math.max(w.shake, 40); w.impactT = 6;
      w.burst(f.pts.hip.x, f.pts.hip.y, 420 * S, '#ffffff');
      for (const o of w.fighters) {
        if (o === f) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) > R) continue;
        const k = 1 - Math.abs(dx) / R;
        if (!hurt(w, f, o, 24 * (0.5 + 0.5 * k), (sign(dx) || 1) * 14 * k * S, -15 * S) && o.rag) for (const p of o.rag.p) p.oy += 12 * S;
      }
      shove(w, f.x, f.y, R, 14, f);
      breakDrawn(w, f.x, f.y, R);
      damageCratesNear(w, f.x, f.y, R);
    },
  },
  dark: {
    name: 'BLACK VORTEX', color: '#7a2bff', range: 600, cast: 22, after: 20, pose: CAST_POSES.up,
    fire(f, w, o) {
      const S = w.S;
      const x = o ? o.x : f.x + f.facing * 260 * S, y = (o ? o.y : f.y) - 90 * S;
      blackHole(f, w, x, y, { R: 300, life: 210, pull: 2.2, implode: 340, dmg: 28 });
    },
  },
  rumble: {
    name: 'RAIGO', color: '#3fd0ff', range: 680, cast: 24, after: 30, pose: CAST_POSES.up,
    fire(f, w, o) {
      const S = w.S;
      const tx = o ? o.x : f.x + f.facing * 280 * S, ty = o ? groundBelow(w, o.x, o.y - 30 * S) : f.y;
      w.hazards.push({
        x: tx, y: -120 * S, tx, ty, t: 0, T: 44, r: 70 * S, owner: f,
        update(w) {
          this.t++;
          this.y = lerp(-120 * S, this.ty - this.r * 0.6, this.t / this.T);
          if (w.tick % 3 === 0) w.fx.push({ type: 'zap', pts: jagged(this.x, this.y, rand(0, TAU), this.r * 1.4, 4), life: 5, max: 5, E: ELEMENTS.volt });
          if (this.t >= this.T) {
            this.dead = true;
            blast(w, this.tx, this.ty - 20 * S, 300 * S, 26, this.owner, '#3fd0ff');
            // Chain lightning to every other enemy on screen.
            for (const d of enemiesOf(w, this.owner)) {
              if (Math.abs(d.x - this.tx) < 300 * S) continue;
              const pts = [];
              let px = this.tx, py = this.ty - 40 * S;
              for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push({ x: lerp(px, d.pts.neck.x, k) + (i && i < 8 ? rand(-20, 20) * S : 0), y: lerp(py, d.pts.neck.y, k) + (i && i < 8 ? rand(-20, 20) * S : 0) }); }
              w.fx.push({ type: 'bolt', pts, life: 14, max: 14 });
              hurt(w, this.owner, d, 9, rand(-3, 3) * S, -6 * S, { stun: 24 });
            }
            w.impactT = 5;
          }
        },
        draw(ctx, w) {
          for (const [m, c] of [[1.1, INK], [1, '#1468ff'], [0.75, '#3fd0ff'], [0.45, '#bff0ff'], [0.2, '#ffffff']]) {
            ctx.fillStyle = c; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * m * (1 + Math.sin(w.tick * 0.9) * 0.06), 0, TAU); ctx.fill();
          }
        },
      });
    },
  },
  gravity: {
    name: 'METEOR SHOWER', color: '#b05cff', range: 800, cast: 26, after: 20, pose: CAST_POSES.up,
    fire(f, w, o) {
      const S = w.S, cx = o ? o.x : f.x + f.facing * 300 * S;
      for (let i = 0; i < 7; i++) {
        const tx = clamp(cx + (i - 3) * 110 * S + rand(-30, 30) * S, w.left + 40 * S, w.right - 40 * S);
        const ty = groundBelow(w, tx, w.floorY - 400 * S);
        const delay = i * 9;
        w.hazards.push({
          t: -delay, T: 44, tx, ty, sx: tx - f.facing * 260 * S, sy: -100, r: 26 * S, owner: f,
          update(w) {
            this.t++;
            if (this.t < 0) return;
            const k = this.t / this.T;
            this.x = lerp(this.sx, this.tx, k); this.y = lerp(this.sy, this.ty - this.r * 0.6, k);
            w.fx.push({ type: 'flame', x: this.x, y: this.y, vx: 0, vy: -1 * S, r: rand(5, 10) * S, life: 14, max: 14, E: ELEMENTS.fire });
            if (this.t >= this.T) {
              this.dead = true;
              blast(w, this.tx, this.ty - 10 * S, 135 * S, 14, this.owner, '#ff8a1a');
              addDecal(w, { kind: 'crater', x: this.tx, y: this.ty, r: 60 * S, life: 1000, seed: Math.random() });
              damageCratesNear(w, this.tx, this.ty, 135 * S);
            }
          },
          draw(ctx) {
            if (this.t < 0 || this.x == null) {
              ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = T; ctx.setLineDash([3 * T, 3 * T]);
              ctx.beginPath(); ctx.ellipse(this.tx, this.ty, 60 * S, 14 * S, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
              return;
            }
            ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 2 * T, 0, TAU); ctx.fill();
            ctx.fillStyle = '#5a3a28'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
            ctx.fillStyle = '#ff8a1a'; ctx.beginPath(); ctx.arc(this.x + 4 * S, this.y - 4 * S, this.r * 0.35, 0, TAU); ctx.fill();
          },
        });
      }
    },
  },
  buddha: {
    name: 'BUDDHA PALM', color: '#ffd21a', range: 540, cast: 22, after: 22, pose: CAST_POSES.charge, pose2: CAST_POSES.fire,
    fire(f, w) {
      const S = w.S, dir = f.facing;
      if (!f.giantT) f.giantT = 300;
      w.hazards.push({
        x: f.pts.hip.x, y: f.pts.neck.y, dir, t: 0, owner: f, hit: new Set(),
        update(w) {
          this.t++;
          this.x += this.dir * 18 * S;
          for (const o of enemiesOf(w, this.owner)) {
            if (this.hit.has(o) || Math.abs(o.pts.hip.x - this.x) > 70 * S || Math.abs(o.pts.hip.y - this.y) > 150 * S) continue;
            this.hit.add(o);
            hurt(w, this.owner, o, 28, this.dir * 20 * S, -10 * S);
            w.burst(o.pts.neck.x, o.pts.neck.y, 160 * S, '#ffd21a');
          }
          shove(w, this.x, this.y, 120 * S, 6, this.owner);
          damageCratesNear(w, this.x, this.y, 120 * S);
          if (this.t > 30 || this.x < w.left || this.x > w.right) {
            this.dead = true;
            if (this.x < w.left + 20 || this.x > w.right - 20) addDecal(w, { kind: 'glass', x: this.dir > 0 ? w.right - 2 : w.left + 2, y: this.y, r: 160 * S, life: 600, seed: Math.random() });
          }
        },
        draw(ctx, w) {
          // A giant golden palm.
          const k = Math.min(1, this.t / 4), x = this.x, y = this.y, s = 120 * S * k;
          ctx.globalAlpha = 0.9;
          for (const [pad, c] of [[T * 3, INK], [0, '#ffd21a']]) {
            ctx.fillStyle = c;
            ctx.beginPath(); ctx.ellipse(x, y + s * 0.2, s * 0.55 + pad, s * 0.7 + pad, 0, 0, TAU); ctx.fill();
            for (let i = 0; i < 4; i++) {
              const fy = y - s * 0.75 + i * s * 0.32;
              ctx.beginPath(); ctx.ellipse(x + this.dir * s * 0.6, fy, s * 0.32 + pad, s * 0.11 + pad, 0, 0, TAU); ctx.fill();
            }
            ctx.beginPath(); ctx.ellipse(x - this.dir * s * 0.15, y - s * 0.6, s * 0.1 + pad, s * 0.3 + pad, -this.dir * 0.5, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = '#fff4b0';
          ctx.beginPath(); ctx.arc(x, y + s * 0.15, s * 0.15, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        },
      });
      w.shake = Math.max(w.shake, 20);
    },
  },
  ki: {
    name: 'FINAL KAMEHAMEHA', color: '#59c8ff', range: 2000, cast: 50, after: 82, pose: CAST_POSES.charge, pose2: CAST_POSES.fire,
    charge(f, w) {
      const h = f.pts.h1;
      for (let i = 0; i < 2; i++) w.fx.push({ type: 'charge', x: h.x + rand(-90, 90) * w.S, y: h.y + rand(-90, 90) * w.S, tx: h, life: 12, max: 12, color: chance(0.5) ? '#59c8ff' : '#ffffff' });
      if (w.tick % 2 === 0) w.shake = Math.max(w.shake, 4);
    },
    fire(f, w) {
      w.text(f.pts.head.x, f.pts.head.y - 34 * w.S, 'HAAAAAAA!', '#59c8ff', 24);
      kiBeam(f, w, { width: 64, life: 80, dmg: 5 });
    },
  },
};

const ULT_DEFAULT = { name: 'OMNI FLURRY', color: '#ffffff' };

// Which ultimates this fighter can use right now.
function ultOptions(f) {
  const out = ['flurry'];
  if (f.weapon && ULTS[f.weapon.kind]) out.push(f.weapon.kind);
  if (f.ability && ULTS[f.ability]) out.push(f.ability);
  return out;
}
function ultName(key) { return key === 'flurry' ? ULT_DEFAULT.name : ULTS[key].name; }

// AI: score each available ultimate for this moment; returns the best key or null.
function chooseUlt(f, o, w, adx, dy) {
  const S = f.S;
  let best = null, bestScore = 1.4;
  for (const key of ultOptions(f)) {
    let score;
    if (key === 'flurry') {
      // The default is the go-to point-blank: fast, reliable, no wind-up to dodge.
      score = Math.abs(dy) > 30 * S ? 0.2 : adx < 90 * S ? 6 : adx < MOVES.super.reach * S * 0.75 ? 3.2 : 0.2;
    } else {
      const u = ULTS[key], R = u.range * S;
      const inRange = enemiesOf(w, f).filter((e) => Math.abs(e.x - f.x) < R && Math.abs(e.y - f.y) < 220 * S).length;
      score = (adx < R ? 2 : 0) + inRange * 1.2 + (ABILITIES[key] ? 0.6 : 0.3);
      if (key === 'ki' && Math.abs(dy) > 50 * S) score -= 3;
      if (key === 'sword' && Math.abs(dy) > 60 * S) score -= 3;
    }
    score += rand(-0.5, 0.5);
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}
