// Room-scale AR for the arcade: puts a 3D scene in the player's real room.
//
// It runs one of three ways, chosen automatically (or forced with ?mode=desk or ?mode=look):
//   'ar'    Chrome on an AR-capable Android phone. The camera shows the room and the game
//           knows where the phone is, so the player can walk, duck and lean.
//   'look'  Any other phone. The camera shows the room and turning the phone looks around,
//           but the game cannot tell if the player walks.
//   'desk'  A computer. Drag to look, WASD to walk, Q and E to duck and stand. For testing.
//
//   const ar = createAR({ stage, video });
//   startButton.onclick = async () => {
//     await ar.start();                    // must come from a tap
//     await ar.place();                    // AR: the player taps the floor. Elsewhere: at once.
//     ar.world.add(...)                    // the floor is y = 0, the tapped spot is the origin,
//   };                                     // and +z points back towards where the player stood
//   ar.onFrame = (dt, now) => {};          // every frame
//   ar.onTap = raycaster => {};            // the player tapped; raycaster points where they tapped
//   ar.head, ar.forward, ar.speed          // where the phone is, where it points, how fast it moves
//
// Distances are metres.
import * as THREE from '../vendor/three.module.js';
import { openCamera } from './camera.js';
import { artUrl, TESTING } from './juice.js';

export { THREE };

const FORCED = new URLSearchParams(location.search).get('mode');

export async function arMode() {
  if (FORCED === 'desk' || FORCED === 'look') return FORCED;
  if (navigator.xr?.isSessionSupported) {
    try { if (await navigator.xr.isSessionSupported('immersive-ar')) return 'ar'; } catch { /* not allowed */ }
  }
  return matchMedia('(pointer: coarse)').matches ? 'look' : 'desk';
}

export function createAR({ stage, video, eye = 1.5, distance = 2.2 }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, stencil: true, preserveDrawingBuffer: TESTING });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'world';
  (video || stage.firstElementChild).after(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 80);
  const rig = new THREE.Group();          // carries the camera when there is no AR
  rig.add(camera);
  scene.add(rig);
  const world = new THREE.Group();        // everything the game makes goes in here
  scene.add(world);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x665544, 1.6));

  // The ring that shows where the floor is while the player chooses a spot.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.15, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffe04a, transparent: true, opacity: 0.95, depthTest: false }),
  );
  reticle.renderOrder = 20;
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // A dark shell round the camera, to dim the real room for spooky games.
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(40, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, depthTest: false }),
  );
  shade.renderOrder = -10;
  shade.visible = false;
  camera.add(shade);

  // A plain room for when there is no camera to show: a floor grid and a dark sky.
  const grid = new THREE.GridHelper(12, 24, 0xffc93c, 0x5a4660);
  grid.visible = false;
  world.add(grid);

  const loader = new THREE.TextureLoader();
  const textures = new Map();
  function texture(slug) {
    if (!textures.has(slug)) {
      const t = loader.load(artUrl(slug));
      t.colorSpace = THREE.SRGBColorSpace;
      textures.set(slug, t);
    }
    return textures.get(slug);
  }

  const ar = {
    THREE, renderer, scene, camera, world, canvas,
    mode: 'desk',
    placed: false,
    head: new THREE.Vector3(0, eye, distance),     // the phone, in the world's own coordinates
    forward: new THREE.Vector3(0, 0, -1),          // where it points
    speed: 0,                                      // metres a second, smoothed
    onFrame: null,
    onTap: null,
    onEnd: null,
    sim: { yaw: 0, pitch: 0, pos: new THREE.Vector3(0, eye, distance) },   // desk mode's pretend phone
    start, place, stop, sprite, pick, dim, texture, lookAtFlat,
  };

  const billboards = new Set();
  // A flat picture that stands on the floor and always turns to face the player.
  //   height in metres. opts: shadow (a dark blob under it), glow (drawn brighter, for ghosts and magic),
  //   flat (lies on the floor instead of standing).
  function sprite(slug, height = 1, { shadow = true, glow = false, flat = false, opacity = 1 } = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: texture(slug), transparent: true, alphaTest: glow ? 0 : 0.04, opacity,
      side: THREE.DoubleSide, depthWrite: !glow, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const geo = new THREE.PlaneGeometry(height, height);
    if (flat) geo.rotateX(-Math.PI / 2).translate(0, 0.01, 0);
    else geo.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    group.userData = { mesh, mat, height, flat };
    if (shadow && !flat) {
      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(height * 0.32, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
      );
      blob.position.y = 0.005;
      group.add(blob);
      group.userData.blob = blob;
    }
    if (!flat) billboards.add(group);
    return group;
  }

  const flat = new THREE.Vector3();
  // Turn something to face a point, staying upright.
  function lookAtFlat(obj, point) {
    obj.getWorldPosition(flat);
    world.worldToLocal(flat);
    obj.rotation.y = Math.atan2(point.x - flat.x, point.z - flat.z);
  }

  // The first of these objects the tap landed on, or null. Nearest first.
  function pick(raycaster, objects) {
    const meshes = objects.map(o => o.userData?.mesh || o);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const i = meshes.indexOf(hits[0].object);
    return i < 0 ? null : objects[i];
  }

  function dim(amount) {
    shade.visible = amount > 0.01;
    shade.material.opacity = amount;
  }

  // ---------- starting ----------
  let session = null, refSpace = null, hitSource = null, cam = null;
  let lastHit = null, placeResolve = null;
  let yawOffset = null, orient = null;
  const keys = new Set();

  async function start() {
    ar.mode = await arMode();
    if (ar.mode === 'ar') {
      try {
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['local'],
          optionalFeatures: ['hit-test', 'dom-overlay'],
          domOverlay: { root: stage },
        });
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(session);
        refSpace = renderer.xr.getReferenceSpace();
        session.requestReferenceSpace('viewer')
          .then(space => session.requestHitTestSource({ space }))
          .then(src => { hitSource = src; })
          .catch(() => { /* no hit testing: place() falls back to a guess */ });
        session.addEventListener('select', onSelect);
        session.addEventListener('end', () => { session = null; hitSource = null; ar.placed = false; ar.onEnd?.(); });
        // Taps on buttons in the overlay must not also count as taps on the room.
        stage.addEventListener('beforexrselect', e => { if (e.target.closest?.('button, a, input, summary')) e.preventDefault(); });
      } catch {
        ar.mode = 'look';     // the player said no, or the phone could not start AR after all
      }
    }
    if (ar.mode !== 'ar') {
      if (ar.mode === 'look') {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          try { await DeviceOrientationEvent.requestPermission(); } catch { /* refused */ }
        }
        addEventListener('deviceorientation', e => { if (e.alpha !== null) orient = e; });
        if (video) cam = await openCamera(video, { facing: 'environment', width: 1280, height: 720 });
        if (video) video.hidden = !cam?.ok;
      }
      grid.visible = !cam?.ok;
      stage.classList.toggle('no-feed', !cam?.ok);
      resize();
      if (!TESTING) renderer.setAnimationLoop(frame);
    }
    if (TESTING && ar.mode !== 'ar') setInterval(() => frame(performance.now(), null), 16);
    return ar.mode;
  }

  // Wait for the player to choose where the game goes. In AR they tap the floor;
  // otherwise the game goes straight in front of them.
  function place() {
    ar.placed = false;
    if (ar.mode !== 'ar') {
      yawOffset = null;
      world.position.set(0, 0, 0);
      world.rotation.y = 0;
      ar.sim.pos.set(0, eye, distance);
      ar.sim.yaw = 0;
      ar.sim.pitch = 0;
      ar.placed = true;
      return Promise.resolve();
    }
    return new Promise(resolve => { placeResolve = resolve; });
  }

  const tapRay = new THREE.Raycaster();
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();

  function onSelect(event) {
    const frame = event.frame;
    const pose = frame.getPose(event.inputSource.targetRaySpace, refSpace);
    if (placeResolve) {
      // Put the world where the reticle is, or two metres ahead on a guessed floor if the phone found none.
      const viewer = frame.getViewerPose(refSpace);
      const p = viewer.transform.position;
      if (lastHit) world.position.copy(lastHit);
      else {
        tmpQ.set(viewer.transform.orientation.x, viewer.transform.orientation.y, viewer.transform.orientation.z, viewer.transform.orientation.w);
        tmpV.set(0, 0, -1).applyQuaternion(tmpQ).setY(0).normalize();
        world.position.set(p.x + tmpV.x * 2, p.y - 1.3, p.z + tmpV.z * 2);
      }
      world.rotation.y = Math.atan2(p.x - world.position.x, p.z - world.position.z);
      world.updateMatrixWorld(true);
      ar.placed = true;
      reticle.visible = false;
      const done = placeResolve;
      placeResolve = null;
      done();
      return;
    }
    if (!pose || !ar.onTap) return;
    tmpM.fromArray(pose.transform.matrix);
    tapRay.ray.origin.setFromMatrixPosition(tmpM);
    tapRay.ray.direction.set(0, 0, -1).transformDirection(tmpM);
    ar.onTap(tapRay);
  }

  // Taps and looking around without AR.
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  addEventListener('pointermove', e => {
    if (!drag || ar.mode !== 'desk') return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    ar.sim.yaw -= dx * 0.005;
    ar.sim.pitch = Math.max(-1.4, Math.min(1.4, ar.sim.pitch - dy * 0.005));
  });
  addEventListener('pointerup', e => {
    if (!drag) return;
    const wasTap = drag.moved < 8;
    drag = null;
    if (!wasTap || ar.mode === 'ar' || !ar.onTap || !ar.placed) return;
    const r = canvas.getBoundingClientRect();
    tapRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    ar.onTap(tapRay);
  });
  addEventListener('keydown', e => { if (e.target.tagName !== 'INPUT') keys.add(e.code); });
  addEventListener('keyup', e => keys.delete(e.code));

  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  const zee = new THREE.Vector3(0, 0, 1), euler = new THREE.Euler(), q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const rad = d => (d * Math.PI) / 180;

  function moveWithoutAR(dt) {
    if (ar.mode === 'look' && orient) {
      const angle = rad(screen.orientation?.angle ?? window.orientation ?? 0);
      euler.set(rad(orient.beta), rad(orient.alpha), -rad(orient.gamma), 'YXZ');
      camera.quaternion.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -angle));
      if (yawOffset === null) {
        // Whichever way the phone points when the game starts is "forwards".
        tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion);
        yawOffset = -Math.atan2(-tmpV.x, -tmpV.z);
      }
      rig.rotation.y = yawOffset;
    } else {
      const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
      const tip = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      ar.sim.yaw += turn * dt * 1.8;
      ar.sim.pitch = Math.max(-1.4, Math.min(1.4, ar.sim.pitch + tip * dt * 1.2));
      const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const up = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
      const pace = (keys.has('ShiftLeft') ? 3.5 : 1.6) * dt;
      ar.sim.pos.x += (-Math.sin(ar.sim.yaw) * fwd + Math.cos(ar.sim.yaw) * side) * pace;
      ar.sim.pos.z += (-Math.cos(ar.sim.yaw) * fwd - Math.sin(ar.sim.yaw) * side) * pace;
      ar.sim.pos.y = Math.max(0.2, Math.min(2.2, ar.sim.pos.y + up * pace));
      camera.rotation.set(ar.sim.pitch, ar.sim.yaw, 0, 'YXZ');
      rig.rotation.y = 0;
    }
    rig.position.copy(ar.mode === 'look' ? tmpV.set(0, eye, distance) : ar.sim.pos);
  }

  const prevHead = new THREE.Vector3();
  let last = performance.now(), firstFrame = true;

  function frame(now, xrFrame) {
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    last = now;

    if (ar.mode === 'ar' && xrFrame) {
      const viewer = xrFrame.getViewerPose(refSpace);
      if (viewer) {
        const { position: p, orientation: o } = viewer.transform;
        tmpV.set(p.x, p.y, p.z);
        tmpQ.set(o.x, o.y, o.z, o.w);
      }
      lastHit = null;
      if (hitSource && placeResolve) {
        const results = xrFrame.getHitTestResults(hitSource);
        const pose = results.length ? results[0].getPose(refSpace) : null;
        // Only roughly level surfaces count as floor.
        if (pose && pose.transform.matrix[5] > 0.8) {
          reticle.matrix.fromArray(pose.transform.matrix);
          lastHit = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
        }
      }
      reticle.visible = !!lastHit;
    } else {
      moveWithoutAR(dt);
      rig.updateMatrixWorld(true);
      camera.getWorldPosition(tmpV);
      camera.getWorldQuaternion(tmpQ);
    }

    // Where the phone is and where it points, in the world's own coordinates.
    world.updateMatrixWorld(true);
    ar.head.copy(tmpV);
    world.worldToLocal(ar.head);
    ar.forward.set(0, 0, -1).applyQuaternion(tmpQ);
    tmpM.copy(world.matrixWorld).invert();
    ar.forward.transformDirection(tmpM);
    if (firstFrame) { prevHead.copy(ar.head); firstFrame = false; }
    const v = prevHead.distanceTo(ar.head) / dt;
    ar.speed += (Math.min(v, 8) - ar.speed) * Math.min(1, dt * 8);
    prevHead.copy(ar.head);

    if (ar.placed) ar.onFrame?.(dt, now);

    for (const b of billboards) {
      if (!b.parent) { billboards.delete(b); continue; }
      lookAtFlat(b, ar.head);
    }
    renderer.render(scene, camera);
  }
  if (TESTING) ar.frame = frame;

  // AR sessions drive their own frames.
  renderer.xr.addEventListener('sessionstart', () => renderer.setAnimationLoop(frame));

  function stop() {
    session?.end();
    cam?.stop();
    renderer.setAnimationLoop(null);
  }

  resize();
  return ar;
}
