// The end-of-game screen every arcade game shares: who beat you, your score, the scoreboard,
// and a box to put your name on it.
//
//   const over = mountOver('goblin-king', COPY);          // builds the screen (hidden) from the game's words
//   over.onAgain(() => begin());
//   over.show({ picture: art('king-angry'), title: 'BANISHED!', line: '...', score: 420, detail: '3 demands met', hallDetail: '3 demands' });
//
// COPY needs: again, hallTitle, hallEmpty, phoneOnly, namePrompt, namePlaceholder, carve, carved ("... {rank}").
import { getHall, submitScore, renderHall, rememberName, savedName } from './hall.js';
import { fill } from './juice.js';

export function mountOver(game, COPY, { lowerIsBetter = false } = {}) {
  const section = document.createElement('section');
  section.id = 'over';
  section.className = 'overlay';
  section.hidden = true;
  section.innerHTML = `
    <div class="card">
      <div class="over-slot"></div>
      <h1 class="stamp"></h1>
      <p class="tagline over-line"></p>
      <p class="big-number over-score"></p>
      <p class="sub-number over-detail"></p>
      <form class="carve">
        <label for="over-name"></label>
        <div class="row">
          <input id="over-name" maxlength="12" autocomplete="nickname" enterkeyhint="done" required>
          <button class="primary plain" type="submit"></button>
        </div>
      </form>
      <p class="carved" hidden></p>
      <button class="primary mega over-again" type="button"></button>
      <h2></h2>
      <ol class="hall"></ol>
    </div>`;
  document.body.append(section);
  const q = sel => section.querySelector(sel);
  const form = q('form'), input = q('input'), hallList = q('ol.hall');
  q('label').textContent = COPY.namePrompt;
  input.placeholder = COPY.namePlaceholder;
  q('form button').textContent = COPY.carve;
  q('.over-again').textContent = COPY.again;
  q('h2').textContent = COPY.hallTitle;
  const hallOpts = { empty: COPY.hallEmpty, phoneOnly: COPY.phoneOnly };
  let current = null, carved = false;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (carved || !current) return;
    const name = input.value.trim().slice(0, 12);
    if (!name) return;
    carved = true;
    rememberName(name);
    input.blur();
    form.hidden = true;
    const res = await submitScore(game, { name, score: current.score, detail: current.hallDetail || '' }, { lowerIsBetter });
    q('.carved').textContent = fill(COPY.carved, { rank: res.rank ?? '?' });
    q('.carved').hidden = false;
    renderHall(hallList, res, { ...hallOpts, highlight: res.id });
  });

  return {
    el: section,
    onAgain(fn) { q('.over-again').addEventListener('click', fn); },
    hide() { section.hidden = true; },
    async show({ picture, title, win = false, line = '', score = 0, detail = '', hallDetail = '' }) {
      current = { score, hallDetail };
      carved = false;
      const slot = q('.over-slot');
      slot.replaceChildren();
      if (picture) { picture.classList.add('over-art'); slot.append(picture); }
      q('.stamp').textContent = title;
      q('.stamp').classList.toggle('win', win);
      q('.over-line').textContent = line;
      q('.over-score').textContent = score;
      q('.over-detail').textContent = detail;
      input.value = savedName();
      form.hidden = false;
      q('.carved').hidden = true;
      section.hidden = false;
      section.scrollTop = 0;
      renderHall(hallList, await getHall(game, { lowerIsBetter }), hallOpts);
    },
  };
}

// The scoreboard on a game's title screen.
export async function titleHall(list, game, COPY, { lowerIsBetter = false } = {}) {
  renderHall(list, await getHall(game, { lowerIsBetter }), { empty: COPY.hallEmpty, phoneOnly: COPY.phoneOnly });
}
