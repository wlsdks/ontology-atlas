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

/** A flipper off the floor, one drawn pixel per character: round, shaded low on the tail side as the catalogue's is. */
const PAW = [
  '  iiii ',
  ' iiiiii',
  'miiiiii',
  'mmiiiii',
  ' mmiii ',
];

/** The room's crate: a pale lid, the session's band and a shaded base. */
const CRATE = [
  '.............',
  '.............',
  '.............',
  'iiiiiiiiiiiii',
  'iiiiiiiiiiiii',
  'iiiiiiiiiiiii',
  'sssssssssssss',
  'sssssssssssss',
  'sssssssssssss',
  'sssssssssssss',
];

/** The laptop seen from the front, slanted as the catalogue's laptop is. */
const LAPTOP = [
  '  mmmmmmm',
  '  m....mm',
  ' mmmmmmmm',
  ' m...mmm ',
  'mmmmmmmm ',
  'mmmmmmm  ',
];

const SNORE = {
  small: ['zzz', ' z ', 'zzz'],
  large: ['zzzz', '  z ', ' z  ', 'zzzz'],
};
const SPARK = {
  small: [' # ', '###', ' # '],
  large: ['  #  ', '  #  ', '#####', '  #  ', '  #  '],
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
const PLATE = ['sssssss'];

/** Work pixels in one square of a prop, so a prop keeps whole pixels at 128px and at 64px. */
const UNIT = 4;

function art({ pixelMap, stamp, snap, rig, INK, MUTED, INDIGO, STONE, IVORY }) {
  const maps = (drawings, key, unit, ring) => Object.fromEntries(Object.entries(drawings).map(([name, rows]) => [name, pixelMap(rows, key, unit, ring)]));
  /** A floor lever on a square sheet: a plate, a bare stem whose top leans `tilt` squares, and a knob on it. */
  const lever = tilt => {
    const side = 80, stem = 10, mid = side / 2 - UNIT / 2, data = new Uint8Array(side * side), sheet = { data, w: side, h: side };
    const plate = pixelMap(PLATE, { s: STONE }, UNIT, UNIT), knob = pixelMap(KNOB, { i: INDIGO }, UNIT, UNIT), square = pixelMap(['m'], { m: MUTED }, UNIT);
    const stemTop = side - plate.h - stem * UNIT, at = row => mid + UNIT * Math.round(tilt * (stem - row) / stem);
    for (let row = 0; row < stem; row++) stamp(data, side, square, at(row), stemTop + row * UNIT);
    stamp(data, side, plate, mid + UNIT / 2 - plate.w / 2, side - plate.h);
    stamp(data, side, knob, at(0) + UNIT / 2 - knob.w / 2, stemTop + UNIT - knob.h);
    return sheet;
  };
  return {
    stamp, snap, rig,
    eyes: Object.fromEntries(Object.entries(EYES).map(([name, eye]) => [name, { ...pixelMap(eye.rows, { '#': INK }, 1), drop: eye.drop }])),
    flippers: { raised: pixelMap(PAW, { i: INDIGO, m: MUTED }, 5, 5) },
    crate: pixelMap(CRATE, { '.': IVORY, i: INDIGO, s: STONE }, UNIT, UNIT),
    laptop: pixelMap(LAPTOP, { m: MUTED, '.': IVORY }, 5, 5),
    snore: maps(SNORE, { z: INDIGO }, UNIT),
    spark: maps(SPARK, { '#': INDIGO }, UNIT),
    notice: maps(NOTICE, { '#': INDIGO }, UNIT),
    lever,
    slot: squares => pixelMap(['#'.repeat(squares)], { '#': INDIGO }, UNIT),
  };
}

/** A drawing placed by its left and top, in front of Moru unless `behind`. */
const placed = (art, sprite, left, top, { behind = false, only } = {}) => ({ behind, draw: (canvas, size) => art.stamp(canvas, size, sprite, art.snap(left), art.snap(top), only) });
/** Where the top of Moru's head is in a pose. */
const crownOf = (pose, { rig }) => ({ x: rig.centre + (rig.crownX - rig.centre) * pose.wide + pose.lean + pose.slide, y: rig.floor - (rig.floor - rig.crown) * pose.tall - pose.lift });

const MONITOR_READ = {
  id: 'monitor-read',
  label: 'Monitor read',
  context: 'Work status rooms: reading the room monitor while a session works. Claims no progress.',
  frames: 24,
  durationsMs: [520, 90, 110, 130, 220, 150, 150, 150, 150, 240, 90, 130, 150, 150, 150, 240, 120, 110, 130, 220, 260, 140, 120, 600],
  keys: [
    { at: 1, pose: { tall: 0.96, wide: 1.03, faceY: 2 }, ease: 'out' },
    { at: 3, pose: { tall: 1.08, wide: 0.95, lean: 8, faceX: 6, faceY: -12, gazeX: -2, tail: 8 }, ease: 'out' },
    { at: 4, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -10, gazeX: -2, tail: 2 } },
    { at: 9, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -10, gazeX: 6 }, ease: 'linear' },
    { at: 10, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -9, gazeX: 2 }, shapes: { eyes: 'squint' } },
    { at: 11, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -8, gazeX: -2 } },
    { at: 15, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -8, gazeX: 6, tail: 4 }, ease: 'linear' },
    { at: 16, pose: { tall: 1.04, wide: 0.97, lean: 6, faceX: 6, faceY: -6, gazeX: 4, rightY: -20, rightX: 6, tail: 4 }, shapes: { eyes: 'squint' } },
    { at: 17, pose: { tall: 1.07, wide: 0.96, lean: 6, faceX: 6, faceY: -9, gazeX: 0, rightY: -4, rightX: 2 } },
    { at: 18, pose: { tall: 1.05, wide: 0.96, lean: 6, faceX: 6, faceY: -7, gazeX: -2, rightY: -18, rightX: 6 } },
    { at: 19, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -8, gazeX: -2 } },
    { at: 21, pose: { tall: 1.06, wide: 0.96, lean: 6, faceX: 6, faceY: -8, gazeX: 4 }, ease: 'linear' },
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
    { at: 4, pose: { faceY: 10, tall: 0.95, wide: 1.03, lean: 4 }, shapes: { eyes: 'squint' }, ease: 'in' },
    { at: 5, pose: { faceY: -2, tall: 1.03, wide: 0.98, tail: 6 }, shapes: { eyes: 'half' }, ease: 'out' },
    { at: 7, pose: { faceY: 1, tall: 1 }, shapes: { eyes: 'half' } },
    { at: 9, pose: { faceY: 8, tall: 0.95, wide: 1.04, lean: 2 }, shapes: { eyes: 'asleep' } },
    { at: 12, pose: ASLEEP, shapes: { eyes: 'asleep' }, ease: 'out' },
    { at: 15, pose: BREATH, shapes: { eyes: 'asleep' } },
    { at: 18, pose: ASLEEP, shapes: { eyes: 'asleep' } },
    { at: 21, pose: BREATH, shapes: { eyes: 'asleep' } },
    { at: 24, pose: ASLEEP, shapes: { eyes: 'asleep' } },
    { at: 26, pose: BREATH, shapes: { eyes: 'asleep' } },
    { at: 27, pose: { tall: 0.9, wide: 1.08, faceY: 8 }, shapes: { eyes: 'squint' } },
    { at: 28, pose: { tall: 0.98, wide: 1.01, faceY: 3 }, shapes: { eyes: 'half' } },
    { at: 29, pose: { tall: 1.04, wide: 0.97, faceY: -2, tail: 6 }, ease: 'out' },
    { at: 30, pose: { tall: 0.99, wide: 1.01, faceY: 1 } },
  ],
  // Two snores rise from the head, each small, then large, then small again before it goes.
  props: [(pose, shapes, index, art) => [13, 20].flatMap(start => {
    const age = index - start;
    if (age < 0 || age > 5) return [];
    return [placed(art, art.snore[age < 2 || age > 4 ? 'small' : 'large'], 206 + age * 4, 92 - age * 8)];
  })],
};

const LEAN_IN = { tall: 1.05, wide: 1.02, faceY: -4 };
const HOPPING = { faceY: -5 };
const HEADS_UP = {
  id: 'heads-up',
  label: 'Heads up',
  context: 'Work status rooms: a session is waiting for the person. Moru perks up, hops twice and looks out; the permission card keeps its own two poses.',
  frames: 32,
  airborne: true,
  durationsMs: [520, 90, 100, 140, 200, 160, 100, 60, 60, 80, 60, 70, 90, 60, 80, 60, 70, 140, 200, 200, 220, 200, 220, 100, 200, 200, 200, 200, 200, 160, 130, 600],
  keys: [
    { at: 1, pose: { tall: 0.95, wide: 1.04, faceY: 2 }, ease: 'out' },
    { at: 3, pose: { tall: 1.1, wide: 0.94, faceY: -7, tail: 12 }, ease: 'out' },
    { at: 4, pose: { tall: 1.07, wide: 0.96, faceY: -5, tail: 6 } },
    { at: 5, pose: { tall: 1.07, wide: 0.96, faceY: -5, tail: 8 } },
    { at: 6, pose: { tall: 0.93, wide: 1.06, tail: -2 } },
    { at: 7, pose: { ...HOPPING, lift: 8, tall: 1.1, wide: 0.94, tail: 8 } },
    { at: 8, pose: { ...HOPPING, lift: 14, tall: 1.06, wide: 0.96, tail: 10 } },
    { at: 9, pose: { ...HOPPING, lift: 16, tall: 1.03, wide: 0.98, tail: 8 } },
    { at: 10, pose: { ...HOPPING, lift: 10, tall: 1.06, wide: 0.96, tail: 12 } },
    { at: 11, pose: { tall: 0.93, wide: 1.06, faceY: 1, tail: -2 } },
    { at: 12, pose: { ...HOPPING, lift: 8, tall: 1.09, wide: 0.94, tail: 8 } },
    { at: 13, pose: { ...HOPPING, lift: 14, tall: 1.05, wide: 0.97, tail: 10 } },
    { at: 14, pose: { ...HOPPING, lift: 15, tall: 1.03, wide: 0.98, tail: 8 } },
    { at: 15, pose: { ...HOPPING, lift: 10, tall: 1.06, wide: 0.96, tail: 12 } },
    { at: 16, pose: { tall: 0.94, wide: 1.05, faceY: 1, tail: -2 } },
    { at: 17, pose: { ...LEAN_IN, tail: 6 }, ease: 'out' },
    { at: 18, pose: { ...LEAN_IN, tail: 8 } },
    { at: 20, pose: { ...LEAN_IN, gazeX: -3, tail: 10 } },
    { at: 22, pose: { ...LEAN_IN, gazeX: 3, tail: 4 } },
    { at: 23, pose: { ...LEAN_IN, gazeX: 2, tail: 6 }, shapes: { eyes: 'squint' } },
    { at: 24, pose: { ...LEAN_IN, tail: 10 } },
    { at: 25, pose: { ...LEAN_IN, tail: 4 } },
    { at: 26, pose: { ...LEAN_IN, tail: 10 } },
    { at: 27, pose: { ...LEAN_IN, tail: 4 } },
    { at: 28, pose: { ...LEAN_IN, tail: 8 } },
    { at: 29, pose: { tall: 1.02, faceY: -2, tail: 2 } },
    { at: 30, pose: { tall: 0.98, wide: 1.02, faceY: 1 } },
  ],
  // The strokes show short, long, then short again before they go.
  props: [(pose, shapes, index, art) => {
    if (index < 3 || index > 5) return [];
    const mark = art.notice[index === 4 ? 'large' : 'small'], crown = crownOf(pose, art);
    return [placed(art, mark, crown.x - mark.w / 2, crown.y - 14 - mark.h)];
  }],
};

const FLAP_UP = { leftX: -10, leftY: -18, rightX: 10, rightY: -18 };
const FLAP_DOWN = { leftX: -6, leftY: -6, rightX: 6, rightY: -6 };
const CLAP_APART = { leftX: 14, leftY: -16, rightX: -14, rightY: -16 };
const CLAP = { leftX: 26, leftY: -16, rightX: -28, rightY: -16 };
const GLAD = { eyes: 'happy' };
const MERGE_CHEER = {
  id: 'merge-cheer',
  label: 'Merge cheer',
  context: 'Work status rooms: the worktree\'s crate reached main. Requires the observed merge.',
  frames: 32,
  airborne: true,
  durationsMs: [420, 120, 160, 240, 90, 130, 60, 60, 60, 70, 80, 100, 80, 70, 60, 60, 70, 110, 90, 100, 100, 90, 110, 90, 110, 90, 140, 200, 160, 150, 130, 600],
  keys: [
    { at: 1, pose: { faceX: 4, gazeX: 2, lean: 3 }, ease: 'out' },
    { at: 3, pose: { faceX: 6, gazeX: 4, lean: 6, tall: 1.03, wide: 0.98, tail: 4 } },
    { at: 5, pose: { tall: 0.86, wide: 1.1, faceY: 3, leftX: -6, rightX: 6, tail: -4 }, ease: 'out' },
    { at: 6, pose: { lift: 10, tall: 1.14, wide: 0.92, faceY: -4, ...FLAP_DOWN, tail: 8 } },
    { at: 7, pose: { lift: 20, tall: 1.12, wide: 0.93, faceY: -5, ...FLAP_UP, tail: 12 }, shapes: GLAD },
    { at: 8, pose: { lift: 30, tall: 1.09, wide: 0.94, faceY: -6, ...FLAP_DOWN, tail: 14 }, shapes: GLAD },
    { at: 9, pose: { lift: 38, tall: 1.06, wide: 0.96, faceY: -6, ...FLAP_UP, tail: 12 }, shapes: GLAD },
    { at: 10, pose: { lift: 44, tall: 1.03, wide: 0.98, faceY: -6, ...FLAP_DOWN, tail: 10 }, shapes: GLAD },
    { at: 11, pose: { lift: 46, tall: 1.01, faceY: -6, ...FLAP_UP, tail: 10 }, shapes: GLAD },
    { at: 12, pose: { lift: 42, tall: 1.02, wide: 0.99, faceY: -6, ...FLAP_DOWN, tail: 12 }, shapes: GLAD },
    { at: 13, pose: { lift: 34, tall: 1.04, wide: 0.97, faceY: -5, ...FLAP_UP, tail: 14 }, shapes: GLAD },
    { at: 14, pose: { lift: 24, tall: 1.07, wide: 0.95, faceY: -5, ...FLAP_DOWN, tail: 14 }, shapes: GLAD },
    { at: 15, pose: { lift: 12, tall: 1.1, wide: 0.94, faceY: -4, ...FLAP_UP, tail: 14 }, shapes: GLAD },
    { at: 16, pose: { tall: 0.94, wide: 1.05, faceY: 1, ...FLAP_DOWN, tail: 4 }, shapes: GLAD },
    { at: 17, pose: { tall: 0.86, wide: 1.1, faceY: 4, leftX: -6, rightX: 6, tail: -6 }, shapes: GLAD },
    { at: 18, pose: { tall: 1.06, wide: 0.96, lift: 8, faceY: -3, ...FLAP_UP, tail: 10 }, shapes: GLAD, ease: 'out' },
    { at: 19, pose: { tall: 0.95, wide: 1.04, faceY: 2, tail: -2 }, shapes: GLAD, ease: 'in' },
    { at: 20, pose: { tall: 1.02, wide: 0.99, ...CLAP_APART, tail: 6 }, shapes: GLAD, ease: 'out' },
    { at: 21, pose: { ...CLAP, tail: 2 }, shapes: GLAD, ease: 'in' },
    { at: 22, pose: { tall: 1.02, wide: 0.99, ...CLAP_APART, tail: 8 }, shapes: GLAD, ease: 'out' },
    { at: 23, pose: { ...CLAP, tail: 2 }, shapes: GLAD, ease: 'in' },
    { at: 24, pose: { tall: 1.02, wide: 0.99, ...CLAP_APART, tail: 8 }, shapes: GLAD, ease: 'out' },
    { at: 25, pose: { ...CLAP, tail: 2 }, shapes: GLAD, ease: 'in' },
    { at: 26, pose: { tall: 1.01, ...FLAP_DOWN, tail: 4 }, shapes: GLAD },
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
    return [placed(art, spark, 44 + inset - age * 2, 50 + inset - age * 2), placed(art, spark, 220 + inset + age * 2, 44 + inset - age * 2)];
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
  context: 'Work status rooms: moving along the floor, facing right, when a room is entered, left or changes size. The room moves the cell; the clip moves only the body.',
  frames: 24,
  durationsMs: [300, 90, 110, 130, 150, 110, 120, 110, 110, 130, 130, 140, 90, 110, 130, 150, 110, 120, 110, 110, 130, 130, 140, 300],
  keys: [...GALUMPH_PHRASE, ...later(GALUMPH_PHRASE, 11).map(key => key.at === 18 ? { ...key, shapes: { eyes: 'squint' } } : key), { at: 22, pose: {} }],
};

const LOOK_UP = { faceX: 6, faceY: -8, gazeX: 3, lean: 6, tall: 1.04, wide: 0.97 };
const SETTLE_IN = {
  id: 'settle-in',
  label: 'Settle in',
  context: 'Work status rooms: arriving in a new room. Moru looks round, hops once and settles; no work is claimed.',
  frames: 32,
  airborne: true,
  durationsMs: [360, 130, 150, 240, 200, 150, 170, 110, 160, 100, 130, 60, 70, 90, 70, 60, 110, 110, 120, 140, 130, 130, 130, 130, 160, 180, 180, 120, 200, 160, 130, 600],
  keys: [
    { at: 1, pose: { faceX: -6, gazeX: -3, lean: -3 }, ease: 'out' },
    { at: 3, pose: { faceX: -10, gazeX: -4, lean: -6, tall: 1.03, wide: 0.98, tail: 6 } },
    { at: 4, pose: { faceX: -10, gazeX: -4, lean: -6, tall: 1.03, wide: 0.98, tail: 2 } },
    { at: 6, pose: { ...LOOK_UP, tail: 2 } },
    { at: 7, pose: { ...LOOK_UP, tail: 8 }, shapes: { eyes: 'squint' } },
    { at: 8, pose: { ...LOOK_UP, tail: 6 } },
    { at: 9, pose: { tall: 0.95, wide: 1.04, faceY: 1 } },
    { at: 10, pose: { tall: 0.88, wide: 1.09, faceY: 3, tail: -4 } },
    { at: 11, pose: { lift: 10, tall: 1.1, wide: 0.94, faceY: -3, tail: 8 } },
    { at: 12, pose: { lift: 18, tall: 1.06, wide: 0.96, faceY: -3, tail: 10 } },
    { at: 13, pose: { lift: 22, tall: 1.02, wide: 0.99, faceY: -3, tail: 6 }, shapes: GLAD },
    { at: 14, pose: { lift: 20, tall: 1.03, wide: 0.98, faceY: -3, tail: 8 }, shapes: GLAD },
    { at: 15, pose: { lift: 12, tall: 1.07, wide: 0.96, faceY: -2, tail: 12 }, shapes: GLAD },
    { at: 16, pose: { tall: 0.86, wide: 1.12, faceY: 4, leftX: -6, rightX: 6, tail: -6 }, shapes: GLAD },
    { at: 17, pose: { tall: 1.05, wide: 0.97, faceY: -2, tail: 6 }, shapes: GLAD, ease: 'out' },
    { at: 18, pose: { tall: 0.97, wide: 1.02, faceY: 1, tail: -2 }, shapes: GLAD },
    { at: 19, pose: { tall: 1.01 }, shapes: GLAD },
    { at: 20, pose: { leftY: -8, tail: 6 }, shapes: GLAD },
    { at: 21, pose: { rightY: -8, tail: 2 }, shapes: GLAD },
    { at: 22, pose: { leftY: -8, tail: 6 }, shapes: GLAD },
    { at: 23, pose: { rightY: -8, tail: 2 }, shapes: GLAD },
    { at: 24, pose: { tail: 4 }, shapes: GLAD },
    { at: 25, pose: { faceY: 3, tall: 0.97, wide: 1.02, tail: 6 }, shapes: GLAD },
    { at: 26, pose: { tall: 1.01, tail: 2 }, shapes: GLAD },
    { at: 27, pose: { tail: 4 }, shapes: { eyes: 'half' } },
    { at: 28, pose: { tail: 6 } },
    { at: 30, pose: { tall: 0.99, wide: 1.01 } },
  ],
};

const SLUMP = { tall: 0.9, wide: 1.08, faceY: 6, tail: -8, leftX: -4, rightX: 4 };
const SIGH = {
  id: 'sigh',
  label: 'Sigh',
  context: 'Work status rooms: a room that is stuck or left with nobody working. Moru looks for someone and sighs; it reports no error.',
  frames: 24,
  durationsMs: [420, 130, 150, 240, 240, 100, 200, 150, 170, 260, 100, 220, 220, 180, 160, 220, 300, 300, 300, 300, 220, 170, 140, 600],
  keys: [
    { at: 1, pose: { faceX: -6, gazeX: -3, lean: -3, tall: 1.02, wide: 0.99 }, ease: 'out' },
    { at: 3, pose: { faceX: -10, gazeX: -4, lean: -6, tall: 1.05, wide: 0.97, tail: 6 } },
    { at: 4, pose: { faceX: -10, gazeX: -4, lean: -6, tall: 1.05, wide: 0.97, tail: 2 } },
    { at: 5, pose: { faceX: -10, gazeX: -2, lean: -6, tall: 1.05, wide: 0.97, tail: 2 }, shapes: { eyes: 'squint' } },
    { at: 6, pose: { faceX: -10, gazeX: -4, lean: -6, tall: 1.05, wide: 0.97, tail: 4 } },
    { at: 9, pose: { faceX: 8, gazeX: 4, lean: 6, tall: 1.05, wide: 0.97, tail: 8 } },
    { at: 10, pose: { faceX: 8, gazeX: 2, lean: 6, tall: 1.05, wide: 0.97, tail: 4 }, shapes: { eyes: 'squint' } },
    { at: 11, pose: { faceX: 8, gazeX: 4, lean: 6, tall: 1.05, wide: 0.97, tail: 4 } },
    { at: 13, pose: { faceY: -4, tall: 1.07, wide: 0.95, tail: 6 } },
    { at: 15, pose: SLUMP, shapes: { eyes: 'half' }, ease: 'out' },
    { at: 17, pose: { ...SLUMP, tall: 0.89, wide: 1.09, tail: -10 }, shapes: { eyes: 'half' } },
    { at: 19, pose: SLUMP, shapes: { eyes: 'squint' } },
    { at: 20, pose: { tall: 0.96, wide: 1.03, faceY: 3, tail: -4 }, shapes: { eyes: 'half' } },
    { at: 21, pose: { tall: 1.01, tail: 2 } },
    { at: 22, pose: { tall: 0.99, wide: 1.01 } },
  ],
};

/** The floor slot a prop sinks through or rises from: its centre and its widest, in squares. */
const CRATE_SLOT = { centre: 216, squares: 15 }, LEVER_SLOT = { centre: 226, squares: 9 };
const slotOf = (slot, pose, art) => {
  const squares = Math.round(pose.slot * slot.squares);
  return squares > 0 ? [placed(art, art.slot(squares), slot.centre - squares * UNIT / 2, art.rig.ground - UNIT)] : [];
};
/** A prop shows only above the slot it passes through. */
const aboveSlot = art => (x, y) => y < art.rig.ground - UNIT;
/** The crate carried on the head sits a little into the outline, so no gap opens as the body moves. */
const onHead = (pose, art) => { const crown = crownOf(pose, art); return [crown.x - art.crate.w / 2, crown.y - art.crate.h + UNIT]; };

const DUCKED = { tall: 0.86, wide: 1.11, faceY: 5, tail: -6 };
const CARRYING = { tall: 1.09, wide: 0.94, faceY: -5, tail: 8 };
const CARRY_DIP = { tall: 1.06, wide: 0.96, faceY: -5, tail: 4 };
const AT_SLOT = { slide: -16, lean: 6, faceX: 6, faceY: 2, gazeX: 3, slot: 1, crateX: 186, crateY: 148 };
const CRATE_SEND = {
  id: 'crate-send',
  label: 'Crate send',
  context: 'Work status rooms: a commit was observed. Moru carries a crate on its head and lowers it through the floor toward the belt; it claims nothing about the commit\'s content.',
  frames: 32,
  durationsMs: [420, 120, 130, 140, 150, 110, 100, 110, 150, 180, 180, 180, 200, 150, 160, 150, 130, 140, 90, 90, 110, 240, 140, 130, 130, 140, 200, 150, 200, 180, 140, 600],
  rest: { crateX: 128, crateY: 112, slot: 0 },
  keys: [
    { at: 1, pose: { tall: 0.95, wide: 1.04, faceY: 2 }, ease: 'out' },
    { at: 2, pose: { tall: 0.9, wide: 1.08, faceY: 4, crateY: 100 }, shapes: { crate: 'rising' } },
    { at: 4, pose: { ...DUCKED, crateY: 60 }, shapes: { crate: 'rising' }, ease: 'out' },
    { at: 5, pose: DUCKED, shapes: { crate: 'carried' } },
    { at: 7, pose: { tall: 1.13, wide: 0.92, faceY: -6, tail: 12 }, shapes: { crate: 'carried' }, ease: 'out' },
    { at: 8, pose: CARRY_DIP, shapes: { crate: 'carried' } },
    { at: 9, pose: CARRYING, shapes: { crate: 'carried', ...GLAD } },
    { at: 10, pose: CARRY_DIP, shapes: { crate: 'carried', ...GLAD } },
    { at: 11, pose: CARRYING, shapes: { crate: 'carried', ...GLAD } },
    { at: 12, pose: { ...CARRY_DIP, faceX: 4, gazeX: 3 }, shapes: { crate: 'carried' } },
    { at: 14, pose: { ...CARRY_DIP, faceX: 6, gazeX: 4, slot: 1 }, shapes: { crate: 'carried' } },
    { at: 15, pose: { ...CARRY_DIP, lean: -6, faceX: 4, gazeX: 3, slot: 1 }, shapes: { crate: 'carried' }, ease: 'out' },
    { at: 17, pose: { tall: 1.02, wide: 0.99, slide: -10, lean: 14, faceX: 6, gazeX: 4, tail: 12, slot: 1 }, shapes: { crate: 'carried' }, ease: 'in' },
    { at: 18, pose: { ...AT_SLOT, tall: 1.03, wide: 0.98, slide: -12, lean: 12, tail: 10, crateX: 140, crateY: 52 }, shapes: { crate: 'falling' } },
    { at: 19, pose: { ...AT_SLOT, tall: 1.04, wide: 0.97, slide: -14, lean: 6, tail: 4, crateX: 164, crateY: 92 }, shapes: { crate: 'falling' } },
    { at: 20, pose: { ...AT_SLOT, tall: 1.03, wide: 0.98, lean: 2, tail: 0 }, shapes: { crate: 'falling' } },
    { at: 21, pose: { ...AT_SLOT, rightX: 14, rightY: -44 }, shapes: { crate: 'falling' } },
    { at: 22, pose: { ...AT_SLOT, rightX: 14, rightY: -52 }, shapes: { crate: 'falling' } },
    { at: 23, pose: { ...AT_SLOT, crateY: 156, rightX: 14, rightY: -44 }, shapes: { crate: 'sinking' }, ease: 'in' },
    { at: 26, pose: { ...AT_SLOT, crateY: 200, rightX: 14, rightY: -2, tall: 0.97, wide: 1.02 }, shapes: { crate: 'sinking' } },
    { at: 27, pose: { slide: -16, lean: 2, faceX: 6, faceY: 2, gazeX: 3, slot: 1, rightX: 6, tall: 0.96, wide: 1.03 } },
    { at: 28, pose: { slide: -8, faceX: 4, slot: 0.5, tall: 1.06, wide: 0.95, tail: 10 } },
    { at: 29, pose: { faceX: 2, tall: 0.97, wide: 1.02, tail: 2 }, shapes: GLAD, ease: 'out' },
    { at: 30, pose: { faceY: -1, tall: 1.02, wide: 0.99, tail: 6 }, shapes: GLAD },
  ],
  props: [
    (pose, shapes, index, art) => {
      if (!shapes.crate) return [];
      const [left, top] = shapes.crate === 'carried' ? onHead(pose, art) : [pose.crateX, pose.crateY];
      return [placed(art, art.crate, left, top, { behind: shapes.crate !== 'falling' && shapes.crate !== 'sinking', only: shapes.crate === 'sinking' ? aboveSlot(art) : undefined })];
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
  durationsMs: [420, 130, 150, 150, 110, 110, 130, 180, 130, 70, 110, 110, 150, 240, 160, 180, 180, 160, 120, 120, 130, 150, 130, 600],
  rest: { slot: 0, rise: 0, tilt: TILT.back },
  keys: [
    { at: 1, pose: { faceX: 5, faceY: 2, gazeX: 3, tall: 0.96, wide: 1.03 }, ease: 'out' },
    { at: 2, pose: { slide: -8, faceX: 6, faceY: 2, gazeX: 3, slot: 0.5, tall: 1.05, wide: 0.96, tail: 8 } },
    { at: 3, pose: { slide: -14, faceX: 6, faceY: 2, gazeX: 3, slot: 1, tall: 0.98, wide: 1.01 }, ease: 'out' },
    { at: 5, pose: { ...AT_LEVER, rise: 1.1, tail: 4 }, ease: 'out' },
    { at: 6, pose: AT_LEVER },
    { at: 7, pose: { ...AT_LEVER, lean: -6, tall: 0.95, wide: 1.04, rightX: -8, rightY: -24, tail: -6 }, ease: 'out' },
    { at: 8, pose: { ...AT_LEVER, lean: -2, ...onKnob(TILT.back) } },
    { at: 9, pose: { ...THROWN, lean: 12, tall: 1.03, wide: 0.98, ...onKnob(TILT.thrown), tail: 12 }, ease: 'in' },
    { at: 10, pose: { ...AT_LEVER, lean: 9, ...onKnob(1), tilt: 1, tail: 6 } },
    { at: 11, pose: { ...THROWN, lean: 10, ...onKnob(TILT.thrown), tail: 2 } },
    { at: 13, pose: { ...THROWN, lean: 4, rightX: 6, rightY: -10, tail: 4 } },
    { at: 14, pose: { ...THROWN, faceY: 4, tall: 0.96, wide: 1.03, tail: 6 }, shapes: GLAD },
    { at: 16, pose: { ...THROWN, faceY: 0, tall: 1.02, wide: 0.99 }, shapes: GLAD },
    { at: 17, pose: THROWN, shapes: { eyes: 'half' } },
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
const LAPTOP_AT = { away: 146, out: 196 };
const AT_DESK = { slide: -20, lap: 1, faceX: 6, faceY: 2, gazeX: 3 };
const TAP = { ...AT_DESK, rightX: 8, rightY: -10, tail: 4 };
const STRIKE = { ...AT_DESK, rightX: 8, rightY: -2, tail: 0 };
const DESK_TYPE = {
  id: 'desk-type',
  label: 'Desk type',
  context: 'Work status rooms: a session is writing. Moru takes out a laptop, types and puts it away, so the row opens and closes on the neutral pose.',
  frames: 32,
  durationsMs: [360, 130, 90, 90, 160, 180, 110, 110, 110, 110, 110, 110, 110, 240, 200, 110, 220, 110, 110, 110, 110, 110, 110, 110, 180, 90, 220, 160, 90, 90, 170, 500],
  rest: { lap: 0 },
  keys: [
    { at: 1, pose: { faceX: 5, gazeX: 3, tall: 0.95, wide: 1.04 }, ease: 'out' },
    { at: 2, pose: { ...AT_DESK, slide: -6, lap: 0.3, tall: 1.05, wide: 0.96, tail: 8 } },
    { at: 3, pose: { ...AT_DESK, slide: -14, lap: 0.7, tall: 1.06, wide: 0.95, tail: 10 } },
    { at: 4, pose: { ...AT_DESK, tall: 0.97, wide: 1.02, tail: -2 } },
    { at: 5, pose: { ...TAP, rightY: -6 } },
    { at: 6, pose: STRIKE },
    { at: 7, pose: TAP },
    { at: 8, pose: { ...STRIKE, leftY: -6 } },
    { at: 9, pose: TAP },
    { at: 10, pose: STRIKE },
    { at: 11, pose: { ...TAP, leftY: -6 } },
    { at: 12, pose: STRIKE },
    { at: 13, pose: { ...TAP, rightY: -6, gazeX: 5, faceY: 0 } },
    { at: 14, pose: { ...TAP, rightY: -6, gazeX: 5, faceY: 0, tail: 8 } },
    { at: 15, pose: { ...TAP, rightY: -6, gazeX: 5, faceY: 0 }, shapes: { eyes: 'squint' } },
    { at: 16, pose: { ...TAP, rightY: -6, gazeX: 4, faceY: 1 } },
    { at: 17, pose: STRIKE },
    { at: 18, pose: { ...TAP, leftY: -6 } },
    { at: 19, pose: STRIKE },
    { at: 20, pose: TAP },
    { at: 21, pose: { ...STRIKE, leftY: -6 } },
    { at: 22, pose: TAP },
    { at: 23, pose: STRIKE },
    { at: 24, pose: { ...AT_DESK, rightX: 8, rightY: -22, tall: 1.03, wide: 0.98, tail: 8 } },
    { at: 25, pose: { ...AT_DESK, rightX: 8, rightY: 0, tall: 0.96, wide: 1.03, faceY: 4, tail: -4 }, shapes: GLAD },
    { at: 26, pose: { ...AT_DESK, rightX: 4, rightY: -4, tall: 1.01, tail: 4 }, shapes: GLAD },
    { at: 27, pose: { ...AT_DESK, tall: 0.96, wide: 1.03 }, shapes: GLAD },
    { at: 28, pose: { slide: -14, lap: 0.7, faceX: 5, tall: 1.05, wide: 0.96, tail: 10 } },
    { at: 29, pose: { slide: -6, lap: 0.3, faceX: 4, tall: 1.04, wide: 0.97, tail: 6 } },
    { at: 30, pose: { faceX: 2, tall: 0.98, wide: 1.02 } },
  ],
  // The laptop stands a little behind Moru's flippers, on the floor line of its body.
  props: [(pose, shapes, index, art) => pose.lap > 0.02 ? [placed(art, art.laptop, LAPTOP_AT.away + pose.lap * (LAPTOP_AT.out - LAPTOP_AT.away), art.rig.floor - art.laptop.h, { behind: true })] : []],
};

export const WORK_CLIPS = { art, clips: [MONITOR_READ, DESK_TYPE, NOD_OFF, HEADS_UP, SIGH, CRATE_SEND, LEVER_PULL, MERGE_CHEER, GALUMPH, SETTLE_IN] };
