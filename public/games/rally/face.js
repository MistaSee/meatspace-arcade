// Rally, stage 7: the opponent.
//
// Back to a bat and a ball, but now in the chunky 3D of a 1990s console: big pixels, few
// colours, flat-shaded shapes that wobble. Something at the far end is hitting it back. It
// is a cube, and every side of it is your own face, live from the selfie camera.
//
// The picture is drawn very small and blown up, which is where the chunkiness comes from.

const RETURNS = 6;             // returns to finish the stage
const LIMIT = 38;              // seconds: it ends anyway
const ACROSS = 120;            // how many chunky pixels wide the picture is
const DEPTH = 1.5;             // how quickly things shrink with distance
const LEVELS = 6;              // shades of each colour the picture is allowed
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function faceStage(K) {
  const { g, S, clamp } = K;
  const buf = document.createElement('canvas');
  const b = buf.getContext('2d', { willReadFrequently: true });
  const F = { t: 0, from: 0, spin: 0, lastVy: 0, hits: 0 };
  let bw = ACROSS, bh = 200;

  function enter() {
    F.t = 0;
    F.from = S.returns;
    F.spin = 0;
    F.hits = 0;
    S.theta = 0;
    S.ball.live = false;
    S.serveIn = 1.2;
    S.toPlayer = true;
    K.room.openCam('user');
  }

  function update(dt) {
    F.t += dt;
    F.spin = Math.max(0, F.spin - dt * 2.2);
    K.playBall(dt, false);
    // When the cube sends it back, it spins with satisfaction.
    if (F.lastVy < 0 && S.ball.vy > 0 && S.ball.y < 0) { F.spin = 1; F.hits++; }
    F.lastVy = S.ball.vy;
    return S.returns - F.from >= RETURNS || F.t > LIMIT;
  }

  // Where a spot on the court is in the little picture, and how big things are there.
  function at(x, y) {
    const z = (K.BAT_Y - y) / (2 * K.BAT_Y);          // 0 at your end, 1 at the far end
    const s = 1 / (1 + DEPTH * z), far = 1 / (1 + DEPTH);
    const near = bh * 0.87, horizon = bh * 0.41;
    return { x: bw / 2 + x * bw * 0.47 * s, y: horizon + ((near - horizon) * (s - far)) / (1 - far), s };
  }

  function quad(colour, ...points) {
    b.fillStyle = colour;
    b.beginPath();
    points.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y)));
    b.closePath();
    b.fill();
  }

  function tiny(str, x, y, colour) {
    b.fillStyle = colour;
    let cx = Math.round(x - (str.length * 4 - 1) / 2);
    for (const ch of String(str).toUpperCase()) {
      const bits = K.GLYPHS[ch] || K.GLYPHS[' '];
      for (let i = 0; i < 15; i++) if (bits[i] === '1') b.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
      cx += 4;
    }
  }

  // One side of the cube: your face, squeezed to fit and leaning as if seen at an angle.
  function side(x, top, w, h, lean, shade) {
    if (w < 1) return;
    const v = K.room.video, live = v.videoWidth > 0;
    b.save();
    b.setTransform(1, lean, 0, 1, x, top);
    if (live) {
      const sq = Math.min(v.videoWidth, v.videoHeight);
      // Mirrored, the way you see yourself.
      b.translate(w, 0);
      b.scale(-1, 1);
      b.drawImage(v, (v.videoWidth - sq) / 2, (v.videoHeight - sq) / 2, sq, sq, 0, 0, w, h);
    } else {
      // No camera: a test card with a question mark for a face.
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { b.fillStyle = (i + j) % 2 ? '#c2185b' : '#f4ecda'; b.fillRect((i * w) / 4, (j * h) / 4, w / 4 + 0.5, h / 4 + 0.5); }
    }
    b.restore();
    b.save();
    b.setTransform(1, lean, 0, 1, x, top);
    if (shade) { b.fillStyle = `rgba(0,0,0,${shade})`; b.fillRect(0, 0, w, h); }
    b.strokeStyle = '#000';
    b.lineWidth = 1;
    b.strokeRect(0.5, 0.5, w - 1, h - 1);
    b.restore();
  }

  function render() {
    const { W, H } = K.view();
    bw = ACROSS;
    bh = Math.max(40, Math.round((ACROSS * H) / W));
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    const horizon = bh * 0.41;

    // Sky in flat bands, a low sun, and hills made of a few triangles.
    ['#16104a', '#2a1f78', '#5a2f96', '#a8457e', '#e8785a'].forEach((c, i) => { b.fillStyle = c; b.fillRect(0, (horizon * i) / 5, bw, horizon / 5 + 1); });
    b.fillStyle = '#ffd98a';
    b.beginPath();
    b.arc(bw * 0.72, horizon - 4, bw * 0.11, Math.PI, 0);
    b.fill();
    quad('#1c4a52', [0, horizon], [bw * 0.22, horizon - bh * 0.07], [bw * 0.45, horizon]);
    quad('#143840', [bw * 0.3, horizon], [bw * 0.58, horizon - bh * 0.1], [bw * 0.9, horizon]);
    quad('#1c4a52', [bw * 0.7, horizon], [bw * 0.92, horizon - bh * 0.05], [bw, horizon]);
    b.fillStyle = '#0c1c26';
    b.fillRect(0, horizon, bw, bh - horizon);

    // The table, with a thick near edge, white lines and a net.
    const e = 1.08, nl = at(-e, K.BAT_Y + 0.12), nr = at(e, K.BAT_Y + 0.12), fl = at(-e, -K.BAT_Y - 0.12), fr = at(e, -K.BAT_Y - 0.12);
    quad('#0a3a22', [nl.x, nl.y], [nr.x, nr.y], [nr.x, nl.y + 7], [nl.x, nl.y + 7]);
    quad('#1f9a54', [nl.x, nl.y], [nr.x, nr.y], [fr.x, fr.y], [fl.x, fl.y]);
    quad('#17804a', [at(-e, 0).x, at(-e, 0).y], [at(e, 0).x, at(e, 0).y], [fr.x, fr.y], [fl.x, fl.y]);
    b.strokeStyle = '#f4f4f4';
    b.lineWidth = 1;
    b.beginPath();
    for (const [x0, y0, x1, y1] of [[-1, K.BAT_Y, 1, K.BAT_Y], [1, K.BAT_Y, 1, -K.BAT_Y], [1, -K.BAT_Y, -1, -K.BAT_Y], [-1, -K.BAT_Y, -1, K.BAT_Y], [0, K.BAT_Y, 0, -K.BAT_Y]]) {
      const p = at(x0, y0), q = at(x1, y1);
      b.moveTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5);
      b.lineTo(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5);
    }
    b.stroke();
    const n0 = at(-e, 0), n1 = at(e, 0);
    quad('rgba(244,244,244,0.75)', [n0.x, n0.y], [n1.x, n1.y], [n1.x, n1.y - 5 * n1.s - 2], [n0.x, n0.y - 5 * n0.s - 2]);

    // The cube. It turns to watch the ball, and spins when it scores a return.
    const c = at(S.rival, -K.BAT_Y - 0.05), w = Math.max(6, 0.72 * bw * 0.47 * c.s);
    const yaw = clamp((S.ball.x - S.rival) * 0.8, -0.7, 0.7) + F.spin * Math.PI * 2;
    const turn = ((yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);     // which two sides show
    const fw = w * Math.cos(turn), sw = w * Math.sin(turn);
    const left = c.x - (fw + sw) / 2, top = c.y - w - Math.abs(Math.sin(F.t * 3)) * 2;
    b.fillStyle = 'rgba(0,0,0,0.45)';
    b.beginPath();
    b.ellipse(c.x, c.y, w * 0.6, w * 0.14, 0, 0, Math.PI * 2);
    b.fill();
    side(left, top + sw * 0.12, sw, w, -0.12, 0.45);
    side(left + sw, top, fw, w, 0.12 * (sw / w), 0);

    // The ball, floating a little above its shadow.
    if (S.ball.live) {
      const p = at(S.ball.x, S.ball.y), r = Math.max(2, Math.round(5 * p.s));
      b.fillStyle = 'rgba(0,0,0,0.4)';
      b.fillRect(Math.round(p.x - r / 2), Math.round(p.y), r, Math.max(1, r / 3));
      b.fillStyle = '#fff';
      b.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r - 5 * p.s), r, r);
    }
    // Your bat: a red slab at the near end.
    const m = at(S.bat, K.BAT_Y), mw = K.BAT * bw * 0.47 * m.s;
    quad('#7a1010', [m.x - mw / 2, m.y - 2], [m.x + mw / 2, m.y - 2], [m.x + mw / 2, m.y + 4], [m.x - mw / 2, m.y + 4]);
    quad('#e23d3d', [m.x - mw / 2, m.y - 6], [m.x + mw / 2, m.y - 6], [m.x + mw / 2, m.y - 2], [m.x - mw / 2, m.y - 2]);

    // A scoreboard. Both sides are you.
    b.fillStyle = '#000';
    b.fillRect(bw / 2 - 30, 3, 60, 9);
    tiny(`${K.COPY.you} ${S.score[0] % 100}`, bw / 2 - 15, 5, '#ffe04a');
    tiny(`${S.score[1] % 100} ${K.COPY.you}`, bw / 2 + 16, 5, '#ffe04a');

    // Squash the colours down to a few shades, with a dot pattern to hide the joins.
    const img = b.getImageData(0, 0, bw, bh), px = img.data, step = 255 / (LEVELS - 1);
    for (let y = 0, i = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++, i += 4) {
        const t = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * step;
        px[i] = Math.round((px[i] + t) / step) * step;
        px[i + 1] = Math.round((px[i + 1] + t) / step) * step;
        px[i + 2] = Math.round((px[i + 2] + t) / step) * step;
      }
    }
    b.putImageData(img, 0, 0);
  }

  function draw() {
    const { W, H } = K.view();
    render();
    K.screenSpace();
    g.imageSmoothingEnabled = false;
    g.drawImage(buf, 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    K.courtSpace();
  }

  // How the last stage shows this world: green table, red bats, and a ball with your face on it.
  const skin = {
    paint() {
      g.fillStyle = '#1f9a54';
      g.fillRect(-2, -3, 4, 6);
      g.fillStyle = '#17804a';
      for (let i = -6; i < 6; i += 2) g.fillRect(-2, i * 0.3, 4, 0.3);
      g.fillStyle = '#f4f4f4';
      g.fillRect(-0.012, -3, 0.024, 6);
    },
    ball(x, y) {
      const v = K.room.video, s = 0.2;
      g.fillStyle = '#000';
      g.fillRect(x - s / 2 - 0.015, y - s / 2 - 0.015, s + 0.03, s + 0.03);
      if (v.videoWidth > 0) {
        const sq = Math.min(v.videoWidth, v.videoHeight);
        g.imageSmoothingEnabled = false;
        g.drawImage(v, (v.videoWidth - sq) / 2, (v.videoHeight - sq) / 2, sq, sq, x - s / 2, y - s / 2, s, s);
        g.imageSmoothingEnabled = true;
      } else {
        g.fillStyle = '#c2185b';
        g.fillRect(x - s / 2, y - s / 2, s, s);
      }
    },
    bat(x, y) {
      g.fillStyle = '#7a1010';
      g.fillRect(x - K.BAT / 2, y - 0.02, K.BAT, 0.07);
      g.fillStyle = '#e23d3d';
      g.fillRect(x - K.BAT / 2, y - 0.05, K.BAT, 0.06);
    },
  };

  return { enter, update, draw, skin, get state() { return { t: F.t, returns: S.returns - F.from, cubeHits: F.hits, camera: K.room.video.videoWidth > 0 }; } };
}
