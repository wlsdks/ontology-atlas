/** Deterministic exports from the retained Image Gen sources; no generation runs here. */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMoruCompanion } from './build-moru-companion.mjs';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const ROOT = 'assets/brand/moru';
const COLORS = ['171923', '17192d', '50569c', '6d73d2', '555451', '777572', '99968f', 'aaa9a5', 'b8b4aa', 'd6d3c9', 'fff1d7', '9399e5'];
const PALETTE = COLORS.map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
const NEUTRALS = PALETTE.filter(p => Math.max(...p) - Math.min(...p) < 30);
const COOL = PALETTE.filter(p => p[2] > p[0] + 8);
/** Channel spread from which a source pixel counts as coloured rather than gray. */
const CHROMATIC_SPREAD = 35;
const [STONE, IVORY] = ['d6d3c9', 'fff1d7'].map(hex => PALETTE[COLORS.indexOf(hex)]);

/**
 * Dark achromatic shading must not become indigo; bright warm ivory remains ivory. A plainly
 * blue pixel stays in the ink and indigo family even where a dark gray is nearer by distance.
 */
export function moruColor(r, g, b, accents = []) {
  const distance = q => (r - q[0]) ** 2 + (g - q[1]) ** 2 + (b - q[2]) ** 2;
  if (accents.length) {
    const base = PALETTE.reduce((a, p) => distance(p) < distance(a) ? p : a);
    const accent = accents.reduce((a, p) => distance(p) < distance(a) ? p : a);
    if (distance(accent) < distance(base)) return accent;
  }
  if (r >= 235 && r - g >= 5 && r - b >= 18) return IVORY;
  const achromatic = Math.max(r, g, b) - Math.min(r, g, b) < CHROMATIC_SPREAD;
  if (achromatic && Math.min(r, g, b) >= 150) return STONE;
  const candidates = achromatic ? NEUTRALS : b - Math.max(r, g) >= CHROMATIC_SPREAD ? COOL : PALETTE;
  return candidates.reduce((best, p) => {
    return distance(p) < distance(best) ? p : best;
  });
}

const raw = (data, size, frames = 1) => sharp(data, { raw: { width: size, height: size * frames, channels: 4, pageHeight: size } });
const put = async (path, data) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); };
const png = (data, size) => raw(data, size).png().toBuffer();

function bounds(data, size) {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (!data[i + 3]) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < 0) throw new Error('Moru frame has no visible body');
  return [x0, y0, x1 + 1, y1 + 1];
}

function translate(data, size, dx, dy) {
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && xx < size && yy >= 0 && yy < size) data.copy(out, (yy * size + xx) * 4, (y * size + x) * 4, (y * size + x) * 4 + 4);
    else if (data[(y * size + x) * 4 + 3]) throw new Error('Moru registration would clip art');
  }
  return out;
}

/** Clips are cut, registered and cleaned on this grid, then halved to each exported size. */
const WORK = 256;
/** A thin stroke's soft edge is about half opaque; a higher cutoff drops the stroke. */
const CLIP_ALPHA_CUTOFF = 128;
/** Enclosed ink no wider or taller than this share of the cell is one facial mark. */
const MARK_SPAN_SHARE = 5 / 32;
/** Work pixels, half a drawn pixel: marks this close in size can be one drawing made twice. */
const TWIN_TOLERANCE = 2;
/** Two marks are one drawing when at most this share of the smaller is not common to both. */
const TWIN_UNSHARED_SHARE = 1 / 4;
/** Exported pixels a mark may move so that it touches no other ink. */
const MARK_NUDGE = 1;
/** Work pixels: the last halving samples this far past the centre of each exported pixel. */
const SAMPLE_BIAS = 0.5;
/** Work pixels of area, a quarter of a drawn pixel: a smaller piece of one colour is noise. */
const SPECK_AREA = 4;
/** Work pixels: ink this near a fill reads as that fill's outline. */
const FILL_REACH = 6;
/** Work pixels of area, four drawn pixels: a smaller detached piece is source noise. */
const CRUMB_AREA = 64;
/** Exported pixels a prop tip may put on the cell edge before the frame counts as clipped. */
const EDGE_SLIVER = 2;
const pack = (r, g, b) => r << 16 | g << 8 | b;
const INK = new Set([COLORS[0], COLORS[1]].map(hex => parseInt(hex, 16)));
const FREE_INK = PALETTE[COLORS.indexOf('6d73d2')];
const FRINGE = new Set(['555451', '777572'].map(hex => parseInt(hex, 16)));
/** Work pixels, half a drawn pixel: the outline's soft edge reaches this far from its ink. */
const FRINGE_REACH = 2;
const isOpaque = (data, p) => data[p * 4 + 3] !== 0;
const isInk = (data, p) => isOpaque(data, p) && INK.has(pack(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]));

const eightNeighbours = (p, size, visit) => {
  const x = p % size, y = (p - x) / size;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if ((dx || dy) && xx >= 0 && yy >= 0 && xx < size && yy < size) visit(yy * size + xx);
  }
};

/** The connected pixels of `member` reachable from `start`; O(pixels) across one frame. */
function floodGroup(start, member, seen, size) {
  const group = [start]; seen[start] = 1;
  for (let i = 0; i < group.length; i++) eightNeighbours(group[i], size, n => { if (member[n] && !seen[n]) { seen[n] = 1; group.push(n); } });
  return group;
}

/** A piece of one colour smaller than `SPECK_AREA` is source noise and takes the commonest colour around it; O(pixels). */
export function despeckle(data, size) {
  const total = size * size, colour = new Int32Array(total), seen = new Uint8Array(total), out = Buffer.from(data);
  for (let p = 0; p < total; p++) colour[p] = isOpaque(data, p) ? pack(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) : -1;
  for (let start = 0; start < total; start++) {
    if (seen[start]) continue;
    const piece = [start], around = new Map();
    seen[start] = 1;
    for (let i = 0; i < piece.length; i++) eightNeighbours(piece[i], size, n => {
      if (colour[n] !== colour[start]) around.set(colour[n], (around.get(colour[n]) ?? 0) + 1);
      else if (!seen[n]) { seen[n] = 1; piece.push(n); }
    });
    if (piece.length >= SPECK_AREA || !around.size) continue;
    const commonest = [...around].reduce((best, next) => next[1] > best[1] || next[1] === best[1] && next[0] < best[0] ? next : best)[0];
    for (const p of piece) {
      if (commonest < 0) out.fill(0, p * 4, p * 4 + 4);
      else out.set([commonest >> 16, commonest >> 8 & 255, commonest & 255, 255], p * 4);
    }
  }
  return out;
}

/** The pixels repainted outside in with the fill beside them, never with ink; O(pixels × depth). */
function paintedOver(data, size, pixels) {
  const out = Buffer.from(data), pending = new Uint8Array(size * size);
  for (const p of pixels) pending[p] = 1;
  for (let layer = pixels; layer.length;) {
    const painted = [], inner = [];
    for (const p of layer) {
      let fill = -1;
      eightNeighbours(p, size, n => { if (fill < 0 && !pending[n] && !isInk(out, n)) fill = n; });
      if (fill < 0) inner.push(p); else painted.push([p, fill]);
    }
    if (!painted.length) break;
    for (const [p, fill] of painted) out.copyWithin(p * 4, fill * 4, fill * 4 + 4);
    for (const [p] of painted) pending[p] = 0;
    layer = inner;
  }
  return out;
}

/** Dark gray pixels within `FRINGE_REACH` of the given ink, nearest first; O(pixels). */
function fringeOf(data, size, ink, taken) {
  const isFringe = p => isOpaque(data, p) && FRINGE.has(pack(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])), fringe = [];
  let edge = ink.map(p => [p, p]);
  for (let step = 0; step < FRINGE_REACH && edge.length; step++) {
    const next = [];
    for (const [p, source] of edge) eightNeighbours(p, size, n => { if (!taken[n] && isFringe(n)) { taken[n] = 1; next.push([n, source]); } });
    fringe.push(...next);
    edge = next;
  }
  return fringe;
}

/**
 * The source's ink fades through dark gray, which shows as gray dashes on the app's dark
 * canvas. Within `FRINGE_REACH`, the soft edge of a facial mark dissolves into the fill around
 * it and the soft edge of the outline joins the outline; gray farther in is a drawn surface.
 */
export function inkFringe(data, size) {
  const total = size * size, taken = new Uint8Array(total), markInk = enclosedMarks(data, size).flatMap(mark => mark.pixels), outline = [];
  for (const p of markInk) taken[p] = 1;
  for (let p = 0; p < total; p++) if (isInk(data, p) && !taken[p]) { taken[p] = 1; outline.push(p); }
  const out = paintedOver(data, size, fringeOf(data, size, markInk, taken).map(([p]) => p));
  for (const [p, source] of fringeOf(data, size, outline, taken)) data.copy(out, p * 4, source * 4, source * 4 + 4);
  return out;
}

/** Ink components drawn inside a fill and small enough to be one facial mark; O(pixels). */
function enclosedMarks(data, size) {
  const total = size * size, ink = new Uint8Array(total), seen = new Uint8Array(total), marks = [];
  for (let p = 0; p < total; p++) if (isInk(data, p)) ink[p] = 1;
  for (let start = 0; start < total; start++) {
    if (!ink[start] || seen[start]) continue;
    const pixels = floodGroup(start, ink, seen, size);
    let x0 = size, y0 = size, x1 = 0, y1 = 0, enclosed = true;
    for (const p of pixels) {
      const x = p % size, y = (p - x) / size;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      eightNeighbours(p, size, n => { if (!isOpaque(data, n)) enclosed = false; });
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, insideCell = x0 > 0 && y0 > 0 && x1 < size - 1 && y1 < size - 1;
    if (enclosed && insideCell && Math.max(w, h) <= size * MARK_SPAN_SHARE) marks.push({ pixels, x0, y0, w, h, rgb: [...data.subarray(start * 4, start * 4 + 3)] });
  }
  return marks;
}

/** The share of each cell that the mark covers when its bounding box is cut into W×H cells. */
function markCover(mark, W, H, size) {
  const cover = new Float32Array(W * H), cellW = new Uint16Array(W), cellH = new Uint16Array(H);
  const column = x => Math.min(W - 1, Math.floor(x * W / mark.w)), row = y => Math.min(H - 1, Math.floor(y * H / mark.h));
  for (let x = 0; x < mark.w; x++) cellW[column(x)]++;
  for (let y = 0; y < mark.h; y++) cellH[row(y)]++;
  for (const p of mark.pixels) { const x = p % size, y = (p - x) / size; cover[row(y - mark.y0) * W + column(x - mark.x0)]++; }
  return cover.map((count, cell) => count / (cellW[cell % W] * cellH[(cell - cell % W) / W] || 1));
}

/** A cell is drawn when the mark covers half of it; the fullest cell is always drawn. */
function drawnCells(cover) {
  const cells = Uint8Array.from(cover, share => share >= 0.5);
  if (!cells.includes(1)) cells[cover.indexOf(Math.max(...cover))] = 1;
  return cells;
}

/** Pixels only one of two marks has once their boxes are centred on each other; O(mark pixels). */
function unsharedPixels(a, b, size) {
  const key = (mark, p, dx, dy) => ((p - p % size) / size - mark.y0 + dy + TWIN_TOLERANCE) * size + p % size - mark.x0 + dx + TWIN_TOLERANCE;
  const first = new Set(a.pixels.map(p => key(a, p, 0, 0))), dx = Math.round((a.w - b.w) / 2), dy = Math.round((a.h - b.h) / 2);
  const shared = b.pixels.filter(p => first.has(key(b, p, dx, dy))).length;
  return a.pixels.length + b.pixels.length - 2 * shared;
}

/**
 * Each mark reduces to its own size, never by where it sits; a size exactly between two takes
 * the smaller, which keeps the gap beside it. Marks of one reduced size that match the largest
 * of them are one drawing made twice and share its pixels. O(marks² × mark pixels), few marks.
 */
function reducedMarks(marks, size, factor) {
  const reduced = length => Math.max(1, Math.ceil(length / factor - 0.5)), grouped = new Set();
  const sameDrawing = (a, b) => reduced(a.w) === reduced(b.w) && reduced(a.h) === reduced(b.h)
    && Math.abs(a.w - b.w) <= TWIN_TOLERANCE && Math.abs(a.h - b.h) <= TWIN_TOLERANCE
    && unsharedPixels(a, b, size) <= Math.min(a.pixels.length, b.pixels.length) * TWIN_UNSHARED_SHARE;
  return [...marks].sort((a, b) => b.pixels.length - a.pixels.length).flatMap(largest => {
    if (grouped.has(largest)) return [];
    const members = marks.filter(mark => !grouped.has(mark) && (mark === largest || sameDrawing(largest, mark)));
    for (const mark of members) grouped.add(mark);
    const W = reduced(largest.w), H = reduced(largest.h), pooled = new Float32Array(W * H);
    for (const mark of members) markCover(mark, W, H, size).forEach((share, cell) => { pooled[cell] += share / members.length; });
    const cells = drawnCells(pooled), centre = (start, length) => (start + length / 2 - SAMPLE_BIAS) / factor;
    return members.map(mark => ({ W, H, cells, rgb: largest.rgb, left: centre(mark.x0, mark.w) - W / 2, top: centre(mark.y0, mark.h) - H / 2 }));
  });
}

/**
 * Draws the reduced marks, largest first. A mark takes the place within `MARK_NUDGE` that
 * covers and touches the least other ink, then the nearest; a crowded face can leave none
 * clear. O(pixels + mark cells).
 */
function stampMarks(out, size, stamps) {
  const inked = new Uint8Array(size * size);
  for (let p = 0; p < size * size; p++) if (isInk(out, p)) inked[p] = 1;
  const cellsAt = (stamp, [left, top]) => {
    const cells = [];
    for (let y = 0; y < stamp.H; y++) for (let x = 0; x < stamp.W; x++) {
      const xx = left + x, yy = top + y;
      if (stamp.cells[y * stamp.W + x] && xx >= 0 && yy >= 0 && xx < size && yy < size) cells.push(yy * size + xx);
    }
    return cells;
  };
  const clash = cells => cells.reduce((sum, p) => {
    let touching = 0;
    eightNeighbours(p, size, n => { touching += inked[n]; });
    return sum + (isOpaque(out, p) && !inked[p] ? 0 : size * size) + touching;
  }, 0);
  const cellCount = stamp => stamp.cells.reduce((sum, cell) => sum + cell, 0);
  for (const stamp of [...stamps].sort((a, b) => cellCount(b) - cellCount(a))) {
    const left = Math.round(stamp.left), top = Math.round(stamp.top), places = [];
    for (let dy = -MARK_NUDGE; dy <= MARK_NUDGE; dy++) for (let dx = -MARK_NUDGE; dx <= MARK_NUDGE; dx++) places.push([left + dx, top + dy]);
    const drift = ([x, y]) => (x - stamp.left) ** 2 + (y - stamp.top) ** 2;
    const ranked = places.map(place => ({ place, clash: clash(cellsAt(stamp, place)), drift: drift(place) })).sort((a, b) => a.clash - b.clash || a.drift - b.drift);
    for (const p of cellsAt(stamp, ranked[0].place)) { inked[p] = 1; out.set([...stamp.rgb, 255], p * 4); }
  }
}

/**
 * A one-pixel stroke can lose every block it crosses to the fill beside it. A stroke that
 * crosses a block and reached neither neighbouring block is kept; O(pixels).
 */
function keepThinStrokes(out, base, size, drawn) {
  const half = size / 2, crossesRows = new Uint8Array(half * half), crossesColumns = new Uint8Array(half * half), from = new Int32Array(half * half);
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const block = y * half + x, topLeft = 2 * y * size + 2 * x, topRight = topLeft + 1, bottomLeft = topLeft + size;
    if (drawn(out, block)) continue;
    const a = drawn(base, topLeft), b = drawn(base, topRight), c = drawn(base, bottomLeft), count = a + b + c;
    if ((a || b) && c) crossesRows[block] = count;
    if ((a || c) && b) crossesColumns[block] = count;
    from[block] = c ? bottomLeft : b ? topRight : topLeft;
  }
  const kept = [];
  const lost = (crosses, block, before, after) => {
    const reached = n => n >= 0 && drawn(out, n);
    return crosses[block] > 0 && !reached(before) && !reached(after)
      && !(before >= 0 && crosses[before] >= crosses[block]) && !(after >= 0 && crosses[after] > crosses[block]);
  };
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const block = y * half + x;
    if (lost(crossesRows, block, x > 0 ? block - 1 : -1, x + 1 < half ? block + 1 : -1)
      || lost(crossesColumns, block, y > 0 ? block - half : -1, y + 1 < half ? block + half : -1)) kept.push(block);
  }
  for (const block of kept) base.copy(out, block * 4, from[block] * 4, from[block] * 4 + 4);
}

/** One halving, O(pixels): each 2×2 block becomes the pixel at one fixed corner, so a run of n becomes n/2. */
function halveMoru(base, size, corner) {
  const half = size / 2, out = Buffer.alloc(half * half * 4);
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const sampled = ((2 * y + corner) * size + 2 * x + corner) * 4;
    base.copy(out, (y * half + x) * 4, sampled, sampled + 4);
  }
  return out;
}

/**
 * Reduces a frame by a power of two. Earlier halvings sample the top-left pixel and the last
 * the bottom-right, which lands `SAMPLE_BIAS` from the centre; an upright or level stroke half
 * an exported pixel wide keeps one pixel. Marks are lifted out and drawn back at their own size.
 */
export function reduceMoru(data, from, to) {
  const factor = from / to;
  if (!Number.isInteger(to) || factor < 1 || !Number.isInteger(Math.log2(factor))) throw new Error(`Moru reduces by halving: ${from}px cannot become ${to}px`);
  if (factor === 1) return Buffer.from(data);
  const marks = enclosedMarks(data, from);
  let frame = paintedOver(data, from, marks.flatMap(mark => mark.pixels));
  for (let size = from; size > to; size /= 2) {
    const last = size === to * 2, halved = halveMoru(frame, size, last ? 1 : 0);
    if (last) for (const drawn of [isInk, isOpaque]) keepThinStrokes(halved, frame, size, drawn);
    frame = halved;
  }
  stampMarks(frame, to, reducedMarks(marks, from, factor));
  return frame;
}

/**
 * Outline ink is 1.14:1 on the app's canvas and reads only beside a fill. Ink touching no fill,
 * or past `FILL_REACH` of the fill it is attached to, turns indigo. A detached piece under
 * `CRUMB_AREA` is removed; an attached far tip that small stays outline. O(pixels).
 */
export function liftFreeInk(data, size) {
  const total = size * size, ink = new Uint8Array(total), near = new Uint8Array(total), free = new Uint8Array(total);
  let frontier = [];
  for (let p = 0; p < total; p++) {
    if (!isOpaque(data, p)) continue;
    if (isInk(data, p)) ink[p] = 1;
    else { near[p] = 1; frontier.push(p); }
  }
  for (let step = 0; step < FILL_REACH && frontier.length; step++) {
    const next = [];
    for (const p of frontier) eightNeighbours(p, size, n => { if (!near[n]) { near[n] = 1; next.push(n); } });
    frontier = next;
  }
  const out = Buffer.from(data), seen = new Uint8Array(total);
  for (let start = 0; start < total; start++) {
    if (!ink[start] || seen[start]) continue;
    const stroke = floodGroup(start, ink, seen, size);
    let attached = false;
    for (const p of stroke) eightNeighbours(p, size, n => { if (!ink[n] && isOpaque(data, n)) attached = true; });
    if (!attached && stroke.length < CRUMB_AREA) { for (const p of stroke) out.fill(0, p * 4, p * 4 + 4); continue; }
    for (const p of stroke) if (!attached || !near[p]) free[p] = 1;
  }
  seen.fill(0);
  for (let start = 0; start < total; start++) {
    if (!free[start] || seen[start]) continue;
    const piece = floodGroup(start, free, seen, size);
    if (piece.length >= CRUMB_AREA) for (const p of piece) out.set(FREE_INK, p * 4);
  }
  return out;
}

async function cell(source, columns, rows, index, size, alphaCutoff = 240, accents = []) {
  const file = join(ROOT, source), meta = await sharp(file).metadata();
  const left = Math.round(index % columns * meta.width / columns);
  const top = Math.round(Math.floor(index / columns) * meta.height / rows);
  const right = Math.round((index % columns + 1) * meta.width / columns);
  const bottom = Math.round((Math.floor(index / columns) + 1) * meta.height / rows);
  const data = await sharp(file).extract({ left, top, width: right - left, height: bottom - top }).resize(size, size, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaCutoff) { data.fill(0, i, i + 4); continue; }
    const color = moruColor(data[i], data[i + 1], data[i + 2], accents);
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
  }
  return data;
}

async function strip(frames, size) {
  return sharp({ create: { width: size * frames.length, height: size, channels: 4, background: '#00000000' } })
    .composite(await Promise.all(frames.map(async (frame, i) => ({ input: await png(frame, size), left: i * size, top: 0 })))).png().toBuffer();
}

/** Red channel above both dark grays (`555451`, `777572`) and below every skin fill. */
const DARK_GRAY_RED = 160;

export function moruBodyAnchor(data, size) {
  // Light warm fills only: the dark grays also shade props and floor lines, which are not body.
  const isBody = p => data[p * 4 + 3] && data[p * 4] > DARK_GRAY_RED && data[p * 4 + 2] <= data[p * 4] + 30;
  const seen = new Uint8Array(size * size), queue = new Uint32Array(size * size);
  let largest;
  for (let pixel = 0; pixel < seen.length; pixel++) {
    if (seen[pixel] || !isBody(pixel)) continue;
    let head = 0, tail = 1, x0 = size, x1 = 0, bottom = 0; queue[0] = pixel; seen[pixel] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % size, y = Math.floor(p / size);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); bottom = Math.max(bottom, y + 1);
      for (const n of [x > 0 ? p - 1 : -1, x + 1 < size ? p + 1 : -1, y > 0 ? p - size : -1, y + 1 < size ? p + size : -1]) {
        if (n >= 0 && !seen[n] && isBody(n)) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    if (!largest || tail > largest.area) largest = { area: tail, centerX: (x0 + x1 + 1) / 2, bottom };
  }
  if (!largest) throw new Error('Moru silhouette is empty');
  return largest;
}

function registerBody(frame, reference, size, airborneOrigin, scaleReference) {
  const from = moruBodyAnchor(frame, size), to = moruBodyAnchor(reference, size);
  const origin = airborneOrigin ? moruBodyAnchor(airborneOrigin, size) : from;
  const scale = Math.sqrt(to.area / (scaleReference ? moruBodyAnchor(scaleReference, size).area : origin.area));
  const dy = airborneOrigin ? (from.bottom - origin.bottom) * scale : 0;
  const out = Buffer.alloc(frame.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xx = Math.round((x - to.centerX) / scale + from.centerX), yy = Math.round((y - to.bottom - dy) / scale + from.bottom);
    if (xx >= 0 && yy >= 0 && xx < size && yy < size) frame.copy(out, (y * size + x) * 4, (yy * size + xx) * 4, (yy * size + xx) * 4 + 4);
  }
  const box = bounds(out, size);
  if (box[0] === 0 || box[1] === 0 || box[2] === size || box[3] === size) throw new Error(`Registered Moru touches cell edge: bounds=${box}, scale=${scale.toFixed(3)}, area=${from.area}/${to.area}`);
  return out;
}

export async function buildMoru() {
  const spec = JSON.parse(await readFile(join(ROOT, 'moru-source.json'), 'utf8'));
  const clips = {}, framesBySize = { 64: {}, 128: {} };
  const size = WORK;
  let neutral;
  for (const clip of spec.authored) {
    const count = clip.frames;
    if (!Number.isInteger(count) || count < 2 || clip.durationsMs.length !== count || clip.offset + count > clip.columns * clip.rows || clip.durationsMs.some(ms => !Number.isFinite(ms) || ms <= 0)) throw new Error(`${clip.id} must declare a valid grid of timed source poses`);
    const accents = (clip.accents ?? []).map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
    let frames = await Promise.all(Array.from({ length: count }, (_, i) => cell(clip.source, clip.columns, clip.rows, clip.offset + i, size, clip.alphaCutoff ?? CLIP_ALPHA_CUTOFF, accents)));
    // A scene keeps one fixed camera; reserve an equal transparent inset for its props.
    if (clip.sceneInset) {
      const inset = Math.round(size * clip.sceneInset);
      frames = await Promise.all(frames.map(f => raw(f, size).resize(size - 2 * inset, size - 2 * inset, { kernel: 'nearest' }).extend({ left: inset, right: inset, top: inset, bottom: inset, background: '#00000000' }).raw().toBuffer()));
    }
    const anchor = Math.round(size * 0.78);
    if (!neutral) {
      const fit = size * 7 / 8, inset = (size - fit) / 2;
      const padded = await raw(frames[0], size).resize(fit, fit, { kernel: 'nearest' }).extend({ left: inset, right: inset, top: 0, bottom: size - fit, background: '#00000000' }).raw().toBuffer();
      neutral = translate(padded, size, 0, anchor - bounds(padded, size)[3]);
    }
    const reference = clip.scene ? frames[0] : neutral;
    frames = frames.map((f, i) => {
      if (i === 0 || i === count - 1) return reference;
      try { return clip.scene ? f : registerBody(f, reference, size, clip.airborne ? frames[0] : undefined, clip.preserveScale ? frames[0] : undefined); }
      catch (error) { throw new Error(`${clip.id} frame ${i + 1}: ${error.message}`); }
    }).map(f => inkFringe(liftFreeInk(despeckle(f, size), size), size));
    for (const exported of [64, 128]) framesBySize[exported][clip.id] = frames.map((f, i) => {
      const reduced = reduceMoru(f, size, exported);
      let shaved = 0;
      for (let p = 0; p < exported * exported; p++) {
        const x = p % exported, y = (p - x) / exported;
        if ((!x || !y || x === exported - 1 || y === exported - 1) && reduced[p * 4 + 3]) { reduced.fill(0, p * 4, p * 4 + 4); shaved++; }
      }
      if (shaved > EDGE_SLIVER) throw new Error(`${clip.id} frame ${i + 1} is clipped by the ${exported}px cell edge: ${shaved} pixels`);
      return reduced;
    });
  }
  for (const exported of [64, 128]) for (const clip of spec.compositions) {
    const [a, b] = clip.sequence.map(id => framesBySize[exported][id]);
    if (!a || !b) throw new Error(`Missing constituent in ${clip.id}`);
    framesBySize[exported][clip.id] = [...a, ...b.slice(1)];
  }
  for (const clip of [...spec.authored, ...spec.compositions]) {
    const authored = !clip.sequence, group = authored ? 'authored' : 'composed';
    const frames = framesBySize[128][clip.id];
    const durations = authored ? clip.durationsMs : (() => {
      const [a, b] = clip.sequence.map(id => spec.authored.find(source => source.id === id).durationsMs);
      return [...a.slice(0, -1), 400, ...b.slice(1)];
    })();
    for (const size of [64, 128]) await put(join(ROOT, `sprites/${size}/${group}/moru-${clip.id}.png`), await strip(framesBySize[size][clip.id], size));
    const enlarged = await Promise.all(frames.map(frame => raw(frame, 128).resize(256, 256, { kernel: 'nearest' }).raw().toBuffer()));
    const animation = raw(Buffer.concat(enlarged), 256, frames.length);
    await put(join(ROOT, `animated/gif/${group}/moru-${clip.id}.gif`), await animation.clone().gif({ delay: durations, loop: 0, dither: 0, effort: 7, keepDuplicateFrames: true }).toBuffer());
    await put(join(ROOT, `animated/webp/${group}/moru-${clip.id}.webp`), await animation.clone().webp({ delay: durations, loop: 0, lossless: true, effort: 6 }).toBuffer());
    clips[clip.id] = { label: clip.label, context: clip.context ?? `Catalogue sequence: ${clip.sequence.join(' → ')}. Runtime requires each corresponding observed event.`, kind: group, scene: clip.scene ?? false, source: clip.source ?? null, constituents: clip.sequence ?? [], sprite: `sprites/128/${group}/moru-${clip.id}.png`, sprite64: `sprites/64/${group}/moru-${clip.id}.png`, gif: `animated/gif/${group}/moru-${clip.id}.gif`, webp: `animated/webp/${group}/moru-${clip.id}.webp`, cell: 128, frames: frames.length, durationsMs: durations };
  }
  const poses = {};
  for (let i = 0; i < spec.poses.names.length; i++) {
    const name = spec.poses.names[i], size = i === 15 ? 16 : i === 14 ? 32 : 128;
    const source = spec.poses.overrides?.[name] ?? { source: spec.poses.source, columns: 4, rows: 4, index: i };
    let frame = await cell(source.source, source.columns, source.rows, source.index, size);
    const box = bounds(frame, size);
    frame = translate(frame, size, Math.floor((size - (box[2] - box[0])) / 2) - box[0], Math.floor((size - (box[3] - box[1])) / 2) - box[1]);
    await put(join(ROOT, `poses/moru-${name}.png`), await png(frame, size));
    poses[name] = { path: `poses/moru-${name}.png`, nativeSize: size, source: source.source, cellIndex: source.index };
  }
  await put(join(ROOT, 'moru-poses-showcase.png'), await sharp({ create: { width: 640, height: 640, channels: 4, background: '#00000000' } }).composite(await Promise.all(Object.values(poses).map(async (pose, i) => ({ input: await sharp(join(ROOT, pose.path)).resize(128, 128, { kernel: 'nearest' }).png().toBuffer(), left: i % 4 * 160 + 16, top: Math.floor(i / 4) * 160 + 16 })))).png().toBuffer());
  for (const size of [64, 128]) {
    let neutral = framesBySize[size].blink[0], box = bounds(neutral, size);
    neutral = translate(neutral, size, Math.floor((size - box[2] + box[0]) / 2) - box[0], Math.floor((size - box[3] + box[1]) / 2) - box[1]);
    await put(join(ROOT, `moru-full-${size}.png`), await png(neutral, size));
  }
  await put(join(ROOT, 'moru-full-512.png'), await sharp(join(ROOT, 'moru-full-128.png')).resize(512, 512, { kernel: 'nearest' }).png().toBuffer());
  const canonical = 'assets/brand/mascot';
  for (const [name, source] of Object.entries({ 'full-64': 'moru-full-64.png', 'presentation-128': 'moru-full-128.png', 'compact-32': poses['compact-portrait'].path, 'micro-16': poses['micro-portrait'].path })) await put(`${canonical}/mascot-${name}.png`, await readFile(join(ROOT, source)));
  await put(`${canonical}/mascot-welcome-32.png`, await readFile(join(ROOT, poses['compact-portrait'].path)));
  // A tilted full body has no readable face at 32px, so the missing page shows the native pose.
  await put(`${canonical}/mascot-curious-128.png`, await readFile(join(ROOT, poses['tilt-right'].path)));
  for (const [state, id] of Object.entries({ walk: 'wave', read: 'source-read', success: 'dance', waiting: 'blink', connect: 'connect', compile: 'source-read', greeting: 'wave' })) await put(`${canonical}/mascot-${state}-row-64.png`, await strip(framesBySize[64][id], 64));
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) await put(join(ROOT, `icons/atlas-compass-${size}.png`), await sharp(join(ROOT, spec.compass)).resize(size, size).png().toBuffer());
  const proof = [];
  for (const [row, background] of ['#171923', '#fff8ed'].entries()) {
    for (const [column, size] of [16, 24, 32, 48, 64, 128].entries()) {
      const x = 12 + column * 142, y = 12 + row * 180;
      proof.push({ input: await readFile(join(ROOT, `icons/atlas-compass-${size}.png`)), left: x + Math.floor((128 - size) / 2), top: y + Math.floor((128 - size) / 2) });
      proof.push({ input: Buffer.from(`<svg width="128" height="24"><text x="64" y="17" text-anchor="middle" font-family="sans-serif" font-size="13" fill="${row ? '#171923' : '#fff1d7'}">${size}px</text></svg>`), left: x, top: y + 132 });
    }
    proof.unshift({ input: await sharp({ create: { width: 864, height: 180, channels: 4, background } }).png().toBuffer(), left: 0, top: row * 180 });
  }
  await put(join(ROOT, 'icons/compass-size-proof.png'), await sharp({ create: { width: 864, height: 360, channels: 4, background: '#00000000' } }).composite(proof).png().toBuffer());
  // A monochrome compass silhouette is the system-tinted macOS menu-bar template.
  for (const size of [16, 32]) {
    const data = await sharp(join(ROOT, spec.compass)).resize(16, 16).ensureAlpha().raw().toBuffer();
    for (let i = 0; i < data.length; i += 4) { const visible = data[i] > 100 && data[i + 3] > 200; data.fill(0, i, i + 3); data[i + 3] = visible ? 255 : 0; }
    await put(`${canonical}/mascot-tray-template-${size}.png`, await raw(data, 16).resize(size, size, { kernel: 'nearest' }).png().toBuffer());
  }
  const manifest = { name: 'Moru', version: spec.version, nativeCell: 128, palette: [...new Set([...COLORS, ...spec.authored.flatMap(c => c.accents ?? [])])].map(x => `#${x}`), clips, poses, compass: 'icons/atlas-compass-1024.png', runtime: { greeting: 'wave', waiting: 'blink', connect: 'connect', compile: 'source-read', walk: 'wave', read: 'source-read', success: 'dance' }, scope: 'Local design catalogue. Only explicitly mapped and observed runtime states play in the app; no animation grants approval or accepts meaning.' };
  await put(join(ROOT, 'moru.json'), JSON.stringify(manifest, null, 2) + '\n');
  await put(join(ROOT, 'preview-data.js'), `globalThis.moruManifest = ${JSON.stringify(manifest)};\n`);
  await buildMoruCompanion();
  console.log(`[moru] ${spec.authored.length} authored clips + ${spec.compositions.length} compositions; ${Object.keys(poses).length} poses; compass 16–1024px`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildMoru();
