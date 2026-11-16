// Finding a heartbeat in a wobbling number.
//
// A fingertip pressed over a phone's camera, lit by its torch, shows as a red glow that dims
// very slightly each time the heart pushes blood through it. Feed that brightness in, frame by
// frame, and this picks out the beats.
//
//   const pulse = createPulse();
//   const beat = pulse.push(brightness, timeInMilliseconds);   // true on the frame a beat lands
//   pulse.bpm        beats a minute, 0 until it has found a rhythm
//   pulse.steady     0 to 1: how even the last few beats were. Below about 0.5, do not trust bpm.
//                    A real heart is never perfectly even, least of all a young fit one, so 1 is rare.
//   pulse.wave       the cleaned-up wobble, for drawing: about -1 to 1

const KEEP = 12000;            // milliseconds of readings to keep
const QUICK = 160;             // averaging over this smooths out camera noise
const SLOW = 1100;             // averaging over this follows the slow drift, which is then taken away
const REST = 300;              // a heart cannot beat again sooner than this
const SLOWEST = 1500, FASTEST = 330;     // gaps between beats outside 40 to 180 a minute are ignored
const BEATS = 7;               // how many recent gaps the rate is worked out from

export function createPulse() {
  const t = [], v = [], f = [];
  const P = { bpm: 0, steady: 0, wave: 0, gaps: [], lastBeat: -1e9, dipped: true, swing: 1 };

  // The mean of the readings in the last so-many milliseconds.
  function recent(span) {
    const now = t[t.length - 1];
    let sum = 0, n = 0;
    for (let i = t.length - 1; i >= 0 && now - t[i] <= span; i--) { sum += v[i]; n++; }
    return n ? sum / n : 0;
  }

  P.push = (value, now) => {
    t.push(now);
    v.push(value);
    while (t.length && now - t[0] > KEEP) { t.shift(); v.shift(); f.shift(); }
    const wobble = recent(QUICK) - recent(SLOW);
    f.push(wobble);
    // How big the wobble has been lately, so "up" and "down" mean the same on any phone.
    let sq = 0, n = 0;
    for (let i = f.length - 1; i >= 0 && now - t[i] <= 3000; i--) { sq += f[i] * f[i]; n++; }
    P.swing = Math.sqrt(sq / Math.max(1, n)) || 1e-6;
    P.wave = Math.max(-1.5, Math.min(1.5, wobble / (P.swing * 1.6)));

    // A beat is the wobble climbing back up through the middle after a proper dip.
    if (wobble < -0.35 * P.swing) P.dipped = true;
    let beat = false;
    const line = 0.1 * P.swing, before = f.length > 1 ? f[f.length - 2] : wobble;
    if (P.dipped && wobble > line && now - P.lastBeat > REST && t.length > 20) {
      // The camera only looks thirty times a second, so work out when between two looks it crossed.
      const prev = t[t.length - 2] ?? now;
      const when = wobble > before ? prev + ((line - before) / (wobble - before)) * (now - prev) : now;
      const gap = when - P.lastBeat;
      P.lastBeat = when;
      P.dipped = false;
      beat = true;
      if (gap >= FASTEST && gap <= SLOWEST) {
        P.gaps.push(gap);
        if (P.gaps.length > BEATS) P.gaps.shift();
      } else if (gap > SLOWEST * 2) {
        P.gaps = [];             // lost it for a while: start again rather than trust old beats
      }
      if (P.gaps.length >= 5) {
        const sorted = [...P.gaps].sort((a, b) => a - b), mid = sorted[sorted.length >> 1];
        // The rate comes from the gaps that agree with each other; a stray one is left out.
        const close = P.gaps.filter(g => Math.abs(g - mid) < mid * 0.2);
        const mean = close.reduce((a, b) => a + b, 0) / close.length;
        const spread = P.gaps.reduce((a, g) => a + Math.abs(g - mid), 0) / P.gaps.length;
        P.bpm = 60000 / mean;
        P.steady = Math.max(0, Math.min(1, 1 - spread / mid / 0.2));
      } else {
        P.steady = 0;
      }
    }
    // No beat for a good while means the finger has moved or gone.
    if (now - P.lastBeat > 2500) { P.steady = 0; P.gaps = []; }
    return beat;
  };

  P.reset = () => { t.length = v.length = f.length = 0; P.gaps = []; P.bpm = 0; P.steady = 0; P.lastBeat = -1e9; P.dipped = true; };
  return P;
}
