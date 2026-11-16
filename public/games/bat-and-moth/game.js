// Bat and Moth: hide and seek by a sound nobody can hear.
//
// One player is the moth. Their phone sings a note pitched above most adults' hearing. Every
// other player is a bat: eyes shut, phone held out, its microphone listening for that one note.
// The louder the note, the nearer the moth, and the faster the bat's phone clicks. The moth
// creeps about, and can hold its breath for a few seconds to go silent. Touch the moth to win.
//
// The phones do not talk to each other except through the air.
import { everyFrame, fill, clamp } from '../../shared/juice.js';

// The pieces still being tuned are fetched fresh on every visit.
const fresh = new URL(import.meta.url).search;
const [{ COPY }, { openEar, earFrom }, { keepAwake }] = await Promise.all(
  ['./copy.js', '../../shared/ear.js', '../../shared/lamp.js'].map(file => import(file + fresh)));

// ---------- rules ----------
const CHANNELS = [18500, 16000, 12000];      // the moth's call, highest first. Lower ones carry further but more people can hear them.
const QUIET = 10;              // decibels clear of the hiss before a bat believes it hears anything
const CLOSE = 50;              // decibels clear that counts as right on top of the moth
const SLOW = 1.0, FAST = 0.06; // seconds between clicks, far and near
const IDLE = 1.7;              // a slow soft tick when nothing is heard, so a bat knows its phone is alive
const HOLD = 3;                // seconds the moth can hold its breath
const REFILL = 6;              // seconds to get it all back
const GASP = 0.25;             // how much breath it needs back before it can hold again
const INK = { blue: '#0c2f57', deep: '#071d38', white: '#eef3f6' };

const $ = id => document.getElementById(id);
const canvas = $('view'), g = canvas.getContext('2d');
const S = {
  stage: 'home', t: 0, clock: 0, seed: 1 + Math.floor(Math.random() * 9998), moth: null,
  channel: 0, pressing: false, breath: 1, gasping: false, open: 1, flown: 0,
  ear: null, heard: { over: 0, hz: 0 }, near: 0, nextClick: 0.5, rings: [], fake: null,
};
let W = 0, H = 0, dpr = 1;

function show(stage) {
  S.stage = stage;
  S.t = 0;
  for (const el of document.querySelectorAll('section')) el.classList.toggle('on', el.id === stage);
}
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- sound ----------
let audio = null, call = null;
function sound() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { audio = null; }
  return audio;
}

// The moth's call: one steady note. Fading it in and out stops the speaker clicking, which would be heard.
function calling(on) {
  if (!sound()) return;
  if (!call) {
    const o = audio.createOscillator(), v = audio.createGain();
    v.gain.value = 0;
    o.connect(v).connect(audio.destination);
    o.start();
    call = { o, v, on: false };
  }
  call.o.frequency.value = CHANNELS[S.channel];
  if (call.on !== on) { call.on = on; call.v.gain.setTargetAtTime(on ? 0.9 : 0, audio.currentTime, 0.012); }
}

// A bat's click: low and short, so it cannot be mistaken for the moth by this phone or any other.
function click(near) {
  S.rings.push({ age: 0, near });
  if (near > 0.2) navigator.vibrate?.(8);
  const ctx = S.ear?.ctx || sound();
  if (!ctx) return;
  const o = ctx.createOscillator(), v = ctx.createGain(), now = ctx.currentTime;
  o.frequency.value = 800 + near * 700;
  v.gain.setValueAtTime(0, now);
  v.gain.linearRampToValueAtTime(near > 0.02 ? 0.3 : 0.07, now + 0.004);
  v.gain.linearRampToValueAtTime(0, now + 0.026);
  o.connect(v).connect(ctx.destination);
  o.start(now);
  o.stop(now + 0.03);
}

// ---------- the moth ----------
function beMoth() {
  sound();
  keepAwake();
  S.breath = 1;
  S.gasping = false;
  S.flown = 0;
  words();
  show('moth');
}

function mothTick(dt) {
  S.flown += dt;
  const holding = S.pressing && !S.gasping && S.breath > 0;
  S.breath = clamp(S.breath + (holding ? -dt / HOLD : dt / REFILL), 0, 1);
  if (S.breath <= 0) S.gasping = true;
  if (S.breath >= GASP) S.gasping = false;
  calling(!holding);
  S.open += ((holding ? 0.22 : 0.9 + 0.1 * Math.sin(S.clock * 7)) - S.open) * Math.min(1, dt * 9);
  $('clock').textContent = clock(S.flown);
}

canvas.addEventListener('pointerdown', () => { if (S.stage === 'moth') S.pressing = true; });
for (const lift of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(lift, () => { S.pressing = false; });

// ---------- a bat ----------
async function beBat() {
  sound();
  keepAwake();
  S.ear = S.fake || await openEar();
  if (!S.ear.ok) { $('homeNote').textContent = COPY.noMic; return; }
  S.near = 0;
  show('bat');
}

function batTick(dt) {
  // Listen on every pitch the moth might be using, and follow whichever stands out most.
  let best = { over: -99, hz: 0 }, any = false;
  for (const hz of CHANNELS) {
    if (hz > S.ear.highest - 800) continue;
    any = true;
    const b = S.ear.band(hz);
    if (b.over > best.over) best = { over: b.over, hz };
  }
  S.heard = best;
  const target = any ? clamp((best.over - QUIET) / (CLOSE - QUIET), 0, 1) : 0;
  S.near += (target - S.near) * Math.min(1, dt * 6);
  S.nextClick -= dt;
  if (S.nextClick <= 0) {
    S.nextClick = S.near > 0.02 ? SLOW + (FAST - SLOW) * Math.pow(S.near, 0.7) : IDLE;
    click(S.near);
  }
  for (const r of S.rings) r.age += dt;
  S.rings = S.rings.filter(r => r.age < 1.3);
  $('hears').textContent = !any ? COPY.tooLow
    : S.near > 0.02 ? fill(COPY.hears, { khz: (best.hz / 1000).toFixed(1), db: Math.round(best.over) }) : COPY.listening;
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

// The same seed always grows the same moth.
function dice(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function species(seed) {
  const r = dice(seed);
  return { span: 0.86 + r() * 0.26, lift: 0.5 + r() * 0.34, hind: 0.74 + r() * 0.4, tail: 0.4 + r() * 0.7, bands: 2 + Math.floor(r() * 3),
    wave: 0.01 + r() * 0.035, eye: r() < 0.7, eyeAt: 0.5 + r() * 0.18, veins: 5 + Math.floor(r() * 4), comb: r() < 0.6, body: 0.85 + r() * 0.3 };
}

let paperPattern = null;
function paper() {
  const wash = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75);
  wash.addColorStop(0, '#11406f');
  wash.addColorStop(1, INK.deep);
  g.fillStyle = wash;
  g.fillRect(0, 0, W, H);
  if (!paperPattern) {
    // The blue was brushed onto rough paper by hand: blotchy, flecked, with the grain showing.
    const c = document.createElement('canvas'), T = 340, x = c.getContext('2d');
    c.width = c.height = T;
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,10,30'},${0.015 + Math.random() * 0.03})`;
      x.beginPath();
      x.arc(40 + Math.random() * (T - 80), 40 + Math.random() * (T - 80), 8 + Math.random() * 30, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(238,243,246,${Math.random() * 0.07})`;
      x.fillRect(Math.random() * T, Math.random() * T, 1 + Math.random() * 2, 1);
    }
    paperPattern = g.createPattern(c, 'repeat');
  }
  g.fillStyle = paperPattern;
  g.fillRect(0, 0, W, H);
}

// One wing, drawn on the right. The left is the same wing mirrored.
function wing(m, hind) {
  const p = new Path2D();
  if (hind) {
    p.moveTo(0.04, -0.02);
    p.bezierCurveTo(0.5, -0.06, 0.8 * m.hind, 0.12, 0.7 * m.hind, 0.42);
    p.bezierCurveTo(0.6 * m.hind, 0.42 + 0.3 * m.tail, 0.18, 0.5, 0.03, 0.26);
  } else {
    p.moveTo(0.03, -0.2);
    p.bezierCurveTo(0.3, -0.2 - m.lift * 0.9, m.span * 0.9, -0.2 - m.lift, m.span, -0.2 - m.lift * 0.55);
    p.bezierCurveTo(m.span * 0.98, -0.12, 0.55, 0.1, 0.04, 0.03);
  }
  p.closePath();
  g.fillStyle = INK.white;
  g.shadowColor = 'rgba(238,243,246,0.45)';
  g.shadowBlur = 14;
  g.globalAlpha = hind ? 0.86 : 0.95;
  g.fill(p);
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  // The markings are the blue showing through.
  g.save();
  g.clip(p);
  g.strokeStyle = INK.blue;
  g.lineCap = 'round';
  const cy = hind ? 0.05 : -0.1, reach = hind ? m.hind * 0.8 : m.span;
  for (let b = 1; b <= m.bands; b++) {
    const rad = (b / (m.bands + 1)) * reach * 1.05;
    g.lineWidth = b % 2 ? 0.05 : 0.018;
    g.globalAlpha = 0.8;
    g.beginPath();
    for (let a = -2.2; a <= 1.9; a += 0.06) {
      const rr = rad + Math.sin(a * 13 + b) * m.wave;
      const x = Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (a === -2.2) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = 0.007;
  g.globalAlpha = 0.5;
  for (let v = 0; v < m.veins; v++) {
    const a = (hind ? 0.1 : -1.25) + (v / (m.veins - 1)) * (hind ? 1.3 : 1.35);
    g.beginPath();
    g.moveTo(0.03, cy);
    g.lineTo(Math.cos(a) * 1.4, cy + Math.sin(a) * 1.4);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (m.eye) {
    const a = hind ? 0.75 : -0.62, d = (hind ? 0.42 * m.hind : m.eyeAt * m.span), ex = Math.cos(a) * d, ey = cy + Math.sin(a) * d, s = hind ? 0.07 : 0.1;
    for (const [r, c] of [[s, INK.blue], [s * 0.62, INK.white], [s * 0.3, INK.blue]]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(ex, ey, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function drawMoth(cx, cy, size, open) {
  const m = S.moth || (S.moth = species(S.seed));
  g.save();
  g.translate(cx, cy);
  g.scale(size, size);
  for (const side of [1, -1]) {
    g.save();
    g.scale(side * open, 1);
    wing(m, true);
    wing(m, false);
    g.restore();
  }
  // Feelers, feathered on the males.
  g.strokeStyle = INK.white;
  g.lineCap = 'round';
  for (const side of [1, -1]) {
    g.lineWidth = 0.014;
    g.beginPath();
    g.moveTo(side * 0.03, -0.3);
    g.quadraticCurveTo(side * 0.16, -0.5, side * 0.34, -0.62);
    g.stroke();
    if (m.comb) {
      g.lineWidth = 0.008;
      for (let k = 0.2; k <= 1; k += 0.1) {
        const x = side * (0.03 + (0.34 - 0.03) * k * k * 0.6 + 0.26 * k * 0.4), y = -0.3 - 0.32 * k;
        g.beginPath();
        g.moveTo(x - side * 0.035, y - 0.03);
        g.lineTo(x, y);
        g.lineTo(x + side * 0.03, y + 0.045);
        g.stroke();
      }
    }
  }
  // Body: head, furry middle, and a ringed tail end.
  g.fillStyle = INK.white;
  g.shadowColor = 'rgba(238,243,246,0.45)';
  g.shadowBlur = 10;
  g.beginPath();
  g.ellipse(0, 0.2, 0.062, 0.3 * m.body, 0, 0, Math.PI * 2);
  g.ellipse(0, -0.1, 0.095, 0.15, 0, 0, Math.PI * 2);
  g.arc(0, -0.27, 0.058, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = INK.blue;
  g.lineWidth = 0.009;
  g.globalAlpha = 0.7;
  for (let y = 0.08; y < 0.2 + 0.3 * m.body - 0.04; y += 0.055) {
    g.beginPath();
    g.moveTo(-0.07, y);
    g.quadraticCurveTo(0, y + 0.02, 0.07, y);
    g.stroke();
  }
  g.restore();
}

// A bat hears in rings: one for every click, wider and fainter as it goes.
function drawRings() {
  const cx = W / 2, cy = H * 0.47, far = Math.max(W, H) * 0.6;
  for (const r of S.rings) {
    g.strokeStyle = INK.white;
    g.globalAlpha = (1 - r.age / 1.3) * (0.25 + 0.75 * r.near);
    g.lineWidth = 1 + r.near * 2.5;
    g.beginPath();
    g.arc(cx, cy, 14 + (r.age / 1.3) * far, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  // The bat itself, small, in the middle.
  const s = Math.min(W, H) * 0.11, flap = Math.sin(S.clock * (4 + S.near * 14)) * 0.18;
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.fillStyle = INK.white;
  for (const side of [1, -1]) {
    g.save();
    g.scale(side, 1);
    g.rotate(flap);
    g.beginPath();
    g.moveTo(0.1, -0.1);
    g.quadraticCurveTo(0.7, -0.75, 1.5, -0.25);
    g.quadraticCurveTo(1.2, -0.12, 1.12, 0.22);
    g.quadraticCurveTo(0.9, 0.0, 0.72, 0.26);
    g.quadraticCurveTo(0.52, 0.02, 0.34, 0.26);
    g.quadraticCurveTo(0.24, 0.1, 0.1, 0.16);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.ellipse(0, 0.04, 0.14, 0.26, 0, 0, Math.PI * 2);
  g.moveTo(-0.13, -0.2);
  g.lineTo(-0.1, -0.44);
  g.lineTo(-0.01, -0.24);
  g.lineTo(0.01, -0.24);
  g.lineTo(0.1, -0.44);
  g.lineTo(0.13, -0.2);
  g.closePath();
  g.fill();
  g.restore();
}

everyFrame(dt => {
  S.t += dt;
  S.clock += dt;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  paper();
  const size = Math.min(W * 0.4, H * 0.24);
  if (S.stage === 'home') {
    drawMoth(W / 2, H * 0.24, size * 0.8, 0.92 + 0.08 * Math.sin(S.clock * 2.2));
  } else if (S.stage === 'moth') {
    mothTick(dt);
    drawMoth(W / 2, H * 0.44, size, S.open);
    // Its breath: a line under it that shortens while it holds.
    g.fillStyle = S.gasping ? 'rgba(238,243,246,0.35)' : INK.white;
    g.fillRect(W / 2 - W * 0.22 * S.breath, H * 0.44 + size * 0.95, W * 0.44 * S.breath, 2);
  } else if (S.stage === 'mothEnd') {
    drawMoth(W / 2, H * 0.24, size * 0.8, 0.3);
  } else if (S.stage === 'bat') {
    batTick(dt);
    drawRings();
  }
});

// ---------- buttons and words ----------
function words() {
  $('specimen').textContent = fill(COPY.specimen, { n: String(S.seed).padStart(4, '0') });
  $('pitch').textContent = fill(COPY.pitch, { khz: (CHANNELS[S.channel] / 1000).toFixed(1) });
}
const lower = () => { S.channel = (S.channel + 1) % CHANNELS.length; words(); };
$('beMoth').onclick = beMoth;
$('beBat').onclick = beBat;
$('pitch').onclick = lower;
$('lower').onclick = lower;
$('caught').onclick = () => { S.pressing = false; calling(false); $('big').textContent = clock(S.flown); show('mothEnd'); };
$('mothAgain').onclick = () => { S.seed = 1 + Math.floor(Math.random() * 9998); S.moth = null; beMoth(); };
$('stop').onclick = () => { S.ear?.stop?.(); S.ear = null; show('home'); };
for (const id of ['title', 'rule', 'clear', 'beMoth', 'beBat', 'volume', 'breath', 'lower', 'caught', 'flewFor', 'eyes', 'stop']) $(id).textContent = COPY[id];
$('mothAgain').textContent = COPY.again;
words();
// If the page is put away, the moth stops calling.
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' && call) calling(false); });

// For checking without a microphone.
//   batmoth.fake(30)        pretends a bat hears the moth 30 decibels clear of the hiss
//   await batmoth.loop(-20) plays the real call into the real measuring code inside the page, at that volume
window.batmoth = {
  S,
  fake(over, hz = CHANNELS[0]) {
    S.fake = over === null ? null : { ok: true, highest: 24000, band: f => ({ over: f === hz ? over : 0 }) };
    if (S.ear && S.fake) S.ear = S.fake;
  },
  async loop(gainDb, hz = CHANNELS[0]) {
    const ctx = new AudioContext();
    await ctx.resume();
    const mix = ctx.createGain(), o = ctx.createOscillator(), v = ctx.createGain(), hiss = ctx.createBufferSource(), hv = ctx.createGain();
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    hiss.buffer = buf;
    hiss.loop = true;
    hv.gain.value = 0.002;                         // a quiet room
    o.frequency.value = hz;
    v.gain.value = 10 ** (gainDb / 20);
    o.connect(v).connect(mix);
    hiss.connect(hv).connect(mix);
    const ear = earFrom(ctx, mix);
    o.start();
    hiss.start();
    await new Promise(r => setTimeout(r, 700));
    const out = { state: ctx.state, rate: ctx.sampleRate, ...ear.band(hz), elsewhere: ear.band(hz === 16000 ? 12000 : 16000).over };
    ctx.close();
    return out;
  },
};
