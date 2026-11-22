// The host: one timer, one small canvas per Moru redrawn only when its pose changes, positions by CSS transform.
const Q = new URLSearchParams(location.search), MODE = Q.get('mode') ?? 'strip', WARD = MODE === 'wardrobe', PIECES = Object.keys(ATLAS.pieces), N = WARD ? PIECES.length + 10 : +(Q.get('n') ?? 8), SEED = +(Q.get('seed') ?? 7), CAPTURE = Q.has('capture');
const REDUCED = Q.has('reduced') || (!CAPTURE && matchMedia('(prefers-reduced-motion: reduce)').matches);
const ZOOM = +(Q.get('zoom') ?? 1), W = Math.floor(+(Q.get('w') ?? innerWidth) / ZOOM), FARM = MODE === 'farm', PER_ROW = Math.floor((W - 40) / 150), H = WARD ? Math.ceil(N / PER_ROW) * 150 + 20 : FARM ? 400 : 300, LANE0 = WARD ? 120 : FARM ? 300 : 200, LANE_DY = WARD ? 150 : FARM ? 30 : 26;
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
const [BASE, OVER, CLOTHES] = [await indexed(SHEETS.base), await indexed(SHEETS.over), await indexed(SHEETS.wardrobe)];
const clips = ATLAS.clips, STONE = colourIndex.get(hex32(ATLAS.tones.body)), IVORY = colourIndex.get(hex32(ATLAS.tones.belly)), plain = Uint32Array.from(colours), SHADOW = 0x4617192d >>> 0;
const lutOf = name => { const lut = Uint32Array.from(colours), [body, belly] = ATLAS.palettes[name]; lut[STONE] = hex32(body); lut[IVORY] = hex32(belly); return lut; };

const stage = document.getElementById('stage'), worldEl = document.getElementById('world'), hud = document.getElementById('hud');
worldEl.style.width = W + 'px'; worldEl.style.height = H + 'px'; worldEl.style.transform = `scale(${ZOOM})`; worldEl.style.transformOrigin = '0 100%';
const layer = (z, cls) => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.className = cls ?? ''; c.style.zIndex = z; worldEl.append(c); return c.getContext('2d'); };
const P = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const oval = (g, cx, cy, rx, ry, c, half = false) => { for (let y = -ry; y <= (half ? 0 : ry); y += 2) { const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)) / 2) * 2; P(g, cx - w, cy + y, 2 * w, 2, c); } };
const INK = '#17192d';
function paintStrip() { const g = layer(0); P(g, 0, 0, W, H, '#0b0b0a'); P(g, 0, LANE0 - 14, W, H, '#11121c'); P(g, 0, LANE0 - 14, W, 2, '#262a45'); }
function paintFarm() {
  const sky = layer(0), land = layer(2), dusk = layer(100, 'dusk'), HZ = 210;
  ['#7f87d9', '#8b93dd', '#99a0e2', '#a9aee8', '#bbbdea', '#cfcdea', '#e2d6dc', '#ead9c8'].forEach((c, i, a) => P(sky, 0, Math.round(i * HZ / a.length / 2) * 2, W, HZ, c));
  for (const [x, y, w] of [[W * 0.16, 34, 90], [W * 0.42, 66, 130], [W * 0.63, 24, 70]]) { P(sky, x, y, w, 8, '#e9e6f6'); P(sky, x + 14, y - 8, w - 40, 8, '#e9e6f6'); P(sky, x + 30, y + 8, w - 50, 4, '#d5d3ee'); }
  oval(land, W * 0.22, HZ + 6, W * 0.24, 70, '#8f97c9', true); oval(land, W * 0.72, HZ + 6, W * 0.3, 92, '#8891c4', true); oval(land, W * 0.47, HZ + 6, W * 0.2, 46, '#7c9fa5', true);
  P(land, 0, HZ, W, H - HZ, '#9cc9ae'); P(land, 0, HZ, W, 4, '#b4d9be'); P(land, 0, 332, W, H - 332, '#8dbda0'); P(land, 0, 332, W, 2, '#84b497');
  // A worn path along the middle lane.
  for (let x = 0; x < W; x += 2) { const y = 322 + Math.round(Math.sin(x / 170) * 5 / 2) * 2; P(land, x, y, 2, 16, '#b9d7b4'); }
  let s = 91; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < Math.round(W / 120); i++) { const x = Math.round(rnd() * (W - 40) / 2) * 2 + 10, y = 222 + Math.round(rnd() * 80) * 2; P(land, x, y, 2, 6, '#6fa68a'); P(land, x + 4, y - 2, 2, 8, '#6fa68a'); P(land, x + 8, y + 2, 2, 4, '#6fa68a'); if (i % 3 === 0) { P(land, x + 16, y - 2, 6, 6, '#f2b3c6'); P(land, x + 18, y, 2, 2, '#fff1d7'); P(land, x + 18, y + 4, 2, 6, '#6fa68a'); } }
  // Trees behind the fence.
  for (const [x, r] of [[W * 0.3, 44], [W * 0.36, 34], [W * 0.56, 40]]) { P(land, x - 6, 150, 12, 66, INK); P(land, x - 4, 150, 8, 66, '#50569c'); oval(land, x, 140, r + 2, r + 2, INK); oval(land, x, 140, r, r, '#5f9c84'); oval(land, x - 8, 130, r - 14, r - 16, '#74b095'); }
  // Fence along the back.
  const f0 = 528, fn = Math.max(0, Math.floor((W - 640 - f0) / 72)); P(land, f0, 190, fn * 72 + 8, 4, '#d6d3c9'); P(land, f0, 206, fn * 72 + 8, 4, '#d6d3c9');
  for (let i = 0; i <= fn; i++) { const x = f0 + i * 72; P(land, x - 2, 180, 12, 46, INK); P(land, x, 182, 8, 42, '#fff1d7'); P(land, x, 182, 2, 42, '#d6d3c9'); }
  // Shed.
  const sx = 64, sy = 166; P(land, sx - 2, sy - 2, 184, 104, INK); P(land, sx, sy, 180, 100, '#fff1d7'); P(land, sx, sy, 18, 100, '#d6d3c9'); for (let x = sx + 42; x < sx + 180; x += 24) P(land, x, sy, 2, 100, '#e9dcc0');
  for (let i = 0; i < 28; i++) { const y = sy - 56 + i * 2, w = 96 + i * 4; P(land, sx + 90 - w / 2 - 2, y, w + 4, 2, INK); P(land, sx + 90 - w / 2, y, w, 2, i < 2 ? '#6d73d2' : i % 7 === 6 ? '#454b8c' : '#50569c'); } P(land, sx - 22, sy, 224, 2, INK);
  P(land, sx + 60, sy + 32, 52, 70, INK); P(land, sx + 62, sy + 34, 48, 66, '#6d73d2'); P(land, sx + 62, sy + 34, 48, 4, '#9399e5'); P(land, sx + 84, sy + 34, 2, 66, '#50569c'); P(land, sx + 100, sy + 66, 4, 4, '#fff1d7');
  P(land, sx + 126, sy + 20, 36, 30, INK); P(land, sx + 128, sy + 22, 32, 26, '#9399e5'); P(land, sx + 143, sy + 22, 2, 26, INK); P(land, sx + 128, sy + 34, 32, 2, INK);
  // Hay pile and crates.
  oval(land, 330, 272, 62, 54, INK, true); oval(land, 330, 272, 58, 50, '#e8d1a7', true); for (const [x, y, w] of [[296, 244, 22], [330, 232, 26], [344, 254, 30], [304, 260, 18]]) P(land, x, y, w, 2, '#c9ae7c'); P(land, 268, 270, 126, 2, INK);
  for (const [x, y] of [[404, 226], [452, 226], [428, 180]]) { P(land, x - 2, y - 2, 50, 48, INK); P(land, x, y, 46, 44, '#b8b4aa'); P(land, x, y, 46, 4, '#d6d3c9'); P(land, x + 6, y + 12, 34, 2, '#99968f'); P(land, x + 6, y + 22, 34, 2, '#99968f'); P(land, x + 6, y + 32, 34, 2, '#99968f'); P(land, x + 22, y + 4, 2, 40, '#99968f'); }
  // Pond with a jetty, lily pads and reeds; the fish basket on its near shore.
  const px = W - 300, py = 252; oval(land, px, py, 244, 38, INK); oval(land, px, py, 240, 34, '#6d73d2'); oval(land, px, py - 4, 232, 26, '#7c82da');
  for (const [dx, dy, w] of [[-120, -8, 40], [30, 6, 56], [110, -12, 30], [-40, 14, 34]]) P(land, px + dx, py + dy, w, 2, '#9399e5');
  for (const [dx, dy] of [[70, -6], [96, 4], [-150, 10]]) { P(land, px + dx - 2, py + dy - 2, 20, 10, INK); P(land, px + dx, py + dy, 16, 6, '#74b095'); P(land, px + dx + 10, py + dy, 4, 2, '#7c82da'); }
  P(land, px - 250, py - 6, 84, 14, INK); P(land, px - 248, py - 4, 80, 10, '#d1b888'); for (let x = px - 232; x < px - 170; x += 16) P(land, x, py - 4, 2, 10, '#b99a6b'); P(land, px - 176, py + 6, 6, 12, INK);
  for (const [dx, h] of [[196, 46], [208, 60], [220, 38]]) { P(land, px + dx, py - h, 2, h, '#4f8a6c'); P(land, px + dx - 2, py - h - 10, 6, 12, '#50569c'); }
  const bx = px - 300, by = 262; P(land, bx - 2, by - 2, 44, 30, INK); P(land, bx, by, 40, 26, '#d1b888'); for (let y = by + 6; y < by + 26; y += 8) P(land, bx, y, 40, 2, '#b99a6b'); for (let x = bx + 8; x < bx + 40; x += 10) P(land, x, by, 2, 26, '#b99a6b');
  for (const [dx, dy] of [[6, -10], [20, -14]]) { P(land, bx + dx - 2, by + dy - 2, 14, 14, INK); P(land, bx + dx, by + dy, 10, 12, '#6d73d2'); P(land, bx + dx + 2, by + dy - 6, 6, 6, '#9399e5'); }
  // Dusk: one overlay whose opacity is the only thing that changes.
  ['#1d1846', '#261c52', '#33225e', '#3f2a66', '#3b2a66', '#33265c'].forEach((c, i, a) => P(dusk, 0, Math.round(i * H / a.length / 2) * 2, W, H, c));
  for (let i = 0; i < 9; i++) P(dusk, Math.round(rnd() * W / 2) * 2, Math.round(rnd() * 70) * 2 + 8, 2, 2, '#fff1d7');
  const sun = document.createElement('canvas'); sun.width = sun.height = 64; sun.className = 'sun'; sun.style.left = W - 470 + 'px'; const sg = sun.getContext('2d'); oval(sg, 32, 32, 30, 30, '#f7e3c4'); oval(sg, 32, 32, 24, 24, '#fff1d7'); worldEl.append(sun);
  const glow = document.createElement('div'); glow.className = 'glow'; glow.style.cssText = `left:${sx + 128}px;top:${sy + 22}px;width:32px;height:26px`; worldEl.append(glow);
  return { spots: [{ x: px - 268, dir: 1, clip: 'fish', lane: 0 }, { x: 250, dir: 1, clip: 'nap', lane: 1 }] };
}
const scene = FARM ? paintFarm() : (WARD ? P(layer(0), 0, 0, W, H, '#0b0b0a') : paintStrip(), { spots: [] });
const world = createWorld({ atlas: ATLAS, width: W, lanes: 3, seed: SEED, spots: scene.spots });
const palettes = Object.keys(ATLAS.palettes), by = slot => [null, ...Object.keys(ATLAS.pieces).filter(k => ATLAS.pieces[k].slot === slot)];
const draw = world.rand, any = list => list[Math.floor(draw() * list.length)], sprites = new Map(), ROOMS = FARM || WARD ? 0 : 2, STATES = ['commit', 'stuck', 'merge', 'waiting'];
for (let i = 0; i < N; i++) {
  // Random mix and match: a palette, and a piece or nothing in each slot (a head piece more often than not).
  const head = any(by('head').slice(draw() < 0.8 ? 1 : 0)), m = addMoru(world, { id: 'm' + String(i).padStart(2, '0'), x: 30 + (i + 0.5) * ((W - 190) / N) - 64, lane: i % 3, palette: palettes[i % palettes.length], wear: { head, body: draw() < 0.6 ? any(by('body')) : null, accessory: draw() < 0.4 ? any(by('accessory')) : null }, room: i < ROOMS });
  const el = document.createElement('canvas'); el.width = CW; el.height = CH; el.className = 'moru'; worldEl.append(el);
  const g = el.getContext('2d'), img = g.createImageData(CW, CH), chip = m.room ? Object.assign(document.createElement('div'), { className: 'chip' }) : null; if (chip) worldEl.append(chip);
  sprites.set(m, { el, g, img, px: new Uint32Array(img.data.buffer), fill: new Uint8Array(CW * CH), lut: lutOf(m.palette), crown: 0, lag: 0, chip, said: '' });
  if (REDUCED) m.facing = i % 2 ? -1 : 1;
  if (WARD) { m.facing = 1; m.x = 20 + (i % PER_ROW) * 150; m.depth = Math.floor(i / PER_ROW); const piece = ATLAS.pieces[PIECES[i]]; m.palette = palettes[i % palettes.length]; sprites.get(m).lut = lutOf(m.palette); if (piece) m.wear = { head: null, body: null, accessory: null, [piece.slot]: PIECES[i] }; else m.wear = { head: any(by('head').slice(1)), body: any(by('body').slice(1)), accessory: any(by('accessory')) };
    const [clip, frame] = (Q.get('pose') ?? 'rest:0').split(':'); m.clip = clip; m.frame = +frame; const tag = Object.assign(document.createElement('div'), { className: 'tag', textContent: piece ? `${piece.slot}: ${piece.title}` : 'mix' }); tag.style.transform = `translate(${m.x + 4}px,${LANE0 + m.depth * LANE_DY + 4}px)`; worldEl.append(tag); }
}
function compose(m, s) {
  const id = m.facing < 0 && clips[m.clip + '~left'] ? m.clip + '~left' : m.clip, c = clips[id], fr = REDUCED && m.clip !== 'rest' ? c.still : m.frame, f = c.f[fr], [bx, by, bw, bh] = c.box, { px, fill, lut } = s;
  px.fill(0); fill.fill(0);
  const cx = Math.round(f.cx) + (f.flip ? 0 : 0), reach = f.air ? 20 : 30; for (let x = -reach; x <= reach; x++) { px[(OY + 100) * CW + OX + cx + x] = SHADOW; if (Math.abs(x) < reach - 6) px[(OY + 101) * CW + OX + cx + x] = SHADOW; }
  const off = c.wear?.off[fr]; s.lag = Math.max(-1, Math.min(2, Math.round((s.crown - f.a.crown[1]) / 2))); s.crown = f.a.crown[1];
  const wear = at => { for (const slot of SLOTS) { const piece = ATLAS.pieces[m.wear[slot]]; if (!piece) continue; for (const p of piece.parts) if (p.layer === at) {
    const a = f.a[p.anchor], head = slot === 'head', X = p.x + a[0] + (head && off ? off[0] : 0), Y = p.y + a[1] + (head ? (off ? off[1] : 0) + s.lag : 0), table = p.tint ? lut : plain;
    for (let r = 0; r < p.h; r++) { const y = OY + Y + r; if (y < 0 || y >= CH) continue; for (let q = 0; q < p.w; q++) { const k = CLOTHES.data[r * CLOTHES.w + p.sx + q]; if (!k) continue; const x = OX + (f.flip ? 136 - (X + q) : X + q) + f.px; if (x < 0 || x >= CW) continue; const at2 = y * CW + x; if (at === 'skin' && !fill[at2]) continue; px[at2] = table[k]; } }
  } } };
  wear('behind');
  for (let y = 0; y < bh; y++) { const row = (c.at + y) * BASE.w + fr * bw, to = (OY + by + y) * CW + OX + bx; for (let x = 0; x < bw; x++) { const k = BASE.data[row + x]; if (k) { px[to + x] = lut[k]; if (k === STONE || k === IVORY) fill[to + x] = 1; } } }
  wear('skin'); wear('front');
  for (let y = 0; y < bh; y++) { const row = (c.at + y) * OVER.w + fr * bw, to = (OY + by + y) * CW + OX + bx; for (let x = 0; x < bw; x++) { const k = OVER.data[row + x]; if (k) px[to + x] = plain[k]; } }
  s.g.putImageData(s.img, 0, 0);
  const y = Math.round(LANE0 + m.depth * LANE_DY) - 100 - OY, x = Math.round(m.x) - OX;
  s.el.style.transform = `translate(${x}px,${y}px)` + (m.facing < 0 ? ' scaleX(-1)' : ''); s.el.style.zIndex = 10 + Math.round(m.depth * 10);
  if (s.chip) { const say = m.cur.state ? `room ${m.id.slice(-1)}: ${m.cur.state} (real event)` : m.claimed ? `room ${m.id.slice(-1)}: working` : `room ${m.id.slice(-1)}: idle`; if (say !== s.said) { s.chip.textContent = s.said = say; s.chip.dataset.live = m.cur.state || m.claimed ? '1' : ''; } s.chip.style.transform = `translate(${x + OX + 20}px,${y + OY + 4}px)`; }
}
let painted = 0, lastHud = -1e9, nextEvent = 9000, eventNo = 0;
function paint() {
  for (const [m, s] of sprites) if (m.changed || (s.chip && (m.claimed > 0) !== (s.said.endsWith('working') || !!m.cur.state))) { compose(m, s); m.changed = false; painted++; }
  if (world.now - lastHud >= 500) { lastHud = world.now; const st = world.stats, last = world.log.at(-1); hud.textContent = `${(world.now / 1000).toFixed(1)} s   ${N} Moru   played together ${st.interactions}   pranks ${st.pranks}   outfit swaps ${st.swaps}   said no ${st.declines}` + (last ? `   last real event cut in after ${last.waited} ms` : ''); }
  if (CAPTURE && FARM) { const day = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (world.now / 1000 - 6) / 12)) * Math.PI); worldEl.style.setProperty('--dusk', (0.55 * day).toFixed(3)); worldEl.style.setProperty('--sun', Math.round(day * 150) + 'px'); }
}
function step(dt) { if (ROOMS && world.now >= nextEvent) { raise(world, 'm0' + (eventNo % ROOMS), STATES[eventNo % STATES.length]); eventNo++; nextEvent += 11000; } tick(world, dt); }
let timer = 0, last = 0, wakes = 0;
function loop() { const now = performance.now(), dt = Math.min(250, now - last); last = now; wakes++; step(dt); paint(); timer = setTimeout(loop, due(world)); }
const start = () => { if (!timer && !REDUCED && !CAPTURE) { last = performance.now(); timer = setTimeout(loop, 33); } }, stop = () => { clearTimeout(timer); timer = 0; };
// Nothing runs while nobody can see it.
let onScreen = true; const sync = () => (onScreen && !document.hidden ? start() : stop());
document.addEventListener('visibilitychange', sync); new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(stage);
if (REDUCED) { document.documentElement.dataset.reduced = '1'; if (ROOMS) { const m = world.morus[0]; m.clip = 'ask'; m.cur = { state: 'waiting' }; } }
if (CAPTURE) document.documentElement.dataset.capture = '1';
// The farm clip opens with four intentions out of the Moru's own repertoire, so a short recording shows them all; after that every choice is theirs.
if (FARM && !REDUCED && !Q.has('plain')) { const taken = new Set(), nearest = x => { const m = world.morus.filter(m => !taken.has(m)).sort((a, b) => Math.abs(a.x + 68 - x) - Math.abs(b.x + 68 - x))[0]; taken.add(m); return m; };
  for (const spot of scene.spots) { const m = nearest(spot.x); m.mood.energy = spot.clip === 'nap' ? 0.2 : 0.9; nudge(world, m.id, 'spot:' + spot.clip); }
  for (const kind of ['swap', 'prank']) nudge(world, nearest(W * (kind === 'swap' ? 0.45 : 0.72)).id, kind); }
paint(); sync();
window.life = { world, advance(ms) { for (let t = 0; t < ms; t += 10) step(10); paint(); return world.now; }, counters: () => ({ painted, wakes, now: world.now }), memory: () => ({ sheetsMB: +((BASE.data.length + OVER.data.length + CLOTHES.data.length) / 1048576).toFixed(1), spritesMB: +(sprites.size * CW * CH * 4 * 2 / 1048576).toFixed(1) }) };
