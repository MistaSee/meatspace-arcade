// The Goblin King Demands: he names a colour, you run and find something that colour
// and fill the ring with it. Sometimes he wants a twirl, a bow or a jump as well.
import { COPY } from './copy.js';
import { createMotion, buzz } from '../../shared/motion.js';
import { createSfx } from '../../shared/sfx.js';
import { createFx } from '../../shared/fx.js';
import { openCamera, centreCrop } from '../../shared/camera.js';
import { mountOver, titleHall } from '../../shared/screens.js';
import { $, pick, fill, art, applyCopy, setPrompt, say, pop, flash, hearts, setScore, everyFrame, clamp } from '../../shared/juice.js';

// ---------- rules ----------
const GAME = 'goblin-king';
const TANTRUMS = 3;
const FIRST_TIME = 22;        // seconds for the first demand
const LAST_TIME = 9;          // it never gets shorter than this
const TIME_STEP = 1.5;        // seconds shorter each demand
const MATCH = 0.5;            // how much of the ring has to be the colour
const HOLD = 0.5;             // seconds it has to stay there
const WHIM_FROM = 2;          // demands before he starts adding whims
const WHIM_CHANCE = 0.5;
const POINTS = { found: 100, perSecond: 5, whim: 50 };

// Whims: what he asks for after the colour, how long you get, and how much counts.
const WHIMS = {
  twirl:  { time: 7, turn: 300 },         // degrees turned on the spot
  bow:    { time: 5, tilt: 40 },          // degrees the phone tips as you bow
  jump:   { time: 5, accel: 17 },         // m/s² when you land
  freeze: { time: 2.5, accel: 2.5, tilt: 8 },
};

const COLOURS = {
  red: '#ff3b3b', orange: '#ff9a1a', yellow: '#ffe04a', green: '#4ad66d', blue: '#4a9bff',
  purple: '#a45cff', pink: '#ff7ac8', white: '#ffffff', black: '#5a5a66',
};
const NAMES = Object.keys(COLOURS);
const KEY_COLOURS = { Digit1: 'red', Digit2: 'orange', Digit3: 'yellow', Digit4: 'green', Digit5: 'blue', Digit6: 'purple', Digit7: 'pink', Digit8: 'white', Digit9: 'black' };

// What colour a pixel is, in the King's opinion. null means "nothing in particular".
function classify(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max / 255, s = max ? d / max : 0;
  if (v < 0.2) return 'black';
  if (s < 0.16) return v > 0.78 ? 'white' : null;
  if (s < 0.3 && v < 0.5) return null;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  if (h < 12 || h >= 345) return s < 0.5 && v > 0.75 ? 'pink' : 'red';
  if (h < 38) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 165) return 'green';
  if (h < 255) return 'blue';
  if (h < 295) return 'purple';
  return 'pink';
}

const motion = createMotion();
const sfx = createSfx({
  demand: ['goblin1', 'goblin2', 'goblin3', 'goblin4', 'goblin5', 'goblin6', 'goblin7', 'goblin8'],
  happy: ['cute1', 'cute2', 'cute3', 'cute4', 'cute5'], cheer: ['jingle_pizza1', 'jingle_pizza2', 'jingle_pizza3'],
  angry: ['roar1', 'roar2', 'roar3', 'troll1', 'troll2'], crash: ['crash1', 'crash2', 'pot1', 'pot2'], boing: ['boing1', 'boing2', 'boing3'],
  tick: ['tick1', 'tick2'], ding: ['bell1', 'bell2'], rise: ['rise1', 'rise2'], whoosh: ['whoosh1', 'whoosh2', 'whoosh3'],
  step: ['step1', 'step2', 'step3', 'step4'], lose: 'jingle_sax1', over: 'say_game_over', coins: ['coins1', 'coins2', 'coins3'],
  fanfare: ['jingle_nes1', 'jingle_nes2'], burp: ['burp1', 'burp2'], gong: 'gong1',
});
const fx = createFx($('fx'), $('stage'));
const over = mountOver(GAME, COPY);
const setHearts = hearts($('hearts'), TANTRUMS);

// ---------- state ----------
let phase = 'title';          // title | announce | hunt | whim | happy | tantrum | over
let cam = null, fakeColour = null;
let patience = TANTRUMS, score = 0, met = 0, demand = 0;
let target = null, lastTarget = null, whim = null;
let timeLeft = 0, timeFull = 1, held = 0, clock = 0, darkFor = 0, nagAt = 0, lastTick = 0;
let whimStart = null, jumped = false, moved = 0;

const sample = document.createElement('canvas');
sample.width = sample.height = 24;
const sctx = sample.getContext('2d', { willReadFrequently: true });

// How much of the ring is the wanted colour (0 to 1), and how bright the picture is.
function look() {
  if (cam?.ok) {
    const crop = centreCrop($('feed'), Math.min(innerWidth, innerHeight) * 0.42);
    if (!crop) return { match: 0, bright: 1 };
    sctx.drawImage($('feed'), crop.x, crop.y, crop.size, crop.size, 0, 0, 24, 24);
  } else {
    sctx.fillStyle = fakeColour ? COLOURS[fakeColour] === '#5a5a66' ? '#111' : COLOURS[fakeColour] : '#777';
    sctx.fillRect(0, 0, 24, 24);
  }
  const px = sctx.getImageData(0, 0, 24, 24).data;
  let hit = 0, light = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (classify(px[i], px[i + 1], px[i + 2]) === target) hit++;
    light += Math.max(px[i], px[i + 1], px[i + 2]);
  }
  const n = px.length / 4;
  return { match: hit / n, bright: light / n / 255 };
}

function king(mood) {
  const k = $('king');
  k.className = mood === 'demand' ? '' : mood;
  k.replaceChildren(art('king-' + mood, '👑'));
}

function setTime() {
  const bar = $('time');
  bar.firstElementChild.style.width = clamp(timeLeft / timeFull, 0, 1) * 100 + '%';
  bar.classList.toggle('low', timeLeft < 5);
}

// ---------- one demand ----------
function nextDemand() {
  demand++;
  target = pick(NAMES.filter(c => c !== lastTarget));
  lastTarget = target;
  whim = demand > WHIM_FROM && Math.random() < WHIM_CHANCE ? pick(Object.keys(WHIMS)) : null;
  timeFull = timeLeft = Math.max(LAST_TIME, FIRST_TIME - (demand - 1) * TIME_STEP);
  held = 0;
  phase = 'announce';
  clock = 0;
  king('demand');
  $('stage').classList.remove('idle', 'hot');
  $('stage').style.setProperty('--target', COLOURS[target]);
  $('ring').style.setProperty('--c', COLOURS[target]);
  $('ring').style.setProperty('--p', 0);
  $('round').textContent = fill(COPY.demandNumber, { n: demand });
  $('wanted').textContent = COPY.colours[target];
  $('wanted').style.color = COLOURS[target];
  setPrompt(COPY.colours[target].toUpperCase() + '!');
  $('prompt').style.color = COLOURS[target];
  say(pick(COPY.preambles) + ' ' + fill(COPY.demand, { colour: COPY.colours[target] }));
  sfx.play('demand', { volume: 1 });
  sfx.play('gong', { volume: 0.4 });
  buzz(60);
  setTime();
}

function startWhim() {
  const w = WHIMS[whim];
  phase = 'whim';
  timeFull = timeLeft = w.time;
  whimStart = { ...motion.read() };
  motion.level();
  motion.resetTurn();
  jumped = false;
  moved = 0;
  clock = 0;
  $('stage').classList.add('idle');
  setPrompt(COPY.whims[whim].prompt, 'danger');
  $('prompt').style.color = '';
  say(COPY.whims[whim].line);
  sfx.play('boing', { volume: 0.9 });
  sfx.play('demand', { volume: 0.9, rate: 1.2 });
  buzz([40, 40, 40]);
}

function pleased() {
  const bonus = Math.round(timeLeft * POINTS.perSecond);
  score += POINTS.found + bonus + (whim ? POINTS.whim : 0);
  met++;
  phase = 'happy';
  clock = 0;
  king('happy');
  $('stage').classList.add('idle');
  setPrompt(pick(COPY.pleased), 'good');
  $('prompt').style.color = '';
  say(fill(pick(COPY.pleasedLines), { colour: COPY.colours[target] }));
  pop('+' + (POINTS.found + bonus + (whim ? POINTS.whim : 0)), 'dmg super', innerWidth / 2, innerHeight * 0.3);
  flash(COLOURS[target]);
  fx.confetti(90);
  fx.burst(innerWidth / 2, innerHeight * 0.47, 'holy', 50, 14);
  sfx.play('happy', { volume: 1 });
  sfx.play('cheer', { volume: 0.7, vary: 0 });
  sfx.play('coins', { volume: 0.8, delay: 0.2 });
  buzz([30, 30, 30, 30, 90]);
  setScore(score);
}

function tantrum(line) {
  patience--;
  phase = 'tantrum';
  clock = 0;
  king('angry');
  $('stage').classList.add('idle');
  setPrompt(pick(COPY.tantrum), 'danger');
  $('prompt').style.color = '';
  say(line);
  pop(pick(COPY.tantrum), 'word', innerWidth * 0.5, innerHeight * 0.3, 900);
  flash('#ff1a1a');
  fx.shake(24);
  fx.burst(80, 110, 'bad', 40, 12);
  sfx.play('angry', { volume: 1 });
  sfx.play('crash', { volume: 0.8, delay: 0.15 });
  buzz([150, 50, 150]);
  setHearts(patience);
}

function banished() {
  phase = 'over';
  setPrompt('');
  sfx.play('over', { volume: 1, vary: 0 });
  sfx.play('lose', { volume: 0.7, delay: 0.9, vary: 0 });
  over.show({
    picture: art('king-angry', '👑'),
    title: COPY.overTitle,
    line: pick(COPY.overLines),
    score,
    detail: fill(COPY.delivered[Math.min(met, 2)], { n: met }),
    hallDetail: fill(COPY.detail, { n: met }),
  });
}

motion.onSample = ({ accel }) => {
  if (phase !== 'whim') return;
  if (whim === 'jump' && clock > 0.3 && accel > WHIMS.jump.accel) jumped = true;
  if (whim === 'freeze' && clock > 0.4) moved = Math.max(moved, accel);
};

// ---------- every frame ----------
everyFrame((dt, now) => {
  const t = motion.read();
  clock += dt;
  if (phase === 'announce') {
    if (clock > 1.3) { phase = 'hunt'; nagAt = 6; }
  } else if (phase === 'hunt') {
    timeLeft -= dt;
    const { match, bright } = look();
    const level = clamp(match / MATCH, 0, 1);
    held = level >= 1 ? held + dt : Math.max(0, held - dt * 2);
    $('ring').style.setProperty('--p', clamp(level * 0.7 + (held / HOLD) * 0.3, 0, 1));
    $('stage').classList.toggle('hot', level >= 1);
    darkFor = cam?.ok && bright < 0.14 ? darkFor + dt : 0;
    if (darkFor > 2) { say(COPY.tooDark); darkFor = -4; }
    if (timeLeft < 5 && now - lastTick > 1000) { lastTick = now; sfx.play('tick', { volume: 0.9, rate: 1 + (5 - timeLeft) * 0.08 }); buzz(10); }
    if (clock > nagAt && level < 0.3) { nagAt = clock + 6; say(pick(COPY.hurry)); }
    setTime();
    if (held >= HOLD) {
      sfx.play('ding', { volume: 0.9 });
      if (whim) startWhim();
      else pleased();
    } else if (timeLeft <= 0) {
      tantrum(fill(pick(COPY.tantrumLines), { colour: COPY.colours[target] }));
    }
  } else if (phase === 'whim') {
    timeLeft -= dt;
    const w = WHIMS[whim];
    let done = false, failed = false, progress = 0;
    if (whim === 'twirl') { progress = motion.turned() / w.turn; done = progress >= 1; }
    else if (whim === 'bow') { progress = Math.abs(t.y) / w.tilt; done = progress >= 1; }
    else if (whim === 'jump') { done = jumped; }
    else if (whim === 'freeze') {
      const drift = Math.hypot(t.x, t.y);
      failed = clock > 0.4 && (moved > w.accel || drift > w.tilt);
      progress = clock / w.time;
      done = !failed && timeLeft <= 0;
    }
    $('ring').style.setProperty('--p', clamp(progress, 0, 1));
    setTime();
    if (done) pleased();
    else if (failed) tantrum(COPY.sawThat);
    else if (timeLeft <= 0) tantrum(fill(pick(COPY.whimFailLines), { whim: COPY.whimNames[whim] }));
  } else if (phase === 'happy') {
    if (clock > 2.2) nextDemand();
  } else if (phase === 'tantrum') {
    if (clock > 2.6) { if (patience <= 0) banished(); else nextDemand(); }
  }
});

// ---------- start ----------
async function begin() {
  sfx.unlock();
  await motion.start();
  if (!cam) {
    cam = await openCamera($('feed'), { facing: 'environment' });
    $('feed').hidden = !cam.ok;
    $('fake').hidden = cam.ok;
  }
  patience = TANTRUMS;
  score = 0;
  met = 0;
  demand = 0;
  lastTarget = null;
  setHearts(patience);
  setScore(0);
  $('title').hidden = true;
  over.hide();
  sfx.play('fanfare', { volume: 0.8, vary: 0 });
  nextDemand();
}

// Without a camera, number keys hold up a colour.
addEventListener('keydown', e => {
  if (KEY_COLOURS[e.code]) { fakeColour = KEY_COLOURS[e.code]; $('fake').style.background = COLOURS[fakeColour]; }
  if (e.code === 'KeyB' && phase === 'whim') motion.tilt.y = 60;
});
addEventListener('keyup', e => {
  if (KEY_COLOURS[e.code]) { fakeColour = null; $('fake').style.background = '#333'; }
});

applyCopy(COPY);
$('title-art').replaceChildren(art('king-demand', '👑', 'hero-art'));
king('demand');
if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
  $('nocamera').innerHTML = COPY.noCamera;
  $('nocamera').hidden = false;
}
$('start').addEventListener('click', begin);
over.onAgain(begin);
titleHall($('hall-title'), GAME, COPY);

// For automated checks only.
window.__king = {
  motion,
  classify,
  begin,
  show(colour) { fakeColour = colour; $('fake').style.background = colour ? COLOURS[colour] : '#333'; },
  get state() { return { phase, target, whim, patience, score, met, demand, timeLeft, held, camera: !!cam?.ok }; },
};
