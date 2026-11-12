/** Deterministic exports from the retained Image Gen sources; no generation runs here. */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const ROOT = 'assets/brand/moru';
const COLORS = ['171923', '17192d', '50569c', '6d73d2', '555451', '777572', '99968f', 'aaa9a5', 'b8b4aa', 'd6d3c9', 'fff1d7', '9399e5'];
const PALETTE = COLORS.map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
const NEUTRALS = PALETTE.filter(p => Math.max(...p) - Math.min(...p) < 30);
const [STONE, IVORY] = ['d6d3c9', 'fff1d7'].map(hex => PALETTE[COLORS.indexOf(hex)]);

/** Dark achromatic shading must not become indigo; bright warm ivory remains ivory. */
export function moruColor(r, g, b) {
  if (r >= 235 && r - g >= 5 && r - b >= 18) return IVORY;
  const achromatic = Math.max(r, g, b) - Math.min(r, g, b) < 35;
  if (achromatic && Math.min(r, g, b) >= 150) return STONE;
  const candidates = achromatic ? NEUTRALS : PALETTE;
  return candidates.reduce((best, p) => {
    const distance = q => (r - q[0]) ** 2 + (g - q[1]) ** 2 + (b - q[2]) ** 2;
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

async function cell(source, columns, rows, index, size) {
  const file = join(ROOT, source), meta = await sharp(file).metadata();
  const left = Math.round(index % columns * meta.width / columns);
  const top = Math.round(Math.floor(index / columns) * meta.height / rows);
  const right = Math.round((index % columns + 1) * meta.width / columns);
  const bottom = Math.round((Math.floor(index / columns) + 1) * meta.height / rows);
  const data = await sharp(file).extract({ left, top, width: right - left, height: bottom - top }).resize(size, size, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 240) { data.fill(0, i, i + 4); continue; }
    const color = moruColor(data[i], data[i + 1], data[i + 2]);
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
  }
  return data;
}

async function strip(frames, size) {
  return sharp({ create: { width: size * frames.length, height: size, channels: 4, background: '#00000000' } })
    .composite(await Promise.all(frames.map(async (frame, i) => ({ input: await png(frame, size), left: i * size, top: 0 })))).png().toBuffer();
}

export function moruBodyAnchor(data, size) {
  const isBody = p => data[p * 4 + 3] && data[p * 4] > 64 && data[p * 4 + 2] <= data[p * 4] + 30;
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

function registerBody(frame, reference, size, airborneOrigin) {
  const from = moruBodyAnchor(frame, size), to = moruBodyAnchor(reference, size);
  const origin = airborneOrigin ? moruBodyAnchor(airborneOrigin, size) : from;
  const scale = Math.sqrt(to.area / origin.area);
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
  for (const size of [64, 128]) {
    let neutral;
    for (const clip of spec.authored) {
      const count = clip.frames;
      if (count !== 24 || clip.durationsMs.length !== count) throw new Error(`${clip.id} must declare twenty-four timed source poses`);
      let frames = await Promise.all(Array.from({ length: count }, (_, i) => cell(clip.source, clip.columns, clip.rows, clip.offset + i, size)));
      const anchor = Math.round(size * 0.78);
      if (!neutral) {
        const fit = size * 7 / 8, inset = (size - fit) / 2;
        const padded = await raw(frames[0], size).resize(fit, fit, { kernel: 'nearest' }).extend({ left: inset, right: inset, top: 0, bottom: size - fit, background: '#00000000' }).raw().toBuffer();
        neutral = translate(padded, size, 0, anchor - bounds(padded, size)[3]);
      }
      const reference = clip.scene ? frames[0] : neutral;
      frames = frames.map((f, i) => {
        if (i === 0 || i === count - 1) return Buffer.from(reference);
        try { return clip.scene ? f : registerBody(f, reference, size, clip.airborne ? frames[0] : undefined); }
        catch (error) { throw new Error(`${clip.id} frame ${i + 1} at ${size}px: ${error.message}`); }
      });
      framesBySize[size][clip.id] = frames;
    }
    for (const clip of spec.compositions) {
      const [a, b] = clip.sequence.map(id => framesBySize[size][id]);
      if (!a || !b) throw new Error(`Missing constituent in ${clip.id}`);
      framesBySize[size][clip.id] = [...a, ...b.slice(1)];
    }
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
  for (const [name, pose] of Object.entries({ welcome: 'compact-portrait', curious: 'tilt-right' })) await put(`${canonical}/mascot-${name}-32.png`, await sharp(join(ROOT, poses[pose].path)).resize(32, 32, { kernel: 'nearest' }).png().toBuffer());
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
  const manifest = { name: 'Moru', version: spec.version, nativeCell: 128, palette: COLORS.map(x => `#${x}`), clips, poses, compass: 'icons/atlas-compass-1024.png', runtime: { greeting: 'wave', waiting: 'blink', connect: 'connect', compile: 'source-read', walk: 'wave', read: 'source-read', success: 'dance' }, scope: 'Local design catalogue. Only explicitly mapped and observed runtime states play in the app; no animation grants approval or accepts meaning.' };
  await put(join(ROOT, 'moru.json'), JSON.stringify(manifest, null, 2) + '\n');
  await put(join(ROOT, 'preview-data.js'), `globalThis.moruManifest = ${JSON.stringify(manifest)};\n`);
  console.log(`[moru] ${spec.authored.length} authored clips + ${spec.compositions.length} compositions; ${Object.keys(poses).length} poses; compass 16–1024px`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildMoru();
