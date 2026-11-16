// Searchlight: creep across a dark room without being caught in the beam.
//
// The game is made of real light. The guard's phone is the searchlight: hold the lens on its
// screen and the phone's own lamp comes on, for a few seconds at a time. Everyone else holds
// their phone flat on their chest with its back camera facing out, and that camera is watching
// for the beam. If the beam lands on it, the phone screams and lights up, and its owner goes
// back to the wall. Touch the guard to win.
//
// The phones do not talk to each other. A creeper's phone simply notices a sudden bright light.
import { createSfx } from '../../shared/sfx.js';
import { openCamera } from '../../shared/camera.js';
import { everyFrame, fill, clamp } from '../../shared/juice.js';

// The pieces still being tuned are fetched fresh on every visit.
const fresh = new URL(import.meta.url).search;
const [{ COPY }, { hasTorch, setTorch, keepAwake }] = await Promise.all(['./copy.js', '../../shared/lamp.js'].map(file => import(file + fresh)));

// ---------- rules ----------
const BURN = 3;                // seconds the lamp lasts from full
const REFILL = 5;              // seconds to fill up again from empty
const RELIGHT = 0.3;           // how full it must be before it will light again
const JUMP = 45;               // how much brighter than a moment ago counts as the beam (out of 255)
const HOT = 0.06;              // or: this share of the camera's picture gone to pure white
const FRAMES = 2;              // pictures in a row that must agree, so one flicker cannot catch you
const SETTLE = 20;             // pictures to watch after arming before anything can catch you
const CAUGHT_FOR = 7;          // seconds to walk back to the wall before the phone arms itself again
const STOP_HOLD = 1.2;         // seconds to hold the stop button, so a brush against your chest cannot press it

const $ = id => document.getElementById(id);
const canvas = $('view'), g = canvas.getContext('2d');
const video = $('cam');
const tiny = document.createElement('canvas');
tiny.width = 32;
tiny.height = 24;
const tctx = tiny.getContext('2d', { willReadFrequently: true });
const sfx = createSfx({ scream: ['scream1', 'scream2'], alarm: 'alarm2', switch: 'click2', bell: 'bell2' });

const S = {
  stage: 'home', t: 0, clock: 0, cam: null, lamp: false, fake: null, lastFrame: -1,
  charge: 1, on: false, pressing: false, cooling: false, held: 0,
  level: 0, base: 0, hot: 0, hits: 0, settle: 0, sawIt: 0, caught: 0, stopHeld: -1,
};
let W = 0, H = 0, dpr = 1;

function show(stage) {
  S.stage = stage;
  S.t = 0;
  for (const el of document.querySelectorAll('section')) el.classList.toggle('on', el.id === stage);
}

// ---------- sound made here: pips, and the hum of the lamp ----------
let audio = null, hum = null;
function sound() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { audio = null; }
  return audio;
}
function pip(freq, dur = 0.09) {
  if (!sound()) return;
  const o = audio.createOscillator(), v = audio.createGain();
  o.frequency.value = freq;
  v.gain.setValueAtTime(0.16, audio.currentTime);
  v.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
  o.connect(v).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + dur);
}
function setHum(on) {
  if (!sound()) return;
  if (on && !hum) {
    const o = audio.createOscillator(), f = audio.createBiquadFilter(), v = audio.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 100;
    f.type = 'lowpass';
    f.frequency.value = 420;
    v.gain.value = 0.07;
    o.connect(f).connect(v).connect(audio.destination);
    o.start();
    hum = o;
  } else if (!on && hum) {
    hum.stop();
    hum = null;
  }
}

// ---------- the guard ----------
async function beGuard() {
  sfx.unlock();
  sound();
  keepAwake();
  if (!S.fake) {
    S.cam = await openCamera(video, { facing: 'environment', width: 160, height: 120 });
    if (!S.cam.ok) { $('homeNote').textContent = COPY.noCamera; return; }
    await new Promise(r => setTimeout(r, 400));          // phones need a moment before they admit to having a lamp
    S.lamp = hasTorch(S.cam);
  } else {
    S.lamp = true;
  }
  $('guardNote').textContent = S.lamp ? '' : COPY.noLamp;
  S.charge = 1;
  S.held = 0;
  show('guard');
}

function lamp(on) {
  if (on === S.on) return;
  S.on = on;
  if (!S.fake) setTorch(S.cam, on);
  setHum(on);
  sfx.play('switch', { volume: 0.7, rate: on ? 1 : 0.8 });
}

function guardTick(dt) {
  S.held += dt;
  if (S.on) S.charge = Math.max(0, S.charge - dt / BURN);
  else S.charge = Math.min(1, S.charge + dt / REFILL);
  if (S.charge <= 0) S.cooling = true;
  if (S.charge >= RELIGHT) S.cooling = false;
  lamp(S.pressing && !S.cooling && (S.on || S.charge >= RELIGHT));
  $('clock').textContent = clock(S.held);
  $('lampWord').textContent = S.cooling ? COPY.cooling : S.on ? '' : COPY.holdLamp;
}
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

canvas.addEventListener('pointerdown', () => { if (S.stage === 'guard') S.pressing = true; });
for (const lift of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(lift, () => { S.pressing = false; });

// ---------- a creeper ----------
async function beCreeper() {
  sfx.unlock();
  sound();
  keepAwake();
  if (!S.fake) {
    S.cam = await openCamera(video, { facing: 'environment', width: 160, height: 120 });
    if (!S.cam.ok) { $('homeNote').textContent = COPY.noCamera; return; }
  }
  S.settle = SETTLE;
  S.sawIt = 0;
  show('creepTest');
}

// Look through the camera. True when the beam has just landed on it.
function look() {
  let level, hot;
  if (S.fake) {
    ({ level, hot } = S.fake);
  } else {
    if (!video.videoWidth || video.currentTime === S.lastFrame) return false;       // no new picture yet
    S.lastFrame = video.currentTime;
    tctx.drawImage(video, 0, 0, 32, 24);
    const px = tctx.getImageData(0, 0, 32, 24).data;
    let sum = 0, white = 0;
    for (let i = 0; i < px.length; i += 4) {
      const m = Math.max(px[i], px[i + 1], px[i + 2]);
      sum += (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      if (m > 235) white++;
    }
    level = sum / 768;
    hot = white / 768;
  }
  S.level = level;
  S.hot = hot;
  if (S.settle > 0) { S.settle--; S.base = level; S.hits = 0; return false; }
  const lit = (level - S.base > JUMP && level > S.base * 1.8 + 5) || hot > HOT;
  S.hits = lit ? S.hits + 1 : 0;
  // What "dark" looks like drifts slowly, and never learns from the beam itself.
  if (!lit) S.base += (level - S.base) * 0.03;
  return S.hits === FRAMES;
}

function caught() {
  S.caught++;
  S.lastPip = -1;
  $('tally').textContent = S.caught === 1 ? COPY.caughtOnce : fill(COPY.caughtTimes, { n: S.caught });
  sfx.play('scream', { volume: 1 });
  sfx.play('alarm', { volume: 0.8, delay: 0.25 });
  navigator.vibrate?.([300, 100, 300, 100, 500]);
  show('caught');
}

function arm() {
  S.settle = SETTLE;
  S.hits = 0;
  show('armed');
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

// A beam swinging slowly across the dark, behind the title.
function beam() {
  const a = Math.sin(S.clock * 0.5) * 0.7, len = H * 1.3, x = W / 2, y = -H * 0.08;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const fade = g.createLinearGradient(0, 0, 0, len);
  fade.addColorStop(0, 'rgba(255,181,46,0.34)');
  fade.addColorStop(1, 'rgba(255,181,46,0)');
  g.fillStyle = fade;
  g.beginPath();
  g.moveTo(-6, 0);
  g.lineTo(6, 0);
  g.lineTo(len * 0.26, len);
  g.lineTo(-len * 0.26, len);
  g.closePath();
  g.fill();
  g.restore();
}

// The guard's lamp: a ridged glass lens in a riveted housing, with a ring showing how long it has left.
function lens() {
  const cx = W / 2, cy = H * 0.47, R = Math.min(W * 0.36, H * 0.23), on = S.on;
  if (on) {
    const spill = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 3.2);
    spill.addColorStop(0, 'rgba(255,200,90,0.5)');
    spill.addColorStop(1, 'rgba(255,181,46,0)');
    g.fillStyle = spill;
    g.fillRect(0, 0, W, H);
  }
  g.fillStyle = '#161006';
  g.beginPath();
  g.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillStyle = '#2e2210';
    g.beginPath();
    g.arc(cx + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06, R * 0.022, 0, Math.PI * 2);
    g.fill();
  }
  const glass = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  if (on) { glass.addColorStop(0, '#fffdf0'); glass.addColorStop(0.35, '#ffe08a'); glass.addColorStop(1, '#c47a08'); }
  else { glass.addColorStop(0, '#3a2706'); glass.addColorStop(1, '#120b02'); }
  g.fillStyle = glass;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  // The ridges of the glass: each ring dark on one side and catching the light on the other.
  for (let r = R * 0.14; r < R; r += R * 0.085) {
    g.lineWidth = 1.4;
    g.strokeStyle = on ? 'rgba(122,74,5,0.5)' : 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = on ? 'rgba(255,255,255,0.75)' : 'rgba(255,190,80,0.28)';
    g.beginPath();
    g.arc(cx, cy, r - 1.6, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
  }
  // How long the lamp has left.
  g.lineCap = 'butt';
  g.lineWidth = R * 0.07;
  g.strokeStyle = '#2a1c04';
  g.beginPath();
  g.arc(cx, cy, R * 1.26, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = S.cooling ? '#7a2a10' : '#ffb52e';
  g.beginPath();
  g.arc(cx, cy, R * 1.26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * S.charge);
  g.stroke();
}

// The creeper's test: a light meter, so you can see the phone notice the lamp before you trust it.
function meter() {
  const x = W / 2, top = H * 0.3, tall = H * 0.36, wide = 26;
  g.strokeStyle = '#5c3d08';
  g.lineWidth = 2;
  g.strokeRect(x - wide / 2, top, wide, tall);
  const high = clamp(S.level / 255, 0, 1) * tall, base = clamp(S.base / 255, 0, 1) * tall;
  g.fillStyle = S.sawIt > 0 ? '#fff' : '#ffb52e';
  g.fillRect(x - wide / 2 + 3, top + tall - high, wide - 6, high);
  g.fillStyle = '#c98a1c';
  g.fillRect(x - wide / 2 - 10, top + tall - base - 1, wide + 20, 2);
}

everyFrame(dt => {
  S.t += dt;
  S.clock += dt;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);

  if (S.stage === 'home') {
    beam();
  } else if (S.stage === 'guard') {
    guardTick(dt);
    lens();
  } else if (S.stage === 'creepTest') {
    S.sawIt = Math.max(0, S.sawIt - dt);
    if (look()) { S.sawIt = 1.6; pip(990, 0.25); navigator.vibrate?.(120); }
    if (S.sawIt > 0) { g.fillStyle = `rgba(255,181,46,${S.sawIt * 0.3})`; g.fillRect(0, 0, W, H); }
    meter();
    $('lampWord2').textContent = S.sawIt > 0 ? COPY.sawIt : '';
  } else if (S.stage === 'creepCount') {
    const left = 5 - Math.floor(S.t);
    if ($('count').textContent !== String(left) && left > 0) { $('count').textContent = left; pip(520); }
    if (S.t >= 5) { pip(260, 0.3); arm(); }
  } else if (S.stage === 'armed') {
    // Black. Nothing on the screen that could give you away.
    if (look()) caught();
    if (S.stopHeld >= 0) { S.stopHeld += dt; if (S.stopHeld >= STOP_HOLD) { S.stopHeld = -1; S.settle = SETTLE; show('creepTest'); } }
  } else if (S.stage === 'caught') {
    // First a strobe nobody can miss, then a steady glow that marks you out while you walk back.
    g.fillStyle = S.t < 2.5 ? (Math.floor(S.t * 12) % 2 ? '#fff' : '#ffb52e') : '#c98a1c';
    g.fillRect(0, 0, W, H);
    const left = Math.ceil(CAUGHT_FOR - S.t);
    if (left <= 3 && left !== S.lastPip) { S.lastPip = left; pip(520); }
    if (S.t >= CAUGHT_FOR) { pip(260, 0.3); arm(); }
  }
});

// ---------- buttons and words ----------
$('beGuard').onclick = beGuard;
$('beCreeper').onclick = beCreeper;
$('touched').onclick = () => {
  S.pressing = false;
  lamp(false);
  $('big').textContent = clock(S.held);
  sfx.play('bell', { volume: 0.8 });
  show('guardEnd');
};
$('guardAgain').onclick = () => { S.charge = 1; S.held = 0; S.cooling = false; show('guard'); };
$('arm').onclick = () => { $('count').textContent = ''; S.caught = 0; show('creepCount'); };
$('stop').addEventListener('pointerdown', () => { S.stopHeld = 0; });
for (const lift of ['pointerup', 'pointercancel', 'pointerleave']) $('stop').addEventListener(lift, () => { S.stopHeld = -1; });

for (const id of ['rule', 'beGuard', 'beCreeper', 'touched', 'heldFor', 'testFirst', 'chest', 'arm', 'backToWall']) $(id).textContent = COPY[id];
$('title').innerHTML = COPY.title.replace(' ', '<br>');
$('guardAgain').textContent = COPY.again;
$('stop').textContent = COPY.holdStop;
$('caughtWord').textContent = COPY.caught;
// If the page is put away with the lamp on, switch it off.
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') { S.pressing = false; lamp(false); } });

// For checking without a camera: searchlight.fake(20) pretends the camera sees that brightness (0 to 255).
window.searchlight = {
  S,
  fake(level, hot = 0) { S.fake = level === null ? null : { level, hot }; },
};
