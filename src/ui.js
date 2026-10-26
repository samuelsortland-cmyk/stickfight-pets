'use strict';
/* The tool dock and its fly-out cards (Fighters, Match, Settings). Icons are
 * 12x12 pixel-art bitmaps rendered as crisp SVG. */
const TOOL_DESC = {
  hand: 'Drag a fighter to throw it, click to poke it.',
  pencil: 'Drag to draw a platform.',
  eraser: 'Drag over drawn lines to erase them.',
  bomb: 'Click to drop a bomb.',
  smite: 'Click to call down lightning.',
  spawn: 'Click anywhere to drop a fighter.',
  item: 'Click a fighter to give it, or anywhere to drop it.',
};

const ICON_COLORS = {
  k: '#0a0a0a', w: '#f4f1ea', g: '#9a9aa8', d: '#5c5c6a', o: '#ff7a1a', y: '#ffd21a', r: '#ff2a2a', b: '#2f7dff',
  c: '#29c6ff', p: '#ff8fc8', s: '#e0c9a6', n: '#c48a52', l: '#8fe35a',
};
const ICONS = {
  hand: [
    '....s.......', '...sss.s....', '...sssss.s..', '...sssssss..', '.s.sssssss..', '.sssssssss..',
    '..ssssssss..', '..ssssssss..', '...ssssss...', '...ssssss...', '....nnnn....', '....nnnn....'],
  pencil: [
    '.........pp.', '........pppp', '.......ggpp.', '......yyyg..', '.....yyyy...', '....yyyy....',
    '...yyyy.....', '..yyyy......', '..nyy.......', '.nnn........', '.kn.........', '............'],
  eraser: [
    '............', '......pppp..', '.....pppppp.', '....pppppppp', '...wpppppppp', '..wwwppppppp',
    '.wwwwwpppp..', '.wwwwwwpp...', '..wwwwww....', '...wwww.....', '............', '............'],
  bomb: [
    '.........y..', '........yoy.', '.......n.y..', '......n.....', '...gggg.....', '..gggggg....',
    '.gwwggggg...', '.gwggggggg..', '.ggggggggd..', '.gggggggdd..', '..ggggddd...', '...dddd.....'],
  bolt: [
    '.......cccc.', '......cccc..', '.....cccc...', '....cccc....', '...cccccccc.', '...wcccccc..',
    '......cccc..', '.....cccc...', '....ccc.....', '...cc.......', '..c.........', '............'],
  spawn: [
    '...y........', '...y........', '..yyy.......', 'yyywyyy.....', '..yyy.......', '...y........',
    '...y....ll..', '........ll..', '......llllll', '......llllll', '........ll..', '........ll..'],
  fighter: [
    '...oooooo...', '..oo....oo..', '..o......o..', '..oo....oo..', '...oooooo...', '.....oo.....',
    '.oooooooooo.', '.....oo.....', '.....oo.....', '....oooo....', '...oo..oo...', '..oo....oo..'],
  swords: [
    'w..........w', '.w........w.', '..w......w..', '...w....w...', '....w..w....', '.....ww.....',
    '.....ww.....', '....w..w....', '..ow....wo..', '...o....o...', '..o......o..', '.o........o.'],
  teams: [
    '............', '..rr....bb..', '.rrrr..bbbb.', '.rrrr..bbbb.', '..rr....bb..', '............',
    '.rrrr..bbbb.', 'rrrrrrbbbbbb', 'rrrrrrbbbbbb', 'rrrrrrbbbbbb', '............', '............'],
  heart: [
    '............', '.rrr...rrr..', 'rrwrr.rrrrr.', 'rwrrrrrrrrr.', 'rrrrrrrrrrr.', 'rrrrrrrrrrr.',
    '.rrrrrrrrr..', '..rrrrrrr...', '...rrrrr....', '....rrr.....', '.....r......', '............'],
  gear: [
    '.....gg.....', '.g..gggg..g.', '..gggggggg..', '..ggg..ggg..', '.ggg....ggg.', 'gggg....gggg',
    'gggg....gggg', '.ggg....ggg.', '..ggg..ggg..', '..gggggggg..', '.g..gggg..g.', '.....gg.....'],
  collapse: [
    '............', '.ww...ww....', '..ww...ww...', '...ww...ww..', '....ww...ww.', '.....ww...ww',
    '.....ww...ww', '....ww...ww.', '...ww...ww..', '..ww...ww...', '.ww...ww....', '............'],
  armory: [
    '..........ww', '.........wgw', '........wgw.', '.......wgw..', '......wgw...', '.oo..wgw....',
    'o..oyyw.....', 'o..yyy......', '.oo.yyy.....', '...nn.yy....', '..nn........', '.nn.........'],
  expand: [
    '............', '....ww...ww.', '...ww...ww..', '..ww...ww...', '.ww...ww....', 'ww...ww.....',
    'ww...ww.....', '.ww...ww....', '..ww...ww...', '...ww...ww..', '....ww...ww.', '............'],
};

function iconSvg(name, size = 24) {
  if (name === 'logo') return logoSvg();
  const rows = ICONS[name];
  if (!rows) return '';
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = ICON_COLORS[row[x]];
      if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    }
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects}</svg>`;
}

// Item / fruit sprite (from arsenal.js) as crisp SVG.
function itemSvg(kind, size = 32) {
  const rows = itemSprite(kind);
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = spriteColor(kind, row[x]);
      if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    }
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects}</svg>`;
}

function logoSvg() {
  // "SF" monogram block with an orange ring head.
  return `<svg width="44" height="24" viewBox="0 0 22 12" shape-rendering="crispEdges">
    <rect x="0" y="2" width="22" height="8" fill="#0a0a0a"/>
    <rect x="2" y="3" width="6" height="6" fill="#ff7a1a"/><rect x="4" y="5" width="2" height="2" fill="#0a0a0a"/>
    <rect x="10" y="3" width="4" height="1" fill="#ecebe6"/><rect x="10" y="4" width="1" height="2" fill="#ecebe6"/><rect x="10" y="5" width="4" height="1" fill="#ecebe6"/>
    <rect x="13" y="6" width="1" height="2" fill="#ecebe6"/><rect x="10" y="8" width="4" height="1" fill="#ecebe6"/>
    <rect x="16" y="3" width="4" height="1" fill="#ecebe6"/><rect x="16" y="4" width="1" height="5" fill="#ecebe6"/><rect x="16" y="5" width="3" height="1" fill="#ecebe6"/>
  </svg>`;
}

// Draw a little fighter portrait in the in-game pixel style.
function drawPortrait(canvas, entry, fighter) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const S = 0.34;
  const savedU = U, savedT = T;
  U = 1; T = 2;
  const pose = fighter && fighter.hp <= 0 ? POSES.hitHigh : POSES.stance;
  const L = poseLocal(pose, 1, 0);
  const P = {};
  JOINTS.forEach((j, i) => { P[j] = { x: canvas.width / 2 - 2 + L.x[i] * S, y: canvas.height - 3 + (L.y[i] - L.low) * S }; });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawBody(ctx, P, S, entry.color, shade(entry.color, -0.38), INK, parseInt(entry.color.slice(1, 3), 16) < 80);
  U = savedU; T = savedT;
}

function initUI(app) {
  const $ = (id) => document.getElementById(id);
  const w = app.world, s = app.settings;
  const ui = $('ui');
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = iconSvg(el.dataset.icon);

  // Fly-outs.
  const flyBtns = [...document.querySelectorAll('[data-fly]')];
  let openFly = null;
  const setFly = (name) => {
    openFly = openFly === name ? null : name;
    for (const b of flyBtns) b.classList.toggle('on', b.dataset.fly === openFly);
    for (const f of document.querySelectorAll('.fly')) f.classList.toggle('open', f.id === 'fly-' + openFly);
    ui.classList.toggle('flyopen', !!openFly);
    if (openFly) placeFly($('fly-' + openFly), flyBtns.find((b) => b.dataset.fly === openFly));
    if (openFly) refresh(true);
  };
  // Line the card up with its dock button, but keep it fully on screen. Its position
  // is fixed while open so nothing jumps under the cursor when content changes.
  function placeFly(card, btn) {
    const uiTop = ui.getBoundingClientRect().top;
    card.style.top = '0px';
    const h = Math.min(card.scrollHeight + 4, innerHeight - 24);
    const want = btn.getBoundingClientRect().top - 40;
    const top = clamp(want, 12, innerHeight - h - 12);
    card.style.top = (top - uiTop) + 'px';
    card.style.maxHeight = (innerHeight - top - 12) + 'px';
  }
  window.addEventListener('resize', () => { if (openFly) placeFly($('fly-' + openFly), flyBtns.find((b) => b.dataset.fly === openFly)); });
  for (const b of flyBtns) b.onclick = () => setFly(b.dataset.fly);
  app.closeFly = () => { if (openFly) setFly(openFly); };

  const setMini = (on) => {
    ui.classList.toggle('mini', on);
    document.body.classList.toggle('mini', on);
    s.panelOpen = !on;
    app.save();
  };
  $('mini').onclick = () => { if (openFly) setFly(openFly); setMini(true); };
  $('tab').onclick = () => setMini(false);
  setMini(s.panelOpen === false);
  app.togglePanel = () => setMini(!ui.classList.contains('mini'));
  app.showPanel = (on) => ui.classList.toggle('hidden', !on);

  // Tools.
  const toolBtns = [...document.querySelectorAll('[data-tool]')];
  for (const b of toolBtns) b.onclick = () => { if (openFly) setFly(openFly); app.setTool(app.tool === b.dataset.tool && b.dataset.tool !== 'hand' ? 'hand' : b.dataset.tool); };
  app.onToolChange = (t) => { for (const b of toolBtns) b.classList.toggle('on', b.dataset.tool === t); };

  // Switch helper.
  const sw = (id, get, set) => {
    const el = $(id);
    const show = () => el.classList.toggle('on', !!get());
    el.onclick = () => { set(!get()); show(); };
    show();
    return show;
  };

  // ---- Fighters card ----
  const archBtns = [...document.querySelectorAll('#arch .btn')];
  for (const b of archBtns) b.onclick = () => {
    app.spawnArch = b.dataset.arch;
    for (const x of archBtns) x.classList.toggle('on', x === b);
  };
  const slotsEl = $('slots');
  const slots = PALETTE.map((entry) => {
    const el = document.createElement('div');
    el.className = 'slot empty';
    el.title = entry.name;
    el.innerHTML = `<div class="hp"><i></i></div><span class="lv"></span><span class="team"></span><canvas class="pix" width="32" height="36"></canvas>
      <span class="plus">+</span><span class="nm">${entry.name}</span><span class="pw"></span><button class="btn x" title="Remove">×</button>`;
    const cv = el.querySelector('canvas');
    drawPortrait(cv, entry, null);
    el.onclick = (e) => {
      const f = w.fighters.find((q) => q.name === entry.name);
      if (e.target.classList.contains('x')) { if (f) { w.removeFighter(f); app.saveRoster(); refresh(true); } return; }
      if (f) { f.say('Here!', 60); w.ring(f.pts.neck.x, f.pts.neck.y, f.elc.main, 40 * w.S); return; }
      if (w.addFighter({ name: entry.name, arch: app.spawnArch })) { app.saveRoster(); refresh(true); }
    };
    slotsEl.appendChild(el);
    return { el, entry, cv, pw: el.querySelector('.pw'), hp: el.querySelector('.hp i'), hpWrap: el.querySelector('.hp'), lv: el.querySelector('.lv'), team: el.querySelector('.team'), dead: null };
  });
  $('add-rand').onclick = () => {
    const free = PALETTE.filter((p) => !w.fighters.some((f) => f.name === p.name));
    if (!free.length) { app.toast("That's everyone. 12 max!"); return; }
    w.addFighter({ name: pick(free).name, arch: app.spawnArch || pick(ARCH_NAMES) });
    app.saveRoster();
    refresh(true);
  };
  $('heal').onclick = () => w.healAll();
  $('clear-all').onclick = () => { w.clearFighters(); app.saveRoster(); refresh(true); };

  // ---- Armory card ----
  const CATS = {
    weapons: Object.keys(WEAPONS),
    items: Object.keys(CONSUMABLES),
    powers: ABILITY_KEYS,
  };
  // Short enough to fit the fixed-size detail box.
  const DESCS = {
    sword: 'Fast, long slashes.', hammer: 'Slow smash. Cracks the ground.', spear: 'Longest reach there is.', blaster: 'Shoots from range.',
    medkit: 'Heals 45 health.', energy: 'Fills the super meter.', grenade: 'Thrown at enemies. Boom.',
    flame: 'Fire Fist: exploding fireball.', ice: 'Ice Age: freezes enemies.', light: 'Teleport kicks, 3 enemies.',
    quake: 'Cracks the screen. Huge knockback.', dark: 'Black hole. Pulls, then implodes.', rumble: 'Lightning storm on everyone.',
    gravity: 'Drops a meteor. Leaves a crater.', buddha: 'Golden giant for 8 seconds.', ki: 'Screen-wide energy beam.',
  };
  const nameOf = (k) => WEAPONS[k] ? WEAPONS[k].name : ABILITIES[k] ? ABILITIES[k].name : CONSUMABLES[k].name;
  const descOf = (k) => DESCS[k] || (ABILITIES[k] ? ABILITIES[k].desc : '');
  let cat = 'weapons';
  const tilesEl = $('arm-tiles');
  const showDetail = (k) => {
    $('arm-name').textContent = k ? nameOf(k) + (ABILITIES[k] ? ' fruit' : '') : 'Pick something';
    $('arm-desc').textContent = k ? descOf(k) : 'Then click a fighter to give it, or anywhere to drop it.';
  };
  const renderTiles = () => {
    tilesEl.textContent = '';
    for (const kind of CATS[cat]) {
      const b = document.createElement('button');
      b.className = 'btn tile' + (app.tool === 'item' && app.itemKind === kind ? ' on' : '');
      b.dataset.kind = kind;
      b.innerHTML = itemSvg(kind) + `<span>${nameOf(kind)}</span>`;
      b.onmouseenter = () => showDetail(kind);
      b.onmouseleave = () => showDetail(app.tool === 'item' ? app.itemKind : null);
      b.onclick = () => {
        const same = app.tool === 'item' && app.itemKind === kind;
        app.itemKind = same ? null : kind;
        app.setTool(same ? 'hand' : 'item');
        renderTiles();
        showDetail(app.itemKind);
      };
      tilesEl.appendChild(b);
    }
  };
  for (const t of document.querySelectorAll('#arm-tabs .btn')) t.onclick = () => {
    cat = t.dataset.cat;
    for (const x of document.querySelectorAll('#arm-tabs .btn')) x.classList.toggle('on', x === t);
    renderTiles();
  };
  renderTiles();
  app.onItemToolEnd = () => { app.itemKind = null; renderTiles(); showDetail(null); };
  $('arm-rain').onclick = () => {
    const kinds = CATS.weapons.concat(CATS.items, CATS.powers);
    for (let i = 0; i < 8; i++) spawnItem(w, pick(kinds), rand(w.left + 60, w.right - 60), rand(-200, -40), { vx: rand(-2, 2) });
  };
  $('arm-clear').onclick = () => { w.items = []; };
  $('arm-strip').onclick = () => {
    for (const f of w.fighters) { f.ability = null; f.giantT = 0; }
    app.saveRoster();
    app.toast('All powers removed.');
  };

  // ---- Match card ----
  const modeBtns = [...document.querySelectorAll('#mode .btn')];
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
  sw('slowmo', () => w.slowmo, (v) => { w.slowmo = v; });
  app.onPause = sw('pause', () => app.paused, (v) => { app.paused = v; });

  // ---- Settings card ----
  for (const b of document.querySelectorAll('#size .btn')) {
    b.classList.toggle('on', b.dataset.size === s.size);
    b.onclick = () => { if (s.size === b.dataset.size) return; s.size = b.dataset.size; app.saveRoster(); app.save(); location.reload(); };
  }
  for (const b of document.querySelectorAll('#pixel .btn')) {
    b.classList.toggle('on', +b.dataset.px === s.pixel);
    b.onclick = () => {
      s.pixel = app.view.pixel = +b.dataset.px;
      app.save();
      for (const x of document.querySelectorAll('#pixel .btn')) x.classList.toggle('on', x === b);
    };
  }
  const rest = $('rest');
  rest.value = s.rest;
  $('rest-val').textContent = s.rest + 's';
  rest.oninput = () => {
    s.rest = +rest.value;
    w.restTicks = s.rest * 60;
    $('rest-val').textContent = s.rest + 's';
    app.save();
  };
  sw('cinematic', () => w.cinematic, (v) => { s.cinematic = w.cinematic = v; app.save(); });
  sw('debug', () => w.debug, (v) => { w.debug = v; });
  $('clear-lines').onclick = () => w.clearDrawn();
  $('reset-ai').onclick = () => {
    for (const f of w.fighters) { f.stats = { wins: 0, losses: 0, w: {} }; saveStats(f); }
    app.toast('Fighters forgot everything they learned.');
  };
  if (app.api) {
    document.body.classList.add('electron');
    $('check-upd').onclick = () => { $('upd-status').textContent = 'Checking...'; app.api.checkUpdates(); };
    sw('auto-upd', () => s.autoUpdate, (v) => { s.autoUpdate = v; app.save(); app.api.setAutoUpdate(v); });
    $('hide-all').onclick = () => app.api.hide();
    $('quit').onclick = () => app.api.quit();
  } else {
    $('demo-hint').textContent = 'Browser demo. Drag the fake windows around. Keys: B fight, N add, P peace, 1-6 tools.';
  }
  app.onUpdateStatus = (st) => {
    $('upd-status').textContent = st.text || '';
    $('upd-dot').classList.toggle('show', !!st.toast);
    if (st.toast) app.toast(st.text);
  };
  app.setVersion = (v) => { $('ver').textContent = 'v' + v; };

  // ---- live refresh ----
  function refresh(force) {
    if (!openFly && !force) return;
    $('count').textContent = `${w.fighters.length}/${PALETTE.length}`;
    $('arm-count').textContent = w.items.length ? w.items.length + ' on screen' : '';
    $('round').textContent = w.peace ? 'peace' : w.round ? 'round ' + w.round : '';
    for (const sl of slots) {
      const f = w.fighters.find((q) => q.name === sl.entry.name);
      sl.el.classList.toggle('empty', !f);
      sl.hpWrap.style.display = f ? 'block' : 'none';
      if (!f) sl.pw.style.display = 'none';
      sl.lv.textContent = f ? 'L' + f.level : '';
      sl.team.style.display = f && w.match === 'teams' ? 'block' : 'none';
      if (f) {
        sl.hp.style.width = Math.max(0, f.hp) + '%';
        sl.hp.style.background = f.hp > 50 ? '#40e070' : f.hp > 25 ? '#ffc93d' : '#ff4040';
        sl.team.style.background = TEAM_COLORS[f.team] || '#fff';
        sl.el.title = `${f.name} · ${f.archName} · ${f.stats.wins} wins` + (f.ability ? ` · ${ABILITIES[f.ability].name} power` : '') + (f.weapon ? ` · ${WEAPONS[f.weapon.kind].name}` : '');
        sl.pw.style.display = f.ability ? 'block' : 'none';
        if (f.ability) sl.pw.style.background = ABILITIES[f.ability].color;
      } else sl.el.title = 'Add ' + sl.entry.name;
      const dead = !!(f && f.hp <= 0);
      if (dead !== sl.dead) { sl.dead = dead; drawPortrait(sl.cv, sl.entry, f); }
    }
  }
  setInterval(refresh, 250);
  refresh(true);
}
