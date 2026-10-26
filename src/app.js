'use strict';
/* Bootstraps the game in either the Electron overlay (window.pets exists) or a
 * plain browser tab (demo mode with fake draggable windows). */
(function () {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const hintEl = document.getElementById('toolhint');
  const toastEl = document.getElementById('toast');
  const uiEl = document.getElementById('ui');
  const api = window.pets || null;
  const SIZES = { small: 84, medium: 118, large: 160 };
  // pixel: CSS pixels per art pixel (1 = fine, high resolution; 2 = classic; 3 = chunky).
  const DEFAULTS = { size: 'medium', roster: null, match: 'ffa', peace: false, cinematic: true, rest: 3, panelOpen: true, autoUpdate: true, pixel: 1, map: null, useWindows: true, powerTags: true };

  const settings = (() => {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('stickfight.settings'))); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  })();

  const view = { dpr: window.devicePixelRatio || 1, hover: null, tool: 'hand', pixel: [1, 2, 3].includes(settings.pixel) ? settings.pixel : 1 };
  const world = new World({
    width: innerWidth, height: innerHeight, size: SIZES[settings.size] || 90,
    cinematic: settings.cinematic, match: settings.match, restTicks: settings.rest * 60,
  });
  world.peace = !!settings.peace;
  world.useWindows = settings.useWindows !== false;
  world.powerTags = settings.powerTags !== false;
  window.__stickfight = world;

  const app = {
    world, settings, api, view, tool: 'hand', paused: false, spawnName: null, spawnArch: '',
    save() { try { localStorage.setItem('stickfight.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } },
    saveRoster() {
      settings.roster = world.fighters.map((f) => ({ name: f.name, arch: f.archName, ability: f.ability || null, weapon: f.weapon ? f.weapon.kind : null }));
      app.save();
    },
    toast(msg) {
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      clearTimeout(app._toastT);
      app._toastT = setTimeout(() => { toastEl.style.display = 'none'; }, 3500);
    },
    setTool(t) {
      app.tool = view.tool = t;
      canvas.classList.toggle('tool', t !== 'hand');
      world.drawing = null;
      const itemName = (k) => WEAPONS[k] ? WEAPONS[k].name : ABILITIES[k] ? ABILITIES[k].name + ' fruit' : CONSUMABLES[k] ? CONSUMABLES[k].name : '';
      const names = { pencil: 'Pencil', eraser: 'Eraser', bomb: 'Bomb', smite: 'Lightning', spawn: 'Spawn', item: itemName(app.itemKind) };
      hintEl.innerHTML = t === 'hand' ? '' : `<b>${names[t]}</b> &nbsp;${TOOL_DESC[t]} &nbsp;<kbd>Esc</kbd> or right-click to stop`;
      if (t !== 'item' && app.onItemToolEnd) app.onItemToolEnd();
      hintEl.style.display = t === 'hand' ? 'none' : 'block';
      if (api) api.setToolMode(t !== 'hand');
      if (app.onToolChange) app.onToolChange(t);
    },
    command,
  };

  function fitCanvas() {
    view.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * view.dpr);
    canvas.height = Math.round(innerHeight * view.dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }
  fitCanvas();

  if (settings.roster && settings.roster.length) {
    for (const r of settings.roster) {
      const f = world.addFighter({ name: r.name, arch: r.arch, ability: r.ability });
      if (f && r.weapon && WEAPONS[r.weapon]) f.weapon = { kind: r.weapon, uses: WEAPONS[r.weapon].uses };
    }
  } else {
    world.addFighter(); world.addFighter();
  }
  if (settings.map && MAPS[settings.map]) setWorldMap(world, settings.map);

  function command(cmd) {
    switch (cmd) {
      case 'brawl':
        if (world.peace) { world.peace = false; settings.peace = false; app.save(); }
        if (world.fighters.length < 2) { world.addFighter(); app.saveRoster(); }
        world.startRound();
        if (app.showMode) app.showMode();
        break;
      case 'add':
        if (world.addFighter({ arch: app.spawnArch })) app.saveRoster();
        else app.toast("That's everyone (12 max)!");
        break;
      case 'remove':
        world.removeFighter(); app.saveRoster();
        break;
      case 'peace':
        world.peace = !world.peace; settings.peace = world.peace; app.save();
        if (app.showMode) app.showMode();
        break;
      case 'draw': app.setTool(app.tool === 'pencil' ? 'hand' : 'pencil'); break;
      case 'toggle-panel': if (app.togglePanel) app.togglePanel(); break;
      case 'pause': app.paused = !app.paused; if (app.onPause) app.onPause(); break;
      case 'debug': world.debug = !world.debug; break;
    }
  }

  // ---- environment ---------------------------------------------------------
  if (api) {
    api.on('env', (env) => {
      fitCanvas();
      world.resize(env.width, env.height, env.workArea);
      if (env.version && app.setVersion) app.setVersion(env.version);
    });
    api.on('cursor', (p) => world.cursorMove(p.x, p.y));
    api.on('windows', (list) => world.setWindows(list));
    api.on('command', command);
    api.on('update-status', (st) => { if (app.onUpdateStatus) app.onUpdateStatus(st); });
  } else {
    setupDemo();
  }
  window.addEventListener('resize', () => {
    fitCanvas();
    if (!api) world.resize(innerWidth, innerHeight, demoWorkArea());
  });

  function demoWorkArea() { return { x: 0, y: 0, width: innerWidth, height: innerHeight - 40 }; }

  function setupDemo() {
    document.body.classList.add('demo');
    world.resize(innerWidth, innerHeight, demoWorkArea());
    const bar = document.createElement('div');
    bar.id = 'taskbar';
    document.body.appendChild(bar);
    const wins = [
      { title: 'Notes — ideas.txt', x: 0.08, y: 0.42, w: 0.26, h: 0.32, text: 'Buy milk. Finish the report. Do NOT let the stickmen near the spreadsheet.' },
      { title: 'Terminal', x: 0.45, y: 0.3, w: 0.26, h: 0.3, text: '$ npm start<br>> stickfight-pets start<br>> electron .' },
      { title: 'Music', x: 0.3, y: 0.62, w: 0.2, h: 0.2, text: 'Now playing: Victory Theme' },
    ];
    const els = wins.map((wd, i) => {
      const el = document.createElement('div');
      el.className = 'fakewin';
      el.dataset.id = 'demo' + i;
      el.dataset.title = wd.title;
      Object.assign(el.style, { left: wd.x * innerWidth + 'px', top: wd.y * innerHeight + 'px', width: wd.w * innerWidth + 'px', height: wd.h * innerHeight + 'px', zIndex: 1 + i });
      el.innerHTML = `<div class="bar">${wd.title}</div><div class="body">${wd.text}</div>`;
      document.body.appendChild(el);
      let drag = null;
      el.querySelector('.bar').addEventListener('mousedown', (e) => {
        drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
        el.style.zIndex = Math.max(...els.map((x) => +x.style.zIndex)) + 1;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => { if (drag) { el.style.left = e.clientX - drag.dx + 'px'; el.style.top = e.clientY - drag.dy + 'px'; } });
      window.addEventListener('mouseup', () => { drag = null; });
      return el;
    });
    const pushWindows = () => {
      world.setWindows(els.slice().sort((a, b) => b.style.zIndex - a.style.zIndex).map((el) => ({
        id: el.dataset.id, title: el.dataset.title, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
      })));
    };
    setInterval(pushWindows, 50);
    pushWindows();
    window.addEventListener('mousemove', (e) => world.cursorMove(e.clientX, e.clientY));
    document.addEventListener('mouseleave', () => { world.cursor.on = false; });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const map = { b: 'brawl', n: 'add', x: 'remove', p: 'peace', d: 'draw', g: 'debug' };
      const tools = ['hand', 'pencil', 'eraser', 'bomb', 'smite', 'spawn'];
      const k = e.key.toLowerCase();
      if (map[k]) command(map[k]);
      else if (k >= '1' && k <= '6') app.setTool(tools[+k - 1]);
    });
  }

  // ---- mouse ---------------------------------------------------------------
  let erasing = false;
  canvas.addEventListener('mousedown', (e) => {
    const x = e.clientX, y = e.clientY;
    world.cursorMove(x, y);
    // Keep the Armory open while placing items so you can hand out several in a row.
    if (app.closeFly && app.tool !== 'item') app.closeFly();
    if (e.button === 2) { if (app.tool !== 'hand') app.setTool('hand'); return; }
    if (e.button !== 0) return;
    const f = world.fighterAt(x, y, 12);
    switch (app.tool) {
      case 'pencil': world.drawStart(x, y); return;
      case 'eraser': erasing = true; world.eraseAt(x, y); return;
      case 'bomb': world.explode(x, y); return;
      case 'smite': world.smite(x, y); return;
      case 'item': {
        if (!app.itemKind) return;
        const target = world.fighterAt(x, y, 18);
        if (target) {
          giveItem(world, target, app.itemKind);
          if (ABILITIES[app.itemKind] || WEAPONS[app.itemKind]) app.saveRoster();
          if (app.onGive) app.onGive();
        } else spawnItem(world, app.itemKind, x, y);
        return;
      }
      case 'spawn': {
        const nf = world.addFighter({ name: app.spawnName, arch: app.spawnArch, x, y });
        if (nf) { app.saveRoster(); app.spawnName = null; } else app.toast("That's everyone (12 max)!");
        return;
      }
    }
    if (f) { world.grabFighter(f); canvas.classList.add('dragging'); }
  });
  window.addEventListener('mousemove', (e) => {
    if (api) world.cursorMove(e.clientX, e.clientY);
    if (world.drawing) world.drawMove(e.clientX, e.clientY);
    if (erasing) world.eraseAt(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    erasing = false;
    if (world.cursor.held) { world.releaseHeld(); canvas.classList.remove('dragging'); }
    if (world.drawing) world.drawEnd();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.tool !== 'hand') app.setTool('hand'); });

  // The overlay is click-through except over a fighter, over the panel, or while a tool is active.
  let captured = false;
  // Everything interactive the overlay must stop clicks for. Looked up live so new
  // cards are covered automatically (a hard-coded list once missed the Armory).
  const HIT_SELECTOR = '#rail, #tab, .panel.open';
  function cursorOverUI() {
    const c = world.cursor;
    if (!c.on || uiEl.classList.contains('hidden')) return false;
    for (const el of document.querySelectorAll(HIT_SELECTOR)) {
      // offsetParent is null for position:fixed elements too, so test layout boxes instead.
      if (!el || !el.getClientRects().length) continue; // not displayed
      const r = el.getBoundingClientRect();
      if (r.width && c.x >= r.left - 2 && c.x <= r.right + 6 && c.y >= r.top - 2 && c.y <= r.bottom + 6) return true;
    }
    return false;
  }
  // Keep the fighters out from under the panel: its left edge becomes the right wall.
  let lastInset = -1;
  function updateInset() {
    // Only the dock (or the tucked-away tab) is a wall; open cards float over the scene.
    let inset = 0;
    if (!uiEl.classList.contains('hidden')) {
      const el = document.getElementById(uiEl.classList.contains('mini') ? 'tab' : 'rail');
      const r = el.getBoundingClientRect();
      if (r.width) inset = Math.max(0, innerWidth - r.left);
    }
    if (Math.abs(inset - lastInset) > 0.5) { lastInset = inset; world.setInsetRight(inset); }
  }

  function updateCapture() {
    const c = world.cursor;
    const overUI = cursorOverUI();
    view.hover = c.on && !overUI ? world.fighterAt(c.x, c.y, 12) : null;
    const want = !!(c.held || view.hover || overUI || app.tool !== 'hand');
    canvas.classList.toggle('capture', !!(c.held || view.hover));
    if (want !== captured) {
      captured = want;
      if (api) api.setCapture(want);
    }
  }

  if (document.fonts && document.fonts.load) document.fonts.load('16px StickPix').catch(() => {});
  initUI(app);
  app.setTool('hand');
  if (api) api.ready({ autoUpdate: settings.autoUpdate });

  // ---- main loop -----------------------------------------------------------
  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (!app.paused) {
      acc += dt * world.timeScale;
      let n = 0;
      while (acc >= STEP && n < 5) { world.update(); acc -= STEP; n++; }
      if (n >= 5) acc = 0;
    }
    updateInset();
    updateCapture();
    render(ctx, world, view);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
