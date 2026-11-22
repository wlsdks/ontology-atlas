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

/** The room's crate: a pale lid, the session's band and a deep base, so it never reads as part of the stone head it rides on. */
const CRATE = [
  '.........',
  '.........',
  '.........',
  'iiiiiiiii',
  'iiiiiiiii',
  'mmmmmmmmm',
  'mmmmmmmmm',
  'mmmmmmmmm',
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
  small: [' # ', '###', ' # '],
  large: [' ## ', '####', '####', ' ## '],
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

function art({ pixelMap, stamp, snap, rig, INK, MUTED, INDIGO, STONE, IVORY }) {
  const maps = (drawings, key, unit, ring) => Object.fromEntries(Object.entries(drawings).map(([name, rows]) => [name, pixelMap(rows, key, unit, ring)]));
  /** A stubby floor lever on a square sheet: a plate, a bare pole two squares thick whose top leans `tilt` squares, and a knob on it, all below Moru's eyes. */
  const lever = tilt => {
    const side = 64, pole = 5, mid = side / 2 - UNIT, data = new Uint8Array(side * side);
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
    crate: pixelMap(CRATE, { '.': IVORY, i: INDIGO, m: MUTED }, UNIT, RING),
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
const crownOf = (pose, { rig }) => ({ x: rig.centre + (rig.crownX - rig.centre) * pose.wide * (1 - pose.bulge) + pose.lean + pose.bend + pose.slide, y: rig.floor - (rig.floor - rig.crown) * pose.tall - pose.lift });

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

/** One key per pose of a hop: `[lift, tall, bulge]` from the pose `at`, so no pose moves the body further than the catalogue's hop does. */
const hop = (at, arc, base, shapes = {}) => arc.map(([lift, tall, bulge = 0], i) => ({ at: at + i, pose: { ...base, lift, tall, bulge, wide: 1 - (tall - 1) * 0.7, tail: tall > 1 ? 4 + lift / 4 : -2 }, shapes }));

const LEAN_IN = { tall: 1.05, wide: 1.02, faceY: -4 };
const SMALL_HOP = [[4, 1.04, -0.03], [9, 1.04, -0.05], [12, 1.02, -0.06], [9, 1.03, -0.04], [4, 1.04, -0.02], [0, 1]];
const CROUCH = { tall: 0.96, wide: 1.02, bulge: 0.08, faceY: -1 };
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
    { at: 5, pose: { ...CROUCH, tail: -2 } },
    ...hop(6, SMALL_HOP, { faceY: -4 }),
    { at: 12, pose: { ...CROUCH, tail: -4 }, shapes: BLINK },
    ...hop(13, SMALL_HOP, { faceY: -4 }),
    { at: 19, pose: { ...CROUCH, tail: -6 } },
    { at: 20, pose: { ...LEAN_IN, tall: 1.01, tail: 10 } },
    { at: 21, pose: { ...LEAN_IN, tail: 4 } },
    { at: 23, pose: { ...LEAN_IN, gazeX: -3, tail: 8 } },
    { at: 25, pose: { ...LEAN_IN, gazeX: 3, tail: 4 } },
    { at: 26, pose: { ...LEAN_IN, gazeX: 2, tail: 6 }, shapes: BLINK },
    { at: 27, pose: { ...LEAN_IN, tail: 10 } },
    { at: 28, pose: { ...LEAN_IN, tail: 4 } },
    { at: 29, pose: { tall: 1.02, faceY: -2, tail: 6 } },
    { at: 30, pose: { tall: 0.99, wide: 1.01, faceY: 1, tail: 2 } },
  ],
  // The strokes show short, long, then short again before they go.
  props: [(pose, shapes, index, art) => {
    if (index < 2 || index > 4) return [];
    const mark = art.notice[index === 3 ? 'large' : 'small'], crown = crownOf(pose, art);
    return [placed(art, mark, crown.x - mark.w / 2, crown.y - 14 - mark.h)];
  }],
};

/** Both flippers stay at the belly's corners while they flap, flung out and let fall, each drawn whole. */
const FLAP_UP = { leftX: -8, leftY: -8, rightX: 8, rightY: -8 };
const FLAP_DOWN = { leftX: -2, leftY: 0, rightX: 2, rightY: 0 };
const FLAPPING = { ...GLAD, mouth: 'open', left: 'rest', right: 'rest' };
/** Paws brought together along the floor line, as the catalogue claps. */
const CLAP_APART = { leftX: 16, rightX: -16 }, CLAP = { leftX: 28, rightX: -30 };
const CLAPPING = { ...GLAD, left: 'raised', right: 'raised' };
/** Off the floor the chest lifts and the belly draws in; the squash before and after spreads it. */
const CHEER_HOP = [[5, 1.05, -0.03], [13, 1.06, -0.06], [22, 1.06, -0.08], [29, 1.04, -0.1], [33, 1.02, -0.11], [35, 1, -0.12], [33, 1, -0.1], [29, 1.02, -0.08], [22, 1.04, -0.06], [13, 1.06, -0.03], [5, 1.05], [0, 1, 0.04]];
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
    { at: 4, pose: { tall: 0.9, wide: 1.05, bulge: 0.12, faceY: 3, leftX: -6, rightX: 6, tail: -4 }, shapes: BLINK },
    { at: 5, pose: { tall: 1, faceY: -2, tail: 2 }, shapes: { mouth: 'open' } },
    ...hop(6, CHEER_HOP, { faceY: -5 }, FLAPPING).map((key, i) => ({ ...key, pose: { ...key.pose, ...(i === 11 ? {} : i % 2 ? FLAP_UP : FLAP_DOWN) } })),
    { at: 18, pose: { tall: 0.92, wide: 1.04, bulge: 0.12, faceY: 3, leftX: -6, rightX: 6, tail: -6 }, shapes: GLAD },
    { at: 19, pose: { tall: 1.03, wide: 0.98, faceY: -2, tail: 12 }, shapes: GLAD },
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
  travel: true,
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
  { at: 6, pose: { tall: 0.96, wide: 1.04, faceY: 2, tail: -4 }, ease: 'in' },
];
const SQUEEZED = { tall: 1.03, wide: 0.8, faceX: -10, tail: 8 };
/** Facing the viewer between the two sides: the tail is behind and the face sits in the middle of the body. */
const FRONT = { pose: { tall: 1.05, wide: 0.74, slide: -19, faceX: -20 }, shapes: { front: true } };
const TURNED_REST = { tall: 0.98, wide: 0.96, slide: -4, tail: 2 };
const GALUMPH_LEFT = {
  id: 'galumph-left',
  travel: true,
  label: 'Galumph left',
  context: 'Work status rooms: moving along the floor to the left. Moru turns round through a pose facing the viewer, galumphs and turns back; poses 5 to 18 are the travel and loop on their own.',
  frames: 24,
  durationsMs: [110, 100, 90, 90, 90, 110, 130, 130, 150, 110, 120, 110, 130, 130, 150, 110, 120, 110, 110, 90, 90, 90, 100, 110],
  keys: [
    { at: 1, pose: { tall: 0.99, wide: 0.93, slide: -4, faceX: -4, tail: 4 } },
    { at: 2, pose: { ...SQUEEZED, slide: -11 } },
    { at: 3, ...FRONT },
    ...turned([
      { at: 4, pose: { ...SQUEEZED, slide: -11 } },
      { at: 5, pose: TURNED_REST },
      ...later(TURN_PHRASE, 5),
      ...later(TURN_PHRASE, 11),
      { at: 18, pose: TURNED_REST },
      { at: 19, pose: { ...SQUEEZED, slide: -11 } },
    ]),
    { at: 20, ...FRONT },
    { at: 21, pose: { ...SQUEEZED, slide: -11 } },
    { at: 22, pose: { tall: 0.99, wide: 0.93, slide: -4, faceX: -4, tail: 2 } },
  ],
};

const LOOK_UP = { faceX: 6, faceY: -8, gazeX: 3, lean: 6, tall: 1.04, wide: 0.97 };
const LOOK_LEFT = { faceX: -10, gazeX: -4, lean: -6, tall: 1.03, wide: 0.98 };
const SETTLE_HOP = [[5, 1.05, -0.03], [13, 1.05, -0.06], [19, 1.02, -0.08], [20, 1, -0.08], [17, 1.02, -0.06], [10, 1.04, -0.03], [3, 1.04], [0, 1, 0.04]];
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
    { at: 9, pose: { tall: 0.92, wide: 1.04, bulge: 0.1, faceY: 3, tail: -4 } },
    { at: 10, pose: { tall: 1, faceY: -1, tail: 2 } },
    ...hop(11, SETTLE_HOP, { faceY: -3 }, GLAD),
    { at: 19, pose: { tall: 0.93, wide: 1.04, bulge: 0.1, faceY: 4, leftX: -6, rightX: 6, tail: -6 }, shapes: GLAD },
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

/** The slump of a sigh: the belly spreads on the floor and the head sinks forward into it. */
const SLUMP = { tall: 0.93, wide: 1.03, bulge: 0.1, bend: 4, cant: 3, faceY: 6, tail: -8, leftX: -4, rightX: 4 };
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
    { at: 11, pose: { faceY: -2, tall: 1.03, wide: 0.98, tail: 4 } },
    { at: 12, pose: { faceY: -4, tall: 1.06, wide: 0.96, bulge: -0.04, tail: 8 } },
    { at: 13, pose: { faceY: -3, tall: 1.05, wide: 0.97, bulge: -0.02, tail: 6 }, shapes: { eyes: 'half', mouth: 'open' } },
    { at: 17, pose: SLUMP, shapes: { eyes: 'half' }, ease: 'linear' },
    { at: 18, pose: { ...SLUMP, tail: -12 }, shapes: { eyes: 'half' } },
    { at: 19, pose: { ...SLUMP, tail: -8 }, shapes: BLINK },
    { at: 20, pose: { tall: 0.96, wide: 1.02, bulge: 0.05, bend: 2, cant: 1, faceY: 3, tail: -2 }, shapes: { eyes: 'half' } },
    { at: 21, pose: { tall: 0.99, tail: 4 } },
    { at: 22, pose: { tail: 2 } },
  ],
  // The breath leaves beside the cheek at the height of the mouth and rises clear of the body: small, large, large, then small before it goes.
  props: [(pose, shapes, index, art) => {
    const age = index - 14;
    if (age < 0 || age > 3) return [];
    const puff = art.puff[age === 0 || age === 3 ? 'small' : 'large'];
    return [placed(art, puff, [232, 230, 232, 236][age], 152 - age * 12)];
  }],
};

/** The floor slot a prop sinks through or rises from: its centre and its widest, in squares. */
const CRATE_SLOT = { centre: 226, squares: 12 }, LEVER_SLOT = { centre: 226, squares: 11 };
const slotOf = (slot, pose, art) => {
  const squares = Math.round(pose.slot * slot.squares);
  return squares > 0 ? [placed(art, art.slot(squares), slot.centre - squares * UNIT / 2, art.rig.ground - UNIT)] : [];
};
/** A prop shows only above the slot it passes through. */
const aboveSlot = art => (x, y) => y < art.rig.ground - UNIT;
/** The crate carried on the head: its lower outline lies on the head's. */
const onHead = (pose, art) => { const crown = crownOf(pose, art); return [crown.x - art.crate.w / 2, crown.y - art.crate.h]; };

/** Looking down at the slot beside it, the near flipper drawn back out of the crate's way. */
const BESIDE = { faceX: 6, faceY: 3, gazeX: 3, slot: 1, rightX: -18 };
/** The crate standing on its slot, beside Moru's near flank. */
const ON_SLOT = { crateX: 204, crateY: 154 };
/** The crate's weight on the head: the belly spreads on the floor under it. */
const LOADED = { tall: 0.92, wide: 1.03, bulge: 0.12, faceY: 4, slot: 1 };
const RISING = { crate: 'rising' }, HELD = { crate: 'held' }, CARRIED = { crate: 'carried' }, SINKING = { crate: 'sinking' };
const CRATE_SEND = {
  id: 'crate-send',
  label: 'Crate send',
  context: 'Work status rooms: a commit was observed. A crate comes up through the floor; Moru heaves it onto its head, tips it back and pats it down toward the belt. It claims nothing about the commit\'s content.',
  frames: 32,
  durationsMs: [420, 120, 120, 110, 110, 130, 150, 90, 90, 90, 90, 160, 180, 110, 110, 110, 200, 130, 110, 80, 80, 80, 140, 110, 160, 100, 100, 110, 130, 180, 140, 600],
  rest: { crateX: 204, crateY: 198, slot: 0 },
  keys: [
    { at: 1, pose: { tall: 0.98, wide: 1.01, faceX: 4, faceY: 2, gazeX: 2, slot: 0.4, rightX: -8 }, ease: 'out' },
    { at: 2, pose: { ...BESIDE, tail: 4 } },
    { at: 3, pose: { ...BESIDE, crateY: 184, bend: -2 }, shapes: RISING },
    { at: 4, pose: { ...BESIDE, crateY: 168, bend: -3, rightX: -14, rightY: -8, tail: 6 }, shapes: RISING },
    { at: 5, pose: { ...BESIDE, ...ON_SLOT, bend: -2, tall: 1.01, rightX: -6, rightY: -22, tail: 2 }, shapes: { ...RISING, ...BLINK } },
    { at: 6, pose: { ...BESIDE, ...ON_SLOT, bend: 1, cant: 1, rightX: 16, rightY: -46, tail: -2 }, shapes: HELD },
    { at: 7, pose: { faceX: 4, gazeX: 2, gazeY: -2, slot: 1, bend: 2, tall: 1.01, crateX: 206, crateY: 122, rightX: 14, rightY: -52, tail: 6 }, shapes: { ...HELD, ...EFFORT } },
    { at: 8, pose: { faceX: 2, faceY: -2, gazeY: -2, slot: 1, tall: 1.02, bulge: -0.03, crateX: 206, crateY: 88, rightX: 10, rightY: -40, tail: 10 }, shapes: { ...HELD, ...EFFORT } },
    { at: 9, pose: { faceY: -3, gazeY: -2, slot: 1, tall: 1.01, crateX: 194, crateY: 58, rightX: 4, rightY: -24, tail: 8 }, shapes: { ...HELD, ...EFFORT } },
    { at: 10, pose: { faceY: -1, slot: 1, tall: 0.98, wide: 1.01, bulge: 0.04, crateX: 166, crateY: 44, rightY: -8, tail: 2 }, shapes: { ...HELD, ...EFFORT } },
    { at: 11, pose: { ...LOADED, tall: 0.95, bulge: 0.08, tail: -4 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 12, pose: { ...LOADED, leftX: -4, rightX: 4, tail: -8 }, shapes: { ...CARRIED, ...BLINK } },
    { at: 13, pose: { tall: 0.95, wide: 1.02, bulge: 0.08, faceY: 2, slot: 1, tail: -2 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 14, pose: { tall: 0.98, bulge: 0.04, faceY: -1, slot: 1, tail: 6 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 15, pose: { tall: 1.01, faceY: -3, slot: 1, tail: 12 }, shapes: CARRIED },
    { at: 16, pose: { tall: 1.04, wide: 0.98, bulge: -0.04, faceY: -5, slot: 1, tail: 8 }, shapes: { ...CARRIED, ...GLAD } },
    { at: 17, pose: { tall: 1.03, wide: 0.98, bulge: -0.02, bend: -4, cant: -1.5, faceX: 4, faceY: -3, gazeX: 3, slot: 1, tail: 2 }, shapes: CARRIED },
    { at: 18, pose: { tall: 1.01, bend: 0, faceX: 6, gazeX: 4, slot: 1, tail: 8 }, shapes: { ...CARRIED, ...EFFORT } },
    { at: 19, pose: { tall: 0.99, bend: 4, cant: 2, faceX: 6, faceY: 2, gazeX: 4, slot: 1, tail: 12, crateX: 164, crateY: 48 }, shapes: { ...HELD, ...EFFORT } },
    { at: 20, pose: { tall: 0.98, bend: 6, cant: 3, bulge: 0.03, faceX: 6, faceY: 2, gazeX: 4, slot: 1, rightX: -8, tail: 8, crateX: 196, crateY: 62 }, shapes: HELD },
    { at: 21, pose: { ...BESIDE, bend: 4, cant: 2, tail: 4, crateX: 206, crateY: 106 }, shapes: HELD },
    { at: 22, pose: { ...BESIDE, ...ON_SLOT, bend: 2, tall: 0.98, bulge: 0.04, tail: -4 }, shapes: { ...HELD, ...BLINK } },
    { at: 23, pose: { ...BESIDE, ...ON_SLOT, rightX: 16, rightY: -54, tail: 4 }, shapes: HELD },
    { at: 24, pose: { ...BESIDE, ...ON_SLOT, rightX: 16, rightY: -46, tall: 0.99, tail: 0 }, shapes: HELD },
    { at: 25, pose: { ...BESIDE, crateY: 168, rightX: 16, rightY: -34 }, shapes: SINKING },
    { at: 26, pose: { ...BESIDE, crateY: 182, rightX: 12, rightY: -24 }, shapes: SINKING },
    { at: 27, pose: { ...BESIDE, crateY: 198, rightX: 6, rightY: -14 }, shapes: SINKING },
    { at: 28, pose: { faceX: 4, slot: 0.5, rightX: 2, rightY: -6, tall: 1.01, tail: 10 }, shapes: GLAD },
    { at: 29, pose: { faceY: 3, tall: 0.98, wide: 1.01, tail: 2 }, shapes: GLAD },
    { at: 30, pose: { tail: 4 }, shapes: { eyes: 'half' } },
  ],
  props: [
    (pose, shapes, index, art) => {
      if (!shapes.crate) return [];
      const [left, top] = shapes.crate === 'carried' ? onHead(pose, art) : [pose.crateX, pose.crateY];
      return [placed(art, art.crate, left, top, { behind: shapes.crate === 'carried', only: shapes.crate === 'rising' || shapes.crate === 'sinking' ? aboveSlot(art) : undefined })];
    },
    (pose, shapes, index, art) => slotOf(CRATE_SLOT, pose, art),
  ],
};

/** The lever's tilts, in squares its knob leans from upright: toward Moru, then thrown toward main. */
const TILT = { back: -2, thrown: 2 };
/** Looking down at the lever, the near flipper drawn back off its plate. */
const AT_LEVER = { faceX: 6, faceY: 2, gazeX: 3, slot: 1, rise: 1, rightX: -14 };
/** The right flipper against the knob at a tilt, from its place on the floor. */
const onKnob = tilt => ({ rightX: 2 + UNIT * tilt, rightY: -24 });
const THROWN = { ...AT_LEVER, tilt: TILT.thrown };
/** The weight thrown after the lever: the head goes with it and tips, and the belly stays on the floor. */
const PULLED = { ...THROWN, bend: 10, cant: 4, bulge: 0.08, tall: 0.97, wide: 1.02 };
const LEVER_PULL = {
  id: 'lever-pull',
  label: 'Lever pull',
  context: 'Work status rooms: a commit was observed. Moru throws the belt lever toward main; it claims nothing about the commit\'s content.',
  frames: 24,
  durationsMs: [420, 130, 110, 110, 110, 130, 130, 160, 200, 80, 80, 100, 200, 220, 130, 130, 160, 180, 160, 110, 110, 120, 130, 600],
  rest: { slot: 0, rise: 0, tilt: TILT.back },
  keys: [
    { at: 1, pose: { faceX: 5, faceY: 2, gazeX: 3, tall: 0.98, wide: 1.01, slot: 0.4, rightX: -6 }, ease: 'out' },
    { at: 2, pose: { ...AT_LEVER, rise: 0, tall: 1.01, tail: 6 } },
    { at: 3, pose: { ...AT_LEVER, rise: 0.4, bend: -2, tail: 8 } },
    { at: 4, pose: { ...AT_LEVER, rise: 0.8, bend: -2, tail: 4 } },
    { at: 5, pose: { ...AT_LEVER, rise: 1.08, rightX: -12, rightY: -8, tail: 2 }, shapes: BLINK },
    { at: 6, pose: { ...AT_LEVER, rightX: -10, rightY: -16, tail: 4 } },
    { at: 7, pose: { ...AT_LEVER, bend: -4, cant: -1.5, bulge: 0.04, tall: 0.99, ...onKnob(TILT.back), tail: -2 } },
    { at: 8, pose: { ...AT_LEVER, bend: -5, cant: -2, bulge: 0.05, tall: 0.98, ...onKnob(TILT.back), tail: -6 }, shapes: BLINK },
    { at: 9, pose: { ...AT_LEVER, bend: -1, tall: 0.99, ...onKnob(-1), tilt: -1, tail: 2 }, shapes: EFFORT },
    { at: 10, pose: { ...THROWN, bend: 3, cant: 1, ...onKnob(TILT.thrown), tail: 10 }, shapes: EFFORT },
    { at: 11, pose: { ...THROWN, bend: 7, cant: 2.5, bulge: 0.05, tall: 0.98, ...onKnob(TILT.thrown), tail: 14 }, shapes: EFFORT },
    { at: 12, pose: { ...PULLED, ...onKnob(TILT.thrown), tail: 8 }, shapes: BLINK },
    { at: 13, pose: { ...PULLED, ...onKnob(TILT.thrown), tail: 2 } },
    { at: 14, pose: { ...THROWN, bend: 6, cant: 2, bulge: 0.04, rightX: 4, rightY: -16, tail: 4 } },
    { at: 15, pose: { ...THROWN, bend: 2, rightX: -4, rightY: -8, tail: 6 }, shapes: GLAD },
    { at: 16, pose: { ...THROWN, faceY: 4, tall: 0.97, wide: 1.02, tail: 2 }, shapes: GLAD },
    { at: 17, pose: { ...THROWN, faceY: 0, tall: 1.01, tail: 6 }, shapes: GLAD },
    { at: 18, pose: { ...THROWN, rise: 0.7, tail: 2 }, shapes: { eyes: 'half' } },
    { at: 19, pose: { ...THROWN, rise: 0.35 } },
    { at: 20, pose: { ...THROWN, rise: 0, slot: 0.6, rightX: -10 } },
    { at: 21, pose: { faceX: 4, slot: 0.2, tilt: TILT.thrown, rightX: -4, tall: 1.02, tail: 8 } },
    { at: 22, pose: { tilt: TILT.thrown, tall: 0.99, wide: 1.01, tail: 2 } },
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

/** The laptop's left edge: it stands in front of Moru's near flank, as the catalogue's laptop scene has it. */
const LAPTOP_LEFT = 180;
const AT_DESK = { lap: 1, faceX: 6, faceY: 2, gazeX: 3 };
/** The far flipper over the keys, lifted and struck; the head dips a pixel with each strike. */
const TAP = { ...AT_DESK, leftX: 46, leftY: -12, tail: 4 };
const STRIKE = { ...AT_DESK, leftX: 46, leftY: -6, faceY: 4, tall: 0.98, wide: 1.01, tail: 0 };
const READ = { ...AT_DESK, leftX: 46, leftY: -10, gazeX: 5, faceY: 0, tall: 1.01 };
const DESK_TYPE = {
  id: 'desk-type',
  label: 'Desk type',
  context: 'Work status rooms: a session is writing. A laptop comes up in front of Moru; it types, reads and lets it down, so the row opens and closes on the neutral pose.',
  frames: 32,
  durationsMs: [360, 130, 100, 100, 130, 150, 110, 110, 110, 110, 110, 110, 110, 240, 200, 110, 220, 110, 110, 110, 110, 110, 110, 110, 180, 90, 220, 160, 100, 100, 170, 500],
  rest: { lap: 0 },
  keys: [
    { at: 1, pose: { faceX: 4, faceY: 1, gazeX: 3, lap: 0.25, tall: 0.99, wide: 1.01 }, ease: 'out' },
    { at: 2, pose: { ...AT_DESK, lap: 0.5, tail: 6 } },
    { at: 3, pose: { ...AT_DESK, lap: 0.75, tall: 1.01, tail: 10 } },
    { at: 4, pose: { ...AT_DESK, leftX: 12, leftY: -4, tail: 4 }, shapes: BLINK },
    { at: 5, pose: { ...AT_DESK, leftX: 28, leftY: -8, tail: 2 } },
    { at: 6, pose: TAP },
    { at: 7, pose: STRIKE },
    { at: 8, pose: TAP },
    { at: 9, pose: STRIKE, shapes: BLINK },
    { at: 10, pose: TAP },
    { at: 11, pose: STRIKE },
    { at: 12, pose: { ...TAP, tail: 8 } },
    { at: 13, pose: READ },
    { at: 14, pose: { ...READ, tail: 8 } },
    { at: 15, pose: READ, shapes: BLINK },
    { at: 16, pose: { ...READ, gazeX: 4, faceY: 1, tall: 1 } },
    { at: 17, pose: STRIKE },
    { at: 18, pose: TAP },
    { at: 19, pose: STRIKE },
    { at: 20, pose: { ...TAP, tail: 8 } },
    { at: 21, pose: STRIKE },
    { at: 22, pose: TAP, shapes: BLINK },
    { at: 23, pose: { ...STRIKE, tail: -4 }, shapes: GLAD },
    { at: 24, pose: { ...TAP, tail: 6 }, shapes: GLAD },
    { at: 25, pose: { ...AT_DESK, leftX: 28, leftY: -8, tail: 2 }, shapes: GLAD },
    { at: 26, pose: { ...AT_DESK, leftX: 12, leftY: -4 }, shapes: GLAD },
    { at: 27, pose: { faceX: 5, faceY: 1, gazeX: 3, lap: 0.75, tall: 1.01, tail: 8 } },
    { at: 28, pose: { faceX: 4, gazeX: 2, lap: 0.5, tail: 4 } },
    { at: 29, pose: { faceX: 2, lap: 0.25, tail: 2 } },
    { at: 30, pose: { tall: 0.99, wide: 1.01 } },
  ],
  // The laptop rises from the floor line in front of the near flipper and sinks back behind it.
  props: [(pose, shapes, index, art) => pose.lap > 0.02 ? [placed(art, art.laptop, LAPTOP_LEFT, art.rig.ground - art.snap(pose.lap * art.laptop.h), { only: (x, y) => y < art.rig.ground })] : []],
};

export const WORK_CLIPS = { art, clips: [MONITOR_READ, DESK_TYPE, NOD_OFF, HEADS_UP, SIGH, CRATE_SEND, LEVER_PULL, MERGE_CHEER, GALUMPH, SETTLE_IN, GALUMPH_LEFT] };
