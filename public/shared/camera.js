// The phone's camera as a live picture, for games that look at the real world.
//
//   const cam = await openCamera(videoElement, { facing: 'environment' });   // 'user' is the selfie camera
//   cam.ok       false if there is no camera, or the player said no
//   cam.stop()
//
// Cameras only work on secure (https) pages, and the first call must follow a tap.

export async function openCamera(video, { facing = 'environment', width = 640, height = 480 } = {}) {
  const off = error => ({ ok: false, error, stop() {} });
  if (!navigator.mediaDevices?.getUserMedia) return off('unsupported');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: width }, height: { ideal: height } },
    });
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    return {
      ok: true,
      stream,
      stop() {
        stream.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      },
    };
  } catch (e) {
    return off(e.name || 'failed');
  }
}

// Which part of the camera's picture sits under a square in the middle of the screen,
// given that the picture is stretched to cover the screen. size is the square's width in screen pixels.
export function centreCrop(video, size) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.max(video.clientWidth / vw, video.clientHeight / vh);
  const s = Math.min(vw, vh, size / scale);
  return { x: (vw - s) / 2, y: (vh - s) / 2, size: s };
}
