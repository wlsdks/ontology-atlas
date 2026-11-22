// The host: one WebGL canvas, one 10 Hz clock (hz=12 in the address for the faster one). The sheets live on the GPU as palette indices, so a pose is a few rectangles and a
// colour swap is a table row: showing a new pose is no pixel work in script and nothing is sent to the GPU but the rectangles.
// A tick in which no Moru changed draws nothing.
const Q = new URLSearchParams(location.search), MODE = Q.get('mode') ?? 'strip', WARD = MODE === 'wardrobe', PIECES = Object.keys(ATLAS.pieces), N = WARD ? PIECES.length + 10 : +(Q.get('n') ?? 8), SEED = +(Q.get('seed') ?? 7), CAPTURE = Q.has('capture');
const REDUCED = Q.has('reduced') || (!CAPTURE && matchMedia('(prefers-reduced-motion: reduce)').matches), HZ = +(Q.get('hz') ?? 10), TICK = 1000 / HZ;
const W = Math.floor(+(Q.get('w') ?? innerWidth)), PER_ROW = Math.floor((W - 40) / 150), H = WARD ? Math.ceil(N / PER_ROW) * 150 + 20 : 300, LANE0 = WARD ? 120 : 200, LANE_DY = WARD ? 150 : 26;
const SLOTS = ['body', 'accessory', 'head'];
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
const world = createWorld({ atlas: ATLAS, width: W, lanes: 3, seed: SEED, spots });
const palettes = Object.keys(ATLAS.palettes), by = slot => [null, ...PIECES.filter(k => ATLAS.pieces[k].slot === slot)];
const draw = world.rand, any = list => list[Math.floor(draw() * list.length)], sprites = new Map(), ROOMS = WARD ? 0 : 2, STATES = ['commit', 'stuck', 'merge', 'waiting'], tags = [];
for (let i = 0; i < N; i++) {
  // Random mix and match: a palette, and a piece or nothing in each slot (a head piece more often than not).
  const head = any(by('head').slice(draw() < 0.8 ? 1 : 0)), m = addMoru(world, { id: 'm' + String(i).padStart(2, '0'), x: 30 + (i + 0.5) * ((W - 190) / N) - 64, lane: i % 3, palette: palettes[i % palettes.length], wear: { head, body: draw() < 0.6 ? any(by('body')) : null, accessory: draw() < 0.4 ? any(by('accessory')) : null }, room: i < ROOMS });
  sprites.set(m, { row: 1 + palettes.indexOf(m.palette), was: null, lastX: m.x, trail: 0, say: '', state: -2, said: null, chip: null, q: new Float32Array(48 * 20), n: 0 });
  if (REDUCED) m.facing = i % 2 ? -1 : 1;
  if (WARD) { m.facing = 1; m.x = 20 + (i % PER_ROW) * 150; m.depth = Math.floor(i / PER_ROW); const piece = ATLAS.pieces[PIECES[i]]; m.palette = palettes[i % palettes.length]; sprites.get(m).row = 1 + palettes.indexOf(m.palette); if (piece) m.wear = { head: null, body: null, accessory: null, [piece.slot]: PIECES[i] }; else m.wear = { head: any(by('head').slice(1)), body: any(by('body').slice(1)), accessory: any(by('accessory')) };
    const [clip, frame] = (Q.get('pose') ?? 'rest:0').split(':'); m.clip = clip; m.frame = +frame; tags.push([piece ? `${piece.slot}: ${piece.title}` : 'mix', m.x + 4, LANE0 + m.depth * LANE_DY + 16]); }
}
const within3 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// ---- The GPU side -------------------------------------------------------------------------------------------------------
const gl = view.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: CAPTURE || WARD || REDUCED, powerPreference: 'low-power' });
if (!gl || gl.getParameter(gl.MAX_TEXTURE_SIZE) < Math.max(BASE.w, BASE.h) || colours.length > 64) { hud.textContent = `This prototype needs WebGL with ${BASE.w} px textures.`; throw new Error('WebGL'); }
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
const texture = (unit, format, w, h, data) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  if (data instanceof HTMLCanvasElement) gl.texImage2D(gl.TEXTURE_2D, 0, format, format, gl.UNSIGNED_BYTE, data); else gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, gl.UNSIGNED_BYTE, data); };
{ const both = new Uint8Array(BASE.w * BASE.h * 2); for (let i = 0; i < BASE.data.length; i++) { both[2 * i] = BASE.data[i]; both[2 * i + 1] = OVER.data[i]; } texture(0, gl.LUMINANCE_ALPHA, BASE.w, BASE.h, both); BASE.data = OVER.data = null; }
texture(1, gl.LUMINANCE, CLOTHES.w, CLOTHES.h, CLOTHES.data);
const luts = [plain, ...palettes.map(lutOf)].map(l => { const row = new Uint32Array(64); row.set(l); return row; });
{ const rows = new Uint32Array(64 * luts.length); luts.forEach((l, r) => rows.set(l, r * 64)); texture(2, gl.RGBA, 64, luts.length, new Uint8Array(rows.buffer)); }
// One small texture for the rooms' labels.
const LW = 640, LH = 18 * 6; texture(3, gl.RGBA, LW, LH, null); texture(4, gl.RGBA, W, H, bg); bg.width = bg.height = 0;
const shader = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }, prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, `attribute vec2 aPos, aUv, aMask, aKind; uniform vec2 uView; varying vec2 vUv, vMask, vKind;
void main() { gl_Position = vec4(aPos.x / uView.x * 2. - 1., 1. - aPos.y / uView.y * 2., 0., 1.); vUv = aUv; vMask = aMask; vKind = aKind; }`));
// Kind 0 the body sheet, 1 the flipper and prop sheet, 2 the wardrobe (a mask position keeps it to the body fill), 3 script-drawn, 4 the floor, 5 the shadow.
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `precision highp float; uniform sampler2D uPose, uClothes, uPalette, uLoose, uBg; uniform vec2 uPoseSize, uClothesSize, uLooseSize, uView; uniform vec3 uFill; varying vec2 vUv, vMask, vKind;
void main() { float k;
  if (vKind.x < 0.5) k = texture2D(uPose, vUv / uPoseSize).r; else if (vKind.x < 1.5) k = texture2D(uPose, vUv / uPoseSize).a; else if (vKind.x < 2.5) k = texture2D(uClothes, vUv / uClothesSize).r;
  else if (vKind.x < 3.5) { vec4 c = texture2D(uLoose, vUv / uLooseSize); gl_FragColor = vec4(c.rgb * c.a, c.a); return; }
  else if (vKind.x < 4.5) { gl_FragColor = texture2D(uBg, vUv / uView); return; }
  else { gl_FragColor = vec4(0.0902, 0.0980, 0.1765, 1.) * 0.2745; return; }
  float i = floor(k * 255. + 0.5); if (i < 0.5) discard;
  if (vMask.x >= 0.) { float f = floor(texture2D(uPose, vMask / uPoseSize).r * 255. + 0.5); if (abs(f - uFill.x) > 0.5 && abs(f - uFill.y) > 0.5) discard; }
  gl_FragColor = texture2D(uPalette, vec2((i + 0.5) / 64., (vKind.y + 0.5) / uFill.z)); }`));
gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); gl.useProgram(prog);
const U = n => gl.getUniformLocation(prog, n); ['uPose', 'uClothes', 'uPalette', 'uLoose', 'uBg'].forEach((n, i) => gl.uniform1i(U(n), i));
gl.uniform2f(U('uView'), W, H); gl.uniform2f(U('uPoseSize'), BASE.w, BASE.h); gl.uniform2f(U('uClothesSize'), CLOTHES.w, CLOTHES.h); gl.uniform2f(U('uLooseSize'), LW, LH); gl.uniform3f(U('uFill'), STONE, IVORY, luts.length);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); ['aPos', 'aUv', 'aMask', 'aKind'].forEach((n, i) => { const at = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 32, i * 8); });
gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.viewport(0, 0, W, H);
const verts = new Float32Array(48 * (1 + N * 20)); { let o = 0; for (const [x, y] of [[0, 0], [W, 0], [0, H], [0, H], [W, 0], [W, H]]) { verts.set([x, y, x, y, -1, -1, 4, 0], o); o += 8; } }
// A room's label is drawn once for each thing it can say.
const chips = new Map(), pen = document.createElement('canvas'), chipOf = say => { let chip = chips.get(say); if (chip) return chip; const g = pen.getContext('2d'); g.font = '11px ui-monospace, Menlo, monospace';
  const tw = Math.min(LW / 2, Math.ceil(g.measureText(say).width) + 12), live = !say.endsWith('idle'), at = chips.size % 12; pen.width = tw; pen.height = 17; g.font = '11px ui-monospace, Menlo, monospace';
  P(g, 0, 0, tw, 17, live ? '#fff1d7' : '#50569c'); P(g, 1, 1, tw - 2, 15, live ? '#fff1d7' : '#17192d'); g.fillStyle = live ? '#17192d' : '#9399e5'; g.fillText(say, 6, 12);
  chip = { x: (at % 2) * LW / 2, y: 18 * Math.floor(at / 2), w: tw }; gl.activeTexture(gl.TEXTURE3); gl.texSubImage2D(gl.TEXTURE_2D, 0, chip.x, chip.y, gl.RGBA, gl.UNSIGNED_BYTE, pen); chips.set(say, chip); return chip; };

// Laying a pose out makes no garbage: one set of working values, written by compose and read by the two helpers below.
let q, o = 0, X0 = 0, Y0 = 0, left = false, cos = 1, sin = 0, pvx = 0, pvy = 0, mu = 0, mv = 0, partsN = 0; const partOf = [], partX = new Int16Array(16), partY = new Int16Array(16);
/** One corner: a place in the cell, a place in its sheet, whether it turns with a turned pose, whether the body's fill masks it, which sheet and which palette row. */
function corner(x, y, u, v, spin, masked, kind, row) {
  if (spin) { const dx = x - pvx, dy = y - pvy; x = pvx + dx * cos - dy * sin; y = pvy + dx * sin + dy * cos; }
  q[o++] = left ? X0 + 137 - x : X0 + x; q[o++] = Y0 + y; q[o++] = u; q[o++] = v; q[o++] = masked ? mu + x : -1; q[o++] = masked ? mv + y : -1; q[o++] = kind; q[o++] = row;
}
function rect(x0, y0, x1, y1, u0, v0, u1, v1, spin, masked, kind, row) {
  corner(x0, y0, u0, v0, spin, masked, kind, row); corner(x1, y0, u1, v0, spin, masked, kind, row); corner(x0, y1, u0, v1, spin, masked, kind, row);
  corner(x0, y1, u0, v1, spin, masked, kind, row); corner(x1, y0, u1, v0, spin, masked, kind, row); corner(x1, y1, u1, v1, spin, masked, kind, row);
}
/** The worn pieces of one layer. A piece on the skin is cut to the pose's box, so the mask is read from this pose and no other (a turned piece must lie inside it whole). */
function wear(at, f, bx, by, bw, bh, turned, tintRow) {
  for (let i = 0; i < partsN; i++) { const p = partOf[i]; if (p.layer !== at) continue;
    const x0 = (f.flip ? 136 - (partX[i] + p.w - 1) : partX[i]) + f.px, x1 = x0 + p.w, y0 = partY[i], y1 = y0 + p.h, ul = f.flip ? p.sx + p.w : p.sx, ur = f.flip ? p.sx : p.sx + p.w, row = p.tint ? tintRow : 0;
    if (at !== 'skin') { rect(x0, y0, x1, y1, ul, 0, ur, p.h, turned, false, 2, row); continue; }
    const xa = Math.max(x0, bx), xb = Math.min(x1, bx + bw), ya = Math.max(y0, by), yb = Math.min(y1, by + bh), du = f.flip ? -1 : 1; if (xa >= xb || ya >= yb) continue;
    if (turned) { const far = Math.hypot(Math.max(Math.abs(x0 - pvx), Math.abs(x1 - pvx)), Math.max(Math.abs(y0 - pvy), Math.abs(y1 - pvy))); if (pvx - far < bx || pvx + far > bx + bw || pvy - far < by || pvy + far > by + bh) continue; }
    rect(xa, ya, xb, yb, ul + du * (xa - x0), ya - y0, ul + du * (xb - x0), yb - y0, turned, true, 2, row); }
}
/** Lays out the rectangles of the Moru's pose now, back to front: shadow, pieces behind, body, pieces on the skin, pieces in front, flippers and props, label. */
function compose(m, s) {
  const id = m.facing < 0 && clips[m.clip + '~left'] ? m.clip + '~left' : m.clip, c = clips[id], fr = REDUCED && m.clip !== 'rest' ? c.still : m.frame, f = c.f[fr], box = c.box, bx = box[0], by = box[1], bw = box[2], bh = box[3];
  // Soft pieces trail: behind the anchor's last move, and back from the direction of travel.
  const off = c.wear ? c.wear.off[fr] : null, was = s.was ?? f.a, moved = Math.sign(m.x - s.lastX) * m.facing; s.trail = moved > 0 ? 1 : 0; s.lastX = m.x; s.was = f.a; partsN = 0;
  for (let k3 = 0; k3 < 3; k3++) { const slot = SLOTS[k3], piece = ATLAS.pieces[m.wear[slot]]; if (!piece) continue; for (let p of piece.parts) {
    if (p.alts) p = p.alts.droop && f.droop ? p.alts.droop : p.alts.up && f.air ? (fr & 1 ? p.alts.up : p.alts.down) : p.alts.down && f.sq >= 3 ? p.alts.down : p.alts.up && f.sq <= -2 ? p.alts.up : p;
    const a = f.a[p.anchor], b = was[p.anchor], k = p.soft, head = slot === 'head', lagX = k ? within3(Math.round((b[0] - a[0]) * k / 2), -k, k) - (k > 1 ? s.trail * (k - 1) : 0) : 0, lagY = k ? within3(Math.round((b[1] - a[1]) * k / 2), -1, k) : 0;
    partOf[partsN] = p; partX[partsN] = p.x + a[0] + lagX + (head && off ? off[0] : 0); partY[partsN++] = p.y + a[1] + lagY + (head && off ? off[1] : 0); } }
  // The cell's left edge in the room, and the mirror for a Moru that faces left. A turned pose is stored turned; its outfit is turned here, about the same point.
  X0 = Math.round(m.x); Y0 = Math.round(LANE0 + m.depth * LANE_DY - m.height) - 100; left = m.facing < 0; q = s.q; o = 0; mu = fr * bw - bx; mv = c.at - by;
  const turned = !!f.angle, cx = Math.round(f.cx), reach = f.air || m.height ? 20 : 30; if (turned) { cos = Math.cos(f.angle * Math.PI / 180); sin = Math.sin(f.angle * Math.PI / 180); pvx = f.pv[0]; pvy = f.pv[1]; }
  rect(cx - reach + 1, 100, cx + reach, 101, 0, 0, 0, 0, false, false, 5, 0); rect(cx - reach + 7, 101, cx + reach - 6, 102, 0, 0, 0, 0, false, false, 5, 0);
  wear('behind', f, bx, by, bw, bh, turned, s.row); rect(bx, by, bx + bw, by + bh, fr * bw, c.at, (fr + 1) * bw, c.at + bh, false, false, 0, s.row);
  wear('skin', f, bx, by, bw, bh, turned, s.row); wear('front', f, bx, by, bw, bh, turned, s.row); rect(bx, by, bx + bw, by + bh, fr * bw, c.at, (fr + 1) * bw, c.at + bh, false, false, 1, 0);
  const state = m.room ? (m.cur.state ? 2 : m.claimed ? 1 : 0) : -1;
  if (state !== s.state || (state === 2 && s.said !== m.cur.state)) { s.state = state; s.said = m.cur.state; s.say = state < 0 ? '' : state === 2 ? `room ${m.id.slice(-1)}: ${m.cur.state} (real event)` : state ? `room ${m.id.slice(-1)}: working` : `room ${m.id.slice(-1)}: idle`; s.chip = s.say ? chipOf(s.say) : null; }
  if (s.chip) { const chip = s.chip, x = left ? 117 - chip.w : 20; rect(left ? x + chip.w : x, 2, left ? x : x + chip.w, 19, chip.x, chip.y, chip.x + chip.w, chip.y + 17, false, false, 3, 0); }
  s.n = o;
}
const order = [...sprites.values()]; for (const [m, s] of sprites) s.m = m;
let painted = 0, redrawn = 0, sent = 0, lastHud = -1e9, nextEvent = 9000, eventNo = 0;
if (WARD) for (const [text, x, y] of tags) { const tag = document.createElement('div'); tag.textContent = text; tag.style.cssText = `position:absolute;left:${x}px;bottom:${H - y - 3}px;font:11px ui-monospace,Menlo,monospace;color:#99968f;white-space:pre`; document.body.append(tag); }
function paint() {
  let changed = !redrawn || Q.has('frozen'); const t0 = performance.now();
  for (let i = 0; i < order.length; i++) { const s = order[i], m = s.m, live = m.room ? (m.cur.state ? 2 : m.claimed ? 1 : 0) : 0; if (!m.changed && live === s.live && s.n) continue; s.live = live; compose(m, s); m.changed = false; painted++; changed = true; }
  const t2 = performance.now(); spent.lay += t2 - t0;
  if (changed) { let end = 48;
    // Back to front. The order hardly changes from tick to tick, so it is kept and only nudged.
    for (let i = 1; i < order.length; i++) { const s = order[i]; let k = i - 1; while (k >= 0 && order[k].m.depth > s.m.depth) { order[k + 1] = order[k]; k--; } order[k + 1] = s; }
    for (let i = 0; i < order.length; i++) { const s = order[i], from = s.q; for (let k = 0; k < s.n; k++) verts[end + k] = from[k]; end += s.n; }
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, end), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, end / 8); redrawn++; sent += end / 48; spent.draw += performance.now() - t2; }
  if (!WARD && !Q.has('nohud') && world.now - lastHud >= 1000) { lastHud = world.now; const st = world.stats, last = world.log.at(-1); hud.textContent = `${(world.now / 1000).toFixed(0)} s   ${N} Moru   played together ${st.interactions}   pranks ${st.pranks}   outfit swaps ${st.swaps}   said no ${st.declines}` + (last ? `   last real event cut in after ${Math.round(last.waited)} ms` : ''); }
}
function step(dt) { if (ROOMS && world.now >= nextEvent) { raise(world, 'm0' + (eventNo % ROOMS), STATES[eventNo % STATES.length]); eventNo++; nextEvent += 11000; } tick(world, dt); }
let timer = 0, wakes = 0;
let busy = 0; const spent = { think: 0, lay: 0, draw: 0 }; const loop = () => { const t = performance.now(); wakes++; if (!Q.has('frozen')) step(TICK); const t1 = performance.now(); spent.think += t1 - t; paint(); busy += performance.now() - t; };
const start = () => { if (!timer && !REDUCED && !CAPTURE && !WARD) timer = setInterval(loop, TICK); }, stop = () => { clearInterval(timer); timer = 0; };
// Nothing runs while nobody can see it.
let onScreen = true; const sync = () => (onScreen && !document.hidden ? start() : stop());
document.addEventListener('visibilitychange', sync); new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(view);
if (REDUCED && ROOMS) { const m = world.morus[0]; m.clip = 'ask'; m.cur = { state: 'waiting' }; }
paint(); sync();
window.life = { world, advance(ms) { for (let t = 0; t < ms - 1; t += TICK) step(TICK); paint(); return world.now; }, counters: () => ({ painted, redrawn, sent, wakes, busy, spent: { ...spent }, now: world.now }), memory: () => ({ gpuMB: +((BASE.w * BASE.h * 2 + CLOTHES.data.length + LW * LH * 4 + W * H * 4 * 3) / 1048576).toFixed(1), scriptMB: +((CLOTHES.data.length + verts.byteLength + sprites.size * 48 * 20 * 4) / 1048576).toFixed(2) }) };
