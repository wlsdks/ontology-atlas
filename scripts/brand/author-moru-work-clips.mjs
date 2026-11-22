/**
 * Draws the work-status clips in code and writes their source sheets. Every pose is built from the
 * catalogue's own neutral pose: its body, face and flippers are cut apart once, then posed, and
 * props are the pixel maps typed in `moru-work-clips.mjs`. No image is generated and nothing outside
 * the pack is read.
 *
 *   pnpm brand:work-clips                    writes source/motion-v10 and the manifest entries
 *   pnpm brand:work-clips --frames <dir>     also writes each pose as a PNG for review
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { moruWorkGrid } from './build-moru-sprites.mjs';
import { WORK_CLIPS } from './moru-work-clips.mjs';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const ROOT = 'assets/brand/moru';
const SHEETS = 'source/motion-v10';
const COLUMNS = 4;

const PALETTE = ['171923', '17192d', '50569c', '6d73d2', '555451', '777572', '99968f', 'aaa9a5', 'b8b4aa', 'd6d3c9', 'fff1d7', '9399e5'];
const [INK, MUTED, INDIGO, GRAY, STONE, IVORY] = [1, 3, 4, 6, 10, 11];
const RGB = PALETTE.map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
const isSkin = colour => colour === STONE || colour === IVORY;
const isInk = colour => colour === 1 || colour === 2;
const isIndigo = colour => colour === MUTED || colour === INDIGO || colour === 12;

/** Work pixels along one side of a pixel as Moru's source drew it; its outline is this thick. */
const DRAWN = 5;
/** The share of a turn that a mark on the far side of the face makes. */
const FAR_SIDE = 0.6;
/** Work pixels a part moves by, so a move is a whole pixel at 128px. */
const STEP = 2;
const snap = value => Math.round(value / STEP) * STEP;

function indexed(rgba, size) {
  const out = new Uint8Array(size * size);
  for (let p = 0; p < out.length; p++) {
    if (!rgba[p * 4 + 3]) continue;
    const colour = RGB.findIndex(c => c[0] === rgba[p * 4] && c[1] === rgba[p * 4 + 1] && c[2] === rgba[p * 4 + 2]);
    if (colour < 0) throw new Error(`pose holds a colour outside Moru's palette at ${p % size},${Math.floor(p / size)}`);
    out[p] = colour + 1;
  }
  return out;
}

function rgbaOf(canvas) {
  const out = Buffer.alloc(canvas.length * 4);
  for (let p = 0; p < canvas.length; p++) if (canvas[p]) out.set([...RGB[canvas[p] - 1], 255], p * 4);
  return out;
}

/** Connected pieces of the pixels `member` accepts; side-connected unless `corners`. O(pixels). */
function pieces(canvas, size, member, corners = false) {
  const seen = new Uint8Array(canvas.length), found = [];
  for (let start = 0; start < canvas.length; start++) {
    if (seen[start] || !member(canvas[start])) continue;
    const piece = [start];
    seen[start] = 1;
    for (let i = 0; i < piece.length; i++) {
      const p = piece[i], x = p % size, y = (p - x) / size;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!(dx || dy) || !corners && dx && dy) continue;
        const xx = x + dx, yy = y + dy, n = yy * size + xx;
        if (xx >= 0 && yy >= 0 && xx < size && yy < size && !seen[n] && member(canvas[n])) { seen[n] = 1; piece.push(n); }
      }
    }
    found.push(piece);
  }
  return found;
}

function boxOf(pixels, size) {
  let x0 = size, y0 = size, x1 = 0, y1 = 0;
  for (const p of pixels) { const x = p % size, y = (p - x) / size; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}

/** Pixels within `reach` of the mask by sides and corners, with the far corners cut as the source cuts them. */
function grown(mask, size, reach) {
  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const x = p % size, y = (p - x) / size;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const xx = x + dx, yy = y + dy;
      if (Math.abs(dx) + Math.abs(dy) <= reach * 1.6 && xx >= 0 && yy >= 0 && xx < size && yy < size) out[yy * size + xx] = 1;
    }
  }
  return out;
}

/** A cut-out part: its pixels in a box, and where the box sat in the neutral pose. */
function spriteOf(pixels, colourAt, size) {
  const box = boxOf(pixels, size), data = new Uint8Array(box.w * box.h);
  for (const p of pixels) data[(Math.floor(p / size) - box.y0) * box.w + p % size - box.x0] = colourAt(p);
  return { ...box, data };
}

/** A filled shape with Moru's outline round it. */
function outlined(fill, w, h, reach = DRAWN) {
  const pad = reach, W = w + 2 * pad, H = h + 2 * pad, data = new Uint8Array(W * H), mask = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fill[y * w + x]) { data[(y + pad) * W + x + pad] = fill[y * w + x]; mask[(y + pad) * W + x + pad] = 1; }
  const ring = growBox(mask, W, H, reach);
  for (let p = 0; p < data.length; p++) if (ring[p] && !mask[p]) data[p] = INK;
  return { data, w: W, h: H, pad };
}

function growBox(mask, W, H, reach) {
  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const x = p % W, y = (p - x) / W;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const xx = x + dx, yy = y + dy;
      if (Math.abs(dx) + Math.abs(dy) <= reach * 1.6 && xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
    }
  }
  return out;
}

/**
 * A pixel map typed as rows of characters, each character one square of `unit` work pixels.
 * `key` maps a character to a palette colour; a space is clear. With `ring`, the outline is added.
 */
function pixelMap(rows, key, unit, ring = 0) {
  const w = Math.max(...rows.map(row => row.length)) * unit, h = rows.length * unit, fill = new Uint8Array(w * h);
  rows.forEach((row, r) => [...row].forEach((char, c) => {
    const colour = key[char];
    if (char !== ' ' && colour === undefined) throw new Error(`pixel map uses an undeclared character "${char}"`);
    if (colour) for (let y = 0; y < unit; y++) for (let x = 0; x < unit; x++) fill[(r * unit + y) * w + c * unit + x] = colour;
  }));
  return ring ? outlined(fill, w, h, ring) : { data: fill, w, h, pad: 0 };
}

/**
 * Cuts the neutral pose into a bare torso (body and tail, no face, no flippers), the facial marks
 * and the two front flippers. Where a flipper hid the belly, the belly is continued to its floor.
 */
function cutNeutral(neutral, size) {
  const N = indexed(neutral, size);
  const body = pieces(N, size, isSkin).reduce((a, b) => b.length > a.length ? b : a);
  const inBody = new Uint8Array(N.length);
  for (const p of body) inBody[p] = 1;
  const enclosed = pieces(N, size, isInk, true).filter(piece => {
    const box = boxOf(piece, size);
    return Math.max(box.w, box.h) <= size * 5 / 32 && piece.every(p => {
      const x = p % size, y = (p - x) / size;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!N[(y + dy) * size + x + dx]) return false;
      return true;
    });
  }).map(piece => ({ piece, box: boxOf(piece, size) }));
  const indigo = pieces(N, size, isIndigo, true).filter(piece => piece.length > 200).map(piece => ({ piece, box: boxOf(piece, size) })).sort((a, b) => a.box.x0 - b.box.x0);
  if (indigo.length !== 3) throw new Error(`the neutral pose should hold a tail and two flippers, found ${indigo.length} indigo parts`);
  const [, left, right] = indigo;
  const face = enclosed.filter(mark => mark.box.y1 < left.box.y0 - DRAWN);
  const eyes = face.filter(mark => mark.box.h >= 14 && mark.box.w <= 12).sort((a, b) => a.box.x0 - b.box.x0);
  const nose = face.find(mark => mark.box.w >= 12 && mark.box.h >= 10);
  const whiskers = face.filter(mark => mark.box.h <= 6);
  if (eyes.length !== 2 || !nose || whiskers.length !== 4) throw new Error('the neutral pose should show two eyes, a nose and four whiskers');

  const bare = Uint8Array.from(N);
  // Each facial mark takes the fill nearest to it, layer by layer from its edge inward.
  const pending = new Uint8Array(N.length);
  for (const mark of face) for (const p of mark.piece) { pending[p] = 1; inBody[p] = 1; }
  for (let layer = face.flatMap(mark => mark.piece); layer.length;) {
    const painted = [], inner = [];
    for (const p of layer) {
      const near = [p - 1, p + 1, p - size, p + size].find(n => !pending[n] && isSkin(bare[n]));
      if (near === undefined) inner.push(p); else painted.push([p, bare[near]]);
    }
    if (!painted.length) throw new Error('a facial mark has no fill beside it');
    for (const [p, colour] of painted) { bare[p] = colour; pending[p] = 0; }
    layer = inner;
  }

  const flippers = [left, right].map(({ piece, box }) => {
    const fill = new Uint8Array(N.length);
    for (const p of piece) fill[p] = 1;
    // The outline is a pixel or two thicker in places, so the cut reaches that much further.
    const near = grown(fill, size, DRAWN + 2), pixels = [];
    for (let p = 0; p < N.length; p++) if (fill[p] || near[p] && isInk(N[p])) pixels.push(p);
    const shape = new Uint8Array(box.w * box.h);
    for (const p of piece) shape[(Math.floor(p / size) - box.y0) * box.w + p % size - box.x0] = N[p];
    return { fill, rest: spriteOf(pixels, p => N[p], size), box, loose: { ...outlined(shape, box.w, box.h), x0: box.x0 - DRAWN, y0: box.y0 - DRAWN } };
  });

  // The belly behind the flippers: its sides carry straight down from above them and round into a level floor.
  const top = Math.min(left.box.y0, right.box.y0) - DRAWN, rowLeft = y => { for (let x = 0; x < size; x++) if (inBody[y * size + x]) return x; return size; };
  const rowRight = y => { for (let x = size - 1; x >= 0; x--) if (inBody[y * size + x]) return x; return -1; };
  let floor = 0;
  for (let x = left.box.x1 + DRAWN + 1; x < right.box.x0 - DRAWN; x++) for (let y = size - 1; y > floor; y--) if (inBody[y * size + x]) floor = y;
  let firstIvory = rowLeft(top - 1);
  while (bare[(top - 1) * size + firstIvory] !== IVORY) firstIvory++;
  const hidden = new Uint8Array(N.length);
  for (const flipper of flippers) for (const p of flipper.rest.data.keys()) if (flipper.rest.data[p]) hidden[(flipper.rest.y0 + Math.floor(p / flipper.rest.w)) * size + flipper.rest.x0 + p % flipper.rest.w] = 1;
  let wallLeft = rowLeft(top - 1);
  const wallRight = rowRight(top - 1);
  for (let y = top; y <= floor; y++) {
    if (rowLeft(y) <= wallLeft + DRAWN) wallLeft = Math.min(wallLeft, rowLeft(y));
    // The corners round as the catalogue's belly does when Moru is off the floor, the flank under the face less than the tail side.
    const band = Math.floor((floor - y) / DRAWN), roundLeft = DRAWN * ([5, 3, 2, 1][band] ?? 0), roundRight = DRAWN * ([3, 2, 2, 1][band] ?? 0);
    for (let x = wallLeft + roundLeft; x <= wallRight - roundRight; x++) {
      const p = y * size + x;
      if (!inBody[p] && (hidden[p] || isInk(bare[p]))) { bare[p] = x >= firstIvory ? IVORY : STONE; inBody[p] = 1; hidden[p] = 1; }
    }
  }
  for (let p = 0; p < N.length; p++) if (hidden[p] && !inBody[p]) bare[p] = 0;
  const ring = grown(inBody, size, DRAWN);
  for (let p = 0; p < N.length; p++) if (hidden[p] && !inBody[p] && ring[p]) bare[p] = INK;

  // Which fill a body pixel would show wherever the face is slid to: every pixel knows its nearest body fill.
  const ivory = new Int8Array(N.length).fill(-1);
  let edge = [];
  for (let p = 0; p < N.length; p++) if (inBody[p]) { ivory[p] = bare[p] === IVORY ? 1 : 0; edge.push(p); }
  while (edge.length) {
    const next = [];
    for (const p of edge) {
      const x = p % size;
      for (const n of [x > 0 ? p - 1 : -1, x + 1 < size ? p + 1 : -1, p - size, p + size]) if (n >= 0 && n < N.length && ivory[n] < 0) { ivory[n] = ivory[p]; next.push(n); }
    }
    edge = next;
  }
  const bodyBox = boxOf(body, size), eye = spriteOf(eyes[0].piece, () => INK, size);
  const crown = body.filter(p => Math.floor(p / size) === bodyBox.y0).map(p => p % size);
  return {
    size, bare, inBody, ivory, bodyBox, floor: floor + DRAWN + 1, centre: snap(bodyBox.cx), eye,
    eyes: eyes.map(mark => ({ x: mark.box.cx, y: mark.box.cy })),
    nose: { ...spriteOf(nose.piece, () => INK, size), x: nose.box.cx, y: nose.box.cy },
    whiskers: whiskers.map(mark => ({ ...spriteOf(mark.piece, () => INK, size), x: mark.box.cx, y: mark.box.cy })),
    flippers, crownX: snap((Math.min(...crown) + Math.max(...crown) + 1) / 2), tailEdge: bodyBox.x0 + 2 * DRAWN, tailReach: bodyBox.x0 + 2 * DRAWN - boxOf(indigo[0].piece, size).x0,
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const EASE = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inOut: t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t),
};

/** What a pose can set; every number is in work pixels and is tweened between keys. */
const REST = {
  /** Torso width and height against the neutral pose, about the body centre on the floor. */
  wide: 1, tall: 1,
  /** How far the top of the dome leans to the right. */
  lean: 0,
  /** How far Moru is off the floor. */
  lift: 0,
  /** Where the face has slid on the dome, and where the eyes look within it. */
  faceX: 0, faceY: 0, gazeX: 0, gazeY: 0,
  /** How far the tail tip is raised. */
  tail: 0,
  /** Each front flipper's move from its place on the floor. */
  leftX: 0, leftY: 0, rightX: 0, rightY: 0,
  /** How far all of Moru has moved to the right; only a prop gives a reason to. */
  slide: 0,
  /** The belly's spread against the head's, how far the head alone leans, and how far the head tips toward its lean. */
  bulge: 0, bend: 0, cant: 0,
};

function stamp(canvas, size, sprite, left, top, only) {
  for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
    const colour = sprite.data[y * sprite.w + x], xx = left + x, yy = top + y;
    if (colour && xx >= 0 && yy >= 0 && xx < size && yy < size && (!only || only(xx, yy))) canvas[yy * size + xx] = colour;
  }
}

/** Draws one pose. `pose` is `REST` with changes; `shapes` picks the eye and flipper drawings; `props` draw behind and in front. */
function drawPose(rig, pose, shapes, props, art) {
  const { size, bare, inBody, ivory } = rig, canvas = new Uint8Array(size * size);
  const height = rig.floor - rig.bodyBox.y0, lift = snap(pose.lift), slide = snap(pose.slide);
  for (const prop of props) if (prop.behind) prop.draw(canvas, size);
  // How far up the posed body a row is: 0 on the floor, 1 at the crown.
  const up = y => Math.max(0, Math.min(1, (rig.floor - y) / (height * pose.tall)));
  // `lean` shears the whole body; `bend` carries the head further than the belly, so the weight stays where it sits.
  const leanAt = y => snap(pose.lean * Math.min(1, (rig.floor - y) / height) + pose.bend * up(y) * up(y));
  // `bulge` spreads the belly and draws the head in, as a squash does; below zero it lifts the chest.
  const wideAt = y => pose.wide * (1 + pose.bulge * (1 - 2 * up(y)));
  // `cant` tips the head: the side the body leans toward drops and the far side rises.
  const cantAt = (x, y) => pose.cant ? snap(pose.cant * (x - rig.centre - leanAt(y) - slide) / (rig.bodyBox.w / 2) * up(y) * up(y)) : 0;
  const body = new Uint8Array(size * size);
  const flipperOf = side => {
    const flipper = rig.flippers[side === 'left' ? 0 : 1], dx = snap(pose[`${side}X`]), dy = snap(pose[`${side}Y`]);
    // Off the floor a flipper is the round paw the catalogue draws there; on it, the flat-footed one.
    const shape = shapes[side] ?? (dy - lift < -DRAWN ? 'raised' : 'rest');
    const x = snap(rig.centre + (flipper.box.x0 - rig.centre) * pose.wide * (1 + pose.bulge)) + dx + slide, y = flipper.box.y0 + dy - lift;
    const paw = shape === 'rest' || shape === 'hidden' ? undefined : art.flippers[shape];
    if (shape !== 'rest' && shape !== 'hidden' && !paw) throw new Error(`no flipper drawing is called "${shape}"`);
    return { flipper, shape, x, y, paw, behind: shapes[`${side}Behind`] ?? false, left: paw && x + snap((flipper.box.w - paw.w) / 2), top: paw && y + flipper.box.h + DRAWN - paw.h };
  };
  const placedFlippers = [flipperOf('left'), flipperOf('right')];
  const drawFlipper = ({ flipper, shape, x, y, paw, left, top }) => {
    if (shape === 'hidden') return;
    // A paw standing on the belly's lower edge keeps the arc above it, as the catalogue draws it there; anywhere else it keeps its whole outline.
    const standing = paw && top + paw.h >= rig.floor - lift;
    if (paw) return stamp(canvas, size, paw, left, top, (xx, yy) => !(standing && body[yy * size + xx] && yy >= top + paw.h - paw.pad - DRAWN && paw.data[(yy - top) * paw.w + xx - left] === INK));
    // In its own place the flipper is the neutral pose's pixels; moved, it carries a whole outline.
    if (x === flipper.box.x0 && y === flipper.box.y0) stamp(canvas, size, flipper.rest, flipper.rest.x0, flipper.rest.y0);
    else stamp(canvas, size, flipper.loose, x - DRAWN, y - DRAWN);
  };
  for (const placed of placedFlippers) if (placed.behind) drawFlipper(placed);

  const faceX = snap(pose.faceX), faceY = snap(pose.faceY);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = y + lift - cantAt(x, y + lift), sy = Math.round(rig.floor - (rig.floor - row) / pose.tall);
      if (sy < 0 || sy >= size) continue;
      const sx = Math.round(rig.centre + (x - leanAt(row) - slide - rig.centre) / wideAt(row));
      if (sx < 0 || sx >= size) continue;
      // The tail swings about its root: a column farther from the body is raised more.
      const reach = Math.max(0, Math.min(1, (rig.tailEdge - sx) / rig.tailReach));
      const ty = sx < rig.tailEdge ? sy + snap(pose.tail * reach) : sy;
      if (ty < 0 || ty >= size) continue;
      const source = ty * size + sx;
      let colour = bare[source];
      // Facing the viewer, the tail is behind the body.
      if (!colour || shapes.front && !inBody[source] && sx < rig.tailEdge + DRAWN) continue;
      if (inBody[source]) {
        body[y * size + x] = 1;
        if (faceX || faceY) colour = ivory[Math.max(0, Math.min(size - 1, ty - faceY)) * size + Math.max(0, Math.min(size - 1, sx - faceX))] ? IVORY : STONE;
      }
      canvas[y * size + x] = colour;
    }
  }

  // The face is drawn on a dome: a mark on the side the face turns toward travels less than the others.
  const turned = (x, gaze) => { const turn = pose.faceX + gaze; return (turn > 0 ? x > rig.nose.x : x < rig.nose.x) ? turn * FAR_SIDE : turn; };
  const place = (x, y, gaze = 0) => {
    const py = rig.floor - (rig.floor - (y + faceY)) * pose.tall, px = rig.centre + (x + turned(x, gaze) - rig.centre) * wideAt(py) + leanAt(py) + slide;
    return [px, py - lift + cantAt(px, py)];
  };
  // A mark is drawn only on the body, a drawn pixel clear of its edge, so a slid face never pokes through the outline.
  const clear = (x, y) => [[0, 0], [-DRAWN, 0], [DRAWN, 0], [0, -DRAWN], [0, DRAWN]].every(([dx, dy]) => body[(y + dy) * size + x + dx]);
  const markAt = (sprite, x, y) => stamp(canvas, size, sprite, snap(x - sprite.w / 2), snap(y - sprite.h / 2), clear);
  const eye = shapes.eyes ? art.eyes[shapes.eyes] : rig.eye;
  if (!eye) throw new Error(`no eye drawing is called "${shapes.eyes}"`);
  for (const at of rig.eyes) { const [x, y] = place(at.x, at.y + pose.gazeY + (eye.drop ?? 0), pose.gazeX); markAt(eye, x, y); }
  const [noseX, noseY] = place(rig.nose.x, rig.nose.y + pose.gazeY / 2, pose.gazeX / 2);
  markAt(rig.nose, noseX, noseY);
  if (shapes.mouth) {
    const mouth = art.mouths[shapes.mouth];
    if (!mouth) throw new Error(`no mouth drawing is called "${shapes.mouth}"`);
    const [x, y] = place(rig.nose.x, rig.nose.y + rig.nose.h / 2 + DRAWN + mouth.h / 2, pose.gazeX / 2);
    markAt(mouth, x, y);
  }
  // A whisker a raised paw would half cover is left out, so the paw never wears it as a rim.
  const underPaw = (sprite, x, y) => placedFlippers.some(({ paw, behind, left, top }) => paw && !behind
    && x + sprite.w / 2 > left - DRAWN && x - sprite.w / 2 < left + paw.w + DRAWN && y + sprite.h / 2 > top - DRAWN && y - sprite.h / 2 < top + paw.h + DRAWN);
  for (const whisker of rig.whiskers) { const [x, y] = place(whisker.x, whisker.y); if (!underPaw(whisker, x, y)) markAt(whisker, x, y); }

  for (const placed of placedFlippers) if (!placed.behind) drawFlipper(placed);
  for (const prop of props) if (!prop.behind) prop.draw(canvas, size);
  absorbCrumbs(canvas, size, rig.tailEdge + Math.min(0, slide));
  seal(canvas, size);
  return shapes.mirror ? mirrored(canvas, size) : canvas;
}

/** Exported 128px pixels under which a piece of body fill cut off by a paw or a prop is a crumb: four pixels at 64px. */
const CRUMB = 16;
/**
 * A crumb of one body fill right of the tail takes the other fill where that surrounds it, and the
 * outline's ink otherwise. Pieces are found as the 128px export will hold them, two work pixels to one.
 */
function absorbCrumbs(canvas, size, from) {
  const half = size / 2, cells = fill => {
    const out = new Uint8Array(half * half);
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
      const p = 2 * y * size + 2 * x;
      out[y * half + x] = [p, p + 1, p + size, p + size + 1].filter(q => canvas[q] === fill).length >= 2 ? 1 : 0;
    }
    return out;
  };
  const held = { [STONE]: cells(STONE), [IVORY]: cells(IVORY) };
  for (const fill of [STONE, IVORY]) for (const piece of pieces(held[fill], half, cell => cell === 1)) {
    if (piece.length >= CRUMB || piece.some(cell => 2 * (cell % half) < from)) continue;
    const other = fill === STONE ? IVORY : STONE;
    let beside = 0, rest = 0;
    for (const cell of piece) for (const n of [cell - 1, cell + 1, cell - half, cell + half]) {
      if (held[fill][n]) continue;
      if (held[other][n]) beside++; else rest++;
    }
    for (const cell of piece) {
      const p = 2 * Math.floor(cell / half) * size + 2 * (cell % half);
      for (const q of [p, p + 1, p + size, p + size + 1]) if (canvas[q] === fill) canvas[q] = beside >= rest ? other : INK;
    }
  }
}

/** Gives any body fill left open to the canvas its outline, layer by layer to the outline's thickness. */
function seal(canvas, size) {
  let layer = [];
  for (let p = 0; p < canvas.length; p++) if (isSkin(canvas[p])) layer.push(p);
  for (let depth = 0; depth < DRAWN && layer.length; depth++) {
    const next = [];
    for (const p of layer) {
      const x = p % size, left = x > 0, right = x + 1 < size;
      // The first two layers also turn corners, so the outline survives the export's halving where a posed edge runs in steps.
      const around = [left ? p - 1 : -1, right ? p + 1 : -1, p - size, p + size, ...(depth < 2 ? [left ? p - size - 1 : -1, right ? p - size + 1 : -1, left ? p + size - 1 : -1, right ? p + size + 1 : -1] : [])];
      for (const n of around) if (n >= 0 && n < canvas.length && !canvas[n]) { canvas[n] = INK; next.push(n); }
    }
    layer = next;
  }
}

/** The column a turned Moru is mirrored about: left of the body's centre, so the tail it swings to the right stays in the cell. */
const TURN_AXIS = 131;
function mirrored(canvas, size) {
  const out = new Uint8Array(canvas.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = 2 * TURN_AXIS - 1 - x;
    if (from >= 0 && from < size) out[y * size + x] = canvas[y * size + from];
  }
  return out;
}

/**
 * Turns a clip's keys into poses. A key names the pose it lands on and the whole pose there: numbers
 * tween from the key before with the key's easing, and its shapes show from the pose it lands on.
 */
function posesOf(rig, clip, art) {
  const rest = { ...REST, ...clip.rest }, last = clip.frames - 1;
  const keys = [{ at: 0, pose: {}, shapes: {} }, ...clip.keys, { at: last, pose: {}, shapes: {} }].map(key => ({ ease: 'inOut', shapes: {}, ...key, pose: { ...rest, ...key.pose } }));
  for (let i = 1; i < keys.length; i++) if (keys[i].at <= keys[i - 1].at) throw new Error(`${clip.id}: key ${keys[i].at} does not follow key ${keys[i - 1].at}`);
  const timeline = [];
  for (let index = 1; index < last; index++) {
    const next = keys.findIndex(key => key.at >= index), to = keys[next], from = keys[next - 1];
    const t = EASE[to.ease]((index - from.at) / (to.at - from.at));
    timeline.push({ index, pose: Object.fromEntries(Object.keys(rest).map(name => [name, lerp(from.pose[name], to.pose[name], t)])), shapes: to.at === index ? to.shapes : from.shapes });
  }
  if (!clip.airborne && !clip.travel) settle(timeline, rest);
  return timeline.map(({ index, pose, shapes }) => drawPose(rig, pose, shapes, (clip.props ?? []).flatMap(prop => prop(pose, shapes, index, art) ?? []), art));
}

/** The most a grounded body changes between two poses, so its centre moves no faster than the catalogue's grounded clips do. */
const PACE = { tall: 0.03, wide: 0.04, lean: 2, bend: 4, cant: 2, bulge: 0.04 };
/** Holds a grounded clip's body to that pace from the neutral pose it opens on and back to the one it closes on. */
function settle(timeline, rest) {
  for (const [name, pace] of Object.entries(PACE)) {
    let before = rest[name];
    for (const { pose } of timeline) before = pose[name] = Math.max(before - pace, Math.min(before + pace, pose[name]));
    let after = rest[name];
    for (const { pose } of [...timeline].reverse()) after = pose[name] = Math.max(after - pace, Math.min(after + pace, pose[name]));
  }
}

/** Whether a drawing comes within one exported pixel of the cell edge at 64px, where the export would clip it. */
function touchesEdge(canvas, size) {
  const margin = size / 64;
  for (let p = 0; p < size * size; p++) if (canvas[p] && (p % size < margin || p % size >= size - margin || p < margin * size || p >= (size - margin) * size)) return true;
  return false;
}

/** The poses laid out as one sheet. The buffer is assembled here and only encoded by the image library, losslessly, so the sheet holds the same pixels on every machine. */
function sheet(frames, size, rows) {
  const width = COLUMNS * size, data = Buffer.alloc(width * rows * size * 4);
  frames.forEach((frame, i) => {
    const left = i % COLUMNS * size, top = Math.floor(i / COLUMNS) * size;
    for (let y = 0; y < size; y++) Buffer.from(frame.buffer, frame.byteOffset + y * size * 4, size * 4).copy(data, ((top + y) * width + left) * 4);
  });
  return sharp(data, { raw: { width, height: rows * size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

/** Every work clip as its manifest entry, its poses and its source sheet, drawn in memory. */
export async function drawWorkClips() {
  const grid = await moruWorkGrid(), size = grid.size, rig = cutNeutral(grid.clean(grid.neutral), size);
  const art = WORK_CLIPS.art({ pixelMap, stamp, snap, rig: { floor: rig.floor, ground: rig.floor + DRAWN, centre: rig.centre, crown: rig.bodyBox.y0, crownX: rig.crownX }, INK, MUTED, INDIGO, GRAY, STONE, IVORY });
  return Promise.all(WORK_CLIPS.clips.map(async clip => {
    if (clip.durationsMs.length !== clip.frames) throw new Error(`${clip.id} times ${clip.durationsMs.length} of its ${clip.frames} poses`);
    const poses = posesOf(rig, clip, art);
    poses.forEach((pose, i) => { if (touchesEdge(pose, size)) throw new Error(`${clip.id} pose ${i + 2} reaches the cell edge`); });
    // The exporter replaces the first and last pose with the shared neutral pose, so the sheet holds it as cut.
    const frames = [grid.neutral, ...poses.map(rgbaOf), grid.neutral], rows = Math.ceil(clip.frames / COLUMNS);
    const entry = { id: clip.id, source: `${SHEETS}/${clip.id}.png`, label: clip.label, context: clip.context, columns: COLUMNS, rows, offset: 0, frames: clip.frames, durationsMs: clip.durationsMs, scene: false, airborne: clip.airborne ?? false, drawn: true };
    return { entry, size, frames, sheet: await sheet(frames, size, rows) };
  }));
}

/** Writes each drawn sheet and puts its entry in the source manifest, in place or at the end. */
export async function authorWorkClips({ framesDir } = {}) {
  const spec = JSON.parse(await readFile(`${ROOT}/moru-source.json`, 'utf8')), drawn = await drawWorkClips();
  await mkdir(`${ROOT}/${SHEETS}`, { recursive: true });
  for (const { entry, size, frames, sheet: png } of drawn) {
    await writeFile(`${ROOT}/${entry.source}`, png);
    if (framesDir) {
      await mkdir(`${framesDir}/${entry.id}`, { recursive: true });
      await Promise.all(frames.map((frame, i) => sharp(frame, { raw: { width: size, height: size, channels: 4 } }).png().toFile(`${framesDir}/${entry.id}/${String(i).padStart(2, '0')}.png`)));
    }
    const at = spec.authored.findIndex(existing => existing.id === entry.id);
    if (at < 0) spec.authored.push(entry); else spec.authored[at] = entry;
  }
  await writeFile(`${ROOT}/moru-source.json`, JSON.stringify(spec, null, 2) + '\n');
  return drawn.map(({ entry }) => entry.id);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf('--frames');
  const written = await authorWorkClips({ framesDir: at < 0 ? undefined : process.argv[at + 1] });
  console.log(`[moru] drew ${written.length} work clips in code: ${written.join(', ')}`);
}
