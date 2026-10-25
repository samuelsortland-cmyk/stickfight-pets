'use strict';
// Regenerates version.json (the self-update manifest) from package.json's version
// and the SHA-256 of every shipped file. Run `npm run manifest` before pushing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TOP = ['main.js', 'preload.js', 'updater.js', 'package.json', 'README.md', 'FIGHTING_DESIGN.md', 'Start StickFight.bat'];
const DIRS = ['src', 'assets', 'tools'];

function walk(dir, out) {
  for (const name of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    const rel = dir + '/' + name;
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (!name.endsWith('.sfupdate')) out.push(rel);
  }
  return out;
}

const files = TOP.filter((f) => fs.existsSync(path.join(ROOT, f)));
for (const d of DIRS) walk(d, files);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const manifest = {
  version: pkg.version,
  notes: process.argv.slice(2).join(' '),
  files: files.map((p) => ({ path: p, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex') })),
};
fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`version.json: v${manifest.version}, ${manifest.files.length} files`);
