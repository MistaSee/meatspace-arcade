// Makes the 3D-printable coin blank: a flat disc with a shallow recess on top.
// The printed QR sticker goes in the recess. Later, an NFC sticker can sit
// underneath it in the same recess, so the coin works by scan or by tap.
// Prints flat, recess up, with no supports.
//
//   node tools/make-coin-stl.js
//
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COIN_DIAMETER = 44;    // mm
const THICKNESS = 3.6;       // mm
const RECESS_DIAMETER = 38.4; // 38 mm sticker plus a little clearance
const RECESS_DEPTH = 0.8;    // room for a paper sticker on top of an NFC sticker
const SEGMENTS = 160;

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'print');

const R = COIN_DIAMETER / 2, r = RECESS_DIAMETER / 2, T = THICKNESS, d = RECESS_DEPTH;

// Half cross-section of the coin in (radius, height), from the centre of the base,
// out along the bottom, up the edge, in across the rim, down into the recess, back to the centre.
const profile = [[0, 0], [R, 0], [R, T], [r, T], [r, T - d], [0, T - d]];

const tris = [];
const at = (p, a) => [p[0] * Math.cos(a), p[0] * Math.sin(a), p[1]];
for (let i = 0; i < profile.length - 1; i++) {
  const p = profile[i], q = profile[i + 1];
  for (let s = 0; s < SEGMENTS; s++) {
    // The last segment closes back onto angle 0 exactly, so the seam has no gap.
    const a0 = (s / SEGMENTS) * Math.PI * 2, a1 = (((s + 1) % SEGMENTS) / SEGMENTS) * Math.PI * 2;
    const A = at(p, a0), B = at(p, a1), C = at(q, a1), D = at(q, a0);
    if (p[0] > 0) tris.push([A, B, C]);
    if (q[0] > 0) tris.push([A, C, D]);
  }
}

function normal([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  return n.map(x => x / len);
}

const buf = Buffer.alloc(84 + tris.length * 50);
buf.write('Cursed Coin blank - Meatspace Arcade', 0, 'ascii');
buf.writeUInt32LE(tris.length, 80);
let o = 84;
for (const t of tris) {
  for (const x of [normal(t), ...t].flat()) { buf.writeFloatLE(x, o); o += 4; }
  buf.writeUInt16LE(0, o); o += 2;
}

const scad = `// Cursed Coin blank. Print flat, recess up, no supports.
// The 38 mm sticker sits in the recess; an NFC sticker can go underneath it.
coin_d = ${COIN_DIAMETER};
thickness = ${THICKNESS};
recess_d = ${RECESS_DIAMETER};
recess_depth = ${RECESS_DEPTH};
$fn = ${SEGMENTS};

difference() {
  cylinder(d = coin_d, h = thickness);
  translate([0, 0, thickness - recess_depth]) cylinder(d = recess_d, h = recess_depth + 1);
}
`;

await writeFile(path.join(OUT, 'cursed-coin-blank.stl'), buf);
await writeFile(path.join(OUT, 'cursed-coin-blank.scad'), scad);
console.log(`Wrote cursed-coin-blank.stl (${tris.length} triangles) and cursed-coin-blank.scad to ${OUT}`);
