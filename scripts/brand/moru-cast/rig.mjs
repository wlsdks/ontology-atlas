// Cuts the catalogue's neutral 128px pose into parts. Palette indices are shared by every drawing here.
import { loadStrip, shippedNeutral } from './lib.mjs';
export const HEX = [null, '17192d', '171923', '50569c', '6d73d2', 'd6d3c9', 'fff1d7', '9399e5', 'b8b4aa', '99968f'];
export const [CLEAR, INK, MARK, MUTED, INDIGO, STONE, IVORY, LIGHT, SHADE] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const RGB = HEX.map(h => h && [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)));
export const isInk = c => c === INK || c === MARK;
const isSkin = c => c === STONE || c === IVORY;
const isBlue = c => c === MUTED || c === INDIGO || c === LIGHT;
export const N = 128;

export function indexed(rgba, w, h) {
  const out = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!rgba[p * 4 + 3]) continue;
    const hex = [0, 1, 2].map(i => rgba[p * 4 + i].toString(16).padStart(2, '0')).join('');
    let c = HEX.indexOf(hex);
    if (c < 0) c = hex === '555451' ? INK : -1;
    if (c < 0) throw new Error('colour outside palette ' + hex);
    out[p] = c;
  }
  return out;
}
export function toRGBA(canvas) {
  const out = Buffer.alloc(canvas.length * 4);
  for (let p = 0; p < canvas.length; p++) if (canvas[p]) out.set([...RGB[canvas[p]], 255], p * 4);
  return out;
}
function pieces(canvas, w, member, corners = false) {
  const seen = new Uint8Array(canvas.length), found = [], h = canvas.length / w;
  for (let s = 0; s < canvas.length; s++) {
    if (seen[s] || !member(canvas[s])) continue;
    const piece = [s]; seen[s] = 1;
    for (let i = 0; i < piece.length; i++) {
      const p = piece[i], x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!(dx || dy) || (!corners && dx && dy)) continue;
        const xx = x + dx, yy = y + dy, n = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && !seen[n] && member(canvas[n])) { seen[n] = 1; piece.push(n); }
      }
    }
    found.push(piece);
  }
  return found;
}
function boxOf(pix, w) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of pix) { const x = p % w, y = (p - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}
/** Pixels within `reach` of a mask, far corners cut as the source cuts them. */
export function grown(mask, w, reach, cut = 1.6) {
  const out = new Uint8Array(mask.length), h = mask.length / w;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const x = p % w, y = (p - x) / w;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const xx = x + dx, yy = y + dy;
      if (Math.abs(dx) + Math.abs(dy) <= reach * cut && xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
    }
  }
  return out;
}
function sprite(pix, colourAt, w) {
  const b = boxOf(pix, w), data = new Uint8Array(b.w * b.h);
  for (const p of pix) data[(Math.floor(p / w) - b.y0) * b.w + (p % w) - b.x0] = colourAt(p);
  return { ...b, data };
}

export async function cutRig() {
  const frames = await loadStrip(shippedNeutral(N), N);
  const neutral = indexed(frames[0], N, N);
  const body = pieces(neutral, N, isSkin).reduce((a, b) => b.length > a.length ? b : a);
  const inBody = new Uint8Array(N * N); for (const p of body) inBody[p] = 1;
  const blue = pieces(neutral, N, isBlue, true).filter(p => p.length > 50).map(piece => ({ piece, box: boxOf(piece, N) })).sort((a, b) => a.box.x0 - b.box.x0);
  if (blue.length !== 3) throw new Error('expected tail + 2 flippers, got ' + blue.length);
  const [tailBlue, left, right] = blue;
  const enclosed = pieces(neutral, N, isInk, true).filter(piece => {
    const b = boxOf(piece, N);
    return Math.max(b.w, b.h) <= 20 && piece.every(p => { const x = p % N, y = (p - x) / N; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!neutral[(y + dy) * N + x + dx]) return false; return true; });
  }).map(piece => ({ piece, box: boxOf(piece, N) }));
  const face = enclosed.filter(m => m.box.y1 < left.box.y0 - 2 && m.box.x0 > 55);
  const eyes = face.filter(m => m.box.h >= 6 && m.box.w <= 6).sort((a, b) => a.box.x0 - b.box.x0);
  const nose = face.find(m => m.box.w >= 6 && m.box.h >= 5);
  const whiskers = face.filter(m => m.box.h <= 3);
  if (eyes.length !== 2 || !nose || whiskers.length !== 4) throw new Error(`face: ${eyes.length} eyes, nose ${!!nose}, ${whiskers.length} whiskers: ` + JSON.stringify(face.map(m => m.box)));

  // Bare torso: no face, no flippers, no tail.
  const bare = Uint8Array.from(neutral);
  const pending = new Uint8Array(N * N);
  for (const m of face) for (const p of m.piece) { pending[p] = 1; inBody[p] = 1; }
  for (let layer = face.flatMap(m => m.piece); layer.length;) {
    const painted = [], inner = [];
    for (const p of layer) { const near = [p - 1, p + 1, p - N, p + N].find(n => !pending[n] && isSkin(bare[n])); if (near === undefined) inner.push(p); else painted.push([p, bare[near]]); }
    for (const [p, c] of painted) { bare[p] = c; pending[p] = 0; }
    layer = inner;
  }
  const bodyNear0 = grown(inBody, N, 3);
  const cutOf = ({ piece }) => { const fill = new Uint8Array(N * N); for (const p of piece) fill[p] = 1; const near = grown(fill, N, 3), far = grown(fill, N, 5, 2), pix = []; for (let p = 0; p < N * N; p++) if (fill[p] || (isInk(neutral[p]) && (near[p] || (far[p] && !bodyNear0[p] && p >= 84 * N)))) pix.push(p); return { fill, pix }; };
  // Tail: the leftmost blue piece, its ivory tip and the ink round both.
  const tailFill = new Uint8Array(N * N); for (const p of tailBlue.piece) tailFill[p] = 1;
  for (const piece of pieces(neutral, N, isSkin)) if (piece !== body && piece.length < body.length && boxOf(piece, N).x1 < tailBlue.box.x1 + 4) for (const p of piece) tailFill[p] = 1;
  const tailNear = grown(tailFill, N, 3), tailFar = grown(tailFill, N, 5, 2), bodyNear = grown(inBody, N, 3), tailPix = [];
  for (let p = 0; p < N * N; p++) if (tailFill[p] || (isInk(neutral[p]) && (tailNear[p] || (tailFar[p] && !bodyNear[p] && p < 84 * N)))) tailPix.push(p);
  const tail = sprite(tailPix, p => neutral[p], N);
  const flips = [left, right].map(f => { const c = cutOf(f); return { box: f.box, rest: sprite(c.pix, p => neutral[p], N), pix: c.pix }; });
  // Remove the tail and flippers from the torso; keep ink that is the body's own outline.
  const hidden = new Uint8Array(N * N);
  for (const p of tailPix) if (!(isInk(neutral[p]) && bodyNear[p])) bare[p] = 0;
  for (const f of flips) for (const p of f.pix) { hidden[p] = 1; }
  return { neutral, bare, inBody, hidden, tail, flips, tailBox: tailBlue.box, bodyBox: boxOf(body, N),
    eyes: eyes.map(m => ({ ...sprite(m.piece, p => neutral[p], N) })), nose: sprite(nose.piece, p => neutral[p], N), whiskers: whiskers.map(m => sprite(m.piece, p => neutral[p], N)) };
}
