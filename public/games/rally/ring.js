// Rally, stages 4 and 5: the court wraps round you.
//
// You are the mark in the middle of a radar plate torn from a battered field manual. The
// ball goes out, comes back in from some other side, and you turn your whole body to face
// it. Then the lights go out, and you do the same thing by ear.
//
// The plate turns as you turn, so "ahead" is always the top of the screen.

const BAT_R = 0.36;          // how far out from the middle your bat sits, as a share of the plate
const ARC = 24;              // degrees either side of dead ahead that your bat covers
const OUT_SPEED = 0.95;      // plate-widths a second, going out
const IN_SPEED = 0.3;        // coming back in, to start with
const SPEED_UP = 1.07;       // each return makes the next a little quicker
const DARK_SLOW = 0.8;       // in the dark it comes in slower: finding it by ear takes longer than by eye
const LIT = { returns: 5, limit: 36, swing: [40, 170] };     // how far round it can come back, in degrees
const DARK = { returns: 4, limit: 30, swing: [50, 130] };
const INK = { paper: '#0b0420', panel: '#120830', bone: '#f4ecda', pink: '#ff3ea5', cyan: '#2ee6ff', green: '#5cff8f', amber: '#ffb03b' };
const FONT = { head: '"TS Archivo", "Arial Narrow", Impact, sans-serif', mono: '"TS Mono", ui-monospace, monospace', readout: '"TS Readout", ui-monospace, monospace', hand: '"TS Marker", cursive' };

export { INK, FONT };

export function ringStage(K) {
  const { g, S, COPY, rad, wrap, clamp, rnd, buzz } = K;
  const R = { t: 0, dark: false, bearing: 0, r: BAT_R, vr: 0, drift: 0, speed: IN_SPEED, returns: 0, misses: 0, passed: false, hold: 0,
    stamp: '', stampAge: 9, stampColour: INK.green, sweep: 0, beepIn: 0, flash: 0, quiet: 0, trail: [] };

  const rules = () => (R.dark ? DARK : LIT);
  const off = () => wrap(R.bearing - S.heading);          // how far round from dead ahead the ball is

  function stamp(text, colour) {
    R.stamp = text;
    R.stampAge = 0;
    R.stampColour = colour;
  }

  // Send it out from your bat. On the way out it curls round, so it comes back from somewhere else.
  function sendOut() {
    const [lo, hi] = rules().swing;
    const most = Math.min(hi, lo + 25 + R.returns * 28);
    const turn = (lo + Math.random() * (most - lo)) * (Math.random() < 0.5 ? -1 : 1);
    R.r = BAT_R;
    R.vr = OUT_SPEED;
    R.drift = turn / ((1 - BAT_R) / OUT_SPEED);
    R.passed = false;
  }

  function enter(dark) {
    R.t = 0;
    R.dark = dark;
    R.returns = 0;
    R.misses = 0;
    R.speed = IN_SPEED * (dark ? DARK_SLOW : 1);
    R.bearing = S.heading;
    R.trail = [];
    R.quiet = 0;
    R.flash = 0;
    R.stampAge = 9;
    R.hold = dark ? 1.2 : 1.6;
    R.vr = 0;
    R.r = BAT_R;
  }

  function update(dt) {
    R.t += dt;
    R.stampAge += dt;
    R.quiet += dt;
    R.sweep = (R.sweep + dt * 80) % 360;
    R.flash = Math.max(0, R.flash - dt);
    if (R.hold > 0) {
      R.hold -= dt;
      R.bearing = S.heading;
      if (R.hold <= 0) sendOut();
      return false;
    }
    R.r += R.vr * dt;
    R.bearing = (R.bearing + R.drift * dt + 360) % 360;
    R.trail.push([R.bearing, R.r]);
    if (R.trail.length > 14) R.trail.shift();

    if (R.vr > 0 && R.r >= 1) {
      // Off the far wall and back in, more or less straight.
      R.r = 1;
      R.vr = -R.speed;
      R.drift = (Math.random() - 0.5) * 14;
      K.tone({ freq: 880, dur: 0.18, vol: R.dark ? 0.12 : 0.06, type: 'sine', pan: Math.sin(rad(off())) });
    }
    if (R.vr < 0 && !R.passed && R.r <= BAT_R) {
      if (Math.abs(off()) <= ARC) {
        R.returns++;
        R.speed *= SPEED_UP;
        R.quiet = 0;
        R.flash = 0.3;
        stamp(COPY.returned, INK.green);
        K.sfx.play('stamp', { volume: 0.9 });
        K.tone({ freq: 520, dur: 0.08, vol: 0.14 });
        buzz(50);
        sendOut();
      } else {
        R.passed = true;          // it goes straight past you
      }
    }
    if (R.vr < 0 && R.r <= 0.05) {
      R.misses++;
      R.vr = 0;
      R.hold = 1.1;
      R.trail = [];
      R.flash = 0.45;            // in the dark, the lamp stutters on so you can see what you did
      stamp(COPY.operatorError, INK.pink);
      K.sfx.play('error', { volume: 0.8 });
      K.tone({ freq: 110, dur: 0.4, vol: 0.14, type: 'sawtooth' });
      buzz([90, 50, 160]);
    }

    // The sound of it coming: quicker as it nears, higher and brighter the more squarely you face it.
    if (R.vr < 0 && !R.passed) {
      R.beepIn -= dt;
      if (R.beepIn <= 0) {
        const near = 1 - (R.r - BAT_R) / (1 - BAT_R), d = Math.abs(off()), facing = Math.max(0, 1 - d / 100);
        R.beepIn = 0.55 - 0.43 * near;
        K.tone({ freq: 260 + 640 * facing, dur: 0.06, vol: (R.dark ? 0.17 : 0.05) * (d > 100 ? 0.55 : 1), type: d > 100 ? 'sine' : 'square', pan: Math.sin(rad(off())) });
        if (d <= ARC) buzz(8);
      }
    }
    return R.returns >= rules().returns || R.t > rules().limit;
  }

  // ---------- the picture ----------
  let grainPattern = null;
  function grain() {
    if (grainPattern) return grainPattern;
    const c = document.createElement('canvas');
    const T = 320;               // big enough, and with nothing running edge to edge, that the repeat does not show
    c.width = c.height = T;
    const x = c.getContext('2d');
    for (let i = 0; i < 5600; i++) {
      x.fillStyle = `rgba(244,236,218,${Math.random() * 0.16})`;
      x.fillRect(Math.random() * T, Math.random() * T, 1 + Math.random() * 1.5, 1);
    }
    // A few short scratches, well inside the tile.
    for (let i = 0; i < 9; i++) {
      const sx = 30 + Math.random() * (T - 60), sy = 30 + Math.random() * (T - 60), a = Math.random() * Math.PI, len = 8 + Math.random() * 20;
      x.strokeStyle = 'rgba(244,236,218,0.09)';
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      x.stroke();
    }
    grainPattern = g.createPattern(c, 'repeat');
    return grainPattern;
  }

  function paper() {
    const { unit } = K.view();
    g.fillStyle = INK.paper;
    g.fillRect(-4, -5, 8, 10);
    g.save();
    g.scale(1 / unit, 1 / unit);
    g.fillStyle = grain();
    g.fillRect(-4 * unit, -5 * unit, 8 * unit, 10 * unit);
    g.restore();
  }

  // Printed slightly out of register: cyan and pink ghosts either side of the real line.
  function ink(path, width, colour = INK.bone) {
    for (const [c, dx, dy, a] of [[INK.cyan, 0.012, 0.007, 0.75], [INK.pink, -0.012, -0.007, 0.75], [colour, 0, 0, 1]]) {
      g.save();
      g.translate(dx, dy);
      g.globalAlpha *= a;
      g.strokeStyle = c;
      g.lineWidth = width;
      g.beginPath();
      path();
      g.stroke();
      g.restore();
    }
  }

  function text(str, x, y, size, font, colour, align = 'center', ghost = false) {
    g.font = `${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (ghost) {
      g.fillStyle = INK.cyan;
      g.globalAlpha *= 0.8;
      g.fillText(str, x + 0.014, y + 0.008);
      g.fillStyle = INK.pink;
      g.fillText(str, x - 0.014, y - 0.008);
      g.globalAlpha /= 0.8;
    }
    g.fillStyle = colour;
    g.fillText(str, x, y);
  }

  function regMark(x, y) {
    ink(() => { g.arc(x, y, 0.05, 0, Math.PI * 2); g.moveTo(x - 0.09, y); g.lineTo(x + 0.09, y); g.moveTo(x, y - 0.09); g.lineTo(x, y + 0.09); }, 0.008);
  }

  function drawStamp() {
    // It thumps down and is gone again before the ball is on its way back, so it never hides the play.
    if (R.stampAge > 0.95) return;
    const thump = R.stampAge < 0.1 ? 1.5 - 5 * R.stampAge : 1, fade = R.stampAge > 0.55 ? 1 - (R.stampAge - 0.55) / 0.4 : 1;
    g.save();
    g.globalAlpha = fade * 0.92;
    g.translate(0.05, -0.3);
    g.rotate(-0.21);
    g.scale(thump, thump);
    g.font = `0.26px ${FONT.head}`;
    const w = g.measureText(R.stamp).width + 0.22;
    g.strokeStyle = R.stampColour;
    g.lineWidth = 0.028;
    g.strokeRect(-w / 2, -0.2, w, 0.4);
    g.lineWidth = 0.01;
    g.strokeRect(-w / 2 + 0.035, -0.165, w - 0.07, 0.33);
    text(R.stamp, 0, 0.015, 0.26, FONT.head, R.stampColour);
    g.restore();
  }

  function plate(alpha) {
    const cy = -0.3, P = 0.92;                 // where the dial sits, and how big it is
    g.save();
    g.globalAlpha = alpha;
    paper();

    // The furniture of the page.
    text(COPY.fig, -0.95, -1.6, 0.07, FONT.mono, INK.amber, 'left');
    text(COPY.plateNo, 0.95, -1.6, 0.07, FONT.mono, INK.bone, 'right');
    text(COPY.plateTitle, 0, -1.43, 0.23, FONT.head, INK.bone, 'center', true);
    regMark(-0.93, -1.2);
    regMark(0.93, -1.2);
    regMark(-0.93, 0.62);
    regMark(0.93, 0.62);

    // The dial. It turns against you, so dead ahead stays at the top.
    g.save();
    g.translate(0, cy);
    g.save();
    g.rotate(-rad(S.heading));
    ink(() => g.arc(0, 0, P, 0, Math.PI * 2), 0.022);
    ink(() => g.arc(0, 0, P * 0.68, 0, Math.PI * 2), 0.008);
    g.setLineDash([0.04, 0.04]);
    ink(() => g.arc(0, 0, P * BAT_R, 0, Math.PI * 2), 0.008);
    g.setLineDash([]);
    g.strokeStyle = INK.bone;
    for (let d = 0; d < 360; d += 10) {
      const a = rad(d), big = d % 30 === 0, r0 = P * (big ? 0.9 : 0.95);
      g.lineWidth = big ? 0.014 : 0.006;
      g.beginPath();
      g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
      g.lineTo(Math.sin(a) * P, -Math.cos(a) * P);
      g.stroke();
      if (big) {
        g.save();
        g.rotate(a);
        text(String(d).padStart(3, '0'), 0, -P * 0.82, 0.06, FONT.mono, INK.bone);
        g.restore();
      }
    }
    // The sweep: a cyan line with a fading tail.
    for (let i = 0; i < 16; i++) {
      const a = rad(R.sweep - i * 2.2);
      g.strokeStyle = INK.cyan;
      g.globalAlpha = alpha * (1 - i / 16) * 0.55;
      g.lineWidth = 0.012;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.sin(a) * P, -Math.cos(a) * P);
      g.stroke();
    }
    g.globalAlpha = alpha;
    // The ball, and where it has just been.
    R.trail.forEach(([b, r], i) => {
      const a = rad(b);
      g.fillStyle = INK.pink;
      g.globalAlpha = alpha * (i / R.trail.length) * 0.5;
      g.beginPath();
      g.arc(Math.sin(a) * r * P, -Math.cos(a) * r * P, 0.022, 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = alpha;
    if (R.hold <= 0) {
      const a = rad(R.bearing), bx = Math.sin(a) * R.r * P, by = -Math.cos(a) * R.r * P;
      g.fillStyle = INK.cyan;
      g.beginPath();
      g.arc(bx + 0.014, by + 0.008, 0.055, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK.pink;
      g.beginPath();
      g.arc(bx, by, 0.055, 0, Math.PI * 2);
      g.fill();
      ink(() => g.arc(bx, by, 0.1, 0, Math.PI * 2), 0.008);
    }
    g.restore();

    // You: an arc at the top that does not turn, and a mark in the middle.
    g.strokeStyle = INK.amber;
    g.lineWidth = 0.055;
    g.lineCap = 'butt';
    g.beginPath();
    g.arc(0, 0, P * BAT_R, rad(-90 - ARC), rad(-90 + ARC));
    g.stroke();
    g.fillStyle = INK.bone;
    g.beginPath();
    g.moveTo(0, -0.07);
    g.lineTo(0.05, 0.05);
    g.lineTo(-0.05, 0.05);
    g.closePath();
    g.fill();
    g.strokeStyle = INK.amber;
    g.lineWidth = 0.006;
    g.beginPath();
    g.moveTo(P * BAT_R * 0.42, -P * BAT_R * 0.9);
    g.lineTo(0.62, -0.62);
    g.lineTo(0.95, -0.62);
    g.stroke();
    text(COPY.operator, 0.95, -0.67, 0.055, FONT.mono, INK.amber, 'right');

    // Which way to turn, when it is well off to one side.
    const d = off();
    if (R.vr < 0 && !R.passed && Math.abs(d) > 45 && Math.floor(R.t * 5) % 2) {
      const side = Math.sign(d);
      text(side > 0 ? '▶▶' : '◀◀', side * 0.8, 0, 0.2, FONT.mono, INK.amber);
    }
    if (R.vr < 0 && !R.passed && Math.abs(d) > 125) {
      g.save();
      g.translate(-0.05, P * 0.5);
      g.rotate(-0.07);
      text(COPY.behindYou, 0, 0, 0.17, FONT.hand, INK.pink);
      g.restore();
    }
    g.restore();

    // Under the dial: a readout, a label from a label gun, and a caution strip.
    g.fillStyle = INK.panel;
    g.fillRect(-0.9, 0.78, 1.8, 0.34);
    ink(() => g.rect(-0.9, 0.78, 1.8, 0.34), 0.01);
    const need = rules().returns;
    text(`BRG ${String(Math.round((d + 360) % 360)).padStart(3, '0')}  RNG ${R.r.toFixed(2)}`, -0.82, 0.89, 0.13, FONT.readout, INK.green, 'left');
    text(`${COPY.returns} ${String(R.returns).padStart(2, '0')}/${String(need).padStart(2, '0')}`, -0.82, 1.03, 0.13, FONT.readout, INK.green, 'left');
    g.save();
    g.translate(0, 1.31);
    g.rotate(-0.025);
    g.fillStyle = '#16161a';
    g.fillRect(-0.72, -0.085, 1.44, 0.17);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(-0.72, -0.085, 1.44, 0.03);
    g.font = `0.085px ${FONT.mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK.bone;
    const label = COPY.turnToFace;
    const gap = 1.3 / label.length;
    [...label].forEach((ch, i) => g.fillText(ch, (i - (label.length - 1) / 2) * gap, 0.006));
    g.restore();
    g.save();
    g.beginPath();
    g.rect(-1.0, 1.5, 2.0, 0.16);
    g.clip();
    g.fillStyle = INK.amber;
    g.fillRect(-1.0, 1.5, 2.0, 0.16);
    g.fillStyle = '#16161a';
    for (let x = -1.2; x < 1.2; x += 0.16) {
      g.beginPath();
      g.moveTo(x, 1.66);
      g.lineTo(x + 0.08, 1.66);
      g.lineTo(x + 0.2, 1.5);
      g.lineTo(x + 0.12, 1.5);
      g.fill();
    }
    g.fillStyle = INK.amber;
    g.font = `0.07px ${FONT.mono}`;
    const cw = g.measureText(COPY.caution).width + 0.1;
    g.fillRect(-cw / 2, 1.5, cw, 0.16);
    g.restore();
    text(COPY.caution, 0, 1.585, 0.07, FONT.mono, '#16161a');

    drawStamp();
    g.restore();
  }

  // lit: draw the plate even though the lights are out (the lamp stuttering as it dies).
  function draw(lit = false) {
    if (R.dark && !lit) {
      g.fillStyle = '#000';
      g.fillRect(-4, -5, 8, 10);
      // A returned ball lights the plate for an instant, like a camera flash.
      if (R.flash > 0) plate(Math.min(1, R.flash / 0.3));
      else if (R.quiet > 8) K.pix(COPY.listen, 0, 0, 0.035, '#333');
      return;
    }
    plate(1);
  }

  // How the last stage shows this world: a strip of the page, a pink ball, amber bats.
  const skin = {
    paint() {
      paper();
      ink(() => { g.moveTo(-1.2, -0.9); g.lineTo(1.2, -0.9); g.moveTo(-1.2, 0.9); g.lineTo(1.2, 0.9); }, 0.008);
      ink(() => g.arc(0, 0, 0.6, 0, Math.PI * 2), 0.008);
    },
    ball(x, y) {
      g.fillStyle = INK.cyan;
      g.beginPath();
      g.arc(x + 0.014, y + 0.008, 0.055, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK.pink;
      g.beginPath();
      g.arc(x, y, 0.055, 0, Math.PI * 2);
      g.fill();
    },
    bat(x, y) {
      g.fillStyle = INK.amber;
      g.fillRect(x - K.BAT / 2, y - 0.035, K.BAT, 0.07);
    },
  };

  return { enter, update, draw, skin, get bearing() { return R.bearing; }, get state() { return { ...R, trail: undefined }; } };
}
