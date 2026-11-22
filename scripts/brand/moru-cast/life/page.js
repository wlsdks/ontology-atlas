// The host: one 2D canvas the size of the strip, one setTimeout clock at 8 Hz (hz=10 or 12 in the address for a faster one).
// A pose's body is composed in script once and kept as an ImageBitmap keyed by palette, clip, frame and whatever is worn on the
// skin; its flippers and props are kept once for every Moru. The store is capped at 24 MB (least recently shown goes first).
// Showing a pose again is a few drawImage calls: shadow, pieces behind, body, pieces in front, flippers. Only the rectangles
// that changed are redrawn, at whole-pixel positions; a blink redraws the eyes only. The clock slows while nothing changes.
const Q = new URLSearchParams(location.search), MODE = Q.get('mode') ?? 'strip', WARD = MODE === 'wardrobe', PIECES = Object.keys(ATLAS.pieces), N = WARD ? PIECES.length + 10 : +(Q.get('n') ?? 8), SEED = +(Q.get('seed') ?? 7), CAPTURE = Q.has('capture');
const REDUCED = Q.has('reduced') || (!CAPTURE && matchMedia('(prefers-reduced-motion: reduce)').matches), HZ = +(Q.get('hz') ?? 8), TICK = 1000 / HZ;
const W = Math.floor(+(Q.get('w') ?? innerWidth)), PER_ROW = Math.floor((W - 40) / 150), H = WARD ? Math.ceil(N / PER_ROW) * 150 + 20 : 300, LANE0 = WARD ? 120 : 200, LANE_DY = WARD ? 150 : 26;
const OX = 40, OY = 24, CW = 208, CH = 152, SLOTS = ['body', 'accessory', 'head'];
const hex32 = h => { const n = parseInt(h.replace('#', ''), 16); return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const colours = [0], colourIndex = new Map([[0, 0]]);
/** A sheet as one byte per pixel: a fifth of the decoded size, and the palette swap becomes a table lookup. */
async function indexed(src) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = new Uint32Array(g.getImageData(0, 0, c.width, c.height).data.buffer), out = new Uint8Array(d.length); let lastV = 0, lastI = 0;
  for (let i = 0; i < d.length; i++) { const v = d[i]; if (v !== lastV) { lastV = v; if (v >>> 24 === 0) lastI = 0; else { let k = colourIndex.get(v); if (k === undefined) { k = colours.length; colours.push(v); colourIndex.set(v, k); } lastI = k; } } out[i] = lastI; }
  const sheet = { data: out, w: c.width, h: c.height }; c.width = c.height = 0; return sheet;
}
const BASE = await indexed(SHEETS.base), OVER = await indexed(SHEETS.over), CLOTHES = await indexed(SHEETS.wardrobe);
const clips = ATLAS.clips, STONE = colourIndex.get(hex32(ATLAS.tones.body)), IVORY = colourIndex.get(hex32(ATLAS.tones.belly)), plain = Uint32Array.from(colours);
const lutOf = name => { const lut = Uint32Array.from(colours), [body, belly] = ATLAS.palettes[name]; lut[STONE] = hex32(body); lut[IVORY] = hex32(belly); return lut; };

const view = document.getElementById('view'), hud = document.getElementById('hud'); view.width = W; view.height = H;
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
const P = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); }, INK = '#17192d';
const LADDER_X = Math.round(W * 0.5 / 2) * 2, spots = WARD ? [] : [{ x: LADDER_X + 74, dir: 1, clip: 'climb', lane: 0 }];
{ // The floor of a room or the lobby, with the one fixture a Moru can use: a ladder up to a shelf.
  const g = bg.getContext('2d'); P(g, 0, 0, W, H, '#0b0b0a');
  if (!WARD) { P(g, 0, LANE0 - 14, W, H, '#11121c'); P(g, 0, LANE0 - 14, W, 2, '#262a45');
    const x = LADDER_X, top = LANE0 - 100 - 32; P(g, x + 20, top + 99, 104, 6, INK); P(g, x + 22, top + 100, 100, 4, '#d6d3c9'); P(g, x + 22, top + 104, 100, 2, '#b8b4aa'); for (const lx of [26, 114]) P(g, x + lx, top + 106, 4, 26, '#b8b4aa');
    for (const lx of [60, 80]) P(g, x + lx, top + 44, 4, 88, '#50569c'); for (let y = top + 46; y < top + 130; y += 8) P(g, x + 60, y, 24, 2, '#50569c'); } }
// At most this many Moru do something at once (busy= in the address); the rest stand, the longest-standing goes next.
const world = createWorld({ atlas: ATLAS, width: W, lanes: 3, seed: SEED, spots, busyMax: +(Q.get('busy') ?? 5) });
const palettes = Object.keys(ATLAS.palettes), by = slot => [null, ...PIECES.filter(k => ATLAS.pieces[k].slot === slot)];
const draw = world.rand, any = list => list[Math.floor(draw() * list.length)], sprites = new Map(), ROOMS = WARD ? 0 : 2, STATES = ['commit', 'stuck', 'merge', 'waiting'], tags = [];
for (let i = 0; i < N; i++) {
  // Random mix and match: a palette, and a piece or nothing in each slot (a head piece more often than not).
  const head = any(by('head').slice(draw() < 0.8 ? 1 : 0)), m = addMoru(world, { id: 'm' + String(i).padStart(2, '0'), x: 30 + (i + 0.5) * ((W - 190) / N) - 64, lane: i % 3, palette: palettes[i % palettes.length], wear: { head, body: draw() < 0.6 ? any(by('body')) : null, accessory: draw() < 0.4 ? any(by('accessory')) : null }, room: i < ROOMS });
  sprites.set(m, { row: 1 + palettes.indexOf(m.palette), was: null, lastX: m.x, trail: 0, say: '', state: -2, said: null, chip: null, rect: null, X: 0, Y: 0, left: false, body: null, over: null, parts: [], f: null, reach: 30, cx: 74, sig: '', fr: -1, id: '', chipX: 0, chipY: 0 });
  if (REDUCED) m.facing = i % 2 ? -1 : 1;
  if (WARD) { m.facing = 1; m.x = 20 + (i % PER_ROW) * 150; m.depth = Math.floor(i / PER_ROW); const piece = ATLAS.pieces[PIECES[i]]; m.palette = palettes[i % palettes.length]; sprites.get(m).row = 1 + palettes.indexOf(m.palette); if (piece) m.wear = { head: null, body: null, accessory: null, [piece.slot]: PIECES[i] }; else m.wear = { head: any(by('head').slice(1)), body: any(by('body').slice(1)), accessory: any(by('accessory')) };
    const [clip, frame] = (Q.get('pose') ?? 'rest:0').split(':'); m.clip = clip; m.frame = +frame; tags.push([piece ? `${piece.slot}: ${piece.title}` : 'mix', m.x + 4, LANE0 + m.depth * LANE_DY + 16]); }
}
const within3 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ctx = view.getContext('2d', { alpha: false }); ctx.imageSmoothingEnabled = false; ctx.drawImage(bg, 0, 0);
const luts = [plain, ...palettes.map(lutOf)], shot = new ImageData(CW, CH), px = new Uint32Array(shot.data.buffer), fill = new Uint8Array(CW * CH);
// A room's label is drawn once for each thing it can say.
const chips = new Map(), chipOf = say => { let chip = chips.get(say); if (chip) return chip; chip = document.createElement('canvas'); const g = chip.getContext('2d'); g.font = '11px ui-monospace, Menlo, monospace';
  const tw = Math.ceil(g.measureText(say).width) + 12, live = !say.endsWith('idle'); chip.width = tw; chip.height = 17; g.font = '11px ui-monospace, Menlo, monospace';
  P(g, 0, 0, tw, 17, live ? '#fff1d7' : '#50569c'); P(g, 1, 1, tw - 2, 15, live ? '#fff1d7' : '#17192d'); g.fillStyle = live ? '#17192d' : '#9399e5'; g.fillText(say, 6, 12); chips.set(say, chip); return chip; };
// For every pose: the part of its clip's box it really fills, and the part that differs from the pose before it (a blink: the eyes).
for (const c of Object.values(clips)) { const [, , bw, bh] = c.box; c.f.forEach((f, fr) => { let x0 = bw, x1 = -1, y0 = bh, y1 = -1, d0 = bw, d1 = -1, e0 = bh, e1 = -1;
  for (let y = 0; y < bh; y++) { const row = (c.at + y) * BASE.w + fr * bw; for (let x = 0; x < bw; x++) { const b = BASE.data[row + x], o = OVER.data[row + x]; if (b || o) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    if (fr && (b !== BASE.data[row + x - bw] || o !== OVER.data[row + x - bw])) { if (x < d0) d0 = x; if (x > d1) d1 = x; if (y < e0) e0 = y; e1 = y; } } }
  f.t = x1 < 0 ? [0, 0, 0, 0] : [x0, y0, x1 + 1, y1 + 1]; f.d = !fr ? null : d1 < 0 ? [0, 0, 0, 0] : [d0, e0, d1 + 1, e1 + 1]; }); }
// The wardrobe sheet as pictures: plain, and one per palette for the pieces that take the body's colours.
const clothes = luts.map(lut => { const el = document.createElement('canvas'); el.width = CLOTHES.w; el.height = CLOTHES.h; const g = el.getContext('2d'), img = g.createImageData(CLOTHES.w, CLOTHES.h), d = new Uint32Array(img.data.buffer); for (let i = 0; i < d.length; i++) d[i] = CLOTHES.data[i] ? lut[CLOTHES.data[i]] : 0; g.putImageData(img, 0, 0); return el; });
// The kept pictures, least recently shown first. A picture on screen is never given up.
const CAP = +(Q.get('cache') ?? 24) * 1048576, kept = new Map(), pad = new OffscreenCanvas(8, 8), padCtx = pad.getContext('2d', { willReadFrequently: true }); let keptBytes = 0, peakBytes = 0, found = 0, composed = 0, dropped = 0;
const keep = (key, make) => { let e = kept.get(key); if (e) { kept.delete(key); kept.set(key, e); found++; return e; }
  e = make(); kept.set(key, e); keptBytes += e.bytes; composed++; if (keptBytes > peakBytes) peakBytes = keptBytes;
  if (keptBytes > CAP) for (const [k, old] of kept) { if (old.shown || old === e) continue; kept.delete(k); keptBytes -= old.bytes; old.bmp?.close(); dropped++; if (keptBytes <= CAP) break; }
  return e; };
/** Cuts what was drawn into `px` out as a picture, in cell coordinates. */
const cut = (c0, c1, r0, r1) => { if (c1 < c0) return { bmp: null, x: 0, y: 0, bytes: 64, shown: 0 }; const w = c1 - c0 + 1, h = r1 - r0 + 1; pad.width = w; pad.height = h; padCtx.putImageData(shot, -c0, -r0, c0, r0, w, h); return { bmp: pad.transferToImageBitmap(), x: c0, y: r0, bytes: w * h * 4, shown: 0 }; };
/** One sheet layer of one pose, with the pieces worn on the skin laid onto the body fill. Cell coordinates (the cell is 128 wide; `px` is used as a 208-wide pad shifted by OX, OY). */
function layer(sheet, c, fr, f, lut, skin) {
  const box = c.box, bx = box[0], by = box[1], bw = box[2], t = f.t; px.fill(0);
  for (let y = t[1]; y < t[3]; y++) { const row = (c.at + y) * sheet.w + fr * bw, to = (OY + by + y) * CW + OX + bx; for (let x = t[0]; x < t[2]; x++) { const k = sheet.data[row + x]; if (k) px[to + x] = lut[k]; } }
  let c0 = CW, c1 = -1, r0 = CH, r1 = -1; for (let y = OY + by + t[1]; y < OY + by + t[3]; y++) for (let x = OX + bx + t[0]; x < OX + bx + t[2]; x++) if (px[y * CW + x]) { if (x < c0) c0 = x; if (x > c1) c1 = x; if (y < r0) r0 = y; r1 = y; }
  for (const [p, X, Y] of skin) { const table = p.tint ? lut : plain, x0 = (f.flip ? 136 - (X + p.w - 1) : X) + f.px, STONE_C = lut[STONE], IVORY_C = lut[IVORY];
    for (let r = 0; r < p.h; r++) for (let q = 0; q < p.w; q++) { const v = CLOTHES.data[r * CLOTHES.w + p.sx + (f.flip ? p.w - 1 - q : q)]; if (!v) continue; const x = OX + x0 + q, y = OY + Y + r; if (x < 0 || y < 0 || x >= CW || y >= CH) continue; const at = y * CW + x; if (px[at] === STONE_C || px[at] === IVORY_C || fill[at] === 1) { px[at] = table[v]; fill[at] = 1; } } }
  if (skin.length) fill.fill(0);
  const e = cut(c0, c1, r0, r1); e.x -= OX; e.y -= OY; return e;
}
/** Picks the pictures for the Moru's pose now (composing what is new) and marks the rectangle of the canvas that has to be redrawn. */
function compose(m, s) {
  const id = m.facing < 0 && clips[m.clip + '~left'] ? m.clip + '~left' : m.clip, c = clips[id], fr = REDUCED && m.clip !== 'rest' ? c.still : m.frame, f = c.f[fr], box = c.box, t = f.t;
  // Soft pieces trail: behind the anchor's last move, and back from the direction of travel. A piece on the skin is part of the body's picture and does not trail.
  const off = c.wear ? c.wear.off[fr] : null, was = s.was ?? f.a, moved = Math.sign(m.x - s.lastX) * m.facing, parts = s.parts, skin = []; parts.length = 0; s.trail = moved > 0 ? 1 : 0; s.lastX = m.x; s.was = f.a;
  const pose = id + ':' + fr, fresh = pose !== s.pose || s.settling; s.pose = pose; s.settling = false;
  let sig = '', c0 = box[0] + t[0], c1 = box[0] + t[2], r0 = box[1] + t[1]; const cx = Math.round(f.cx), reach = f.air || m.height ? 20 : 30, turned = !!f.angle;
  for (let k3 = 0; k3 < 3; k3++) { const slot = SLOTS[k3], piece = ATLAS.pieces[m.wear[slot]]; if (!piece) continue; for (let p of piece.parts) {
    // Ears and wing never jump between states: each new pose moves them one picture toward where the pose wants them (ears up, bent, down; wing down, half down, mid, half up, up; in the air it beats once every eight poses).
    if (p.alts) { const want = p.alts.droop ? (f.droop ? 2 : 0) : f.air ? ((fr >> 2) & 1 ? 2 : -2) : f.sq >= 3 ? -2 : f.sq <= -2 ? 2 : 0, key = slot + (p.alts.droop ? 'e' : 'w'), had = s[key] ?? 0, now = fresh ? had + Math.sign(want - had) : had; s[key] = now; if (now !== want) s.settling = true; if (now === 1 || now === -1) between++;
      p = f.angle && p.alts.turned ? p.alts.turned : p.alts.droop ? (now === 2 ? p.alts.droop : now === 1 ? p.alts.bent : p) : now === 2 ? p.alts.up : now === 1 ? p.alts.halfUp : now === -1 ? p.alts.halfDown : now === -2 ? p.alts.down : p; }
    const a = f.a[p.anchor], b = was[p.anchor], k = p.layer === 'skin' ? 0 : p.soft, head = slot === 'head', lagX = k ? within3(Math.round((b[0] - a[0]) * k / 2), -k, k) - (k > 1 ? s.trail * (k - 1) : 0) : 0, lagY = k ? within3(Math.round((b[1] - a[1]) * k / 2), -1, k) : 0;
    const X = p.x + a[0] + lagX + (head && off ? off[0] : 0), Y = p.y + a[1] + lagY + (head && off ? off[1] : 0), x0 = (f.flip ? 136 - (X + p.w - 1) : X) + f.px;
    if (p.layer === 'skin') { skin.push([p, X, Y]); sig += '|' + p.sx + ',' + p.x + ',' + p.y; continue; }
    parts.push(p, x0, Y); sig += '|' + p.sx + ',' + x0 + ',' + Y;
    // A turned piece may reach anywhere within its own diagonal of where it sits.
    const far = turned ? Math.ceil(Math.hypot(p.w, p.h)) + 40 : 0; if (x0 - far < c0) c0 = x0 - far; if (x0 + p.w + far > c1) c1 = x0 + p.w + far; if (Y - far < r0) r0 = Y - far; } }
  const body = keep(m.palette + '|' + id + '|' + fr + '|' + skin.map(([p]) => p.sx).join(), () => layer(BASE, c, fr, f, luts[s.row], skin)), over = keep('over|' + id + '|' + fr, () => layer(OVER, c, fr, f, plain, []));
  const X = Math.round(m.x), Y = Math.round(LANE0 + m.depth * LANE_DY - m.height) - 100, left = m.facing < 0; c0 = Math.min(c0, cx - reach); c1 = Math.max(c1, cx + reach);
  // The next pose of the same clip, on the same spot in the same outfit: only what differs between the two poses is redrawn.
  const small = s.body && s.id === id && fr === s.fr + 1 && s.X === X && s.Y === Y && s.left === left && s.sig === sig && f.d ? f.d : null;
  if (s.body) { s.body.shown--; s.over.shown--; } s.body = body; s.over = over; body.shown++; over.shown++; s.X = X; s.Y = Y; s.left = left; s.sig = sig; s.id = id; s.fr = fr; s.f = f; s.reach = reach; s.cx = cx;
  let x = left ? X + 137 - c1 : X + c0, y = Y + r0, x1 = x + c1 - c0, y1 = Y + 102;
  const state = m.room ? (m.cur.state ? 2 : m.claimed ? 1 : 0) : -1; let relabel = false;
  if (state !== s.state || (state === 2 && s.said !== m.cur.state)) { relabel = true; s.state = state; s.said = m.cur.state; s.say = state < 0 ? '' : state === 2 ? `room ${m.id.slice(-1)}: ${m.cur.state} (real event)` : state ? `room ${m.id.slice(-1)}: working` : `room ${m.id.slice(-1)}: idle`; s.chip = s.say ? chipOf(s.say) : null; }
  if (s.chip) { s.chipX = X + 20; s.chipY = Y + 2; x = Math.min(x, s.chipX); y = Math.min(y, s.chipY); x1 = Math.max(x1, s.chipX + s.chip.width); y1 = Math.max(y1, s.chipY + 17); }
  x = Math.max(0, x); y = Math.max(0, y); const whole = { x, y, w: Math.min(W, x1) - x, h: Math.min(H, y1) - y }, before = s.rect; s.rect = whole;
  if (small && !relabel) { const a = box[0] + small[0], b = box[0] + small[2]; add({ x: Math.max(0, left ? X + 137 - b : X + a), y: Math.max(0, Y + box[1] + small[1]), w: b - a, h: small[3] - small[1] }); return; }
  if (before) add(before); add(whole);
}
/** Draws one Moru, back to front, in its own cell's coordinates (mirrored for one that faces left). */
function stamp(s) {
  const f = s.f, parts = s.parts, sheet = clothes[s.row], cx = s.cx, reach = s.reach, bx = s.left ? -1 : 1, tx = s.left ? s.X + 137 : s.X; ctx.setTransform(bx, 0, 0, 1, tx, s.Y);
  ctx.fillStyle = 'rgba(23,25,45,0.2745)'; ctx.fillRect(cx - reach + 1, 100, 2 * reach - 1, 1); ctx.fillRect(cx - reach + 7, 101, 2 * reach - 13, 1);
  const wear = at => { for (let i = 0; i < parts.length; i += 3) { const p = parts[i]; if (p.layer !== at) continue; const x0 = parts[i + 1], y0 = parts[i + 2], from = p.tint ? sheet : clothes[0];
    if (!f.angle && !f.flip) { ctx.drawImage(from, p.sx, 0, p.w, p.h, x0, y0, p.w, p.h); continue; }
    // A pose-mirrored or turned pose: the piece is mirrored in place, and turned about the point the body turned about.
    // On a turned pose a small piece (a bow, a horn, the wing) is seated three pixels into the body, so the stepped outline of the turn does not leave it hanging by a corner.
    let ix = 0, iy = 0; if (f.angle && p.w * p.h < 700) { const dx = f.pv[0] - (x0 + p.w / 2), dy = f.pv[1] - (y0 + p.h / 2), d = Math.hypot(dx, dy) || 1; ix = Math.round(3 * dx / d); iy = Math.round(3 * dy / d); }
    ctx.save(); if (f.angle) { ctx.translate(f.pv[0], f.pv[1] - (f.sk || 0)); ctx.rotate(f.angle * Math.PI / 180); ctx.translate(-f.pv[0], -f.pv[1]); } if (f.flip) { ctx.translate(x0 + p.w + ix, y0 + iy); ctx.scale(-1, 1); ctx.drawImage(from, p.sx, 0, p.w, p.h, 0, 0, p.w, p.h); } else ctx.drawImage(from, p.sx, 0, p.w, p.h, x0 + ix, y0 + iy, p.w, p.h); ctx.restore(); } };
  wear('behind'); if (s.body.bmp) ctx.drawImage(s.body.bmp, s.body.x, s.body.y); wear('front'); if (s.over.bmp) ctx.drawImage(s.over.bmp, s.over.x, s.over.y);
  ctx.setTransform(1, 0, 0, 1, 0, 0); if (s.chip) ctx.drawImage(s.chip, s.chipX, s.chipY);
}
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const order = [...sprites.values()]; for (const [m, s] of sprites) s.m = m;
let painted = 0, redrawn = 0, sent = 0, lastHud = -1e9, nextEvent = 9000, eventNo = 0, moved = false;
if (WARD) for (const [text, x, y] of tags) { const tag = document.createElement('div'); tag.textContent = text; tag.style.cssText = `position:absolute;left:${x}px;bottom:${H - y - 3}px;font:11px ui-monospace,Menlo,monospace;color:#99968f;white-space:pre`; document.body.append(tag); }
const dirty = [];
// Rectangles that touch are redrawn as one, so no pixel is drawn twice in a tick.
function add(r) { if (r.w <= 0 || r.h <= 0) return; for (let i = 0; i < dirty.length; i++) { const d = dirty[i]; if (!hits(d, r)) continue; const x = Math.min(d.x, r.x), y = Math.min(d.y, r.y), w = Math.max(d.x + d.w, r.x + r.w) - x, h = Math.max(d.y + d.h, r.y + r.h) - y; dirty.splice(i, 1); return add({ x, y, w, h }); } dirty.push(r); }
function paint() {
  const t0 = performance.now(); dirty.length = 0;
  for (let i = 0; i < order.length; i++) { const s = order[i], m = s.m, live = m.room ? (m.cur.state ? 2 : m.claimed ? 1 : 0) : 0; if (!m.changed && !s.settling && live === s.live && s.rect) continue; s.live = live; compose(m, s); m.changed = false; painted++; }
  const t2 = performance.now(); spent.lay += t2 - t0; moved = dirty.length > 0;
  if (moved) {
    // Back to front. The order hardly changes from tick to tick, so it is kept and only nudged.
    for (let i = 1; i < order.length; i++) { const s = order[i]; let k = i - 1; while (k >= 0 && order[k].m.depth > s.m.depth) { order[k + 1] = order[k]; k--; } order[k + 1] = s; }
    for (const r of dirty) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.drawImage(bg, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h); for (let i = 0; i < order.length; i++) { const s = order[i]; if (s.rect && hits(s.rect, r)) stamp(s); } ctx.restore(); redrawn++; sent += r.w * r.h; }
    spent.draw += performance.now() - t2; }
  if (!WARD && !Q.has('nohud') && world.now - lastHud >= 1000) { lastHud = world.now; const st = world.stats, last = world.log.at(-1); hud.textContent = `${(world.now / 1000).toFixed(0)} s   ${N} Moru   played together ${st.interactions}   pranks ${st.pranks}   outfit swaps ${st.swaps}   said no ${st.declines}` + (last ? `   last real event cut in after ${Math.round(last.waited)} ms` : ''); }
}
function step(dt) { if (ROOMS && world.now >= nextEvent) { raise(world, 'm0' + (eventNo % ROOMS), STATES[eventNo % STATES.length]); eventNo++; nextEvent += 11000; } tick(world, dt); }
let timer = 0, wakes = 0, busy = 0, slow = 0, between = 0; const spent = { think: 0, lay: 0, draw: 0 };
// One setTimeout at a time. While nothing on the floor changes, the next tick comes later (up to four ticks' time), and covers the time it slept.
const loop = () => { const t = performance.now(), dt = TICK * (1 + slow); wakes++; step(dt); spent.think += performance.now() - t; paint(); slow = moved ? 0 : Math.min(slow + 1, 3); busy += performance.now() - t; timer = setTimeout(loop, TICK * (1 + slow)); };
const start = () => { if (!timer && !REDUCED && !CAPTURE && !WARD) timer = setTimeout(loop, TICK); }, stop = () => { clearTimeout(timer); timer = 0; };
// Nothing runs while nobody can see it.
let onScreen = true; const sync = () => (onScreen && !document.hidden ? start() : stop());
document.addEventListener('visibilitychange', sync); new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(view);
if (REDUCED && ROOMS) { const m = world.morus[0]; m.clip = 'ask'; m.cur = { state: 'waiting' }; }
paint(); sync();
window.life = { world, advance(ms) { for (let t = 0; t < ms - 1; t += TICK) step(TICK); paint(); return world.now; }, counters: () => ({ between, painted, redrawn, sent, wakes, busy, found, composed, dropped, keptPoses: kept.size, keptMB: +(keptBytes / 1048576).toFixed(2), peakKeptMB: +(peakBytes / 1048576).toFixed(2), jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, spent: { ...spent }, now: world.now }), memory: () => ({ sheetsMB: +((BASE.data.length + OVER.data.length + CLOTHES.data.length) / 1048576).toFixed(1), keptMB: +(keptBytes / 1048576).toFixed(2), canvasMB: +(W * H * 4 * 2 / 1048576).toFixed(1) }) };
