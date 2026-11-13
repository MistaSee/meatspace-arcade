// Shake Duel: tilt to dodge, shake to punch, against a ladder of daft monsters.
import { COPY, pick, fill } from './copy.js';
import { createMotion, createSound, buzz } from '../../shared/motion.js';
import { getHall, submitScore, renderHall, rememberName, savedName } from '../../shared/hall.js';

// ---------- rules ----------
const GAME = 'shake-duel';
const MAX_HEARTS = 3;
const DODGE_TILT = 10;        // degrees of tilt that count as a dodge
const SHAKE_TIME = 1600;      // ms you get to punch
const SHAKE_FLOOR = 4;        // m/s² of movement that doesn't count as shaking
const FULL_POWER = 25;        // shake energy that fills the meter
const DAMAGE_PER_ENERGY = 3;
const POINTS = { dodge: 10, ko: 50 };

function foeStats(i) {
  const base = i < COPY.foes.length ? COPY.foes[i] : { ...COPY.moreSwans, name: fill(COPY.moreSwans.name, { n: i - COPY.foes.length + 2 }) };
  return {
    ...base,
    hp: 60 + i * 35 + Math.max(0, i - 6) * 25,
    window: Math.max(0.55, 1.25 - i * 0.1),    // seconds to get your dodge in
    feint: Math.min(0.4, Math.max(0, (i - 2) * 0.08)),
    swings: 1 + (i >= 4 ? 1 : 0),               // attacks before you get to punch
  };
}

const DEBUG = new URLSearchParams(location.search).has('debug');
const motion = createMotion();
const sound = createSound();
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- state ----------
let runId = 0;
let hearts = MAX_HEARTS, score = 0, beaten = 0, foeIndex = 0, foe = null, foeHp = 0;
let phase = 'title';          // title | intro | steady | dodge | shake | over
let energy = 0;
let carved = false;

const say = line => { $('line').textContent = line; };

function setPrompt(text, cls = '') {
  const p = $('prompt');
  p.textContent = text;
  p.className = '';
  void p.offsetWidth;
  p.className = ('big ' + cls).trim();
}

function updateHud() {
  const h = $('hearts');
  h.replaceChildren();
  for (let i = 0; i < MAX_HEARTS; i++) {
    const s = document.createElement('span');
    s.className = i < hearts ? 'on' : 'off';
    s.textContent = '♥';
    h.append(s);
  }
  h.setAttribute('aria-label', `${hearts} of ${MAX_HEARTS} hearts`);
  $('score').textContent = score;
  if (foe) $('foe-hp').firstElementChild.style.width = Math.max(0, foeHp / foe.hp) * 100 + '%';
}

// ---------- punches ----------
motion.onSample = ({ accel, dt }) => {
  if (phase !== 'shake') return;
  energy += Math.max(0, Math.min(40, accel) - SHAKE_FLOOR) * dt;
  $('power').firstElementChild.style.width = Math.min(100, (energy / FULL_POWER) * 100) + '%';
  if (accel > 12) sound.tone(90 + Math.min(300, accel * 8), 0.03, 'square', 0.02);
};

// ---------- one fight ----------
async function intro(run) {
  phase = 'intro';
  $('intro-number').textContent = fill(COPY.foeNumber, { n: foeIndex + 1 });
  $('intro-glyph').textContent = foe.glyph;
  $('intro-name').textContent = foe.name;
  $('intro-tagline').textContent = foe.tagline;
  $('intro-fight').textContent = '';
  $('intro').hidden = false;
  sound.tone(196, 0.3, 'sawtooth', 0.04);
  sound.tone(147, 0.4, 'sawtooth', 0.04, null, 0.3);
  await wait(2200);
  if (run !== runId) return;
  $('intro-fight').textContent = COPY.fight;
  sound.noise(0.3, 0.1, 0, 2000, 600);
  buzz(80);
  await wait(700);
  $('intro').hidden = true;
  $('foe').textContent = foe.glyph;
  $('foe').className = '';
  $('foe-label').textContent = fill(COPY.foeNumber, { n: foeIndex + 1 });
  $('foe-name').textContent = foe.name;
  updateHud();
}

// Wait for the phone to be still, then call that angle "level".
async function steady(run) {
  phase = 'steady';
  setPrompt(COPY.steady);
  const t0 = performance.now();
  await wait(400);
  while (run === runId && performance.now() - t0 < 1400 && motion.motionLive && motion.stillFor() < 300) await wait(50);
  motion.level();
}

// One incoming blow. Returns true if it hits you.
async function swing(run) {
  phase = 'dodge';
  let side = Math.random() < 0.5 ? 'left' : 'right';
  const show = () => {
    const away = side === 'left' ? 'right' : 'left';
    $('foe').className = 'lean-' + side;
    const s = $('strike');
    s.hidden = false;
    s.className = 'strike ' + side;
    s.textContent = side === 'left' ? '⟶' : '⟵';
    setPrompt(away === 'right' ? COPY.dodgeRight : COPY.dodgeLeft, 'danger');
  };
  show();
  say(fill(COPY.windUp, { name: foe.short.charAt(0).toUpperCase() + foe.short.slice(1), attack: foe.attack, side: COPY.sides[side] }));
  sound.noise(foe.window, 0.05, 0, 400, 1600);
  buzz(20);

  const ms = foe.window * 1000;
  if (Math.random() < foe.feint) {
    await wait(ms * 0.45);
    if (run !== runId) return false;
    side = side === 'left' ? 'right' : 'left';
    show();
    $('prompt').textContent = COPY.feint + ' ' + $('prompt').textContent;
    say(fill(COPY.feintLine, { side: COPY.sides[side] }));
    buzz([20, 30, 20]);
    sound.tone(660, 0.08, 'square', 0.04);
    await wait(ms * 0.55 + 150);           // a little extra time after a feint
  } else {
    await wait(ms);
  }
  if (run !== runId) return false;

  $('strike').hidden = true;
  $('foe').className = '';
  const tx = motion.read().x;
  const dodged = side === 'left' ? tx > DODGE_TILT : tx < -DODGE_TILT;
  if (dodged) {
    score += POINTS.dodge;
    setPrompt(pick(COPY.dodged));
    say('');
    sound.noise(0.25, 0.08, 0, 2500, 800);
    buzz(15);
  } else {
    hearts--;
    setPrompt('');
    say(fill(pick(COPY.hit), { attack: foe.attack, Attack: cap(foe.attack) }));
    sound.tone(110, 0.25, 'sawtooth', 0.07, 50);
    sound.noise(0.2, 0.12, 0, 600, 150);
    buzz([120, 40, 60]);
    const a = $('arena');
    a.classList.remove('hurt');
    void a.offsetWidth;
    a.classList.add('hurt');
    setTimeout(() => a.classList.remove('hurt'), 400);
  }
  updateHud();
  await wait(650);
  return !dodged;
}

// Your punch. Returns damage dealt.
async function punch(run) {
  phase = 'shake';
  energy = 0;
  $('power').classList.add('on');
  $('power').firstElementChild.style.width = '0%';
  setPrompt(COPY.shake);
  sound.tone(880, 0.12, 'square', 0.05);
  buzz(40);
  await wait(SHAKE_TIME);
  if (run !== runId) return 0;
  phase = 'resolve';
  $('power').classList.remove('on');
  const dmg = Math.round(energy * DAMAGE_PER_ENERGY);
  foeHp -= dmg;
  score += dmg;
  const d = $('dmg');
  d.textContent = dmg ? '-' + dmg : '0';
  d.className = '';
  void d.offsetWidth;
  d.className = 'show';
  $('foe').className = dmg ? 'recoil' : '';
  setPrompt('');
  say(fill(COPY.punch.find(([max]) => dmg < max)[1], { d: dmg }));
  if (dmg) {
    sound.noise(0.15, 0.16, 0, 900, 120);
    sound.tone(70 + Math.min(120, dmg), 0.2, 'square', 0.06, 40);
    buzz(Math.min(200, 30 + dmg * 2));
  }
  updateHud();
  await wait(900);
  $('foe').className = '';
  return dmg;
}

async function knockOut(run) {
  beaten++;
  score += POINTS.ko;
  $('foe').className = 'out';
  setPrompt(COPY.ko);
  say(foe.ko);
  [392, 523, 659, 784].forEach((f, i) => sound.tone(f, 0.16, 'triangle', 0.05, null, i * 0.1));
  buzz([50, 50, 50, 50, 150]);
  updateHud();
  await wait(2200);
  if (run !== runId) return;
  if (beaten % 2 === 0 && hearts < MAX_HEARTS) {
    hearts++;
    say(COPY.healed);
    updateHud();
    await wait(1200);
  }
}

async function fight(run) {
  for (foeIndex = 0; ; foeIndex++) {
    foe = foeStats(foeIndex);
    foeHp = foe.hp;
    await intro(run);
    if (run !== runId) return;
    while (foeHp > 0) {
      for (let s = 0; s < foe.swings; s++) {
        await steady(run);
        if (run !== runId) return;
        await swing(run);
        if (run !== runId) return;
        if (hearts <= 0) return gameOver();
      }
      await punch(run);
      if (run !== runId) return;
    }
    await knockOut(run);
    if (run !== runId) return;
  }
}

function gameOver() {
  phase = 'over';
  setPrompt('');
  sound.tone(220, 0.4, 'sawtooth', 0.06, 110);
  sound.tone(110, 0.7, 'sawtooth', 0.06, 40, 0.4);
  buzz([100, 60, 300]);
  $('over-glyph').textContent = foe.glyph;
  $('over-by').textContent = fill(COPY.overBy, { name: foe.name });
  $('over-epitaph').textContent = foe.beatYou;
  $('over-score').textContent = score;
  $('over-detail').textContent = fill(COPY.beatCount[Math.min(beaten, 2)], { n: beaten });
  $('name').value = savedName();
  $('carve').hidden = false;
  $('carved').hidden = true;
  carved = false;
  setTimeout(() => {
    $('over').hidden = false;
    $('over').scrollTop = 0;
    loadHall($('hall-over'));
  }, 900);
}

// ---------- Hall ----------
const hallOpts = { empty: COPY.hallEmpty, phoneOnly: COPY.phoneOnly };
async function loadHall(ol, highlight) {
  renderHall(ol, await getHall(GAME), { ...hallOpts, highlight });
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
  const res = await submitScore(GAME, { name, score, detail: fill(COPY.detail, { n: beaten, last: foe.short }) });
  $('carved').textContent = fill(COPY.carved, { rank: res.rank ?? '?' });
  $('carved').hidden = false;
  renderHall($('hall-over'), res, { ...hallOpts, highlight: res.id });
});

// ---------- start ----------
async function begin() {
  sound.unlock();
  await motion.start();
  runId++;
  hearts = MAX_HEARTS;
  score = 0;
  beaten = 0;
  $('title').hidden = true;
  $('over').hidden = true;
  $('arena').classList.remove('hurt');
  $('dmg').className = '';
  $('strike').hidden = true;
  $('power').classList.remove('on');
  setPrompt('');
  say('');
  updateHud();
  fight(runId);
}

function loop() {
  motion.read();
  if (DEBUG) {
    let d = document.querySelector('.debug');
    if (!d) { d = document.createElement('div'); d.className = 'debug'; document.body.append(d); }
    d.textContent = `tilt ${motion.tilt.x.toFixed(1)}  accel ${motion.accel.toFixed(1)}  energy ${energy.toFixed(1)}\nlive ${motion.live}/${motion.motionLive}  phase ${phase}`;
  }
  requestAnimationFrame(loop);
}

$('start').addEventListener('click', begin);
$('again').addEventListener('click', begin);
for (const node of document.querySelectorAll('[data-copy]')) node.textContent = COPY[node.dataset.copy];
$('name').placeholder = COPY.namePlaceholder;
$('how').replaceChildren(...COPY.how.map(line => {
  const p = document.createElement('p');
  p.textContent = line;
  return p;
}));
if (!motion.secure) {
  $('nosensors').innerHTML = COPY.noSensors;
  $('nosensors').hidden = false;
}
updateHud();
loadHall($('hall-title'));
requestAnimationFrame(loop);

// For automated checks only.
window.__duel = {
  motion,
  get phase() { return phase; },
  get state() { return { hearts, score, beaten, foeIndex, foeHp, energy }; },
  begin,
};
