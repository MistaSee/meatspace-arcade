// The phone's torch, and keeping its screen awake.
//
//   const cam = await openCamera(video, { facing: 'environment' });   // the torch belongs to the back camera
//   if (hasTorch(cam)) await setTorch(cam, true);
//   const release = await keepAwake();
//
// Switching the torch from a web page works in Chrome on Android. iPhones do not allow it.

const track = cam => cam?.stream?.getVideoTracks?.()[0] || null;

export function hasTorch(cam) {
  try { return !!track(cam)?.getCapabilities?.().torch; } catch { return false; }
}

// Returns true if the phone accepted the request.
export async function setTorch(cam, on) {
  const t = track(cam);
  if (!t) return false;
  try { await t.applyConstraints({ advanced: [{ torch: !!on }] }); return true; } catch { return false; }
}

// Stop the screen dimming and locking while a game is being played. Returns a function that lets it sleep again.
export async function keepAwake() {
  let lock = null, wanted = true;
  const ask = async () => { try { lock = (await navigator.wakeLock?.request('screen')) || null; } catch { lock = null; } };
  await ask();
  // The phone drops the lock whenever the page is hidden, so ask again when it comes back.
  const again = () => { if (wanted && document.visibilityState === 'visible') ask(); };
  document.addEventListener('visibilitychange', again);
  return () => { wanted = false; document.removeEventListener('visibilitychange', again); lock?.release?.(); };
}
