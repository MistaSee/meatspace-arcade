// A pretend phone that plays Shake Duel, for automated checks.
// In the browser console on the local server:  await import('/__test/duel-bot.js')
//   __bot.mode   'good' (dodges, picks the best move) | 'bad' (never dodges) | 'random' | 'dither' (never attacks)
//   __bot.force  'shake' | 'tap' | 'twist' | 'flip' to always use one move
//   __bot.lines  what the game said after each move;  __bot.log  the phases it went through
const D = window.__duel;
const bot = { beta: 60, gamma: 0, log: [], lines: [], on: true, mode: 'good', t: 0, picks: [], want: null, force: null, since: 0, auto: true };
window.__bot = bot;
window.__errs = [];
addEventListener('error', e => window.__errs.push(e.message));
addEventListener('unhandledrejection', e => window.__errs.push(String(e.reason)));

const ori = () => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: bot.beta, gamma: bot.gamma }));
const mot = a => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: a, y: 0, z: 0 }, accelerationIncludingGravity: { x: a, y: 0, z: 9.8 }, interval: 16 }));
const tap = () => document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 150 + Math.random() * 80, clientY: 600 }));
let lastPhase = '', lastLine = '', n = 0;

function decide() {
  const s = D.state, f = D.foe;
  let best = 'shake', bestM = -9;
  for (const id of s.known) { const m = D.typeMult(f.type, D.moves[id].element); if (m > bestM) { best = id; bestM = m; } }
  if (bot.force && s.known.includes(bot.force)) best = bot.force;
  if (bot.mode === 'random') best = s.known[Math.floor(Math.random() * s.known.length)];
  bot.want = best;
  bot.picks.push(best + '@' + f.type);
  bot.since = performance.now();
}

setInterval(() => {
  if (!bot.on) return;
  bot.t += 0.03;
  n++;
  const ph = D.phase, prompt = document.getElementById('prompt').textContent;
  const line = document.getElementById('sr').textContent;
  if (line && line !== lastLine) {
    lastLine = line;
    if (ph === 'resolve') { bot.lines.push((D.foe ? D.foe.short : '') + ': ' + line); if (bot.lines.length > 80) bot.lines.shift(); }
  }
  if (bot.auto) {
    const lo = document.getElementById('learn');
    if (!lo.hidden) { bot.lines.push('LEARN ' + document.getElementById('learn-name').textContent); document.getElementById('learn-go').click(); }
    const io = document.getElementById('intro');
    if (!io.hidden) io.click();
  }
  if (ph !== lastPhase) {
    bot.log.push(ph + ':' + prompt);
    if (bot.log.length > 400) bot.log.shift();
    lastPhase = ph;
    if (ph === 'choose') decide();
  }
  let beta = 60, gamma = 0, a = 0.2;
  if (ph === 'dodge') {
    const push = prompt.includes('PUSH');
    let dir = prompt.includes('→') ? 'r' : prompt.includes('←') ? 'l' : prompt.includes('↑') ? 'u' : prompt.includes('↓') ? 'd' : '';
    if (push) dir = { r: 'l', l: 'r', u: 'd', d: 'u' }[dir];
    if (bot.mode === 'bad') dir = '';
    if (dir === 'r') gamma = 25;
    if (dir === 'l') gamma = -25;
    if (dir === 'u') beta = 35;
    if (dir === 'd') beta = 85;
  } else if (ph === 'hide') {
    beta = bot.mode === 'bad' ? 60 : 170;
  } else if (ph === 'choose' || ph === 'cast' || ph === 'shake') {
    const w = bot.want, since = performance.now() - bot.since;
    if (bot.mode === 'dither' || since < 700) { /* wait */ }
    else if (w === 'shake') a = (D.foe.punch === 'tickle' ? 8 : 20) + Math.random() * 3;
    else if (w === 'tap') { if (n % 4 === 0) tap(); }
    else if (w === 'twist') gamma = 30 * Math.sign(Math.sin(bot.t * 14));
    else if (w === 'flip') beta = since < (bot.slowFlip ? 5000 : 1500) ? 170 : 60;
  }
  const k = (ph === 'cast' || ph === 'choose' || ph === 'hide') ? 0.7 : 0.5;
  bot.beta += (beta - bot.beta) * k;
  bot.gamma += (gamma - bot.gamma) * k;
  ori();
  mot(a);
}, 30);
