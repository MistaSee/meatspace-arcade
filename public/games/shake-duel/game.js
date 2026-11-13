// Shake Duel: tilt to dodge, shake to punch, against a ladder of opponents
// who each fight dirty in their own way.
import { COPY, pick, fill } from './copy.js';
import { createMotion, createSound, buzz } from '../../shared/motion.js';
import { getHall, submitScore, renderHall, rememberName, savedName } from '../../shared/hall.js';

// ---------- rules ----------
const GAME = 'shake-duel';
const MAX_HEARTS = 3;
const DODGE_TILT = 10;        // degrees of tilt that count as a dodge
const SHAKE_FLOOR = 4;        // m/s² of movement that doesn't count as shaking
const DAMAGE_PER_ENERGY = 3;
const POINTS = { dodge: 10, ko: 50 };

// Freeze: how much movement gives you away.
const FREEZE_GRACE = 300;     // ms to stop moving after FREEZE appears
const FREEZE_ACCEL = 3;       // m/s²
const FREEZE_TILT = 8;        // degrees

// Gentle shakes: harder than this and the custard sets.
const TICKLE_FLOOR = 2;
const TICKLE_MAX = 13;
const TICKLE_BONUS = 2.5;

// How long you get to punch, and how much shaking fills the meter.
const PUNCHES = {
  shake:  { time: 1600, full: 25 },
  tickle: { time: 2200, full: 25 },
  pump:   { time: 3600, full: 60 },
};

// What each opponent does. Words live in copy.js under the same id.
//   moves:  attacks it picks from (side, vertical, freeze, hide)
//   punch:  shake | tickle | pump
//   swings: attacks before you get to punch
//   hp, window: multipliers on the usual numbers; dodgeTime: fixed seconds instead
const LADDER = {
  gary:     { trick: 'plain', feint: 0 },
  bin:      { trick: 'feint', feint: 0.3 },
  cheese:   { trick: 'vertical', moves: ['side', 'vertical', 'vertical'] },
  rock:     { trick: 'rock', swings: 0, hp: 0.6 },
  trifle:   { trick: 'tickle', punch: 'tickle' },
  checkout: { trick: 'freeze', moves: ['side', 'freeze', 'freeze'] },
  door:     { trick: 'reverse', reverse: true, feint: 0 },
  alarm:    { trick: 'flurry', swings: 3, flurry: true, dodgeTime: 0.85, hp: 0.6, feint: 0 },
  ghost:    { trick: 'hide', moves: ['side', 'hide', 'hide'] },
  castle:   { trick: 'pump', punch: 'pump', hp: 1.5 },
  council:  { trick: 'everything', moves: ['side', 'vertical', 'freeze', 'hide'], swings: 2 },
};

// Made-up opponents after the council get one trick each, at random.
const ENDLESS = [
  { trick: 'plain' },
  { trick: 'feint', feint: 0.4 },
  { trick: 'vertical', moves: ['side', 'vertical'] },
  { trick: 'tickle', punch: 'tickle' },
  { trick: 'freeze', moves: ['side', 'freeze'] },
  { trick: 'reverse', reverse: true, feint: 0 },
  { trick: 'flurry', swings: 3, flurry: true, dodgeTime: 0.8, hp: 0.6, feint: 0 },
  { trick: 'hide', moves: ['side', 'hide'] },
  { trick: 'pump', punch: 'pump', hp: 1.4 },
];

const article = word => (/^[AEIOU]/i.test(word) ? 'An' : 'A');

let lastThing = null;
function endlessFoe() {
  const E = COPY.endless;
  const thing = pick(E.things.filter(t => t !== lastThing));
  lastThing = thing;
  const noun = thing.noun, lower = noun.toLowerCase();
  const adj = pick(E.adjectives), tail = pick(E.tails);
  const name = Math.random() < 0.5
    ? fill(E.name, { A: article(adj), adj, noun })
    : fill(E.nameTail, { A: article(noun), noun, tail });
  const rules = pick(ENDLESS);
  return {
    glyph: thing.glyph,
    name,
    short: fill(E.short, { noun: lower }),
    tagline: E.tagline,
    rule: COPY.rules[rules.trick],
    attack: thing.attack,
    ko: fill(pick(E.ko), { noun: lower }),
    beatYou: fill(E.beatYou, { name: name.charAt(0).toLowerCase() + name.slice(1) }),
    rules,
  };
}

function foeStats(i) {
  const named = COPY.foes[i];
  const base = named ? { ...named, rules: LADDER[named.id] } : endlessFoe();
  const r = base.rules;
  return {
    ...base,
    trick: r.trick,
    moves: r.moves || ['side'],
    punch: r.punch || 'shake',
    reverse: !!r.reverse,
    flurry: !!r.flurry,
    swings: r.swings ?? (i >= 4 ? 2 : 1),
    hp: Math.round((60 + i * 35 + Math.max(0, i - 6) * 25) * (r.hp ?? 1)),
    window: r.dodgeTime ?? Math.max(0.55, 1.25 - i * 0.07) * (r.window ?? 1),   // seconds to get your dodge in
    feint: r.feint ?? Math.min(0.35, Math.max(0, (i - 1) * 0.06)),
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
let phase = 'title';          // title | intro | steady | dodge | freeze | hide | shake | resolve | over
let energy = 0, solidTime = 0, lastSolid = 0;
let freezeSince = 0, freezeMoved = 0;
let carved = false;

const say = line => { $('line').textContent = line; };

function setPrompt(text, cls = '') {
  const p = $('prompt');
  p.textContent = text;
  p.className = '';
  void p.offsetWidth;
  p.className = ('big ' + cls + (text.length > 8 ? ' long' : '')).trim();
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

// ---------- sensing ----------
motion.onSample = ({ accel, dt, now }) => {
  if (phase === 'freeze') {
    if (now - freezeSince > FREEZE_GRACE) freezeMoved = Math.max(freezeMoved, accel);
    return;
  }
  if (phase !== 'shake') return;
  if (foe.punch === 'tickle') {
    if (accel > TICKLE_MAX) {
      energy = Math.max(0, energy - (accel - TICKLE_MAX) * dt * 1.5);
      solidTime += dt;
      lastSolid = now;
      sound.tone(60, 0.05, 'square', 0.04);
    } else {
      energy += Math.max(0, accel - TICKLE_FLOOR) * dt * TICKLE_BONUS;
      if (accel > 5) sound.tone(500 + accel * 40, 0.03, 'sine', 0.02);
    }
  } else {
    energy += Math.max(0, Math.min(40, accel) - SHAKE_FLOOR) * dt;
    if (accel > 12) sound.tone(90 + Math.min(300, accel * 8), 0.03, 'square', 0.02);
  }
  $('power').firstElementChild.style.width = Math.min(100, (energy / PUNCHES[foe.punch].full) * 100) + '%';
};

// ---------- one fight ----------
async function intro(run) {
  phase = 'intro';
  $('intro-number').textContent = fill(COPY.foeNumber, { n: foeIndex + 1 });
  $('intro-glyph').textContent = foe.glyph;
  $('intro-name').textContent = foe.name;
  $('intro-tagline').textContent = foe.tagline;
  $('intro-rule').textContent = foe.rule;
  $('intro-fight').textContent = '';
  $('intro').hidden = false;
  sound.tone(196, 0.3, 'sawtooth', 0.04);
  sound.tone(147, 0.4, 'sawtooth', 0.04, null, 0.3);
  await wait(3600);
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
  $('foe-rule').textContent = foe.rule;
  updateHud();
}

// Wait for the phone to be face up and still, then call that angle "level".
async function steady(run, longest = 1400) {
  phase = 'steady';
  if (motion.faceDown()) {
    setPrompt(COPY.flipBack);
    const t = performance.now();
    while (run === runId && motion.faceDown() && performance.now() - t < 6000) await wait(50);
  }
  setPrompt(COPY.steady);
  const t0 = performance.now();
  await wait(Math.min(400, longest));
  while (run === runId && performance.now() - t0 < longest && motion.motionLive && motion.stillFor() < 300) await wait(50);
  motion.level();
}

function hurt(line) {
  hearts--;
  setPrompt('');
  say(line);
  sound.tone(110, 0.25, 'sawtooth', 0.07, 50);
  sound.noise(0.2, 0.12, 0, 600, 150);
  buzz([120, 40, 60]);
  const a = $('arena');
  a.classList.remove('hurt');
  void a.offsetWidth;
  a.classList.add('hurt');
  setTimeout(() => a.classList.remove('hurt'), 400);
  updateHud();
}

function escaped(lines) {
  score += POINTS.dodge;
  setPrompt(pick(lines));
  say('');
  sound.noise(0.25, 0.08, 0, 2500, 800);
  buzz(15);
  updateHud();
}

const AWAY = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const ARROW = { left: '←', right: '→', top: '↑', bottom: '↓' };
const STRIKE = { left: '⟶', right: '⟵', top: '⇓', bottom: '⇑' };

// One incoming blow from the side, or from above or below. Returns true if it hits you.
async function swing(run, kind) {
  phase = 'dodge';
  const sides = kind === 'vertical' ? ['top', 'bottom'] : ['left', 'right'];
  let side = pick(sides);
  // The door lies: everything it shows you is the wrong way round.
  const show = () => {
    const shown = foe.reverse ? AWAY[side] : side;
    $('foe').className = 'lean-' + shown;
    const s = $('strike');
    s.hidden = false;
    s.className = 'strike ' + shown;
    s.textContent = STRIKE[shown];
    setPrompt(fill(foe.reverse ? COPY.push : COPY.dodge, { arrow: ARROW[AWAY[shown]] }), 'danger');
    say(fill(COPY.windUp, { Name: cap(foe.short), attack: foe.attack, side: COPY.sides[shown] }));
  };
  show();
  if (foe.flurry) {
    sound.tone(3100, 0.07, 'square', 0.035);
    sound.tone(3100, 0.07, 'square', 0.035, null, 0.12);
  } else {
    sound.noise(foe.window, 0.05, 0, 400, 1600);
  }
  buzz(20);

  const ms = foe.window * 1000;
  if (Math.random() < foe.feint) {
    await wait(ms * 0.45);
    if (run !== runId) return false;
    side = AWAY[side];
    show();
    $('prompt').textContent = COPY.feint + ' ' + $('prompt').textContent;
    say(fill(COPY.feintLine, { side: COPY.sides[foe.reverse ? AWAY[side] : side] }));
    buzz([20, 30, 20]);
    sound.tone(660, 0.08, 'square', 0.04);
    await wait(ms * 0.55 + 150);           // a little extra time after a feint
  } else {
    await wait(ms);
  }
  if (run !== runId) return false;

  $('strike').hidden = true;
  $('foe').className = '';
  const t = motion.read();
  const dodged = { left: t.x > DODGE_TILT, right: t.x < -DODGE_TILT, top: t.y > DODGE_TILT, bottom: t.y < -DODGE_TILT }[side];
  if (dodged) escaped(COPY.dodged);
  else hurt(fill(pick(COPY.hit), { attack: foe.attack, Attack: cap(foe.attack) }));
  await wait(foe.flurry ? 350 : 650);
  return !dodged;
}

// Hold perfectly still while it looks for you. Moving gets you caught at once.
async function freeze(run) {
  phase = 'freeze';
  freezeSince = performance.now();
  freezeMoved = 0;
  const start = { ...motion.read() };
  $('foe').className = 'scan';
  setPrompt(COPY.freeze, 'danger');
  say(fill(COPY.freezeLine, { Name: cap(foe.short) }));
  const ms = 1400 + foe.window * 600;
  sound.tone(220, ms / 1000, 'sine', 0.025);
  buzz(30);
  let caught = false;
  while (run === runId && performance.now() - freezeSince < ms) {
    await wait(50);
    const t = motion.read();
    if (performance.now() - freezeSince < FREEZE_GRACE) { start.x = t.x; start.y = t.y; continue; }
    if (freezeMoved > FREEZE_ACCEL || Math.hypot(t.x - start.x, t.y - start.y) > FREEZE_TILT) { caught = true; break; }
  }
  if (run !== runId) return false;
  phase = 'resolve';
  $('foe').className = '';
  if (caught) {
    sound.tone(880, 0.1, 'square', 0.05);
    sound.tone(880, 0.1, 'square', 0.05, null, 0.15);
    hurt(pick(COPY.moved));
  } else {
    escaped(COPY.frozen);
  }
  await wait(750);
  return caught;
}

// Turn the phone face down so it can't see you. The phone buzzes once when you're hidden,
// because you can't see the screen.
async function hide(run) {
  phase = 'hide';
  $('foe').className = 'lean-top';
  setPrompt(COPY.hide, 'danger');
  say(COPY.hideLine);
  sound.noise(0.6, 0.06, 0, 300, 1200);
  buzz([40, 40, 40]);
  const ms = foe.window * 1000 + 1100;
  const t0 = performance.now();
  let wasDown = false;
  while (run === runId && performance.now() - t0 < ms) {
    await wait(50);
    const down = motion.faceDown();
    if (down && !wasDown) { buzz(30); sound.tone(330, 0.12, 'sine', 0.04); }
    wasDown = down;
  }
  if (run !== runId) return false;
  phase = 'resolve';
  $('foe').className = '';
  const safe = motion.faceDown();
  if (safe) {
    escaped(COPY.hidden);
    buzz([30, 80, 30]);
  } else {
    hurt(pick(COPY.found));
  }
  await wait(800);
  return !safe;
}

// Your punch. Returns damage dealt.
async function punch(run) {
  const P = PUNCHES[foe.punch];
  phase = 'shake';
  energy = 0;
  solidTime = 0;
  lastSolid = 0;
  $('power').classList.add('on');
  $('power').classList.toggle('gentle', foe.punch === 'tickle');
  $('power').firstElementChild.style.width = '0%';
  const label = { shake: COPY.shake, tickle: COPY.tickle, pump: COPY.pump }[foe.punch];
  setPrompt(label);
  sound.tone(880, 0.12, 'square', 0.05);
  buzz(40);
  const t0 = performance.now();
  while (run === runId && performance.now() - t0 < P.time) {
    await wait(50);
    if (foe.punch === 'tickle') {
      const solid = performance.now() - lastSolid < 400;
      $('prompt').textContent = solid ? COPY.tooHard : label;
      $('prompt').classList.toggle('danger', solid);
    }
  }
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
  const lines = foe.punch === 'tickle' ? COPY.wobble : COPY.punch;
  const line = foe.punch === 'tickle' && solidTime > 0.4 ? COPY.wentSolid : lines.find(([max]) => dmg < max)[1];
  say(fill(line, { d: dmg }));
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
  await wait(2400);
  if (run !== runId) return;
  if (beaten % 2 === 0 && hearts < MAX_HEARTS) {
    hearts++;
    say(COPY.healed);
    updateHud();
    await wait(1200);
  }
}

async function fight(run, from) {
  for (foeIndex = from; ; foeIndex++) {
    foe = foeStats(foeIndex);
    foeHp = foe.hp;
    await intro(run);
    if (run !== runId) return;
    while (foeHp > 0) {
      for (let s = 0; s < foe.swings; s++) {
        await steady(run, foe.flurry && s > 0 ? 450 : 1400);
        if (run !== runId) return;
        const kind = pick(foe.moves);
        if (kind === 'freeze') await freeze(run);
        else if (kind === 'hide') await hide(run);
        else await swing(run, kind);
        if (run !== runId) return;
        if (hearts <= 0) return gameOver();
      }
      if (!foe.swings) {
        say(pick(foe.idle));
        await wait(1000);
        if (run !== runId) return;
      } else if (motion.faceDown()) {
        await steady(run, 400);
        if (run !== runId) return;
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
async function begin(from = 0) {
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
  for (const id of ['foe', 'foe-label', 'foe-name', 'foe-rule']) $(id).textContent = '';
  foe = null;
  setPrompt('');
  say('');
  updateHud();
  fight(runId, from);
}

function loop() {
  motion.read();
  if (DEBUG) {
    let d = document.querySelector('.debug');
    if (!d) { d = document.createElement('div'); d.className = 'debug'; document.body.append(d); }
    d.textContent = `tilt ${motion.tilt.x.toFixed(1)} ${motion.tilt.y.toFixed(1)}  accel ${motion.accel.toFixed(1)}  energy ${energy.toFixed(1)}\nface down ${motion.faceDown()}  live ${motion.live}/${motion.motionLive}  phase ${phase}`;
  }
  requestAnimationFrame(loop);
}

$('start').addEventListener('click', () => begin());
$('again').addEventListener('click', () => begin());
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
  foeStats,
  get phase() { return phase; },
  get foe() { return foe; },
  get state() { return { hearts, score, beaten, foeIndex, foeHp, energy, solidTime }; },
  begin: (from = 0) => begin(from),
};
