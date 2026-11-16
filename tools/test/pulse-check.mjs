// Checks the heartbeat finder against made-up fingertip readings where the true rate is known.
//   node tools/test/pulse-check.mjs
import { createPulse } from '../../public/games/nerves/pulse.js';

// A fingertip's glow: a steady level, a slow drift, a pulse-shaped dip each beat, and camera noise.
function reading(phase, t, noise) {
  const beat = Math.sin(phase) + 0.45 * Math.sin(2 * phase + 0.6);
  return 190 + 6 * Math.sin(t / 4000) - 1.4 * beat + (Math.random() - 0.5) * noise;
}

function run(rateAt, seconds, { fps = 30, noise = 0.8 } = {}) {
  const pulse = createPulse();
  let phase = 0, t = 0, beats = 0;
  const seen = [];
  while (t < seconds * 1000) {
    const dt = 1000 / fps + (Math.random() - 0.5) * 6;        // frames do not arrive evenly
    t += dt;
    phase += (2 * Math.PI * rateAt(t / 1000) * dt) / 60000;
    if (pulse.push(reading(phase, t, noise), t)) beats++;
    seen.push({ t, bpm: pulse.bpm, steady: pulse.steady });
  }
  return { pulse, beats, seen };
}

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${detail}`); if (!ok) failed++; };

for (const bpm of [52, 64, 75, 90, 110, 135, 160]) {
  const { pulse } = run(() => bpm, 20);
  check(`steady ${bpm}`, Math.abs(pulse.bpm - bpm) <= 3 && pulse.steady > 0.6, `read ${pulse.bpm.toFixed(1)}, steadiness ${pulse.steady.toFixed(2)}`);
}
{
  const { pulse } = run(() => 72, 20, { fps: 24, noise: 1.6 });
  check('noisy, slow camera, 72', Math.abs(pulse.bpm - 72) <= 4, `read ${pulse.bpm.toFixed(1)}, steadiness ${pulse.steady.toFixed(2)}`);
}
{
  // A heart speeding up from 70 to 95 over twenty seconds, as it might when someone is being heckled.
  const { seen } = run(s => 70 + Math.min(25, Math.max(0, s - 10) * 1.25), 40);
  const at = s => seen.find(r => r.t >= s * 1000);
  check('follows a rise', Math.abs(at(9).bpm - 70) <= 4 && Math.abs(at(39).bpm - 95) <= 4, `at 9s ${at(9).bpm.toFixed(1)}, at 39s ${at(39).bpm.toFixed(1)}`);
}
{
  // No finger: only noise. It must not claim a steady rhythm.
  const pulse = createPulse();
  let steadyFor = 0;
  for (let t = 0; t < 20000; t += 33) { pulse.push(120 + (Math.random() - 0.5) * 3, t); if (pulse.steady > 0.5) steadyFor += 33; }
  check('noise alone', steadyFor < 3000, `claimed a steady beat for ${(steadyFor / 1000).toFixed(1)}s of 20s`);
}
process.exit(failed ? 1 : 0);
