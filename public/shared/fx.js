// Particles, spell effects and screen shake for the arcade games.
// Everything is drawn on one full-screen canvas laid over the arena.

const COLOURS = {
  normal:  ['#fff6dc', '#ffd36b', '#ff9a3c', '#ffffff'],
  fire:    ['#fff36b', '#ffb21a', '#ff6a1a', '#e8361c'],
  frost:   ['#ffffff', '#d6f6ff', '#7fdcff', '#3d9be0'],
  thunder: ['#ffffff', '#fff7a0', '#ffe04a', '#a6e1ff'],
  holy:    ['#ffffff', '#fff8d2', '#ffe48a', '#ffd04a'],
  heal:    ['#d7ffd9', '#7bd389', '#3fae5a'],
  dust:    ['#d8b77e', '#a8845a', '#6d5236'],
  confetti:['#f2c14e', '#e4572e', '#8ecae6', '#7bd389', '#c77dff', '#ffffff'],
  bad:     ['#ff3b3b', '#ff8a3b', '#ffffff'],
};

const TESTING = new URLSearchParams(location.search).has('tick');
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = list => list[Math.floor(Math.random() * list.length)];

export function createFx(canvas, stage) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  const parts = [];
  const shots = [];
  const bolts = [];
  const rings = [];
  const beams = [];
  let aura = { element: null, level: 0 };
  let shake = 0;
  let last = performance.now();

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function add(p) {
    if (parts.length > 450) parts.shift();
    parts.push({ age: 0, rot: 0, spin: 0, grav: 0, drag: 0.985, glow: true, shrink: true, ...p });
  }

  // A spray of particles from one point.
  function burst(x, y, element = 'normal', n = 30, speed = 9) {
    const cols = COLOURS[element] || COLOURS.normal;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(0.3, 1) * speed;
      const kind = element === 'frost' ? 'shard' : element === 'fire' ? (Math.random() < 0.6 ? 'ember' : 'spark')
        : element === 'holy' ? (Math.random() < 0.5 ? 'star' : 'spark') : element === 'dust' ? 'smoke' : 'spark';
      add({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (element === 'fire' ? 1.5 : 0),
        life: rnd(0.45, 1.0) * (kind === 'smoke' ? 1.6 : 1), size: rnd(3, 8) * (kind === 'smoke' ? 4 : 1),
        colour: pickOf(cols), spin: rnd(-0.3, 0.3), grav: element === 'fire' || element === 'holy' ? -0.05 : 0.18,
        glow: kind !== 'smoke' && kind !== 'shard',
      });
    }
  }

  function confetti(n = 120) {
    for (let i = 0; i < n; i++) {
      add({
        kind: 'confetti', x: rnd(0, w), y: rnd(-h * 0.3, -10), vx: rnd(-2, 2), vy: rnd(1, 5),
        life: rnd(2.2, 3.6), size: rnd(6, 11), colour: pickOf(COLOURS.confetti),
        spin: rnd(-0.25, 0.25), grav: 0.06, drag: 0.995, glow: false, shrink: false,
      });
    }
  }

  function stars(x, y, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      add({ kind: 'star', x, y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, life: 1.1, size: rnd(8, 14),
        colour: pickOf(['#fff36b', '#ffffff', '#ffd04a']), spin: 0.2, grav: 0.05 });
    }
  }

  function ring(x, y, colour = '#ffffff', size = 160, life = 0.45, width = 10) {
    rings.push({ x, y, colour, size, life, width, age: 0 });
  }

  function jag(x1, y1, x2, y2, rough = 40) {
    const pts = [[x1, y1]];
    const steps = 9;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push([x1 + (x2 - x1) * t + rnd(-rough, rough), y1 + (y2 - y1) * t + rnd(-rough * 0.3, rough * 0.3)]);
    }
    pts.push([x2, y2]);
    return pts;
  }

  function bolt(x1, y1, x2, y2, life = 0.35, rough = 40, width = 6) {
    bolts.push({ x1, y1, x2, y2, life, rough, width, age: 0, pts: jag(x1, y1, x2, y2, rough), next: 0 });
  }

  function addShake(amount) { shake = Math.max(shake, amount); }

  // Fly a spell from the player to the target. Resolves when it lands.
  function cast(element, from, to) {
    return new Promise(done => {
      // The drawing loop stops while the page is hidden, so never let a spell wait on it alone.
      const resolve = () => done();
      setTimeout(resolve, 900);
      if (element === 'thunder') {
        for (let i = 0; i < 3; i++) bolt(to.x + rnd(-40, 40), -20, to.x + rnd(-20, 20), to.y + rnd(-20, 20), 0.45, 55, 7);
        setTimeout(resolve, 160);
        return;
      }
      if (element === 'holy') {
        beams.push({ x: to.x, y: to.y, age: 0, life: 0.9 });
        setTimeout(resolve, 380);
        return;
      }
      if (element === 'frost') {
        for (let i = 0; i < 7; i++) {
          shots.push({ element, x0: from.x + rnd(-120, 120), y0: from.y + rnd(-20, 30), x1: to.x + rnd(-40, 40), y1: to.y + rnd(-40, 40),
            age: -i * 0.05, dur: 0.38, size: 14, arc: rnd(-60, 60), done: i === 6 ? resolve : null });
        }
        return;
      }
      shots.push({ element, x0: from.x, y0: from.y, x1: to.x, y1: to.y, age: 0, dur: element === 'fire' ? 0.5 : 0.25,
        size: element === 'fire' ? 34 : 22, arc: element === 'fire' ? -140 : 0, done: resolve });
    });
  }

  // One small bolt of a spell, for moves that fire many (a dart per tap).
  function shot(element, from, to, size = 12, dur = 0.22) {
    shots.push({ element, x0: from.x, y0: from.y, x1: to.x, y1: to.y, age: 0, dur, size, arc: rnd(-30, 30), done: null });
  }

  // Ambient charge while a spell or punch is building up. level is 0 to 1.
  function setAura(element, level) { aura = { element, level: Math.max(0, Math.min(1, level)) }; }

  function spawnAura(dt) {
    const { element, level } = aura;
    if (!element) return;
    const rate = (8 + level * 70) * dt;
    let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    const cols = COLOURS[element] || COLOURS.normal;
    while (n-- > 0) {
      if (element === 'fire') {
        // Embers swirl round the middle of the screen.
        const a = rnd(0, Math.PI * 2), r = rnd(0.25, 0.48) * Math.min(w, h);
        add({ kind: 'ember', x: w / 2 + Math.cos(a) * r, y: h * 0.55 + Math.sin(a) * r, vx: -Math.sin(a) * 4 * (0.4 + level), vy: Math.cos(a) * 4 * (0.4 + level) - 1,
          life: rnd(0.5, 1), size: rnd(3, 7) * (0.6 + level), colour: pickOf(cols), grav: -0.04, drag: 0.97 });
      } else if (element === 'frost') {
        const side = Math.floor(rnd(0, 4));
        const x = side === 0 ? 0 : side === 1 ? w : rnd(0, w), y = side === 2 ? 0 : side === 3 ? h : rnd(0, h);
        add({ kind: 'shard', x, y, vx: (w / 2 - x) * 0.008, vy: (h / 2 - y) * 0.008, life: rnd(0.6, 1.2), size: rnd(4, 9),
          colour: pickOf(cols), spin: rnd(-0.2, 0.2), glow: false });
      } else if (element === 'thunder') {
        add({ kind: 'spark', x: rnd(0, w), y: rnd(h * 0.5, h), vx: rnd(-6, 6), vy: rnd(-6, 6), life: rnd(0.15, 0.35), size: rnd(2, 5), colour: pickOf(cols) });
        if (Math.random() < level * 0.08) {
          const x = rnd(w * 0.1, w * 0.9), y = rnd(h * 0.55, h * 0.95);
          bolt(x, y, x + rnd(-90, 90), y + rnd(-90, 90), 0.12, 18, 3);
        }
      } else if (element === 'holy') {
        add({ kind: Math.random() < 0.5 ? 'star' : 'ember', x: rnd(0, w), y: rnd(-10, h * 0.3), vx: rnd(-0.5, 0.5), vy: rnd(1, 3),
          life: rnd(0.8, 1.5), size: rnd(3, 7), colour: pickOf(cols), grav: 0.02 });
      } else {
        add({ kind: 'spark', x: rnd(w * 0.1, w * 0.9), y: h - rnd(0, 60), vx: rnd(-3, 3), vy: rnd(-9, -3), life: rnd(0.2, 0.5), size: rnd(2, 4), colour: pickOf(cols) });
      }
    }
  }

  function drawStar(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = dt * 60;
    ctx.clearRect(0, 0, w, h);
    spawnAura(dt);

    // Holy light from the aura sits behind everything else.
    if (aura.element === 'holy' && aura.level > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
      g.addColorStop(0, `rgba(255,240,170,${0.45 * aura.level})`);
      g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    for (const b of beams) {
      b.age += dt;
      const t = b.age / b.life, a = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      const bw = 40 + 110 * Math.min(1, t * 2);
      const g = ctx.createLinearGradient(b.x - bw, 0, b.x + bw, 0);
      g.addColorStop(0, 'rgba(255,230,140,0)');
      g.addColorStop(0.5, `rgba(255,255,235,${0.95 * a})`);
      g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(b.x - bw, 0, bw * 2, b.y + 60);
      ctx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.7) add({ kind: 'star', x: b.x + rnd(-bw, bw) * 0.6, y: rnd(0, b.y), vx: rnd(-1, 1), vy: rnd(-1, 1), life: 0.6, size: rnd(4, 8), colour: pickOf(COLOURS.holy) });
    }
    for (let i = beams.length - 1; i >= 0; i--) if (beams[i].age > beams[i].life) beams.splice(i, 1);

    // Spells in flight.
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.age += dt;
      if (s.age < 0) continue;
      const t = Math.min(1, s.age / s.dur);
      const e = t * t * (3 - 2 * t);
      const x = s.x0 + (s.x1 - s.x0) * e + Math.sin(t * Math.PI) * s.arc * 0.3;
      const y = s.y0 + (s.y1 - s.y0) * e + Math.sin(t * Math.PI) * s.arc;
      const cols = COLOURS[s.element] || COLOURS.normal;
      const r = s.size * (1 - t * 0.35);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, cols[1]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (let j = 0; j < 3; j++) {
        add({ kind: s.element === 'frost' ? 'shard' : 'ember', x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.5, vx: rnd(-1, 1), vy: rnd(-1, 1),
          life: rnd(0.2, 0.45), size: rnd(3, 7) * (s.size / 22), colour: pickOf(cols), grav: -0.03, glow: s.element !== 'frost' });
      }
      if (t >= 1) {
        shots.splice(i, 1);
        burst(s.x1, s.y1, s.element, s.element === 'frost' ? 10 : 34, 10);
        s.done?.();
      }
    }

    for (const r of rings) {
      r.age += dt;
      const t = r.age / r.life;
      ctx.strokeStyle = r.colour;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.lineWidth = r.width * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.size * (0.2 + t * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].age > rings[i].life) rings.splice(i, 1);

    // Lightning: redraw a fresh jagged path every few frames so it crackles.
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bolts) {
      b.age += dt;
      if (b.age > b.next) { b.pts = jag(b.x1, b.y1, b.x2, b.y2, b.rough); b.next = b.age + 0.05; }
      const a = Math.max(0, 1 - b.age / b.life);
      for (const [lw, col] of [[b.width * 3, `rgba(140,200,255,${0.35 * a})`], [b.width, `rgba(255,250,200,${a})`], [b.width * 0.35, `rgba(255,255,255,${a})`]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        b.pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].age > bolts[i].life) bolts.splice(i, 1);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, k);
      p.vy = p.vy * Math.pow(p.drag, k) + p.grav * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.spin * k;
      const t = p.age / p.life;
      const size = p.shrink ? p.size * (1 - t * 0.8) : p.size;
      ctx.globalAlpha = p.kind === 'smoke' ? 0.35 * (1 - t) : Math.min(1, (1 - t) * 1.6);
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.fillStyle = p.colour;
      ctx.strokeStyle = p.colour;
      if (p.kind === 'spark') {
        ctx.lineWidth = size * 0.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        drawStar(p.x, p.y, size);
      } else if (p.kind === 'shard' || p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'shard') {
          ctx.beginPath();
          ctx.moveTo(0, -size * 1.6);
          ctx.lineTo(size * 0.55, 0);
          ctx.lineTo(0, size * 1.6);
          ctx.lineTo(-size * 0.55, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#ffffffaa';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.scaleX = 1;
          ctx.fillRect(-size / 2, -size / 4, size, size / 2 * Math.abs(Math.cos(p.rot * 2)) + 1);
        }
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Camera shake.
    if (shake > 0.3) {
      stage.style.transform = `translate(${rnd(-shake, shake)}px, ${rnd(-shake, shake)}px) rotate(${rnd(-shake, shake) * 0.08}deg)`;
      shake *= Math.pow(0.86, k);
    } else if (shake) {
      shake = 0;
      stage.style.transform = '';
    }
    if (!TESTING) requestAnimationFrame(frame);
  }
  if (TESTING) setInterval(() => frame(performance.now()), 16);
  else requestAnimationFrame(frame);

  return { burst, confetti, stars, ring, bolt, cast, shot, setAura, shake: addShake, resize, get count() { return parts.length; } };
}
