// Nerves: a duel fought with your own heartbeat.
//
// Each player rests a fingertip over the back camera of their own phone. The lamp lights the
// fingertip, the camera watches it dim a little with every beat, and the phone draws the pulse
// like a lie detector. Once it has your resting rate, the round starts: the other player may do
// anything except touch you. The first heart to climb fifteen beats a minute loses.
//
// The two phones do not talk to each other. Each one only judges its own player.
import { createSfx } from '../../shared/sfx.js';
import { openCamera } from '../../shared/camera.js';
import { everyFrame, fill, clamp } from '../../shared/juice.js';

// The pieces still being tuned are fetched fresh on every visit.
const fresh = new URL(import.meta.url).search;
const [{ COPY }, { createPulse }, { hasTorch, setTorch, keepAwake }] = await Promise.all(
  ['./copy.js', './pulse.js', '../../shared/lamp.js'].map(file => import(file + fresh)));

// ---------- rules ----------
const RISE = 15;               // beats a minute above resting that loses
const LOCK = 5;                // seconds of steady pulse before the resting rate is taken
const CRACK_HOLD = 2;          // seconds over the limit before it counts, so one stray beat cannot lose it
const LIFT = 3;                // seconds with no finger before it is a forfeit
const ROUND = 90;              // seconds a round lasts if nobody cracks
const SPEED = 70;              // how fast the chart paper runs, in pixels a second
const INK = { paper: '#efe6cf', strip: '#f6efdc', type: '#2a2622', red: '#b3160c', trace: '#8c1c13', grid: '196,72,60', blue: '#1c2a5a' };
const TYPE = '"Special Elite", "Courier New", monospace', SCRAWL = '"Scrawl", cursive';

const canvas = document.getElementById('chart'), g = canvas.getContext('2d');
const video = document.getElementById('lens');
const tiny = document.createElement('canvas');
tiny.width = tiny.height = 12;
const tctx = tiny.getContext('2d', { willReadFrequently: true });
const sfx = createSfx({ alarm: 'alarm1', paper: ['paper1', 'paper2'], bell: 'bell1', tick: 'tick1' });
const pulse = createPulse();

const S = {
  stage: 'title', t: 0, clock: 0, cam: null, lamp: false, note: '',
  finger: false, fingerOff: 0, weakFor: 0, steadyFor: 0, seen: [], lastFrame: -1,
  rest: 0, shown: 0, over: 0, roundT: 0, peak: 0,
  trace: [], scroll: 0, shake: 0, beat: 0, chartNo: 100 + Math.floor(Math.random() * 900),
  fake: null, fakePhase: 0, fakeAt: 0,
};
let W = 0, H = 0, dpr = 1;

function to(stage) { S.stage = stage; S.t = 0; }

// ---------- reading the fingertip ----------
function read(dt, now) {
  let value, finger;
  if (S.fake) {
    // A made-up fingertip with a known pulse, for checking the game without a camera.
    S.fakePhase += (2 * Math.PI * S.fake.bpm * Math.min(250, now - (S.fakeAt || now))) / 60000;
    S.fakeAt = now;
    value = 190 - 1.4 * (Math.sin(S.fakePhase) + 0.45 * Math.sin(2 * S.fakePhase + 0.6)) + (Math.random() - 0.5) * 0.8;
    finger = S.fake.finger;
  } else {
    if (!video.videoWidth || video.currentTime === S.lastFrame) return;      // no new picture from the camera yet
    S.lastFrame = video.currentTime;
    tctx.drawImage(video, 0, 0, 12, 12);
    const px = tctx.getImageData(0, 0, 12, 12).data;
    let r = 0, gr = 0, b = 0;
    for (let i = 0; i < px.length; i += 4) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; }
    r /= 144; gr /= 144; b /= 144;
    // A lit fingertip is a glowing red blur. With no lamp, a covered lens is simply dark.
    finger = S.lamp ? r > 80 && r > gr * 1.5 && r > b * 1.5 : r + gr + b < 200 || (r > gr * 1.3 && r > b * 1.3);
    value = r + gr;            // if the red is so bright it has topped out, the green still carries the beat
  }
  S.finger = finger;
  if (!finger) { pulse.reset(); return; }
  if (pulse.push(value, now)) {
    S.beat = 1;
    if (S.stage === 'go') sfx.play('tick', { volume: 0.25, vary: 0 });
  }
}

const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

function end(how) {
  to(how);
  setTorch(S.cam, false);      // let the lamp cool between rounds
  if (how === 'cracked') { S.shake = 1; sfx.play('alarm', { volume: 1 }); navigator.vibrate?.([200, 80, 200, 80, 400]); }
  else sfx.play('bell', { volume: 0.8 });
}

function update(dt, now) {
  S.t += dt;
  S.clock += dt;
  S.shake = Math.max(0, S.shake - dt * 1.6);
  S.beat = Math.max(0, S.beat - dt * 5);
  const running = S.stage === 'finger' || S.stage === 'rest' || S.stage === 'go';
  if (running) {
    read(dt, now);
    S.scroll += SPEED * dt;
    S.trace.push({ at: S.clock, y: S.finger ? pulse.wave : 0 });
    while (S.trace.length && S.clock - S.trace[0].at > 9) S.trace.shift();
    if (S.finger && pulse.bpm && pulse.steady > 0.4) S.shown = S.shown ? S.shown + (pulse.bpm - S.shown) * Math.min(1, dt * 3) : pulse.bpm;
    S.fingerOff = S.finger ? 0 : S.fingerOff + dt;
    S.weakFor = S.finger && pulse.steady < 0.3 ? S.weakFor + dt : 0;
  }

  if (S.stage === 'finger') {
    if (S.finger && pulse.steady > 0.5) { S.steadyFor += dt; S.seen.push(pulse.bpm); }
    else if (!S.finger || pulse.steady < 0.25) { S.steadyFor = 0; S.seen = []; }
    if (!S.finger) S.shown = 0;
    if (S.steadyFor >= LOCK) {
      S.rest = median(S.seen);
      S.shown = S.rest;
      to('rest');
      sfx.play('bell', { volume: 0.6 });
    }
  } else if (S.stage === 'rest') {
    if (S.fingerOff > LIFT) again();
  } else if (S.stage === 'go') {
    S.roundT += dt;
    S.peak = Math.max(S.peak, S.shown - S.rest);
    S.over = S.shown >= S.rest + RISE && pulse.steady > 0.5 ? S.over + dt : 0;
    if (S.over >= CRACK_HOLD) end('cracked');
    else if (S.fingerOff > LIFT) end('lifted');
    else if (S.roundT >= ROUND) end('held');
  }
}

// ---------- the picture ----------
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
addEventListener('resize', resize);
resize();

let grainPattern = null;
function grain() {
  if (grainPattern) return grainPattern;
  const c = document.createElement('canvas'), T = 300;
  c.width = c.height = T;
  const x = c.getContext('2d');
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},30,${Math.random() * 0.09})`;
    x.fillRect(Math.random() * T, Math.random() * T, 1 + Math.random() * 2, 1);
  }
  grainPattern = g.createPattern(c, 'repeat');
  return grainPattern;
}

function type(str, x, y, size, colour = INK.type, align = 'left') {
  g.font = `${size}px ${TYPE}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = colour;
  g.fillText(str, x, y);
}

// Typed text that runs over several lines. Returns where the next line would go.
function typed(str, x, y, width, size, colour, align = 'left') {
  g.font = `${size}px ${TYPE}`;
  let line = '';
  for (const word of str.split(' ')) {
    if (line && g.measureText(line + ' ' + word).width > width) { type(line, x, y, size, colour, align); y += size * 1.45; line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) { type(line, x, y, size, colour, align); y += size * 1.45; }
  return y;
}

// A word bashed out on a worn typewriter: each letter sits a little high or low, some heavier.
function hammered(str, cx, y, size) {
  g.font = `${size}px ${TYPE}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const total = g.measureText(str).width;
  let x = cx - total / 2;
  [...str].forEach((ch, i) => {
    const jog = Math.sin(i * 12.9898 + 4.1) * 43758.5453, r = jog - Math.floor(jog);
    g.fillStyle = INK.type;
    g.globalAlpha = 0.78 + r * 0.22;
    g.fillText(ch, x, y + (r - 0.5) * size * 0.07);
    if (r > 0.6) g.fillText(ch, x + 0.7, y + (r - 0.5) * size * 0.07);          // struck twice
    x += g.measureText(ch).width;
  });
  g.globalAlpha = 1;
}

function scrawl(str, x, y, size, colour, tilt) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.font = `${size}px ${SCRAWL}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = colour;
  g.fillText(str, 0, 0);
  g.restore();
}

const blink = () => Math.floor(S.clock * 2.2) % 2 === 0;

function paper() {
  g.fillStyle = INK.paper;
  g.fillRect(-20, -20, W + 40, H + 40);
  g.fillStyle = grain();
  g.fillRect(-20, -20, W + 40, H + 40);
}

function header() {
  const m = 18;
  type(COPY.subject, m, 26, 14);
  type(fill(COPY.chart, { n: S.chartNo }), W - m, 26, 14, INK.type, 'right');
  g.fillStyle = INK.type;
  g.fillRect(m, 40, W - m * 2, 1.5);
  g.fillRect(m, 44, W - m * 2, 0.6);
}

// The strip of chart paper the pen draws on. It runs right to left under a pen that stays put.
function strip() {
  const y0 = H * 0.42, h = H * 0.2, mid = y0 + h / 2, penX = W * 0.8;
  g.save();
  g.fillStyle = 'rgba(60,40,20,0.18)';
  g.fillRect(0, y0 + 3, W, h);
  g.fillStyle = INK.strip;
  g.fillRect(0, y0, W, h);
  g.beginPath();
  g.rect(0, y0, W, h);
  g.clip();
  const off = S.scroll % 45;
  for (let x = -off; x < W; x += 9) {
    const bold = Math.round((x + off) / 9) % 5 === 0;
    g.fillStyle = `rgba(${INK.grid},${bold ? 0.36 : 0.15})`;
    g.fillRect(x, y0, bold ? 1.2 : 0.8, h);
  }
  for (let y = y0 + 14, i = 0; y < y0 + h - 12; y += 9, i++) {
    g.fillStyle = `rgba(${INK.grid},${i % 5 === 0 ? 0.36 : 0.15})`;
    g.fillRect(0, y, W, i % 5 === 0 ? 1.2 : 0.8);
  }
  // The holes the machine pulls the paper along by.
  g.fillStyle = INK.paper;
  for (let x = -(S.scroll % 30); x < W + 10; x += 30) {
    g.beginPath();
    g.arc(x, y0 + 6, 3, 0, Math.PI * 2);
    g.arc(x, y0 + h - 6, 3, 0, Math.PI * 2);
    g.fill();
  }
  // The trace: once fat and faint for the ink soaking in, once thin and dark.
  const swing = h * 0.3;
  for (const [width, alpha] of [[5, 0.16], [2.1, 0.95]]) {
    g.strokeStyle = INK.trace;
    g.globalAlpha = alpha;
    g.lineWidth = width;
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    S.trace.forEach((p, i) => {
      const x = penX - (S.clock - p.at) * SPEED, y = mid - p.y * swing;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
  // The pen and its arm, reaching in from off the page.
  const last = S.trace[S.trace.length - 1], penY = mid - (last ? last.y : 0) * swing;
  g.strokeStyle = '#1d1b19';
  g.lineWidth = 3.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(W + 30, y0 - 26);
  g.lineTo(penX, penY);
  g.stroke();
  g.fillStyle = '#1d1b19';
  g.beginPath();
  g.arc(penX, penY, 4.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK.trace;
  g.beginPath();
  g.arc(penX, penY, 1.8, 0, Math.PI * 2);
  g.fill();
}

function bigNumber() {
  const size = Math.min(W * 0.4, H * 0.19), y = H * 0.21;
  const n = S.shown ? String(Math.round(S.shown)) : '--';
  g.font = `${size}px ${TYPE}`;
  const w = g.measureText(n).width;
  type(n, W / 2, y, size, INK.type, 'center');
  // A blot of red ink that swells with each beat.
  g.fillStyle = INK.red;
  g.globalAlpha = 0.35 + S.beat * 0.65;
  g.beginPath();
  g.arc(W / 2 + w / 2 + 20, y - size * 0.28, 5 + S.beat * 5, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  type(COPY.perMinute, W / 2, y + size * 0.6, 13, INK.type, 'center');
}

// A ruler of heart rates, with your resting rate, the limit, and a pointer for where you are now.
function ruler() {
  if (!S.rest) return;
  const y = H * 0.73, x0 = W * 0.08, x1 = W * 0.92, lo = S.rest - 8, hi = S.rest + RISE + 8;
  const at = bpm => x0 + ((clamp(bpm, lo, hi) - lo) / (hi - lo)) * (x1 - x0);
  g.fillStyle = INK.type;
  g.fillRect(x0, y, x1 - x0, 1.5);
  for (let b = Math.ceil(lo); b <= hi; b++) {
    const big = b % 5 === 0;
    g.fillRect(at(b), y - (big ? 12 : 6), big ? 1.5 : 0.8, big ? 12 : 6);
    if (big) type(String(b), at(b), y + 14, 12, INK.type, 'center');
  }
  type(COPY.resting, at(S.rest), y - 26, 11, INK.type, 'center');
  g.fillRect(at(S.rest) - 0.5, y - 18, 1, 18);
  // The limit, drawn on by hand in red.
  const lx = at(S.rest + RISE);
  g.strokeStyle = INK.red;
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(lx - 2, y - 30);
  g.quadraticCurveTo(lx + 3, y, lx - 1, y + 24);
  g.stroke();
  scrawl(COPY.limit, lx - 4, y - 44, 19, INK.red, -0.12);
  // Where you are now.
  const nx = at(S.shown || S.rest);
  g.fillStyle = S.over > 0 ? INK.red : INK.type;
  g.beginPath();
  g.moveTo(nx, y - 2);
  g.lineTo(nx - 7, y - 16);
  g.lineTo(nx + 7, y - 16);
  g.closePath();
  g.fill();
}

function instruction() {
  const y = H * 0.9;
  let line = '';
  if (S.stage === 'finger') {
    if (!S.finger) line = blink() ? COPY.noFinger : '';
    else if (S.weakFor > 4) line = COPY.gently;
    else line = COPY.finding + ' ' + '.'.repeat(1 + Math.floor(S.steadyFor));
  } else if (S.stage === 'rest') {
    line = blink() ? COPY.ready : '';
  } else if (S.stage === 'go') {
    type(`${String(Math.floor(S.roundT)).padStart(2, '0')}s`, W - 18, y, 16, INK.type, 'right');
  } else if (S.t > 1.2) {
    line = blink() ? COPY.again : '';
  }
  if (line) typed(line, W / 2, y, W - 36, 15, INK.type, 'center');
  if (S.note) typed(S.note, W / 2, H * 0.955, W - 36, 12, INK.red, 'center');
}

function verdict() {
  const secs = Math.round(S.roundT), rise = `${Math.max(0, Math.round(S.peak))}`;
  const [word, colour, sub] = S.stage === 'cracked' ? [COPY.cracked, INK.red, fill(COPY.crackedAfter, { time: secs })]
    : S.stage === 'held' ? [COPY.held, INK.blue, fill(COPY.heldBy, { rise, time: secs })]
    : [COPY.lifted, INK.red, COPY.forfeit];
  if (S.stage === 'cracked') { g.fillStyle = `rgba(179,22,12,${0.14 + 0.1 * Math.sin(S.clock * 12)})`; g.fillRect(0, 0, W, H); }
  const thump = S.t < 0.12 ? 1.6 - 5 * S.t : 1;
  g.font = `10px ${SCRAWL}`;
  const size = Math.min(H * 0.16, ((W * 0.86) / g.measureText(word).width) * 10) * thump;
  scrawl(word, W / 2, H * 0.52, size, colour, -0.1);
  // Underlined twice, hard.
  g.strokeStyle = colour;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.save();
  g.translate(W / 2, H * 0.52 + size * 0.62);
  g.rotate(-0.1);
  g.beginPath();
  g.moveTo(-W * 0.36, 0);
  g.quadraticCurveTo(0, 6, W * 0.36, -2);
  g.moveTo(-W * 0.3, 9);
  g.quadraticCurveTo(0, 14, W * 0.33, 7);
  g.stroke();
  g.restore();
  type(sub, W / 2, H * 0.52 + size * 0.62 + 34, 15, INK.type, 'center');
}

function titleCard() {
  hammered(COPY.title, W / 2, H * 0.26, Math.min(W * 0.2, H * 0.12));
  g.fillStyle = INK.type;
  g.fillRect(W * 0.2, H * 0.26 + Math.min(W * 0.2, H * 0.12) * 0.62, W * 0.6, 1.5);
  let y = typed(fill(COPY.rule, { rise: RISE }), W / 2, H * 0.43, W - 56, 17, INK.type, 'center');
  typed(COPY.warm, W / 2, y + 16, W - 56, 13, INK.type, 'center');
  if (blink()) type(COPY.start, W / 2, H * 0.8, 18, INK.red, 'center');
  if (S.note) typed(S.note, W / 2, H * 0.88, W - 48, 14, INK.red, 'center');
}

function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.shake > 0) g.translate((Math.random() - 0.5) * 22 * S.shake, (Math.random() - 0.5) * 22 * S.shake);
  paper();
  header();
  if (S.stage === 'title') { titleCard(); return; }
  bigNumber();
  strip();
  ruler();
  instruction();
  if (S.stage === 'cracked' || S.stage === 'held' || S.stage === 'lifted') verdict();
}

everyFrame((dt, now) => { update(dt, now); draw(); });

// ---------- taps ----------
async function begin() {
  sfx.unlock();
  keepAwake();
  S.note = '';
  if (!S.fake) {
    S.cam = await openCamera(video, { facing: 'environment', width: 160, height: 120 });
    if (!S.cam.ok) { S.note = COPY.noCamera; return; }
    // Phones take a moment after the camera opens before they will say whether the lamp can be switched.
    await new Promise(r => setTimeout(r, 400));
    S.lamp = hasTorch(S.cam) && await setTorch(S.cam, true);
    if (!S.lamp) S.note = COPY.noLamp;
  }
  sfx.play('paper', { volume: 0.7 });
  again();
}

function again() {
  pulse.reset();
  Object.assign(S, { steadyFor: 0, seen: [], rest: 0, shown: 0, over: 0, roundT: 0, peak: 0, fingerOff: 0, weakFor: 0 });
  if (S.lamp) setTorch(S.cam, true);
  to('finger');
}

let busy = false;
canvas.addEventListener('pointerdown', async () => {
  if (busy) return;
  if (S.stage === 'title') { busy = true; await begin(); busy = false; }
  else if (S.stage === 'rest') { S.roundT = 0; S.over = 0; S.peak = 0; to('go'); sfx.play('bell', { volume: 0.9 }); }
  else if ((S.stage === 'cracked' || S.stage === 'held' || S.stage === 'lifted') && S.t > 1.2) again();
});

// For checking from the console: nerves.fake(72) pretends a finger with that pulse is on the camera.
window.nerves = {
  S, pulse,
  fake(bpm, finger = true) { S.fake = bpm === null ? null : { bpm, finger }; },
  tap() { canvas.dispatchEvent(new Event('pointerdown')); },
};
