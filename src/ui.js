'use strict';
/* Control UI: a tool rail on the right edge plus six panels (Fighters, Powers,
 * Armory, Maps, Match, Settings). Vector icons, smooth portraits and map
 * thumbnails rendered from the real map definitions. */
const TOOL_DESC = {
  hand: 'Drag a fighter to throw it, click to poke it.',
  pencil: 'Drag to draw a platform.',
  eraser: 'Drag over drawn lines to erase them.',
  bomb: 'Click to drop a bomb.',
  smite: 'Click to call down lightning.',
  spawn: 'Click anywhere to drop a fighter.',
  item: 'Click a fighter to give it, or anywhere to drop it.',
};

const ICON_PATHS = {
  hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z M15 5l4 4',
  eraser: 'M7 21l-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z M22 21H7 M5 11l9 9',
  bomb: 'M11 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M15.5 6.5 18 4 M19 2v1 M21 5h1 M20.5 3.5l.7-.7',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  spawn: 'M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z M19 15v5 M16.5 17.5h5',
  fighter: 'M12 7.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 7.5v7 M12 14.5l-4 6.5 M12 14.5l4 6.5 M6 10.5h12',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  sword: 'M14.5 17.5 3 6V3h3l11.5 11.5 M13 19l6-6 M16 16l4 4 M19 21l2-2',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  swords: 'M14.5 17.5 3 6V3h3l11.5 11.5 M13 19l6-6 M16 16l4 4 M19 21l2-2 M14.5 6.5 18 3h3v3l-3.5 3.5 M5 14l4 4 M7 17l-3 3 M3 19l2 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9 7 7 M17 17l2.1 2.1 M4.9 19.1 7 17 M17 7l2.1-2.1',
  collapse: 'M13 17l5-5-5-5 M6 17l5-5-5-5',
  expand: 'M11 17l-5-5 5-5 M18 17l-5-5 5-5',
  close: 'M18 6 6 18 M6 6l12 12',
};

function iconSvg(name, size = 20) {
  if (name === 'brand') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v7M12 15l-4 6M12 15l4 6M6 11h12"/></svg>`;
  }
  if (name === 'teams') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="8" cy="9" r="4" fill="#ff4d4d"/><circle cx="16" cy="9" r="4" fill="#3d8bff"/><path d="M2 21c0-4 3-6 6-6s6 2 6 6M10 21c0-4 3-6 6-6s6 2 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  if (name === 'heart') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 21s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.6-9.5 9-9.5 9z" fill="#ff4d6d"/></svg>`;
  const d = ICON_PATHS[name];
  if (!d) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

// Smooth vector art for weapons, items and power fruits.
function itemArt(kind, size = 28) {
  const k = '#0a0a0a';
  let body;
  if (ABILITIES[kind]) {
    const a = ABILITIES[kind];
    body = `<circle cx="16" cy="18.5" r="11" fill="${a.color}" stroke="${k}" stroke-width="1.6"/>
      <path d="M9.5 16c2-3 4.5-3 6.5 0s4.5 3 6.5 0M9 21.5c2-3 4.8-3 7 0s4.8 3 7 0" stroke="${a.color2}" stroke-width="1.9" fill="none" stroke-linecap="round" opacity=".9"/>
      <path d="M16 8V4.5" stroke="#6e4022" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="20" cy="5.5" rx="3.6" ry="2" fill="#4fc35a" transform="rotate(-25 20 5.5)"/>`;
  } else {
    body = {
      sword: `<g transform="rotate(-45 16 16)"><rect x="14.4" y="1.5" width="3.2" height="21" rx="1.2" fill="#e8eef5" stroke="${k}" stroke-width="1.2"/><rect x="9.5" y="21.5" width="13" height="2.8" rx="1.2" fill="#3a3a46"/><rect x="14.6" y="24" width="2.8" height="6.5" rx="1.2" fill="#a8693a"/></g>`,
      hammer: `<g transform="rotate(-35 16 16)"><rect x="14.6" y="10" width="2.8" height="20" rx="1" fill="#a8693a"/><rect x="6.5" y="3" width="19" height="9" rx="2" fill="#9aa0aa" stroke="${k}" stroke-width="1.2"/></g>`,
      spear: `<g transform="rotate(-45 16 16)"><rect x="15" y="8" width="2" height="23" rx="1" fill="#a8693a"/><path d="M16 0.5 20.5 10h-9z" fill="#dfe6ee" stroke="${k}" stroke-width="1.1"/></g>`,
      blaster: `<path d="M3.5 10.5h20l3.5 2.5v3H15l-2 9H7l2-9H3.5z" fill="#5c6370" stroke="${k}" stroke-width="1.2" stroke-linejoin="round"/><rect x="24" y="11.5" width="5" height="2.6" rx="1" fill="#ffd21a"/>`,
      medkit: `<rect x="4" y="8.5" width="24" height="18" rx="4" fill="#f4f4f6" stroke="${k}" stroke-width="1.2"/><path d="M16 12.5v10M11 17.5h10" stroke="#ff3b3b" stroke-width="3.2" stroke-linecap="round"/><path d="M12 8.5V6h8v2.5" stroke="${k}" stroke-width="1.5" fill="none"/>`,
      energy: `<rect x="9" y="3.5" width="14" height="25" rx="3.5" fill="#2f7dff" stroke="${k}" stroke-width="1.2"/><path d="M17.5 7.5 12 17h4.5l-2 7.5 6.5-10.5h-4.5z" fill="#ffd21a"/>`,
      grenade: `<ellipse cx="15" cy="19.5" rx="9" ry="10" fill="#3f8f3a" stroke="${k}" stroke-width="1.2"/><path d="M10 15h10M9 20h12M10 25h10" stroke="#2c6a28" stroke-width="1.2"/><rect x="12" y="6" width="6" height="4" rx="1" fill="#5c6370"/><circle cx="22.5" cy="7" r="3" stroke="#c8ccd4" stroke-width="1.6" fill="none"/>`,
    }[kind] || '';
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32">${body}</svg>`;
}

const ITEM_DESC = {
  sword: 'Fast, long slashes.', hammer: 'Slow smash that launches.', spear: 'The longest reach.', blaster: 'Shoots from range.',
  medkit: 'Heals 45 health.', energy: 'Instantly fills the ultimate meter.', grenade: 'Thrown at enemies.',
  flame: 'Fire Fist: an exploding fireball.', ice: 'Ice Age: freezes enemies solid.', light: 'Teleports and kicks up to 3 foes.',
  quake: 'Cracks the screen, huge knockback.', dark: 'Black hole that pulls, then implodes.', rumble: 'A lightning storm on everyone.',
  gravity: 'Drops a meteor that leaves a crater.', buddha: 'Becomes a golden giant.', ki: 'Screen-wide energy beam.',
};
const itemName = (k) => WEAPONS[k] ? WEAPONS[k].name : ABILITIES[k] ? ABILITIES[k].name : CONSUMABLES[k] ? CONSUMABLES[k].name : '';

// Smooth fighter portrait (with power gloves and weapon if it has them).
function drawPortrait(canvas, entry, f) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const S = H / 112;
  const savedU = U, savedT = T;
  U = 1; T = 2;
  const pose = f && f.hp <= 0 ? POSES.hitHigh : POSES.stance;
  const L = poseLocal(pose, 1, 0);
  const P = {};
  JOINTS.forEach((j, i) => { P[j] = { x: W / 2 - 4 * S + L.x[i] * S, y: H - 6 * S + (L.y[i] - L.low) * S }; });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawBody(ctx, P, S, entry.color, shade(entry.color, -0.38), INK, parseInt(entry.color.slice(1, 3), 16) < 80);
  if (f && f.ability) {
    const ab = ABILITIES[f.ability], r = BODY.limb * S * 0.8;
    for (const h of [P.h1, P.h2]) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(h.x, h.y, r + 2 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = ab.color; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.fill();
    }
  }
  if (f && f.weapon) drawWeapon(ctx, { weapon: f.weapon, pts: P, S, facing: 1, rag: null, state: 'idle', moveKey: null, phase() { return null; } }, { flashFx() {} });
  U = savedU; T = savedT;
}

// Map thumbnail drawn from the real map definition.
function drawMapThumb(canvas, key) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const LW = 640, LH = Math.round(640 * H / W), F = LH - 8, S = (F - 14) / (MAP_H + 16);
  ctx.setTransform(W / LW, 0, 0, H / LH, 0, 0);
  const savedU = U, savedT = T;
  U = 1; T = 1.5;
  if (key) {
    const m = buildMap(key, { L: 0, R: LW, F, S });
    drawMapBack(ctx, { left: 0, right: LW, floorY: F, S }, m, 60);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, F, LW, LH - F);
  U = savedU; T = savedT;
}

function initUI(app) {
  const $ = (id) => document.getElementById(id);
  const w = app.world, s = app.settings;
  const ui = $('ui');
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = iconSvg(el.dataset.icon, el.classList.contains('ic') ? 18 : 20);

  // ---- panels ----
  const secBtns = [...document.querySelectorAll('[data-sec]')];
  let open = null;
  const placePanel = (panel) => {
    const uiTop = ui.getBoundingClientRect().top, railTop = $('rail').getBoundingClientRect().top;
    panel.style.maxHeight = 'none';
    const h = Math.min(panel.scrollHeight, innerHeight - 24);
    const top = clamp(railTop, 12, innerHeight - h - 12);
    panel.style.top = (top - uiTop) + 'px';
    panel.style.maxHeight = (innerHeight - top - 12) + 'px';
  };
  const openPanel = (name) => {
    open = open === name ? null : name;
    for (const b of secBtns) b.classList.toggle('on', b.dataset.sec === open);
    for (const p of document.querySelectorAll('.panel')) p.classList.toggle('open', p.id === 'sec-' + open);
    ui.classList.toggle('panelopen', !!open);
    if (open) { refresh(true); placePanel($('sec-' + open)); }
  };
  for (const b of secBtns) b.onclick = () => openPanel(b.dataset.sec);
  for (const x of document.querySelectorAll('[data-close]')) x.onclick = () => openPanel(open);
  window.addEventListener('resize', () => { if (open) placePanel($('sec-' + open)); });
  // While handing out items/powers the panel stays open; otherwise clicking the scene closes it.
  app.closeFly = () => { if (open) openPanel(open); };

  const setMini = (on) => {
    ui.classList.toggle('mini', on);
    document.body.classList.toggle('mini', on);
    s.panelOpen = !on;
    app.save();
  };
  $('mini').onclick = () => { if (open) openPanel(open); setMini(true); };
  $('tab').onclick = () => setMini(false);
  setMini(s.panelOpen === false);
  app.togglePanel = () => setMini(!ui.classList.contains('mini'));
  app.showPanel = (on) => ui.classList.toggle('hidden', !on);

  // ---- tools ----
  const toolBtns = [...document.querySelectorAll('[data-tool]')];
  for (const b of toolBtns) b.onclick = () => {
    if (open) openPanel(open);
    app.setTool(app.tool === b.dataset.tool && b.dataset.tool !== 'hand' ? 'hand' : b.dataset.tool);
  };
  app.onToolChange = (t) => { for (const b of toolBtns) b.classList.toggle('on', b.dataset.tool === t); };

  const toggle = (id, get, set) => {
    const el = $(id);
    const show = () => el.classList.toggle('on', !!get());
    el.onclick = () => { set(!get()); show(); };
    show();
    return show;
  };
  const segment = (id, attr, get, set) => {
    const btns = [...document.querySelectorAll(`#${id} button`)];
    const show = () => { for (const b of btns) b.classList.toggle('on', b.dataset[attr] === String(get())); };
    for (const b of btns) b.onclick = () => { set(b.dataset[attr]); show(); };
    show();
    return show;
  };

  // ---- giving powers / weapons / items ----
  // Selecting a card arms the "item" tool (click a fighter on screen) and shows a
  // bar with every fighter as a chip for one-click giving.
  const giveBars = { powers: $('give-powers'), armory: $('give-armory') };
  const give = (f, kind) => {
    giveItem(w, f, kind);
    if (ABILITIES[kind] || WEAPONS[kind]) app.saveRoster();
    refresh(true);
  };
  const select = (kind) => {
    const same = app.tool === 'item' && app.itemKind === kind;
    app.itemKind = same ? null : kind;
    app.setTool(same ? 'hand' : 'item');
    renderGiveBars();
    markCards();
  };
  function renderGiveBars() {
    for (const [sec, bar] of Object.entries(giveBars)) {
      const k = app.tool === 'item' ? app.itemKind : null;
      const mine = k && (sec === 'powers' ? !!ABILITIES[k] : !ABILITIES[k]);
      bar.classList.toggle('show', !!mine);
      if (!mine) { bar.textContent = ''; continue; }
      bar.innerHTML = `<div class="gt">${itemArt(k, 22)} Give ${itemName(k)}${ABILITIES[k] ? ' fruit' : ''} to <button data-cancel>Cancel</button></div>
        <div class="chips">${w.fighters.map((f) => `<button class="chip" data-give="${f.name}"><i style="background:${f.color}"></i>${f.name}</button>`).join('')}
        ${w.fighters.length > 1 ? '<button class="chip all" data-give="*">Everyone</button>' : ''}</div>
        <div class="hint">…or click a fighter on screen, or anywhere to drop it.</div>`;
      bar.querySelector('[data-cancel]').onclick = () => app.setTool('hand');
      for (const c of bar.querySelectorAll('[data-give]')) c.onclick = () => {
        const targets = c.dataset.give === '*' ? w.fighters : w.fighters.filter((f) => f.name === c.dataset.give);
        for (const f of targets) give(f, k);
      };
    }
  }
  app.onItemToolEnd = () => { app.itemKind = null; renderGiveBars(); markCards(); };
  app.onGive = () => refresh(true);

  const cardsByKind = [];
  const makeCard = (parent, kind, extra) => {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<div class="h">${itemArt(kind, 28)}<span>${itemName(kind)}</span></div><div class="d">${ITEM_DESC[kind] || ''}</div>${extra || ''}`;
    b.onclick = () => select(kind);
    parent.appendChild(b);
    cardsByKind.push({ el: b, kind });
  };
  function markCards() { for (const c of cardsByKind) c.el.classList.toggle('on', app.tool === 'item' && app.itemKind === c.kind); }
  for (const k of ABILITY_KEYS) makeCard($('power-cards'), k, `<div class="u">Ult · ${ULTS[k].name}</div>`);
  for (const k of Object.keys(WEAPONS)) makeCard($('weapon-cards'), k, `<div class="u">Ult · ${ULTS[k].name}</div>`);
  for (const k of Object.keys(CONSUMABLES)) makeCard($('item-cards'), k);
  $('pow-random').onclick = () => { for (const f of w.fighters) giveItem(w, f, pick(ABILITY_KEYS)); app.saveRoster(); refresh(true); };
  $('pow-strip').onclick = () => { for (const f of w.fighters) { f.ability = null; f.giantT = 0; } app.saveRoster(); refresh(true); app.toast('All powers removed.'); };
  $('arm-rain').onclick = () => {
    const kinds = Object.keys(WEAPONS).concat(Object.keys(CONSUMABLES), ABILITY_KEYS);
    for (let i = 0; i < 8; i++) spawnItem(w, pick(kinds), rand(w.left + 60, w.right - 60), rand(-200, -40), { vx: rand(-2, 2) });
  };
  $('arm-clear').onclick = () => { w.items = []; };

  // ---- fighters ----
  let selName = null;
  const archBtns = [...document.querySelectorAll('#arch button')];
  for (const b of archBtns) b.onclick = () => { app.spawnArch = b.dataset.arch; for (const x of archBtns) x.classList.toggle('on', x === b); };
  const slotsEl = $('slots');
  const slots = PALETTE.map((entry) => {
    const el = document.createElement('div');
    el.className = 'slot empty';
    el.innerHTML = `<div class="hp"><i></i></div><div class="badges"><span class="badge pw"></span><span class="wb"></span></div>
      <canvas width="88" height="100"></canvas><span class="nm">${entry.name}</span><span class="plus">+</span>`;
    const cv = el.querySelector('canvas');
    el.onclick = () => {
      let f = w.fighters.find((q) => q.name === entry.name);
      if (!f) { f = w.addFighter({ name: entry.name, arch: app.spawnArch }); if (!f) { app.toast("That's everyone. 12 max!"); return; } app.saveRoster(); }
      else { f.say('Here!', 60); w.ring(f.pts.neck.x, f.pts.neck.y, f.elc.main, 40 * w.S); }
      selName = entry.name;
      refresh(true);
    };
    slotsEl.appendChild(el);
    return { el, entry, cv, hp: el.querySelector('.hp i'), hpWrap: el.querySelector('.hp'), pw: el.querySelector('.pw'), wb: el.querySelector('.wb'), key: '' };
  });
  $('add-rand').onclick = () => {
    const free = PALETTE.filter((p) => !w.fighters.some((f) => f.name === p.name));
    if (!free.length) { app.toast("That's everyone. 12 max!"); return; }
    const f = w.addFighter({ name: pick(free).name, arch: app.spawnArch || pick(ARCH_NAMES) });
    if (f) selName = f.name;
    app.saveRoster(); refresh(true);
  };
  $('heal').onclick = () => w.healAll();
  $('clear-all').onclick = () => { w.clearFighters(); selName = null; app.saveRoster(); refresh(true); };

  let editorKey = '';
  function renderEditor(force) {
    const ed = $('editor');
    const f = w.fighters.find((q) => q.name === selName);
    const key = f ? [f.name, f.archName, f.ability, f.weapon && f.weapon.kind, Math.round(f.hp / 10), f.stats.wins].join('|') : 'none' + w.fighters.length;
    if (key === editorKey && !force) return;
    editorKey = key;
    if (!f) {
      ed.innerHTML = `<div class="hint">${w.fighters.length ? 'Select a fighter to change its style, power and weapon.' : 'Click a slot to add a fighter.'} Empty slots add that color.</div>`;
      return;
    }
    const ab = f.ability && ABILITIES[f.ability];
    ed.innerHTML = `<div class="top"><canvas width="108" height="124"></canvas><div>
        <div class="name" style="color:${f.rim ? '#cfcfd6' : f.color}">${f.name}</div>
        <div class="meta">Level ${f.level} · ${f.stats.wins} wins · ${f.stats.losses} losses<br>${Math.max(0, Math.round(f.hp))} HP · ${ab ? ab.name + ' power' : 'no power'}${f.weapon ? ' · ' + WEAPONS[f.weapon.kind].name : ''}</div></div></div>
      <div class="lab">Style</div>
      <div class="seg" data-ed="arch">${ARCH_NAMES.map((a) => `<button data-a="${a}" class="${a === f.archName ? 'on' : ''}">${a === 'Tactician' ? 'Tactic' : a}</button>`).join('')}</div>
      <div class="lab">Power <span>${ab ? 'Ult · ' + ULTS[f.ability].name : 'none'}</span></div>
      <div class="pick" data-ed="power"><button data-k="" class="${f.ability ? '' : 'on'}"><span class="none">∅</span></button>${ABILITY_KEYS.map((k) => `<button data-k="${k}" title="${ABILITIES[k].name}" class="${f.ability === k ? 'on' : ''}">${itemArt(k, 24)}</button>`).join('')}</div>
      <div class="lab">Weapon <span>${f.weapon ? 'Ult · ' + ULTS[f.weapon.kind].name : 'none'}</span></div>
      <div class="pick" data-ed="weapon"><button data-k="" class="${f.weapon ? '' : 'on'}"><span class="none">∅</span></button>${Object.keys(WEAPONS).map((k) => `<button data-k="${k}" title="${WEAPONS[k].name}" class="${f.weapon && f.weapon.kind === k ? 'on' : ''}">${itemArt(k, 24)}</button>`).join('')}</div>
      <div class="row"><button class="btn small" data-ed="heal">Heal</button><button class="btn small" data-ed="ult">Fill ultimate</button><button class="btn small danger" data-ed="remove">Remove</button></div>`;
    drawPortrait(ed.querySelector('canvas'), PALETTE.find((p) => p.name === f.name), f);
    for (const b of ed.querySelectorAll('[data-ed=arch] button')) b.onclick = () => { f.archName = b.dataset.a; f.arch = ARCHETYPES[b.dataset.a]; app.saveRoster(); refresh(true); };
    for (const b of ed.querySelectorAll('[data-ed=power] button')) b.onclick = () => {
      if (b.dataset.k) giveItem(w, f, b.dataset.k); else { f.ability = null; f.giantT = 0; }
      app.saveRoster(); refresh(true);
    };
    for (const b of ed.querySelectorAll('[data-ed=weapon] button')) b.onclick = () => {
      if (b.dataset.k) giveItem(w, f, b.dataset.k); else f.weapon = null;
      app.saveRoster(); refresh(true);
    };
    ed.querySelector('[data-ed=heal]').onclick = () => { f.hp = 100; w.ring(f.pts.hip.x, f.pts.hip.y, '#40e070', 40 * w.S); refresh(true); };
    ed.querySelector('[data-ed=ult]').onclick = () => { f.meter = 100; refresh(true); };
    ed.querySelector('[data-ed=remove]').onclick = () => { w.removeFighter(f); selName = null; app.saveRoster(); refresh(true); };
  }

  // ---- maps ----
  const mapCards = [];
  const mapList = [null].concat(MAP_KEYS);
  for (const key of mapList) {
    const b = document.createElement('button');
    b.className = 'card map';
    b.innerHTML = `<canvas width="300" height="116"></canvas><div class="h">${key ? MAPS[key].name : 'No map'}</div><div class="d">${key ? MAPS[key].desc : 'Just your desktop.'}</div>`;
    b.onclick = () => {
      setWorldMap(w, key);
      s.map = key; app.save();
      showMaps();
    };
    $('map-cards').appendChild(b);
    mapCards.push({ el: b, key, cv: b.querySelector('canvas') });
  }
  let thumbsDrawn = false;
  function showMaps() {
    if (!thumbsDrawn) { for (const c of mapCards) drawMapThumb(c.cv, c.key); thumbsDrawn = true; }
    for (const c of mapCards) c.el.classList.toggle('on', c.key === w.mapKey);
    $('map-sub').textContent = w.mapKey ? 'Playing on ' + MAPS[w.mapKey].name : 'No map. Fighting on your desktop';
  }
  toggle('use-windows', () => w.useWindows, (v) => { w.useWindows = s.useWindows = v; w.rebuildPlatforms(); app.save(); });

  // ---- match ----
  const modeBtns = [...document.querySelectorAll('#mode .mode')];
  const showMode = () => {
    const m = w.peace ? 'peace' : w.match;
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === m);
  };
  for (const b of modeBtns) b.onclick = () => {
    const m = b.dataset.mode;
    if (m === 'peace') w.peace = true;
    else { w.peace = false; w.setMatch(m); s.match = m; }
    s.peace = w.peace;
    app.save();
    showMode();
  };
  app.showMode = showMode;
  showMode();
  $('brawl').onclick = () => app.command('brawl');
  toggle('slowmo', () => w.slowmo, (v) => { w.slowmo = v; });
  app.onPause = toggle('pause', () => app.paused, (v) => { app.paused = v; });
  const rest = $('rest');
  rest.value = s.rest;
  $('rest-val').textContent = s.rest + 's';
  rest.oninput = () => { s.rest = +rest.value; w.restTicks = s.rest * 60; $('rest-val').textContent = s.rest + 's'; app.save(); };

  // ---- settings ----
  segment('size', 'size', () => s.size, (v) => { if (s.size === v) return; s.size = v; app.saveRoster(); app.save(); location.reload(); });
  segment('pixel', 'px', () => s.pixel, (v) => { s.pixel = app.view.pixel = +v; app.save(); });
  toggle('power-tags', () => w.powerTags, (v) => { w.powerTags = s.powerTags = v; app.save(); });
  toggle('cinematic', () => w.cinematic, (v) => { s.cinematic = w.cinematic = v; app.save(); });
  toggle('debug', () => w.debug, (v) => { w.debug = v; });
  $('clear-lines').onclick = () => w.clearDrawn();
  $('reset-ai').onclick = () => {
    for (const f of w.fighters) { f.stats = { wins: 0, losses: 0, w: {} }; saveStats(f); }
    app.toast('Fighters forgot everything they learned.');
  };
  if (app.api) {
    document.body.classList.add('electron');
    $('check-upd').onclick = () => { $('upd-status').textContent = 'Checking…'; app.api.checkUpdates(); };
    toggle('auto-upd', () => s.autoUpdate, (v) => { s.autoUpdate = v; app.save(); app.api.setAutoUpdate(v); });
    $('hide-all').onclick = () => app.api.hide();
    $('quit').onclick = () => app.api.quit();
  } else {
    $('demo-hint').textContent = 'Browser demo: drag the fake windows around. Keys: B fight, N add, P peace, 1-6 tools.';
  }
  app.onUpdateStatus = (st) => { $('upd-status').textContent = st.text || ''; if (st.toast) app.toast(st.text); };
  app.setVersion = (v) => { $('ver').textContent = 'StickFight Pets v' + v; };

  // ---- live refresh ----
  function refresh(force) {
    if (!open && !force) return;
    $('f-sub').textContent = `${w.fighters.length} of ${PALETTE.length} on screen`;
    $('round').textContent = w.peace ? 'Peace mode' : w.round ? 'Round ' + w.round : 'Ready';
    $('arm-sub').textContent = w.items.length ? `${w.items.length} item${w.items.length > 1 ? 's' : ''} on screen` : 'Weapons and items';
    if (selName && !w.fighters.some((f) => f.name === selName)) selName = null;
    for (const sl of slots) {
      const f = w.fighters.find((q) => q.name === sl.entry.name);
      sl.el.classList.toggle('empty', !f);
      sl.el.classList.toggle('sel', !!f && f.name === selName);
      sl.hpWrap.style.display = f ? 'block' : 'none';
      sl.pw.style.display = f && f.ability ? 'block' : 'none';
      if (f) {
        sl.hp.style.width = Math.max(0, f.hp) + '%';
        sl.hp.style.background = f.hp > 50 ? '#3ddc84' : f.hp > 25 ? '#ffc93d' : '#ff4d4d';
        if (f.ability) { sl.pw.style.background = ABILITIES[f.ability].color; }
        sl.el.title = `${f.name} · ${f.archName}` + (f.ability ? ` · ${ABILITIES[f.ability].name}` : '') + (f.weapon ? ` · ${WEAPONS[f.weapon.kind].name}` : '');
      } else sl.el.title = 'Add ' + sl.entry.name;
      const key = f ? [f.hp <= 0, f.ability, f.weapon && f.weapon.kind].join('|') : 'empty';
      if (key !== sl.key) {
        sl.key = key;
        drawPortrait(sl.cv, sl.entry, f);
        sl.wb.innerHTML = f && f.weapon ? itemArt(f.weapon.kind, 16) : '';
      }
    }
    renderEditor(force);
    if (open === 'maps' || force) showMaps();
    if (force && app.tool === 'item') renderGiveBars();
  }
  setInterval(refresh, 300);
  refresh(true);
}
