// Every word the player sees in The Cursed Coin lives here,
// so a voice pass only has to touch this file.
// {curly} words are filled in by the game.

export const COPY = {
  title: 'The Cursed Coin',
  coinHeld: 'This is coin #{id}. It knows what it did.',
  intro: [
    'You picked up a coin.',
    'It was cursed. Obviously. Nobody leaves a perfectly good coin lying about.',
    'Every few turns the coin flips itself, and the dungeon has to do what it says.',
  ],
  howTo: 'Swipe or tap to move. Walk into things to hit them. Find the hole and jump in.',
  flipHint: 'Tap the coin to flip it yourself, once per floor.',
  start: 'Accept the curse',
  again: 'Pick the coin up again',

  // HUD
  floorLabel: 'Floor {d}',
  goldLabel: '{g} gold',
  flipsIn: 'flips in {n}',
  heads: 'HEADS',
  tails: 'TAILS',
  sound: 'Sound',

  // Moving about
  floorArrive: [
    'Floor {d}. It smells of {smell}.',
    'Floor {d}. Someone has been here before. It was {smell}.',
  ],
  smells: [
    'damp',
    'old socks',
    'regret',
    "someone else's lunch",
    'ducks',
    'wet dog',
    'burnt toast',
    'a disappointing birthday',
  ],
  descend: ['You jump in the hole. On purpose, this time.', 'Down the hole you go. Wheee.'],
  wait: ['You wait. Bravely.', 'You stand very still. Nobody is fooled.', 'You have a little think.'],
  bumpWall: ['That is a wall.', 'The wall wins.', 'Ow. Wall.'],
  bumpEdge: ["That's the edge of the world. Best not."],

  // Fighting
  hit: ['You bonk the {name}.', 'You whack the {name}.', 'You poke the {name}. It minds.'],
  miss: [
    'You swing. The sword slides out of your buttery hand.',
    'Miss! Your sword is behind you. Now it is in front of you again.',
  ],
  missTag: 'miss',
  hurt: ['The {name} hits you.', 'The {name} gets you.', 'Ouch. The {name}.'],
  polite: ["The {name} winds up, then says sorry and doesn't."],
  sorryTag: 'sorry!',
  frogBlink: ['The frog wizard blinks across the room, ribbiting smugly.'],

  // Finding things
  goldFind: [
    '{n} gold. Ordinary, uncursed coins. How dull.',
    'You find {n} gold. It does nothing weird at all.',
    '{n} gold! Not cursed. Suspicious.',
  ],
  soup: ['Suspicious soup. +2 hearts. Do not think about it.'],
  soupFull: ["Suspicious soup. You're fine already, so you have it as a snack."],

  // The coin
  selfFlip: ['The coin flips itself!', 'The coin has decided. The coin flips.'],
  playerFlip: ['You flip the coin. Bold.', 'You flip the coin. The coin seems pleased.'],
  tired: ['The coin has already flipped for you on this floor. It needs a lie down.'],

  // Each flip picks one of these. 'short' shows under the board for as long as it lasts.
  mods: [
    { id: 'sword', side: 'heads', name: 'Sword Day', short: 'double damage',
      text: 'Your sword remembers it is a sword. Double damage.' },
    { id: 'shy', side: 'heads', name: 'Shy Monsters', short: 'monsters move half as often',
      text: 'Everything is suddenly very self-conscious. Monsters move half as often.' },
    { id: 'rich', side: 'heads', name: 'Pockets of Plenty', short: 'gold is worth double',
      text: "Gold is worth double. Don't ask where it comes from." },
    { id: 'snack', side: 'heads', name: 'Pocket Sandwich', short: '+1 heart',
      text: 'There is a sandwich in your pocket. You eat it. +1 heart.' },
    { id: 'polite', side: 'heads', name: 'Polite Dungeon', short: 'the next hit says sorry instead',
      text: 'The next thing that hits you will apologise instead.' },

    { id: 'butter', side: 'tails', name: 'Butterfingers', short: 'one swing in three misses',
      text: 'Your sword is buttered. One swing in three misses.' },
    { id: 'ducks', side: 'tails', name: 'Duck Reinforcements', short: 'two more ducks',
      text: 'Two more ducks have arrived. They brought nothing.' },
    { id: 'tax', side: 'tails', name: 'The Taxman', short: 'a third of your gold, gone',
      text: 'The coin has done your taxes. You lose a third of your gold.' },
    { id: 'ice', side: 'tails', name: 'Slippery Floor', short: 'you slide until you hit something',
      text: 'Someone has mopped. You slide until you hit something.' },
    { id: 'backwards', side: 'tails', name: 'Backwards Day', short: 'controls are reversed',
      text: 'Left is right. Up is down. Ducks are still ducks.' },
    { id: 'snails', side: 'tails', name: 'Everything Is Snails', short: 'every monster is a snail',
      text: 'Every monster here is now a snail. Slow. Unstoppable.' },
  ],

  monsters: {
    rat: { name: 'rat with a grudge',
      kill: "The rat's grudge dies with it.",
      epitaph: 'Killed by a rat. It had its reasons.' },
    duck: { name: 'aggressive duck',
      kill: 'The duck is defeated. Somewhere, a pond weeps.',
      epitaph: 'Killed by a duck. The duck has not apologised.' },
    frog: { name: 'frog wizard',
      kill: 'The frog wizard croaks. Literally.',
      epitaph: 'Out-wizarded by a frog.' },
    snail: { name: 'snail of inevitability',
      kill: 'The snail has been stopped. Scientists are baffled.',
      epitaph: 'Caught by the snail. It was always going to happen.' },
    ghost: { name: 'ghost of a previous adventurer',
      kill: 'The ghost is now twice as dead.',
      epitaph: 'Haunted to death by someone who made all the same mistakes.' },
    troll: { name: 'troll with no bridge',
      kill: 'The troll wanders off to look for a bridge.',
      epitaph: 'Flattened by a troll who was mostly just lost.' },
  },
  epitaphUnknown: 'Died of mysterious causes. The coin is not saying.',

  // The end
  deathHead: 'You died on floor {d}.',
  finalScore: 'Score {s}',
  scoreSum: '{g} gold + {f} for floors',
  namePrompt: 'Carve your name in the Hall',
  namePlaceholder: 'Your name',
  carve: 'Carve it',
  carved: 'Carved. You are number {rank}.',
  carvedOffline: 'Saved on this phone. The Hall will never know.',

  hallTitle: 'Hall of the Cursed',
  hallEmpty: 'Nobody yet. The coin is waiting.',
  hallOffline: 'The Hall is asleep. Scores are kept on this phone for now.',
  hallFloor: 'floor {d}',
  hallCoin: 'coin #{id}',
};

export const pick = list => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list);
export const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
