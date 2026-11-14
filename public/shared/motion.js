// Tilt, shake and footstep sensing shared by the arcade's phone games.
//
//   const motion = createMotion();
//   startButton.onclick = () => motion.start();    // must come from a tap
//   each frame: motion.read(); then use motion.tilt.x / motion.tilt.y (degrees)
//   motion.onSample = ({ accel, dt }) => ...       // every motion reading
//   motion.onStep = strength => ...                // every footstep
//   motion.faceDown()                              // true while the screen faces the floor
//   motion.faceUp()                                // true while the screen faces the sky
//   motion.resetTurn(); motion.turned()            // degrees you have turned on the spot since the reset
//   motion.raw()                                   // { alpha, beta, gamma } as the phone reports them, or null
//   motion.roll()                                  // degrees the phone is turned like a steering wheel: 0 upright,
//                                                  // + clockwise as you look at it, 180 upside down
//   motion.look()                                  // { heading, pitch } in degrees: where the back of the phone points.
//                                                  // heading grows as you turn to your right; pitch is + when it points up
//
// Tilt comes from device orientation; shake and steps from device motion.
// Both only exist on secure (https) pages. Without them, keys stand in:
// arrows tilt, space shakes (Shift+space gently), Enter takes a step,
// holding F counts as face down, holding U as face up, holding T turns you on the spot.
// For roll: left and right arrows turn the pretend phone a little, Q and E keep turning it.
// For look: A and D turn your pretend body, W and S tip the phone up and down.

const G = 9.81;

export function createMotion({ keyTilt = 15 } = {}) {
  const m = {
    tilt: { x: 0, y: 0 },      // degrees from "level", in screen directions (+x right, +y down)
    live: false,               // orientation readings arriving
    motionLive: false,         // acceleration readings arriving
    accel: 0,                  // gravity-free acceleration strength, m/s²
    secure: window.isSecureContext,
    stepHigh: 1.3,             // how far above gravity a bounce must go to count as a step
    stepLow: 0.5,              // how far below it must dip first
    onSample: null,
    onStep: null,
    start, level, read, stillFor, faceDown, faceUp, resetTurn, turned, raw, roll, look,
  };

  let alpha = null, beta = null, gamma = null, base = null, turnSum = 0;
  const keys = new Set();
  let lpX = 0, lpY = 0, lpZ = 0, haveLp = false;
  let fastX = 0, fastY = 0, gravitySign = 1, keyRoll = 0, keyLean = 0, keyHeading = 0, keyPitch = 0;
  let baseline = G, smooth = G, armed = false, lastStep = 0, lastMotion = 0;
  let quietSince = performance.now();

  function screenAngle() {
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    return ((a % 360) + 360) % 360;
  }

  function onOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    if (e.alpha !== null && e.alpha !== undefined) {
      if (alpha !== null) { let d = e.alpha - alpha; if (d > 180) d -= 360; if (d < -180) d += 360; turnSum += d; }
      alpha = e.alpha;
    }
    beta = e.beta; gamma = e.gamma;
    m.live = true;
    if (!base) level();
  }

  function onMotion(e) {
    const now = performance.now();
    const dt = Math.min(0.1, e.interval > 0 ? (e.interval > 1 ? e.interval / 1000 : e.interval) : (now - (lastMotion || now)) / 1000 || 1 / 60);
    lastMotion = now;
    const g = e.accelerationIncludingGravity;
    let x, y, z, gmag = null;
    if (g && g.x !== null) {
      gmag = Math.hypot(g.x, g.y, g.z);
      if (!haveLp) { lpX = g.x; lpY = g.y; lpZ = g.z; haveLp = true; }
      lpX = lpX * 0.9 + g.x * 0.1; lpY = lpY * 0.9 + g.y * 0.1; lpZ = lpZ * 0.9 + g.z * 0.1;
      // A quicker average for roll, which has to keep up with a turning wrist.
      fastX = fastX * 0.7 + g.x * 0.3; fastY = fastY * 0.7 + g.y * 0.3;
      // Some phones report gravity the other way up. With the phone held upright the angle sensor says which.
      if (beta !== null && Math.abs(beta - 90) < 40 && Math.abs(gamma) < 30 && Math.abs(lpY) > 5) gravitySign = lpY > 0 ? 1 : -1;
    }
    if (e.acceleration && e.acceleration.x !== null) ({ x, y, z } = e.acceleration);
    else if (gmag !== null) { x = g.x - lpX; y = g.y - lpY; z = g.z - lpZ; }
    else return;
    m.motionLive = true;
    m.accel = Math.hypot(x, y, z);
    if (m.accel > 1.2) quietSince = now;
    if (gmag !== null) detectStep(gmag, now);
    m.onSample?.({ accel: m.accel, dt, now });
  }

  // A footstep is a dip below gravity followed by a bounce above it.
  function detectStep(gmag, now) {
    baseline = baseline * 0.99 + gmag * 0.01;
    smooth = smooth * 0.7 + gmag * 0.3;
    if (smooth < baseline - m.stepLow) armed = true;
    if (armed && smooth > baseline + m.stepHigh && now - lastStep > 280) {
      armed = false;
      lastStep = now;
      m.onStep?.(smooth - baseline);
    }
  }

  function level() {
    if (beta !== null) base = { beta, gamma };
  }

  function read() {
    if (m.live && base) {
      let db = beta - base.beta, dg = gamma - base.gamma;
      if (db > 180) db -= 360;
      if (db < -180) db += 360;
      const map = { 0: [dg, db], 90: [db, -dg], 180: [-dg, -db], 270: [-db, dg] }[screenAngle()] || [dg, db];
      m.tilt.x = map[0];
      m.tilt.y = map[1];
    } else {
      let tx = 0, ty = 0;
      if (keys.has('ArrowLeft')) tx -= keyTilt;
      if (keys.has('ArrowRight')) tx += keyTilt;
      if (keys.has('ArrowUp')) ty -= keyTilt;
      if (keys.has('ArrowDown')) ty += keyTilt;
      if (keys.has('KeyT')) turnSum += 6;
      m.tilt.x += (tx - m.tilt.x) * 0.25;
      m.tilt.y += (ty - m.tilt.y) * 0.25;
    }
    return m.tilt;
  }

  // Screen facing the floor. Edge-on readings are unreliable, so those don't count.
  function faceDown() {
    if (m.live && beta !== null) return Math.abs(beta) > 125 && Math.abs(gamma) < 65;
    return keys.has('KeyF');
  }

  // Screen facing the sky: lying flat, or close to it.
  function faceUp() {
    if (m.live && beta !== null) return Math.abs(beta) < 30 && Math.abs(gamma) < 30;
    return keys.has('KeyU');
  }

  // How far the phone is turned like a steering wheel, from which way gravity pulls across the screen.
  // Only meaningful while the screen is roughly upright, not lying flat.
  function roll() {
    if (m.motionLive && haveLp) return (Math.atan2(-gravitySign * fastX, gravitySign * fastY) * 180) / Math.PI;
    const lean = (keys.has('ArrowRight') ? 25 : 0) - (keys.has('ArrowLeft') ? 25 : 0);
    keyLean += (lean - keyLean) * 0.25;
    keyRoll += (keys.has('KeyE') ? 2.5 : 0) - (keys.has('KeyQ') ? 2.5 : 0);
    let r = (keyRoll + keyLean) % 360;
    if (r > 180) r -= 360;
    if (r < -180) r += 360;
    return r;
  }

  // Where the back of the phone points, worked out from all three angles together. A plain compass
  // reading falls apart when the phone is held upright; this does not.
  function look() {
    if (m.live && alpha !== null) {
      const k = Math.PI / 180, a = alpha * k, b = beta * k, c = gamma * k;
      const sA = Math.sin(a), cA = Math.cos(a), sB = Math.sin(b), cB = Math.cos(b), sG = Math.sin(c), cG = Math.cos(c);
      const x = -(cG * sA * sB + cA * sG), y = -(sA * sG - cA * cG * sB), z = -(cB * cG);
      return { heading: ((Math.atan2(x, y) / k) + 360) % 360, pitch: Math.asin(Math.max(-1, Math.min(1, z))) / k };
    }
    keyHeading = (keyHeading + (keys.has('KeyD') ? 2.5 : 0) - (keys.has('KeyA') ? 2.5 : 0) + 360) % 360;
    keyPitch = Math.max(-80, Math.min(80, keyPitch + (keys.has('KeyW') ? 1.5 : 0) - (keys.has('KeyS') ? 1.5 : 0)));
    return { heading: keyHeading, pitch: keyPitch };
  }

  function resetTurn() { turnSum = 0; }
  function turned() { return Math.abs(turnSum); }
  function raw() { return m.live ? { alpha, beta, gamma } : null; }

  // Milliseconds since the phone last moved noticeably.
  function stillFor() { return performance.now() - quietSince; }

  let wakeLock = null;
  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock?.released) keepAwake();
  });

  let started = false;
  async function start() {
    if (started) return;
    started = true;
    // iPhones ask permission for motion; Android does not.
    for (const Ev of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
      if (Ev && typeof Ev.requestPermission === 'function') {
        try { await Ev.requestPermission(); } catch { /* refused */ }
      }
    }
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    // Stop the screen rotating or sleeping mid-game. Best effort.
    if (matchMedia('(pointer: coarse)').matches) {
      try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* not allowed */ }
      try { await screen.orientation?.lock?.('portrait'); } catch { /* not allowed */ }
    }
    keepAwake();
  }

  // Keyboard stand-ins for testing without a phone.
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); }
    else if (['KeyF', 'KeyU', 'KeyT', 'KeyQ', 'KeyE', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) keys.add(e.code);
    else if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      quietSince = performance.now();
      m.onSample?.({ accel: e.shiftKey ? 8 : 22, dt: 0.15, now: performance.now(), key: true });
    } else if (e.key === 'Enter' && !e.repeat) {
      m.onStep?.(1.8);
    }
  });
  addEventListener('keyup', e => { keys.delete(e.key); keys.delete(e.code); });

  return m;
}

export function buzz(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

// Tiny synth for blips and thuds. Call unlock() from a tap first.
export function createSound() {
  let ctx = null;
  const s = {
    muted: false,
    unlock() {
      try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch { ctx = null; }
    },
    tone(freq, dur = 0.08, type = 'square', vol = 0.05, slideTo = null, delay = 0) {
      if (s.muted || !ctx) return;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur = 0.3, vol = 0.08, delay = 0, from = 1800, to = 300) {
      if (s.muted || !ctx) return;
      const t = ctx.currentTime + delay;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf;
      f.type = 'bandpass';
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(t);
    },
  };
  return s;
}
