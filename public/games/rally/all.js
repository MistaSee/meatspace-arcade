// Rally, stage 8: everything at once.
//
// One last rally on the plain court, except the court is now a stack of strips, each one a
// different world from earlier in the ride. The strips slide, faster and faster, and the
// ball and the bats change into whatever belongs to the strip they are in. The score runs
// away with itself. Then it stops dead.

const LASTS = 15;              // seconds
const STRIPS = 5;

export function allStage(K, skins) {
  const { g, S } = K;
  const A = { t: 0, slide: 0, tick: 0 };

  function enter() {
    A.t = 0;
    A.slide = 0;
    S.theta = 0;
    S.ball.live = false;
    S.serveIn = 0.5;
    S.toPlayer = true;
  }

  function update(dt) {
    A.t += dt;
    // Everything speeds up as it goes.
    const rush = 1 + A.t * 0.07;
    K.playBall(dt * rush, false);
    A.slide += dt * (0.2 + A.t * 0.14);
    A.tick += dt * rush;
    if (A.tick > 0.07) {
      A.tick = 0;
      S.score[0] += Math.floor(Math.random() * 9 * rush);
      S.score[1] += Math.floor(Math.random() * 7 * rush);
      if (Math.random() < 0.5) K.tone({ freq: 200 + Math.random() * 900, dur: 0.03, vol: 0.05 });
    }
    return A.t > LASTS;
  }

  function draw() {
    const top = -K.HH - 0.2, tall = (2 * K.HH + 0.4) / STRIPS;
    const whole = Math.floor(A.slide), part = A.slide - whole;
    const things = [[S.ball.live ? 'ball' : null, S.ball.x, S.ball.y], ['you', S.bat, K.BAT_Y], ['them', S.rival, -K.BAT_Y]];
    for (let i = -1; i < STRIPS; i++) {
      const y0 = top + (i + part) * tall;
      const skin = skins[(((i - whole) % skins.length) + skins.length) % skins.length];
      g.save();
      g.beginPath();
      g.rect(-4, y0, 8, tall);
      g.clip();
      skin.paint();
      // Whatever is in this strip is drawn the way this strip's world draws it.
      for (const [what, x, y] of things) {
        if (!what || y < y0 - 0.3 || y > y0 + tall + 0.3) continue;
        if (what === 'ball') skin.ball(x, y);
        else skin.bat(x, y, what === 'them');
      }
      g.restore();
      g.fillStyle = '#000';
      g.fillRect(-4, y0 - 0.012, 8, 0.024);
    }
    // The score, running away.
    for (const [n, y] of [[S.score[1], -0.42], [S.score[0], 0.42]]) {
      K.pix(n, 0.012, y + 0.012, 0.07, '#000');
      K.pix(n, 0, y, 0.07, '#fff');
    }
  }

  return { enter, update, draw, get state() { return { t: A.t }; } };
}
