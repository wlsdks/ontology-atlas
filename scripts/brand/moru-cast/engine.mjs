// Poses the neutral Moru without resampling it: the body changes size only by removing or repeating
// whole rows and columns at seams where two neighbours are the same drawing, so the outline keeps its
// thickness. Everything else is a rigid part moved by whole pixels.
import { cutRig, N, CLEAR, INK, MARK, MUTED, INDIGO, STONE, IVORY, LIGHT, SHADE, isInk, grown } from './rig.mjs';
export { N, INK, MARK, MUTED, INDIGO, STONE, IVORY, LIGHT };

export const KEY = { '#': INK, '@': MARK, m: MUTED, i: INDIGO, s: STONE, '.': IVORY, l: LIGHT, g: SHADE, p: 10 };
/** A typed pixel map; each character is `unit` px square. `ring` adds an ink outline that many px thick. */
export function px(rows, { unit = 1, ring = 0, key = KEY, cut = 1.6, ringColour = INK } = {}) {
  const w0 = Math.max(...rows.map(r => r.length)) * unit, h0 = rows.length * unit, pad = ring, w = w0 + 2 * pad, h = h0 + 2 * pad;
  const data = new Uint8Array(w * h), mask = new Uint8Array(w * h);
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === ' ') return;
    const colour = key[ch]; if (colour === undefined) throw new Error(`undeclared character "${ch}"`);
    for (let y = 0; y < unit; y++) for (let x = 0; x < unit; x++) { const p = (r * unit + y + pad) * w + c * unit + x + pad; data[p] = colour; mask[p] = 1; }
  }));
  if (ring) { const near = grown(mask, w, ring, cut); for (let p = 0; p < data.length; p++) if (near[p] && !mask[p]) data[p] = ringColour; }
  return { data, w, h, pad };
}
export function flipSprite(s) { const data = new Uint8Array(s.data.length); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) data[y * s.w + x] = s.data[y * s.w + s.w - 1 - x]; return { ...s, data }; }
export function stamp(canvas, w, s, left, top, only) {
  const h = canvas.length / w;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const c = s.data[y * s.w + x], xx = left + x, yy = top + y;
    if (c && xx >= 0 && yy >= 0 && xx < w && yy < h && (!only || only(xx, yy, c))) canvas[yy * w + xx] = c;
  }
}

// Local drawing space: the 128 cell with a margin for ears, hops and wings.
export const MX = 40, MY = 40;
const LW = N + 2 * MX, LH = N + 2 * MY;
export const CENTRE = 72;
const FLOOR = 99;

const EYES = {
  happy: ['   @@@@@   ', '  @@@@@@@  ', ' @@@@ @@@@ ', '@@@     @@@', '@@@     @@@', '@@       @@'],
  closed: ['@@       @@', '@@@     @@@', '@@@     @@@', ' @@@@ @@@@ ', '  @@@@@@@  ', '   @@@@@   '],
  line: ['@@@@@@@@', '@@@@@@@@', '@@@@@@@@'],
  half: ['@@@@', '@@@@', '@@@@', '@@@@', '@@@ '],
  wide: [' @@@@ ', '@@@@@@', '@..@@@', '@..@@@', '@@@@@@', '@@@@@@', '@@@@@@', '@@@@@@', ' @@@@ '],
  dot: [' @@ ', '@@@@', '@@@@', ' @@ '],
  tightL: ['@@@      ', '@@@@@    ', '  @@@@@  ', '    @@@@@', '    @@@@@', '  @@@@@  ', '@@@@@    ', '@@@      '],
  tightR: ['      @@@', '    @@@@@', '  @@@@@  ', '@@@@@    ', '@@@@@    ', '  @@@@@  ', '    @@@@@', '      @@@'],
};
const BROWS = {
  worryL: ['    @@@', '  @@@@@', '@@@@   ', '@@     '], worryR: ['@@@    ', '@@@@@  ', '   @@@@', '     @@'],
  sternL: ['@@     ', '@@@@   ', '  @@@@@', '    @@@'], sternR: ['     @@', '   @@@@', '@@@@@  ', '@@@    '],
  angryL: ['@@@     ', '@@@@@   ', ' @@@@@@ ', '   @@@@@', '     @@@'], angryR: ['     @@@', '   @@@@@', ' @@@@@@ ', '@@@@@   ', '@@@     '],
  flatL: ['@@@@@@@', '@@@@@@@'], flatR: ['@@@@@@@', '@@@@@@@'],
};
const MOUTHS = {
  smile: ['@@    @@', '@@@@@@@@', ' @@@@@@ '],
  open: [' @@@@ ', '@@@@@@', '@@@@@@', '@@@@@@', ' @@@@ '],
  yawn: ['  @@@@  ', ' @@@@@@ ', '@@@@@@@@', '@@@@@@@@', '@@@@@@@@', '@@@@@@@@', ' @@@@@@ ', '  @@@@  '],
  o: [' @@ ', '@@@@', '@@@@', ' @@ '],
  frown: [' @@@@@@ ', '@@@@@@@@', '@@    @@'],
  flat: ['@@@@@@@', '@@@@@@@'],
  wavy: ['  @@   @@', '@@@@@@@@@', '@@   @@  '],
};
const PAW = ['   iiiiii  ', ' iiiiiiiii ', 'miiiiiiiiii', 'mmiiiiiiiii', 'mmmiiiiiiii', ' mmmmiiiii ', '   mmmii   '];

export const REST = { x: 0, lift: 0, sq: 0, wd: 0, fx: 0, fy: 0, gx: 0, gy: 0, tail: 0, tx: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
const SHAPES = { eyes: 'open', mouth: null, brow: null, left: null, right: null, front: false, flip: false, wings: 0 };

/** Order candidates so any first k are spread out: nearest `start` first, then farthest from those chosen. */
function spread(candidates, start) {
  const left = [...candidates], out = [];
  left.sort((a, b) => Math.abs(a - start) - Math.abs(b - start));
  out.push(left.shift());
  while (left.length) { let best = 0, far = -1; left.forEach((c, i) => { const d = Math.min(...out.map(o => Math.abs(o - c))); if (d > far) { far = d; best = i; } }); out.push(left.splice(best, 1)[0]); }
  return out;
}

export async function makeRig() {
  const cut = await cutRig(), { inBody, hidden } = cut, bare = cut.bare;
  // Stray ink left from the tail: ink not within the body's outline reach goes.
  const near = grown(inBody, N, 4, 2);
  for (let p = 0; p < N * N; p++) if (bare[p] && !inBody[p] && !near[p]) bare[p] = 0;
  // The belly behind the flippers, rounded into a level floor.
  const BELLY = 94, wallL = y => y <= 92 ? 0 : y === 93 ? 46 : 49, wallR = y => ({ 89: 104, 90: 104, 91: 103, 92: 102, 93: 100, 94: 97 })[y] ?? 105;
  // The belly's own edge runs one px left per row down; behind the flipper it carries on, as the shipped raised-flipper poses show it.
  let bellyEdge = 54; for (let x = 40; x < 72; x++) if (bare[81 * N + x] === IVORY) { bellyEdge = x; break; }
  const split = y => bellyEdge - (y - 81);
  for (let y = 82; y <= BELLY; y++) for (let x = Math.max(36, wallL(y)); x <= wallR(y); x++) {
    const p = y * N + x;
    if (!inBody[p] && hidden[p]) {
      // Only inside the silhouette: between body fill on this row or under body fill above.
      let above = false; for (let yy = y - 1; yy >= 80; yy--) if (inBody[yy * N + x]) { above = true; break; }
      if (above) { bare[p] = x < split(y) ? STONE : IVORY; inBody[p] = 1; }
    }
  }
  for (let p = 0; p < N * N; p++) if (hidden[p] && !inBody[p]) bare[p] = 0;
  const ring = grown(inBody, N, 3);
  for (let p = 0; p < N * N; p++) if (!inBody[p] && ring[p] && !bare[p] && hidden[p] && Math.floor(p / N) <= 96) bare[p] = INK;
  // The nearest body fill for every pixel, so a slid face carries its cheeks along.
  const fill = new Uint8Array(N * N); let edge = [];
  for (let p = 0; p < N * N; p++) if (inBody[p]) { fill[p] = bare[p]; edge.push(p); }
  while (edge.length) { const next = []; for (const p of edge) { const x = p % N; for (const n of [x > 0 ? p - 1 : -1, x + 1 < N ? p + 1 : -1, p - N, p + N]) if (n >= 0 && n < N * N && !fill[n]) { fill[n] = fill[p]; next.push(n); } } edge = next; }
  for (let y = 80; y <= 86; y++) for (let x = 98; x < N; x++) if (fill[y * N + x] === STONE) fill[y * N + x] = IVORY;
  // Seams: rows and columns equal to their neighbour across the torso and tail.
  const core = Uint8Array.from(bare); stamp(core, N, cut.tail, cut.tail.x0, cut.tail.y0, (x, y) => !core[y * N + x]);
  const same = (a, b) => a === b || (isInk(a) && isInk(b));
  const rowSeams = [], colSeams = [];
  for (let y = 46; y < 93; y++) { let diff = 0; for (let x = 0; x < N; x++) if (!same(core[y * N + x], core[(y + 1) * N + x])) diff++; if (diff <= 1) rowSeams.push(y); }
  for (let x = 40; x < 104; x++) { let diff = 0; for (let y = 0; y < N; y++) if (!same(core[y * N + x], core[y * N + x + 1])) diff++; if (diff <= 1) colSeams.push(x); }
  const tailSeams = []; const t = cut.tail;
  for (let y = 18; y < t.h - 4; y++) { let diff = 0; for (let x = 0; x < t.w; x++) if (!same(t.data[y * t.w + x], t.data[(y + 1) * t.w + x])) diff++; if (!diff) tailSeams.push(y); }
  const pawFill = px(PAW), paw = px(PAW, { ring: 2 });
  // The right flank drawn through where the flipper rested: with the flipper lifted the outline runs unbroken from cheek to floor.
  const open = Uint8Array.from(bare), FLANK = { 81: 109, 82: 109, 83: 109, 84: 108, 85: 108, 86: 108 };
  for (const [row, outer] of Object.entries(FLANK)) { const y = +row; for (let x = 100; x < N; x++) open[y * N + x] = x <= outer - 3 ? IVORY : x <= outer ? INK : CLEAR; }
  const marks = Object.fromEntries(Object.entries({ ...EYES, ...BROWS, ...MOUTHS }).map(([k, rows]) => [k, px(rows)]));
  return { ...cut, bare, open, inBody, fill, rowOrder: spread(rowSeams.filter(y => y >= 50), 82), colOrderL: spread(colSeams.filter(x => x < CENTRE - 4), 56), colOrderR: spread(colSeams.filter(x => x > CENTRE + 4), 92), rowSeams, colSeams, tailSeams, paw, pawFill, marks };
}

/** A flipper is drawn lifted once it is well clear of where it rests; nearer than that it is still the resting flipper, moved. */
const offFloor = (dx, dy) => dy < -5 || (dy < -2 && Math.abs(dx) > 6);

// Raised flippers are typed by hand, a pixel to a letter, in the body's own stair rhythm (two rows to a step on a curve): `i` indigo,
// `m` the shaded rim the resting mound has on its upper left. Each is drawn reaching to the right; a reach to the left is its mirror.
// `head` is the middle of the paddle's broad end: it sits on the paw. The short ones are a paw lifted just off its seat; the long ones
// carry an arm back to the body, so a high reach is joined to it and never floats beside the head.
const PADDLES = {
  up: { head: [6, 6], rows: [
    '    miiii   ', '  mmiiiiii  ', ' mmiiiiiiii ', ' miiiiiiiii ', 'mmiiiiiiiiii', 'miiiiiiiiiii', 'miiiiiiiiiii',
    'miiiiiiiiiii', 'miiiiiiiiiii', ' iiiiiiiiii ', ' iiiiiiiiii ', '  iiiiiiii  ', '  iiiiiiii  ', '    iiii    '] },
  diag: { head: [8, 5], rows: [
    '      miiii  ', '    mmiiiiii ', '   miiiiiiiii', '  mmiiiiiiiii', '  miiiiiiiiii', ' miiiiiiiiii ', ' miiiiiiiiii ',
    'miiiiiiiii   ', 'miiiiiiiii   ', 'iiiiiiii     ', ' iiiiii      ', '  iiii       '] },
  side: { head: [9, 4], rows: [
    '    mmmiiiii   ', '  mmiiiiiiiii  ', ' miiiiiiiiiiii ', 'miiiiiiiiiiiiii', 'miiiiiiiiiiiiii', 'iiiiiiiiiiiiiii',
    ' iiiiiiiiiiiii ', '  iiiiiiiiiii  ', '    iiiiiii    '] },
  armUp: { head: [16, 6], rows: [
    '             miiii    ', '           mmiiiiiii  ', '          mmiiiiiiiii ', '          miiiiiiiiii ', '         mmiiiiiiiiiii', '         miiiiiiiiiiii',
    '         miiiiiiiiiiii', '         miiiiiiiiiiii', '         miiiiiiiiiii ', '         miiiiiiiiiii ', '          miiiiiiiii  ', '          miiiiiiiii  ',
    '         miiiiiiiii   ', '         miiiiiiiii   ', '        mmiiiiiiii    ', '        miiiiiiiii    ', '        miiiiiiii     ', '       mmiiiiiii      ',
    '       miiiiiiii      ', '       miiiiiii       ', '      mmiiiiiii       ', '      miiiiiii        ', '     mmiiiiiii        ', '     miiiiiii         ',
    '    mmiiiiii          ', '    miiiiiii          ', '  mmmiiiiii           ', '  miiiiiii            ', 'mmmiiiiii             ', 'miiiiiii              '] },
  armDiag: { head: [23, 6], rows: [
    '                     miiii    ', '                   mmiiiiiii  ', '                  mmiiiiiiiii ', '                  miiiiiiiiiii',
    '                 mmiiiiiiiiiii', '                 miiiiiiiiiiii', '                mmiiiiiiiiiiii', '               mmiiiiiiiiiiii ',
    '              mmiiiiiiiiiiiii ', '             mmiiiiiiiiiiii   ', '            mmiiiiiiiiiii     ', '           mmiiiiiiiiii       ',
    '          mmiiiiiiiii         ', '         mmiiiiiiii           ', '        mmiiiiiiii            ', '       mmiiiiiii              ',
    '      mmiiiiiii               ', '     mmiiiiiii                ', '    mmiiiiiii                 ', '   mmiiiiiii                  ',
    '  mmiiiiiii                   ', ' mmiiiiiii                    ', 'mmiiiiiii                     ', 'miiiiii                       '] },
  armSide: { head: [19, 5], rows: [
    '              mmmiiiii    ', '            mmiiiiiiiii   ', '      mmmmmmiiiiiiiiiiii  ', 'mmmmmmiiiiiiiiiiiiiiiiiii ',
    'miiiiiiiiiiiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiiiiiiiiiiii ',
    'iiiiiiiiiiiiiiiiiiiiiiii  ', '      iiiiiiiiiiiiiiii    ', '            iiiiiiii      '] },
};
/**
 * The hand-drawn paddle for a flipper lifted to (tx, ty), `dx`, `dy` from where it rests; `side` 0 the left flipper, 1 the right.
 * A reach of more than 15px by the right flipper (the one at the body's edge) takes an arm, whose root comes down on the flipper's seat: it covers what the resting mound covered, so lifting
 * a flipper hardly moves the body's measured centre.
 */
function liftedFlipper(tx, ty, dx, dy, side, floor = Infinity) {
  const way = Math.abs(dx) < 3 ? (side ? 1 : -1) : Math.sign(dx), rise = Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI, long = side === 1 && Math.hypot(dx, dy) > 15;
  const art = PADDLES[long ? (rise >= 58 ? 'armUp' : rise >= 22 ? 'armDiag' : 'armSide') : rise >= 52 ? 'up' : rise >= 18 ? 'diag' : 'side'], PAD = 3, cols = art.rows[0].length, w = cols + 2 * PAD, h = art.rows.length + 2 * PAD;
  const mask = new Uint8Array(w * h), data = new Uint8Array(w * h);
  art.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === ' ') return; const p = (PAD + r) * w + PAD + (way > 0 ? c : cols - 1 - c); mask[p] = 1; data[p] = ch === 'm' ? MUTED : INDIGO; }));
  const near = grown(mask, w, 3); for (let p = 0; p < w * h; p++) if (!mask[p] && near[p]) data[p] = INK;
  const hx = way > 0 ? art.head[0] : cols - 1 - art.head[0], y0 = Math.round(ty - art.head[1]) - PAD;
  // A paddle only just off the floor still stands on it: what would hang below the floor row is cut, and the cut is closed with the mound's own base of ink.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (y + y0 > floor) data[p] = 0; else if (y + y0 > floor - 3 && data[p]) data[p] = INK; }
  return { data, w, h, x: Math.round(tx - hx) - PAD, y: y0 };
}

/** A list of source indices with `k` seams removed (k > 0) or repeated (k < 0). */
function resized(length, order, k) {
  const list = Array.from({ length }, (_, i) => i), chosen = order.slice(0, Math.abs(k));
  if (chosen.length < Math.abs(k)) throw new Error(`only ${order.length} seams for a change of ${k}`);
  for (const s of chosen.sort((a, b) => b - a)) { const at = list.indexOf(s); if (k > 0) list.splice(at, 1); else list.splice(at, 0, s); }
  return list;
}

/**
 * Draws one Moru into a local canvas. Returns the canvas, a body mask and anchors (local coordinates
 * are cell coordinates plus MX, MY). `costume` is a list of layers; see costumes.mjs.
 */
export function drawMoru(rig, poseIn = {}, shapesIn = {}, costume = []) {
  const pose = { ...REST, ...poseIn }, shapes = { ...SHAPES, ...shapesIn };
  for (const k of Object.keys(REST)) pose[k] = Math.round(pose[k]);
  const { fill, inBody } = rig;
  // 1. Core: tail (raised by seam rows) behind the torso with the face's fill slid.
  const core = new Uint8Array(N * N), coreBody = new Uint8Array(N * N);
  if (!shapes.front && !shapes.tuck) {
    const t = rig.tail, rows = resized(t.h, rig.tailSeams.slice().sort((a, b) => Math.abs(a - 24) - Math.abs(b - 24)), -pose.tail);
    const top = t.y0 + t.h - rows.length;
    rows.forEach((src, i) => { for (let x = 0; x < t.w; x++) { const c = t.data[src * t.w + x]; if (c && top + i >= 0 && t.x0 + x + pose.tx < N) core[(top + i) * N + t.x0 + x + pose.tx] = c; } });
  }
  const lifted = shapes.right ? shapes.right === 'paw' : offFloor(pose.rx, pose.ry), torso = lifted ? rig.open : rig.bare;
  for (let p = 0; p < N * N; p++) {
    if (!torso[p]) continue;
    if (inBody[p] || (lifted && torso[p] === IVORY)) { const x = p % N, y = (p - x) / N, sx = Math.max(0, Math.min(N - 1, x - pose.fx)), sy = Math.max(0, Math.min(N - 1, y - pose.fy)); core[p] = (pose.fx || pose.fy) && inBody[p] ? fill[sy * N + sx] : torso[p]; coreBody[p] = 1; }
    else core[p] = torso[p];
  }
  // 2. Rows and columns removed or repeated at seams; the floor and the centre column stay put.
  const rows = resized(N, rig.rowOrder, pose.sq), yOff = FLOOR - rows.lastIndexOf(FLOOR);
  const half = pose.wd / 2, kl = pose.wd >= 0 ? Math.ceil(half) : Math.ceil(half), kr = pose.wd - kl;
  let cols = Array.from({ length: N }, (_, i) => i);
  const edit = (order, k) => { for (const s of order.slice(0, Math.abs(k)).sort((a, b) => b - a)) { const at = cols.indexOf(s); if (k < 0) cols.splice(at, 1); else cols.splice(at, 0, s); } };
  edit(rig.colOrderL, kl); edit(rig.colOrderR, kr);
  const xOff = CENTRE - cols.indexOf(CENTRE);
  const mapX = sx => { let i = cols.indexOf(Math.round(sx)); if (i < 0) i = cols.indexOf(Math.round(sx) + 1); return i + xOff; };
  const mapY = sy => { let i = rows.indexOf(Math.round(sy)); if (i < 0) i = rows.indexOf(Math.round(sy) + 1); return i + yOff; };
  const canvas = new Uint8Array(LW * LH), body = new Uint8Array(LW * LH);
  const L = (x, y) => (y + MY) * LW + x + MX;
  const ctx = { canvas, body, pose, shapes, mapX, mapY, L, rig,
    put: (s, x, y, only) => stamp(canvas, LW, s, Math.round(x) + MX, Math.round(y) + MY, only && ((xx, yy, c) => only(xx - MX, yy - MY, c))),
    onBody: (x, y) => body[L(x, y)] === 1 };
  // Costume shift for a layer following a body point.
  ctx.shift = (ax, ay) => [mapX(ax) - ax, mapY(ay) - ay];
  const faceShift = () => { const [dx, dy] = ctx.shift(83, 68); return [dx + pose.fx, dy + pose.fy]; };
  ctx.faceShift = faceShift;
  // What a worn piece drew behind or in front of the body is remembered, so a turn can seat it.
  const wrote = new Uint8Array(LW * LH), layers = where => { for (const layer of costume) if (layer.layer === where) { const before = where === 'skin' ? null : canvas.slice(); layer.draw(ctx); if (before) for (let p = 0; p < LW * LH; p++) if (canvas[p] !== before[p]) wrote[p] = canvas[p]; } };
  layers('behind');
  for (let y = 0; y < rows.length; y++) { const oy = y + yOff; if (oy < -MY || oy >= N + MY) continue; for (let x = 0; x < cols.length; x++) { const ox = x + xOff, src = rows[y] * N + cols[x]; if (core[src]) { canvas[L(ox, oy)] = core[src]; if (coreBody[src]) body[L(ox, oy)] = 1; } } }
  // Facing front, the back shows down both sides: a flank of the back's stone runs to the floor on the left and the right, and the belly sits between them.
  if (shapes.front) for (let y = mapY(72); y <= mapY(96); y++) { let x0 = -1, x1 = -1; for (let x = 0; x < N; x++) { const c = canvas[L(x, y)]; if (c === STONE || c === IVORY) { if (x0 < 0) x0 = x; x1 = x; } } if (x0 < 0) continue;
    const wide = Math.max(4, 8 - Math.floor(Math.max(0, y - mapY(72)) / 6)); for (let k = 0; k < wide; k++) for (const x of [x0 + k, x1 - k]) if (canvas[L(x, y)] === IVORY) canvas[L(x, y)] = STONE; }
  layers('skin');
  // 3. Face marks; a mark on the side the face turns toward travels less.
  const clear = (x, y) => [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]].every(([dx, dy]) => body[L(x + dx, y + dy)]);
  const turned = (x, extra = 0) => { const turn = pose.fx + extra; return Math.round((turn > 0 ? x > 84 : x < 82) ? turn * 0.6 : turn); };
  // A mark keeps its own top-left, so the neutral pose is reproduced to the pixel; another drawing is centred on it.
  const place = (m, gaze = 0, gy = 0) => [mapX(m.x0) + turned(m.cx, gaze), mapY(m.y0) + pose.fy + Math.round(gy)];
  const markAt = (s, x, y, m) => ctx.put(s, x + Math.floor(((m?.w ?? s.w) - s.w) / 2), y + Math.floor(((m?.h ?? s.h) - s.h) / 2), clear);
  const turnedPose = (shapes.angle ?? 0) % 360 !== 0, faceMarks = [];
  const eyeNames = shapes.eyes === 'tight' ? ['tightL', 'tightR'] : [shapes.eyes, shapes.eyes];
  rig.eyes.forEach((eye, i) => {
    const [x, y] = place(eye, pose.gx, pose.gy), name = eyeNames[i] === 'wink' ? (i === 0 ? 'open' : 'happy') : eyeNames[i];
    if (turnedPose) { faceMarks.push({ s: rig.marks.dot, x: x + eye.w / 2, y: y + eye.h / 2 }); return; }
    if (name === 'open') markAt(eye, x, y);
    else { const s = rig.marks[name]; if (!s) throw new Error('no eyes ' + name); markAt(s, x, y + ({ happy: 0, closed: 1, line: 1, half: 3 }[name] ?? 0), eye); }
    if (shapes.brow) { const b = rig.marks[shapes.brow + (i === 0 ? 'L' : 'R')]; const [bx, by] = place(eye); markAt(b, bx + (i === 0 ? -1 : 1), by - 6 - b.h + 4, { w: eye.w, h: b.h }); }
  });
  { const [x, y] = place(rig.nose, pose.gx / 2, pose.gy / 2); if (turnedPose) faceMarks.push({ s: rig.nose, x: x + rig.nose.w / 2, y: y + rig.nose.h / 2 }); else markAt(rig.nose, x, y); ctx.nose = [x + 3, y + 3]; }
  if (shapes.mouth && turnedPose) { const m = rig.marks[shapes.mouth], [x, y] = place(rig.nose, pose.gx / 2, pose.gy / 2); faceMarks.push({ s: m, x: x + rig.nose.w / 2, y: y + rig.nose.h + 1 + m.h / 2, whisker: true }); }
  if (shapes.mouth && !turnedPose) { const m = rig.marks[shapes.mouth]; const [x, y] = place(rig.nose, pose.gx / 2, pose.gy / 2); markAt(m, x, y + rig.nose.h + 1, { w: rig.nose.w, h: m.h }); }
  // 4. Flippers: the neutral pose's own pixels on the floor, the round paw off it.
  const flipper = (i, dx, dy, shape) => {
    const f = rig.flips[i], shift = mapX(Math.round(f.box.cx)) - Math.round(f.box.cx);
    const cx = Math.round(f.box.cx) + shift + dx, cy = Math.round(f.box.cy) + dy;
    return { i, f, shape: shape ?? (offFloor(dx, dy) ? 'paw' : 'rest'), dx: shift + dx, dy, cx, cy, ox: dx };
  };
  const placed = [flipper(0, pose.lx, pose.ly, shapes.left), flipper(1, pose.rx, pose.ry, shapes.right)];
  // A flipper off the floor is one of the hand-drawn paddles, picked by where the paw has gone and outlined whole like the mound it left.
  const limbs = placed.map(pl => {
    if (pl.shape === 'hidden' || shapes.noFlippers) return null;
    const r = pl.f.rest;
    if (pl.shape === 'rest') return { data: r.data, w: r.w, h: r.h, x: r.x0 + pl.dx + MX, y: r.y0 + pl.dy + MY, rest: true };
    // The shoulder sits low on the belly and slides up the flank for a high reach, so a raised flipper leaves from the side, not across the face.
    const s = liftedFlipper(pl.cx, pl.cy, pl.ox, pl.dy, pl.i, r.y0 + r.h - 1);
    return { ...s, x: s.x + MX, y: s.y + MY };
  });
  const whiskerHidden = (s, x, y) => limbs.some(l => l && !l.rest && x + s.w / 2 + 2 > l.x - MX && x - s.w / 2 - 2 < l.x - MX + l.w && y + s.h / 2 + 2 > l.y - MY && y - s.h / 2 - 2 < l.y - MY + l.h && (() => { for (let yy = Math.floor(y - s.h / 2) - 1; yy <= y + s.h / 2 + 1; yy++) for (let xx = Math.floor(x - s.w / 2) - 1; xx <= x + s.w / 2 + 1; xx++) { const lx = xx + MX - l.x, ly = yy + MY - l.y; if (lx >= 0 && ly >= 0 && lx < l.w && ly < l.h && l.data[ly * l.w + lx]) return true; } return false; })());
  // On a turned pose the whiskers go with the face: each is kept whole and turned by the body's angle, so the face never empties and refills.
  for (const w of rig.whiskers) { const [x, y] = place(w); if (turnedPose) faceMarks.push({ s: w, x: x + w.w / 2, y: y + w.h / 2, whisker: true }); else if (!whiskerHidden(w, x + w.w / 2, y + w.h / 2)) markAt(w, x, y); }
  layers('front');
  // Facing front in a vest or an apron, the strip of belly left between the flank and the cloth is too thin to read as belly: it takes the flank's stone.
  if (shapes.front) for (let y = mapY(72); y <= mapY(96); y++) { let x = 0; while (x < N && canvas[L(x, y)] !== STONE && canvas[L(x, y)] !== IVORY) x++; while (x < N && canvas[L(x, y)] === STONE) x++; const from = x; while (x < N && canvas[L(x, y)] === IVORY) x++;
    const cloth = [0, 1, 2, 3, 4].some(k => { const c = canvas[L(x + k, y)]; return c === INDIGO || c === MUTED || c === LIGHT; }); if (cloth && x - from <= 18 && rig.whiskers.every(w => Math.abs(mapY(w.y0) + pose.fy - y) > 3)) for (let k = from; k < x; k++) canvas[L(k, y)] = STONE; }
  ctx.held = [];
  for (const l of limbs) if (l) stamp(canvas, LW, l, l.x, l.y);
  layers('top');
  const crown = [mapX(80), mapY(45)];
  const anchors = { crown, pawL: [placed[0].cx, placed[0].cy], pawR: [placed[1].cx, placed[1].cy], nose: ctx.nose, bubble: [crown[0] + 2, crown[1] - 8], back: [mapX(50), mapY(60)], right: [mapX(108), 80], left: [mapX(36), 80] };
  const worn = wrote.map((c, p) => c && canvas[p] === c ? 1 : 0);
  return { canvas, body, anchors, pose, shapes, limbs, faceMarks, worn };
}

/** Blits a drawn Moru onto a scene at cell origin `ox` (the cell's left), mirrored about the body centre when `flip`. Returns anchors in scene coordinates. */
export function blitMoru(scene, W, drawn, ox, { flip = false, oy = 0, only, pivot } = {}) {
  const lift = drawn.pose.lift, H = scene.length / W;
  const tx = lx => flip ? ox + 2 * CENTRE - (lx - MX) : ox + lx - MX;
  let pts = [];
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const c = drawn.canvas[y * LW + x]; if (!c) continue;
    pts.push([tx(x) + drawn.pose.x, y - MY - lift + oy, c, drawn.worn ? drawn.worn[y * LW + x] : 0]);
  }
  // A roll: whole quarter turns about the body's centre column, forward in the direction faced, rested back on its own lowest row.
  const quarter = (((drawn.shapes.turn ?? 0) * (flip ? -1 : 1)) % 4 + 4) % 4;
  if (quarter && pts.length) {
    // The body fill keeps its centre through the turn, so a roll adds no step of its own; the clip gives it the height to clear the floor.
    const centre = list => { let n = 0, sx = 0, sy = 0; for (const [x, y, c] of list) if (c === STONE || c === IVORY) { n++; sx += x; sy += y; } return [sx / n, sy / n]; };
    const [ax, ay] = centre(pts);
    for (let k = 0; k < quarter; k++) pts = pts.map(([x, y, c]) => [-y, x, c]);
    const [bx, by] = centre(pts), dx = Math.round(ax - bx), dy = Math.round(ay - by); pts = pts.map(([x, y, c]) => [x + dx, y + dy, c]);
  }
  // A free angle (a roll's in-between poses): each pixel is drawn six times finer, turned about the body fill's centre and
  // taken back by majority, with ink weighted up so the outline and the face survive the turn.
  const angle = (drawn.shapes.angle ?? 0) * (flip ? -1 : 1); let rested = 0;
  if (angle % 360 && pts.length) {
    let n = 0, ax = 0, ay = 0, r = 0; for (const [x, y, c] of pts) if (c === STONE || c === IVORY) { n++; ax += x; ay += y; } ax /= n; ay /= n;
    // A part of a Moru drawn alone (the body without its flippers) turns about the whole Moru's centre, given by the caller.
    if (pivot) [ax, ay] = pivot;
    const at = (x, y) => (y + 512) * 2048 + x + 512, src = new Map(), flat = new Map(), ink = c => c === INK || c === MARK;
    for (const [x, y, c] of pts) { src.set(at(x, y), c); r = Math.max(r, Math.hypot(x - ax, y - ay)); if (!ink(c)) flat.set(at(x, y), c); }
    // The outline is taken off and drawn again after the turn, so it keeps its thickness; a line inside the body takes the fill beside it.
    let inner = pts.filter(([x, y, c]) => { if (!ink(c)) return false; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!src.has(at(x + dx, y + dy))) return false; return true; });
    // Ink that parts two fills (a hat from the head, a wing from the back) stays ink, so a worn piece turns joined to the body.
    const fillAlong = (x, y, dx, dy) => { for (let k = 1; k <= 7; k++) { const c = src.get(at(x + dx * k, y + dy * k)); if (c === undefined) return false; if (!ink(c)) return true; } return false; };
    for (const [x, y, c] of pts) if (ink(c) && !flat.has(at(x, y)) && [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dx, dy]) => fillAlong(x, y, dx, dy) && fillAlong(x, y, -dx, -dy)) && !inner.some(q => q[0] === x && q[1] === y)) flat.set(at(x, y), INK);
    while (inner.length) { const paint = [], rest = []; for (const [x, y] of inner) { const c = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => flat.get(at(x + dx, y + dy))).find(v => v); if (c) paint.push([x, y, c]); else rest.push([x, y]); } if (!paint.length) break; for (const [x, y, c] of paint) flat.set(at(x, y), c); inner = rest; }
    // Off the floor a flipper's sole is no longer pressed flat: each rounds out below, more the further the body has turned. Only the flippers grow, so the body's centre does not move.
    { const deep = Math.round(4 * Math.min(1, (1 - Math.cos(angle * Math.PI / 180)) * 1.5)), blue = c => c === MUTED || c === INDIGO || c === LIGHT; let yb = -1e9; for (const [, y, c] of pts) if (!ink(c)) yb = Math.max(yb, y);
      const low = new Map(); for (const [x, y] of pts) { const c = flat.get(at(x, y)); if (c && blue(c) && y >= yb - 2 && (!low.has(x) || low.get(x)[0] < y)) low.set(x, [y, c]); }
      const xs = [...low.keys()].sort((a, b) => a - b); for (let i = 0; i < xs.length && deep > 0;) { let k = i; while (k + 1 < xs.length && xs[k + 1] === xs[k] + 1) k++; const x0 = xs[i], x1 = xs[k], mid = (x0 + x1) / 2, half = (x1 - x0) / 2 + 0.5;
        for (let x = x0; x <= x1; x++) { const [y0, c] = low.get(x), d = Math.round(deep * Math.sqrt(Math.max(0, 1 - ((x - mid) / half) ** 2))); for (let y = y0 + 1; y <= yb + d; y++) { flat.set(at(x, y), c); r = Math.max(r, Math.hypot(x - ax, y - ay)); } } i = k + 1; } }
    // A small worn piece on the rim (a bow, a horn, the wing) holds on by a corner once the outline is stepped by the turn: it is seated three pixels
    // into the body, keeping one pixel of ink where it meets the fill, so it turns as part of the Moru.
    { const worn = new Set(pts.filter(q => q[3] && flat.has(at(q[0], q[1])) && flat.get(at(q[0], q[1])) !== INK).map(q => at(q[0], q[1]))), seen = new Set(), parts = [];
      for (const k0 of worn) { if (seen.has(k0)) continue; const part = [k0]; seen.add(k0); for (let i = 0; i < part.length; i++) { const k = part[i]; for (const n of [k - 1, k + 1, k - 2048, k + 2048]) if (!seen.has(n) && worn.has(n)) { seen.add(n); part.push(n); } } parts.push(part); }
      for (const part of parts) { if (part.length > 260 || part.length < 12) continue;
        // Its fine detail (the ribs of a wing, the tip of a plate) breaks into specks when turned: a colour holding less than 45% of the piece takes the piece's main colour.
        { const count = new Map(); for (const k of part) count.set(flat.get(k), (count.get(flat.get(k)) ?? 0) + 1); const main = [...count].sort((a, b) => b[1] - a[1])[0][0]; for (const k of part) if (count.get(flat.get(k)) < part.length * 0.45) flat.set(k, main); }
        // A very small piece (a back plate) has a base as broad as itself and would be swallowed: it stays where it is.
        if (part.length < 60) continue;
        let cx = 0, cy = 0; for (const k of part) { cx += k % 2048 - 512; cy += Math.floor(k / 2048) - 512; } cx /= part.length; cy /= part.length;
        const d = Math.hypot(ax - cx, ay - cy) || 1, mx = Math.round(3 * (ax - cx) / d), my = Math.round(3 * (ay - cy) / d), moved = part.map(k => [k % 2048 - 512 + mx, Math.floor(k / 2048) - 512 + my, flat.get(k)]);
        // Only a piece that sits out on the rim: one whose far side is open air.
        if (!part.some(k => !src.has(at(k % 2048 - 512 - 2 * mx, Math.floor(k / 2048) - 512 - 2 * my)))) continue;
        // And one that stands out of the silhouette: a piece worn on the skin near the edge (glasses) stays where it is, in its own colours.
        if (part.filter(k => [[5, 0], [-5, 0], [0, 5], [0, -5]].some(([dx, dy]) => !src.has(k + dy * 2048 + dx))).length < part.length * 0.3) continue;
        for (const k of part) { flat.delete(k); for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const n = k + dy * 2048 + dx; if (flat.get(n) === INK) flat.delete(n); } }
        const body = k => flat.has(k) && flat.get(k) !== INK && !worn.has(k);
        const put = moved.filter(([x, y]) => !body(at(x, y))).map(([x, y, c]) => { const k = at(x, y); return [k, [k - 1, k + 1, k - 2048, k + 2048].some(body) ? INK : c]; }); for (const [k, c] of put) flat.set(k, c); } }
    const cos = Math.cos(-angle * Math.PI / 180), sin = Math.sin(-angle * Math.PI / 180), S = 6, R = Math.ceil(r) + 5, side = 2 * R + 1, X0 = Math.floor(ax) - R, Y0 = Math.floor(ay) - R, grid = new Uint8Array(side * side);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const votes = new Map(); let best = 0, top = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const px = x + X0 + (i + 0.5) / S - 0.5 - ax, py = y + Y0 + (j + 0.5) / S - 0.5 - ay, sx = Math.round(ax + px * cos - py * sin), sy = Math.round(ay + px * sin + py * cos);
        const c = flat.get(at(sx, sy)) ?? 0, v = (votes.get(c) ?? 0) + 1; votes.set(c, v); if (v > top) { top = v; best = c; }
      }
      grid[y * side + x] = best;
    }
    // A lone pixel standing out of an edge, or a lone gap in it, is taken off: the turned outline runs in steps, not specks.
    for (let pass = 0; pass < 2; pass++) for (let y = 1; y < side - 1; y++) for (let x = 1; x < side - 1; x++) { const p = y * side + x, n = [grid[p - 1], grid[p + 1], grid[p - side], grid[p + side]], filled = n.filter(Boolean).length; if (grid[p] && filled <= 1) grid[p] = 0; else if (!grid[p] && filled >= 3) grid[p] = n.find(Boolean); }
    // The same for colour: a pixel with no neighbour of its own colour (the rib of a wing, the shade of a plate, broken by the turn) takes the colour around it, so a worn piece turns as flat shapes.
    for (let y = 1; y < side - 1; y++) for (let x = 1; x < side - 1; x++) { const p = y * side + x, c = grid[p]; if (!c) continue; const n = [grid[p - 1], grid[p + 1], grid[p - side], grid[p + side]].filter(Boolean); if (n.length < 3 || n.includes(c)) continue; grid[p] = n.sort((a, b) => n.filter(v => v === b).length - n.filter(v => v === a).length)[0]; }
    const mask = grid.map(c => c ? 1 : 0), near = grown(mask, side, 3), turned = [];
    for (let p = 0; p < side * side; p++) if (grid[p] || near[p]) turned.push([p % side + X0, Math.floor(p / side) + Y0, grid[p] || INK]);
    // The face is not turned as pixels: round eyes and the nose are set down whole where the turn carries them.
    const fwd = Math.cos(angle * Math.PI / 180), fws = Math.sin(angle * Math.PI / 180);
    // A whisker or the mouth is a short bar: it turns by the body's own angle, read back pixel by pixel, so it steps round with the body instead of snapping a quarter turn at a time.
    const spun = sp => { const r = Math.ceil(Math.hypot(sp.w, sp.h) / 2), n = 2 * r + 1, o = { w: n, h: n, data: new Uint8Array(n * n) };
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = x - r, dy = y - r, sx = Math.floor(dx * fwd + dy * fws + sp.w / 2), sy = Math.floor(-dx * fws + dy * fwd + sp.h / 2); if (sx >= 0 && sy >= 0 && sx < sp.w && sy < sp.h) o.data[y * n + x] = sp.data[sy * sp.w + sx]; }
      return o; };
    for (const m of drawn.faceMarks ?? []) {
      const sp = m.whisker ? spun(flip ? { w: m.s.w, h: m.s.h, data: Uint8Array.from(m.s.data, (_, i) => m.s.data[i - i % m.s.w + m.s.w - 1 - i % m.s.w]) } : m.s) : m.s;
      const mx = tx(m.x + MX) + drawn.pose.x - ax, my = m.y - lift + oy - ay, cx = ax + mx * fwd - my * fws, cy = ay + mx * fws + my * fwd, left = Math.round(cx - sp.w / 2), topY = Math.round(cy - sp.h / 2);
      const skin = (x, y) => { const c = grid[(y - Y0) * side + x - X0]; return c === STONE || c === IVORY || c > 9; };
      // Whiskers and the mouth keep only the pixels that land on skin; an eye or the nose is all or nothing.
      if (m.whisker) { for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) if (sp.data[y * sp.w + x] && skin(left + x, topY + y)) turned.push([left + x, topY + y, sp.data[y * sp.w + x]]); continue; }
      if (!skin(Math.round(cx), Math.round(cy)) || !skin(left - 1, topY - 1) || !skin(left + m.s.w, topY + m.s.h)) continue;
      for (let y = 0; y < m.s.h; y++) for (let x = 0; x < m.s.w; x++) if (m.s.data[y * m.s.w + x]) turned.push([left + x, topY + y, m.s.data[y * m.s.w + x]]);
    }
    // A turned body never dips under the floor: it is rested back on the floor row by as much as it sank.
    const sink = turned.reduce((m, t) => Math.max(m, t[1]), 0) - (FLOOR + oy); if (sink > 0) for (const t of turned) t[1] -= sink;
    rested = Math.max(0, sink);
    pts = turned;
  }
  for (const [xx, yy, c] of pts) if (xx >= 0 && yy >= 0 && xx < W && yy < H && (!only || only(xx, yy))) scene[yy * W + xx] = c;
  const out = {};
  for (const [k, [ax, ay]] of Object.entries(drawn.anchors)) out[k] = [(flip ? ox + 2 * CENTRE - ax : ox + ax) + drawn.pose.x, ay - lift + oy];
  out.dir = flip ? -1 : 1; out.sink = rested;
  return out;
}
