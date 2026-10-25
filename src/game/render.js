'use strict';
/* Canvas rendering: stickmen, smear trails, afterimages, effects and HUD. */
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function shoulder(P) {
  return { x: lerp(P.neck.x, P.hip.x, 0.12), y: lerp(P.neck.y, P.hip.y, 0.12) };
}

function drawBody(ctx, P, S, lw, front, back, outline) {
  const sh = shoulder(P);
  const backArm = [sh, P.e2, P.h2], backLeg = [P.hip, P.k2, P.f2];
  const torso = [P.hip, P.neck], frontLeg = [P.hip, P.k1, P.f1], frontArm = [sh, P.e1, P.h1];
  const headR = BODY.headR * S;
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw + 3;
    for (const l of [backArm, backLeg, torso, frontLeg, frontArm]) poly(ctx, l);
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(P.head.x, P.head.y, headR + 1.5, 0, TAU); ctx.fill();
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = back;
  poly(ctx, backArm); poly(ctx, backLeg);
  ctx.strokeStyle = front;
  poly(ctx, torso); poly(ctx, frontLeg);
  ctx.fillStyle = front;
  ctx.beginPath(); ctx.arc(P.head.x, P.head.y, headR, 0, TAU); ctx.fill();
  poly(ctx, frontArm);
}

function drawAura(ctx, f, w) {
  // Full meter: flickering energy outline.
  const S = w.S, t = w.tick;
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.4 + f.id);
  ctx.strokeStyle = f.light;
  ctx.lineWidth = Math.max(4, 11 * S) + Math.sin(t * 0.7) * 2;
  const P = f.pts, sh = shoulder(P);
  for (const l of [[sh, P.e2, P.h2], [P.hip, P.k2, P.f2], [P.hip, P.neck], [P.hip, P.k1, P.f1], [sh, P.e1, P.h1]]) poly(ctx, l);
  ctx.beginPath(); ctx.arc(P.head.x, P.head.y, BODY.headR * S + 4, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawFighter(ctx, f, w) {
  const S = w.S, lw = Math.max(2, 5.2 * S);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Afterimages.
  for (const g of f.ghosts) {
    const P = {};
    JOINTS.forEach((j, i) => { P[j] = g.pts[i]; });
    ctx.globalAlpha = 0.22 * (g.life / 12);
    drawBody(ctx, P, S, lw * 0.85, f.light, f.color, null);
  }
  // Smear trail on the attacking limb.
  if (f.trail.length > 1) {
    for (let i = 1; i < f.trail.length; i++) {
      const k = i / f.trail.length;
      ctx.globalAlpha = 0.6 * k;
      ctx.strokeStyle = i > f.trail.length - 3 ? '#ffffff' : f.light;
      ctx.lineWidth = lw * (0.6 + 2 * k);
      ctx.beginPath();
      ctx.moveTo(f.trail[i - 1].x, f.trail[i - 1].y);
      ctx.lineTo(f.trail[i].x, f.trail[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = f.state === 'ko' ? 0.6 : 1;
  if (f.meter >= 100 && !f.rag) drawAura(ctx, f, w);
  if (w.impactT > 0) {
    // Impact frame: pure silhouettes.
    drawBody(ctx, f.pts, S, lw + 1, '#000000', '#000000', 'rgba(255,255,255,0.95)');
    ctx.globalAlpha = 1;
    return;
  }
  const flash = f.flash > 0;
  drawBody(ctx, f.pts, S, lw, flash ? '#ffffff' : f.color, flash ? '#e8e8e8' : f.dark, f.outline);
  if (f.state === 'ko') {
    // Cartoon X eyes.
    const h = f.pts.head, r = 3 * S;
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 1.4 * S);
    for (const ox of [-3.5 * S, 3.5 * S]) {
      ctx.beginPath();
      ctx.moveTo(h.x + ox - r / 2, h.y - r / 2); ctx.lineTo(h.x + ox + r / 2, h.y + r / 2);
      ctx.moveTo(h.x + ox + r / 2, h.y - r / 2); ctx.lineTo(h.x + ox - r / 2, h.y + r / 2);
      ctx.stroke();
    }
  }
  if (f.state === 'block' || f.state === 'blockstun') {
    ctx.globalAlpha = f.state === 'blockstun' ? 0.6 : 0.25;
    ctx.strokeStyle = '#9fdcff';
    ctx.lineWidth = 2.5;
    const c = shoulder(f.pts);
    const base = f.facing > 0 ? 0 : Math.PI;
    ctx.beginPath();
    ctx.arc(c.x, c.y + 8 * S, 34 * S, base - 0.9, base + 0.9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHud(ctx, f, w, hover) {
  const S = w.S, head = f.pts.head;
  const showBars = w.inCombat || f.recentDmgT > 0 || w.phase === 'victory';
  let y = head.y - BODY.headR * S - 10;
  if (showBars || hover) {
    const bw = Math.max(34, 44 * S), bh = 4;
    const x = head.x - bw / 2;
    if (showBars) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
      const k = f.hp / 100;
      ctx.fillStyle = k > 0.5 ? '#3ddc6a' : k > 0.25 ? '#ffc93d' : '#ff4d4d';
      ctx.fillRect(x, y, bw * k, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, y + bh + 1, bw + 2, 3);
      ctx.fillStyle = f.meter >= 100 ? (w.tick % 10 < 5 ? '#ffffff' : '#7fd8ff') : f.meter >= 50 ? '#7fd8ff' : '#4a7fa0';
      ctx.fillRect(x, y + bh + 1.5, bw * f.meter / 100, 2);
      y -= 5;
    }
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const label = hover ? `${f.name} · Lv${f.level} ${f.archName} · ${f.stats.wins}W/${f.stats.losses}L` : f.name;
    ctx.strokeText(label, head.x, y);
    ctx.fillStyle = f.light;
    ctx.fillText(label, head.x, y);
    if (w.match === 'teams' && showBars) {
      // Team chevron.
      const tw = ctx.measureText(label).width / 2 + 9;
      ctx.fillStyle = TEAM_COLORS[f.team] || '#fff';
      ctx.beginPath();
      ctx.moveTo(head.x - tw - 5, y - 8); ctx.lineTo(head.x - tw + 3, y - 8); ctx.lineTo(head.x - tw - 1, y - 1);
      ctx.fill();
    }
    y -= 14;
  }
  if (f.bubble) {
    ctx.font = `500 12px ${FONT}`;
    const tw = ctx.measureText(f.bubble.text).width;
    const bx = clamp(head.x - tw / 2 - 7, w.left + 2, w.right - tw - 16), by = y - 22;
    ctx.globalAlpha = Math.min(1, f.bubble.t / 15);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tw + 14, 20, 8);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.x - 4, by + 20); ctx.lineTo(head.x, by + 26); ctx.lineTo(head.x + 4, by + 20);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.fillText(f.bubble.text, bx + 7, by + 14);
    ctx.globalAlpha = 1;
  }
}

function drawFx(ctx, w) {
  for (const e of w.fx) {
    const k = e.life / e.max;
    switch (e.type) {
      case 'spark':
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - e.vx * e.len * 0.6, e.y - e.vy * e.len * 0.6);
        ctx.stroke();
        break;
      case 'flash':
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.2 - k * 0.4), 0, TAU); ctx.fill();
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.6 - k * 0.5), 0, TAU); ctx.fill();
        break;
      case 'burst': {
        // Radial wedge "speed lines" that shoot outward.
        const grow = 1 - k;
        ctx.globalAlpha = Math.min(1, k * 1.6) * 0.85;
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
        ctx.lineWidth = 3 * k + 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 - k * 0.7), 0, TAU); ctx.stroke();
        break;
      case 'wave':
        // Flattened ground shockwave.
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 5 * k + 1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * (1 - k * 0.8), e.r * 0.22 * (1 - k * 0.8), 0, 0, TAU); ctx.stroke();
        break;
      case 'dust':
        ctx.globalAlpha = k * 0.6;
        ctx.fillStyle = '#d8d8d8';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.5 - k * 0.5), 0, TAU); ctx.fill();
        break;
      case 'line':
        ctx.globalAlpha = k * 0.7;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dx * k, e.y); ctx.stroke();
        break;
      case 'charge':
      case 'ember':
        ctx.globalAlpha = k;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.type === 'ember' ? e.y - (1 - k) * 25 : e.y, 2.2, 0, TAU); ctx.fill();
        break;
      case 'bolt': {
        const flick = e.life % 3 !== 0;
        ctx.globalAlpha = flick ? 1 : 0.4;
        for (const [width, color] of [[9, 'rgba(120,190,255,0.5)'], [3.5, '#ffffff']]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width * (0.4 + k * 0.6);
          ctx.beginPath();
          ctx.moveTo(e.pts[0].x, e.pts[0].y);
          for (const p of e.pts) ctx.lineTo(p.x + rand(-2, 2), p.y);
          ctx.stroke();
        }
        break;
      }
      case 'text':
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = `800 ${Math.round(e.size * (k > 0.9 ? 1 + (k - 0.9) * 4 : 1))}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(e.str, e.x, e.y);
        ctx.fillStyle = e.color;
        ctx.fillText(e.str, e.x, e.y);
        break;
    }
  }
  ctx.globalAlpha = 1;
}

function drawDecals(ctx, w) {
  ctx.lineCap = 'round';
  for (const d of w.decals) {
    const k = Math.min(1, d.life / 60);
    for (const [width, color] of [[3, 'rgba(255,255,255,0.35)'], [1.6, 'rgba(0,0,0,0.75)']]) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (const b of d.branches) poly(ctx, b);
    }
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles(ctx, w) {
  for (const p of w.projectiles) {
    for (let i = 0; i < p.trail.length; i++) {
      const q = p.trail[i], k = i / p.trail.length;
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = p.owner.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, p.r * k, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, p.owner.light);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.8 * (1 + Math.sin(p.t * 0.5) * 0.08), 0, TAU); ctx.fill();
  }
}

function drawLine(ctx, x1, y1, x2, y2, alpha, dashed) {
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function render(ctx, w, view) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, w.width, w.height);
  if (w.dimT > 0) {
    // Super move: briefly darken the screen.
    ctx.globalAlpha = Math.min(1, w.dimT / 15, (70 - w.dimT) / 8) * 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w.width, w.height);
    ctx.globalAlpha = 1;
  }
  const sh = w.shake > 0.5 ? w.shake : 0;
  ctx.translate(rand(-sh, sh) * 0.6, rand(-sh, sh) * 0.6);

  drawDecals(ctx, w);
  for (const d of w.drawn) {
    const left = d.life - d.t;
    drawLine(ctx, d.plat.x1, d.plat.y1, d.plat.x2, d.plat.y2, left < 180 ? left / 180 : 1, false);
  }
  if (w.drawing) drawLine(ctx, w.drawing.x1, w.drawing.y1, w.drawing.x2, w.drawing.y2, 0.8, true);
  if (w.debug) {
    ctx.strokeStyle = 'rgba(0,255,160,0.8)';
    ctx.lineWidth = 2;
    for (const p of w.winPlats) { ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(w.left, w.floorY); ctx.lineTo(w.right, w.floorY); ctx.stroke();
  }

  drawProjectiles(ctx, w);
  const order = w.fighters.slice().sort((a, b) => (a.state === 'ko') - (b.state === 'ko'));
  for (const f of order) drawFighter(ctx, f, w);
  drawFx(ctx, w);
  for (const f of w.fighters) drawHud(ctx, f, w, f === view.hover);

  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  let by = Math.max(80, w.height * 0.22);
  for (const b of w.banners) {
    const k = b.life / b.max;
    const grow = 1 + Math.max(0, (k - 0.85) * 3);
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.font = `italic 900 ${Math.round(46 * grow)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(b.str, (w.left + w.right) / 2, by);
    ctx.fillStyle = b.color;
    ctx.fillText(b.str, (w.left + w.right) / 2, by);
    by += 58;
  }
  ctx.globalAlpha = 1;
  if (view.tool && view.tool !== 'hand' && w.cursor.on) drawToolCursor(ctx, w, view.tool);
}

function drawToolCursor(ctx, w, tool) {
  const c = w.cursor;
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  const r = tool === 'bomb' ? 120 * w.S : tool === 'smite' ? 45 * w.S : tool === 'eraser' ? 14 : 0;
  if (r) { ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
