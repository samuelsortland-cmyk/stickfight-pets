'use strict';
/* The side control panel: animator tools, fighter roster, match and settings. */
const TOOL_DESC = {
  hand: 'Drag a fighter to throw it, click to poke it.',
  pencil: 'Drag to draw a platform. Right-click or Esc to stop.',
  eraser: 'Drag over drawn lines to erase them.',
  bomb: 'Click to drop a bomb. Right-click or Esc to stop.',
  smite: 'Click a fighter (or anywhere) to call down lightning.',
  spawn: 'Click anywhere to drop a fighter there. Pick a color below first.',
};

function initUI(app) {
  const $ = (id) => document.getElementById(id);
  const w = app.world, s = app.settings;
  const ui = $('ui');
  if (s.panelOpen) ui.classList.add('open');
  const togglePanel = () => {
    ui.classList.toggle('open');
    s.panelOpen = ui.classList.contains('open');
    app.save();
  };
  $('tab').onclick = togglePanel;
  $('collapse').onclick = togglePanel;
  app.togglePanel = togglePanel;
  app.showPanel = (on) => ui.classList.toggle('hidden', !on);

  // Tools.
  const toolBtns = [...document.querySelectorAll('#tools .tool')];
  for (const b of toolBtns) b.onclick = () => app.setTool(app.tool === b.dataset.tool && b.dataset.tool !== 'hand' ? 'hand' : b.dataset.tool);
  app.onToolChange = (t) => {
    for (const b of toolBtns) b.classList.toggle('on', b.dataset.tool === t);
    $('tool-desc').textContent = TOOL_DESC[t];
  };

  // Color swatches: click to spawn that fighter (and select it for the Spawn tool).
  const sw = $('swatches');
  const swBtns = PALETTE.map((p) => {
    const b = document.createElement('button');
    b.className = 'sw';
    b.style.background = p.color;
    b.title = `${p.name} (${p.arch})`;
    b.onclick = () => {
      app.spawnName = p.name;
      const f = w.fighters.find((q) => q.name === p.name);
      if (f) f.say('Here!', 60);
      else if (w.addFighter({ name: p.name, arch: app.spawnArch })) app.saveRoster();
      refresh(true);
    };
    sw.appendChild(b);
    return b;
  });
  $('arch').onchange = (e) => { app.spawnArch = e.target.value; };
  $('add-rand').onclick = () => {
    const free = PALETTE.filter((p) => !w.fighters.some((f) => f.name === p.name));
    if (!free.length) { app.toast('That\'s everyone (12 max)!'); return; }
    w.addFighter({ name: pick(free).name, arch: app.spawnArch || pick(ARCH_NAMES) });
    app.saveRoster();
  };
  $('heal').onclick = () => w.healAll();
  $('clear-all').onclick = () => { w.clearFighters(); app.saveRoster(); };

  // Match mode.
  const modeBtns = [...document.querySelectorAll('#mode button')];
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
  $('slowmo').onclick = (e) => { w.slowmo = !w.slowmo; e.currentTarget.classList.toggle('on', w.slowmo); };
  $('pause').onclick = (e) => { app.paused = !app.paused; e.currentTarget.classList.toggle('on', app.paused); };
  app.onPause = () => $('pause').classList.toggle('on', app.paused);

  // Settings.
  for (const b of document.querySelectorAll('#size button')) {
    b.classList.toggle('on', b.dataset.size === s.size);
    b.onclick = () => { if (s.size === b.dataset.size) return; s.size = b.dataset.size; app.saveRoster(); app.save(); location.reload(); };
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
  $('cinematic').checked = s.cinematic;
  $('cinematic').onchange = (e) => { s.cinematic = w.cinematic = e.target.checked; app.save(); };
  $('debug').onchange = (e) => { w.debug = e.target.checked; };
  $('clear-lines').onclick = () => w.clearDrawn();
  $('reset-ai').onclick = () => {
    for (const f of w.fighters) { f.stats = { wins: 0, losses: 0, w: {} }; saveStats(f); }
    app.toast('Fighters forgot everything they learned.');
  };

  // Electron-only: updates, hide, quit.
  if (app.api) {
    document.body.classList.add('electron');
    $('check-upd').onclick = () => { $('upd-status').textContent = 'Checking…'; app.api.checkUpdates(); };
    $('auto-upd').checked = s.autoUpdate;
    $('auto-upd').onchange = (e) => { s.autoUpdate = e.target.checked; app.save(); app.api.setAutoUpdate(s.autoUpdate); };
    $('hide-all').onclick = () => app.api.hide();
    $('quit').onclick = () => app.api.quit();
  } else {
    $('demo-hint').textContent = 'Browser demo: drag the fake windows around. Keys: B fight, N add, P peace, 1-6 tools.';
  }
  app.onUpdateStatus = (st) => { $('upd-status').textContent = st.text || ''; if (st.toast) app.toast(st.text); };
  app.setVersion = (v) => { $('ver').textContent = 'v' + v; };

  // Roster.
  const roster = $('roster');
  let lastKey = '';
  function refresh(force) {
    const key = w.fighters.map((f) => f.name + f.archName + Math.round(f.hp / 5) + f.team + f.stats.wins).join('|') + w.match;
    for (let i = 0; i < PALETTE.length; i++) {
      swBtns[i].classList.toggle('used', w.fighters.some((f) => f.name === PALETTE[i].name));
      swBtns[i].classList.toggle('sel', app.spawnName === PALETTE[i].name);
    }
    if (key === lastKey && !force) return;
    lastKey = key;
    roster.textContent = '';
    for (const f of w.fighters) {
      const row = document.createElement('div');
      row.className = 'fr';
      const team = w.match === 'teams' ? ` <small style="color:${TEAM_COLORS[f.team]}">●</small>` : '';
      row.innerHTML = `<div class="dot" style="background:${f.color}"></div>
        <div class="nm">${f.name}${team} <small>${f.archName} · Lv${f.level} · ${f.stats.wins}W</small></div>
        <div class="hp"><div style="width:${Math.max(0, f.hp)}%;background:${f.hp > 50 ? '#3ddc6a' : f.hp > 25 ? '#ffc93d' : '#ff4d4d'}"></div></div>`;
      const x = document.createElement('button');
      x.textContent = '✕';
      x.title = 'Remove ' + f.name;
      x.onclick = () => { w.removeFighter(f); app.saveRoster(); refresh(true); };
      row.appendChild(x);
      roster.appendChild(row);
    }
    if (!w.fighters.length) roster.innerHTML = '<div class="hint">No fighters. Click a color above to add one.</div>';
  }
  setInterval(refresh, 300);
  refresh(true);
}
