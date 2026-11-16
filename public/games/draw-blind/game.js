// Draw Blind: pictures drawn in the air with light.
//
// One phone is propped up as the camera. Every other phone is a brush: black until you press
// the screen, then a slab of bright colour. In a dark room, the camera phone keeps every trail
// of light it sees, so a picture builds up on its screen as the artist sweeps a brush about.
// The artist is given a word and cannot see the picture. Their team can, and has to guess it.
//
// The phones do not talk to each other. A brush is only a light; the camera only watches.
import { createSfx } from '../../shared/sfx.js';
import { openCamera } from '../../shared/camera.js';
import { everyFrame, fill, clamp, pick } from '../../shared/juice.js';

// The pieces still being tuned are fetched fresh on every visit.
const fresh = new URL(import.meta.url).search;
const [{ COPY, WORDS }, { keepAwake }] = await Promise.all(['./copy.js', '../../shared/lamp.js'].map(file => import(file + fresh)));

// ---------- rules ----------
const EXPOSE = 25;             // seconds the shutter stays open
const ROUNDS = 6;              // frames on a roll: three turns each
const ACROSS = 270;            // how many dots wide the picture is kept at
const MARGIN = 40;             // how much brighter than the dark room a light must be to leave a mark
const SOFT = 40;               // lights only just bright enough leave a faint mark, not a hard edge
const COLOURS = ['#ffffff', '#ff2a2a', '#ffd400', '#39ff5a', '#2ee6ff', '#ff3ea5'];

const $ = id => document.getElementById(id);
const canvas = $('view'), g = canvas.getContext('2d');
const video = $('cam');
const small = document.createElement('canvas'), sctx = small.getContext('2d', { willReadFrequently: true });
const print = document.createElement('canvas'), pctx = print.getContext('2d');
const glow = document.createElement('canvas'), gctx = glow.getContext('2d');
const sfx = createSfx({ shutter: 'click1', got: 'powerup1', missed: 'doorclose', paper: 'paper1' });

const S = {
  stage: 'home', t: 0, cam: null, facing: 'environment', fake: null, lastFrame: -1,
  round: 0, score: [0, 0], prints: [], threshold: 120, tooBright: false, seen: null, counted: 0,
  colour: COLOURS[0], word: '',
};
let W = 0, H = 0, dpr = 1, pw = ACROSS, ph = 480, acc = null, accImg = null;
const team = () => (S.round % 2 ? 'B' : 'A');

function show(stage) {
  S.stage = stage;
  S.t = 0;
  for (const el of document.querySelectorAll('section')) el.classList.toggle('on', el.id === stage);
}

// ---------- sound made here: the countdown pips ----------
let audio = null;
function pip(freq, dur = 0.09) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(), v = audio.createGain();
    o.frequency.value = freq;
    v.gain.setValueAtTime(0.18, audio.currentTime);
    v.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(v).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch { /* no sound is not a reason to stop */ }
}

// ---------- the picture ----------
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const tall = Math.max(60, Math.round((ACROSS * H) / W));
  if (tall !== ph || !acc) {
    ph = tall;
    for (const c of [small, print]) { c.width = pw; c.height = ph; }
    glow.width = pw >> 1;
    glow.height = ph >> 1;
    acc = new Uint8ClampedArray(pw * ph * 4);
    accImg = new ImageData(acc, pw, ph);
    wipe();
  }
}
function wipe() {
  acc.fill(0);
  for (let i = 3; i < acc.length; i += 4) acc[i] = 255;
  pctx.putImageData(accImg, 0, 0);
}
addEventListener('resize', resize);
resize();

const source = () => S.fake || video;
const sizeOf = src => [src.videoWidth || src.width || 0, src.videoHeight || src.height || 0];

// Copy what the camera sees into a small picture, filling it and keeping its shape. It is flipped
// left to right, so the picture comes out the way round the artist meant it.
function grab() {
  const src = source(), [sw, sh] = sizeOf(src);
  if (!sw) return null;
  if (!S.fake) {
    if (video.currentTime === S.lastFrame) return null;         // nothing new from the camera yet
    S.lastFrame = video.currentTime;
  }
  const scale = Math.max(pw / sw, ph / sh), cw = pw / scale, ch = ph / scale;
  sctx.save();
  sctx.translate(pw, 0);
  sctx.scale(-1, 1);
  sctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, pw, ph);
  sctx.restore();
  return sctx.getImageData(0, 0, pw, ph).data;
}

// During the countdown: learn how bright the dark room is, so only real lights leave a mark.
function measure(px) {
  S.seen = S.seen || new Uint32Array(256);
  for (let i = 0; i < px.length; i += 16) { S.seen[Math.max(px[i], px[i + 1], px[i + 2])]++; S.counted++; }
}
function settle() {
  // The level all but the brightest few parts of the room sit below. Those few are left out on
  // purpose: a brush already switched on, or a standby light, must not count as the room.
  let left = S.counted * 0.03, level = 255;
  while (level > 0 && left > 0) left -= S.seen[level--];
  S.tooBright = level > 170;
  S.threshold = clamp(level + MARGIN, 70, 225);
  S.seen = null;
  S.counted = 0;
}

// While the shutter is open: every dot keeps the brightest it has ever been.
function expose(px) {
  const thr = S.threshold;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gr = px[i + 1], b = px[i + 2], m = r > gr ? (r > b ? r : b) : (gr > b ? gr : b);
    if (m <= thr) continue;
    const k = m - thr >= SOFT ? 1 : (m - thr) / SOFT;
    if (r * k > acc[i]) acc[i] = r * k;
    if (gr * k > acc[i + 1]) acc[i + 1] = gr * k;
    if (b * k > acc[i + 2]) acc[i + 2] = b * k;
  }
  pctx.putImageData(accImg, 0, 0);
}

// The picture so far, with the soft bloom bright lights have on film.
function drawPrint(ctx, w, h) {
  gctx.filter = 'blur(3px)';
  gctx.drawImage(print, 0, 0, glow.width, glow.height);
  gctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(print, 0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75;
  ctx.drawImage(glow, 0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function cover(src, alpha) {
  const [sw, sh] = sizeOf(src);
  if (!sw) return;
  const scale = Math.max(W / sw, H / sh);
  g.save();
  g.globalAlpha = alpha;
  g.translate(W, 0);
  g.scale(-1, 1);
  g.drawImage(src, (W - sw * scale) / 2, (H - sh * scale) / 2, sw * scale, sh * scale);
  g.restore();
}

everyFrame(dt => {
  S.t += dt;
  S.fake?.step?.(dt);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  if (S.stage === 'camSetup') {
    cover(source(), 0.6);                    // so the camera can be aimed
  } else if (S.stage === 'camCount') {
    cover(source(), 0.25);
    const px = grab();
    if (px) measure(px);
    const left = 3 - Math.floor(S.t);
    if ($('count').textContent !== String(left) && left > 0) { $('count').textContent = left; pip(660); }
    if (S.t >= 3) openShutter();
  } else if (S.stage === 'camExpose') {
    const px = grab();
    if (px) expose(px);
    cover(source(), 0.1);                    // a ghost of the artist behind the trails
    drawPrint(g, W, H);
    $('bar').firstElementChild.style.width = `${clamp(S.t / EXPOSE, 0, 1) * 100}%`;
    if (EXPOSE - S.t < 3.05 && Math.floor(EXPOSE - S.t) !== S.lastPip) { S.lastPip = Math.floor(EXPOSE - S.t); pip(440); }
    if (S.t >= EXPOSE) closeShutter();
  } else if (S.stage === 'camVerdict') {
    drawPrint(g, W, H);
  }
});

// ---------- the camera phone ----------
async function beCamera() {
  sfx.unlock();
  keepAwake();
  if (!S.fake) {
    S.cam = await openCamera(video, { facing: S.facing, width: 640, height: 480 });
    if (!S.cam.ok) { $('homeNote').textContent = COPY.noCamera; return; }
  }
  setUp();
}

function setUp() {
  $('team').textContent = fill(COPY.team, { team: team() });
  $('tooBright').textContent = S.tooBright ? COPY.tooBright : '';
  $('toSheet').style.visibility = S.prints.length ? 'visible' : 'hidden';
  show('camSetup');
}

function countDown() {
  wipe();
  $('count').textContent = '';
  S.seen = null;
  S.counted = 0;
  show('camCount');
}

function openShutter() {
  settle();
  S.lastPip = -1;
  sfx.play('shutter', { volume: 1 });
  pip(880, 0.2);
  show('camExpose');
}

function closeShutter() {
  sfx.play('shutter', { volume: 1, rate: 0.8 });
  $('didThey').textContent = fill(COPY.didThey, { team: team() });
  show('camVerdict');
}

// Keep the frame for the contact sheet, and move on.
function verdict(got) {
  const frame = document.createElement('canvas');
  frame.width = pw;
  frame.height = ph;
  drawPrint(frame.getContext('2d'), pw, ph);
  S.prints.push({ url: frame.toDataURL('image/jpeg', 0.88), got, team: team() });
  if (got) S.score[S.round % 2]++;
  sfx.play(got ? 'got' : 'missed', { volume: 0.8 });
  S.round++;
  if (S.round >= ROUNDS) sheet(); else setUp();
}

function sheet() {
  const frames = $('frames');
  frames.replaceChildren(...S.prints.map((p, i) => {
    const fig = document.createElement('figure'), img = new Image(), cap = document.createElement('figcaption');
    if (p.got) fig.className = 'got';
    img.src = p.url;
    img.alt = '';
    cap.textContent = `${i + 1}${p.team}`;
    fig.append(img, cap);
    return fig;
  }));
  $('score').textContent = fill(COPY.score, { a: S.score[0], b: S.score[1] });
  $('again').textContent = S.round >= ROUNDS ? COPY.again : COPY.open;
  sfx.play('paper', { volume: 0.7 });
  show('sheet');
}

$('beCamera').onclick = beCamera;
$('open').onclick = countDown;
$('close').onclick = closeShutter;
$('got').onclick = () => verdict(true);
$('missed').onclick = () => verdict(false);
$('toSheet').onclick = sheet;
$('flip').onclick = async () => {
  S.facing = S.facing === 'environment' ? 'user' : 'environment';
  S.cam?.stop();
  S.cam = await openCamera(video, { facing: S.facing, width: 640, height: 480 });
};
$('again').onclick = () => {
  if (S.round >= ROUNDS) { S.round = 0; S.score = [0, 0]; S.prints = []; }
  setUp();
};

// ---------- a brush phone ----------
function beBrush() {
  keepAwake();
  $('word').textContent = COPY.tapWord;
  $('dots').replaceChildren(...COLOURS.map(c => {
    const dot = document.createElement('i');
    dot.style.background = c;
    dot.className = c === S.colour ? 'dot on' : 'dot';
    dot.onclick = () => { S.colour = c; for (const d of $('dots').children) d.classList.toggle('on', d === dot); };
    return dot;
  }));
  show('brush');
}
function newWord() {
  let next;
  do next = pick(WORDS); while (next === S.word);
  S.word = next;
  $('word').textContent = next;
  $('word').classList.remove('dim');
}
$('beBrush').onclick = beBrush;
$('another').onclick = newWord;
$('word').onclick = () => { if (!S.word) newWord(); else $('word').classList.toggle('dim'); };       // tap the word to read it again

// Press anywhere that is not a control and the whole screen becomes the brush.
const brush = $('brush'), paint = $('paint');
brush.addEventListener('pointerdown', e => {
  if (e.target.closest('button, .dot, #word')) return;
  brush.setPointerCapture(e.pointerId);
  paint.style.background = S.colour;
  paint.style.display = 'block';
  $('word').classList.add('dim');
});
for (const lift of ['pointerup', 'pointercancel']) brush.addEventListener(lift, () => { paint.style.display = 'none'; });

// ---------- the words ----------
for (const id of ['rule', 'beCamera', 'beBrush', 'propUp', 'flip', 'open', 'close', 'got', 'missed', 'toSheet', 'hide', 'another', 'brightness']) $(id).textContent = COPY[id];
$('title').innerHTML = COPY.title.replace(' ', '<br>');
$('sheetTitle').textContent = COPY.sheet;

// For checking without a camera or a dark room: drawblind.fake() stands in a moving light that draws a house.
window.drawblind = {
  S,
  fake() {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = 360;
    c.height = 480;
    const path = [[90, 380], [90, 220], [180, 120], [270, 220], [270, 380], [90, 380], [270, 220], [90, 220], [270, 380]];
    let along = 0;
    c.step = dt => {
      along = (along + dt * 0.9) % (path.length - 1);
      const i = Math.floor(along), k = along - i, px = path[i][0] + (path[i + 1][0] - path[i][0]) * k, py = path[i][1] + (path[i + 1][1] - path[i][1]) * k;
      x.fillStyle = '#16161c';                       // a dim room, not a black one
      x.fillRect(0, 0, 360, 480);
      for (let n = 0; n < 500; n++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; x.fillRect(Math.random() * 360, Math.random() * 480, 2, 2); }
      x.fillStyle = '#39ff5a';
      x.fillRect(px - 9, py - 16, 18, 32);           // a phone screen, seen from across the room
    };
    S.fake = c;
  },
};
