// Every word the player sees in The Goblin King Demands lives here.
// {curly} words are filled in by the game.

export const COPY = {
  title: 'The Goblin King Demands',
  pitch: 'He wants things. Real things. From your actual house. Now.',
  how: [
    'The King names a colour. Run and find something that colour.',
    'Fill the ring on the screen with it before his patience runs out.',
    'Sometimes he wants a twirl, a bow or a jump as well. Do it. He is the King.',
    'Three tantrums and you are banished.',
  ],
  howTitle: 'How to play',
  safety: 'You will be dashing about. Mind the furniture, the stairs and the cat.',
  start: 'Grovel',
  again: 'Grovel again',
  hallTitle: 'Royal favourites',
  hallEmpty: 'Nobody has pleased the King yet.',
  phoneOnly: 'Scores are kept on this phone for now.',
  noCamera: '<b>No camera here.</b> The King cannot see your offerings. On a phone, allow the camera when it asks. To try it anyway, hold a number key: 1 red, 2 orange, 3 yellow, 4 green, 5 blue, 6 purple, 7 pink, 8 white, 9 black. T twirls, B bows, space jumps.',

  kingLabel: 'His Majesty',
  demandNumber: 'Demand {n}',
  colours: { red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', purple: 'purple', pink: 'pink', white: 'white', black: 'black' },
  preambles: [
    'PEASANT!', 'I am bored.', 'My royal eyes itch.', 'The crown is restless.', 'Attend me!', 'I have had a thought.',
    'My horoscope was very clear.', 'Hop to it!', 'It is nearly teatime.', 'I woke up wanting something.',
  ],
  demand: 'Bring me something {colour}!',
  tooDark: 'It is too dark. The King cannot see a thing. Find some light.',
  closer: 'Closer! Fill the ring!',
  nearly: 'Yes… hold it there…',
  hurry: ['Tick tock.', 'I am waiting.', 'Any day now.', 'My patience is small. Like my legs.'],

  // Whims: extra orders after the colour is found.
  whims: {
    twirl:  { prompt: 'NOW TWIRL!', line: 'And a twirl! All the way round. I want to see the back of you.' },
    bow:    { prompt: 'NOW BOW!', line: 'Bow! Lower. LOWER. I am very short.' },
    jump:   { prompt: 'NOW JUMP!', line: 'Jump! For no reason. I enjoy it.' },
    freeze: { prompt: 'NOBODY MOVE!', line: 'Nobody move. I thought I heard a biscuit.' },
  },
  sawThat: 'I SAW THAT. You moved.',

  pleased: ['SPLENDID!', 'ADEQUATE!', 'MINE NOW!', 'OOH, SHINY!', 'ACCEPTABLE!', 'YES! THAT!'],
  pleasedLines: [
    'A fine {colour} thing. Put it with the others.',
    'Very {colour}. I shall name it Kevin.',
    'Exactly the {colour} I had in mind.',
    'Good. You may keep your head for now.',
    'It is no use to me whatsoever. I love it.',
  ],
  tantrum: ['TANTRUM!', 'OUTRAGE!', 'UNACCEPTABLE!', 'GUARDS!'],
  tantrumLines: [
    'TOO SLOW! I have aged. Look at me. I have AGED.',
    'Nothing {colour}? In this whole kingdom?',
    'I asked for ONE thing.',
    'This is the worst day of my reign, and there was the Tuesday with the bees.',
  ],
  whimFailLines: ['I ask so little.', 'You call that a {whim}?'],
  whimNames: { twirl: 'twirl', bow: 'bow', jump: 'jump', freeze: 'standing still' },

  overTitle: 'BANISHED!',
  overLines: [
    'Three tantrums. The King has had you thrown out of the kingdom, which is mostly a shed.',
    'You are banished. He has already forgotten your name.',
  ],
  delivered: ['No demands met', '1 demand met', '{n} demands met'],
  detail: '{n} demands',
  namePrompt: 'Sign the royal register',
  namePlaceholder: 'Your name',
  carve: 'Sign',
  carved: 'Signed. You are favourite number {rank}.',
};
