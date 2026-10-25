'use strict';
/* Math helpers and the stickman pose library.
 *
 * A pose is a set of joint angles in radians. Limb angles are measured from
 * "straight down", positive = rotated toward the direction the fighter faces.
 * Elbow/knee values are relative to the upper limb. `lean` tilts the torso
 * forward from vertical, `head` tilts the head relative to the torso.
 * Proportions are in units for a 100-unit-tall fighter and scaled at draw time.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ease = (t) => t * t * (3 - 2 * t);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}

// entries: [[key, weight], ...] -> key, or null if every weight is zero.
function weightedPick(entries) {
  let total = 0;
  for (const e of entries) total += Math.max(0, e[1]);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(0, e[1]);
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

const BODY = { thigh: 21, shin: 21, torso: 30, neck: 11, headR: 9, upper: 16, fore: 15 };
const JOINTS = ['head', 'neck', 'hip', 'e1', 'h1', 'e2', 'h2', 'k1', 'f1', 'k2', 'f2'];
const JI = Object.fromEntries(JOINTS.map((j, i) => [j, i]));
const BONES = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10]];

const POSE_KEYS = ['lean', 'head', 'a1', 'e1', 'a2', 'e2', 'l1', 'k1', 'l2', 'k2'];
function P(o) {
  return Object.assign({ lean: 0, head: 0, a1: 0.1, e1: 0.15, a2: -0.1, e2: 0.15, l1: 0.08, k1: 0, l2: -0.08, k2: 0 }, o);
}
function copyPose(dst, src) { for (const k of POSE_KEYS) dst[k] = src[k]; return dst; }
function lerpPose(dst, a, b, t) { for (const k of POSE_KEYS) dst[k] = a[k] + (b[k] - a[k]) * t; return dst; }

// "1" limbs are the near/front side, "2" limbs the far/back side.
const POSES = {
  relaxed: P({}),
  stance: P({ lean: 0.12, head: -0.05, a1: 0.5, e1: 1.9, a2: 0.1, e2: 2.6, l1: 0.35, k1: -0.25, l2: -0.3, k2: -0.15 }),
  crouch: P({ lean: 0.4, head: -0.3, a1: 0.6, e1: 1.9, a2: 0.2, e2: 2.4, l1: 1.2, k1: -2.0, l2: 0.2, k2: -1.6 }),
  block: P({ lean: -0.08, head: -0.25, a1: 1.0, e1: 2.1, a2: 0.75, e2: 2.35, l1: 0.4, k1: -0.4, l2: -0.35, k2: -0.2 }),
  blockLow: P({ lean: 0.35, head: -0.3, a1: 1.1, e1: 1.4, a2: 0.9, e2: 1.6, l1: 1.2, k1: -2.0, l2: 0.2, k2: -1.6 }),
  hitHigh: P({ lean: -0.5, head: -0.6, a1: -0.5, e1: 0.8, a2: -0.8, e2: 0.5, l1: 0.45, k1: -0.4, l2: -0.15, k2: -0.2 }),
  hitGut: P({ lean: 0.65, head: 0.5, a1: 0.3, e1: 1.5, a2: 0.5, e2: 1.3, l1: 0.25, k1: -0.5, l2: -0.35, k2: -0.3 }),
  tumble: P({ lean: -0.4, head: -0.3, a1: 2.4, e1: 0.3, a2: 2.0, e2: 0.6, l1: 0.9, k1: -0.7, l2: 0.2, k2: -0.3 }),
  jump: P({ lean: 0.1, a1: 2.2, e1: 0.4, a2: 1.7, e2: 0.6, l1: 1.0, k1: -1.6, l2: 0.3, k2: -1.2 }),
  fall: P({ lean: 0.05, a1: 1.4, e1: 0.5, a2: 1.9, e2: 0.4, l1: 0.5, k1: -0.7, l2: -0.2, k2: -0.5 }),
  land: P({ lean: 0.25, a1: 0.7, e1: 1.4, a2: 0.4, e2: 1.6, l1: 0.9, k1: -1.5, l2: -0.1, k2: -1.0 }),
  victory: P({ lean: -0.05, head: -0.25, a1: 2.95, e1: 0.15, a2: 0.15, e2: 0.25 }),
  sit: P({ lean: 0.08, head: 0.1, a1: 0.35, e1: 0.5, a2: -0.25, e2: 0.4, l1: 1.5, k1: -1.4, l2: 1.4, k2: -1.25 }),
  sleep: P({ lean: 0.55, head: 0.7, a1: 0.5, e1: 0.4, a2: 0.3, e2: 0.4, l1: 1.5, k1: -1.4, l2: 1.4, k2: -1.25 }),
  roll: P({ lean: 1.0, head: 0.5, a1: 1.2, e1: 1.8, a2: 1.0, e2: 1.9, l1: 2.0, k1: -2.6, l2: 1.8, k2: -2.6 }),
  grab: P({ lean: 0.3, a1: 1.5, e1: 0.3, a2: 1.35, e2: 0.45, l1: 0.45, k1: -0.3, l2: -0.35, k2: -0.1 }),
  throwPose: P({ lean: -0.35, a1: 2.4, e1: 0.5, a2: 2.2, e2: 0.6, l1: 0.5, k1: -0.2, l2: -0.4, k2: -0.1 }),
  dash: P({ lean: 0.75, head: -0.55, a1: -1.2, e1: 0.4, a2: -1.5, e2: 0.3, l1: 1.1, k1: -1.4, l2: -0.7, k2: -0.7 }),
  // Clinging to a wall that is behind the fighter: feet planted back on it.
  wall: P({ lean: 0.15, head: -0.1, a1: 0.9, e1: 1.6, a2: -1.5, e2: 0.4, l1: -0.4, k1: -1.1, l2: 0.3, k2: -1.9 }),
  pound: P({ lean: 0.2, head: 0.3, a1: 2.6, e1: 0.3, a2: 2.4, e2: 0.4, l1: 0.1, k1: -0.1, l2: -0.15, k2: -0.1 }),
  charge: P({ lean: -0.15, head: -0.3, a1: -0.7, e1: 1.3, a2: -0.9, e2: 1.2, l1: 0.55, k1: -0.6, l2: -0.5, k2: -0.4 }),
};

function walkPose(out, ph, fight) {
  const s = Math.sin(ph), c = Math.cos(ph);
  if (fight) {
    // Shuffle while keeping guard up.
    copyPose(out, POSES.stance);
    out.l1 += 0.22 * s; out.k1 -= 0.35 * Math.max(0, c);
    out.l2 -= 0.22 * s; out.k2 -= 0.35 * Math.max(0, -c);
    out.a1 += 0.05 * s;
  } else {
    copyPose(out, POSES.relaxed);
    out.lean = 0.06;
    out.l1 = 0.5 * s; out.k1 = -0.1 - 0.75 * Math.max(0, c);
    out.l2 = -0.5 * s; out.k2 = -0.1 - 0.75 * Math.max(0, -c);
    out.a1 = -0.45 * s; out.e1 = 0.35; out.a2 = 0.45 * s; out.e2 = 0.35;
  }
  return out;
}

function runPose(out, ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  copyPose(out, POSES.relaxed);
  out.lean = 0.38; out.head = -0.25;
  out.l1 = 0.25 + 0.85 * s; out.k1 = -0.3 - 1.4 * Math.max(0, c);
  out.l2 = 0.25 - 0.85 * s; out.k2 = -0.3 - 1.4 * Math.max(0, -c);
  out.a1 = -1.0 * s; out.e1 = 1.7; out.a2 = 1.0 * s; out.e2 = 1.7;
  return out;
}

/* Forward kinematics in local units with the hip at the origin.
 * d = facing (+1 right, -1 left); rot spins the whole body around the torso centre.
 * Returns {x:[11], y:[11], low} where low is the lowest point (for ground contact). */
function poseLocal(p, d, rot, out) {
  out = out || { x: new Array(11), y: new Array(11), low: 0 };
  const X = out.x, Y = out.y, B = BODY;
  const nx = Math.sin(p.lean) * B.torso * d, ny = -Math.cos(p.lean) * B.torso;
  const ha = p.lean + p.head;
  X[0] = nx + Math.sin(ha) * B.neck * d; Y[0] = ny - Math.cos(ha) * B.neck;
  X[1] = nx; Y[1] = ny;
  X[2] = 0; Y[2] = 0;
  const limb = (i, ox, oy, a, b, l1, l2) => {
    X[i] = ox + Math.sin(a) * l1 * d; Y[i] = oy + Math.cos(a) * l1;
    X[i + 1] = X[i] + Math.sin(a + b) * l2 * d; Y[i + 1] = Y[i] + Math.cos(a + b) * l2;
  };
  // Shoulders sit a little below the neck point.
  const sx = nx * 0.88, sy = ny * 0.88;
  limb(3, sx, sy, p.a1, p.e1, B.upper, B.fore);
  limb(5, sx, sy, p.a2, p.e2, B.upper, B.fore);
  limb(7, 0, 0, p.l1, p.k1, B.thigh, B.shin);
  limb(9, 0, 0, p.l2, p.k2, B.thigh, B.shin);
  if (rot) {
    const th = rot * d, c = Math.cos(th), s = Math.sin(th);
    const cx = nx / 2, cy = ny / 2;
    for (let i = 0; i < 11; i++) {
      const rx = X[i] - cx, ry = Y[i] - cy;
      X[i] = cx + rx * c - ry * s;
      Y[i] = cy + rx * s + ry * c;
    }
  }
  let low = -1e9;
  for (let i = 0; i < 11; i++) {
    const y = Y[i] + (i === 0 ? B.headR : 1.5);
    if (y > low) low = y;
  }
  out.low = low;
  return out;
}
