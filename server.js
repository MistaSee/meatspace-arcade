// Meatspace Arcade (working title): a tiny local server for the games.
// Serves the site, keeps a shared scoreboard per game, and makes QR codes.
// The public site (GitHub Pages) is static, so there the scoreboards stay on each phone.
import http from 'node:http';
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const TESTS = path.join(ROOT, 'tools', 'test');
const SCORES_FILE = path.join(DATA, 'scores.json');
const PORT = Number(process.env.PORT) || 8770;
const MAX_KEPT = 500;

// The address phones on the same Wi-Fi can reach. PUBLIC_BASE overrides it once the
// arcade lives somewhere on the internet.
function lanAddress() {
  const found = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal && !a.address.startsWith('169.254.')) found.push({ name, address: a.address });
    }
  }
  const pick =
    found.find(f => /wi-?fi|wlan|wireless/i.test(f.name)) ||
    found.find(f => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(f.address)) ||
    found[0];
  return pick ? pick.address : 'localhost';
}
const BASE = (process.env.PUBLIC_BASE || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');

// Each game's scoreboard, and whether a lower score is better (a race time) or worse.
const GAMES = {
  'egg-race': { lowerIsBetter: true },
  'shake-duel': { lowerIsBetter: false },
  'goblin-king': { lowerIsBetter: false },
  'ghost-census': { lowerIsBetter: false },
  'biscuit-siege': { lowerIsBetter: false },
  'room-rumble': { lowerIsBetter: false },
  'pickle-heist': { lowerIsBetter: false },
  'wrong-door': { lowerIsBetter: false },
  'staring-contest': { lowerIsBetter: false },
  'wizard-hands': { lowerIsBetter: false },
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.stl': 'model/stl',
  '.scad': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

// ---------- scoreboard ----------
let scores = [];
try {
  const raw = JSON.parse(await readFile(SCORES_FILE, 'utf8'));
  if (Array.isArray(raw)) scores = raw;
} catch { /* no scores yet */ }

let writing = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(scores, null, 1);
  writing = writing
    .then(async () => {
      await mkdir(DATA, { recursive: true });
      await writeFile(SCORES_FILE + '.tmp', snapshot);
      await rename(SCORES_FILE + '.tmp', SCORES_FILE);
    })
    .catch(err => console.error('Could not save scores:', err.message));
}

function ranked(game) {
  const dir = GAMES[game]?.lowerIsBetter ? 1 : -1;
  return scores
    .filter(s => s.game === game)
    .sort((a, b) => dir * (a.score - b.score) || a.at.localeCompare(b.at));
}
const shown = ({ id, name, score, detail, at }) => ({ id, name, score, detail, at });

function cleanName(n) {
  if (typeof n !== 'string') return null;
  const s = n.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return s || null;
}
function int(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

const lastPost = new Map();
async function postScore(req, res) {
  const who = req.socket.remoteAddress || '?';
  const now = Date.now();
  if (now - (lastPost.get(who) || 0) < 2000) return json(res, 429, { error: 'Slow down.' });

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2048) return json(res, 413, { error: 'Too big.' });
  }
  let d;
  try { d = JSON.parse(body); } catch { return json(res, 400, { error: 'Bad JSON.' }); }

  const game = typeof d.game === 'string' && Object.hasOwn(GAMES, d.game) ? d.game : null;
  const name = cleanName(d.name);
  const score = int(d.score, 0, 10_000_000);
  const detail = typeof d.detail === 'string' ? d.detail.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 60) : '';
  if (!game || !name || score === null) {
    return json(res, 400, { error: 'That score does not look right.' });
  }

  lastPost.set(who, now);
  const entry = { id: randomUUID().slice(0, 8), game, name, score, detail, at: new Date().toISOString() };
  scores.push(entry);
  const forGame = ranked(game);
  if (forGame.length > MAX_KEPT) {
    const keep = new Set(forGame.slice(0, MAX_KEPT));
    scores = scores.filter(s => s.game !== game || keep.has(s));
  }
  persist();

  const all = ranked(game);
  const rank = all.findIndex(s => s.id === entry.id) + 1;
  return json(res, 201, { id: entry.id, rank: rank || null, top: all.slice(0, 10).map(shown) });
}

// ---------- helpers ----------
function json(res, status, data) {
  res.writeHead(status, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
function text(res, status, msg) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(msg);
}
function redirect(res, to) {
  res.writeHead(302, { location: to, 'cache-control': 'no-store' });
  res.end();
}

async function qr(res, p) {
  if (!p || !/^\/[A-Za-z0-9/_-]{0,60}$/.test(p)) return text(res, 400, 'Bad path');
  const svg = await QRCode.toString(BASE + p, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#000000', light: '#ffffff00' },
  });
  res.writeHead(200, { 'content-type': TYPES['.svg'], 'cache-control': 'no-cache' });
  res.end(svg);
}

async function serveStatic(req, res, pathname, search, root = PUBLIC) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return text(res, 400, 'Bad path'); }
  let file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) return text(res, 403, 'No.');

  let st = await stat(file).catch(() => null);
  if (st?.isDirectory()) {
    if (!pathname.endsWith('/')) return redirect(res, pathname + '/' + search);
    file = path.join(file, 'index.html');
    st = await stat(file).catch(() => null);
  }
  if (!st?.isFile()) return text(res, 404, 'Not found. The coin is not here.');

  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  res.end(await readFile(file));
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://arcade');
    const p = url.pathname;

    if (p === '/api/scores' && req.method === 'GET') {
      const limit = int(url.searchParams.get('limit'), 1, 50) ?? 10;
      return json(res, 200, { top: ranked(url.searchParams.get('game')).slice(0, limit).map(shown) });
    }
    if (p === '/api/scores' && req.method === 'POST') return await postScore(req, res);
    if (p === '/api/info') return json(res, 200, { base: BASE });
    if (p === '/qr.svg') return await qr(res, url.searchParams.get('path'));

    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
    // Pretend-phone scripts for automated checks. Only this local server has them; the public site does not.
    if (p.startsWith('/__test/')) return await serveStatic(req, res, p.slice('/__test'.length), url.search, TESTS);
    return await serveStatic(req, res, p, url.search);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) text(res, 500, 'Something went wrong.');
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Arcade running.`);
  console.log(`  On this PC:                  http://localhost:${PORT}/`);
  console.log(`  On a phone on the same Wi-Fi: ${BASE}/`);
});
