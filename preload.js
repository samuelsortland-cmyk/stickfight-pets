'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['env', 'cursor', 'windows', 'command', 'update-status'];

contextBridge.exposeInMainWorld('pets', {
  on(channel, cb) {
    if (CHANNELS.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  setCapture(on) { ipcRenderer.send('set-capture', !!on); },
  setToolMode(on) { ipcRenderer.send('tool-mode', !!on); },
  ready(opts) { ipcRenderer.send('renderer-ready', opts || {}); },
  checkUpdates() { ipcRenderer.send('check-updates'); },
  setAutoUpdate(on) { ipcRenderer.send('auto-update', !!on); },
  hide() { ipcRenderer.send('hide'); },
  quit() { ipcRenderer.send('quit'); },
});
