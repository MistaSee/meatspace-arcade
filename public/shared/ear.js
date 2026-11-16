// The phone's microphone as a measuring instrument: how loud is one narrow pitch, and how far
// does it stand out from the pitches either side of it?
//
//   const ear = await openEar();          // must follow a tap
//   ear.ok                                // false if there is no microphone, or the player said no
//   ear.band(18500).over                  // decibels above the surrounding hiss; about 0 when the pitch is absent
//   ear.stop()
//
// The phone is asked not to tidy the sound up (no echo cancelling, no automatic volume), because
// that tidying is exactly what would hide how near or far a sound is.

// The measuring itself, kept separate so it can be checked without a microphone.
// bins: loudness of each slice of pitch, in decibels. hz: how many hertz wide each slice is.
export function bandOver(bins, hz, freq, half = 80, gap = 350, wide = 600) {
  const at = f => Math.max(0, Math.min(bins.length - 1, Math.round(f / hz)));
  let peak = -200;
  for (let i = at(freq - half); i <= at(freq + half); i++) if (bins[i] > peak) peak = bins[i];
  const around = [];
  for (let i = at(freq - gap - wide); i <= at(freq - gap); i++) around.push(bins[i]);
  for (let i = at(freq + gap); i <= at(freq + gap + wide); i++) around.push(bins[i]);
  around.sort((a, b) => a - b);
  const floor = around.length ? around[around.length >> 1] : -200;
  return { level: peak, floor, over: peak - floor };
}

// Listen to any sound source inside the page. openEar uses this with the microphone.
export function earFrom(ctx, node, { fft = 4096 } = {}) {
  const an = ctx.createAnalyser();
  an.fftSize = fft;
  an.smoothingTimeConstant = 0.6;
  an.minDecibels = -130;
  node.connect(an);
  const bins = new Float32Array(an.frequencyBinCount);
  const hz = ctx.sampleRate / fft;
  return {
    ok: true,
    ctx,
    rate: ctx.sampleRate,
    highest: ctx.sampleRate / 2,         // the highest pitch this phone can measure at all
    band(freq, half, gap, wide) {
      an.getFloatFrequencyData(bins);
      return bandOver(bins, hz, freq, half, gap, wide);
    },
  };
}

export async function openEar(options) {
  const off = error => ({ ok: false, error, rate: 0, highest: 0, band: () => ({ level: -200, floor: -200, over: 0 }), stop() {} });
  if (!navigator.mediaDevices?.getUserMedia) return off('unsupported');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const ear = earFrom(ctx, ctx.createMediaStreamSource(stream), options);
    ear.stop = () => { stream.getTracks().forEach(t => t.stop()); ctx.close(); };
    return ear;
  } catch (e) {
    return off(e.name || 'failed');
  }
}
