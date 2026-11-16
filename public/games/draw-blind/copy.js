// Every word the players see in Draw Blind. It is a darkroom: few words, lit red.

export const COPY = {
  title: 'DRAW BLIND',
  rule: 'One phone is the camera. Every other phone is a brush. Lights off.',
  beCamera: 'THIS PHONE IS THE CAMERA',
  beBrush: 'THIS PHONE IS A BRUSH',

  // The camera phone.
  team: 'TEAM {team} DRAWS',
  propUp: 'Prop me up, lens towards the artist. The team watches this screen. The artist never sees it.',
  flip: 'OTHER LENS',
  open: 'OPEN THE SHUTTER',
  tooBright: 'TOO MUCH LIGHT. Lamps off, or the picture fogs.',
  close: 'CLOSE THE SHUTTER',
  didThey: 'TEAM {team}, DID YOU GET IT?',
  got: 'GOT IT',
  missed: 'NO IDEA',
  toSheet: 'CONTACT SHEET',
  sheet: 'CONTACT SHEET',
  score: 'A {a} : {b} B',
  again: 'NEW ROLL',
  noCamera: 'This needs the camera. Allow it, then reload.',

  // A brush phone.
  tapWord: 'TAP FOR YOUR WORD',
  hide: 'Keep it to yourself. Press and hold to paint with light. Let go to lift the brush.',
  another: 'ANOTHER WORD',
  brightness: 'Screen brightness right up.',
};

// Things that can be drawn in the air in twenty seconds.
export const WORDS = [
  'HOUSE', 'CAT', 'FISH', 'BICYCLE', 'TREE', 'SUN', 'BOAT', 'SNAIL', 'LADDER', 'KEY', 'UMBRELLA', 'GLASSES',
  'SNAKE', 'STAR', 'KITE', 'TEACUP', 'ROCKET', 'GHOST', 'MUSHROOM', 'SPIDER', 'CROWN', 'ANCHOR', 'BANANA',
  'LIGHTNING', 'BUTTERFLY', 'FLOWER', 'SNOWMAN', 'GUITAR', 'HAND', 'EYE', 'MOON', 'RAIN CLOUD', 'CAR',
  'AEROPLANE', 'DUCK', 'ELEPHANT', 'GIRAFFE', 'RABBIT', 'WHALE', 'OCTOPUS', 'CANDLE', 'CLOCK', 'DOOR',
  'ENVELOPE', 'HAT', 'BOOT', 'SCISSORS', 'PIZZA', 'ICE CREAM', 'MOUNTAIN', 'BRIDGE', 'LIGHTHOUSE', 'WINDMILL',
  'TENT', 'ROBOT', 'SKULL', 'BONE', 'CARROT', 'APPLE', 'BALLOON', 'FLAG', 'BOOK', 'CHAIR', 'BATH',
  'TOOTHBRUSH', 'LIGHT BULB', 'MAGNET', 'BELL', 'DRUM', 'TRUMPET', 'TENNIS RACKET', 'SNOWFLAKE', 'VOLCANO',
  'CACTUS', 'HEDGEHOG', 'TORTOISE', 'PENGUIN', 'OWL', 'BAT', 'CRAB', 'JELLYFISH', 'SAUSAGE DOG', 'TEAPOT',
  'FRYING PAN', 'FORK', 'SPECTACLES', 'MOUSTACHE', 'FOOTPRINT', 'STAIRS', 'CASTLE', 'RAINBOW', 'TORNADO',
];
