// Small helpers every arcade game uses: pictures, big words, the talking box, hearts.
// The page needs the matching elements from comic.css: #prompt, #pops, #flash, #line and #sr.

export const $ = id => document.getElementById(id);
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const pick = list => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list);
export const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const TESTING = new URLSearchParams(location.search).has('tick');

const SHARED_ART = new URL('./art/', import.meta.url).href;
const DUEL_ART = new URL('../games/shake-duel/art/', import.meta.url).href;
// Where a picture lives. Shake Duel's opponents can guest in the other games as "duel/gary".
export const artUrl = slug => (slug.startsWith('duel/') ? DUEL_ART + slug.slice(5) : SHARED_ART + slug) + '.webp';

// A picture, with an emoji standing in if it is missing.
export function art(slug, glyph = '❓', cls = '') {
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  if (cls) img.className = cls;
  img.src = artUrl(slug);
  img.onerror = () => {
    const s = document.createElement('span');
    s.className = ('glyph ' + cls).trim();
    s.textContent = glyph;
    img.replaceWith(s);
  };
  return img;
}

// Fill in every element marked data-copy="key" from the game's words.
export function applyCopy(COPY) {
  for (const node of document.querySelectorAll('[data-copy]')) {
    const value = COPY[node.dataset.copy];
    if (Array.isArray(value)) {
      node.replaceChildren(...value.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
    } else if (value !== undefined) {
      node.textContent = value;
    }
  }
}

// The big word in the middle of the screen.
export function setPrompt(text, cls = '') {
  const p = $('prompt');
  p.textContent = text;
  p.className = '';
  if (!text) return;
  void p.offsetWidth;
  p.className = ('big ' + cls + (text.length > 9 ? ' long' : '')).trim();
}

// The talking box types its lines out. Screen readers get the whole line at once.
let sayTimer = null;
export function say(text) {
  const el = $('line');
  clearInterval(sayTimer);
  $('sr').textContent = text || '';
  if (!text) { el.textContent = ''; return; }
  let i = 0;
  el.textContent = '';
  sayTimer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(sayTimer);
  }, 18);
}

// A word or number that bursts onto the screen and clears itself away.
//   cls: 'dmg', 'word', 'banner', 'ko' (see comic.css), plus colour variants.
export function pop(text, cls, x = innerWidth / 2, y = innerHeight * 0.4, life = 1800) {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('pops').append(el);
  setTimeout(() => el.remove(), life);
  return el;
}

export function flash(colour = '#fff') {
  const f = $('flash');
  f.style.background = colour;
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

const HEART = '<svg viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28C10 22 2 17 2 9.5 2 5 5.5 2 9.5 2c2.8 0 5 1.5 6.5 4 1.5-2.5 3.7-4 6.5-4C26.5 2 30 5 30 9.5 30 17 22 22 16 28z"/><ellipse class="shine" cx="9" cy="8" rx="3" ry="2" transform="rotate(-30 9 8)"/></svg>';
// A row of hearts. Returns a function to set how many are left.
export function hearts(el, max) {
  let shown = max;
  el.classList.add('hearts');
  el.setAttribute('role', 'img');
  el.innerHTML = HEART.repeat(max);
  return n => {
    [...el.children].forEach((svg, i) => {
      svg.setAttribute('class', i < n ? 'on' : 'off');
      if (i === n && shown > n) svg.classList.add('lost');
    });
    shown = n;
    el.setAttribute('aria-label', `${n} of ${max} left`);
  };
}

export function setScore(n) {
  const sc = $('score');
  if (sc.textContent === String(n)) return;
  sc.textContent = n;
  sc.classList.remove('bump');
  void sc.offsetWidth;
  sc.classList.add('bump');
}

// Run fn(dt, now) every frame. Browsers pause frames on hidden pages, so with ?tick in the
// address a plain timer is used instead: that is for automated checks only.
export function everyFrame(fn) {
  let last = performance.now(), stopped = false;
  const step = now => {
    if (stopped) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fn(dt, now);
    if (!TESTING) requestAnimationFrame(step);
  };
  if (TESTING) { const id = setInterval(() => step(performance.now()), 16); return () => { stopped = true; clearInterval(id); }; }
  requestAnimationFrame(step);
  return () => { stopped = true; };
}
