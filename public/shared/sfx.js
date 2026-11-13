// Sampled sound effects for the arcade. Every file in shared/sfx/ is CC0 (public domain):
// shared/sfx/CREDITS.md says where each one came from.
//
//   const sfx = createSfx({ hit: ['hit1', 'hit2'], cheer: 'cheer' });
//   startButton.onclick = () => sfx.unlock();      // must come from a tap
//   sfx.play('hit', { volume: 0.8, rate: 1.2 });   // a name with several files picks one at random
//   const stop = sfx.loop('crowd', { volume: 0.3 });  stop();
//
// A name with no file, or a file that fails to load, plays nothing.

export function createSfx(map, { base = new URL('./sfx/', import.meta.url).href, ext = '.mp3' } = {}) {
  let ctx = null, master = null;
  const buffers = new Map();   // file -> AudioBuffer, null (failed) or a Promise while loading
  const filesFor = name => [].concat(map[name] || []);

  function load(file) {
    if (!buffers.has(file)) {
      buffers.set(file, fetch(base + file + ext)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then(data => ctx.decodeAudioData(data))
        .then(buf => { buffers.set(file, buf); return buf; })
        .catch(() => { buffers.set(file, null); return null; }));
    }
    return buffers.get(file);
  }

  const s = {
    muted: false,
    get ready() { return !!ctx; },
    unlock() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
        if (!master) { master = ctx.createGain(); master.connect(ctx.destination); }
      } catch { ctx = null; }
      if (ctx) for (const name of Object.keys(map)) filesFor(name).forEach(load);
    },
    // Returns a function that stops the sound.
    play(name, { volume = 1, rate = 1, delay = 0, vary = 0.06, loop = false } = {}) {
      const list = filesFor(name);
      if (s.muted || !ctx || !list.length) return () => {};
      const file = list[Math.floor(Math.random() * list.length)];
      let src = null, gain = null, stopped = false;
      const go = buf => {
        if (!buf || stopped) return;
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = loop;
        src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
        gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(master);
        src.start(ctx.currentTime + delay);
      };
      const have = buffers.get(file);
      if (have && !(have instanceof Promise)) go(have);
      else Promise.resolve(load(file)).then(go);
      return () => {
        stopped = true;
        if (!src) return;
        try {
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
          src.stop(ctx.currentTime + 0.4);
        } catch { /* already stopped */ }
      };
    },
    loop(name, opts = {}) { return s.play(name, { ...opts, loop: true, vary: 0 }); },
  };
  return s;
}
