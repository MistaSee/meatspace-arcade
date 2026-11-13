// The Hall: each game's scoreboard.
// Shared across everyone's phones when the arcade's own server is running.
// On a static host (GitHub Pages) there is no server, so scores stay on the phone.

const API = location.hostname.endsWith('github.io') || location.protocol === 'file:' ? null : '/api/scores';
const localKey = game => `arcade.hall.${game}`;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const rememberName = name => store.set('arcade.name', name);
export const savedName = () => store.get('arcade.name', '');

function sortFor(lowerIsBetter) {
  return lowerIsBetter ? (a, b) => a.score - b.score : (a, b) => b.score - a.score;
}

function localTop(game, lowerIsBetter) {
  return store.get(localKey(game), []).sort(sortFor(lowerIsBetter)).slice(0, 10);
}

export async function getHall(game, { lowerIsBetter = false } = {}) {
  if (API) {
    try {
      const r = await fetch(`${API}?game=${encodeURIComponent(game)}&limit=10`, { cache: 'no-store' });
      if (r.ok) return { shared: true, top: (await r.json()).top };
    } catch { /* fall through to this phone's scores */ }
  }
  return { shared: false, top: localTop(game, lowerIsBetter) };
}

export async function submitScore(game, entry, { lowerIsBetter = false } = {}) {
  if (API) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game, ...entry }),
      });
      if (r.ok) return { shared: true, ...(await r.json()) };
    } catch { /* fall through */ }
  }
  const id = 'local-' + Date.now();
  const list = store.get(localKey(game), []);
  list.push({ ...entry, id, at: new Date().toISOString() });
  list.sort(sortFor(lowerIsBetter));
  store.set(localKey(game), list.slice(0, 50));
  const top = localTop(game, lowerIsBetter);
  const rank = list.findIndex(s => s.id === id) + 1;
  return { shared: false, top, id, rank };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderHall(ol, data, { highlight, formatScore = s => String(s), empty, phoneOnly }) {
  ol.replaceChildren();
  if (!data.top.length) {
    ol.append(el('li', 'empty', empty));
  } else {
    data.top.forEach((s, i) => {
      const li = el('li', s.id === highlight ? 'me' : '');
      li.append(
        el('span', 'rank', String(i + 1)),
        el('span', 'who', s.name),
        el('span', 'what', s.detail || ''),
        el('span', 'pts', formatScore(s.score)),
      );
      ol.append(li);
    });
  }
  if (!data.shared && phoneOnly) ol.append(el('li', 'note', phoneOnly));
}
