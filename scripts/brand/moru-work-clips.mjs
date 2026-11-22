/**
 * The work-status clips as data: the eye, flipper and prop drawings typed as pixel maps, and each
 * clip as timed keys. `author-moru-work-clips.mjs` poses the neutral Moru through them.
 *
 * A key is `{ at, pose, shapes, ease }`: the pose index it lands on, the numbers that differ from
 * rest there, and the drawings shown from that pose on. Distances are work pixels on the 256px grid.
 */

/** The same keys starting `by` poses later, to repeat a phrase within a clip. */
const later = (keys, by) => keys.map(key => ({ ...key, at: key.at + by }));

/** Closed and narrowed eyes, one work pixel per character; `drop` is how far below the open eye's centre each sits. */
const EYES = {
  half: { drop: 4, rows: [
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    ' ####### ',
    '  #####  ',
  ] },
  squint: { drop: 6, rows: [
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
  ] },
  asleep: { drop: 9, rows: [
    '###             ###',
    '###             ###',
    ' #####       ##### ',
    ' ################# ',
    '  ###############  ',
    '   #############   ',
    '    ###########    ',
  ] },
  happy: { drop: 3, rows: [
    '    ###########    ',
    '   #############   ',
    '  ###############  ',
    ' ################# ',
    ' #####       ##### ',
    '###             ###',
    '###             ###',
  ] },
};

/** A small open mouth under the nose, one work pixel per character. */
const MOUTHS = {
  open: [
    '  #####  ',
    ' ####### ',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    ' ####### ',
    '  #####  ',
  ],
};

/** A flipper off the floor, one drawn pixel per character: round, shaded low on the tail side as the catalogue's is. */
const PAW = [
  '  iiii ',
  ' iiiiii',
  'miiiiii',
  'mmiiiii',
  ' mmiii ',
];

/** The room's crate: a pale lid, the session's band and a dark base, so it never reads as part of the stone head it rides on. */
const CRATE = [
  '.............',
  '.............',
  '.............',
  'iiiiiiiiiiiii',
  'iiiiiiiiiiiii',
  'iiiiiiiiiiiii',
  'ggggggggggggg',
  'ggggggggggggg',
  'ggggggggggggg',
  'ggggggggggggg',
];

/** The laptop of the catalogue's laptop scene: a slanted dark panel with three pale lines. */
const LAPTOP = [
  '  mmmmmmmmm',
  '  mmmmmmmmm',
  '  m.....mmm',
  ' mmmmmmmmm ',
  ' mm....mmm ',
  ' mmmmmmmmm ',
  'mm.....mm  ',
  'mmmmmmmmm  ',
  'mmmmmmmmm  ',
];

const SNORE = {
  small: ['zzzz', '  z ', ' z  ', 'zzzz'],
  large: ['zzzzz', '   z ', '  z  ', ' z   ', 'zzzzz'],
};
const SPARK = {
  small: [' # ', '###', ' # '],
  large: ['  #  ', '  #  ', '#####', '  #  ', '  #  '],
};
/** A breath let out. */
const PUFF = {
  small: [' ## ', '####', ' ## '],
  large: [' ### ', '#####', '#####', ' ### '],
};
/** Three strokes over the head when something catches Moru's attention. */
const NOTICE = {
  small: [
    ' #  #  # ',
    '  # # #  ',
  ],
  large: [
    '#    #    #',
    ' #   #   # ',
    '  #  #  #  ',
  ],
};
const KNOB = [' ii ', 'iiii', 'iiii', ' ii '];
const PLATE = ['sssssssss'];

/** Work pixels in one square of a prop, so a prop keeps whole pixels at 128px and at 64px. */
const UNIT = 4;
/** Work pixels of outline round a prop: as thick as Moru's own. */
const RING = 5;

function art({ pixelMap, stamp, snap, rig, INK, MUTED, INDIGO, GRAY, STONE, IVORY }) {
  const maps = (drawings, key, unit, ring) => Object.fromEntries(Object.entries(drawings).map(([name, rows]) => [name, pixelMap(rows, key, unit, ring)]));
  /** A floor lever on a square sheet: a plate, a bare pole two squares thick whose top leans `tilt` squares, and a knob on it. */
  const lever = tilt => {
    const side = 88, pole = 10, mid = side / 2 - UNIT, data = new Uint8Array(side * side);
    const plate = pixelMap(PLATE, { s: STONE }, UNIT, RING), knob = pixelMap(KNOB, { i: INDIGO }, UNIT, RING), piece = pixelMap(['ii'], { i: INDIGO }, UNIT);
    const poleTop = side - plate.h - pole * UNIT, at = row => mid + UNIT * Math.round(tilt * (pole - row) / pole);
    for (let row = 0; row < pole; row++) stamp(data, side, piece, at(row), poleTop + row * UNIT);
    stamp(data, side, plate, side / 2 - plate.w / 2, side - plate.h);
    stamp(data, side, knob, at(0) + UNIT - knob.w / 2, poleTop + UNIT - knob.h);
    return { data, w: side, h: side };
  };
  return {
    stamp, snap, rig,
    eyes: Object.fromEntries(Object.entries(EYES).map(([name, eye]) => [name, { ...pixelMap(eye.rows, { '#': INK }, 1), drop: eye.drop }])),
    mouths: maps(MOUTHS, { '#': INK }, 1),
    flippers: { raised: pixelMap(PAW, { i: INDIGO, m: MUTED }, 5, 5) },
    crate: pixelMap(CRATE, { '.': IVORY, i: INDIGO, g: GRAY }, UNIT, RING),
    laptop: pixelMap(LAPTOP, { m: MUTED, '.': IVORY }, UNIT, RING),
    snore: maps(SNORE, { z: INDIGO }, UNIT),
    spark: maps(SPARK, { '#': INDIGO }, UNIT),
    puff: maps(PUFF, { '#': INDIGO }, UNIT),
    notice: maps(NOTICE, { '#': INDIGO }, UNIT),
    lever,
    slot: squares => pixelMap(['#'.repeat(squares)], { '#': INDIGO }, UNIT),
  };
}

/** A drawing placed by its left and top, in front of Moru unless `behind`. */
const placed = (art, sprite, left, top, { behind = false, only } = {}) => ({ behind, draw: (canvas, size) => art.stamp(canvas, size, sprite, art.snap(left), art.snap(top), only) });
/** Where the top of Moru's head is in a pose. */
const crownOf = (pose, { rig }) => ({ x: rig.centre + (rig.crownX - rig.centre) * pose.wide + pose.lean + pose.slide, y: rig.floor - (rig.floor - rig.crown) * pose.tall - pose.lift });

const GLAD = { eyes: 'happy' };
const BLINK = { eyes: 'squint' };
/** Narrowed eyes and an open mouth: the face of an effort. */
const EFFORT = { eyes: 'squint', mouth: 'open' };

const READING = { tall: 1.06, wide: 0.96, lean: 6, faceX: 6 };
const MONITOR_READ = {
  id: 'monitor-read',
  label: 'Monitor read',
  context: 'Work status rooms: reading the room monitor while a session works. Claims no progress.',
  frames: 24,
  durationsMs: [520, 90, 110, 130, 220, 150, 150, 150, 150, 240, 90, 130, 150, 150, 150, 240, 150, 130, 150, 220, 260, 140, 120, 600],
  keys: [
    { at: 1, pose: { tall: 0.96, wide: 1.03, faceY: 2 }, ease: 'out' },
    { at: 3, pose: { tall: 1.08, wide: 0.95, lean: 8, faceX: 6, faceY: -12, gazeX: -2, tail: 8 }, ease: 'out' },
    { at: 4, pose: { ...READING, faceY: -10, gazeX: -2, tail: 2 } },
    { at: 9, pose: { ...READING, faceY: -10, gazeX: 6 }, ease: 'linear' },
    { at: 10, pose: { ...READING, faceY: -9, gazeX: 2 }, shapes: BLINK },
    { at: 11, pose: { ...READING, faceY: -8, gazeX: -2 } },
    { at: 15, pose: { ...READING, faceY: -8, gazeX: 6, tail: 4 }, ease: 'linear' },
    { at: 16, pose: { ...READING, tall: 1.04, wide: 0.97, faceY: -4, gazeX: 4, tail: 8 }, shapes: BLINK },
    { at: 17, pose: { ...READING, tall: 1.02, wide: 0.98, faceY: -2, gazeX: 2, tail: 10 }, shapes: GLAD },
    { at: 18, pose: { ...READING, tall: 1.05, wide: 0.97, faceY: -6, gazeX: 0, tail: 4 }, shapes: GLAD },
    { at: 19, pose: { ...READING, faceY: -8, gazeX: -2 } },
    { at: 21, pose: { ...READING, faceY: -8, gazeX: 4 }, ease: 'linear' },
    { at: 22, pose: { tall: 0.98, wide: 1.02, faceY: 1 } },
  ],
};

const ASLEEP = { tall: 0.84, wide: 1.14, faceY: 12, leftX: -6, rightX: 6, tail: -6 };
const BREATH = { ...ASLEEP, tall: 0.87, wide: 1.11, faceY: 10 };
const NOD_OFF = {
  id: 'nod-off',
  label: 'Nod off',
  context: 'Work status rooms: a room nobody has touched for a while. Moru nods, sleeps and stirs; no work is claimed.',
  frames: 32,
  durationsMs: [600, 160, 180, 200, 240, 90, 160, 320, 200, 220, 240, 260, 320, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 320, 180, 160, 150, 160, 600],
  keys: [
    { at: 1, pose: { faceY: 2, tall: 0.99 }, shapes: { eyes: 'half' } },
    { at: 3, pose: { faceY: 6, tall: 0.97, wide: 1.02, lean: 2 }, shapes: { eyes: 'half' } },
    { at: 4, pose: { faceY: 10, tall: 0.95, wide: 1.03, lean: 4 }, shapes: BLINK, ease: 'in' },
    { at: 5, pose: { faceY: -2, tall: 1.03, wide: 0.98, tail: 6 }, shapes: { eyes: 'half' }, ease: 'out' },
    { at: 7, pose: { faceY: 1, tall: 1 }, shapes: { eyes: 'half' } },
    { at: 9, pose: { faceY: 8, tall: 0.95, wide: 1.04, lean: 2 }, shapes: { eyes: 'asleep' } },
    { at: 12, pose: ASLEEP, shapes: { eyes: 'asleep' }, ease: 'out' },
    { at: 15, pose: BREATH, shapes: { eyes: 'asleep' } },
    { at: 18, pose: ASLEEP, shapes: { eyes: 'asleep' } },
    { at: 21, pose: BREATH, shapes: { eyes: 'asleep' } },
    { at: 24, pose: ASLEEP, shapes: { eyes: 'asleep' } },
    { at: 26, pose: BREATH, shapes: { eyes: 'asleep' } },
    { at: 27, pose: { tall: 0.9, wide: 1.08, faceY: 8 }, shapes: BLINK },
    { at: 28, pose: { tall: 0.98, wide: 1.01, faceY: 3 }, shapes: { eyes: 'half' } },
    { at: 29, pose: { tall: 1.04, wide: 0.97, faceY: -2, tail: 6 }, ease: 'out' },
    { at: 30, pose: { tall: 0.99, wide: 1.01, faceY: 1 } },
  ],
  // Two snores rise from the head, each small, then large, then small again before it goes.
  props: [(pose, shapes, index, art) => [13, 20].flatMap(start => {
    const age = index - start;
    if (age < 0 || age > 5) return [];
    return [placed(art, art.snore[age < 2 || age > 4 ? 'small' : 'large'], 204 + age * 4, 90 - age * 8)];
  })],
};

/** One key per pose of a hop: `[lift, tall]` pairs from the pose `at`, so no pose moves the body further than the catalogue's hop does. */
const hop = (at, arc, base, shapes = {}) => arc.map(([lift, tall], i) => ({ at: at + i, pose: { ...base, lift, tall, wide: 1 - (tall - 1) * 0.7, tail: tall > 1 ? 4 + lift / 4 : -2 }, shapes }));

const LEAN_IN = { tall: 1.05, wide: 1.02, faceY: -4 };
const SMALL_HOP = [[5, 1.05], [11, 1.04], [14, 1.01], [11, 1.03], [5, 1.05], [0, 0.95]];
const HEADS_UP = {
  id: 'heads-up',
  label: 'Heads up',
  context: 'Work status rooms: a session is waiting for the person. Moru perks up, hops twice and looks out; the permission card keeps its own two poses.',
  frames: 32,
  airborne: true,
  durationsMs: [520, 90, 110, 160, 200, 110, 70, 70, 90, 70, 70, 100, 70, 70, 90, 70, 70, 130, 160, 200, 220, 200, 220, 200, 100, 200, 200, 200, 200, 160, 130, 600],
  keys: [
    { at: 1, pose: { tall: 0.96, wide: 1.03, faceY: 2 }, ease: 'out' },
    { at: 2, pose: { tall: 1.05, wide: 0.97, faceY: -4, tail: 8 }, shapes: { mouth: 'open' } },
    { at: 3, pose: { tall: 1.1, wide: 0.94, faceY: -7, tail: 12 }, shapes: { mouth: 'open' } },
    { at: 4, pose: { tall: 1.06, wide: 0.96, faceY: -5, tail: 6 }, shapes: { mouth: 'open' } },
    { at: 5, pose: { tall: 0.96, wide: 1.03, faceY: -1, tail: -2 } },
    ...hop(6, SMALL_HOP, { faceY: -4 }),
    ...hop(12, SMALL_HOP, { faceY: -4 }),
    { at: 18, pose: { ...LEAN_IN, tall: 1.02, tail: 6 } },
    { at: 19, pose: { ...LEAN_IN, tail: 8 } },
    { at: 21, pose: { ...LEAN_IN, gazeX: -3, tail: 10 } },
    { at: 23, pose: { ...LEAN_IN, gazeX: 3, tail: 4 } },
    { at: 24, pose: { ...LEAN_IN, gazeX: 2, tail: 6 }, shapes: BLINK },
    { at: 25, pose: { ...LEAN_IN, tail: 10 } },
    { at: 26, pose: { ...LEAN_IN, tail: 4 } },
    { at: 27, pose: { ...LEAN_IN, tail: 10 } },
    { at: 28, pose: { ...LEAN_IN, tail: 4 } },
    { at: 29, pose: { tall: 1.02, faceY: -2, tail: 2 } },
    { at: 30, pose: { tall: 0.98, wide: 1.02, faceY: 1 } },
  ],
  // The strokes show short, long, then short again before they go.
  props: [(pose, shapes, index, art) => {
    if (index < 2 || index > 4) return [];
    const mark = art.notice[index === 3 ? 'large' : 'small'], crown = crownOf(pose, art);
    return [placed(art, mark, crown.x - mark.w / 2, crown.y - 14 - mark.h)];
  }],
};

const FLAP_UP = { leftX: -10, leftY: -18, rightX: 10, rightY: -18 };
const FLAP_DOWN = { leftX: -6, leftY: -6, rightX: 6, rightY: -6 };
/** Paws brought together along the floor line, as the catalogue claps. */
const CLAP_APART = { leftX: 16, rightX: -16 }, CLAP = { leftX: 28, rightX: -30 };
const CLAPPING = { ...GLAD, left: 'raised', right: 'raised' };
const CHEER_HOP = [[6, 1.08], [16, 1.08], [25, 1.06], [31, 1.04], [35, 1.02], [36, 1], [35, 1], [31, 1.02], [25, 1.04], [16, 1.06], [6, 1.08], [0, 1]];
const MERGE_CHEER = {
  id: 'merge-cheer',
  label: 'Merge cheer',
  context: 'Work status rooms: the worktree\'s crate reached main. Requires the observed merge.',
  frames: 32,
  airborne: true,
  durationsMs: [420, 130, 200, 100, 120, 80, 60, 60, 60, 70, 80, 90, 80, 70, 60, 60, 60, 70, 110, 100, 100, 100, 90, 110, 90, 110, 90, 160, 180, 150, 130, 600],
  keys: [
    { at: 1, pose: { faceX: 4, gazeX: 2, lean: 3 }, ease: 'out' },
    { at: 2, pose: { faceX: 6, gazeX: 4, lean: 6, tall: 1.03, wide: 0.98, tail: 4 } },
    { at: 3, pose: { faceX: 4, gazeX: 2, tall: 0.95, wide: 1.04, faceY: 1 } },
    { at: 4, pose: { tall: 0.89, wide: 1.09, faceY: 3, leftX: -6, rightX: 6, tail: -4 } },
    { at: 5, pose: { tall: 1, faceY: -2, tail: 2 }, shapes: { mouth: 'open' } },
    ...hop(6, CHEER_HOP, { faceY: -5 }, { ...GLAD, mouth: 'open' }).map((key, i) => ({ ...key, pose: { ...key.pose, ...(i === 11 ? {} : i % 2 ? FLAP_UP : FLAP_DOWN) } })),
    { at: 18, pose: { tall: 0.9, wide: 1.08, faceY: 3, leftX: -6, rightX: 6, tail: -6 }, shapes: GLAD },
    { at: 19, pose: { tall: 1.03, wide: 0.98, faceY: -2, tail: 6 }, shapes: GLAD },
    { at: 20, pose: { ...CLAP_APART, tail: 6 }, shapes: CLAPPING },
    { at: 21, pose: { ...CLAP, tall: 0.99, wide: 1.01, tail: 2 }, shapes: CLAPPING },
    { at: 22, pose: { ...CLAP_APART, tall: 1.02, wide: 0.99, tail: 8 }, shapes: CLAPPING },
    { at: 23, pose: { ...CLAP, tall: 0.99, wide: 1.01, tail: 2 }, shapes: CLAPPING },
    { at: 24, pose: { ...CLAP_APART, tall: 1.02, wide: 0.99, tail: 8 }, shapes: CLAPPING },
    { at: 25, pose: { ...CLAP, tall: 0.99, wide: 1.01, tail: 2 }, shapes: CLAPPING },
    { at: 26, pose: { leftX: 6, rightX: -6, tall: 1.01, tail: 4 }, shapes: CLAPPING },
    { at: 27, pose: { tall: 1.01 }, shapes: GLAD },
    { at: 28, pose: { faceY: 3, tall: 0.97, wide: 1.02, tail: 6 }, shapes: GLAD },
    { at: 29, pose: { tall: 1.01, tail: 2 }, shapes: { eyes: 'half' } },
    { at: 30, pose: { tall: 0.99, wide: 1.01 } },
  ],
  // A spark each side of the jump: small as it nears the top, large there, small before it goes.
  props: [(pose, shapes, index, art) => {
    const age = index - 9;
    if (age < 0 || age > 4) return [];
    const size = age === 0 || age === 4 ? 'small' : 'large', spark = art.spark[size], inset = size === 'small' ? 4 : 0;
    return [placed(art, spark, 44 + inset - age * 2, 62 + inset - age * 2), placed(art, spark, 220 + inset + age * 2, 56 + inset - age * 2)];
  }],
};

const REACH = { tall: 0.88, wide: 1.13, lean: 10, faceX: 6, faceY: 2, leftX: 6, rightX: 14, tail: -8 };
const GALUMPH_PHRASE = [
  { at: 1, pose: { tall: 0.95, wide: 1.04, faceY: 1, tail: -2 }, ease: 'out' },
  { at: 3, pose: REACH, ease: 'out' },
  { at: 4, pose: { ...REACH, tall: 0.9, wide: 1.11, lean: 8 } },
  { at: 6, pose: { tall: 1.1, wide: 0.91, lean: -3, faceX: 2, faceY: -4, leftX: -2, rightX: -4, tail: 14 } },
  { at: 8, pose: { tall: 0.96, wide: 1.04, faceY: 2, tail: -4 }, ease: 'in' },
  { at: 10, pose: { tail: 2 } },
];
const GALUMPH = {
  id: 'galumph',
  label: 'Galumph',
  context: 'Work status rooms: moving along the floor to the right when a room is entered, left or changes size. The room moves the cell; the clip moves only the body.',
  frames: 24,
  // The loop closes without a hold, so the body never stands still while the room carries the cell on.
  durationsMs: [110, 90, 110, 130, 150, 110, 120, 110, 110, 130, 130, 140, 90, 110, 130, 150, 110, 120, 110, 110, 130, 130, 140, 110],
  keys: [...GALUMPH_PHRASE, ...later(GALUMPH_PHRASE, 11).map(key => key.at === 18 ? { ...key, shapes: BLINK } : key), { at: 22, pose: {} }],
};

/** A pose drawn facing left: the turn squeezes the body, flips it, and lets it widen again. */
const turned = keys => keys.map(key => ({ ...key, shapes: { ...key.shapes, mirror: true } }));
const TURN_PHRASE = [
  { at: 2, pose: REACH, ease: 'out' },
  { at: 3, pose: { ...REACH, tall: 0.9, wide: 1.11, lean: 8 } },
  { at: 5, pose: { tall: 1.1, wide: 0.91, lean: -3, faceX: 2, faceY: -4, leftX: -2, rightX: -4, tail: 14 } },
  { at: 7, pose: { tall: 0.96, wide: 1.04, faceY: 2, tail: -4 }, ease: 'in' },
];
const SQUEEZED = { tall: 1.04, wide: 0.72, faceX: -8, tail: 8 };
const GALUMPH_LEFT = {
  id: 'galumph-left',
  label: 'Galumph left',
  context: 'Work status rooms: moving along the floor to the left. Moru turns round, galumphs and turns back, so the row still opens and closes on the neutral pose.',
  frames: 24,
  durationsMs: [110, 100, 90, 90, 110, 130, 130, 150, 110, 120, 110, 110, 130, 130, 150, 110, 120, 110, 110, 130, 90, 90, 100, 110],
  keys: [
    { at: 1, pose: { tall: 0.97, wide: 0.9, slide: -6, faceX: -4, tail: 4 } },
    { at: 2, pose: { ...SQUEEZED, slide: -12 } },
    ...turned([
      { at: 3, pose: { ...SQUEEZED, slide: -10 } },
      { at: 4, pose: { tall: 0.97, wide: 0.94, slide: -4, tail: 2 } },
      ...later(TURN_PHRASE, 4),
      ...later(TURN_PHRASE, 11),
      { at: 19, pose: { tall: 0.98, wide: 0.94, slide: -4, tail: 2 } },
      { at: 20, pose: { ...SQUEEZED, slide: -10 } },
    ]),
    { at: 21, pose: { ...SQUEEZED, slide: -12 } },
    { at: 22, pose: { tall: 0.98, wide: 0.92, slide: -6, faceX: -4, tail: 2 } },
  ],
};

const LOOK_UP = { faceX: 6, faceY: -8, gazeX: 3, lean: 6, tall: 1.04, wide: 0.97 };
const LOOK_LEFT = { faceX: -10, gazeX: -4, lean: -6, tall: 1.03, wide: 0.98 };
const SETTLE_HOP = [[6, 1.06], [14, 1.05], [19, 1.02], [20, 1], [17, 1.02], [10, 1.04], [2, 1.05], [0, 0.97]];
const SETTLE_IN = {
  id: 'settle-in',
  label: 'Settle in',
  context: 'Work status rooms: arriving in a new room. Moru looks round, hops once and settles; no work is claimed.',
  frames: 32,
  airborne: true,
  durationsMs: [360, 130, 150, 240, 150, 170, 110, 160, 100, 120, 80, 60, 70, 80, 90, 80, 70, 60, 80, 110, 110, 120, 140, 130, 130, 130, 130, 180, 180, 160, 130, 600],
  keys: [
    { at: 1, pose: { faceX: -6, gazeX: -3, lean: -3 }, ease: 'out' },
    { at: 2, pose: { ...LOOK_LEFT, tail: 6 } },
    { at: 3, pose: { ...LOOK_LEFT, tail: 2 } },
    { at: 5, pose: { ...LOOK_UP, tail: 2 } },
    { at: 6, pose: { ...LOOK_UP, tail: 8 }, shapes: BLINK },
    { at: 7, pose: { ...LOOK_UP, tail: 6 } },
    { at: 8, pose: { tall: 0.95, wide: 1.04, faceY: 1 } },
    { at: 9, pose: { tall: 0.9, wide: 1.07, faceY: 3, tail: -4 } },
    { at: 10, pose: { tall: 1, faceY: -1, tail: 2 } },
    ...hop(11, SETTLE_HOP, { faceY: -3 }, GLAD),
    { at: 19, pose: { tall: 0.9, wide: 1.08, faceY: 4, leftX: -6, rightX: 6, tail: -6 }, shapes: GLAD },
    { at: 20, pose: { tall: 1.03, wide: 0.98, faceY: -2, tail: 6 }, shapes: GLAD },
    { at: 21, pose: { tall: 0.98, wide: 1.02, faceY: 1, tail: -2 }, shapes: GLAD },
    { at: 22, pose: { tall: 1.01 }, shapes: GLAD },
    { at: 23, pose: { leftY: -6, tail: 6 }, shapes: { ...GLAD, left: 'rest' } },
    { at: 24, pose: { rightY: -6, tail: 2 }, shapes: { ...GLAD, right: 'rest' } },
    { at: 25, pose: { leftY: -6, tail: 6 }, shapes: { ...GLAD, left: 'rest' } },
    { at: 26, pose: { rightY: -6, tail: 2 }, shapes: { ...GLAD, right: 'rest' } },
    { at: 27, pose: { faceY: 3, tall: 0.97, wide: 1.02, tail: 6 }, shapes: GLAD },
    { at: 28, pose: { tall: 1.01, tail: 2 }, shapes: { eyes: 'half' } },
    { at: 29, pose: { tail: 6 } },
    { at: 30, pose: { tall: 0.99, wide: 1.01 } },
  ],
};

const SLUMP = { tall: 0.9, wide: 1.08, faceY: 6, tail: -8, leftX: -4, rightX: 4 };
const LOOK_RIGHT = { faceX: 8, gazeX: 4, lean: 6, tall: 1.05, wide: 0.97 };
const SIGH = {
  id: 'sigh',
  label: 'Sigh',
  context: 'Work status rooms: a room that is stuck or left with nobody working. Moru looks for someone and sighs; it reports no error.',
  frames: 24,
  durationsMs: [420, 130, 150, 240, 100, 200, 150, 170, 260, 100, 180, 200, 260, 150, 150, 160, 220, 300, 300, 260, 180, 160, 140, 600],
  keys: [
    { at: 1, pose: { faceX: -6, gazeX: -3, lean: -3, tall: 1.02, wide: 0.99 }, ease: 'out' },
    { at: 3, pose: { ...LOOK_LEFT, tall: 1.05, wide: 0.97, tail: 6 } },
    { at: 4, pose: { ...LOOK_LEFT, tall: 1.05, wide: 0.97, gazeX: -2, tail: 2 }, shapes: BLINK },
    { at: 5, pose: { ...LOOK_LEFT, tall: 1.05, wide: 0.97, tail: 4 } },
    { at: 8, pose: { ...LOOK_RIGHT, tail: 8 } },
    { at: 9, pose: { ...LOOK_RIGHT, gazeX: 2, tail: 4 }, shapes: BLINK },
    { at: 10, pose: { ...LOOK_RIGHT, tail: 4 } },
    { at: 11, pose: { faceY: -2, tall: 1.04, wide: 0.97, tail: 4 } },
    { at: 12, pose: { faceY: -4, tall: 1.07, wide: 0.95, tail: 6 } },
    { at: 16, pose: SLUMP, shapes: { eyes: 'half', mouth: 'open' } },
    { at: 17, pose: { ...SLUMP, tall: 0.89, wide: 1.09, tail: -10 }, shapes: { eyes: 'half' } },
    { at: 19, pose: SLUMP, shapes: BLINK },
    { at: 20, pose: { tall: 0.95, wide: 1.04, faceY: 3, tail: -4 }, shapes: { eyes: 'half' } },
    { at: 21, pose: { tall: 1.01, tail: 2 } },
    { at: 22, pose: { tall: 0.99, wide: 1.01 } },
  ].map(key => key.at === 16 ? [13, 14, 15, 16].map((at, i) => ({ ...key, at, pose: { faceY: [-2, 1, 4, 6][i], tall: [1.03, 0.98, 0.93, 0.9][i], wide: [0.98, 1.02, 1.05, 1.08][i], tail: [2, -2, -6, -8][i], leftX: -i - 1, rightX: i + 1 } })) : key).flat(),
  // The breath leaves the mouth across the cheek and rises clear of the body: small, large, large, then small before it goes.
  props: [(pose, shapes, index, art) => {
    const age = index - 14;
    if (age < 0 || age > 3) return [];
    const puff = art.puff[age === 0 || age === 3 ? 'small' : 'large'];
    return [placed(art, puff, 190 + age * 16 - puff.w / 2, 164 - age * 8 - puff.h / 2)];
  }],
};

/** The floor slot a prop sinks through or rises from: its centre and its widest, in squares. */
const CRATE_SLOT = { centre: 216, squares: 15 }, LEVER_SLOT = { centre: 226, squares: 11 };
const slotOf = (slot, pose, art) => {
  const squares = Math.round(pose.slot * slot.squares);
  return squares > 0 ? [placed(art, art.slot(squares), slot.centre - squares * UNIT / 2, art.rig.ground - UNIT)] : [];
};
/** A prop shows only above the slot it passes through. */
const aboveSlot = art => (x, y) => y < art.rig.ground - UNIT;
/** The crate carried on the head: its lower outline lies on the head's. */
const onHead = (pose, art) => { const crown = crownOf(pose, art); return [crown.x - art.crate.w / 2, crown.y - art.crate.h]; };

const DUCKED = { tall: 0.86, wide: 1.11, faceY: 5, tail: -6 };
const CARRYING = { tall: 1.09, wide: 0.94, faceY: -5, tail: 8 };
const CARRY_DIP = { tall: 1.06, wide: 0.96, faceY: -5, tail: 4 };
const AT_SLOT = { slide: -16, lean: 6, faceX: 6, faceY: 2, gazeX: 3, slot: 1, crateX: 185, crateY: 146 };
const CARRIED = { crate: 'carried' }, RISING = { crate: 'rising' }, FALLING = { crate: 'falling' }, SINKING = { crate: 'sinking' };
const CRATE_SEND = {
  id: 'crate-send',
  label: 'Crate send',
  context: 'Work status rooms: a commit was observed. Moru carries a crate on its head and lowers it through the floor toward the belt; it claims nothing about the commit\'s content.',
  frames: 32,
  durationsMs: [420, 120, 120, 110, 110, 110, 130, 110, 130, 160, 180, 180, 150, 130, 120, 80, 70, 70, 70, 110, 140, 200, 110, 100, 100, 160, 110, 100, 130, 200, 140, 600],
  rest: { crateX: 125, crateY: 100, slot: 0 },
  keys: [
    { at: 1, pose: { tall: 0.96, wide: 1.03, faceY: 2 }, ease: 'out' },
    { at: 2, pose: { tall: 0.9, wide: 1.08, faceY: 4 }, shapes: RISING },
    { at: 3, pose: { ...DUCKED, crateY: 89 }, shapes: { ...RISING, ...BLINK } },
    { at: 6, pose: { ...DUCKED, crateY: 56 }, shapes: { ...CARRIED, ...BLINK }, ease: 'linear' },
    { at: 7, pose: { tall: 1, faceY: -2, tail: 4 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 8, pose: { tall: 1.1, wide: 0.94, faceY: -6, tail: 12 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 9, pose: CARRY_DIP, shapes: CARRIED },
    { at: 10, pose: CARRYING, shapes: { ...CARRIED, ...GLAD } },
    { at: 11, pose: { ...CARRY_DIP, faceX: 4, gazeX: 3, slot: 0.5 }, shapes: CARRIED },
    { at: 12, pose: { ...CARRY_DIP, lean: -6, faceX: 4, gazeX: 3, slot: 1 }, shapes: CARRIED },
    { at: 13, pose: { tall: 1.04, wide: 0.97, lean: 6, slide: -6, faceX: 6, gazeX: 4, slot: 1, tail: 8 }, shapes: CARRIED },
    { at: 14, pose: { tall: 0.98, wide: 1.01, lean: 14, slide: -12, faceX: 6, faceY: 2, gazeX: 4, slot: 1, tail: 12 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 15, pose: { ...AT_SLOT, lean: 12, slide: -12, tail: 8, crateX: 138, crateY: 50 }, shapes: { ...FALLING, ...EFFORT } },
    { at: 16, pose: { ...AT_SLOT, lean: 10, slide: -14, tail: 6, crateX: 154, crateY: 70 }, shapes: FALLING },
    { at: 17, pose: { ...AT_SLOT, lean: 8, tail: 4, crateX: 170, crateY: 98 }, shapes: FALLING },
    { at: 18, pose: { ...AT_SLOT, crateX: 182, crateY: 128 }, shapes: FALLING },
    { at: 19, pose: { ...AT_SLOT, tall: 0.97, wide: 1.02 }, shapes: FALLING },
    { at: 20, pose: { ...AT_SLOT, rightX: 20, rightY: -56 }, shapes: FALLING },
    { at: 21, pose: { ...AT_SLOT, rightX: 20, rightY: -46 }, shapes: FALLING },
    { at: 22, pose: { ...AT_SLOT, crateY: 162, rightX: 20, rightY: -30 }, shapes: SINKING },
    { at: 23, pose: { ...AT_SLOT, crateY: 180, rightX: 18, rightY: -14 }, shapes: SINKING },
    { at: 24, pose: { ...AT_SLOT, crateY: 198, rightX: 12, tall: 0.98, wide: 1.01 }, shapes: SINKING },
    { at: 25, pose: { ...AT_SLOT, rightX: 6 } },
    { at: 26, pose: { slide: -16, faceX: 6, faceY: 2, gazeX: 3, slot: 1, tall: 0.96, wide: 1.03 } },
    { at: 27, pose: { slide: -8, faceX: 4, slot: 0.5, tall: 1.05, wide: 0.96, tail: 10 } },
    { at: 28, pose: { faceX: 2, tall: 0.98, wide: 1.02, tail: 2 }, shapes: GLAD },
    { at: 29, pose: { faceY: 3, tall: 0.97, wide: 1.02, tail: 6 }, shapes: GLAD },
    { at: 30, pose: { tall: 1.01, tail: 2 }, shapes: GLAD },
  ],
  props: [
    (pose, shapes, index, art) => {
      if (!shapes.crate) return [];
      const [left, top] = shapes.crate === 'carried' ? onHead(pose, art) : [pose.crateX, pose.crateY];
      return [placed(art, art.crate, left, top, { behind: shapes.crate === 'rising' || shapes.crate === 'carried', only: shapes.crate === 'sinking' ? aboveSlot(art) : undefined })];
    },
    (pose, shapes, index, art) => slotOf(CRATE_SLOT, pose, art),
  ],
};

/** The lever's tilts, in squares its knob leans from upright: toward Moru, then thrown toward main. */
const TILT = { back: -3, thrown: 2 };
const AT_LEVER = { slide: -14, faceX: 6, faceY: 2, gazeX: 3, slot: 1, rise: 1 };
/** The right flipper against the knob at a tilt, from the floor place it left. */
const onKnob = tilt => ({ rightX: 16 + UNIT * tilt, rightY: -44 });
const THROWN = { ...AT_LEVER, tilt: TILT.thrown };
const LEVER_PULL = {
  id: 'lever-pull',
  label: 'Lever pull',
  context: 'Work status rooms: a commit was observed. Moru throws the belt lever toward main; it claims nothing about the commit\'s content.',
  frames: 24,
  durationsMs: [420, 130, 110, 130, 110, 110, 130, 130, 180, 80, 110, 110, 150, 240, 160, 180, 180, 160, 120, 120, 130, 110, 130, 600],
  rest: { slot: 0, rise: 0, tilt: TILT.back },
  keys: [
    { at: 1, pose: { faceX: 5, faceY: 2, gazeX: 3, tall: 0.96, wide: 1.03 }, ease: 'out' },
    { at: 2, pose: { slide: -8, faceX: 6, faceY: 2, gazeX: 3, slot: 0.5, tall: 1.05, wide: 0.96, tail: 8 } },
    { at: 3, pose: { slide: -14, faceX: 6, faceY: 2, gazeX: 3, slot: 1, tall: 0.98, wide: 1.01 }, ease: 'out' },
    { at: 5, pose: { ...AT_LEVER, rise: 1.1, tail: 4 }, ease: 'out' },
    { at: 6, pose: AT_LEVER },
    { at: 7, pose: { ...AT_LEVER, rightX: 6, rightY: -22, tail: 2 } },
    { at: 8, pose: { ...AT_LEVER, lean: -4, tall: 0.97, wide: 1.02, ...onKnob(TILT.back), tail: -4 }, shapes: BLINK },
    { at: 9, pose: { ...AT_LEVER, lean: 4, ...onKnob(-1), tilt: -1, tail: 6 }, shapes: EFFORT },
    { at: 10, pose: { ...THROWN, lean: 12, tall: 1.03, wide: 0.98, ...onKnob(TILT.thrown), tail: 12 }, shapes: EFFORT },
    { at: 11, pose: { ...AT_LEVER, lean: 9, ...onKnob(1), tilt: 1, tail: 6 }, shapes: BLINK },
    { at: 12, pose: { ...THROWN, lean: 10, ...onKnob(TILT.thrown), tail: 2 } },
    { at: 13, pose: { ...THROWN, lean: 6, rightX: 16, rightY: -24, tail: 4 } },
    { at: 14, pose: { ...THROWN, lean: 2, rightX: 6, tail: 4 } },
    { at: 15, pose: { ...THROWN, faceY: 4, tall: 0.96, wide: 1.03, tail: 6 }, shapes: GLAD },
    { at: 17, pose: { ...THROWN, faceY: 0, tall: 1.02, wide: 0.99 }, shapes: GLAD },
    { at: 18, pose: THROWN, shapes: { eyes: 'half' } },
    { at: 20, pose: { ...THROWN, rise: 0, tall: 0.97, wide: 1.02 }, ease: 'in' },
    { at: 21, pose: { slide: -6, faceX: 4, slot: 0.5, tilt: TILT.thrown, tall: 1.05, wide: 0.96, tail: 8 } },
    { at: 22, pose: { slot: 0, tilt: TILT.thrown, tall: 0.98, wide: 1.02 }, ease: 'out' },
  ],
  props: [
    (pose, shapes, index, art) => {
      if (pose.rise <= 0.02) return [];
      const lever = art.lever(Math.round(pose.tilt)), line = art.rig.ground - UNIT;
      return [placed(art, lever, LEVER_SLOT.centre - lever.w / 2, line - Math.round(pose.rise * lever.h / UNIT) * UNIT, { only: aboveSlot(art) })];
    },
    (pose, shapes, index, art) => slotOf(LEVER_SLOT, pose, art),
  ],
};

/** The laptop's left edge tucked behind Moru, and out beside it. */
const LAPTOP_AT = { away: 150, out: 198 };
const AT_DESK = { slide: -20, lap: 1, faceX: 6, faceY: 2, gazeX: 3 };
const TAP = { ...AT_DESK, rightX: 8, rightY: -10, tail: 4 };
const STRIKE = { ...AT_DESK, rightX: 8, rightY: -2, faceY: 4, tail: 0 };
const DESK_TYPE = {
  id: 'desk-type',
  label: 'Desk type',
  context: 'Work status rooms: a session is writing. Moru takes out a laptop, types and puts it away, so the row opens and closes on the neutral pose.',
  frames: 32,
  durationsMs: [360, 130, 90, 90, 160, 180, 110, 110, 110, 110, 110, 110, 110, 240, 200, 110, 220, 110, 110, 110, 110, 110, 110, 110, 180, 90, 220, 160, 90, 90, 170, 500],
  rest: { lap: 0 },
  keys: [
    { at: 1, pose: { faceX: 5, gazeX: 3, tall: 0.95, wide: 1.04 }, ease: 'out' },
    { at: 2, pose: { slide: -8, faceX: 6, faceY: 2, gazeX: 3, tall: 1.05, wide: 0.96, tail: 8 } },
    { at: 3, pose: { ...AT_DESK, slide: -16, lap: 0.75, tall: 1.06, wide: 0.95, tail: 10 } },
    { at: 4, pose: { ...AT_DESK, tall: 0.97, wide: 1.02, tail: -2 } },
    { at: 5, pose: { ...TAP, rightY: -6 } },
    { at: 6, pose: STRIKE },
    { at: 7, pose: TAP },
    { at: 8, pose: { ...STRIKE, leftY: -6 }, shapes: { left: 'rest' } },
    { at: 9, pose: TAP, shapes: BLINK },
    { at: 10, pose: STRIKE },
    { at: 11, pose: { ...TAP, leftY: -6, tail: 8 }, shapes: { left: 'rest' } },
    { at: 12, pose: STRIKE },
    { at: 13, pose: { ...TAP, rightY: -6, gazeX: 5, faceY: 0 } },
    { at: 14, pose: { ...TAP, rightY: -6, gazeX: 5, faceY: 0, tail: 8 } },
    { at: 15, pose: { ...TAP, rightY: -6, gazeX: 5, faceY: 0 }, shapes: BLINK },
    { at: 16, pose: { ...TAP, rightY: -6, gazeX: 4, faceY: 1 } },
    { at: 17, pose: STRIKE },
    { at: 18, pose: { ...TAP, leftY: -6 }, shapes: { left: 'rest' } },
    { at: 19, pose: STRIKE },
    { at: 20, pose: { ...TAP, tail: 8 } },
    { at: 21, pose: { ...STRIKE, leftY: -6 }, shapes: { left: 'rest' } },
    { at: 22, pose: TAP, shapes: BLINK },
    { at: 23, pose: STRIKE },
    { at: 24, pose: { ...AT_DESK, rightX: 8, rightY: -22, tall: 1.03, wide: 0.98, tail: 8 } },
    { at: 25, pose: { ...AT_DESK, rightX: 8, rightY: 0, tall: 0.96, wide: 1.03, faceY: 4, tail: -4 }, shapes: GLAD },
    { at: 26, pose: { ...AT_DESK, rightX: 4, rightY: -4, tall: 1.01, tail: 4 }, shapes: GLAD },
    { at: 27, pose: { ...AT_DESK, tall: 0.96, wide: 1.03 }, shapes: GLAD },
    { at: 28, pose: { slide: -16, lap: 0.75, faceX: 5, tall: 1.05, wide: 0.96, tail: 10 } },
    { at: 29, pose: { slide: -8, faceX: 4, tall: 1.04, wide: 0.97, tail: 6 } },
    { at: 30, pose: { faceX: 2, tall: 0.98, wide: 1.02 } },
  ],
  // The laptop stands a little behind Moru's flippers, on the floor line of its body.
  props: [(pose, shapes, index, art) => pose.lap > 0.02 ? [placed(art, art.laptop, LAPTOP_AT.away + pose.lap * (LAPTOP_AT.out - LAPTOP_AT.away), art.rig.floor - art.laptop.h, { behind: true })] : []],
};

export const WORK_CLIPS = { art, clips: [MONITOR_READ, DESK_TYPE, NOD_OFF, HEADS_UP, SIGH, CRATE_SEND, LEVER_PULL, MERGE_CHEER, GALUMPH, SETTLE_IN, GALUMPH_LEFT] };
