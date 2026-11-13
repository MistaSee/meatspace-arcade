// Egg-and-Spoon Race: walk a real distance with the phone held like a spoon.
import { COPY, pick, fill } from './copy.js';
import { createMotion, createSound, buzz } from '../../shared/motion.js';
import { getHall, submitScore, renderHall, rememberName, savedName } from '../../shared/hall.js';

// ---------- rules ----------
const GAME = 'egg-race';
const STEPS = 30;
const BOWL_PULL = 6;      // how strongly the bowl's curve pulls the egg back to the middle
const TILT_PUSH = 17;     // how hard tilting pushes the egg
const DAMPING = 1.0;      // lower = wobblier
const DEAD_ZONE = 0.8;    // degrees of tilt that count as level
const GUST_FROM_STEP = 6;
const GUST_PUSH = 3.5;

const DEBUG = new URLSearchParams(location.search).has('debug');
const motion = createMotion();
const sound = createSound();
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- state ----------
let state = 'title';      // title | ready | racing | dropped | finished
const egg = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, fall: 0, fx: 0, fy: 0 };
let steps = 0, broken = 0, startTime = 0, finishTime = 0;
let gust = null, nextGustAt = 0;
let lastWobbleLine = 0, lastJolt = 0;
let splat = null;
let carved = false;

const say = line => { $('commentary').textContent = line; };

function resetEgg() {
  Object.assign(egg, { x: 0, y: 0, vx: 0, vy: 0, angle: 0, fall: 0 });
}

// ---------- footsteps and jolts ----------
motion.onStep = strength => {
  if (state !== 'racing') return;
  steps++;
  // A footstep bounces the egg, mostly forwards and back.
  const kick = Math.min(0.5, 0.14 + 0.07 * Math.max(0, strength - 1.3));
  const ang = (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2 + (Math.random() - 0.5) * 1.4;
  egg.vx += Math.cos(ang) * kick;
  egg.vy += Math.sin(ang) * kick;
  sound.tone(220 + steps * 8, 0.04, 'triangle', 0.03);
  buzz(8);
  stepCommentary();
  updateHud();
  if (steps >= STEPS) finish();
};

motion.onSample = ({ accel, now }) => {
  if (state !== 'racing' || accel < 7 || now - lastJolt < 120) return;
  lastJolt = now;
  const kick = Math.min(0.6, (accel - 7) * 0.03);
  const ang = Math.random() * Math.PI * 2;
  egg.vx += Math.cos(ang) * kick;
  egg.vy += Math.sin(ang) * kick;
};

function stepCommentary() {
  const c = COPY.commentary;
  const left = STEPS - steps;
  if (steps === 1) say(pick(c.first));
  else if (c.milestone[steps]) say(pick(c.milestone[steps]));
  else if (left > 0 && left <= 3) say(fill(pick(c.countdown), { left }));
}

// ---------- the race ----------
function readyCountdown(again) {
  state = 'ready';
  resetEgg();
  gust = null;
  $('ready-text').textContent = again ? COPY.readyAgain : COPY.ready;
  $('ready').hidden = false;
  let n = again ? 2 : 3;
  const count = $('count');
  count.textContent = n;
  sound.tone(440, 0.1, 'square', 0.04);
  const tick = setInterval(() => {
    n--;
    if (n > 0) {
      count.textContent = n;
      sound.tone(440, 0.1, 'square', 0.04);
      return;
    }
    clearInterval(tick);
    count.textContent = COPY.go;
    sound.tone(880, 0.25, 'square', 0.05);
    buzz(60);
    motion.level();
    setTimeout(() => {
      $('ready').hidden = true;
      const now = performance.now();
      if (!again) startTime = now;
      nextGustAt = now + rand(7000, 10000);
      state = 'racing';
      say(pick(COPY.commentary.start));
      if (!motion.live) setTimeout(() => { if (!motion.live && state === 'racing') say('Arrow keys tilt. Enter takes a step.'); }, 1500);
    }, 450);
  }, 750);
}

function drop() {
  state = 'dropped';
  broken++;
  const r = Math.hypot(egg.x, egg.y) || 1;
  egg.fx = egg.x / r;
  egg.fy = egg.y / r;
  egg.fall = 0.0001;
  gust = null;
  say(pick(COPY.commentary.drop));
  sound.tone(300, 0.25, 'sine', 0.05, 80);
  sound.noise(0.3, 0.14, 0.3, 1200, 200);
  buzz([60, 40, 180]);
  updateHud();
  setTimeout(() => {
    if (state !== 'dropped') return;
    steps = 0;
    updateHud();
    say(pick(COPY.commentary.restart));
    readyCountdown(true);
  }, 1700);
}

function finish() {
  state = 'finished';
  finishTime = performance.now();
  gust = null;
  [523, 659, 784, 1047].forEach((f, i) => sound.tone(f, 0.18, 'triangle', 0.05, null, i * 0.12));
  buzz([40, 60, 40, 60, 200]);
  const seconds = (finishTime - startTime) / 1000;
  $('finish-title').textContent = COPY.finishTitle;
  $('finish-line').textContent = pick(COPY.finishLine);
  $('finish-time').textContent = fill(COPY.finishTime, { t: seconds.toFixed(1) });
  $('finish-detail').textContent = eggsText() || COPY.noEggsHarmed;
  $('name').value = savedName();
  $('carve').hidden = false;
  $('carved').hidden = true;
  carved = false;
  setTimeout(() => {
    $('finish').hidden = false;
    $('finish').scrollTop = 0;
    loadHall($('hall-finish'));
  }, 700);
}

function eggsText() {
  if (!broken) return '';
  return fill(COPY.eggsBroken[Math.min(broken, 2)], { n: broken });
}

function updateHud() {
  const frac = Math.min(1, steps / STEPS);
  $('trackFill').style.width = frac * 100 + '%';
  $('runner').style.left = frac * 100 + '%';
  $('stepsLabel').textContent = fill(COPY.steps, { n: steps, total: STEPS });
  $('eggs').textContent = eggsText();
}

// ---------- physics ----------
function physics(dt, now) {
  const t = motion.read();
  if (state !== 'racing') return;
  const dz = v => (Math.abs(v) <= DEAD_ZONE ? 0 : v - Math.sign(v) * DEAD_ZONE);
  const tx = dz(t.x) * Math.PI / 180, ty = dz(t.y) * Math.PI / 180;
  let ax = TILT_PUSH * Math.sin(tx) - BOWL_PULL * egg.x - DAMPING * egg.vx;
  let ay = TILT_PUSH * Math.sin(ty) - BOWL_PULL * egg.y - DAMPING * egg.vy;

  // Gusts: a warning, then a push you have to lean against.
  if (!gust && steps >= GUST_FROM_STEP && now > nextGustAt) {
    const a = Math.random() * Math.PI * 2;
    gust = { phase: 'warn', dx: Math.cos(a), dy: Math.sin(a), until: now + 1000 };
    say(pick(COPY.commentary.gustWarn));
    sound.noise(1.0, 0.05, 0, 300, 1400);
  } else if (gust?.phase === 'warn' && now > gust.until) {
    gust.phase = 'blow';
    gust.until = now + 1400;
    sound.noise(1.4, 0.09, 0, 1400, 500);
    buzz(30);
  } else if (gust?.phase === 'blow' && now > gust.until) {
    gust = null;
    nextGustAt = now + rand(6000, 11000);
    say(pick(COPY.commentary.gustSurvived));
  }
  if (gust?.phase === 'blow') { ax += gust.dx * GUST_PUSH; ay += gust.dy * GUST_PUSH; }

  egg.vx += ax * dt;
  egg.vy += ay * dt;
  egg.x += egg.vx * dt;
  egg.y += egg.vy * dt;

  // The egg turns to face the way it is rolling.
  const speed = Math.hypot(egg.vx, egg.vy);
  if (speed > 0.15) {
    const target = Math.atan2(egg.vy, egg.vx) + Math.PI / 2;
    let diff = target - egg.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    egg.angle += diff * Math.min(1, dt * 4);
  }

  const r = Math.hypot(egg.x, egg.y);
  if (r > 0.72 && now - lastWobbleLine > 3500) {
    lastWobbleLine = now;
    say(pick(COPY.commentary.wobble));
    sound.tone(180, 0.08, 'sine', 0.03, 140);
  }
  if (r > 1) drop();
}

// ---------- drawing ----------
const canvas = $('board');
const ctx = canvas.getContext('2d');
let W = 300, H = 400;

function resize() {
  const r = $('stage').getBoundingClientRect();
  W = Math.floor(r.width);
  H = Math.floor(r.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawSpoon(cx, cy, B, rimGlow) {
  // handle
  const hw = B * 0.17;
  const hg = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
  hg.addColorStop(0, '#8b8f99'); hg.addColorStop(0.45, '#f1f3f7'); hg.addColorStop(1, '#7a7e88');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.55, cy + B * 0.8);
  ctx.lineTo(cx - hw, H + 10);
  ctx.lineTo(cx + hw, H + 10);
  ctx.lineTo(cx + hw * 0.55, cy + B * 0.8);
  ctx.closePath();
  ctx.fill();
  // bowl
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(cx + B * 0.04, cy + B * 0.07, B * 1.06, 0, Math.PI * 2); ctx.fill();
  const bg = ctx.createRadialGradient(cx - B * 0.3, cy - B * 0.35, B * 0.05, cx, cy, B * 1.06);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.35, '#d7dbe3'); bg.addColorStop(0.85, '#9399a6'); bg.addColorStop(1, '#6b707c');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, B * 1.06, 0, Math.PI * 2); ctx.fill();
  // inner dish
  const ig = ctx.createRadialGradient(cx + B * 0.2, cy + B * 0.25, B * 0.1, cx, cy, B);
  ig.addColorStop(0, '#eef0f4'); ig.addColorStop(0.7, '#b9bec9'); ig.addColorStop(1, '#8c919d');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.arc(cx, cy, B, 0, Math.PI * 2); ctx.fill();
  if (rimGlow > 0) {
    ctx.strokeStyle = `rgba(228,87,46,${rimGlow})`;
    ctx.lineWidth = B * 0.08;
    ctx.beginPath(); ctx.arc(cx, cy, B * 1.0, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawEgg(x, y, size, angle, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(size * 0.12, size * 0.18, size * 0.8, size * 0.95, angle, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(angle);
  const g = ctx.createRadialGradient(-size * 0.3, -size * 0.45, size * 0.1, 0, 0, size * 1.1);
  g.addColorStop(0, '#fffdf6'); g.addColorStop(0.6, '#f3e6cc'); g.addColorStop(1, '#c9b48e');
  ctx.fillStyle = g;
  // An egg: rounder at the bottom, pointier at the top.
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.62, -size, size * 0.85, size * 0.15, size * 0.78, size * 0.42);
  ctx.bezierCurveTo(size * 0.68, size * 0.88, size * 0.3, size, 0, size);
  ctx.bezierCurveTo(-size * 0.3, size, -size * 0.68, size * 0.88, -size * 0.78, size * 0.42);
  ctx.bezierCurveTo(-size * 0.85, size * 0.15, -size * 0.62, -size, 0, -size);
  ctx.fill();
  ctx.restore();
}

function drawSplat(x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fbfbf5';
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = size * (1.2 + 0.35 * Math.sin(i * 2.7));
    i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75);
  }
  ctx.fill();
  ctx.fillStyle = '#f6b41b';
  ctx.beginPath(); ctx.arc(x + size * 0.1, y, size * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGust(cx, cy, B, now) {
  if (!gust) return;
  const strong = gust.phase === 'blow';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(gust.dy, gust.dx));
  ctx.strokeStyle = strong ? 'rgba(142,202,230,0.7)' : 'rgba(142,202,230,0.35)';
  ctx.lineWidth = strong ? 4 : 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const y = (i - 3) * B * 0.32;
    const off = ((now / (strong ? 3 : 7) + i * 97) % (B * 3)) - B * 1.5;
    ctx.beginPath(); ctx.moveTo(off - B * 0.5, y); ctx.lineTo(off, y); ctx.stroke();
  }
  ctx.restore();
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  const B = Math.min(W * 0.4, H * 0.33);
  const cx = W / 2, cy = H * 0.42;
  const r = Math.hypot(egg.x, egg.y);
  const glow = state === 'racing' && r > 0.6 ? Math.min(0.9, (r - 0.6) / 0.4) : 0;
  drawSpoon(cx, cy, B, glow);
  drawGust(cx, cy, B, now);

  const size = B * 0.33;
  if (state === 'dropped' && egg.fall) {
    egg.fall += 1 / 60;
    const t = Math.min(1, egg.fall / 0.45);
    const out = 1 + t * 0.9;
    const ex = cx + egg.fx * B * out, ey = cy + egg.fy * B * out + t * t * B * 0.6;
    if (t < 1) drawEgg(ex, ey, size * (1 - t * 0.35), egg.angle + t * 4);
    else drawSplat(ex, ey, size * 0.9, Math.max(0, 1 - (egg.fall - 0.45) / 1.6));
  } else if (state !== 'title') {
    drawEgg(cx + egg.x * B, cy + egg.y * B, size, egg.angle);
  }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  physics(dt, now);
  if (state === 'racing' || state === 'dropped' || state === 'ready') {
    $('clock').textContent = (startTime ? (now - startTime) / 1000 : 0).toFixed(1) + 's';
  }
  draw(now);
  if (DEBUG) debugLine();
  requestAnimationFrame(frame);
}

let dbg = null;
function debugLine() {
  if (!dbg) { dbg = document.createElement('div'); dbg.className = 'debug'; document.body.append(dbg); }
  dbg.textContent = `tilt ${motion.tilt.x.toFixed(1)},${motion.tilt.y.toFixed(1)}  live ${motion.live}/${motion.motionLive}\naccel ${motion.accel.toFixed(1)}  steps ${steps}  egg r ${Math.hypot(egg.x, egg.y).toFixed(2)}`;
}

// ---------- Hall ----------
const hallOpts = {
  formatScore: s => (s / 10).toFixed(1) + 's',
  empty: COPY.hallEmpty,
  phoneOnly: COPY.phoneOnly,
};
async function loadHall(ol, highlight) {
  renderHall(ol, await getHall(GAME, { lowerIsBetter: true }), { ...hallOpts, highlight });
}

$('carve').addEventListener('submit', async e => {
  e.preventDefault();
  if (carved) return;
  const name = $('name').value.trim().slice(0, 12);
  if (!name) return;
  carved = true;
  rememberName(name);
  $('name').blur();
  $('carve').hidden = true;
  const res = await submitScore(GAME, {
    name,
    score: Math.round((finishTime - startTime) / 100),
    detail: eggsText() || COPY.noEggsHarmed,
  }, { lowerIsBetter: true });
  $('carved').textContent = fill(COPY.carved, { rank: res.rank ?? '?' });
  $('carved').hidden = false;
  renderHall($('hall-finish'), res, { ...hallOpts, highlight: res.id });
});

// ---------- start ----------
async function begin() {
  sound.unlock();
  await motion.start();
  steps = 0;
  broken = 0;
  startTime = 0;
  updateHud();
  $('title').hidden = true;
  $('finish').hidden = true;
  resize();
  readyCountdown(false);
}

$('start').addEventListener('click', begin);
$('again').addEventListener('click', begin);
$('giveup').addEventListener('click', () => {
  if (state === 'title' || state === 'finished') return;
  state = 'title';
  gust = null;
  $('ready').hidden = true;
  say(COPY.gaveUp);
  $('title').hidden = false;
  loadHall($('hall-title'));
});

for (const node of document.querySelectorAll('[data-copy]')) node.textContent = COPY[node.dataset.copy];
$('giveup').textContent = COPY.giveUp;
$('name').placeholder = COPY.namePlaceholder;
$('how').replaceChildren(...COPY.how.map(line => {
  const p = document.createElement('p');
  p.textContent = fill(line, { steps: STEPS });
  return p;
}));
if (!motion.secure) {
  $('nosensors').innerHTML = COPY.noSensors;
  $('nosensors').hidden = false;
}
updateHud();
addEventListener('resize', resize);
resize();
loadHall($('hall-title'));
requestAnimationFrame(frame);

// For automated checks only.
window.__egg = {
  egg, motion,
  get state() { return state; },
  get steps() { return steps; },
  get broken() { return broken; },
  step: (s = 1.8) => motion.onStep(s),
  physics: (frames = 1) => { for (let i = 0; i < frames; i++) physics(1 / 60, performance.now()); },
  begin,
};
