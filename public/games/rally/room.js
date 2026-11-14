// Rally, stage 6: it gets out.
//
// The camera comes on and the ball is loose in your actual room, which is shown as stark
// black and white dots. It hangs somewhere around you. Turn and tip the phone to find it,
// get it in the middle of the screen and swing to swat it. It flies off somewhere else.
//
// The phone cannot tell where you walk, only where it points, so the ball lives on a ball of
// directions around you: so many degrees round, so many degrees up.

const SWATS = 5;               // swats to finish the stage
const LIMIT = 40;              // seconds: it ends anyway
const FOV = 62;                // roughly how many degrees a phone's back camera sees, top to bottom
const ZONE = 0.3;              // how near the middle of the screen it must be to swat, as a share of the screen's width
const DOTS_ACROSS = 96;        // how coarse the dots are
const BORED = 3.5;             // seconds it will sit in your sights before wandering off
const GRACE = 0.4;             // a swing drags the phone off target, so being on it this recently still counts
const ASK_WAIT = 15;           // seconds to wait for an answer about the camera before carrying on without it
// A 4 by 4 pattern of thresholds: the old trick for showing greys with only black and white.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function roomStage(K) {
  const { g, S, COPY, rad, wrap, clamp, buzz } = K;
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const M = { t: 0, cam: null, asking: false, swats: 0, ball: { h: 0, p: 0, vh: 12, vp: 6 }, fly: null, sat: 0, lastIn: -9, fizz: 1, punch: 0, armed: true };

  let asked = 0;                 // counts requests, so a slow answer to an old one is ignored
  async function openCam(facing) {
    const mine = ++asked;
    M.cam?.stop();
    M.cam = null;
    M.asking = true;
    // If the phone's question goes unanswered, carry on without the camera rather than sit on black.
    setTimeout(() => { if (mine === asked) M.asking = false; }, ASK_WAIT * 1000);
    let cam;
    try { cam = await K.openCamera(video, { facing, width: 640, height: 480 }); } catch { cam = { ok: false, stop() {} }; }
    if (mine !== asked) { cam.stream?.getTracks().forEach(t => t.stop()); return false; }
    M.cam = cam;
    M.asking = false;
    return cam.ok;
  }

  function enter() {
    M.t = 0;
    M.swats = 0;
    M.fizz = 1;
    M.sat = 0;
    M.lastIn = -9;
    M.fly = null;
    M.ball.h = (S.heading + 30) % 360;
    M.ball.p = 8;
    openCam('environment');
  }

  // Where on the screen a direction is. Null if it is behind you.
  function place(h, p) {
    const { W, H } = K.view();
    const dh = wrap(h - S.heading), dp = p - S.pitch;
    if (Math.abs(dh) > 75 || Math.abs(dp) > 75) return null;
    const f = (H / 2) / Math.tan(rad(FOV / 2));
    // If the phone is turned like a steering wheel, the room turns the other way on its screen.
    const x = Math.tan(rad(dh)) * f, y = -Math.tan(rad(dp)) * f, r = -rad(S.phi);
    return { x: W / 2 + x * Math.cos(r) - y * Math.sin(r), y: H / 2 + x * Math.sin(r) + y * Math.cos(r) };
  }

  function inZone() {
    const { W, H } = K.view();
    const at = place(M.ball.h, M.ball.p);
    return !!at && !M.fly && Math.hypot(at.x - W / 2, at.y - H / 2) < ZONE * W;
  }

  // Send it somewhere else in the room, well away from where you are looking.
  function flyOff(swatted) {
    const turn = (100 + Math.random() * 150) * (Math.random() < 0.5 ? -1 : 1);
    M.fly = { h0: M.ball.h, p0: M.ball.p, h1: M.ball.h + (swatted ? turn : turn * 0.5), p1: -18 + Math.random() * 45, age: 0, swatted };
    M.sat = 0;
    M.lastIn = -9;
  }

  function swing() {
    if (M.asking || M.fly) return;
    M.punch = 1;
    if (!inZone() && M.t - M.lastIn > GRACE) { K.sfx.play('whoosh', { volume: 0.6 }); return; }
    M.swats++;
    K.sfx.play('punch', { volume: 1 });
    K.tone({ freq: 480, dur: 0.07, vol: 0.14 });
    buzz(70);
    S.shake = 0.08;
    flyOff(true);
  }

  function update(dt) {
    if (M.asking) return false;               // the phone is asking about the camera: wait
    M.t += dt;
    M.fizz = Math.max(0, M.fizz - dt * 1.4);
    M.punch = Math.max(0, M.punch - dt * 4);
    const b = M.ball;
    if (M.fly) {
      const f = M.fly;
      f.age += dt;
      const k = Math.min(1, f.age / 0.55), e = k * k * (3 - 2 * k);
      b.h = (f.h0 + (f.h1 - f.h0) * e + 720) % 360;
      b.p = f.p0 + (f.p1 - f.p0) * e;
      if (k >= 1) M.fly = null;
    } else {
      // It drifts about on its own, and will not go too near the ceiling or the floor.
      b.h = (b.h + b.vh * dt + 360) % 360;
      b.p += b.vp * dt;
      if (b.p > 30 || b.p < -22) { b.vp = -b.vp; b.p = clamp(b.p, -22, 30); }
      if (Math.random() < dt * 0.4) b.vh = (Math.random() - 0.5) * 36;
      if (inZone()) {
        if (M.sat === 0) buzz(15);
        M.lastIn = M.t;
        M.sat += dt;
        if (M.sat > BORED) { K.sfx.play('boing', { volume: 0.6 }); flyOff(false); }
      } else {
        M.sat = 0;
      }
    }
    return M.swats >= SWATS || M.t > LIMIT;
  }

  // ---------- the picture ----------
  function dots() {
    const { W, H } = K.view();
    const w = DOTS_ACROSS, h = Math.max(8, Math.round((DOTS_ACROSS * H) / W));
    if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
    const live = M.cam?.ok && video.videoWidth > 0;
    if (live) {
      // Fill the little picture from the middle of the camera's, keeping its shape.
      const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
      const sw = w / scale, sh = h / scale;
      sctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
    } else {
      // No camera: a made-up room, so there is still something that turns when you turn.
      const sky = sctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#888');
      sky.addColorStop(0.55 + S.pitch / 120, '#ddd');
      sky.addColorStop(0.56 + S.pitch / 120, '#555');
      sky.addColorStop(1, '#222');
      sctx.fillStyle = sky;
      sctx.fillRect(0, 0, w, h);
      sctx.fillStyle = '#111';
      for (let d = 0; d < 360; d += 45) {
        const dh = wrap(d - S.heading);
        if (Math.abs(dh) < 60) sctx.fillRect(w / 2 + Math.tan(rad(dh)) * w * 0.9 - 1, 0, 2 + (d % 90 ? 0 : 3), h);
      }
    }
    const img = sctx.getImageData(0, 0, w, h), px = img.data;
    // Stretch the picture's brightness to fill black-to-white first, so a dim room still shows.
    let lo = 255, hi = 0;
    for (let i = 0; i < px.length; i += 16) { const l = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8; if (l < lo) lo = l; if (l > hi) hi = l; }
    const span = Math.max(40, hi - lo);
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        let l = ((((px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8) - lo) * 255) / span;
        if (M.fizz > 0) l += (Math.random() - 0.5) * 510 * M.fizz;       // it arrives out of static
        const on = l > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) * 16 ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = on;
        px[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    return W / w;                                       // how big one dot is on the screen
  }

  function draw() {
    const { W, H } = K.view();
    K.screenSpace();
    if (M.asking) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      return;
    }
    const dot = dots();
    const snap = v => Math.round(v / dot) * dot;
    const b = M.ball, at = place(b.h, b.p);
    const size = snap(W * (M.fly ? 0.1 + Math.sin(Math.min(1, M.fly.age / 0.55) * Math.PI) * 0.22 : 0.12));
    const close = inZone();

    if (at) {
      // The same plain square ball as stage one, loose in the world.
      const x = snap(at.x - size / 2), y = snap(at.y - size / 2);
      g.fillStyle = '#000';
      g.fillRect(x - dot, y - dot, size + dot * 2, size + dot * 2);
      g.fillStyle = '#fff';
      g.fillRect(x, y, size, size);
      if (close) {
        // Sights round it when it can be swatted.
        const s = size * 0.9 + dot * 3, c = dot * 2, flash = Math.floor(M.t * 10) % 2 ? '#fff' : '#000';
        g.fillStyle = flash;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          g.fillRect(snap(at.x + sx * s) - (sx > 0 ? c * 2 : 0), snap(at.y + sy * s), c * 2, dot);
          g.fillRect(snap(at.x + sx * s), snap(at.y + sy * s) - (sy > 0 ? c * 2 : 0), dot, c * 2);
        }
      }
    } else {
      // It is off the screen: blocky arrows on the side to turn towards.
      const side = Math.sign(wrap(b.h - S.heading)) || 1;
      if (Math.floor(M.t * 4) % 2) {
        for (let i = 0; i < 3; i++) {
          const x = W / 2 + side * (W * 0.3 + i * dot * 4), y = H / 2;
          g.fillStyle = '#000';
          g.fillRect(snap(x) - dot, snap(y) - dot * 4, dot * 4, dot * 8);
          g.fillStyle = '#fff';
          for (let k = 0; k < 3; k++) {
            g.fillRect(snap(x) + side * k * dot, snap(y) - (3 - k) * dot, dot, dot);
            g.fillRect(snap(x) + side * k * dot, snap(y) + (2 - k) * dot, dot, dot);
          }
        }
      }
    }
    // Swats so far, as blocks along the top.
    for (let i = 0; i < SWATS; i++) {
      const x = snap(W / 2 + (i - (SWATS - 1) / 2) * dot * 5 - dot * 1.5), y = snap(dot * 5);
      g.fillStyle = '#000';
      g.fillRect(x - dot, y - dot, dot * 5, dot * 5);
      g.fillStyle = '#fff';
      g.fillRect(x, y, dot * 3, dot * 3);
      if (i >= M.swats) { g.fillStyle = '#000'; g.fillRect(x + dot, y + dot, dot, dot); }
    }
    if (M.punch > 0) {
      g.fillStyle = `rgba(255,255,255,${M.punch * 0.35})`;
      g.fillRect(0, 0, W, H);
    }
    K.courtSpace();
    if (close && M.swats === 0 && Math.floor(M.t * 3) % 2) K.pix(COPY.swingShort, 0, 1.2, 0.07, '#fff');
  }

  // How the last stage shows this world: the room in dots, behind a plain white ball and bats.
  const skin = {
    paint() {
      const { W, H } = K.view();
      g.save();
      K.screenSpace();
      dots();
      g.restore();
    },
    ball(x, y) {
      g.fillStyle = '#000';
      g.fillRect(x - K.BALL, y - K.BALL, K.BALL * 2, K.BALL * 2);
      g.fillStyle = '#fff';
      g.fillRect(x - K.BALL * 0.7, y - K.BALL * 0.7, K.BALL * 1.4, K.BALL * 1.4);
    },
    bat(x, y) {
      g.fillStyle = '#000';
      g.fillRect(x - K.BAT / 2 - 0.02, y - 0.055, K.BAT + 0.04, 0.11);
      g.fillStyle = '#fff';
      g.fillRect(x - K.BAT / 2, y - 0.035, K.BAT, 0.07);
    },
  };

  return {
    enter, update, draw, swing, skin, openCam, video,
    stop() { asked++; M.cam?.stop(); M.cam = null; M.asking = false; },
    get ball() { return M.ball; },
    get state() { return { t: M.t, swats: M.swats, asking: M.asking, camera: !!M.cam?.ok, inZone: inZone(), flying: !!M.fly }; },
  };
}
