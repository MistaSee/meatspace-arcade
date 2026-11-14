// A pretend phone for Rally's comic stage. Unlike rally.test.auto, this one sends the same
// sensor events a real phone would, including a swing that looks like a real swing: a shove,
// a pause and a stop, with gravity swamped while it happens.
//   await import('/__test/rally-bot.js')
//   __rbot.early   seconds before the tomato is in reach that it starts its swing (default 0.12)
//   __rbot.report  what happened
const R = window.rally, S = R.S;
const bot = { on: true, early: 0.12, swings: 0, counted: 0, whacks0: 0, jump: 0, report: null, log: [] };
window.__rbot = bot;
window.__errs = window.__errs || [];
addEventListener('error', e => window.__errs.push(e.message));

const HW = 1, BAT = 0.5, BAT_Y = 1.52, STEER = 26, REACH_UP = 0.9, SOGGY = 0.85;
let roll = 0, swingAt = -1, n = 0, wasRest = 0, batBefore = 0;
function send(linear, gx) {
  const r = (roll * Math.PI) / 180;
  window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 }));
  window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
    acceleration: { x: linear, y: 0, z: 0 },
    accelerationIncludingGravity: { x: -9.8 * Math.sin(r) + gx, y: 9.8 * Math.cos(r), z: 0 },
    interval: 16,
  }));
}
setInterval(() => {
  if (!bot.on) return;
  n++;
  const b = S.ball;
  if (S.stage === 'whack') {
    // Steer the fist under the tomato.
    const aim = b.live ? b.x : 0;
    roll += (Math.max(-1, Math.min(1, aim / (HW - BAT / 2))) * STEER - roll) * 0.2;
    // Start a swing a little before it is in reach.
    const untilReach = (BAT_Y - REACH_UP - b.y) / SOGGY;
    if (swingAt < 0 && b.live && b.vy > 0 && untilReach < bot.early && untilReach > bot.early - 0.05) { swingAt = n; bot.swings++; batBefore = S.bat; }
  }
  let linear = 0.3, gx = 0;
  if (swingAt >= 0) {
    const k = n - swingAt;
    if (k < 5) { linear = 16; gx = 12; }            // the shove
    else if (k < 11) { linear = 2; gx = 0; }        // the pause
    else if (k < 16) { linear = 17; gx = -12; }     // the stop
    else if (k > 40) swingAt = -1;
    if (k < 16) bot.jump = Math.max(bot.jump, Math.abs(S.bat - batBefore));
  }
  if (S.swingRest > 0 && wasRest <= 0) bot.counted++;      // the game counted a swing
  wasRest = S.swingRest;
  send(linear, gx);
  bot.report = { stage: S.stage, physicalSwings: bot.swings, swingsTheGameCounted: bot.counted, whacks: S.whacks, missed: S.stains.length, fistJumpDuringSwing: +bot.jump.toFixed(3), lite: S.lite };
}, 16);
