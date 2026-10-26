'use strict';
/* Rendering. The whole scene is drawn onto a low-resolution layer and scaled up
 * with nearest-neighbour filtering, which gives everything (stickmen, effects,
 * text) the crisp chunky pixel-art look of Animator-vs-Animation fan art.
 * Stickmen are thick black-outlined strokes with hollow ring heads. */
const PIXFONT = 'StickPix';
const INK = '#0a0a0a';
let layer = null, lctx = null;

// U = CSS pixels per art pixel (the grid everything snaps to). T = the "chunk" unit for
// text, HUD and effect thickness: a whole number of art pixels, at least 2 CSS px, so
// labels stay readable even when the stickmen are drawn on a fine grid.
let U = 2, T = 2;
const snap = (v) => Math.round(v / U) * U;

function ensureLayer(w, view) {
  const dev = Math.max(1, Math.round(view.pixel * view.dpr));
  U = dev / view.dpr;
  T = U * Math.max(1, Math.round(2 / U));
  const W = Math.ceil((w.width * view.dpr) / dev), H = Math.ceil((w.height * view.dpr) / dev);
  if (!layer) {
    layer = document.createElement('canvas');
    lctx = layer.getContext('2d', { willReadFrequently: true });
  }
  if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; }
  return dev;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function shoulder(P) {
  return { x: lerp(P.neck.x, P.hip.x, 0.12), y: lerp(P.neck.y, P.hip.y, 0.12) };
}

// Pixel text with a 1-art-pixel black outline. size is in art pixels (8, 16, 24...).
function ptext(ctx, str, x, y, size, color, align = 'center', outline = INK) {
  str = String(str).toUpperCase();
  const k = (size / 8) * T;
  ctx.font = `${size * T}px ${PIXFONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  x = Math.round(x / k) * k; y = Math.round(y / k) * k;
  if (outline) {
    ctx.fillStyle = outline;
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k], [-k, -k], [k, -k], [-k, k], [k, k]]) ctx.fillText(str, x + dx, y + dy);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function ptextWidth(str, size) { return String(str).length * 6 * (size / 8) * T - (size / 8) * T; }

function limbWidth(S) { return Math.max(3 * U, BODY.limb * S); }

function drawBody(ctx, P, S, front, back, outline, rim) {
  const lw = limbWidth(S);
  const ow = lw + 2 * Math.max(U, BODY.outline * S);
  const sh = shoulder(P);
  const rr = Math.max(lw * 0.6, BODY.headR * S - lw / 2);
  const part = (pts, col) => {
    if (outline) {
      if (rim) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = ow + 2 * T; poly(ctx, pts); }
      ctx.strokeStyle = outline; ctx.lineWidth = ow; poly(ctx, pts);
    }
    ctx.strokeStyle = col; ctx.lineWidth = lw; poly(ctx, pts);
  };
  part([sh, P.e2, P.h2], back);
  part([P.hip, P.k2, P.f2], back);
  part([P.neck, P.hip, P.k1, P.f1], front);
  // Hollow ring head.
  if (outline) {
    if (rim) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = ow + 2 * T; ctx.beginPath(); ctx.arc(P.head.x, P.head.y, rr, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = outline; ctx.lineWidth = ow; ctx.beginPath(); ctx.arc(P.head.x, P.head.y, rr, 0, TAU); ctx.stroke();
  }
  ctx.strokeStyle = front; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(P.head.x, P.head.y, rr, 0, TAU); ctx.stroke();
  part([sh, P.e1, P.h1], front);
}

function drawFighter(ctx, f, w) {
  const S = f.S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Afterimages in the element color.
  for (const g of f.ghosts) {
    const P = {};
    JOINTS.forEach((j, i) => { P[j] = g.pts[i]; });
    ctx.globalAlpha = 0.4 * (g.life / 12);
    drawBody(ctx, P, S, f.elc.main, f.elc.dark, null, false);
  }
  // Smear trail on the attacking limb.
  if (f.trail.length > 1) {
    const lw = limbWidth(S);
    for (let i = 1; i < f.trail.length; i++) {
      const k = i / f.trail.length;
      ctx.globalAlpha = 0.9 * k;
      ctx.strokeStyle = i > f.trail.length - 3 ? f.elc.hot : f.elc.main;
      ctx.lineWidth = lw * (0.5 + 1.8 * k);
      ctx.beginPath();
      ctx.moveTo(f.trail[i - 1].x, f.trail[i - 1].y);
      ctx.lineTo(f.trail[i].x, f.trail[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = f.state === 'ko' ? 0.55 : 1;
  if (w.impactT > 0) {
    // Impact frame: stark silhouettes.
    drawBody(ctx, f.pts, S, INK, INK, '#ffffff', false);
    ctx.globalAlpha = 1;
    return;
  }
  if (f.giantT > 0 && !f.rag) {
    // Buddha form: golden halo behind the body.
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(w.tick * 0.3);
    ctx.strokeStyle = '#ffd21a'; ctx.lineWidth = 4 * T;
    ctx.beginPath(); ctx.arc(f.pts.head.x, f.pts.head.y, BODY.headR * f.S * 2.1, 0, TAU); ctx.stroke();
    ctx.globalAlpha = f.state === 'ko' ? 0.55 : 1;
  }
  if (f.meter >= 100 && !f.rag) {
    // Full meter: pulsing elemental glow behind the body.
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(w.tick * 0.5 + f.id);
    const P = f.pts, sh = shoulder(P), gw = limbWidth(S) + 10 * S;
    ctx.strokeStyle = f.elc.main; ctx.lineWidth = gw;
    for (const l of [[sh, P.e2, P.h2], [P.hip, P.k2, P.f2], [P.neck, P.hip, P.k1, P.f1], [sh, P.e1, P.h1]]) poly(ctx, l);
    ctx.beginPath(); ctx.arc(P.head.x, P.head.y, BODY.headR * S + 3 * S, 0, TAU); ctx.stroke();
    ctx.globalAlpha = f.state === 'ko' ? 0.55 : 1;
  }
  const flash = f.flash > 0;
  drawBody(ctx, f.pts, f.S, flash ? '#ffffff' : f.color, flash ? '#dddddd' : f.dark, INK, f.rim);
  if (f.ability && w.impactT <= 0) drawPowerMarks(ctx, f, w);
  drawWeapon(ctx, f, w);
  if (f.state === 'frozen') drawIceBlock(ctx, f);
  if (f.state === 'ko') {
    // X eyes inside the ring.
    const h = f.pts.head, r = 2.6 * S;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(T, 1.6 * S); ctx.lineCap = 'square';
    for (const ox of [-3.5 * S, 3.5 * S]) {
      ctx.beginPath();
      ctx.moveTo(h.x + ox - r, h.y - r); ctx.lineTo(h.x + ox + r, h.y + r);
      ctx.moveTo(h.x + ox + r, h.y - r); ctx.lineTo(h.x + ox - r, h.y + r);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }
  if (f.state === 'block' || f.state === 'blockstun') {
    ctx.globalAlpha = f.state === 'blockstun' ? 0.9 : 0.5;
    ctx.strokeStyle = f.elc.hot;
    ctx.lineWidth = 2 * T;
    const c = shoulder(f.pts);
    const base = f.facing > 0 ? 0 : Math.PI;
    ctx.beginPath();
    ctx.arc(c.x, c.y + 8 * S, 36 * S, base - 0.9, base + 0.9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, f, w, hover) {
  const S = f.S, head = f.pts.head;
  const showBars = w.inCombat || f.recentDmgT > 0 || w.phase === 'victory';
  let y = head.y - BODY.headR * S - 6 * T;
  if (showBars || hover) {
    if (showBars) {
      const bw = snap(Math.max(14 * T, 34 * S)), bh = 2 * T;
      const x = snap(head.x - bw / 2);
      y = snap(y);
      ctx.fillStyle = INK;
      ctx.fillRect(x - T, y - T, bw + 2 * T, bh * 2 + 3 * T);
      const k = clamp(f.hp / 100, 0, 1);
      ctx.fillStyle = '#3a1010';
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = k > 0.5 ? '#40e070' : k > 0.25 ? '#ffc93d' : '#ff4040';
      ctx.fillRect(x, y, snap(bw * k), bh);
      ctx.fillStyle = '#10202a';
      ctx.fillRect(x, y + bh + T, bw, bh);
      const full = f.meter >= 100;
      ctx.fillStyle = full ? (w.tick % 8 < 4 ? '#ffffff' : f.elc.main) : f.elc.dark;
      ctx.fillRect(x, y + bh + T, snap(bw * f.meter / 100), bh);
      if (f.ability) {
        // Power cooldown strip in the power's color; full = ready.
        const ab = ABILITIES[f.ability], ready = f.abilityCD <= 0;
        ctx.fillStyle = INK;
        ctx.fillRect(x - T, y + 2 * bh + 2 * T, bw + 2 * T, bh + T);
        ctx.fillStyle = ready ? (w.tick % 12 < 6 ? ab.color : ab.color2) : '#2a2a33';
        ctx.fillRect(x, y + 2 * bh + 2 * T, snap(bw * (1 - Math.max(0, f.abilityCD) / ab.cd)), bh);
      }
      y -= 3 * T;
    }
    // Names only on hover (or outside fights) to keep brawls readable.
    const label = hover ? `${f.name} lv${f.level} ${f.stats.wins}w` : f.name;
    if (hover || !showBars) ptext(ctx, label, head.x, y, 8, f.rim ? '#cfcfd6' : f.color);
    if (w.match === 'teams' && showBars) {
      const tw = snap(Math.max(14 * T, 34 * S)) / 2 + 3 * T;
      ctx.fillStyle = INK;
      ctx.fillRect(snap(head.x - tw - 5 * T), snap(y - 7 * T), 5 * T, 5 * T);
      ctx.fillStyle = TEAM_COLORS[f.team] || '#fff';
      ctx.fillRect(snap(head.x - tw - 4 * T), snap(y - 6 * T), 3 * T, 3 * T);
    }
    y -= hover || !showBars ? 11 * T : 2 * T;
  }
  if (f.ability && w.powerTags && f.state !== 'ko') {
    // Power tag: always visible so you can tell who has which power.
    ptext(ctx, ABILITIES[f.ability].name, head.x, y, 8, ABILITIES[f.ability].color);
    y -= 10 * T;
  }
  if (f.bubble) {
    const tw = ptextWidth(f.bubble.text, 8);
    const bw = snap(tw + 6 * T), bh = 11 * T;
    const bx = snap(clamp(head.x - bw / 2, w.left + 2, w.right - bw - 2)), by = snap(y - bh);
    ctx.globalAlpha = Math.min(1, f.bubble.t / 12);
    ctx.fillStyle = INK;
    ctx.fillRect(bx - T, by - T, bw + 2 * T, bh + 2 * T);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
    const tx = snap(clamp(head.x, bx + 3 * T, bx + bw - 3 * T));
    ctx.fillStyle = INK;
    ctx.fillRect(tx - 2 * T, by + bh, 4 * T, 2 * T);
    ctx.fillRect(tx - T, by + bh + 2 * T, 2 * T, T);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx - T, by + bh, 2 * T, T);
    ptext(ctx, f.bubble.text, bx + 3 * T, by + 9 * T, 8, INK, 'left', null);
    ctx.globalAlpha = 1;
  }
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2, d = i % 2 ? r * 0.26 : r;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function spike(ctx, x, y, a, len, wdt, color) {
  const bx = x + Math.cos(a) * len * 0.15, by = y + Math.sin(a) * len * 0.15;
  const nx = -Math.sin(a) * wdt, ny = Math.cos(a) * wdt;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bx + nx, by + ny);
  ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
  ctx.lineTo(bx - nx, by - ny);
  ctx.closePath();
  ctx.fill();
}

function drawFx(ctx, w) {
  const S = w.S;
  for (const e of w.fx) {
    const k = e.life / e.max;
    switch (e.type) {
      case 'spark':
        ctx.globalAlpha = 1;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(T, 2.5 * S) * (0.5 + k);
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - e.vx * e.len * 0.6, e.y - e.vy * e.len * 0.6);
        ctx.stroke();
        ctx.lineCap = 'round';
        break;
      case 'flash':
        ctx.globalAlpha = k;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.5 - k * 0.5), 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.1 - k * 0.4), 0, TAU); ctx.fill();
        break;
      case 'burst': {
        const grow = 1 - k;
        ctx.globalAlpha = Math.min(1, k * 1.8);
        for (const ray of e.rays) {
          const r0 = e.r * (0.25 + grow * 0.5), r1 = e.r * ray.l * (0.7 + grow * 0.5);
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(ray.a - ray.w) * r0, e.y + Math.sin(ray.a - ray.w) * r0);
          ctx.lineTo(e.x + Math.cos(ray.a) * r1, e.y + Math.sin(ray.a) * r1);
          ctx.lineTo(e.x + Math.cos(ray.a + ray.w) * r0, e.y + Math.sin(ray.a + ray.w) * r0);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'ring':
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(T, 3 * k * T + T);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 - k * 0.7), 0, TAU); ctx.stroke();
        break;
      case 'wave':
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(T, 4 * k * T);
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * (1 - k * 0.8), e.r * 0.22 * (1 - k * 0.8), 0, 0, TAU); ctx.stroke();
        break;
      case 'dust': {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = k > 0.5 ? '#e6e6e6' : '#a8a8a8';
        const r = snap(Math.max(T, e.r * (1.5 - k * 0.5)));
        ctx.fillRect(snap(e.x) - r / 2, snap(e.y) - r, r, r);
        break;
      }
      case 'line':
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = T;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dx * k, e.y); ctx.stroke();
        break;
      case 'charge':
      case 'ember':
        ctx.globalAlpha = 1;
        ctx.fillStyle = e.color;
        ctx.fillRect(snap(e.x), snap(e.type === 'ember' ? e.y - (1 - k) * 25 : e.y), 2 * T, 2 * T);
        break;
      case 'flame': {
        const r = Math.max(T, e.r * (0.4 + k * 0.8));
        ctx.globalAlpha = 1;
        ctx.fillStyle = k > 0.75 ? e.E.core : k > 0.5 ? e.E.hot : k > 0.25 ? e.E.main : e.E.dark;
        ctx.fillRect(snap(e.x - r), snap(e.y - r), snap(r * 2) || T, snap(r * 2) || T);
        break;
      }
      case 'zap':
        ctx.globalAlpha = 1;
        ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
        for (const [wd, col] of [[3.2 * S + T, e.E.main], [Math.max(T, 1.2 * S), e.E.core]]) {
          ctx.strokeStyle = col; ctx.lineWidth = wd; poly(ctx, e.pts);
        }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        break;
      case 'sq': {
        ctx.globalAlpha = 1;
        const s = snap(Math.max(T, e.size * (0.5 + k * 0.5)));
        ctx.fillStyle = INK;
        ctx.fillRect(snap(e.x) - s / 2 - T, snap(e.y) - s / 2 - T, s + 2 * T, s + 2 * T);
        ctx.fillStyle = e.color;
        ctx.fillRect(snap(e.x) - s / 2, snap(e.y) - s / 2, s, s);
        break;
      }
      case 'spike': {
        const grow = Math.sin(Math.min(1, (1 - k) * 1.6) * Math.PI * 0.5) * (0.6 + 0.4 * k);
        ctx.globalAlpha = 1;
        spike(ctx, e.x, e.y, e.a, e.len * grow + T * 2, e.w + T, e.E.main);
        spike(ctx, e.x, e.y, e.a, e.len * grow, e.w * 0.6, e.E.core);
        break;
      }
      case 'star': {
        const tw = Math.sin(k * Math.PI);
        ctx.globalAlpha = 1;
        star(ctx, e.x, e.y, e.r * tw + T, e.E.main);
        star(ctx, e.x, e.y, e.r * tw * 0.5, e.E.hot);
        break;
      }
      case 'bolt': {
        ctx.globalAlpha = e.life % 3 !== 0 ? 1 : 0.5;
        ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
        for (const [wd, col] of [[10 * k + 3, '#29c6ff'], [3 * T, '#ffffff']]) {
          ctx.strokeStyle = col; ctx.lineWidth = wd; poly(ctx, e.pts);
        }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        break;
      }
      case 'beamline':
        ctx.globalAlpha = k;
        ctx.lineCap = 'square';
        for (const [wd, col] of [[14 * S * k + 2 * T, e.color], [4 * S * k + T, '#ffffff']]) {
          ctx.strokeStyle = col; ctx.lineWidth = wd;
          ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
        }
        ctx.lineCap = 'round';
        break;
      case 'text': {
        ctx.globalAlpha = Math.min(1, k * 2.5);
        const size = e.size >= 20 ? 16 : 8;
        const pop = k > 0.88 ? 2 * T : 0;
        ptext(ctx, e.str, e.x, e.y - pop, size, e.color);
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawDecals(ctx, w) {
  ctx.lineCap = 'square';
  for (const d of w.decals) {
    const k = Math.min(1, d.life / 60);
    if (d.kind) { drawDecal(ctx, d, k); ctx.lineCap = 'square'; continue; }
    for (const [width, color] of [[3 * T, 'rgba(255,255,255,0.5)'], [T, INK]]) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (const b of d.branches) poly(ctx, b);
    }
  }
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1;
}

function drawProjectiles(ctx, w) {
  const S = w.S;
  for (const p of w.projectiles) {
    if (p.kind === 'bullet') {
      ctx.lineCap = 'square';
      if (p.big) {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2 * T, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 3 * T;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.6, p.y); ctx.stroke();
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = T;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.5, p.y); ctx.stroke();
      ctx.lineCap = 'round';
      continue;
    }
    const E = p.owner.elc, el = p.owner.el, r = p.r;
    for (let i = 0; i < p.trail.length; i += 2) {
      const q = p.trail[i], k = i / p.trail.length;
      ctx.globalAlpha = 1;
      const s = snap(Math.max(T, r * k * 0.9));
      ctx.fillStyle = k > 0.6 ? E.main : E.dark;
      ctx.fillRect(snap(q.x) - s / 2, snap(q.y) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    const pulse = 1 + Math.sin(p.t * 0.6) * 0.1;
    if (el === 'shadow') {
      for (let i = 0; i < 6; i++) spike(ctx, p.x, p.y, (i / 6) * TAU + p.t * 0.15, r * 2, r * 0.45, E.main);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y, r * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = E.main; ctx.lineWidth = 2 * T; ctx.stroke();
    } else if (el === 'spark') {
      star(ctx, p.x, p.y, r * 2.2 * pulse, INK);
      star(ctx, p.x, p.y, r * 1.8 * pulse, E.main);
      star(ctx, p.x, p.y, r * 0.9, E.hot);
    } else {
      for (const [k, c] of [[1.35, INK], [1.2, E.dark], [0.95, E.main], [0.6, E.hot], [0.3, E.core]]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, r * k * pulse, 0, TAU); ctx.fill();
      }
      if (el === 'volt') {
        ctx.strokeStyle = E.hot; ctx.lineWidth = T; ctx.lineCap = 'square';
        poly(ctx, jagged(p.x, p.y, rand(0, TAU), r * 2.2, 3));
        ctx.lineCap = 'round';
      }
    }
  }
}

function drawLine(ctx, x1, y1, x2, y2, alpha, dashed) {
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'square';
  ctx.setLineDash(dashed ? [6 * T, 4 * T] : []);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6 * T;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3 * T;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1;
}

// Snap partial alpha to a few hard levels inside the dirty box so edges stay crisp.
function crispen(box) {
  const x = Math.max(0, box[0] | 0), y = Math.max(0, box[1] | 0);
  const w = Math.min(layer.width, Math.ceil(box[2])) - x, h = Math.min(layer.height, Math.ceil(box[3])) - y;
  if (w <= 0 || h <= 0) return;
  const img = lctx.getImageData(x, y, w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a === 0 || a === 255) continue;
    d[i] = a < 60 ? 0 : a < 150 ? 120 : a < 215 ? 200 : 255;
  }
  lctx.putImageData(img, x, y);
}

function dirtyBox(w, scale) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r) => {
    if (x - r < x0) x0 = x - r; if (y - r < y0) y0 = y - r;
    if (x + r > x1) x1 = x + r; if (y + r > y1) y1 = y + r;
  };
  const pad = 90 * w.S;
  for (const f of w.fighters) add(f.pts.hip.x, f.pts.hip.y, pad + 40);
  for (const e of w.fx) add(e.x != null ? e.x : (e.pts ? e.pts[0].x : 0), e.y != null ? e.y : (e.pts ? e.pts[0].y : 0), (e.r || 30) * 1.6 + 30);
  for (const p of w.projectiles) add(p.x, p.y, 60);
  for (const it of w.items) add(it.x, it.y - 20, 50);
  if (w.hazards.length) { add(0, 0, 0); add(w.width, w.height, 0); }
  if (w.map) { add(w.left, w.floorY - MAP_H * w.S - 140 * w.S, 0); add(w.right, w.floorY + 10, 0); }
  if (w.banners.length) add(w.width / 2, Math.max(80, w.height * 0.22) + 40, Math.max(w.width / 2, 200));
  if (x0 === Infinity) return null;
  return [x0 * scale, y0 * scale, x1 * scale, y1 * scale];
}

function render(ctx, w, view) {
  const dev = ensureLayer(w, view);
  const scale = view.dpr / dev;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (w.dimT > 0) {
    // Super move: briefly darken the screen.
    ctx.globalAlpha = Math.min(1, w.dimT / 15, (70 - w.dimT) / 8) * 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = 1;
  }

  const L = lctx;
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.clearRect(0, 0, layer.width, layer.height);
  const sh = w.shake > 0.6 ? w.shake : 0;
  // Shake in whole art pixels so the grid never smears.
  L.setTransform(scale, 0, 0, scale, Math.round(rand(-sh, sh) * 0.5 * scale), Math.round(rand(-sh, sh) * 0.5 * scale));

  if (w.map) drawMapBack(L, w, w.map, w.map.t);
  drawDecals(L, w);
  for (const d of w.drawn) {
    const left = d.life - d.t;
    drawLine(L, d.plat.x1, d.plat.y1, d.plat.x2, d.plat.y2, left < 180 ? left / 180 : 1, false);
  }
  if (w.drawing) drawLine(L, w.drawing.x1, w.drawing.y1, w.drawing.x2, w.drawing.y2, 0.8, true);
  if (w.debug) {
    L.strokeStyle = '#00ffa0';
    L.lineWidth = T;
    for (const p of w.winPlats) { L.beginPath(); L.moveTo(p.x1, p.y1); L.lineTo(p.x2, p.y2); L.stroke(); }
    L.beginPath(); L.moveTo(w.left, w.floorY); L.lineTo(w.right, w.floorY); L.stroke();
  }

  drawProjectiles(L, w);
  drawItems(L, w);
  const order = w.fighters.slice().sort((a, b) => (b.state === 'ko') - (a.state === 'ko'));
  for (const f of order) drawFighter(L, f, w);
  drawHazards(L, w);
  drawFx(L, w);
  for (const f of w.fighters) drawHud(L, f, w, f === view.hover);

  let by = Math.max(80, w.height * 0.22);
  for (const b of w.banners) {
    const k = b.life / b.max;
    L.globalAlpha = Math.min(1, k * 4);
    const size = k > 0.92 ? 32 : 24;
    ptext(L, b.str, (w.left + w.right) / 2, by, size, b.color);
    by += 30 * T;
  }
  L.globalAlpha = 1;

  // Sharpening only matters on the coarse pixel styles; at full resolution it's wasted work.
  if (U > 1.01) { const box = dirtyBox(w, scale); if (box) crispen(box); }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, 0, 0, layer.width * dev, layer.height * dev);

  if (view.tool && view.tool !== 'hand' && w.cursor.on) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawToolCursor(ctx, w, view.tool);
  }
}

function drawToolCursor(ctx, w, tool) {
  const c = w.cursor;
  const r = tool === 'bomb' ? 120 * w.S : tool === 'smite' ? 45 * w.S : tool === 'eraser' ? 14 : 0;
  if (!r) return;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.arc(c.x, c.y, r + 1, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
}
