// Props, bubble frames, bubble icons and costumes: every one a typed pixel map in Moru's palette.
// Props and bubbles are typed on the 64px grid (two px per character at 128) and placed on even
// coordinates, so the 64px export holds exactly the typed drawing.
import { px, flipSprite, stamp, KEY, INK, MARK, MUTED, INDIGO } from './engine.mjs';

const U = { unit: 2, ring: 2 }, K = { ...KEY, K: MARK };
const p2 = (rows, opt = {}) => px(rows, { ...U, key: K, ...opt });

// ---------- bubble icons: at most 8 x 8 characters, drawn on the bubble's ivory ----------
const ICON_ROWS = {
  bulb: ['  iiii  ', ' iiiiii ', ' ii.iii ', ' iiiiii ', '  iiii  ', '   mm   ', '   KK   '],
  check: ['       i', '      ii', '     ii ', 'i   ii  ', 'ii ii   ', ' iii    ', '  i     '],
  cross: ['KK    KK', ' KK  KK ', '  KKKK  ', '   KK   ', '  KKKK  ', ' KK  KK ', 'KK    KK'],
  question: [' KKKK ', 'KK  KK', '    KK', '   KK ', '  KK  ', '      ', '  KK  '],
  exclaim: ['KK', 'KK', 'KK', 'KK', '  ', 'KK'],
  heart: [' ii ii ', 'iiiiiii', 'iiiiiii', ' iiiii ', '  iii  ', '   i   '],
  fish: ['  iiii  ', ' iiiiii m', 'iKiiiiimm', 'iiiiiiimm', ' iiiiii m', '  iiii  '],
  drop: ['   i  ', '  ii  ', ' iiii ', 'iiliii', 'iliiii', ' iiii '],
  spiral: [' KKKKK ', 'K     K', 'K KKK K', 'K K K K', 'K K   K', 'K  KKK ', ' K     '],
  crate: ['ssssssss', 'ssssssss', 'iiiiiiii', 'iiiiiiii', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm'],
  branch: ['ii    ii', 'ii    ii', 'K     K ', 'K    K  ', 'K  KK   ', 'KKK     ', 'ii      ', 'ii      '],
  wrench: ['    KKK ', '   KK   ', '   KK  K', '   KKKKK', '  KKKKK ', ' KKK    ', 'KKK     ', 'KK      '],
  zzz: ['iiii    ', '  i     ', ' i  iiii', 'iiii  i ', '     i  ', '    iiii'],
  star: ['   i   ', '   i   ', ' iiiii ', 'iiiiiii', ' iiiii ', '   i   ', '   i   '],
  dots: ['        ', '        ', 'KK KK KK', 'KK KK KK'],
  storm: ['   KKK  ', '  KKK   ', ' KKK    ', 'KKKKKK  ', '   KKK  ', '  KKK   ', ' KKK    ', ' K      '],
  book: ['iii  iii', 'i..ii..i', 'i..ii..i', 'i..ii..i', 'i..ii..i', 'iiiiiiii', '   ii   '],
  gear: [' i ii i ', 'iiiiiiii', ' ii  ii ', 'ii    ii', 'ii    ii', ' ii  ii ', 'iiiiiiii', ' i ii i '],
  note: ['  KKKK', '  K  K', '  K  K', '  K  K', 'KKK KK', 'KKK KK'],
  clock: [' iiiii ', 'i..K..i', 'i..K..i', 'i..KK.i', 'i.....i', 'i.....i', ' iiiii '],
  flag: ['Kiiiii ', 'Kiiiiii', 'Kiiiii ', 'K      ', 'K      ', 'K      ', 'KK     '],
  shrug: ['        ', ' KKK   K', 'KKKKK KK', 'KK KKKKK', 'K   KKK ', '        '],
};
export const ICONS = Object.fromEntries(Object.entries(ICON_ROWS).map(([k, rows]) => [k, px(rows, { unit: 2, key: K })]));

// ---------- bubble frames: ivory fills; the outline is added as Moru's is ----------
const BUBBLE_ROWS = {
  speech: [' ......... ', '...........', '...........', '...........', '...........', '...........', '...........', '...........', '...........', ' ......... ', '   ...     ', '   ..      ', '   .       '],
  thought: ['  ...  ...  ', ' .......... ', '............', '............', '............', '............', '............', '............', ' .......... ', '  ...  ...  ', '            ', '   ..       ', '   ..       ', '            ', '  .         '],
  shout: ['.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '   ....      ', '    ...      ', '   ..        ', '  .          '],
  pip: ['..', '..'],
};
const BUBBLE_BODY = { speech: [11, 10], thought: [12, 10], shout: [13, 10] };
export const BUBBLES = Object.fromEntries(Object.entries(BUBBLE_ROWS).map(([k, rows]) => [k, p2(rows)]));
/** A bubble with its icon, tail toward `dir` (1: tail on the left, the speaker faces right). */
export function bubbleSprite(style, icon, dir = 1, mirrorIcon = false) {
  const base = BUBBLES[style], data = Uint8Array.from(base.data), out = { ...base, data };
  if (icon) {
    let ic = ICONS[icon]; if (!ic) throw new Error('no icon ' + icon);
    if (mirrorIcon) { const data = new Uint8Array(ic.data.length); for (let y = 0; y < ic.h; y++) for (let x = 0; x < ic.w; x++) data[y * ic.w + x] = ic.data[y * ic.w + ic.w - 1 - x]; ic = { ...ic, data }; }
    const [bw, bh] = BUBBLE_BODY[style], left = base.pad + 2 * Math.floor((bw - ic.w / 2) / 2), top = base.pad + 2 * Math.floor((bh - ic.h / 2) / 2) + (style === 'shout' ? 2 : 0);
    stamp(data, base.w, ic, left, top);
  }
  if (dir >= 0) return out;
  // Mirror the frame but keep the icon readable: flip the frame, then stamp the icon unflipped.
  const flipped = flipSprite(base), d2 = Uint8Array.from(flipped.data);
  if (icon) { const ic = ICONS[icon], [bw, bh] = BUBBLE_BODY[style]; const left0 = base.pad + 2 * Math.floor((bw - ic.w / 2) / 2), top = base.pad + 2 * Math.floor((bh - ic.h / 2) / 2) + (style === 'shout' ? 2 : 0); stamp(d2, base.w, ic, base.w - left0 - ic.w, top); }
  return { ...base, data: d2 };
}

// ---------- props ----------
export const PROPS = {
  crate: p2(['.........', '.........', '.........', 'iiiiiiiii', 'iiiiiiiii', 'mmmmmmmmm', 'mmmmmmmmm', 'mmmmmmmmm']),
  fish: p2(['  iiii   ', ' iiiiii m', 'iKiiiiimm', 'illiiiimm', ' iiiiii m', '  iiii   ']),
  book: p2(['iiiiiiiiii', 'i.......ii', 'i.......ii', 'mmmmmmmmmm']),
  bookB: p2(['mmmmmmmmmm', 'mm.......m', 'mm.......m', 'iiiiiiiiii']),
  bookOpen: p2(['iiii   iiii', 'i...i i...i', 'i....i....i', 'i....i....i', 'mmmmmmmmmmm']),
  card: p2(['......', '.KKK..', '......', '.KK...']),
  cardBox: p2(['. . . . ', '........', 'iiiiiiii', 'iiiiiiii', 'mmmmmmmm', 'mmmmmmmm']),
  pot: p2(['ssssssss', ' gggggg ', ' gggggg ', '  gggg  ']),
  can: p2([' lll     ', 'l   l   s', 'l iiiiiss', '  iiiiis ', '  iiiii  ', '  mmmmm  ']),
  canTip: p2([' ll       ', 'l  l      ', 'l iiii    ', '  iiiiiss ', '   iiiiiss', '    mmm  s']),
  wrenchUp: p2(['     ll ', '    ll  ', '    ll l', '   illll', ' iiii   ', 'iii     ']),
  wrenchFlat: p2(['      ll', '     lll', 'iiiiil  ', 'iiiiil  ', '     lll', '      ll']),
  wrenchDown: p2(['iii     ', ' iiii   ', '   illll', '    ll l', '    ll  ', '     ll ']),
  pipe: p2(['  iiii  ', ' i.K..i ', ' i..K.i ', '  iiii  ', '  ssgg  ', 'i..iiiii', 'iiiiiiii', '  ssgg  ', '  ssgg  ', '  ssgg  ', 'iiiiiiii', 'iiiiiiii', '  ssgg  ', '  ssgg  ']),
  pipeElbow: p2(['ssssssss  ', 'ssssssssss', 'ggggggssss', '      ssgs', '      ssgs']),
  bolt: p2(['..', '..']),
  gear: p2([' i ii i ', 'iiiiiiii', ' ii..ii ', 'ii....ii', 'ii....ii', ' ii..ii ', 'iiiiiiii', ' i ii i ']),
  gearB: p2(['   ii   ', ' iiiiii ', ' ii..ii ', 'ii....ii', 'ii....ii', ' ii..ii ', ' iiiiii ', '   ii   ']),
  lever: p2(['ii', 'ii', 'ii', 'ii']),
  step: p2(['ssssssss', 'gggggggg', 'gggggggg', 'gggggggg']),
};
/** A timer dial with its hand at one of eight positions and its button up or pressed. */
export function timer(hand, pressed = false) {
  const rows = [pressed ? '          ' : '    ii    ', '  iiiiii  ', ' ii....ii ', ' i......i ', ' i......i ', ' i......i ', ' i......i ', ' ii....ii ', '  iiiiii  ', ' mm    mm '].map(r => [...r]);
  const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]], [dx, dy] = dirs[((hand % 8) + 8) % 8];
  const sx = dx > 0 ? 5 : 4, sy = dy > 0 ? 5 : 4;
  for (const t of [0, 1, 2]) { const x = sx + dx * t, y = sy + dy * t; if (rows[y]?.[x] === '.') rows[y][x] = 'K'; }
  return p2(rows.map(r => r.join('')));
}
/** The worktree sapling: a pot and a branch that grows a fork, node by node. Stage 0 to 4. */
export function sapling(stage) {
  const stems = [
    [],
    ['    ii    ', '    ii    '],
    ['   ....   ', '   .ii.   ', '   ....   ', '    ii    ', '    ii    ', '    ii    '],
    ['   ....   ', '   .ii.   ', '   ....   ', '    ii  ii', '    ii ii ', '    iiii  ', '    ii    ', '    ii    '],
    ['   ....   ', '   .ii.   ', '   ....   ', '    ii....', '    ii.ii.', '    ii....', '    ii ii ', '    iiii  ', '    ii    '],
  ][stage];
  return p2([...stems, 'ssssssssss', 'ssssssssss', ' gggggggg ', ' gggggggg ', '  gggggg  ']);
}
// Free marks: drawn away from every fill, so in indigo, with no outline.
const f2 = rows => px(rows, { unit: 2, key: K });
export const FX = {
  spark: f2([' i ', 'iii', ' i ']), sparkBig: f2(['  i  ', '  i  ', 'iiiii', '  i  ', '  i  ']),
  puff: f2([' ii ', 'iiii', 'iiii', ' ii ']), puffSmall: f2(['ii', 'ii']),
  drop: f2([' i ', ' i ', 'iii', 'ili', 'iii']), dropSmall: f2([' i ', 'iii', 'iii']),
  bang: f2(['ii', 'ii', 'ii', '  ', 'ii']),
  z: f2(['iii', ' i ', 'iii']), zBig: f2(['iiii', '  i ', ' i  ', 'iiii']),
  tick: f2(['i', 'i']), dash: f2(['iii']), water: f2(['l', ' ', 'l']),
  heart: f2([' i i ', 'iiiii', ' iii ', '  i  ']),
  huff: f2([' iii  ', 'iiiii ', 'iiiiii', ' iiii ', '   i  ', '  i   ']), huffSmall: f2([' ii ', 'iiii', ' ii ', '  i ']),
  steamL: f2(['i  ', ' i ', 'i  ']), steamR: f2(['  i', ' i ', '  i']),
  notice: f2(['i  i  i', ' i i i ']),
  swish: f2(['i    ', ' ii  ', '   ii']), dust: f2([' i  i', 'i  i ']),
  ground: f2(['iiiiiiiiiiii']),
};

// ---------- costumes: layers over the same body; a layer follows the crown, the face or the body ----------
const c1 = (rows, opt = {}) => px(rows, { unit: 2, ring: 2, key: K, ...opt });
const HORN_L = c1(['..   ', '...  ', ' ... ', ' ....', '  ..g', '  .gg']), HORN_R = flipSprite(HORN_L);
const UNI_HORN = c1(['   .  ', '   .. ', '  ... ', '  i.. ', ' ..i. ', ' i..i ', '..i.. ', '...i. ']);
const MANE = c1(['      llp ', '    llplll', '   llplll ', '  llllll  ', ' llilll   ', ' lliil    ', 'llil      ', 'lli       ']);
const DRAGON_HORN = c1(['..   ', '...  ', ' iii ', ' iiii', '  mii', '  mmi']);
const WING_UP = c1(['  ll        ', '  llll      ', ' lilill     ', ' liilill    ', 'lliiliill   ', 'liiiiliill  ', 'liiiiliiill ', 'li iiiliiill', 'l   iil  ill', '      l    l']);
const WING_MID = c1(['            ', '            ', '            ', ' ll         ', 'lllill      ', 'liilillll   ', 'liiiliiilll ', 'li iiliiiill', 'l   il  iill', '     l     l']);
const WING_DOWN = c1(['            ', '            ', '            ', '            ', '            ', 'llllll      ', 'liliiillll  ', 'liliiiiilll ', 'l l il iiill', '     l     l']);
const WING_HALF_UP = c1(['            ', '  ll        ', ' llll       ', ' lilill     ', 'lliilill    ', 'liiiliill   ', 'liiiiliilll ', 'li iiliiiill', 'l   iil  ill', '      l    l']);
const WING_HALF_DOWN = c1(['            ', '            ', '            ', '            ', ' ll         ', 'llllll      ', 'liliiillll  ', 'liiiliiilll ', 'l i il iiill', '     l     l']);
/** Wing shapes from pressed down (-2) through level (0) to raised (2). */
const WINGS = { '-2': WING_DOWN, '-1': WING_HALF_DOWN, 0: WING_MID, 1: WING_HALF_UP, 2: WING_UP };
/** Where a pose wants the wing: up on a stretch or a rise, pressed down by a squash, beating in the air. */
export const wingTarget = (p, shapes) => shapes.wings ? (shapes.wings === 1 ? 2 : -2) : (p.lift ?? 0) > 0 ? ((p.lift >> 1) % 2 ? 2 : -2) : (p.sq ?? 0) >= 3 ? -2 : (p.sq ?? 0) <= -2 || (p.fy ?? 0) <= -3 ? 2 : 0;
const PLATE = c1(['  . ', ' .. ', 'iiim', 'iimm']);
const EAR_L = c1([' sss ', 'sssss', 'sppps', 'sppps', 'sppps', 'sppps', 'sppps', 'sppps', 'sssss', 'sssss']);
const EAR_R = c1(['    sss ', '   sssss', '  ssppps', '  sppps ', ' sppps  ', ' sppps  ', 'sppps   ', 'sppps   ', 'sssss   ', 'sssss   ']);
const EAR_R_FLOP = c1(['         ', '         ', '   ssssss', '  ssppp.s', ' ssppssss', ' sppps   ', 'sppps    ', 'sppps    ', 'sssss    ', 'sssss    ']);
const HARD_HAT = c1(['       lll        ', '     iilllii      ', '    iiilllliii    ', '   iiiillliiiii   ', '   iiiillliiiii   ', '   ............   ', 'mmiiiiiiiiiiiiiimm']);
const VEST = px(['#####      K.K      #####', 'iiiiii##   K.K   ##iiiiii', 'iiiiiiii## K.K ##iiiiiiii', 'llllllllllKK.KKllllllllll', 'iiiiiiiiiiiK.Kiiiiiiiiiii', 'iiiiiiiiiiiK.Kiiiiiiiiiii', 'lllllllllllK.Klllllllllll', 'mmmmmmmmmmmK.Kmmmmmmmmmmm', 'mmmmmmmmmmmK.Kmmmmmmmmmmm'], { unit: 2, key: K });
const SCARF_END = c1(['iii ', 'iiii', ' iii', ' ili', ' i i']);
const RIM = px(['iiiiiiii', 'i      i', 'i      i', 'i      i', 'i      i', 'iiiiiiii'], { unit: 2, key: K });
const even = v => 2 * Math.round(v / 2);

const LOP = ['         ', '         ', '         ', '         ', ' ssssss  ', 'sspppsss ', 'ssspppps ', '  sspppss', '    sspps', '     ssss'];
const EAR_R_DROOP = c1(LOP), EAR_L_DROOP = c1(LOP.map(r => [...r].reverse().join('')));
// Half way down: the ear bends over at its middle, the tip level with the root.
const BENT = ['         ', '         ', '         ', '    sssss', '  sspppps', ' sspppsss', 'sspppss  ', 'sppss    ', 'sssss    ', 'sssss    '];
const EAR_R_BENT = c1(BENT), EAR_L_BENT = c1(BENT.map(r => [...r].reverse().join('')));
/** Where a pose wants the ears: 0 up, 2 fallen to the sides. */
export const earTarget = (p, shapes) => shapes.brow === 'worry' || shapes.mouth === 'frown' || (shapes.eyes === 'closed' && (p.sq ?? 0) >= 4) ? 2 : 0;
const crownLayer = (sprite, x, y, layer = 'front') => ({ layer, draw: ctx => { const [dx, dy] = ctx.shift(80, 45); ctx.put(typeof sprite === 'function' ? sprite(ctx) : sprite, x + dx, y + dy); } });
export const COSTUMES = {
  base: { title: 'Moru', line: 'The original: calm, curious, first to look.', layers: [] },
  horn: { title: 'Horn Moru', line: 'Headstrong: lowers the horns and pushes the hardest task first.', layers: [crownLayer(HORN_L, 62, 36), crownLayer(HORN_R, 86, 36)] },
  unicorn: { title: 'Unicorn Moru', line: 'Dreamer: sure every branch ends well, and a little vain about the mane.', layers: [
    // The mane is hair: it hangs back from a lean, lifts off the neck on the way down and lies flat under a squash.
    { layer: 'front', draw: ctx => { const [dx, dy] = ctx.shift(80, 45), p = ctx.pose, trail = -Math.max(-3, Math.min(3, Math.round((p.fx ?? 0) / 3))) - ((p.lift ?? 0) > 0 ? 2 : 0), hang = (p.lift ?? 0) > 0 ? 2 : (p.sq ?? 0) >= 3 ? 1 : (p.sq ?? 0) <= -3 ? -1 : 0; ctx.put(MANE, 54 + dx + trail, 38 + dy + hang); } },
    crownLayer(UNI_HORN, 76, 30)] },
  dragon: { title: 'Dragon Moru', line: 'Tiny and fierce: guards the crates and flutters when excited.', layers: [
    // The wing flexes with the body unless a clip poses it: up on a stretch or a rise, pressed down by a squash, beating in the air.
    { layer: 'behind', draw: ctx => { const [dx, dy] = ctx.shift(52, 58), level = ctx.shapes.wingLevel ?? wingTarget(ctx.pose, ctx.shapes); ctx.put(WINGS[level], 32 + dx, 30 + dy); } },
    crownLayer(DRAGON_HORN, 62, 36), crownLayer(DRAGON_HORN, 78, 34),
    { layer: 'front', draw: ctx => { for (const [x, y] of [[42, 52], [36, 61]]) { const [dx, dy] = ctx.shift(x + 8, y + 10); ctx.put(PLATE, x + dx, y + dy); } } },
  ] },
  rabbit: { title: 'Rabbit Moru', line: 'Quick and jumpy: hears a merge before anyone and bounds over.', layers: [{ layer: 'front', draw: ctx => {
    // Ears fall over two poses: upright, bent at the middle, lying to the sides.
    const [dx, dy] = ctx.shift(80, 45), level = ctx.shapes.earLevel ?? earTarget(ctx.pose, ctx.shapes), down = level === 2, bent = level === 1;
    ctx.put(down ? EAR_R_DROOP : bent ? EAR_R_BENT : ctx.shapes.earFlop ? EAR_R_FLOP : EAR_R, 80 + dx + (down ? 6 : bent ? 2 : 0), 26 + dy + (down ? 5 : bent ? 1 : 0));
    ctx.put(down ? EAR_L_DROOP : bent ? EAR_L_BENT : EAR_L, 62 + dx - (down ? EAR_L_DROOP.w - EAR_L.w + 6 : bent ? EAR_L_BENT.w - EAR_L.w + 2 : 0), 26 + dy + (down ? 5 : bent ? 1 : 0)); } }] },
  builder: { title: 'Builder Moru', line: 'Practical: hard hat on, checks the hooks twice, trusts the wrench.', layers: [
    { layer: 'skin', draw: ctx => { const [dx, dy] = ctx.shift(80, 90); ctx.put(VEST, 58 + dx, 78 + dy, (x, y) => ctx.onBody(x, y)); } },
    crownLayer(HARD_HAT, 60, 36),
  ] },
  scholar: { title: 'Scholar Moru', line: 'Bookish: files every card, and looks over the glasses when unsure.', layers: [
    { layer: 'skin', draw: ctx => { const [dx, dy] = ctx.shift(80, 82); for (let y = 79; y <= 86; y++) for (let x = 52; x <= 112; x++) if (ctx.onBody(x + dx, y + dy)) ctx.canvas[ctx.L(x + dx, y + dy)] = (y === 79) ? INK : (y >= 85) ? MUTED : INDIGO; } },
    { layer: 'top', draw: ctx => { const [dx, dy] = ctx.shift(60, 86); ctx.put(SCARF_END, 56 + dx, 80 + dy); } },
    { layer: 'front', draw: ctx => { const [fx, fy] = ctx.faceShift(), dx = even(fx), dy = even(fy); ctx.put(RIM, 62 + dx, 58 + dy); ctx.put(RIM, 86 + dx, 58 + dy); for (let x = 78; x < 86; x++) for (const yy of [62, 63]) ctx.canvas[ctx.L(x + dx, yy + dy)] = INDIGO; } },
  ] },
};
export const costumeLayers = name => (COSTUMES[name ?? 'base'] ?? COSTUMES.base).layers;
