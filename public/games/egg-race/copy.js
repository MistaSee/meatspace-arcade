// Every word the player sees in the Egg-and-Spoon Race lives here.
// {curly} words are filled in by the game.

export const COPY = {
  title: 'Egg-and-Spoon Race',
  pitch: 'Your phone is the spoon. The egg is very much real (on screen).',
  how: [
    'Hold your phone flat in one hand, screen up, like a spoon.',
    'Walk {steps} steps without the egg falling off.',
    'Drop it and it is back to the start line. Sports day rules.',
  ],
  safety: 'Watch where you are going. The egg is not worth a broken toe.',
  start: 'To the start line',
  again: 'Race again',
  hallTitle: 'Fastest Spoons',
  hallEmpty: 'Nobody has finished yet. The egg is waiting.',
  phoneOnly: 'Scores are kept on this phone for now.',
  noSensors: '<b>Tilt and steps are switched off here.</b> They only work on a phone, on a secure (https) address. Try it anyway with the arrow keys and Enter for a step.',

  ready: 'Hold your spoon level…',
  readyAgain: 'Back at the start? Hold it level…',
  go: 'GO!',
  steps: '{n} / {total} steps',
  eggsBroken: ['', '1 egg broken', '{n} eggs broken'],

  // The commentator
  commentary: {
    start: ['And they\'re off!', 'A clean start. The crowd is mildly interested.'],
    first: ['One step. One small step.', 'Step one. Textbook.'],
    milestone: {
      5: ['Five steps. Nobody has fainted.', 'Five steps in. Composure: excellent.'],
      10: ['Ten steps! Is this a world record? (It is not.)'],
      15: ['Halfway! The crowd goes mild.'],
      20: ['Twenty steps. The egg is starting to believe.'],
      25: ['Five to go. Do not look at the egg. Look at the egg.'],
    },
    countdown: ['{left}…', '{left} to go!'],
    wobble: ['Ooh, wobbly!', 'Steady…', 'The egg has concerns.', 'Careful now.'],
    gustWarn: ['Is that a gust of wind? It is!', 'Wind incoming!'],
    gustSurvived: ['Weathered the gust. Magnificent.', 'The wind tried. The wind failed.'],
    drop: ['SPLAT.', 'The egg has left the spoon.', 'Oh no. Oh yes. Oh no.'],
    restart: ['Back to the start line. Sports day rules.'],
  },

  finishTitle: 'FINISHED!',
  finishLine: [
    'Your egg survived. It will tell its children about this.',
    'A triumph of balance and not falling over.',
    'The egg would like to thank its spoon.',
  ],
  finishTime: '{t}s',
  finishDetail: '{eggs}',
  noEggsHarmed: 'no eggs harmed',
  namePrompt: 'Put your name in the Fastest Spoons',
  namePlaceholder: 'Your name',
  carve: 'Save it',
  carved: 'Saved. You are number {rank}.',
  giveUp: 'Give up',
  gaveUp: 'You put the spoon down. The egg is relieved.',
};

export const pick = list => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list);
export const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
