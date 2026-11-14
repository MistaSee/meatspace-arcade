// Rally: one bat and ball, kept in play while the world round it keeps changing and asks
// more of your body each time. This build has the first three stages:
//   plain   white on black. Turn the phone like a steering wheel to move the bat.
//   tip     the court comes loose and turns. Turn the phone to keep it level.
//   whack   the court is punched through into a comic. Swing the phone to hit a soggy tomato.
// Hold the phone upright, facing you. There are no rules to read: it starts when tapped.
import { COPY } from './copy.js';
import { createMotion, buzz } from '../../shared/motion.js';
import { createSfx } from '../../shared/sfx.js';
import { artUrl, everyFrame, clamp, pick } from '../../shared/juice.js';

// ---------- rules ----------
const HW = 1, HH = 1.72;            // the court's half-width and half-height, in its own units
const BAT = 0.5;                    // how wide a bat is
const BAT_Y = HH - 0.2;             // how far from the middle each bat sits
const BALL = 0.07;
const SERVE_SPEED = 1.9, TOP_SPEED = 3.3, SPEED_UP = 0.16;
const STEER = 26;                   // degrees of turn that put the bat at the edge
// The other bat has to be beatable. It is slower than a fast ball, it only reacts once the ball is
// well on its way, and it sees the ball a moment late. A shot off the end of your bat usually beats it.
const RIVAL_PACE = 1.1;             // how fast the other bat can move
const RIVAL_SEES = 0.3;             // it starts chasing when the ball is this far past the net
const RIVAL_LAG = 0.12;             // seconds behind the ball's real position
const RIVAL_SLIDE = 0.9;            // how far a tilted court throws it off
const PLAIN_RETURNS = 5;            // returns before the court comes loose
const PLAIN_LIMIT = 40;             // seconds: it comes loose anyway
// Stage 2: how far round the court has turned (degrees) at each moment (seconds).
const TIP = [[0, -14], [2.5, 16], [5.5, -26], [8.5, 38], [11.5, 90], [15, 90], [17.5, 180], [21.5, 180], [24.5, 360], [27, 360]];
const SLIDE = 1.9;                  // how hard a tilted court drags the ball sideways
// Stage 3
const SWING = 11;                   // m/s² that counts as a swing
const SWING_REARM = 5;              // the phone has to calm down to this before another swing counts
const SWING_REST = 0.4;             // and this many seconds have to pass
const SWING_LIVE = 0.3;             // a swing stays good this long, so being a touch early still connects
const STEER_HOLD = 5;               // m/s²: above this the phone is being thrown about and its steering is not trusted
const REACH_UP = 0.9, REACH_ACROSS = 0.72;    // how near the tomato must be: about where fist and tomato touch
const REACH_LATE = 0.2;             // and how far past the fist still counts
const SOGGY_SPEED = 0.85;
const HIT_STOP = 0.07;              // seconds everything freezes on a good whack, so it lands
const WHACKS = 6;                   // the last of these lands on Gary

// ---------- letters ----------
// The game's own blocky letters, three squares wide and five tall.
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101111011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
  '!': '010010010000010', '?': '111001010000010', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
};

const canvas = document.getElementById('view');
const g = canvas.getContext('2d');
const rad = d => (d * Math.PI) / 180;
const wrap = d => ((((d + 180) % 360) + 360) % 360) - 180;
const ease = t => t * t * (3 - 2 * t);

let W = 0, H = 0, unit = 1, dpr = 1, turnedPage = false;
function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  // If the page itself has turned with the phone, the court still has to stand along the phone's long side.
  turnedPage = matchMedia('(pointer: coarse)').matches && screenAngle() % 180 !== 0;
  const across = turnedPage ? H : W, along = turnedPage ? W : H;
  unit = Math.min(across / (2 * HW + 0.24), along / (2 * HH + 0.5));
}
addEventListener('resize', resize);
resize();

// Blocky words. px is the size of one square, in court units.
function pix(str, x, y, px, colour = '#fff') {
  const text = String(str).toUpperCase();
  const width = text.length * 4 * px - px;
  let cx = x - width / 2;
  g.fillStyle = colour;
  for (const ch of text) {
    const bits = GLYPHS[ch] || GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(cx + (i % 3) * px, y + Math.floor(i / 3) * px - 2.5 * px, px * 1.02, px * 1.02);
    cx += 4 * px;
  }
}

// ---------- pictures and sound ----------
const pictures = {};
for (const [name, slug] of [['gary', 'duel/gary'], ['tomato', 'throw-tomato'], ['fist', 'duel/spell-wallop']]) {
  const img = new Image();
  img.src = artUrl(slug);
  pictures[name] = img;
}
const ready = img => img.complete && img.naturalWidth > 0;

const motion = createMotion();
const sfx = createSfx({
  creak: ['creak1', 'creak2', 'creak3'], crack: ['woodbreak1', 'woodbreak2'], rumble: ['rumble1', 'rumble2'], slam: ['slam1', 'slam3'],
  punch: ['punch1', 'punch2', 'punch3', 'thud1', 'thud3'], boing: ['boing1', 'boing2', 'boing3', 'boing4'], splat: ['squelch1', 'squelch2', 'squelch3', 'splash1'],
  whoosh: ['whoosh1', 'whoosh2', 'whoosh3'], crowd: 'crowd', gary: ['goblin1', 'goblin2', 'goblin3', 'goblin4', 'goblin5', 'goblin6'], boom: ['boom1', 'bang1'],
  ouch: ['ouch1', 'ouch2', 'ouch3'], cheer: 'jingle_pizza1', shatter: ['shatter1', 'shatter2'], fight: 'say_fight',
});

// A tiny synthesiser: plain blips for the plain court, and a drone that sours as the court tips.
let ac = null, drone = null;
function audioOn() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const a = ac.createOscillator(), b = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    gain.gain.value = 0;
    a.connect(filter);
    b.connect(filter);
    filter.connect(gain).connect(ac.destination);
    a.start();
    b.start();
    drone = { a, b, filter, gain };
  } catch { ac = null; }
}
function blip(freq, dur = 0.07, vol = 0.12, type = 'square') {
  if (!ac) return;
  const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime;
  o.type = type;
  o.frequency.value = freq;
  v.gain.setValueAtTime(vol, t);
  v.gain.setValueAtTime(vol, t + dur * 0.8);
  v.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(v).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function setDrone(level, off) {
  if (!drone) return;
  const t = ac.currentTime;
  drone.gain.gain.setTargetAtTime(level * 0.06, t, 0.15);
  drone.a.frequency.setTargetAtTime(55 + off * 30, t, 0.1);
  drone.b.frequency.setTargetAtTime(55 * 1.5 + off * 75, t, 0.1);       // a clean fifth when level, sour when not
  drone.filter.frequency.setTargetAtTime(300 + off * 1500, t, 0.1);
}

// ---------- state ----------
const S = {
  stage: 'title',               // title | plain | break | tip | settle | punch | whack | ko | cut
  t: 0,                         // seconds in this stage
  clock: 0,                     // seconds since the page opened
  lap: 0,
  score: [0, 0],                // you, them
  returns: 0,
  theta: 0,                     // how far the court is turned on the screen, degrees clockwise
  phi: 0,                       // how far the phone is turned in the world
  u: 0,                         // how far off level the court is in the world: the thing you steer with
  bat: 0, rival: 0,
  ball: { x: 0, y: 0, vx: 0, vy: 0, live: false, spin: 0 },
  serveIn: 0.8, toPlayer: true,
  world: 0,                     // how much of the horizon behind the court shows, 0 to 1
  zoom: 1,                      // the court draws smaller while it is loose, so the world round it shows
  digits: 0,                    // how far the score has slid sideways
  shake: 0,
  hint: '', hintFor: 0,
  shards: [], stains: [], words: [],
  whacks: 0, swingRest: 0, swingLive: 0, steerHold: 0, freeze: 0, inReach: false, jab: 0, lunge: 0, soggy: false, taught: false, garyOut: 0,
  slow: 0, lite: false,           // on a phone that cannot keep up, the comic drops some of its decoration
  boil: 0, boilSeed: 1,
  started: false, noSensor: false,
};
const test = { roll: null, auto: false };      // auto: true plays itself; 'edge' plays itself and aims for the end of the bat
const seen = [];                               // where the ball has just been, for the other bat's slow eyes
let stopCrowd = null;

function to(stage) {
  S.stage = stage;
  S.t = 0;
}
function hint(text, seconds = 3) {
  S.hint = text;
  S.hintFor = seconds;
}

function serve(toPlayer) {
  const b = S.ball, a = (Math.random() - 0.5) * 0.9;
  b.x = 0;
  b.y = 0;
  b.vx = Math.sin(a) * SERVE_SPEED;
  b.vy = (toPlayer ? 1 : -1) * Math.cos(a) * SERVE_SPEED;
  b.live = true;
}

// ---------- the plain game, shared by the first two stages ----------
function playBall(dt, sliding) {
  const b = S.ball;
  if (!b.live) {
    S.serveIn -= dt;
    if (S.serveIn <= 0) serve(S.toPlayer);
    return;
  }
  if (sliding) b.vx = clamp(b.vx + Math.sin(rad(S.u)) * SLIDE * dt, -2.4, 2.4);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (Math.abs(b.x) > HW - BALL / 2) {
    b.x = Math.sign(b.x) * (HW - BALL / 2);
    b.vx = -b.vx * (sliding ? 0.7 : 1);
    blip(240, 0.05);
  }
  for (const [side, batX, who] of [[1, S.bat, 'you'], [-1, S.rival, 'them']]) {
    if (b.vy * side <= 0) continue;
    const edge = side * (BAT_Y - 0.06);
    if (b.y * side < BAT_Y - 0.06 || b.y * side > BAT_Y + 0.12 || Math.abs(b.x - batX) > BAT / 2 + BALL / 2) continue;
    const speed = Math.min(TOP_SPEED, Math.hypot(b.vx, b.vy) + SPEED_UP);
    const angle = clamp((b.x - batX) / (BAT / 2), -1, 1) * 0.95;
    b.vx = Math.sin(angle) * speed;
    b.vy = -side * Math.cos(angle) * speed;
    b.y = edge - side * 0.01;
    blip(who === 'you' ? 480 : 360, 0.06);
    if (who === 'you') { S.returns++; buzz(10); }
  }
  if (Math.abs(b.y) > HH + 0.25) {
    const youScored = b.y < 0;
    S.score[youScored ? 0 : 1]++;
    S.toPlayer = !youScored;
    b.live = false;
    S.serveIn = 0.9;
    blip(120, 0.35, 0.14);
    if (!youScored) buzz(60);
  }
  // The other bat chases where the ball was a moment ago, once it is coming, and only so fast.
  // On a tilted court it slides downhill like everything else.
  seen.push([S.clock, b.x]);
  while (seen.length > 2 && seen[1][0] <= S.clock - RIVAL_LAG) seen.shift();
  const coming = b.live && b.vy < 0 && b.y < RIVAL_SEES;
  const want = (coming ? seen[0][1] : S.rival * 0.98) + (sliding ? Math.sin(rad(S.u)) * RIVAL_SLIDE : 0);
  S.rival += clamp(want - S.rival, -RIVAL_PACE * dt, RIVAL_PACE * dt);
  S.rival = clamp(S.rival, -HW + BAT / 2, HW - BAT / 2);
}

function tipAngle(t) {
  for (let i = 1; i < TIP.length; i++) {
    if (t <= TIP[i][0]) {
      const [t0, a0] = TIP[i - 1], [t1, a1] = TIP[i];
      return a0 + (a1 - a0) * ease((t - t0) / (t1 - t0));
    }
  }
  return TIP.at(-1)[1];
}

// ---------- stage 3: the comic ----------
function addWord(text, x, y, colour = '#e8361c') {
  S.words.push({ text, x, y, age: 0, colour, tilt: (Math.random() - 0.5) * 0.5 });
}

function tomatoFromGary() {
  const b = S.ball;
  b.x = S.rival;
  b.y = -BAT_Y + 0.35;
  // The first few come down close to your fist. Later ones make you reach.
  const spread = S.whacks < 3 ? 0.6 : 1.1;
  const aim = clamp(S.bat + (Math.random() - 0.5) * spread, -HW + 0.3, HW - 0.3);
  const time = (BAT_Y - b.y) / SOGGY_SPEED;
  b.vx = (aim - b.x) / time;
  b.vy = SOGGY_SPEED;
  b.live = true;
  S.soggy = true;
  S.lunge = 1;
  sfx.play('gary', { volume: 0.7 });
  sfx.play('boing', { volume: 0.5 });
}

// Is the tomato where the fist can get it?
function reachable() {
  const b = S.ball;
  return b.live && b.vy > 0 && b.y > BAT_Y - REACH_UP && b.y < BAT_Y + REACH_LATE && Math.abs(b.x - S.bat) < REACH_ACROSS;
}

// The phone was swung. It stays "swinging" for a moment, so a swing that starts just before
// the tomato arrives still connects.
function swing() {
  if (S.stage !== 'whack' || S.swingRest > 0) return;
  S.swingRest = SWING_REST;
  S.swingLive = SWING_LIVE;
  S.steerHold = 0.3;
  S.jab = 1;
  sfx.play('whoosh', { volume: 0.6 });
  if (reachable()) whack();
}

function whack() {
  const b = S.ball;
  S.swingLive = 0;
  S.whacks++;
  S.taught = true;
  S.soggy = false;
  S.inReach = false;
  S.shake = 0.09;
  S.freeze = HIT_STOP;
  S.jab = 1;
  const last = S.whacks >= WHACKS;
  // Back up the court, fast. The last one goes straight for Gary's face.
  const aim = last ? S.rival : clamp(S.rival + (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.4), -HW + 0.3, HW - 0.3);
  const speed = 3.4;
  const dy = -BAT_Y + 0.35 - b.y, dx = aim - b.x, d = Math.hypot(dx, dy);
  b.vx = (dx / d) * speed;
  b.vy = (dy / d) * speed;
  b.last = last;
  addWord(pick(COPY.whack), b.x, b.y - 0.25);
  sfx.play('punch', { volume: 1 });
  sfx.play('slam', { volume: 0.6 });
  buzz(70);
}

function playTomato(dt) {
  const b = S.ball;
  S.swingRest = Math.max(0, S.swingRest - dt);
  S.swingLive = Math.max(0, S.swingLive - dt);
  S.jab = Math.max(0, S.jab - dt * 3.3);
  S.lunge = Math.max(0, S.lunge - dt * 3);
  // Gary shuffles about under where it is going to come down.
  const want = b.live && b.vy < 0 ? b.x : Math.sin(S.t * 0.9) * 0.5;
  S.rival += clamp(want - S.rival, -1.3 * dt, 1.3 * dt);
  if (!b.live) {
    S.inReach = false;
    S.serveIn -= dt;
    if (S.serveIn <= 0) tomatoFromGary();
    return;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += (S.soggy ? 2 : 14) * dt;
  if (Math.abs(b.x) > HW - 0.15) { b.x = Math.sign(b.x) * (HW - 0.15); b.vx = -b.vx; }
  // A buzz the moment it comes within reach: that is when to swing.
  const was = S.inReach;
  S.inReach = reachable();
  if (S.inReach && !was) buzz(15);
  if (S.inReach && S.swingLive > 0) return whack();
  if (b.vy > 0 && !S.taught && b.y > BAT_Y - REACH_UP) hint(COPY.swing, 1.2);
  if (b.vy < 0 && b.y < -BAT_Y + 0.4) {
    if (b.last) {
      // Right in the face.
      b.live = false;
      S.garyOut = 0.001;
      S.shake = 0.16;
      addWord(COPY.splat, S.rival, -BAT_Y + 0.5, '#c2185b');
      S.stains.push({ x: S.rival, y: -BAT_Y + 0.4, r: 0.5, age: 0 });
      sfx.play('splat', { volume: 1 });
      sfx.play('boom', { volume: 0.8 });
      sfx.play('ouch', { volume: 0.9, delay: 0.1 });
      sfx.play('cheer', { volume: 0.8, delay: 0.5, vary: 0 });
      buzz([60, 40, 200]);
      to('ko');
    } else {
      tomatoFromGary();
    }
  } else if (b.y > HH + 0.1) {
    // Nobody hit it. It lands like a wet sock.
    b.live = false;
    S.serveIn = 1.0;
    S.stains.push({ x: clamp(b.x, -HW + 0.2, HW - 0.2), y: HH - 0.1, r: 0.3, age: 0 });
    addWord(COPY.soggy, b.x, HH - 0.5, '#7a3fb0');
    sfx.play('splat', { volume: 0.9 });
    buzz(40);
  }
}

// ---------- every frame: the logic ----------
function update(dt) {
  // A good whack stops the world for a beat.
  if (S.freeze > 0) { S.freeze -= dt; return; }
  S.t += dt;
  S.clock += dt;
  S.hintFor = Math.max(0, S.hintFor - dt);
  S.shake = Math.max(0, S.shake - dt * 0.5);
  S.boil += dt;
  if (S.boil > 0.11) { S.boil = 0; S.boilSeed = 1 + Math.floor(Math.random() * 9999); }
  for (const w of S.words) w.age += dt;
  S.words = S.words.filter(w => w.age < 0.9);
  for (const s of S.stains) s.age += dt;
  for (const s of S.shards) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 6 * dt; s.rot += s.spin * dt; }
  S.shards = S.shards.filter(s => Math.abs(s.x) < 4 && s.y < 5);

  // Where the phone is turned to, and so how far off level the court is.
  let roll = test.roll !== null ? test.roll : motion.roll();
  if (test.auto) {
    const b = S.ball, edge = HW - BAT / 2;
    const off = test.auto === 'edge' && S.stage !== 'whack' ? (b.x > 0 ? -0.2 : 0.2) : 0;
    const aim = S.stage === 'whack' || b.vy > 0 ? b.x + off : 0;
    roll = clamp(aim / edge, -1, 1) * STEER - S.theta;
    if (S.stage === 'whack' && b.live && b.vy > 0 && b.y > BAT_Y - 0.4 && Math.abs(b.x - S.bat) < 0.3) swing();
  }
  // The steering angle comes from which way gravity pulls. A swing swamps gravity for a moment,
  // so while the phone is being thrown about the last good angle is kept.
  S.steerHold = Math.max(0, S.steerHold - dt);
  const thrown = test.roll === null && !test.auto && motion.motionLive && motion.accel > STEER_HOLD;
  if (!thrown && S.steerHold <= 0) S.phi += wrap(roll - S.phi) * Math.min(1, dt * 18);
  S.u = wrap(S.phi + S.theta);
  const edge = HW - BAT / 2;
  if (S.stage !== 'title') S.bat += (clamp(S.u / STEER, -1, 1) * edge - S.bat) * Math.min(1, dt * 16);

  if (S.stage === 'title') {
    // Nobody is playing yet: both bats play themselves.
    S.bat += clamp(S.ball.x - S.bat, -RIVAL_PACE * dt, RIVAL_PACE * dt);
    playBall(dt, false);
  } else if (S.stage === 'plain') {
    playBall(dt, false);
    S.world = Math.max(0, S.world - dt);
    S.digits *= 0.9;
    if (S.returns >= PLAIN_RETURNS || S.t > PLAIN_LIMIT) {
      // The court comes loose.
      to('break');
      S.shake = 0.12;
      sfx.play('crack', { volume: 1 });
      sfx.play('creak', { volume: 0.9, delay: 0.25 });
      buzz([80, 40, 160]);
      hint(COPY.level, 3.5);
    }
  } else if (S.stage === 'break') {
    // It drops off one nail and swings there.
    const t = S.t;
    S.theta = -14 * (1 - Math.exp(-t * 3) * Math.cos(t * 9));
    S.world = Math.min(1, t / 1.2);
    if (t > 0.5) playBall(dt, true);
    if (t > 2.4) { to('tip'); }
  } else if (S.stage === 'tip') {
    const before = S.theta;
    S.theta = tipAngle(S.t);
    S.world = 1;
    playBall(dt, true);
    S.digits += (clamp(Math.sin(rad(S.u)) * 1.3, -0.62, 0.62) - S.digits) * Math.min(1, dt * 3);
    if (Math.abs(S.theta - before) > 30 * dt && Math.random() < 0.04) sfx.play('creak', { volume: 0.5 });
    if (S.t > 16.8 && S.t < 17 && S.hintFor <= 0) hint(COPY.upsideDown, 2.5);
    if (S.t > TIP.at(-1)[0]) { to('settle'); S.theta = 0; }
  } else if (S.stage === 'settle') {
    playBall(dt, true);
    S.digits *= 0.92;
    if (S.t > 1.6) {
      to('punch');
      S.ball.live = false;
      sfx.play('rumble', { volume: 1 });
    }
  } else if (S.stage === 'punch') {
    // Something hits the court from behind. Twice. Then it comes through.
    if (S.t > 0.5 && S.t - dt <= 0.5) { S.shake = 0.08; sfx.play('slam', { volume: 1 }); buzz(60); }
    if (S.t > 1.0 && S.t - dt <= 1.0) {
      S.shake = 0.2;
      sfx.play('punch', { volume: 1 });
      sfx.play('shatter', { volume: 0.9 });
      sfx.play('boom', { volume: 0.7 });
      buzz([120, 30, 200]);
      // The court breaks into pieces that fly off.
      S.shards = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, r = 0.3 + Math.random() * 0.9;
        S.shards.push({ x: Math.cos(a) * r * 0.6, y: Math.sin(a) * r, vx: Math.cos(a) * (2 + Math.random() * 3), vy: Math.sin(a) * (2 + Math.random() * 3) - 1, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12, size: 0.25 + Math.random() * 0.4 });
      }
    }
    S.world = Math.max(0, 1 - Math.max(0, S.t - 1) * 3);
    if (S.t > 1.9) {
      to('whack');
      S.whacks = 0;
      S.taught = false;
      S.garyOut = 0;
      S.stains = [];
      S.rival = 0;
      S.serveIn = 1.0;
      S.ball.live = false;
      S.ball.last = false;
      stopCrowd?.();
      stopCrowd = sfx.loop('crowd', { volume: 0.25 });
      sfx.play('fight', { volume: 0.9, vary: 0 });
    }
  } else if (S.stage === 'whack') {
    playTomato(dt);
  } else if (S.stage === 'ko') {
    S.garyOut += dt;
    S.jab = Math.max(0, S.jab - dt * 5);
    if (S.t > 2.6) {
      // A hard cut back to where it all started, with a score nobody earned.
      stopCrowd?.();
      stopCrowd = null;
      S.lap++;
      S.score = [213 + Math.floor(Math.random() * 300), 7];
      S.returns = 0;
      S.theta = 0;
      S.world = 0;
      S.words = [];
      S.shards = [];
      S.ball.live = false;
      S.serveIn = 1.2;
      S.toPlayer = true;
      to('plain');
      hint(COPY.more, 3);
      blip(120, 0.4, 0.14);
    }
  }

  const tipping = S.stage === 'break' || S.stage === 'tip' || S.stage === 'settle';
  S.zoom += ((S.stage === 'break' || S.stage === 'tip' ? 0.8 : 1) - S.zoom) * Math.min(1, dt * 2.5);
  setDrone(tipping ? 1 : 0, Math.min(1, Math.abs(S.u) / 90));
}

// ---------- every frame: the picture ----------
function drawWorld(alpha) {
  // What is behind the court: a horizon that stays level with the real world however the phone is held.
  const R = HH * 4;
  g.save();
  g.globalAlpha = alpha;
  g.rotate(-rad(S.phi));
  const sky = g.createLinearGradient(0, -R, 0, 0);
  sky.addColorStop(0, '#060a1c');
  sky.addColorStop(0.75, '#1b2a5c');
  sky.addColorStop(1, '#5a6fb8');
  g.fillStyle = sky;
  g.fillRect(-R, -R, 2 * R, R);
  g.fillStyle = '#05050a';
  g.fillRect(-R, 0, 2 * R, R);
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 0.012;
  g.beginPath();
  for (let i = -10; i <= 10; i++) { g.moveTo(i * 0.06, 0); g.lineTo(i * 1.6, R); }
  for (let k = 1; k < 12; k++) { const y = 0.05 * Math.pow(k, 1.85); g.moveTo(-R, y); g.lineTo(R, y); }
  g.stroke();
  g.fillStyle = '#fff';
  g.fillRect(-R, -0.012, 2 * R, 0.024);
  for (let i = 0; i < 40; i++) {
    const x = (((i * 7919) % 1000) / 1000 - 0.5) * 2 * R * 0.6, y = -0.3 - (((i * 104729) % 1000) / 1000) * R * 0.5;
    g.globalAlpha = alpha * (0.4 + 0.5 * Math.abs(Math.sin(S.t * 1.3 + i)));
    g.fillRect(x, y, 0.02, 0.02);
  }
  g.restore();
}

function drawCourt(solid) {
  // The court itself: a black slab with white things on it.
  const out = 0.07;
  if (solid > 0) {
    g.fillStyle = `rgba(0,0,0,${0.5 * solid})`;
    g.fillRect(-HW - out + 0.06, -HH - out + 0.09, 2 * (HW + out), 2 * (HH + out));
  }
  g.fillStyle = '#000';
  g.fillRect(-HW - out, -HH - out, 2 * (HW + out), 2 * (HH + out));
  if (solid > 0) {
    g.strokeStyle = `rgba(255,255,255,${solid})`;
    g.lineWidth = 0.03;
    g.strokeRect(-HW - out, -HH - out, 2 * (HW + out), 2 * (HH + out));
  }
  g.fillStyle = '#fff';
  for (let x = -HW + 0.03; x < HW; x += 0.16) g.fillRect(x, -0.014, 0.085, 0.028);
  pix(S.score[1], clamp(-0.5 + S.digits, -0.72, 0.72), -0.5, 0.085);
  pix(S.score[0], clamp(-0.5 + S.digits, -0.72, 0.72), 0.5, 0.085);
  g.fillStyle = '#fff';
  g.fillRect(S.rival - BAT / 2, -BAT_Y - 0.035, BAT, 0.07);
  g.fillRect(S.bat - BAT / 2, BAT_Y - 0.035, BAT, 0.07);
  if (S.ball.live) g.fillRect(S.ball.x - BALL / 2, S.ball.y - BALL / 2, BALL, BALL);
}

let dots = null;
function halftone() {
  if (dots) return dots;
  const c = document.createElement('canvas');
  c.width = c.height = 14;
  const x = c.getContext('2d');
  x.fillStyle = '#e8361c';
  x.beginPath();
  x.arc(7, 7, 3.4, 0, Math.PI * 2);
  x.fill();
  dots = g.createPattern(c, 'repeat');
  return dots;
}

function rnd(seed) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function comicText(text, x, y, size, fill, tilt = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.font = `${size}px "Bangers", "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = '#000';
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

function picture(img, x, y, size, turn = 0, sx = 1, sy = 1) {
  if (!ready(img)) return;
  g.save();
  g.translate(x, y);
  g.rotate(turn);
  g.scale(sx, sy);
  g.drawImage(img, -size / 2, -size / 2, size, size);
  g.restore();
}

function drawComic() {
  const R = HH * 3;
  // The page: yellow paper, red dots, and black speed lines that never sit still.
  g.fillStyle = '#ffd23c';
  g.fillRect(-R, -R, 2 * R, 2 * R);
  if (!S.lite) {
    g.save();
    g.scale(1 / unit, 1 / unit);
    g.globalAlpha = 0.5;
    g.fillStyle = halftone();
    g.fillRect(-R * unit, -R * unit, 2 * R * unit, 2 * R * unit);
    g.restore();
  }
  g.fillStyle = '#000';
  const lines = S.lite ? 16 : 34;
  for (let i = 0; i < lines; i++) {
    const a = (i / lines) * Math.PI * 2 + rnd(S.boilSeed + i) * 0.12, w = 0.012 + rnd(S.boilSeed * 3 + i) * 0.03, r0 = 1.25 + rnd(S.boilSeed * 7 + i) * 0.7;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * R, Math.sin(a - w) * R);
    g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0 * 1.5);
    g.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
    g.fill();
  }
  // The panel.
  g.fillStyle = '#fff6dc';
  g.strokeStyle = '#000';
  g.lineWidth = 0.07;
  g.fillRect(-HW - 0.04, -HH - 0.04, 2 * HW + 0.08, 2 * HH + 0.08);
  g.save();
  g.beginPath();
  g.rect(-HW - 0.04, -HH - 0.04, 2 * HW + 0.08, 2 * HH + 0.08);
  g.clip();
  g.save();
  g.scale(1 / unit, 1 / unit);
  g.globalAlpha = 0.16;
  g.fillStyle = halftone();
  g.fillRect(-R * unit, -R * unit, 2 * R * unit, 2 * R * unit);
  g.restore();
  for (const s of S.stains) {
    // A splat: inked blobs of tomato, a few seeds, and drips that run.
    const grow = Math.min(1, s.age * 6);
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + s.x * 9, d = (i ? 0.55 + rnd(i + s.x * 31) * 0.5 : 0) * s.r * grow;
      blobs.push([s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.7, s.r * grow * (i ? 0.18 + rnd(i * 5 + s.y) * 0.2 : 0.6)]);
    }
    for (const [colour, extra] of [['#000', 0.035], ['#d93a1e', 0]]) {
      g.fillStyle = colour;
      for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + extra, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 3; i++) {
        const x = s.x + (i - 1) * s.r * 0.45, len = Math.min(s.age * 0.5, 0.25 + rnd(i + s.x) * 0.3) * s.r * 2;
        g.fillRect(x - 0.03 - extra, s.y, 0.06 + extra * 2, len + extra);
        g.beginPath(); g.arc(x, s.y + len, 0.03 + extra, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#ff8a5a';
    g.beginPath(); g.arc(s.x - s.r * 0.18, s.y - s.r * 0.16, s.r * 0.2 * grow, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe9a0';
    for (let i = 0; i < 7; i++) {
      const a = i * 1.3 + s.y * 5, d = s.r * (0.15 + rnd(i * 3 + s.x * 7) * 0.4) * grow;
      g.beginPath(); g.ellipse(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.7, 0.022, 0.012, a, 0, Math.PI * 2); g.fill();
    }
  }
  // Gary, at the far end. When the last tomato lands he leaves, spinning.
  const out = S.garyOut;
  if (out < 2.2) {
    const bob = Math.sin(S.t * 5) * 0.03;
    picture(pictures.gary, S.rival + out * 1.6, -BAT_Y + 0.3 + bob - out * out * 0.9 + S.lunge * 0.18, 1.25 * (1 + S.lunge * 0.12), out * 7, 1, 1);
  }
  // The tomato, and its shadow on the floor.
  const b = S.ball;
  if (b.live) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(b.x + 0.05, b.y + 0.2, 0.17, 0.06, 0, 0, Math.PI * 2);
    g.fill();
    if (S.inReach) {
      // Within reach: a jagged flash behind it says "now".
      g.fillStyle = Math.floor(S.t * 14) % 2 ? '#ffe04a' : '#fff';
      g.strokeStyle = '#000';
      g.lineWidth = 0.025;
      g.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2 + S.t * 2, r = i % 2 ? 0.3 : 0.44;
        g.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }
    const wob = S.soggy ? 1 + Math.sin(S.t * 14) * 0.09 : 1;
    picture(pictures.tomato, b.x, b.y, 0.5, b.spin, wob, 2 - wob);
  }
  // Your fist. It draws back and trembles when the tomato is in reach, and punches up on a swing.
  const windUp = S.inReach && S.jab <= 0 ? 1 : 0;
  const punchUp = Math.sin(Math.min(1, (1 - S.jab) * 1.6) * Math.PI) * (S.jab > 0 ? 0.62 : 0);
  picture(pictures.fist, S.bat + windUp * (Math.random() - 0.5) * 0.03, BAT_Y - 0.15 + windUp * 0.1 - punchUp, 0.95 * (1 + (S.jab > 0 ? 0.22 : 0) * Math.sin(S.jab * Math.PI)), rad(S.u) * 0.5, 1, 1);
  g.restore();
  g.strokeRect(-HW - 0.04, -HH - 0.04, 2 * HW + 0.08, 2 * HH + 0.08);

  for (const w of S.words) {
    const pop = Math.min(1, w.age * 9), fade = w.age > 0.65 ? 1 - (w.age - 0.65) / 0.25 : 1;
    g.save();
    g.globalAlpha = Math.max(0, fade);
    g.translate(clamp(w.x, -0.55, 0.55), w.y);
    g.rotate(w.tilt);
    g.scale(pop, pop);
    // A jagged burst behind the word.
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 0.035;
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r = i % 2 ? 0.34 : 0.56 + rnd(i + w.x * 17) * 0.12;
      g.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.75);
    }
    g.closePath();
    g.fill();
    g.stroke();
    comicText(w.text, 0, 0.02, 0.3, w.colour);
    g.restore();
  }
  if (S.stage === 'ko') comicText(COPY.ko, 0, -0.1, 0.27, '#ffe04a', -0.08);
}

function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  if (turnedPage) g.rotate(-rad(screenAngle()));
  g.scale(unit, unit);

  const comic = S.stage === 'whack' || S.stage === 'ko';
  const breaking = S.stage === 'punch' && S.t > 1.0;
  if (S.world > 0 && !comic) drawWorld(S.world);

  g.save();
  if (S.shake > 0) g.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  g.rotate(rad(S.theta));
  g.scale(S.zoom, S.zoom);
  if (comic || breaking) {
    g.save();
    if (breaking) {
      // The comic shows through a jagged hole that opens from the middle.
      const open = ease(clamp((S.t - 1.0) / 0.7, 0, 1)) * HH * 2.6;
      g.beginPath();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, r = open * (i % 2 ? 0.7 : 1);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.clip();
    }
    drawComic();
    g.restore();
    // What is left of the court flies off in pieces.
    for (const s of S.shards) {
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.rot);
      g.fillStyle = '#000';
      g.strokeStyle = '#fff';
      g.lineWidth = 0.025;
      g.beginPath();
      g.moveTo(-s.size / 2, -s.size / 3);
      g.lineTo(s.size / 2, -s.size / 5);
      g.lineTo(0, s.size / 2);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  } else {
    drawCourt(S.world);
    if (S.stage === 'punch') {
      // The dents, before it gives.
      const hits = S.t > 0.5 ? 1 : 0;
      g.strokeStyle = '#fff';
      g.lineWidth = 0.02;
      for (let k = 0; k < hits; k++) {
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 + 0.3, r = 0.15 + rnd(i + 3) * 0.55;
          g.moveTo(0, 0);
          g.lineTo(Math.cos(a) * r * 0.5 + rnd(i) * 0.06, Math.sin(a) * r * 0.5);
          g.lineTo(Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r);
        }
        g.stroke();
      }
    }
  }
  g.restore();

  // Words for the player, the right way up for the phone.
  if (S.stage === 'title') {
    if (Math.floor(performance.now() / 500) % 2) pix(COPY.tap, 0, 0.9, 0.042);
    pix(COPY.holdUp, 0, 1.15, 0.03, '#888');
    if (!matchMedia('(pointer: coarse)').matches) pix(COPY.keys, 0, HH + 0.12, 0.016, '#666');
  } else if (S.hintFor > 0) {
    if (comic) comicText(S.hint, 0, 0.55, 0.42, '#ffe04a', -0.06);
    else {
      const flashOn = S.hintFor > 0.4 || Math.floor(S.hintFor * 12) % 2;
      if (flashOn) pix(S.hint, 0, S.stage === 'plain' ? 0.95 : HH + 0.1, S.stage === 'plain' ? 0.06 : 0.035);
    }
  }
  if (S.noSensor && S.stage !== 'title') pix(COPY.noSensor, 0, -HH - 0.1, 0.022, '#f55');
}

everyFrame(dt => {
  // If frames are taking too long for a while, draw the comic more simply from then on.
  S.slow += ((dt > 0.028 ? 1 : 0) - S.slow) * 0.02;
  if (S.slow > 0.5) S.lite = true;
  update(dt);
  draw();
});

// ---------- start ----------
// A real swing is a shove and then a stop, which reads as two jolts. Only the first counts:
// the phone has to settle before it can swing again.
let armed = true;
motion.onSample = ({ accel, key }) => {
  if (accel < SWING_REARM) armed = true;
  if (armed && accel > SWING) { armed = false; swing(); }
  if (key) armed = true;
};

async function start() {
  if (S.started) return;
  S.started = true;
  audioOn();
  sfx.unlock();
  await motion.start();
  resize();
  S.score = [0, 0];
  S.returns = 0;
  S.bat = 0;
  S.ball.live = false;
  S.serveIn = 0.7;
  S.toPlayer = true;
  to('plain');
  hint(COPY.tilt, 3.5);
  blip(480, 0.08);
  // A phone that never reports movement cannot play this.
  setTimeout(() => { S.noSensor = matchMedia('(pointer: coarse)').matches && !motion.motionLive; }, 2500);
}
canvas.addEventListener('pointerdown', start);
addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') start(); });
serve(true);

// For testing from the console: jump to a stage, turn the pretend phone, or let it play itself.
window.rally = {
  S,
  test,
  motion,
  start,
  swing,
  jump(stage) {
    S.started = true;
    S.theta = 0;
    S.shards = [];
    S.words = [];
    if (stage === 'whack') { to('punch'); S.t = 0.95; S.ball.live = false; return; }
    if (stage === 'tip') { S.returns = PLAIN_RETURNS; to('plain'); return; }
    to(stage);
  },
};
