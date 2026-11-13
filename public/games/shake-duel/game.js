// Shake Duel: tilt to dodge, then shake, tap, twist or flip the phone to cast a spell,
// against a ladder of grotesque opponents who each fight dirty in their own way.
import { COPY, pick, fill } from './copy.js';
import { createMotion, createSound, buzz } from '../../shared/motion.js';
import { createSfx } from '../../shared/sfx.js';
import { getHall, submitScore, renderHall, rememberName, savedName } from '../../shared/hall.js';
import { createFx } from '../../shared/fx.js';

// ---------- rules ----------
const GAME = 'shake-duel';
const MAX_HEARTS = 3;
const DODGE_TILT = 10;        // degrees of tilt that count as a dodge
const SHAKE_FLOOR = 4;        // m/s² of movement that doesn't count as shaking
const DAMAGE_PER_ENERGY = 3;
const POINTS = { dodge: 10, ko: 50 };
const CRIT_CHANCE = 1 / 12;

// Freeze: how much movement gives you away.
const FREEZE_GRACE = 300;     // ms to stop moving after FREEZE appears
const FREEZE_ACCEL = 3;       // m/s²
const FREEZE_TILT = 8;        // degrees

// Gentle shakes: harder than this and the custard sets.
const TICKLE_FLOOR = 2;
const TICKLE_MAX = 13;
const TICKLE_BONUS = 2.5;

// How long a Shake lasts, and how much shaking fills the meter.
const PUNCHES = {
  shake:  { time: 1600, full: 25 },
  tickle: { time: 2200, full: 25 },
  pump:   { time: 3600, full: 60 },
};

// Your four moves: a movement each, and a kind of magic each. You start with Shake and
// learn the others by beating the opponent at learnAfter.
//   power: damage from a perfect cast, before type bonuses.  time: ms you get to do it.
const MOVES = {
  shake: { element: 'fire',    learnAfter: -1 },
  tap:   { element: 'frost',   power: 85,  time: 2400, learnAfter: 0 },
  twist: { element: 'thunder', power: 95,  time: 2600, learnAfter: 2 },
  flip:  { element: 'holy',    power: 110, time: 3200, learnAfter: 5 },
};
const ORDER = ['shake', 'tap', 'twist', 'flip'];

const TAPS = 12;              // taps for a perfect Tap
const TWIST_SWING = 20;       // degrees a twist has to swing each way
const TWISTS = 5;             // twists for a perfect Twist
const FLIP_FAST = 700;        // ms face down and back for a perfect Flip
const FLIP_SLOW = 2600;       // by this long it is at its weakest
const FLIP_WEAKEST = 0.35;
const FIZZLE = 0.12;          // casts weaker than this do nothing
const CHOOSE_MS = 8000;       // do nothing for this long and you lose your go
const CHOOSE_GRACE = 450;     // ms before movement counts as choosing
const CHOOSE_SHAKE = 2;       // how much shaking picks Shake

// How each type takes each element: 2 super effective, 0.5 not very, 0 no effect, -1 heals it.
const CHART = {
  paperwork:  { fire: 2, frost: 0.5 },
  rubbish:    { frost: 2, fire: 0.5 },
  dairy:      { fire: 2, frost: 0.5 },
  mineral:    { frost: 2, fire: 0.5, thunder: 0, holy: 0.5 },
  custard:    { fire: 2, frost: 0.5 },
  machine:    { thunder: 2, frost: 0.5 },
  wood:       { fire: 2, thunder: 0.5 },
  firesafety: { fire: -1, thunder: 2 },
  spectral:   { frost: 0, holy: 2 },
  inflatable: { fire: 2, thunder: 0.5 },
  laminated:  { fire: 0, frost: 0.5, holy: 2 },
  china:      { frost: 2, fire: 0.5 },
  rubber:     { fire: 2, thunder: 0.5 },
  disco:      { thunder: 2, holy: 0.5 },
  metal:      { thunder: 2, fire: 0.5 },
  wet:        { thunder: 2, fire: 0.5 },
  smelly:     { holy: 2, frost: 0.5 },
  alien:      { thunder: 2, holy: 0 },
  fruit:      { frost: 2, fire: 0.5 },
  fabric:     { fire: 2, thunder: -1 },
};
const TYPE_COLOUR = {
  paperwork: '#e8d6a8', rubbish: '#8fb84a', dairy: '#ffb340', mineral: '#a9a49c', custard: '#ffe066',
  machine: '#8fb0d0', wood: '#c48a52', firesafety: '#ff6b5b', spectral: '#7fffc4', inflatable: '#ff8fb0',
  laminated: '#d8e8f0', china: '#e0f0ff', rubber: '#ff9a5a', disco: '#e0a0ff', metal: '#c8c8d0',
  wet: '#6fc0ff', smelly: '#b4c84a', alien: '#9aff6a', fruit: '#ffd24a', fabric: '#ffa8d8',
};
const ELEMENT_COLOUR = { fire: '#ff9a5a', frost: '#a8e6ff', thunder: '#ffe04a', holy: '#fff3b0' };
const ELEMENT_ICON = { fire: '🔥', frost: '❄️', thunder: '⚡', holy: '✨' };
const ELEMENT_ART = { fire: 'spell-fire', frost: 'spell-frost', thunder: 'spell-thunder', holy: 'spell-holy' };

// What each opponent does. Words live in copy.js under the same id; art in art/<id>.webp.
//   type:   decides which moves hurt it most (CHART)
//   moves:  attacks it picks from (side, vertical, freeze, hide)
//   punch:  how Shake works on it: shake | tickle | pump
//   swings: attacks before your move
//   hp, window: multipliers on the usual numbers; dodgeTime: fixed seconds instead
//   voice:  which sounds it makes
const LADDER = {
  gary:     { type: 'paperwork', trick: 'plain', feint: 0, voice: 'goblin' },
  bin:      { type: 'rubbish', trick: 'feint', feint: 0.3, voice: 'monster' },
  cheese:   { type: 'dairy', trick: 'vertical', moves: ['side', 'vertical', 'vertical'], voice: 'grunt' },
  rock:     { type: 'mineral', trick: 'rock', swings: 0, hp: 0.6, voice: 'stone' },
  trifle:   { type: 'custard', trick: 'tickle', punch: 'tickle', voice: 'squelch' },
  checkout: { type: 'machine', trick: 'freeze', moves: ['side', 'freeze', 'freeze'], voice: 'error' },
  door:     { type: 'wood', trick: 'reverse', reverse: true, feint: 0, voice: 'creak' },
  alarm:    { type: 'firesafety', trick: 'flurry', swings: 3, flurry: true, dodgeTime: 0.85, hp: 0.6, feint: 0, voice: 'alarm' },
  ghost:    { type: 'spectral', trick: 'hide', moves: ['side', 'hide', 'hide'], voice: 'ghost' },
  castle:   { type: 'inflatable', trick: 'pump', punch: 'pump', hp: 1.2, voice: 'boing' },
  council:  { type: 'laminated', trick: 'everything', moves: ['side', 'vertical', 'freeze', 'hide'], swings: 2, voice: 'paper' },
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
  { trick: 'pump', punch: 'pump', hp: 1.3 },
];

const article = word => (/^[AEIOU]/i.test(word) ? 'An' : 'A');

let lastThing = null;
function endlessFoe() {
  const E = COPY.endless;
  const thing = pick(E.things.filter(t => t !== lastThing));
  lastThing = thing;
  const noun = thing.noun, lower = noun.toLowerCase();
  const adj = pick(E.adjectives), tail = pick(E.tails);
  const useAdj = Math.random() < 0.5;
  const name = useAdj ? fill(E.name, { A: article(adj), adj, noun }) : fill(E.nameTail, { A: article(noun), noun, tail });
  const rules = pick(ENDLESS);
  return {
    glyph: thing.glyph,
    art: thing.art,
    name,
    short: fill(E.short, { noun: lower }),
    tagline: E.tagline,
    rule: COPY.rules[rules.trick],
    attack: thing.attack,
    ko: fill(pick(E.ko), { noun: lower }),
    beatYou: fill(E.beatYou, { name: name.charAt(0).toLowerCase() + name.slice(1) }),
    // Anything haunted is a ghost underneath.
    rules: { ...rules, type: useAdj && adj === 'Haunted' ? 'spectral' : thing.type, voice: pick(['monster', 'grunt', 'troll', 'goblin']) },
  };
}

function foeStats(i) {
  const named = COPY.foes[i];
  const base = named ? { ...named, art: named.id, rules: LADDER[named.id] } : endlessFoe();
  const r = base.rules;
  return {
    ...base,
    type: r.type,
    voice: r.voice || 'monster',
    trick: r.trick,
    moves: r.moves || ['side'],
    punch: r.punch || 'shake',
    reverse: !!r.reverse,
    flurry: !!r.flurry,
    swings: r.swings ?? (i >= 4 ? 2 : 1),
    hp: Math.round((80 + i * 45 + Math.max(0, i - 6) * 30) * (r.hp ?? 1)),
    window: r.dodgeTime ?? Math.max(0.55, 1.25 - i * 0.07) * (r.window ?? 1),   // seconds to get your dodge in
    feint: r.feint ?? Math.min(0.35, Math.max(0, (i - 1) * 0.06)),
  };
}

const typeMult = (type, element) => CHART[type]?.[element] ?? 1;
const knownAt = from => new Set(ORDER.filter(id => MOVES[id].learnAfter < from));

const DEBUG = new URLSearchParams(location.search).has('debug');
const motion = createMotion();
const sound = createSound();
const sfx = createSfx({
  crowd: 'crowd', fight: 'say_fight', round: ['say_round_1', 'say_round_2', 'say_round_3'], final: 'say_final_round', ready: 'say_prepare_yourself',
  win: 'say_winner', flawless: 'say_flawless_victory', lose: 'say_you_lose', over: 'say_game_over', combo: 'say_combo',
  hit: ['hit1', 'hit2', 'hit3', 'hit4'], thud: ['thud1', 'thud2', 'thud3', 'thud4'], punch: ['punch1', 'punch2', 'punch3'], slam: ['slam1', 'slam2', 'slam3'],
  whoosh: ['whoosh1', 'whoosh2', 'whoosh3'], fire: ['fire1', 'fire2', 'fire3', 'fire4'], boom: ['boom1', 'bang1', 'bang2'],
  tink: ['tink1', 'tink2', 'tink3'], shatter: ['shatter1', 'shatter2', 'shatter3'], zap: ['zap1', 'zap2'], thunder: ['cannon1', 'cannon2'],
  bell: ['bell1', 'bell2', 'bell3'], gong: 'gong1', chime: ['chime1', 'chime2', 'chime3'], rise: ['rise1', 'rise2'], fall: ['fall1', 'fall2'],
  powerup: ['powerup1', 'powerup2', 'powerup3'], learn: 'jingle_nes1', lost: 'jingle_sax1', heal: 'chime4', dud: ['plop1', 'plop2'],
  tick: ['tick1', 'tick2'], select: ['select1', 'select2'], boing: ['boing1', 'boing2', 'boing3', 'boing4', 'boing5'],
  goblin: ['goblin1', 'goblin2', 'goblin3', 'goblin4', 'goblin5', 'goblin6'], monster: ['monster1', 'monster2', 'monster3', 'monster4'],
  grunt: ['grunt1', 'grunt2', 'grunt3', 'grunt4', 'grunt5'], troll: ['troll1', 'troll2', 'troll3'], ouch: ['ouch1', 'ouch2', 'ouch3', 'ouch4', 'ouch5'],
  stone: ['stone1', 'stone2'], squelch: ['squelch1', 'squelch2', 'squelch3', 'squelch4'], error: ['error1', 'error2', 'error3'],
  creak: ['creak1', 'creak2', 'creak3'], alarm: ['alarm2', 'alarm3'], ghost: ['ghost1', 'ghost2', 'ghost3', 'ghost4'], paper: ['paper1', 'paper2', 'paper3', 'paper4'],
  die: ['die1', 'scream1', 'scream2'], firework: ['firework1', 'firework2', 'firework3'], step: ['slam1', 'thud2'],
});
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fx = createFx($('fx'), $('stage'));

// ---------- state ----------
let runId = 0;
let hearts = MAX_HEARTS, score = 0, beaten = 0, foeIndex = 0, foe = null, foeHp = 0, hurtThisFight = false;
let phase = 'title';          // title | intro | learn | steady | dodge | freeze | hide | choose | shake | cast | resolve | over
let energy = 0, solidTime = 0, lastSolid = 0;
let freezeSince = 0, freezeMoved = 0;
let chooseSince = 0, chooseShake = 0, chooseSwing = 0, chooseDone = null;
let castId = null, taps = 0;
let known = knownAt(0), found = new Set();
let stopCrowd = null;
let carved = false;

// ---------- drawing ----------
// A picture of an opponent or spell, with its emoji standing in if the picture is missing.
function sprite(slug, glyph) {
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.src = `art/${slug}.webp`;
  img.onerror = () => {
    const s = document.createElement('span');
    s.className = 'glyph';
    s.textContent = glyph;
    img.replaceWith(s);
  };
  return img;
}
const preload = slug => { new Image().src = `art/${slug}.webp`; };

function badge(type) {
  const b = document.createElement('span');
  b.className = 'badge';
  b.style.background = TYPE_COLOUR[type] || '#ddd';
  b.textContent = COPY.types[type]?.name || type;
  return b;
}
function elementBadge(element, label) {
  const b = document.createElement('span');
  b.className = 'badge';
  b.style.background = ELEMENT_COLOUR[element];
  b.textContent = label || `${ELEMENT_ICON[element]} ${COPY.elements[element]}`;
  return b;
}

let sayTimer = null;
function say(text) {
  const el = $('line');
  clearInterval(sayTimer);
  $('sr').textContent = text || '';
  if (!text) { el.textContent = ''; return; }
  let i = 0;
  el.textContent = '';
  sayTimer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(sayTimer);
  }, 18);
}

function setPrompt(text, cls = '') {
  const p = $('prompt');
  p.textContent = text;
  p.className = '';
  if (!text) return;
  void p.offsetWidth;
  p.className = ('big ' + cls + (text.length > 9 ? ' long' : '')).trim();
}

function pop(text, cls, x, y, life = 1800) {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('pops').append(el);
  setTimeout(() => el.remove(), life);
  return el;
}

function flash(colour) {
  const f = $('flash');
  f.style.background = colour;
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

function foeCentre() {
  const r = $('foe-wrap').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.5 };
}

function setFoeState(cls) {
  $('foe-wrap').className = cls;
}

const HEART = '<svg viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28C10 22 2 17 2 9.5 2 5 5.5 2 9.5 2c2.8 0 5 1.5 6.5 4 1.5-2.5 3.7-4 6.5-4C26.5 2 30 5 30 9.5 30 17 22 22 16 28z"/><ellipse class="shine" cx="9" cy="8" rx="3" ry="2" transform="rotate(-30 9 8)"/></svg>';
let shownHearts = MAX_HEARTS, shownScore = 0;
function updateHud() {
  const h = $('hearts');
  if (h.children.length !== MAX_HEARTS) h.innerHTML = HEART.repeat(MAX_HEARTS);
  [...h.children].forEach((svg, i) => {
    svg.setAttribute('class', i < hearts ? 'on' : 'off');
    if (i === hearts && shownHearts > hearts) svg.classList.add('lost');
  });
  shownHearts = hearts;
  h.setAttribute('aria-label', `${hearts} of ${MAX_HEARTS} hearts`);
  const sc = $('score');
  sc.textContent = score;
  if (score !== shownScore) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); shownScore = score; }
  if (foe) {
    const pct = Math.max(0, foeHp / foe.hp) * 100 + '%';
    const bar = $('foe-hp');
    bar.hidden = false;
    bar.querySelector('.fill').style.width = pct;
    bar.querySelector('.trail').style.width = pct;
    bar.classList.toggle('low', foeHp / foe.hp < 0.3);
  }
}

function showTypes(box) {
  box.replaceChildren(badge(foe.type));
  for (const el of found) {
    const b = elementBadge(el, `${ELEMENT_ICON[el]} ×2`);
    b.classList.add('found');
    box.append(b);
  }
}

// The strip of moves along the bottom: what you know, and what you have found works.
function showMoves(active = null) {
  const box = $('moves');
  box.replaceChildren(...ORDER.map(id => {
    const m = MOVES[id], words = COPY.moves[id], has = known.has(id);
    const chip = document.createElement('div');
    chip.className = `chip e-${m.element}${has ? '' : ' locked'}${active === id ? ' active' : ''}${has && found.has(m.element) ? ' tip' : ''}`;
    if (has) chip.append(sprite(ELEMENT_ART[m.element], ELEMENT_ICON[m.element]));
    const name = document.createElement('b');
    name.textContent = has ? words.gesture : COPY.locked;
    chip.append(name);
    if (has) {
      const what = document.createElement('small');
      what.textContent = words.name;
      chip.append(what);
    }
    return chip;
  }));
  box.hidden = false;
}

function setMeter(level, cls) {
  const m = $('meter');
  if (cls !== undefined) m.className = cls;
  m.firstElementChild.style.width = Math.min(100, level * 100) + '%';
  m.classList.toggle('full', level >= 1);
}

function setAura(element, level = 0) {
  const a = $('aura');
  a.className = element || '';
  a.style.opacity = element ? String(0.35 + level * 0.65) : '0';
  fx.setAura(element === 'danger' ? null : element, level);
}

// ---------- sensing ----------
motion.onSample = ({ accel, dt, now, key }) => {
  if (phase === 'freeze') {
    if (now - freezeSince > FREEZE_GRACE) freezeMoved = Math.max(freezeMoved, accel);
    return;
  }
  if (phase === 'choose') {
    if (now - chooseSince < CHOOSE_GRACE) return;
    if (key) return chooseDone?.('shake');
    // Gentle shaking has to count against the trifle; elsewhere it takes a proper shake.
    chooseShake += Math.max(0, accel - (foe.punch === 'tickle' ? 3 : 8)) * dt;
    if (chooseShake > CHOOSE_SHAKE) {
      if (chooseSwing > 28 && known.has('twist')) chooseShake = 0;    // that was a twist starting, not a shake
      else chooseDone?.('shake');
    }
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
    if (accel > 12) {
      sound.tone(90 + Math.min(300, accel * 8), 0.03, 'square', 0.02);
      if (Math.random() < 0.3) fx.burst(innerWidth * (0.2 + Math.random() * 0.6), innerHeight - 140, 'fire', 4, 6);
    }
  }
  const level = energy / PUNCHES[foe.punch].full;
  setMeter(level);
  setAura('fire', Math.min(1, level));
};

// Taps: one picks Tap as your move, and every one after that is a dart.
$('stage').addEventListener('pointerdown', e => {
  if (phase === 'choose') {
    if (known.has('tap') && performance.now() - chooseSince > CHOOSE_GRACE) { chooseDone?.('tap'); dart(e); }
  } else if (phase === 'cast' && castId === 'tap') {
    dart(e);
  }
});

function dart(e) {
  taps++;
  const at = foeCentre();
  fx.shot('frost', { x: e.clientX, y: e.clientY }, { x: at.x + (Math.random() - 0.5) * 90, y: at.y + (Math.random() - 0.5) * 90 }, 11, 0.2);
  fx.ring(e.clientX, e.clientY, '#bff0ff', 60, 0.25, 5);
  sfx.play('tink', { volume: 0.5, rate: 0.9 + Math.min(1, taps / TAPS) * 0.7 });
  sound.tone(1200 + taps * 90, 0.05, 'sine', 0.03);
  buzz(8);
  setMeter(taps / TAPS);
  setAura('frost', Math.min(1, taps / TAPS));
}

// ---------- one fight ----------
let skipIntro = null;
async function intro(run) {
  phase = 'intro';
  $('intro-number').textContent = fill(COPY.foeNumber, { n: foeIndex + 1 });
  $('intro-art').replaceChildren(sprite(foe.art, foe.glyph));
  $('intro-name').textContent = foe.name;
  $('intro-tagline').textContent = foe.tagline;
  $('intro-rule').textContent = foe.rule;
  $('intro-types').replaceChildren(badge(foe.type));
  $('intro-fight').textContent = '';
  // Restart the entrance animations.
  for (const id of ['intro-art', 'intro-name']) { const n = $(id); n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }
  $('intro').hidden = false;
  if (COPY.foes[foeIndex + 1]) preload(COPY.foes[foeIndex + 1].id);
  sfx.play('whoosh', { volume: 0.7 });
  sfx.play(foeIndex === COPY.foes.length - 1 ? 'final' : foeIndex < 3 ? 'round' : 'ready', { volume: 0.9, delay: 0.3, vary: 0 });
  sfx.play(foe.voice, { volume: 0.7, delay: 0.9 });
  sound.tone(196, 0.3, 'sawtooth', 0.03);
  sound.tone(147, 0.4, 'sawtooth', 0.03, null, 0.3);
  buzz(40);
  const t0 = performance.now();
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 4400);
    skipIntro = () => { if (performance.now() - t0 > 900) { clearTimeout(timer); resolve(); } };
  });
  skipIntro = null;
  if (run !== runId) return;
  $('intro-fight').textContent = COPY.fight;
  sfx.play('fight', { vary: 0 });
  sfx.play('gong', { volume: 0.5 });
  sound.noise(0.3, 0.1, 0, 2000, 600);
  buzz(80);
  await wait(850);
  if (run !== runId) return;
  $('intro').hidden = true;
  found = new Set();
  hurtThisFight = false;
  $('foe').replaceChildren(sprite(foe.art, foe.glyph));
  setFoeState('enter');
  $('foe-label').textContent = fill(COPY.foeNumber, { n: foeIndex + 1 });
  $('foe-name').textContent = foe.name;
  $('foe-name').classList.toggle('long', foe.name.length > 22);
  $('foe-rule').textContent = foe.rule;
  showTypes($('foe-types'));
  showMoves();
  updateHud();
  await wait(380);
  fx.shake(10);
  fx.burst(innerWidth / 2, foeCentre().y + 120, 'dust', 16, 6);
  sfx.play('step', { volume: 0.8 });
  await wait(450);
}

// Wait for the phone to be face up and still, then call that angle "level".
async function steady(run, longest = 1400) {
  phase = 'steady';
  if (motion.faceDown()) {
    setPrompt(COPY.flipBack, 'small');
    const t = performance.now();
    while (run === runId && motion.faceDown() && performance.now() - t < 6000) await wait(50);
  }
  setPrompt(COPY.steady, 'small');
  const t0 = performance.now();
  await wait(Math.min(400, longest));
  while (run === runId && performance.now() - t0 < longest && motion.motionLive && motion.stillFor() < 300) await wait(50);
  motion.level();
}

function hurt(line) {
  hearts--;
  hurtThisFight = true;
  setPrompt('');
  say(line);
  sfx.play('punch', { volume: 1 });
  sfx.play('slam', { volume: 0.7 });
  sound.tone(110, 0.25, 'sawtooth', 0.05, 50);
  buzz([120, 40, 60]);
  flash('#ff1a1a');
  fx.shake(22);
  fx.burst(innerWidth / 2, innerHeight * 0.55, 'bad', 40, 14);
  fx.ring(innerWidth / 2, innerHeight * 0.55, '#ff3b3b', 260);
  pop(pick(COPY.pow.hurt), 'word', innerWidth / 2, innerHeight * 0.5, 900);
  updateHud();
}

function escaped(lines) {
  score += POINTS.dodge;
  setPrompt(pick(lines), 'cool');
  say('');
  sfx.play('whoosh', { volume: 0.9 });
  buzz(15);
  updateHud();
}

const AWAY = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const ARROW = { left: '←', right: '→', top: '↑', bottom: '↓' };
const CHEVRON = { left: '›', right: '‹', top: '⌄', bottom: '⌃' };

function runClock(ms) {
  const c = $('clock').firstElementChild;
  c.style.transition = 'none';
  c.style.transform = 'scaleX(1)';
  void c.offsetWidth;
  c.style.transition = `transform ${ms}ms linear`;
  c.style.transform = 'scaleX(0)';
}

// One incoming blow from the side, or from above or below. Returns true if it hits you.
async function swing(run, kind) {
  phase = 'dodge';
  const sides = kind === 'vertical' ? ['top', 'bottom'] : ['left', 'right'];
  let side = pick(sides);
  const strike = $('strike');
  // The door lies: everything it shows you is the wrong way round.
  const show = ms => {
    const shown = foe.reverse ? AWAY[side] : side;
    setFoeState('lean-' + shown + ' windup');
    strike.hidden = false;
    strike.className = shown;
    const band = strike.querySelector('.band');
    band.replaceChildren(...[0, 1, 2].map(() => { const b = document.createElement('b'); b.textContent = CHEVRON[shown]; return b; }));
    setPrompt(fill(foe.reverse ? COPY.push : COPY.dodge, { arrow: ARROW[AWAY[shown]] }), 'danger');
    say(fill(COPY.windUp, { Name: cap(foe.short), attack: foe.attack, side: COPY.sides[shown] }));
    runClock(ms);
  };
  const ms = foe.window * 1000;
  show(ms);
  setAura('danger', 0.4);
  sfx.play(foe.voice, { volume: 0.8, rate: foe.flurry ? 1.3 : 1 });
  sound.noise(foe.window, 0.03, 0, 400, 1600);
  buzz(20);

  if (Math.random() < foe.feint) {
    await wait(ms * 0.45);
    if (run !== runId) return false;
    side = AWAY[side];
    show(ms * 0.55 + 150);
    $('prompt').textContent = COPY.feint + ' ' + $('prompt').textContent;
    say(fill(COPY.feintLine, { side: COPY.sides[foe.reverse ? AWAY[side] : side] }));
    buzz([20, 30, 20]);
    sfx.play('boing', { volume: 0.6 });
    await wait(ms * 0.55 + 150);           // a little extra time after a feint
  } else {
    await wait(ms);
  }
  if (run !== runId) return false;

  setAura(null);
  const t = motion.read();
  const dodged = { left: t.x > DODGE_TILT, right: t.x < -DODGE_TILT, top: t.y > DODGE_TILT, bottom: t.y < -DODGE_TILT }[side];
  const shown = foe.reverse ? AWAY[side] : side;
  if (dodged) {
    strike.classList.add('whoosh');
    setFoeState('whiff-' + shown);
    escaped(COPY.dodged);
  } else {
    strike.classList.add('smash');
    setFoeState('lunge');
    hurt(fill(pick(COPY.hit), { attack: foe.attack, Attack: cap(foe.attack) }));
  }
  await wait(foe.flurry ? 250 : 350);
  strike.hidden = true;
  setFoeState('');
  await wait(foe.flurry ? 100 : 300);
  return !dodged;
}

// Hold perfectly still while it looks for you. Moving gets you caught at once.
async function freeze(run) {
  phase = 'freeze';
  freezeSince = performance.now();
  freezeMoved = 0;
  const start = { ...motion.read() };
  setFoeState('scan');
  setAura('danger', 0.6);
  setPrompt(COPY.freeze, 'danger');
  say(fill(COPY.freezeLine, { Name: cap(foe.short) }));
  const ms = 1400 + foe.window * 600;
  sound.tone(220, ms / 1000, 'sine', 0.025);
  sfx.play('tick', { volume: 0.8 });
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
  setAura(null);
  if (caught) {
    sfx.play('error', { volume: 0.9 });
    setFoeState('lunge');
    hurt(pick(COPY.moved));
  } else {
    setFoeState('');
    escaped(COPY.frozen);
  }
  await wait(400);
  setFoeState('');
  await wait(350);
  return caught;
}

// Turn the phone face down so it can't see you. The phone buzzes once when you're hidden,
// because you can't see the screen.
async function hide(run) {
  phase = 'hide';
  setFoeState('hunt');
  setAura('danger', 0.8);
  setPrompt(COPY.hide, 'danger');
  say(COPY.hideLine);
  sfx.play(foe.voice, { volume: 0.9, rate: 0.8 });
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
  setAura(null);
  const safe = motion.faceDown();
  if (safe) {
    setFoeState('');
    escaped(COPY.hidden);
    buzz([30, 80, 30]);
  } else {
    setFoeState('lunge');
    hurt(pick(COPY.found));
  }
  await wait(400);
  setFoeState('');
  await wait(400);
  return !safe;
}

// ---------- your move ----------
// Counts wrist twists: each time the tilt swings back the other way by TWIST_SWING degrees.
function twistCounter() {
  let dir = 0, ext = null, lo = 0, hi = 0, count = 0;
  return {
    get count() { return count; },
    get moving() { return dir !== 0; },
    get range() { return hi - lo; },
    feed(x) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
      if (ext === null) ext = x;
      else if (dir === 0) { if (Math.abs(x - ext) > TWIST_SWING) { dir = Math.sign(x - ext); ext = x; } }
      else if (dir > 0) { if (x > ext) ext = x; else if (ext - x > TWIST_SWING) { dir = -1; ext = x; count++; return true; } }
      else { if (x < ext) ext = x; else if (x - ext > TWIST_SWING) { dir = 1; ext = x; count++; return true; } }
      return false;
    },
  };
}

function listMoves() {
  const names = ORDER.filter(id => known.has(id)).map((id, i) => (i ? COPY.moves[id].gesture.toLowerCase() : COPY.moves[id].gesture));
  if (names.length === 1) return COPY.moves.shake.how + ' to cast a ' + COPY.moves.shake.name + '!';
  const list = names.slice(0, -1).join(', ') + ' ' + COPY.or + ' ' + names.at(-1);
  return fill(COPY.chooseLine, { moves: list });
}

// Whatever you do first is your move: shake, tap, twist or flip. Returns its id, or null if you dither.
function choose(run) {
  phase = 'choose';
  chooseSince = performance.now();
  chooseShake = 0;
  chooseSwing = 0;
  taps = 0;
  motion.level();
  const twist = twistCounter();
  let upFor = 0;
  showMoves();
  $('moves').classList.add('pick');
  setPrompt(COPY.yourMove, 'small');
  say(listMoves());
  sfx.play('select', { volume: 0.7 });
  buzz(25);
  return new Promise(resolve => {
    const poll = setInterval(() => {
      const now = performance.now();
      if (now - chooseSince < CHOOSE_GRACE) return;
      // A flip only counts once the phone has been the right way up for a moment.
      if (motion.faceDown()) { if (upFor > 250 && known.has('flip')) return chooseDone?.('flip'); }
      else upFor += 40;
      twist.feed(motion.read().x);
      chooseSwing = twist.range;
      if (twist.count >= 1 && known.has('twist')) chooseDone?.('twist');
    }, 40);
    const timer = setTimeout(() => chooseDone?.(null), CHOOSE_MS);
    chooseDone = id => {
      chooseDone = null;
      clearInterval(poll);
      clearTimeout(timer);
      $('moves').classList.remove('pick');
      resolve(run === runId ? id : null);
    };
  });
}

// Shake. Returns how hard it was.
async function shakeCast(run) {
  const P = PUNCHES[foe.punch];
  phase = 'shake';
  energy = 0;
  solidTime = 0;
  lastSolid = 0;
  setMeter(0, 'on e-fire' + (foe.punch === 'tickle' ? ' gentle' : ''));
  const label = { shake: COPY.moves.shake.prompt, tickle: COPY.tickle, pump: COPY.pump }[foe.punch];
  setPrompt(label);
  sfx.play('rise', { volume: 0.5 });
  buzz(40);
  const t0 = performance.now();
  while (run === runId && performance.now() - t0 < P.time) {
    await wait(50);
    if (foe.punch === 'tickle') {
      const solid = performance.now() - lastSolid < 400;
      $('prompt').textContent = solid ? COPY.tooHard : label;
      $('prompt').classList.toggle('danger', solid);
      $('meter').classList.toggle('solid', solid);
    }
  }
  phase = 'resolve';
  return { base: energy * DAMAGE_PER_ENERGY, power: Math.min(1, energy / P.full), solid: foe.punch === 'tickle' && solidTime > 0.4 };
}

// Tap: every tap is a dart. The taps themselves are counted where they land (see dart).
async function tapCast(run) {
  const m = MOVES.tap;
  phase = 'cast';
  castId = 'tap';
  setMeter(taps / TAPS, 'on e-frost');
  setPrompt(COPY.moves.tap.prompt, 'cool');
  const t0 = performance.now();
  while (run === runId && performance.now() - t0 < m.time && taps < TAPS) await wait(40);
  if (taps >= TAPS) await wait(200);
  phase = 'resolve';
  const power = Math.min(1, taps / TAPS);
  return { base: power < FIZZLE ? 0 : power * m.power, power };
}

// Twist: back and forth like a door handle.
async function twistCast(run) {
  const m = MOVES.twist;
  phase = 'cast';
  castId = 'twist';
  const twist = twistCounter();
  setMeter(0, 'on e-thunder');
  setPrompt(COPY.moves.twist.prompt);
  sfx.play('zap', { volume: 0.6 });
  buzz(40);
  const t0 = performance.now();
  let power = 1 / TWISTS;                 // the twist that chose the move counts
  while (run === runId && performance.now() - t0 < m.time) {
    await wait(40);
    if (twist.feed(motion.read().x)) {
      buzz(15);
      sfx.play('zap', { volume: 0.5, rate: 0.8 + twist.count * 0.12 });
      const y = innerHeight * (0.55 + Math.random() * 0.3);
      fx.bolt(innerWidth * 0.1, y, innerWidth * 0.9, y + (Math.random() - 0.5) * 80, 0.15, 24, 4);
    }
    power = Math.min(1, (1 + twist.count + (twist.moving ? 0.5 : 0)) / TWISTS);
    setMeter(power);
    setAura('thunder', power);
    if (power >= 1) { await wait(200); break; }
  }
  phase = 'resolve';
  return { base: power < FIZZLE ? 0 : power * m.power, power };
}

// Flip: it is already face down when this starts. The quicker it comes back, the harder it lands.
async function flipCast(run) {
  const m = MOVES.flip;
  phase = 'cast';
  castId = 'flip';
  setMeter(1, 'on e-holy');
  setPrompt(COPY.moves.flip.back);
  sfx.play('rise', { volume: 0.6, rate: 1.3 });
  buzz([40, 30, 40]);                     // you cannot see the screen, so this says "now turn it back"
  const t0 = performance.now();
  let power = 1;
  while (run === runId && performance.now() - t0 < m.time && motion.faceDown()) {
    await wait(30);
    const took = performance.now() - t0;
    power = Math.max(FLIP_WEAKEST, 1 - Math.max(0, took - FLIP_FAST) / (FLIP_SLOW - FLIP_FAST) * (1 - FLIP_WEAKEST));
    setMeter(power);
    setAura('holy', power);
  }
  phase = 'resolve';
  if (motion.faceDown()) return { base: 0, power: 0, slow: true };
  return { base: power * m.power, power };
}

function castSound(element) {
  if (element === 'fire') { sfx.play('fire', { volume: 1 }); sound.noise(0.5, 0.06, 0, 300, 2400); }
  else if (element === 'frost') { sfx.play('shatter', { volume: 0.8, delay: 0.25 }); }
  else if (element === 'thunder') { sfx.play('thunder', { volume: 1 }); sfx.play('zap', { volume: 0.7, rate: 0.6 }); }
  else if (element === 'holy') { sfx.play('bell', { volume: 0.9 }); sfx.play('chime', { volume: 0.7, delay: 0.15 }); }
}

// Land a move on the opponent: work out the damage and make it look like it hurt.
async function land(run, id, { base, solid, slow }) {
  const element = MOVES[id].element;
  const at = foeCentre();
  setPrompt('');
  $('meter').className = '';
  setAura(null);
  castId = null;
  if (!base) {
    say(slow ? COPY.flipSlow : COPY.fizzle);
    sfx.play('dud', { volume: 0.8 });
    fx.burst(innerWidth / 2, innerHeight - 140, 'dust', 10, 3);
    await wait(1300);
    return;
  }
  castSound(element);
  await fx.cast(element, { x: innerWidth / 2, y: innerHeight - 120 }, at);
  if (run !== runId) return;

  const mult = typeMult(foe.type, element);
  const crit = mult > 0 && Math.random() < CRIT_CHANCE;
  const amount = Math.round(base * Math.abs(mult) * (crit ? 1.5 : 1));
  const flavour = mult !== 1 ? COPY.types[foe.type]?.[element] : '';
  const lines = [];
  let banner = null;

  if (mult < 0) {
    foeHp = Math.min(foe.hp, foeHp + amount);
    setFoeState('heal');
    pop('+' + amount, 'dmg heal', at.x, at.y - 40);
    fx.burst(at.x, at.y, 'heal', 30, 6);
    sfx.play('heal', { volume: 0.8 });
    const line = fill(COPY.absorbs, { Short: cap(foe.short), d: amount });
    lines.push(line);
    if (flavour) lines.push(flavour);
    banner = ['heal', '+' + amount];
  } else {
    foeHp -= amount;
    score += amount;
    if (amount > 0) {
      setFoeState('hit t-' + element);
      const strong = mult > 1 || crit;
      fx.burst(at.x, at.y, element, strong ? 60 : 34, strong ? 16 : 11);
      fx.ring(at.x, at.y, element === 'frost' ? '#bff0ff' : element === 'holy' ? '#fff3b0' : '#ffffff', strong ? 300 : 200);
      fx.shake(Math.min(26, 6 + amount / 8));
      if (strong) flash(mult > 1 ? '#fff' : '#ffb21a');
      sfx.play(strong ? 'boom' : 'hit', { volume: 1 });
      sfx.play('ouch', { volume: 0.7, delay: 0.08 });
      if (strong) sfx.play('combo', { volume: 0.8, delay: 0.4, vary: 0 });
      buzz(Math.min(250, 40 + amount));
      pop(pick(COPY.pow[element]), 'word', at.x + (Math.random() - 0.5) * 120, at.y - 70, 900);
      pop((crit ? '' : '-') + amount + (crit ? '!' : ''), 'dmg' + (mult > 1 ? ' super' : mult < 1 ? ' weak' : ''), at.x + 30, at.y - 30);
    } else {
      sfx.play('dud', { volume: 0.8 });
    }
    if (mult === 0) { lines.push(fill(COPY.noEffect, { short: foe.short })); banner = ['none', fill(COPY.noEffect, { short: foe.short })]; }
    else if (mult > 1) { lines.push(COPY.superEffective); banner = ['super', COPY.superEffective]; }
    else if (mult < 1) { lines.push(COPY.notVery); banner = ['weak', COPY.notVery]; }
    if (crit) lines.push(COPY.crit);
    if (flavour) lines.push(flavour);
    if (id === 'shake' && mult === 1) {
      const table = foe.punch === 'tickle' ? COPY.wobble : COPY.punch;
      lines.push(fill(solid ? COPY.wentSolid : table.find(([max]) => amount < max)[1], { d: amount }));
    } else if (id === 'shake' && solid) {
      lines.push(fill(COPY.wentSolid, { d: amount }));
    } else if (amount > 0) {
      lines.push(fill(pick(COPY.spellHit), { d: amount }));
    }
  }
  if (mult > 1 && !found.has(element)) {
    found.add(element);
    showTypes($('foe-types'));
  }
  showMoves();
  say(lines.join(' '));
  if (banner) setTimeout(() => run === runId && pop(banner[1], 'banner ' + banner[0], innerWidth / 2, innerHeight * 0.3, 1900), 150);
  if (crit) setTimeout(() => run === runId && pop(COPY.crit, 'banner crit', innerWidth / 2, innerHeight * 0.3 + 52, 1900), 350);
  updateHud();
  await wait(mult > 1 || crit ? 1700 : 1300);
  if (run === runId && foeHp > 0) setFoeState('');
}

async function yourMove(run) {
  const id = await choose(run);
  if (run !== runId) return;
  if (!id) {
    setPrompt('');
    say(COPY.dithered);
    sfx.play('fall', { volume: 0.6 });
    await wait(1200);
    return;
  }
  showMoves(id);
  say(fill(COPY.used, { move: COPY.moves[id].name }));
  const result = await { shake: shakeCast, tap: tapCast, twist: twistCast, flip: flipCast }[id](run);
  if (run !== runId) return;
  await land(run, id, result);
}

async function knockOut(run) {
  beaten++;
  score += POINTS.ko;
  const at = foeCentre();
  setPrompt('');
  pop(COPY.ko, 'ko', innerWidth / 2, innerHeight * 0.42, 2200);
  flash('#fff');
  fx.shake(30);
  fx.stars(at.x, at.y, 14);
  fx.burst(at.x, at.y, 'fire', 70, 18);
  setFoeState('out');
  say(foe.ko);
  sfx.play('boom', { volume: 1 });
  sfx.play('die', { volume: 0.8, delay: 0.1 });
  sfx.play(hurtThisFight ? 'win' : 'flawless', { volume: 1, delay: 0.7, vary: 0 });
  sfx.play('firework', { volume: 0.6, delay: 0.5 });
  buzz([50, 50, 50, 50, 150]);
  setTimeout(() => fx.confetti(140), 300);
  updateHud();
  await wait(2800);
  if (run !== runId) return;
  setFoeState('gone');
  if (beaten % 2 === 0 && hearts < MAX_HEARTS) {
    hearts++;
    say(COPY.healed);
    sfx.play('heal', { volume: 0.9 });
    updateHud();
    await wait(1400);
  }
}

// Some knockouts teach you a new move.
let learnDone = null;
async function learnMoves(run) {
  for (const id of ORDER.filter(s => MOVES[s].learnAfter === foeIndex && !known.has(s))) {
    if (run !== runId) return;
    phase = 'learn';
    const m = MOVES[id], words = COPY.moves[id];
    known.add(id);
    const art = sprite(ELEMENT_ART[m.element], ELEMENT_ICON[m.element]);
    art.id = 'learn-img';
    $('learn-art').replaceChildren(art);
    $('learn-gesture').textContent = words.gesture.toUpperCase() + '!';
    $('learn-name').textContent = fill(COPY.learned, { move: words.name });
    $('learn-types').replaceChildren(elementBadge(m.element));
    $('learn-how').textContent = words.how + '.';
    $('learn-uses').textContent = COPY.learnWhen;
    $('learn').hidden = false;
    sfx.play('learn', { volume: 0.9, vary: 0 });
    sfx.play('powerup', { volume: 0.6, delay: 0.2 });
    buzz([40, 40, 40, 40, 120]);
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 12000);
      learnDone = () => { clearTimeout(timer); resolve(); };
    });
    learnDone = null;
    $('learn').hidden = true;
  }
}

async function fight(run, from) {
  for (foeIndex = from; ; foeIndex++) {
    foe = foeStats(foeIndex);
    foeHp = foe.hp;
    preload(foe.art);
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
        await wait(1200);
        if (run !== runId) return;
      } else if (motion.faceDown()) {
        await steady(run, 400);
        if (run !== runId) return;
      }
      await yourMove(run);
      if (run !== runId) return;
    }
    await knockOut(run);
    if (run !== runId) return;
    await learnMoves(run);
    if (run !== runId) return;
  }
}

function gameOver() {
  phase = 'over';
  setPrompt('');
  setAura(null);
  stopCrowd?.();
  stopCrowd = null;
  sfx.play('lose', { volume: 1, delay: 0.3, vary: 0 });
  sfx.play('lost', { volume: 0.7, delay: 1.2, vary: 0 });
  buzz([100, 60, 300]);
  $('over-art').replaceChildren(sprite(foe.art, foe.glyph));
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
  }, 1000);
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
  sfx.unlock();
  await motion.start();
  runId++;
  chooseDone?.(null);
  learnDone?.();
  hearts = MAX_HEARTS;
  shownHearts = MAX_HEARTS;
  score = 0;
  beaten = 0;
  known = knownAt(from);
  found = new Set();
  for (const id of ['title', 'over', 'intro', 'learn', 'strike', 'moves']) $(id).hidden = true;
  $('meter').className = '';
  setAura(null);
  setFoeState('gone');
  $('foe').replaceChildren();
  for (const id of ['foe-label', 'foe-name', 'foe-rule']) $(id).textContent = '';
  $('foe-types').replaceChildren();
  $('foe-hp').hidden = true;
  foe = null;
  setPrompt('');
  say('');
  updateHud();
  stopCrowd?.();
  stopCrowd = sfx.loop('crowd', { volume: 0.22 });
  fight(runId, from);
}

function loop() {
  const t = motion.read();
  const st = $('stage').style;
  st.setProperty('--px', Math.max(-16, Math.min(16, -t.x * 0.7)) + 'px');
  st.setProperty('--py', Math.max(-16, Math.min(16, -t.y * 0.7)) + 'px');
  if (DEBUG) {
    let d = document.querySelector('.debug');
    if (!d) { d = document.createElement('div'); d.className = 'debug'; document.body.append(d); }
    d.textContent = `tilt ${t.x.toFixed(1)} ${t.y.toFixed(1)}  accel ${motion.accel.toFixed(1)}  energy ${energy.toFixed(1)}\nface down ${motion.faceDown()}  live ${motion.live}/${motion.motionLive}  phase ${phase}  fx ${fx.count}`;
  }
  requestAnimationFrame(loop);
}

$('start').addEventListener('click', () => begin());
$('again').addEventListener('click', () => begin());
$('intro').addEventListener('click', () => skipIntro?.());
$('learn-go').addEventListener('click', () => learnDone?.());
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
// The title line-up: a few of the opponents, fanned out.
[['cheese', 0, -14, 0.8], ['trifle', 58, 12, 0.8], ['ghost', 8, -6, 0.95], ['council', 50, 8, 0.95], ['gary', 29, 0, 1.1]].forEach(([id, left, rot, scale], i) => {
  const f = COPY.foes.find(x => x.id === id);
  const s = sprite(id, f.glyph);
  s.style.left = left + '%';
  s.style.transform = `rotate(${rot}deg) scale(${scale})`;
  s.style.zIndex = i;
  s.style.animationDelay = -i * 0.4 + 's';
  $('lineup').append(s);
});
const bgTest = new Image();
bgTest.onload = () => $('bg').classList.add('art');
bgTest.src = 'art/arena.webp';
updateHud();
loadHall($('hall-title'));
requestAnimationFrame(loop);

// For automated checks only.
window.__duel = {
  motion,
  fx,
  sfx,
  foeStats,
  typeMult,
  moves: MOVES,
  get phase() { return phase; },
  get cast() { return castId; },
  get foe() { return foe; },
  get state() { return { hearts, score, beaten, foeIndex, foeHp, energy, solidTime, taps, known: [...known], found: [...found] }; },
  pickMove: id => chooseDone?.(id),
  begin: (from = 0) => begin(from),
};
