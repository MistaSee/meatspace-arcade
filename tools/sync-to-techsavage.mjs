// Copies the arcade's games into the Tech Savage site, where they are served under
// techsavage.co.uk/arcade/. This repo stays the place the games are written; the copy in the
// Tech Savage site is only ever made by this script, so do not edit it there.
//
//   node tools/sync-to-techsavage.mjs            copy, replacing what was there
//   node tools/sync-to-techsavage.mjs --check    say what would change and copy nothing
//
// It replaces only arcade/games and arcade/shared. The arcade's front page (arcade/index.html
// and the files beside it) belongs to the Tech Savage site and is left alone.
import { cp, rm, mkdir, readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FROM = path.join(here, '..', 'public');
const TO = path.resolve(process.env.TECHSAVAGE_SITE || path.join(here, '..', '..', 'tech-savage', 'site'), 'arcade');

// Only games that are meant to be public. Anything not listed here stays off the site.
const GAMES = ['rally', 'shake-duel', 'egg-race', 'goblin-king', 'draw-blind', 'nerves', 'searchlight', 'bat-and-moth'];
// Parts of shared/ that only the unpublished 3D games use.
const SKIP = new Set(['ar.js']);

async function files(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(full, base));
    else out.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return out;
}

const wanted = new Map();        // path inside arcade/ -> file to copy from
for (const game of GAMES) for (const f of await files(path.join(FROM, 'games', game))) wanted.set(`games/${game}/${f}`, path.join(FROM, 'games', game, f));
for (const f of await files(path.join(FROM, 'shared'))) if (!SKIP.has(f)) wanted.set(`shared/${f}`, path.join(FROM, 'shared', f));

const there = new Set([...(await files(path.join(TO, 'games'))).map(f => `games/${f}`), ...(await files(path.join(TO, 'shared'))).map(f => `shared/${f}`)]);
const same = async (a, b) => { try { return (await readFile(a)).equals(await readFile(b)); } catch { return false; } };

let added = 0, changed = 0, removed = 0;
for (const [rel, src] of wanted) {
  if (!there.has(rel)) added++;
  else if (!(await same(src, path.join(TO, rel)))) changed++;
}
for (const rel of there) if (!wanted.has(rel)) removed++;
console.log(`${wanted.size} files for ${GAMES.length} games: ${added} new, ${changed} changed, ${removed} to remove`);

if (!process.argv.includes('--check')) {
  if (!(await stat(path.dirname(TO)).catch(() => null))) throw new Error(`The Tech Savage site was not found at ${path.dirname(TO)}`);
  await rm(path.join(TO, 'games'), { recursive: true, force: true });
  await rm(path.join(TO, 'shared'), { recursive: true, force: true });
  for (const [rel, src] of wanted) {
    await mkdir(path.dirname(path.join(TO, rel)), { recursive: true });
    await cp(src, path.join(TO, rel));
  }
  console.log(`copied into ${TO}`);
}
