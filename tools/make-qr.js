// Makes the QR codes on the home page. They point at the public site,
// so a phone can scan them off any screen.
//
//   node tools/make-qr.js
//   PUBLIC_BASE=https://example.com/arcade/ node tools/make-qr.js
//
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const BASE = (process.env.PUBLIC_BASE || 'https://mistasee.github.io/meatspace-arcade/').replace(/\/?$/, '/');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'qr');

const CODES = {
  'egg-race': 'games/egg-race/',
  'shake-duel': 'games/shake-duel/',
  lab: 'lab/',
};

await mkdir(OUT, { recursive: true });
for (const [name, page] of Object.entries(CODES)) {
  const svg = await QRCode.toString(BASE + page, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  await writeFile(path.join(OUT, `${name}.svg`), svg);
  console.log(`${name}.svg → ${BASE + page}`);
}
