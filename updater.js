'use strict';
/* Self-updater. Fetches version.json from the GitHub repo named in update.json,
 * downloads every file whose SHA-256 differs from the local copy, verifies each
 * download against the manifest, then swaps the files in and restarts the app.
 *
 * Publishing an update: bump "version" in package.json, run
 * `npm run manifest` to regenerate version.json, and push to the repo. */
const { net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DEFAULT_REPO = 'samuelsortland-cmyk/stickfight-pets';
// Only these paths may ever be written by an update.
const ALLOWED = /^(main\.js|preload\.js|updater\.js|package\.json|README\.md|FIGHTING_DESIGN\.md|Start StickFight\.bat|(src|assets|tools)\/[A-Za-z0-9_\-./ ]+)$/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function config() {
  const c = readJson(path.join(ROOT, 'update.json')) || {};
  const repo = c.repo || DEFAULT_REPO, branch = c.branch || 'main';
  // baseUrl lets you self-host updates anywhere (or test against a local server).
  const base = c.baseUrl ? c.baseUrl.replace(/\/?$/, '/') : null;
  return { repo, branch, base };
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function localVersion() {
  const v = readJson(path.join(ROOT, 'version.json'));
  if (v && v.version) return v.version;
  return (readJson(path.join(ROOT, 'package.json')) || {}).version || '0.0.0';
}

function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchBuf(url) {
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* Resolve the newest commit on the branch so every file is fetched from that exact
 * commit. raw.githubusercontent.com caches branch URLs for minutes; commit URLs never go stale. */
async function resolveBase({ repo, branch, base }) {
  if (base) return base;
  try {
    const info = JSON.parse((await fetchBuf(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`)).toString('utf8'));
    if (info && /^[0-9a-f]{40}$/.test(info.sha)) return `https://raw.githubusercontent.com/${repo}/${info.sha}/`;
  } catch (e) { /* API unreachable or rate-limited: fall back to the branch */ }
  return `https://raw.githubusercontent.com/${repo}/${branch}/`;
}

/* Returns { status: 'latest' | 'updated' | 'error', version, message }. */
async function checkForUpdates() {
  const cfg = config();
  const { repo } = cfg;
  const base = await resolveBase(cfg);
  const current = localVersion();
  let manifestBuf;
  try {
    manifestBuf = await fetchBuf(base + 'version.json?t=' + Date.now());
  } catch (e) {
    return { status: 'error', version: current, message: `Couldn't reach ${repo} (${e.message}).` };
  }
  let manifest;
  try { manifest = JSON.parse(manifestBuf.toString('utf8')); } catch (e) {
    return { status: 'error', version: current, message: 'The update manifest is malformed.' };
  }
  if (!manifest.version || !Array.isArray(manifest.files)) return { status: 'error', version: current, message: 'The update manifest is malformed.' };
  if (!newer(manifest.version, current)) return { status: 'latest', version: current, message: `Up to date (v${current}).` };

  // Download everything first; only touch the install once all files verify.
  const staged = [];
  for (const f of manifest.files) {
    const rel = String(f.path || '');
    if (!ALLOWED.test(rel) || rel.includes('..')) return { status: 'error', version: current, message: `Refusing unexpected file in update: ${rel}` };
    const dest = path.join(ROOT, ...rel.split('/'));
    let have = null;
    try { have = sha256(fs.readFileSync(dest)); } catch (e) { /* new file */ }
    if (have === f.sha256) continue;
    let buf;
    try { buf = await fetchBuf(base + rel.split('/').map(encodeURIComponent).join('/')); } catch (e) {
      return { status: 'error', version: current, message: `Download failed for ${rel} (${e.message}).` };
    }
    if (sha256(buf) !== f.sha256) return { status: 'error', version: current, message: `Checksum mismatch for ${rel}; update skipped.` };
    staged.push({ dest, buf });
  }
  for (const s of staged) {
    fs.mkdirSync(path.dirname(s.dest), { recursive: true });
    fs.writeFileSync(s.dest + '.sfupdate', s.buf);
  }
  for (const s of staged) fs.renameSync(s.dest + '.sfupdate', s.dest);
  fs.writeFileSync(path.join(ROOT, 'version.json'), manifestBuf);
  return { status: 'updated', version: manifest.version, files: staged.length, notes: manifest.notes || '', message: `Updated to v${manifest.version}.` };
}

module.exports = { checkForUpdates, localVersion };
