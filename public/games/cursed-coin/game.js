// The Cursed Coin: a pocket dungeon crawl for a phone, opened by tapping a coin.
import { COPY, pick, fill } from './copy.js';

// ---------- rules ----------
const W = 7, H = 11;           // board size in squares (portrait, phone-shaped)
const MAX_HP = 5;
const FLIP_EVERY = 12;         // turns between the coin's own flips
const FLOOR_POINTS = 25;       // score for each floor you get past

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const STEPS = Object.values(DIRS);

// speed: acts every Nth turn. phases: walks through walls. blinks: teleports when hit.
const MONSTERS = {
  rat:   { glyph: '🐀', hp: 1, dmg: 1, speed: 1 },
  duck:  { glyph: '🦆', hp: 2, dmg: 1, speed: 1 },
  frog:  { glyph: '🐸', hp: 2, dmg: 1, speed: 1, blinks: true },
  snail: { glyph: '🐌', hp: 3, dmg: 1, speed: 2 },
  ghost: { glyph: '👻', hp: 2, dmg: 1, speed: 2, phases: true },
  troll: { glyph: '🧌', hp: 5, dmg: 2, speed: 2 },
};
function monsterPool(depth) {
  const pool = ['rat', 'rat', 'duck'];
  if (depth >= 2) pool.push('frog', 'duck');
  if (depth >= 3) pool.push('snail');
  if (depth >= 4) pool.push('ghost', 'rat');
  if (depth >= 6) pool.push('troll', 'snail');
  if (depth >= 8) pool.push('troll', 'ghost');
  return pool;
}

// ---------- small helpers ----------
const $ = id => document.getElementById(id);
const rand = n => Math.floor(Math.random() * n);
const chance = p => Math.random() < p;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const key = c => c.x + ',' + c.y;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const params = new URLSearchParams(location.search);
const COIN_ID = (params.get('coin') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 16) || null;

// ---------- sound and buzz ----------
let audio = null;
let muted = store.get('cc.muted', false);
function tone(freq, dur = 0.08, type = 'square', vol = 0.04, slideTo = null, delay = 0) {
  if (muted || !audio) return;
  const t = audio.currentTime + delay;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  step: () => tone(170, 0.03, 'triangle', 0.02),
  bump: () => tone(90, 0.05, 'square', 0.03),
  hit: () => tone(260, 0.07, 'square', 0.04, 120),
  kill: () => { tone(400, 0.06, 'square', 0.04); tone(800, 0.09, 'square', 0.04, null, 0.06); },
  hurt: () => tone(140, 0.18, 'sawtooth', 0.05, 60),
  gold: () => { tone(988, 0.05, 'triangle', 0.05); tone(1319, 0.08, 'triangle', 0.05, null, 0.05); },
  soup: () => { tone(392, 0.08, 'sine', 0.06); tone(523, 0.08, 'sine', 0.06, null, 0.08); tone(659, 0.12, 'sine', 0.06, null, 0.16); },
  flip: () => { for (let i = 0; i < 6; i++) tone(1200 + i * 90, 0.03, 'triangle', 0.03, null, i * 0.07); },
  heads: () => { tone(523, 0.1, 'triangle', 0.05); tone(784, 0.16, 'triangle', 0.05, null, 0.1); },
  tails: () => { tone(330, 0.12, 'sawtooth', 0.04); tone(220, 0.2, 'sawtooth', 0.04, null, 0.12); },
  descend: () => tone(600, 0.35, 'sine', 0.05, 90),
  die: () => { tone(300, 0.25, 'sawtooth', 0.05, 150); tone(150, 0.5, 'sawtooth', 0.05, 50, 0.25); },
};
function buzz(pattern) { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } }

// ---------- game state ----------
let S = null;               // the current run
let mode = 'title';         // title | play | dead
let inputLockUntil = 0;
const fx = { floaters: [], shake: 0, flashes: new Map(), fadeUntil: 0 };

const say = msg => { $('log').textContent = msg; };
const modIs = id => S.mod?.id === id;
const nameOf = kind => COPY.monsters[kind].name;
const monAt = (x, y) => S.mons.find(m => m.x === x && m.y === y);
const itemAt = (x, y) => S.items.find(i => i.x === x && i.y === y);
const isWall = (x, y) => S.wall[y][x];
const score = () => S.gold + (S.depth - 1) * FLOOR_POINTS;

function bfs(from, passable) {
  const dist = Array.from({ length: H }, () => Array(W).fill(-1));
  const queue = [from];
  dist[from.y][from.x] = 0;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dx, dy] of STEPS) {
      const x = c.x + dx, y = c.y + dy;
      if (inBounds(x, y) && dist[y][x] < 0 && passable(x, y)) {
        dist[y][x] = dist[c.y][c.x] + 1;
        queue.push({ x, y });
      }
    }
  }
  return dist;
}

// A floor: a few wall clumps, every open square reachable, the hole far from the start.
function makeFloorPlan() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const wall = Array.from({ length: H }, () => Array(W).fill(false));
    const clumps = 6 + rand(7);
    for (let i = 0; i < clumps; i++) {
      const x = rand(W), y = rand(H);
      wall[y][x] = true;
      if (chance(0.45)) {
        const [dx, dy] = STEPS[rand(4)];
        if (inBounds(x + dx, y + dy)) wall[y + dy][x + dx] = true;
      }
    }
    const open = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!wall[y][x]) open.push({ x, y });
    const start = open[rand(open.length)];
    const dist = bfs(start, (x, y) => !wall[y][x]);
    if (open.some(c => dist[c.y][c.x] < 0)) continue;
    const far = open.filter(c => dist[c.y][c.x] >= 7);
    if (!far.length) continue;
    return { wall, open, start, stairs: far[rand(far.length)], dist };
  }
  // Fallback: one big open room.
  const wall = Array.from({ length: H }, () => Array(W).fill(false));
  const open = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) open.push({ x, y });
  const start = { x: 3, y: H - 1 };
  return { wall, open, start, stairs: { x: 3, y: 0 }, dist: bfs(start, () => true) };
}

function spawn(kind, c) {
  S.mons.push({ id: S.nextId++, kind, hp: MONSTERS[kind].hp, x: c.x, y: c.y, rx: c.x, ry: c.y });
}

function freeSquares() {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isWall(x, y) || monAt(x, y)) continue;
    if (x === S.player.x && y === S.player.y) continue;
    if (x === S.stairs.x && y === S.stairs.y) continue;
    out.push({ x, y });
  }
  return out;
}

function newGame() {
  S = {
    depth: 0, hp: MAX_HP, gold: 0, kills: 0, turn: 0,
    flipIn: FLIP_EVERY, mod: null, shield: false, flippedThisFloor: false,
    killer: null, carved: false,
    wall: null, stairs: null, mons: [], items: [],
    player: { x: 0, y: 0, rx: 0, ry: 0 },
    nextId: 1,
  };
  fx.floaters = [];
  fx.flashes.clear();
  nextFloor();
}

function nextFloor() {
  S.depth++;
  S.flippedThisFloor = false;
  const plan = makeFloorPlan();
  S.wall = plan.wall;
  S.stairs = plan.stairs;
  Object.assign(S.player, { x: plan.start.x, y: plan.start.y, rx: plan.start.x, ry: plan.start.y });
  S.mons = [];
  S.items = [];

  const taken = new Set([key(plan.start), key(plan.stairs)]);
  const spots = shuffle(plan.open.filter(c => !taken.has(key(c))));

  const monsterSpots = spots.filter(c => plan.dist[c.y][c.x] >= 3);
  const count = Math.min(2 + Math.floor(S.depth * 0.6), 10);
  const pool = monsterPool(S.depth);
  for (let i = 0; i < count && monsterSpots.length; i++) {
    const c = monsterSpots.pop();
    taken.add(key(c));
    spawn(modIs('snails') ? 'snail' : pool[rand(pool.length)], c);
  }

  const itemSpots = spots.filter(c => !taken.has(key(c)));
  const piles = 2 + rand(3);
  for (let i = 0; i < piles && itemSpots.length; i++) {
    const c = itemSpots.pop();
    S.items.push({ kind: 'gold', x: c.x, y: c.y, value: 1 + rand(3) + Math.floor(S.depth / 3) });
  }
  if (itemSpots.length && chance(S.hp <= 2 ? 0.7 : 0.3)) {
    const c = itemSpots.pop();
    S.items.push({ kind: 'soup', x: c.x, y: c.y });
  }

  fx.floaters = [];
  // Landing on a new floor gives back a heart, so getting deeper is how you recover.
  if (S.depth > 1 && S.hp < MAX_HP) {
    S.hp++;
    floater(S.player.x, S.player.y, '+1♥', '#e4572e');
  }
  const arrive = fill(pick(COPY.floorArrive), { d: S.depth, smell: pick(COPY.smells) });
  say(S.depth > 1 ? pick(COPY.descend) + ' ' + arrive : arrive);
}

// ---------- the player's turn ----------
function act(dir) {
  if (mode !== 'play' || performance.now() < inputLockUntil) return;
  if (dir && modIs('backwards')) dir = OPPOSITE[dir];
  if (!dir) { say(pick(COPY.wait)); endTurn(); return; }

  const [dx, dy] = DIRS[dir];
  const p = S.player;
  const nx = p.x + dx, ny = p.y + dy;

  if (!inBounds(nx, ny)) { say(pick(COPY.bumpEdge)); sfx.bump(); nudge(p, dx, dy); return refreshHud(); }
  const m = monAt(nx, ny);
  if (m) { attack(m, dx, dy); endTurn(); return; }
  if (isWall(nx, ny)) { say(pick(COPY.bumpWall)); sfx.bump(); nudge(p, dx, dy); return refreshHud(); }

  if (stepTo(nx, ny)) return;
  if (modIs('ice')) {
    for (;;) {
      const tx = p.x + dx, ty = p.y + dy;
      if (!inBounds(tx, ty) || isWall(tx, ty) || monAt(tx, ty)) break;
      if (stepTo(tx, ty)) return;
    }
  }
  endTurn();
}

// Returns true when the player fell down the hole (the floor has changed).
function stepTo(x, y) {
  S.player.x = x;
  S.player.y = y;
  sfx.step();
  const item = itemAt(x, y);
  if (item) pickUp(item);
  if (x === S.stairs.x && y === S.stairs.y) {
    sfx.descend();
    fx.fadeUntil = performance.now() + 450;
    nextFloor();
    refreshHud();
    return true;
  }
  return false;
}

function pickUp(item) {
  S.items.splice(S.items.indexOf(item), 1);
  if (item.kind === 'gold') {
    const n = item.value * (modIs('rich') ? 2 : 1);
    S.gold += n;
    say(fill(pick(COPY.goldFind), { n }));
    sfx.gold();
    floater(item.x, item.y, '+' + n, '#f2c14e');
  } else if (item.kind === 'soup') {
    const before = S.hp;
    S.hp = Math.min(MAX_HP, S.hp + 2);
    say(pick(before === MAX_HP ? COPY.soupFull : COPY.soup));
    sfx.soup();
    if (S.hp > before) floater(item.x, item.y, '+' + (S.hp - before) + '♥', '#e4572e');
  }
}

function attack(m, dx, dy) {
  nudge(S.player, dx, dy);
  if (modIs('butter') && rand(3) === 0) {
    say(pick(COPY.miss));
    floater(m.x, m.y, COPY.missTag, '#a8977f');
    sfx.bump();
    return;
  }
  m.hp -= modIs('sword') ? 2 : 1;
  fx.flashes.set(m, performance.now() + 140);
  if (m.hp <= 0) {
    S.mons.splice(S.mons.indexOf(m), 1);
    S.kills++;
    say(COPY.monsters[m.kind].kill);
    sfx.kill();
    floater(m.x, m.y, '💥', '#fff');
    buzz(25);
  } else {
    say(fill(pick(COPY.hit), { name: nameOf(m.kind) }));
    sfx.hit();
    buzz(15);
    if (MONSTERS[m.kind].blinks) blink(m);
  }
}

function blink(m) {
  const spots = freeSquares().filter(c => manhattan(c, S.player) >= 3);
  if (!spots.length) return;
  const c = spots[rand(spots.length)];
  m.x = m.rx = c.x;
  m.y = m.ry = c.y;
  say(pick(COPY.frogBlink));
}

function endTurn() {
  S.turn++;
  monstersAct();
  if (S.hp <= 0) { die(); return; }
  S.flipIn--;
  if (S.flipIn <= 0) flipCoin(false);
  refreshHud();
}

// ---------- the monsters' turn ----------
function monstersAct() {
  const p = S.player;
  const dist = bfs(p, (x, y) => !isWall(x, y));
  for (const m of S.mons.slice()) {
    if (S.hp <= 0) return;
    const def = MONSTERS[m.kind];
    const every = def.speed * (modIs('shy') ? 2 : 1);
    if ((S.turn + m.id) % every !== 0) continue;

    if (manhattan(m, p) === 1) { monsterHits(m); continue; }

    const here = def.phases ? manhattan(m, p) : (dist[m.y][m.x] < 0 ? 99 : dist[m.y][m.x]);
    let best = null, bestDist = here;
    for (const [dx, dy] of shuffle(STEPS.slice())) {
      const x = m.x + dx, y = m.y + dy;
      if (!inBounds(x, y) || (x === p.x && y === p.y) || monAt(x, y)) continue;
      let d;
      if (def.phases) d = Math.abs(x - p.x) + Math.abs(y - p.y);
      else {
        if (isWall(x, y)) continue;
        d = dist[y][x];
        if (d < 0) continue;
      }
      if (d < bestDist) { bestDist = d; best = { x, y }; }
    }
    if (best) { m.x = best.x; m.y = best.y; }
  }
}

function monsterHits(m) {
  const name = nameOf(m.kind);
  const p = S.player;
  m.rx += (p.x - m.x) * 0.35;
  m.ry += (p.y - m.y) * 0.35;
  if (S.shield) {
    S.shield = false;
    say(fill(pick(COPY.polite), { name }));
    floater(p.x, p.y, COPY.sorryTag, '#9ad1d4');
    return;
  }
  const dmg = MONSTERS[m.kind].dmg;
  S.hp = Math.max(0, S.hp - dmg);
  S.killer = m.kind;
  fx.flashes.set(p, performance.now() + 160);
  fx.shake = 9;
  buzz(70);
  sfx.hurt();
  say(fill(pick(COPY.hurt), { name }));
  floater(p.x, p.y, '-' + dmg, '#e4572e');
}

// ---------- the coin ----------
let coinAngle = 0;
let bannerTimer = null;

function flipCoin(byPlayer) {
  const side = chance(0.5) ? 'heads' : 'tails';
  const options = COPY.mods.filter(d => d.side === side && d.id !== S.mod?.id);
  const mod = options[rand(options.length)];
  S.mod = mod;
  S.flipIn = FLIP_EVERY;
  S.shield = mod.id === 'polite';

  switch (mod.id) {
    case 'snack':
      S.hp = Math.min(MAX_HP, S.hp + 1);
      break;
    case 'tax': {
      const lost = Math.floor(S.gold / 3);
      S.gold -= lost;
      if (lost) floater(S.player.x, S.player.y, '-' + lost, '#f2c14e');
      break;
    }
    case 'ducks': {
      const spots = shuffle(freeSquares().filter(c => manhattan(c, S.player) >= 3));
      for (let i = 0; i < 2 && spots.length; i++) spawn('duck', spots.pop());
      break;
    }
    case 'snails':
      for (const m of S.mons) { m.kind = 'snail'; m.hp = MONSTERS.snail.hp; }
      break;
  }

  spinCoin(side);
  sfx.flip();
  setTimeout(() => sfx[side](), 480);
  buzz([20, 40, 20]);
  setTimeout(() => showBanner(side, mod), reduceMotion ? 0 : 420);
  say(pick(byPlayer ? COPY.playerFlip : COPY.selfFlip));
  inputLockUntil = performance.now() + 700;
  refreshHud();
}

function spinCoin(side) {
  const inner = $('coin-inner');
  coinAngle %= 360;
  const end = Math.ceil((coinAngle + 1080) / 360) * 360 + (side === 'heads' ? 0 : 180);
  inner.style.transform = `rotateY(${end}deg)`;
  if (!reduceMotion && inner.animate) {
    const a = inner.animate(
      [{ transform: `rotateY(${coinAngle}deg)` }, { transform: `rotateY(${end}deg)` }],
      { duration: 900, easing: 'cubic-bezier(.15,.7,.2,1)' },
    );
    a.onfinish = () => a.cancel();
  }
  coinAngle = end;
}

function showBanner(side, mod) {
  if (mode !== 'play') return;
  const b = $('banner');
  b.className = side;
  b.replaceChildren(
    el('div', 'banner-side', side === 'heads' ? COPY.heads : COPY.tails),
    el('div', 'banner-name', mod.name),
    el('div', 'banner-text', mod.text),
  );
  b.hidden = false;
  b.style.animation = 'none';
  void b.offsetHeight;      // restart the animation
  b.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 2600);
}

function playerFlip() {
  if (mode !== 'play' || performance.now() < inputLockUntil) return;
  if (S.flippedThisFloor) { say(pick(COPY.tired)); sfx.bump(); return; }
  S.flippedThisFloor = true;
  flipCoin(true);
}

// ---------- the end ----------
function die() {
  mode = 'dead';
  sfx.die();
  buzz([80, 60, 220]);
  refreshHud();
  setTimeout(showDeath, 1000);
}

function showDeath() {
  $('banner').hidden = true;
  $('death-head').textContent = fill(COPY.deathHead, { d: S.depth });
  $('epitaph').textContent = COPY.monsters[S.killer]?.epitaph || COPY.epitaphUnknown;
  $('final-score').textContent = fill(COPY.finalScore, { s: score() });
  $('score-sum').textContent = fill(COPY.scoreSum, { g: S.gold, f: (S.depth - 1) * FLOOR_POINTS });
  $('name').value = store.get('cc.name', '');
  $('carve-form').hidden = false;
  $('carved').hidden = true;
  $('death').hidden = false;
  $('death').scrollTop = 0;
  loadHall($('hall-death'));
}

// ---------- the Hall (shared scoreboard) ----------
const localHall = () => store.get('cc.local', []).sort((a, b) => b.score - a.score).slice(0, 10);

async function getHall() {
  try {
    const r = await fetch('/api/scores?limit=10', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return { online: true, top: (await r.json()).top };
  } catch {
    return { online: false, top: localHall() };
  }
}

async function submitScore(entry) {
  try {
    const r = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!r.ok) throw new Error(r.status);
    return { online: true, ...(await r.json()) };
  } catch {
    const id = 'local-' + Date.now();
    const list = store.get('cc.local', []);
    list.push({ ...entry, id, at: new Date().toISOString() });
    store.set('cc.local', list.sort((a, b) => b.score - a.score).slice(0, 50));
    return { online: false, top: localHall(), id };
  }
}

function renderHall(ol, data, highlightId) {
  ol.replaceChildren();
  if (!data.top.length) {
    ol.append(el('li', 'empty', data.online ? COPY.hallEmpty : COPY.hallOffline));
    return;
  }
  data.top.forEach((s, i) => {
    const li = el('li', s.id === highlightId ? 'me' : '');
    const glyph = MONSTERS[s.killer]?.glyph || '💀';
    let what = `${glyph} ${fill(COPY.hallFloor, { d: s.depth })}`;
    if (s.coin) what += ' · ' + fill(COPY.hallCoin, { id: s.coin });
    li.append(el('span', 'rank', String(i + 1)), el('span', 'who', s.name), el('span', 'what', what), el('span', 'pts', String(s.score)));
    ol.append(li);
  });
  if (!data.online) ol.append(el('li', 'note', COPY.hallOffline));
}

async function loadHall(ol, highlightId) {
  renderHall(ol, await getHall(), highlightId);
}

$('carve-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!S || S.carved) return;
  const name = $('name').value.trim().slice(0, 12);
  if (!name) return;
  S.carved = true;
  store.set('cc.name', name);
  $('name').blur();
  $('carve-form').hidden = true;
  const res = await submitScore({
    name, score: score(), depth: S.depth, gold: S.gold,
    killer: S.killer || 'unknown', coin: COIN_ID,
  });
  const carved = $('carved');
  carved.textContent = res.online && res.rank ? fill(COPY.carved, { rank: res.rank }) : COPY.carvedOffline;
  carved.hidden = false;
  renderHall($('hall-death'), res, res.id);
});

// ---------- HUD ----------
function refreshHud() {
  const hearts = $('hearts');
  hearts.replaceChildren();
  for (let i = 0; i < MAX_HP; i++) hearts.append(el('span', i < S.hp ? 'on' : 'off', '♥'));
  hearts.setAttribute('aria-label', `${S.hp} of ${MAX_HP} hearts`);
  $('floor').textContent = fill(COPY.floorLabel, { d: S.depth });
  $('gold').textContent = fill(COPY.goldLabel, { g: S.gold });
  $('flipin').textContent = fill(COPY.flipsIn, { n: S.flipIn });
  $('coin').classList.toggle('used', S.flippedThisFloor);
  const mod = $('mod');
  mod.textContent = S.mod ? `${S.mod.side === 'heads' ? COPY.heads : COPY.tails} · ${S.mod.name}: ${S.mod.short}` : '';
  mod.className = S.mod ? S.mod.side : '';
}

function setMuted(m) {
  muted = m;
  store.set('cc.muted', m);
  const b = $('mute');
  b.textContent = m ? '🔇' : '🔊';
  b.setAttribute('aria-pressed', String(m));
  b.setAttribute('aria-label', COPY.sound);
}

// ---------- drawing ----------
const canvas = $('board');
const ctx = canvas.getContext('2d');
let cell = 48;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function resize() {
  const r = $('stage').getBoundingClientRect();
  cell = Math.max(24, Math.floor(Math.min(r.width / W, r.height / H)));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * cell * dpr;
  canvas.height = H * cell * dpr;
  canvas.style.width = W * cell + 'px';
  canvas.style.height = H * cell + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function nudge(o, dx, dy) { o.rx += dx * 0.3; o.ry += dy * 0.3; }
function floater(x, y, text, color) { fx.floaters.push({ x, y, text, color, born: performance.now() }); }

function rounded(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function glyph(g, cx, cy, size, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g, cx, cy);
  ctx.globalAlpha = 1;
}

function shadow(cx, cy) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + cell * 0.3, cell * 0.26, cell * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

function approach(o, dt) {
  const k = 1 - Math.exp(-dt * 20);
  o.rx += (o.x - o.rx) * k;
  o.ry += (o.y - o.ry) * k;
}

function drawFloor() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#3a2d40' : '#35293b';
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
}

function drawWalls() {
  const pad = cell * 0.04, r = cell * 0.18;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!S.wall[y][x]) continue;
    const px = x * cell + pad, py = y * cell + pad, s = cell - pad * 2;
    ctx.fillStyle = '#211826';
    rounded(px, py + cell * 0.07, s, s - cell * 0.04, r); ctx.fill();
    ctx.fillStyle = '#6b5872';
    rounded(px, py, s, s - cell * 0.07, r); ctx.fill();
    ctx.fillStyle = '#86718d';
    rounded(px + cell * 0.12, py + cell * 0.1, cell * 0.42, cell * 0.11, cell * 0.06); ctx.fill();
  }
}

function drawHole(now) {
  const cx = (S.stairs.x + 0.5) * cell, cy = (S.stairs.y + 0.5) * cell;
  ctx.fillStyle = '#0b070d';
  ctx.beginPath();
  ctx.ellipse(cx, cy + cell * 0.04, cell * 0.36, cell * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  const pulse = 0.35 + 0.35 * Math.sin(now / 320);
  ctx.strokeStyle = `rgba(242,193,78,${pulse})`;
  ctx.lineWidth = Math.max(2, cell * 0.05);
  ctx.stroke();
}

function draw(dt, now) {
  ctx.save();
  ctx.clearRect(0, 0, W * cell, H * cell);
  if (fx.shake > 0 && !reduceMotion) {
    ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    fx.shake = Math.max(0, fx.shake - dt * 45);
  }

  drawFloor();
  drawHole(now);
  drawWalls();

  for (const it of S.items) {
    const cx = (it.x + 0.5) * cell;
    const cy = (it.y + 0.5) * cell + Math.sin(now / 400 + it.x + it.y) * cell * 0.04;
    glyph(it.kind === 'gold' ? '🪙' : '🍲', cx, cy, cell * 0.52);
  }

  for (const m of S.mons) {
    approach(m, dt);
    const cx = (m.rx + 0.5) * cell, cy = (m.ry + 0.5) * cell;
    const def = MONSTERS[m.kind];
    shadow(cx, cy);
    const flashing = (fx.flashes.get(m) || 0) > now;
    if (flashing) ctx.filter = 'brightness(2.2)';
    glyph(def.glyph, cx, cy, cell * 0.7, def.phases ? 0.7 : 1);
    ctx.filter = 'none';
    if (m.hp > 1) {
      for (let i = 0; i < m.hp; i++) {
        ctx.fillStyle = '#e4572e';
        ctx.beginPath();
        ctx.arc(cx + (i - (m.hp - 1) / 2) * cell * 0.13, cy + cell * 0.42, cell * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const p = S.player;
  approach(p, dt);
  const pcx = (p.rx + 0.5) * cell, pcy = (p.ry + 0.5) * cell;
  shadow(pcx, pcy);
  if (S.shield) {
    ctx.strokeStyle = 'rgba(154,209,212,0.75)';
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.beginPath();
    ctx.arc(pcx, pcy, cell * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }
  const face = S.hp <= 0 ? '😵' : S.hp <= 2 ? '😬' : '🙂';
  if ((fx.flashes.get(p) || 0) > now) ctx.filter = 'sepia(1) saturate(6) hue-rotate(-30deg)';
  glyph(face, pcx, pcy, cell * 0.74);
  ctx.filter = 'none';

  fx.floaters = fx.floaters.filter(f => now - f.born < 900);
  for (const f of fx.floaters) {
    const t = (now - f.born) / 900;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = f.color;
    ctx.font = `800 ${Math.round(cell * 0.36)}px "Trebuchet MS", system-ui, sans-serif, ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const fy = (f.y + 0.3 - t * 0.7) * cell;
    ctx.strokeText(f.text, (f.x + 0.5) * cell, fy);
    ctx.fillText(f.text, (f.x + 0.5) * cell, fy);
    ctx.globalAlpha = 1;
  }

  if (fx.fadeUntil > now) {
    ctx.fillStyle = `rgba(11,7,13,${(fx.fadeUntil - now) / 450})`;
    ctx.fillRect(0, 0, W * cell, H * cell);
  }
  ctx.restore();
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (S) draw(dt, now);
  requestAnimationFrame(frame);
}

// ---------- input ----------
let lastMove = 0;
function input(dir) {
  const now = performance.now();
  if (now - lastMove < 100) return;
  lastMove = now;
  act(dir);
}

window.addEventListener('keydown', e => {
  if (mode !== 'play' || e.target.tagName === 'INPUT') return;
  const map = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  if (e.key in map) { e.preventDefault(); input(map[e.key]); }
  else if (e.key === ' ' || e.key === '.') { e.preventDefault(); input(null); }
  else if (e.key === 'f' || e.key === 'F') playerFlip();
});

let touchStart = null;
const stage = $('stage');
stage.addEventListener('pointerdown', e => { touchStart = { x: e.clientX, y: e.clientY }; });
stage.addEventListener('pointercancel', () => { touchStart = null; });
stage.addEventListener('pointerup', e => {
  if (!touchStart || mode !== 'play') return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.hypot(dx, dy) > 28) {
    input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    return;
  }
  // A tap: move one square towards wherever you tapped. Tap yourself to wait.
  const r = canvas.getBoundingClientRect();
  const tx = Math.floor((e.clientX - r.left) / cell) - S.player.x;
  const ty = Math.floor((e.clientY - r.top) / cell) - S.player.y;
  if (tx === 0 && ty === 0) input(null);
  else input(Math.abs(tx) >= Math.abs(ty) ? (tx > 0 ? 'right' : 'left') : (ty > 0 ? 'down' : 'up'));
});

$('coin').addEventListener('click', playerFlip);
$('mute').addEventListener('click', () => setMuted(!muted));

function begin() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }
  audio?.resume?.();
  coinAngle = 0;
  $('coin-inner').style.transform = 'rotateY(0deg)';
  newGame();
  mode = 'play';
  $('title').hidden = true;
  $('death').hidden = true;
  $('banner').hidden = true;
  resize();
  refreshHud();
}
$('start').addEventListener('click', begin);
$('again').addEventListener('click', begin);

// ---------- start-up ----------
for (const node of document.querySelectorAll('[data-copy]')) node.textContent = COPY[node.dataset.copy];
$('name').placeholder = COPY.namePlaceholder;
$('intro').replaceChildren(...COPY.intro.map(line => el('p', '', line)));
if (COIN_ID) {
  $('coin-id').textContent = fill(COPY.coinHeld, { id: COIN_ID });
  $('coin-id').hidden = false;
}
setMuted(muted);
window.addEventListener('resize', resize);
resize();
loadHall($('hall-title'));
requestAnimationFrame(frame);

// For automated checks only: lets a test drive the game without a touchscreen.
window.__cursedCoin = {
  get state() { return S; },
  get mode() { return mode; },
  act: dir => act(dir),
  flip: playerFlip,
  start: begin,
  unlock: () => { inputLockUntil = 0; },
};
