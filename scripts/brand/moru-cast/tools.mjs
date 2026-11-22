// Tool clips, two per screen, in a 192x128 scene cell: Moru keeps the left 128px and the tool stands in the
// right 64px, so the tool can be drawn large. Every tool has a bold silhouette and a bright indigo outline.
import { b, timing } from './scene.mjs';
import { px, KEY, LIGHT, MARK, INK } from './engine.mjs';
import { FX } from './art.mjs';

const K = { ...KEY, K: MARK };
/** The navy outline outside the bright one: unseen on the dark canvas, and what carries the tool on a light one. */
const inked = s => {
  const w = s.w + 4, h = s.h + 4, data = new Uint8Array(w * h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) data[(y + 2) * w + x + 2] = s.data[y * s.w + x];
  const out = data.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (data[y * w + x]) continue; let near = false; for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) near = dx * dx + dy * dy <= 5 && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && data[(y + dy) * w + x + dx] > 0; if (near) out[y * w + x] = INK; }
  return { data: out, w, h, pad: 4 };
};
const bold = rows => inked(px(rows, { unit: 2, ring: 2, key: K, ringColour: LIGHT }));
const FLOORY = 100, W = 192, LOOK = 'lookR+lookDown';
const within = (f, a, z) => f >= a && f <= z;
const solo = beats => [{ name: 'm', ox: 0, beats }];
/** A tool rises out of the floor line at `inAt` and sinks back at `outAt`. Returns how far up it is, 0 to 1. */
const stand = (api, s, x, inAt, outAt, dx = 0) => {
  const f = api.f, len = 3, t = f < inAt ? 0 : f < inAt + len ? (f - inAt + 1) / (len + 1) : f < outAt ? 1 : f < outAt + len ? 1 - (f - outAt + 1) / (len + 1) : 0;
  if (t > 0) api.put(s, x + dx, FLOORY - (s.h - 4) * t, { clipY: FLOORY }); return t;
};
/** The tool stands NEAR px closer than it was first staged, so a reaching flipper never leaves the body. */
const NEAR = 10;
const tool = (id, screen, frames, title, ms, beats, over) => ({ id, group: 'tools', screen, W, frames, title, ms,
  actors: solo(beats.map(k => k.pose.rx >= 12 ? { ...k, pose: { ...k.pose, rx: k.pose.rx - NEAR } } : k)),
  over: (f, api) => over(f, { ...api, put: (s, x, y, o) => s.pad === 4 ? api.put(s, x - NEAR - 2, y - 2, o) : api.put(s, x - NEAR, y, o) }) });

// ---------- Work status ----------
const POT = ['ssssssssssssssss', 'ssssssssssssssss', ' gggggggggggggg ', ' gggggggggggggg ', '  gggggggggggg  ', '  gggggggggggg  '];
const NODE = ['     ......     ', '     .iiii.     ', '     .iiii.     ', '     ......     '], TRUNK = '       ii       ';
const STEMS = [[], [TRUNK, TRUNK, TRUNK], [...NODE, TRUNK, TRUNK, TRUNK, TRUNK, TRUNK],
  [...NODE, TRUNK, TRUNK, '       ii    ii ', '       ii   ii  ', '       ii  ii   ', '       ii ii    ', '       iiii     ', TRUNK, TRUNK],
  [...NODE, '       ii ......', '       ii .iiii.', '       ii .iiii.', '       ii ......', '       ii  ii   ', '       ii ii    ', '       iiii     ', TRUNK, TRUNK]];
const sapling = stage => bold([...STEMS[stage], ...POT]);
const CAN_UP = bold([' mmm      ..', 'm   m    .. ', 'm  mmmmm..  ', 'm  mmmmm.   ', ' mmmmmmm    ', '   mmmmm    ']);
const CAN_TIP = bold(['  mm        ', ' m  mmm     ', ' m mmmmmm   ', '  mmmmmmm.  ', '   mmmmm ...', '    mmm   ..']);
const HOLD = { rx: 15, ry: -22 }, POUR = { rx: 17, ry: -19 };
const SAPLING_TEND = tool('sapling-tend', 'Work status', 32, 'Waters the worktree sapling; a branch forks off with its own node',
  timing(32, 110, { 4: 160, 8: 130, 12: 130, 13: 280, 16: 130, 20: 130, 21: 280, 25: 320, 27: 220 }),
  [b(1, 'antic'), b(3, LOOK), b(5, LOOK, 'rest', HOLD), b(7, LOOK, 'effort', POUR), b(11, LOOK, 'effort', POUR), b(12, LOOK, 'rest', HOLD), b(13, LOOK + '+perk', 'wide', { ...HOLD, tail: 2 }),
    b(15, LOOK, 'effort', POUR), b(19, LOOK, 'effort', POUR), b(20, LOOK, 'rest', HOLD), b(21, LOOK + '+perk', 'wide', { ...HOLD, tail: 2 }), b(23, LOOK, 'rest', { rx: 8, ry: -8 }), b(24, LOOK, 'rest'),
    b(25, 'lookR+tall', 'wow', { tail: 4 }), b(27, 'lookR+perk', 'happy', { tail: 3 }), b(29, 'antic', 'glad'), b(30, 'rest', 'blink')],
  (f, api) => {
    stand(api, sapling(f < 13 ? 1 : f < 21 ? 2 : f < 25 ? 3 : 4), 134, 2, 28);
    if (within(f, 5, 22)) { const [x, y] = api.a.m.pawR, pour = within(f, 7, 11) || within(f, 15, 19); api.put(pour ? CAN_TIP : CAN_UP, x + NEAR - 4, y - 10); api.paw('m', 'R'); if (pour) api.put(FX.water, 142, f % 2 ? 78 : 84); }
    if (f === 13 || f === 21 || within(f, 25, 26)) api.put(f === 26 ? FX.spark : FX.sparkBig, 176, 46);
  });

const BODY = ['............', '............', '.....KK.....', '.....KK.....', '.....KK.....', '............', '............'];
const LOCK_SHUT = bold(['   iiiiii   ', '  ii    ii  ', '  ii    ii  ', '  ii    ii  ', ...BODY]);
const LOCK_OPEN = bold(['   iiiiii   ', '  ii    ii  ', '  ii    ii  ', '  ii        ', '  ii        ', '  ii        ', ...BODY]);
const LOCK_CHECK = tool('lock-check', 'Work status', 28, 'Clicks the worktree padlock shut and tugs it twice to be sure',
  timing(28, 110, { 4: 180, 8: 300, 12: 160, 16: 160, 19: 320, 22: 220 }),
  [b(1, 'antic'), b(3, LOOK), b(5, LOOK, 'rest', { rx: 16, ry: -34 }), b(7, LOOK, 'effort', { rx: 16, ry: -28, fy: 1 }), b(8, LOOK + '+perk', 'wide', { rx: 16, ry: -28, tail: 2 }), b(10, LOOK, 'rest', { rx: 16, ry: -14 }),
    b(11, LOOK, 'effort', { rx: 12, ry: -14, x: -1 }), b(13, LOOK, 'rest', { rx: 16, ry: -14 }), b(15, LOOK, 'effort', { rx: 12, ry: -14, x: -1 }), b(17, LOOK, 'rest', { rx: 16, ry: -14 }), b(18, LOOK, 'rest', { rx: 6, ry: -4 }),
    b(19, 'lookR+tall', 'proud', { fy: -4, tail: 3 }), b(22, 'lookR+perk', 'happy', { tail: 2 }), b(25, 'antic', 'glad'), b(26, 'rest', 'blink')],
  (f, api) => {
    const tug = f === 11 || f === 12 || f === 15 || f === 16;
    stand(api, f < 7 ? LOCK_OPEN : LOCK_SHUT, 124, 2, 23, tug ? -4 : 0);
    if (within(f, 5, 17)) api.paw('m', 'R');
    if (within(f, 7, 9)) api.put(f === 8 ? FX.sparkBig : FX.spark, 158, 56);
    if (tug) api.put(FX.dash, 160, 84);
  });

// ---------- Harness ----------
const GAUGE = [['  i...K....i  ', '  i..K.....i  ', '  i.K......i  '], ['  i....K...i  ', '  i....K...i  ', '  i....K...i  '], ['  i.....K..i  ', '  i......K.i  ', '  i.......Ki  ']].map(n => n.reverse());
const pipe = needle => bold(['    iiiiii    ', '   i......i   ', ...[...GAUGE[needle]].reverse(), '  i....K...i  ', '   i......i   ', '    iiiiii    ', '     mmii     ', '     mmii     ', '  mmmmmmiiii  ', '  mmmmmmiiii  ', '     mmii     ',
  '   ..mmii     ', '  ...mmii     ', '   ..mmii     ', '     mmii     ', '  mmmmmmiiii  ', '  mmmmmmiiii  ', '     mmii     ', '     mmii     ']);
// An open-end spanner: a thick handle and a C-shaped jaw. [sprite, handle end x, handle end y] in characters; the jaw closes on the bolt.
const WRENCH = { up: [bold(['...           ', '.....         ', '  .....       ', '    .....  ...', '      ........', '        ....  ', '         .....', '          ....']), 1, 0.5], flat: [bold(['          ....', '         .....', '...........   ', '...........   ', '         .....', '          ....']), 1, 2.5], down: [bold(['          ....', '         .....', '     .......  ', '...........   ', '......   .....', '          ....']), 1, 3.5] };
const GRIP = { right: 'paw' }, STRAIN = { eyes: 'line', mouth: 'open', right: 'paw' };
const turn = at => [b(at, LOOK, GRIP, { rx: 20, ry: -2 }, 'linear'), b(at + 1, LOOK, STRAIN, { rx: 20, ry: -5, fy: 1, sq: 2, wd: 1, fx: 5, tail: 2 }, 'linear'), b(at + 2, LOOK, STRAIN, { rx: 20, ry: -11, fy: 0, sq: -2, fx: 4, tail: 4 }, 'linear'), b(at + 3, LOOK, GRIP, { rx: 20, ry: -6 }, 'linear')];
const HOOK_WRENCH = tool('hook-wrench', 'Harness', 32, 'Tightens the bolt on a hook pipe until the gauge settles',
  timing(32, 100, { 4: 180, 8: 130, 12: 130, 16: 130, 18: 150, 19: 320, 23: 300, 25: 220 }),
  [b(1, 'antic'), b(3, LOOK), b(5, LOOK, GRIP, { rx: 20, ry: -4 }), ...turn(6), ...turn(10), ...turn(14), b(18, LOOK, STRAIN, { rx: 20, ry: -11, fy: 2 }), b(19, LOOK + '+perk', { eyes: 'wide', right: 'paw' }, { rx: 20, ry: -11 }), b(21, LOOK, 'rest', { rx: 8, ry: -4 }),
    b(23, 'lookR+tall', 'proud', { fy: -5, tail: 4 }), b(25, 'lookR+perk', 'happy', { tail: 2 }), b(28, 'antic', 'glad'), b(30, 'rest', 'blink')],
  (f, api) => {
    stand(api, pipe(f < 10 ? 0 : f < 18 ? 1 : 2), 132, 2, 27);
    if (within(f, 5, 20)) { const ry = api.pose('m').ry, [ax, ay] = api.a.m.pawR, which = ry > -4 ? 'down' : ry > -9 ? 'flat' : 'up', [s, hx, hy] = WRENCH[which]; api.put(s, ax - 5 - 2 * hx + NEAR - 4, ay - 5 - 2 * hy + (which === 'up' ? 0 : 2)); api.paw('m', 'R'); }
    if (within(f, 18, 20)) api.put(f === 19 ? FX.sparkBig : FX.spark, 168, 42);
  });

const sw = on => on ? 'mmlllll...mm' : 'mmsssgggggmm', RAIL = 'mmmmmmmmmmmm';
const panel = n => bold([RAIL, sw(n > 0), sw(n > 0), RAIL, sw(n > 1), sw(n > 1), RAIL, sw(n > 2), sw(n > 2), RAIL, '    mmii    ', '    mmii    ', '    mmii    ', '    mmii    ', '  mmmmiiii  ']);
const flick = (at, ry) => [b(at, LOOK, 'rest', { rx: 14, ry }), b(at + 2, LOOK, 'effort', { rx: 19, ry, fy: 1 }), b(at + 3, LOOK + '+perk', 'wide', { rx: 14, ry, tail: 2 })];
const SWITCH_FLIP = tool('switch-flip', 'Harness', 32, 'Flicks the three scope switches on, one at a time',
  timing(32, 110, { 4: 160, 8: 240, 13: 240, 18: 240, 21: 320, 24: 220 }),
  [b(1, 'antic'), b(3, LOOK), ...flick(5, -24), ...flick(10, -18), ...flick(15, -12), b(20, LOOK, 'rest', { rx: 6, ry: -4 }), b(21, 'lookR+tall', 'wow', { tail: 4 }), b(24, 'lookR+perk', 'happy', { tail: 2 }), b(28, 'antic', 'glad'), b(30, 'rest', 'blink')],
  (f, api) => {
    stand(api, panel(f < 7 ? 0 : f < 12 ? 1 : f < 17 ? 2 : 3), 124, 2, 27);
    if (within(f, 5, 19)) api.paw('m', 'R');
    for (const [at, y] of [[7, 66], [12, 72], [17, 78]]) if (within(f, at, at + 1)) api.put(f === at ? FX.sparkBig : FX.spark, 160, y);
    if (within(f, 21, 23)) api.put(FX.notice, 136, 52 - (f - 21) * 2);
  });

// ---------- Library ----------
const BOOK = [bold(['iiiiiiiiiiiiiiii', 'i..............i', 'i..............i', 'iiiiiiiiiiiiiiii']), bold(['ssssssssssssssss', 'ssiiiissssssssss', 'ssiiiissssssssss', 'gggggggggggggggg']), bold(['iiiiiiiiiiiiiiii', 'iiiiiiii......ii', 'iiiiiiii......ii', 'iiiiiiiiiiiiiiii'])];
const TOP = n => FLOORY - 2 - 10 * n;
const BOOK_STACK = tool('book-stack', 'Library', 24, 'Sets a third book on the stack and squares it up',
  timing(24, 110, { 4: 160, 6: 200, 9: 130, 10: 220, 13: 200, 15: 320, 17: 200 }),
  [b(1, 'antic'), b(3, LOOK), b(4, 'lookR', 'rest', { rx: 17, ry: -16 }), b(6, 'lookR+perk', 'rest', { rx: 17, ry: -40 }), b(9, LOOK, 'effort', { rx: 17, ry: -26 }), b(10, LOOK, 'blink', { rx: 17, ry: -24, fy: 2 }), b(11, LOOK, 'rest', { rx: 15, ry: -26 }),
    b(12, LOOK, 'effort', { rx: 19, ry: -24 }), b(14, LOOK, 'effort', { rx: 15, ry: -24 }), b(15, 'lookR+perk', 'happy', { rx: 4, ry: -4, tail: 3 }), b(17, 'lookR', 'proud', { fy: 2, tail: 1 }), b(19, 'lookR', 'happy'), b(21, 'antic', 'glad'), b(22, 'rest', 'blink')],
  (f, api) => {
    const t = f < 2 ? 0 : f < 5 ? (f - 1) / 4 : f < 19 ? 1 : f < 22 ? 1 - (f - 18) / 4 : 0, sink = (1 - t) * 36;
    if (t > 0) { api.put(BOOK[0], 124, TOP(1) + sink, { clipY: FLOORY }); api.put(BOOK[1], 124, TOP(2) + sink, { clipY: FLOORY }); }
    if (within(f, 5, 21)) {
      const [, y] = api.a.m.pawR, landed = f >= 9;
      api.put(BOOK[2], landed ? (f < 13 ? 118 : f < 14 ? 122 : 124) : 120, landed ? TOP(3) + (f === 10 ? 2 : 0) + sink : Math.min(TOP(3), y - 6), { clipY: FLOORY }); if (f <= 14) api.paw('m', 'R');
      if (within(f, 15, 16)) api.put(f === 15 ? FX.sparkBig : FX.spark, 168, 54);
    }
  });

const OPEN_BOOK = bold(['m.........mm.........m', 'm.iiiiiii.mm.iiiiii..m', 'm.........mm.........m', 'm.iiiii...mm.iiiiiii.m', 'm.........mm.........m', 'm.iiiiiii.mm.iiii....m', 'm.........mm.........m', 'mmmmmmmmmmmmmmmmmmmmmm']);
const LENS = bold(['    iiii  ', '   illlli ', '  illllll.', '  illllll.', '  illllli ', '  illllli ', '   illli  ', '  m iiii  ', ' mm       ', 'mm        ']);
const MAGNIFIER_READ = tool('magnifier-read', 'Library', 28, 'Reads down a page through a magnifier until the line turns up',
  timing(28, 120, { 4: 160, 9: 200, 13: 200, 17: 200, 18: 340, 21: 220 }),
  [b(1, 'antic'), b(3, LOOK), b(5, LOOK, 'rest', { rx: 12, ry: -18 }), b(9, LOOK, 'rest', { rx: 20, ry: -18, gx: 1 }), b(10, LOOK, 'rest', { rx: 12, ry: -13 }), b(13, LOOK, 'rest', { rx: 20, ry: -13, gx: 1 }), b(14, LOOK, 'rest', { rx: 12, ry: -8 }), b(17, LOOK, 'rest', { rx: 17, ry: -8, gx: 1 }),
    b(18, LOOK + '+perk', 'wow', { rx: 17, ry: -8, tail: 4 }), b(21, 'lookR+perk', 'happy', { rx: 8, ry: -4, tail: 2 }), b(24, 'antic', 'glad'), b(26, 'rest', 'blink')],
  (f, api) => {
    stand(api, OPEN_BOOK, 126, 2, 23);
    if (within(f, 5, 21)) { const [x, y] = api.a.m.pawR; api.put(LENS, x + NEAR - 2, y - 20); api.paw('m', 'R'); }
    if (within(f, 18, 20)) api.put(f === 18 ? FX.sparkBig : FX.spark, 170, 60);
  });

// ---------- Automation ----------
function timer(hand, pressed) {
  const rows = [pressed ? '                ' : '      iiii      ', '    iiiiiiii    ', '  iii......iii  ', ' ii..........ii ', ' i............i ', 'ii............ii', 'i..............i', 'i..............i', 'i..............i', 'i..............i', 'ii............ii', ' i............i ', ' ii..........ii ', '  iii......iii  ', '    iiiiiiii    ', '  mmm      mmm  '].map(r => [...r]);
  const [dx, dy] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]][((hand % 8) + 8) % 8], sx = dx > 0 ? 8 : 7, sy = dy > 0 ? 8 : 7;
  for (const t of [0, 1, 2, 3, 4]) for (const [ox, oy] of [[0, 0], [dx ? 0 : 1, dy ? 0 : 1]]) { const x = sx + dx * t + (dx && dy ? 0 : ox) * (dx ? 0 : 1), y = sy + dy * t + (dx && dy ? 0 : oy) * (dy ? 0 : 1); if (rows[y]?.[x] === '.') rows[y][x] = 'K'; }
  return bold(rows.map(r => r.join('')));
}
const TIMER_SET = tool('timer-set', 'Automation', 24, 'Starts the timer with a pat and follows the hand round to the ring',
  timing(24, 100, { 4: 160, 6: 160, 7: 160, 15: 130, 16: 300, 18: 220 }),
  [b(1, 'antic'), b(3, LOOK), b(5, 'lookR', 'rest', { rx: 13, ry: -18 }), b(6, LOOK, 'effort', { rx: 18, ry: -18, fy: 1 }), b(7, 'lookR', 'rest', { rx: 13, ry: -18 }), b(8, LOOK, 'rest', { gx: 1, gy: -1 }),
    b(10, LOOK, 'rest', { gx: 2, gy: 0 }), b(12, LOOK, 'rest', { gx: 1, gy: 1 }), b(14, LOOK, 'rest', { gx: 0, gy: 0 }), b(15, LOOK, 'rest', { gx: 1, gy: -1 }), b(16, 'lookR+perk', 'wow', { tail: 3 }), b(18, 'lookR', 'happy', { fy: 2, tail: 1 }), b(19, 'lookR', 'happy', { fy: -1, tail: 2 }), b(21, 'antic', 'glad'), b(22, 'rest', 'blink')],
  (f, api) => {
    const ring = within(f, 16, 17), s = timer(f < 8 ? 0 : Math.min(8, f - 7), f === 6);
    const t = f < 2 ? 0 : f < 5 ? (f - 1) / 4 : f < 20 ? 1 : f < 23 ? 1 - (f - 19) / 4 : 0;
    if (t > 0) api.put(s, 122 + (f === 6 ? 2 : 0), FLOORY - (s.h - 4) * t - (ring ? 2 : 0), { clipY: FLOORY });
    if (ring) { api.put(FX.notice, 136, 52 - (f - 16) * 2); api.put(FX.sparkBig, 164, 58); }
    if (within(f, 5, 7)) api.paw('m', 'R');
  });

const GEAR_A = ['     iiii     ', '     iiii     ', '   iiiiiiii   ', '  iiiiiiiiii  ', '  iii....iii  ', 'iiii......iiii', 'iiii..mm..iiii', 'iiii..mm..iiii', 'iiii......iiii', '  iii....iii  ', '  iiiiiiiiii  ', '   iiiiiiii   ', '     iiii     ', '     iiii     '];
const GEAR_B = ['              ', ' iii      iii ', ' iiii    iiii ', '  iiiiiiiiii  ', '  iii....iii  ', '  ii......ii  ', '  ii..mm..ii  ', '  ii..mm..ii  ', '  ii......ii  ', '  iii....iii  ', '  iiiiiiiiii  ', ' iiii    iiii ', ' iii      iii ', '              '];
const FOOT = ['     mmii     ', '     mmii     ', '   mmmmiiii   '];
const GEARS = [bold([...GEAR_A, ...FOOT]), bold([...GEAR_B, ...FOOT])];
const push = at => [b(at, LOOK, 'rest', { rx: 15, ry: -24 }, 'linear'), b(at + 1, LOOK, 'effort', { rx: 15, ry: -17, fy: 1 }, 'linear'), b(at + 2, LOOK, 'effort', { rx: 15, ry: -10, fy: 1 }, 'linear')];
const GEAR_START = tool('gear-start', 'Automation', 28, 'Gives the gear two pushes, then it keeps turning by itself',
  timing(28, 110, { 4: 160, 7: 150, 10: 150, 12: 300, 20: 260 }),
  [b(1, 'antic'), b(3, LOOK), ...push(5), ...push(8), b(11, LOOK, 'rest', { rx: 8, ry: -6 }), b(12, 'lookR+tall', 'wow', { tail: 4 }), b(15, 'lookR+perk', 'happy', { tail: 2, gy: -1 }), b(18, 'lookR+perk', 'happy', { tail: 3, gy: 1 }), b(21, 'lookR', 'proud', { fy: 2 }), b(24, 'antic', 'glad'), b(26, 'rest', 'blink')],
  (f, api) => {
    const phase = f < 6 ? 0 : f < 9 ? 1 : f < 11 ? 0 : f % 2;
    stand(api, GEARS[phase], 120, 2, 23);
    if (within(f, 5, 10)) api.paw('m', 'R');
    if (within(f, 12, 21) && f % 3 === 0) api.put(FX.spark, 160 + (f % 2) * 6, 56 + (f % 4) * 2);
  });

export const TOOLS = [SAPLING_TEND, LOCK_CHECK, HOOK_WRENCH, SWITCH_FLIP, BOOK_STACK, MAGNIFIER_READ, TIMER_SET, GEAR_START];
export { HOOK_WRENCH, BOOK_STACK };
