import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { NATIVE_ROWS } from './build-moru-companion.mjs';
import { despeckle, faintMarks, holdBody, inkFringe, ivoryFringe, liftFreeInk, moruBodyAnchor, moruColor, reduceMoru } from './build-moru-sprites.mjs';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const INK = [23, 25, 35], SKIN = [214, 211, 201], IVORY = [255, 241, 215], FREE_INK = [109, 115, 210], FRINGE_GRAY = [85, 84, 81], MID_FRINGE_GRAY = [119, 117, 114], HAZE_GRAY = [153, 150, 143];

function canvas(size) {
  const data = Buffer.alloc(size * size * 4);
  const paint = (x0, y0, x1, y1, color) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...color, 255], (y * size + x) * 4); };
  const at = (buffer, x, y, width = size) => buffer[(y * width + x) * 4 + 3] ? [...buffer.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)] : null;
  return { data, paint, at };
}

async function frameOf(file, frame, size) {
  return sharp(file).extract({ left: frame * size, top: 0, width: size, height: size }).ensureAlpha().raw().toBuffer();
}

for (const name of ['moru-companion', 'moru-reactions']) test(`the shipped ${name} retains native facial pixels and a matching cache identity`, async () => {
  const source = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  const playback = JSON.parse(await readFile(`src/shared/ui/marks/moru/${name}.json`, 'utf8'));
  const file = await readFile(`public/brand/${name}.png`);
  const meta = await sharp(file).metadata();
  assert.ok(meta.width <= 4096 && meta.height <= 4096, 'runtime sprite pages must fit a compact texture');
  assert.equal(meta.width, playback.columns * source.nativeCell);
  assert.equal(meta.height, playback.rows * source.nativeCell);
  assert.equal(playback.digest, createHash('sha256').update(file).digest('hex').slice(0, 12));
  for (const [id, clip] of Object.entries(playback.clips)) {
    for (let frame = 0; frame < source.clips[id].frames; frame++) {
      const cell = source.nativeCell, index = clip.firstFrame + frame;
      const original = await sharp(`assets/brand/moru/${source.clips[id].sprite}`).extract({ left: frame * cell, top: 0, width: cell, height: cell }).raw().toBuffer();
      const shipped = await sharp(file).extract({ left: index % playback.columns * cell, top: Math.floor(index / playback.columns) * cell, width: cell, height: cell }).raw().toBuffer();
      assert.deepEqual(shipped, original, `${id} frame ${frame} lost native face detail during runtime export`);
    }
  }
});

test('large pending marks retain the native scene rather than enlarged low-resolution pixels', async () => {
  const source = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  for (const [state, id] of Object.entries(NATIVE_ROWS)) {
    assert.deepEqual(await readFile(`public/brand/mascot-${state}-row-128.png`), await readFile(`assets/brand/moru/${source.clips[id].sprite}`));
  }
});

test('every native row swaps on the shared neutral pose except the laptop scene', async () => {
  const neutral = await frameOf('public/brand/mascot-waiting-row-128.png', 0, 128);
  const scenes = [];
  for (const state of Object.keys(NATIVE_ROWS)) {
    const file = `public/brand/mascot-${state}-row-128.png`, { width } = await sharp(file).metadata();
    const [first, last] = await Promise.all([frameOf(file, 0, 128), frameOf(file, width / 128 - 1, 128)]);
    assert.deepEqual(first, last, `${state}: its loop does not close on its first cell`);
    if (!first.equals(neutral)) scenes.push(state);
  }
  assert.deepEqual(scenes, ['code'], 'a row that does not open on the neutral pose would jump when the stage swaps clips');
});

test('the observed gray right-eye edge stays achromatic instead of turning indigo', () => {
  for (const rgb of [[120, 117, 117], [109, 107, 104], [113, 111, 113]]) {
    const actual = moruColor(...rgb);
    assert.ok(Math.max(...actual) - Math.min(...actual) < 30, `gray eye edge ${rgb} became colored: ${actual}`);
  }
});

test('near-neutral warm ivory stays ivory instead of becoming gray belly speckles', () => {
  for (const rgb of [[244, 232, 219]]) {
    const actual = moruColor(...rgb);
    assert.ok(actual[0] - actual[2] > 30, `warm belly became gray: ${actual}`);
  }
});

test('an opted-in blush stays coral without recoloring the ordinary gray and ivory inks', () => {
  const coral = [[217, 108, 117], [238, 154, 147]];
  for (const color of coral) {
    assert.deepEqual(moruColor(...color, coral), color, 'the expressive face lost its requested blush');
    assert.notDeepEqual(moruColor(...color), color, 'an ordinary clip acquired a blush accent');
  }
  for (const color of [[214, 211, 201], [244, 232, 219], [109, 115, 210]]) {
    assert.deepEqual(moruColor(...color, coral), moruColor(...color), 'accent opt-in changed an ordinary ink');
  }
});

test('small neutral source variations form clean gray clusters instead of mottled skin', () => {
  const skin = moruColor(214, 211, 201);
  for (const rgb of [[198, 196, 190], [204, 202, 196], [215, 214, 209], [219, 212, 200], [224, 216, 200]]) assert.deepEqual(moruColor(...rgb), skin);
});

test('a tail detaching during a stretch does not move or resize the body anchor', () => {
  const connected = Buffer.alloc(8 * 8 * 4);
  const pixel = (x, y, color) => connected.set([...color, 255], (y * 8 + x) * 4);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 7; x++) pixel(x, y, [214, 211, 201]);
  for (let x = 0; x < 3; x++) pixel(x, 4, [109, 115, 210]);
  const detached = Buffer.from(connected); detached.fill(0, (4 * 8 + 2) * 4, (4 * 8 + 3) * 4);
  assert.ok(moruBodyAnchor(connected, 8).area > 0);
  assert.deepEqual(moruBodyAnchor(connected, 8), moruBodyAnchor(detached, 8));
});

test('the chorus retains complete opaque musical notes above the seals', async () => {
  const data = await sharp('assets/brand/moru/sprites/128/authored/moru-chorus.png')
    .extract({ left: 7 * 128, top: 0, width: 128, height: 45 }).ensureAlpha().raw().toBuffer();
  let opaque = 0, ivory = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) {
    opaque++;
    if (data[i] > 230 && data[i + 1] > 200) ivory++;
  }
  assert.ok(opaque >= 200 && ivory >= 70, `chorus notes were reduced to fragments: ${opaque} opaque, ${ivory} ivory pixels`);
});

test('complete floating ontology models retain connected opaque pixel links', async () => {
  for (const [id, frames] of [['ontology-dance', Array.from({ length: 24 }, (_, i) => i)], ['ontology-orbit', [9, 10, 11, 12, 13, 14, 15]]]) {
    for (const size of [64, 128]) for (const frame of frames) {
      // The model occupies the headroom above the seal. Eight-neighbour
      // connectivity permits deliberate diagonal pixel stairs, not missing links.
      const { data, info } = await sharp(`assets/brand/moru/sprites/${size}/authored/moru-${id}.png`)
        .extract({ left: frame * size, top: 0, width: size, height: Math.round(size * 60 / 128) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ink = i => data[i * 4 + 3] === 255 && (data[i * 4] >= 64 && data[i * 4 + 2] > data[i * 4] + 20 || data[i * 4] > 235);
      const seen = new Set(), groups = [];
      for (let start = 0; start < info.width * info.height; start++) {
        if (seen.has(start) || !ink(start)) continue;
        const queue = [start]; seen.add(start);
        for (let j = 0; j < queue.length; j++) {
          const p = queue[j], x = p % info.width, y = Math.floor(p / info.width);
          for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
            const xx = x + dx, yy = y + dy, n = yy * info.width + xx;
            if (xx >= 0 && xx < info.width && yy >= 0 && yy < info.height && !seen.has(n) && ink(n)) { seen.add(n); queue.push(n); }
          }
        }
        if (queue.length > 2) groups.push(queue.length);
      }
      assert.equal(groups.length, 1, `${id} frame ${frame + 1} at ${size}px has disconnected model fragments: ${groups}`);
    }
  }
});

test('the soft nod keeps its rounded body instead of flattening during the greeting', async () => {
  const { clips } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  const clip = clips['soft-bow'];
  for (const [file, size] of [[clip.sprite64, 64], [clip.sprite, 128]]) {
    const strip = sharp(`assets/brand/moru/${file}`);
    const areas = [];
    for (let frame = 0; frame < clip.frames; frame++) {
      const data = await strip.clone().extract({ left: frame * size, top: 0, width: size, height: size }).ensureAlpha().raw().toBuffer();
      areas.push(moruBodyAnchor(data, size).area);
    }
    assert.ok(Math.min(...areas) >= areas[0] * 0.9, `${size}px nod lost more than a tenth of its body volume`);
    assert.ok(Math.max(...areas) <= areas[0] * 1.1, `${size}px nod inflated its body`);
  }
});

test('every catalogue export has complete frames, clear margins and a shared neutral loop seam', async () => {
  const root = 'assets/brand/moru';
  const manifest = JSON.parse(await readFile(`${root}/moru.json`, 'utf8'));
  const spec = JSON.parse(await readFile(`${root}/moru-source.json`, 'utf8'));
  const declared = Object.fromEntries([...spec.authored, ...spec.compositions].map(c => [c.id, c]));
  assert.ok(spec.authored.length && spec.compositions.length && spec.poses.names.length, 'source inventory is empty');
  assert.deepEqual(Object.keys(manifest.clips).sort(), Object.keys(declared).sort(), 'export inventory does not match the retained sources');
  assert.deepEqual(Object.keys(manifest.poses).sort(), [...spec.poses.names].sort(), 'static poses are missing');
  for (const [name, clip] of Object.entries(manifest.clips)) {
    const source = declared[name];
    const count = source.sequence ? source.sequence.reduce((n, id) => n + declared[id].frames, 1 - source.sequence.length) : source.frames;
    assert.equal(clip.kind, source.sequence ? 'composed' : 'authored', `${name}: wrong authorship label`);
    assert.equal(clip.frames, count, `${name}: source poses were lost`);
    assert.equal(clip.durationsMs.length, clip.frames, `${name}: missing frame timing`);
    let repeatedPoses = 0;
    for (const [file, size] of [[clip.sprite64, 64], [clip.sprite, 128]]) {
      const { data, info } = await sharp(`${root}/${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, size * clip.frames, `${name}: sprite width`);
      assert.equal(info.height, size, `${name}: sprite height`);
      const frames = Array.from({ length: clip.frames }, () => Buffer.alloc(size * size * 4));
      for (let f = 0; f < clip.frames; f++) for (let y = 0; y < size; y++) {
        data.copy(frames[f], y * size * 4, (y * info.width + f * size) * 4, (y * info.width + (f + 1) * size) * 4);
        for (let x = 0; x < size; x++) {
          const alpha = frames[f][(y * size + x) * 4 + 3];
          assert.ok(alpha === 0 || alpha === 255, `${name}: soft alpha`);
          if (!x || !y || x === size - 1 || y === size - 1) assert.equal(alpha, 0, `${name}: clipped frame ${f}`);
        }
      }
      assert.deepEqual(frames[0], frames.at(-1), `${name}: jumps at loop seam`);
      assert.ok(frames.some(f => !f.equals(frames[0])), `${name}: contains no motion`);
      if (size === 128) repeatedPoses = frames.filter((frame, f) => f > 0 && frame.equals(frames[f - 1])).length;
    }
    for (const file of [clip.gif, clip.webp]) {
      const metadata = await sharp(`${root}/${file}`, { animated: true }).metadata();
      // WebP folds a pose identical to the one before it into that pose's page; GIF keeps every page.
      assert.equal(metadata.pages, file === clip.gif ? clip.frames : clip.frames - repeatedPoses, `${name}: ${file} lost frames`);
      assert.equal(metadata.width, 256); assert.equal(metadata.pageHeight, 256);
    }
    if (clip.source) {
      const stats = await sharp(`${root}/${clip.source}`).stats();
      assert.equal(stats.channels.at(-1).min, 0, `${name}: source background is not fully transparent`);
    }
    else for (const id of clip.constituents) assert.ok(manifest.clips[id]?.source, `${name}: missing authored constituent`);
  }
});

const drawnMap = (buffer, size, drawn) => Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
  const p = (y * size + x) * 4;
  return buffer[p + 3] && drawn.every((channel, i) => buffer[p + i] === channel) ? '#' : '.';
}).join(''));

/** Bounding-box drawings of the ink marks enclosed in a fill, in reading order. */
function enclosedInk(buffer, size) {
  const ink = p => buffer[p * 4 + 3] === 255 && buffer[p * 4] < 32, seen = new Uint8Array(size * size), marks = [];
  for (let start = 0; start < size * size; start++) {
    if (seen[start] || !ink(start)) continue;
    const group = [start]; seen[start] = 1;
    let enclosed = true, x0 = size, x1 = 0, y0 = size, y1 = 0;
    for (let j = 0; j < group.length; j++) {
      const p = group[j], x = p % size, y = (p - x) / size;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        const xx = x + dx, yy = y + dy, n = yy * size + xx;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size || !buffer[n * 4 + 3]) enclosed = false;
        else if (!seen[n] && ink(n)) { seen[n] = 1; group.push(n); }
      }
    }
    if (!enclosed) continue;
    const rows = Array.from({ length: y1 - y0 + 1 }, () => Array(x1 - x0 + 1).fill('.'));
    for (const p of group) rows[(p - p % size) / size - y0][p % size - x0] = '#';
    marks.push({ x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1, pixels: group, drawing: rows.map(row => row.join('')).join('/') });
  }
  return marks;
}

// Ink and the silhouette are kept from half an exported pixel; a colour inside a fill from a whole one.
for (const [stroke, strokeName, ground, groundName, widths] of [
  [INK, 'an ink', SKIN, 'a fill', [2, 3, 4]],
  [INK, 'an ink', null, 'the transparent canvas', [2, 3, 4]],
  [IVORY, 'a coloured', null, 'the transparent canvas', [2, 3, 4]],
  [IVORY, 'a coloured', SKIN, 'a fill', [4]],
]) test(`${strokeName} stroke on ${groundName} keeps one whole pixel wherever it sits on the grid`, () => {
  for (const width of widths) for (let start = 4; start < 8; start++) for (const upright of [true, false]) {
    const { data, paint } = canvas(16);
    if (ground) paint(0, 0, 16, 16, ground);
    if (upright) paint(start, 0, start + width, 16, stroke); else paint(0, start, 16, start + width, stroke);
    const rows = drawnMap(reduceMoru(data, 16, 4), 4, stroke);
    const lines = upright ? rows : [0, 1, 2, 3].map(x => rows.map(row => row[x]).join(''));
    const place = `${width}px ${upright ? 'upright' : 'level'} stroke at ${start}`;
    assert.equal(new Set(lines).size, 1, `${place} broke along its length: ${rows.join('/')}`);
    assert.equal(lines[0].replaceAll('.', '').length, 1, `${place} doubled or vanished: ${rows.join('/')}`);
  }
});

test('a filled square reduces to a filled rectangle within a pixel of its true size at every grid position', () => {
  for (const factor of [2, 4]) for (let side = factor; side <= 3 * factor; side++) for (let x = 0; x < factor; x++) for (let y = 0; y < factor; y++) for (const colour of [INK, SKIN]) {
    const from = 8 * factor, { data, paint } = canvas(from);
    paint(x, y, x + side, y + side, colour);
    const rows = drawnMap(reduceMoru(data, from, 8), 8, colour).filter(row => row.includes('#')).map(row => row.replace(/^\.+|\.+$/g, ''));
    const place = `a ${side}px square at ${x},${y} reduced by ${factor}: ${rows.join('/')}`;
    assert.ok(rows.length && rows.every(row => row === rows[0] && !row.includes('.')), `${place} is not a filled rectangle`);
    for (const length of [rows.length, rows[0].length]) assert.ok(length >= Math.floor(side / factor) && length <= Math.ceil(side / factor), `${place} is the wrong size`);
  }
});

test('an outline stays one pixel wide all round its fill at either grid position', () => {
  for (const shift of [0, 1, 2, 3]) {
    const { data, paint } = canvas(32);
    paint(4 + shift, 4 + shift, 28 + shift, 28 + shift, INK);
    paint(8 + shift, 8 + shift, 24 + shift, 24 + shift, SKIN);
    const reduced = reduceMoru(data, 32, 8), inked = drawnMap(reduced, 8, INK).filter(row => row.includes('#'));
    assert.deepEqual(inked.map(row => row.replace(/^\.+|\.+$/g, '')), ['######', '#....#', '#....#', '#....#', '#....#', '######'], `shift ${shift}`);
    assert.equal(drawnMap(reduced, 8, SKIN).join('').replaceAll('.', '').length, 16, `shift ${shift}: the fill changed size`);
  }
});

test('one mark drawn at four grid positions reduces to the same pixels at both sizes', () => {
  const { data, paint } = canvas(128);
  paint(0, 0, 128, 128, SKIN);
  for (const [x, y] of [[10, 20], [41, 21], [72, 22], [103, 23]]) { paint(x + 1, y, x + 8, y + 17, INK); paint(x, y + 3, x + 9, y + 14, INK); }
  for (const size of [64, 32]) {
    const eyes = enclosedInk(reduceMoru(data, 128, size), size);
    assert.equal(eyes.length, 4, `${size}px lost or merged an eye`);
    assert.equal(new Set(eyes.map(eye => eye.drawing)).size, 1, `${size}px eyes differ: ${eyes.map(eye => eye.drawing).join(' | ')}`);
  }
});

const oval = (paint, x, y, width, height) => {
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    if (((dx + 0.5) * 2 / width - 1) ** 2 + ((dy + 0.5) * 2 / height - 1) ** 2 <= 1) paint(x + dx, y + dy, x + dx + 1, y + dy + 1, INK);
  }
};

test('two marks of one reduced size that differ by a source pixel share one drawing', () => {
  const { data, paint } = canvas(256);
  paint(0, 0, 256, 256, SKIN);
  oval(paint, 90, 100, 10, 14);
  oval(paint, 150, 101, 11, 15);
  const [left, right] = enclosedInk(reduceMoru(data, 256, 128), 128);
  assert.equal(left.drawing, right.drawing);
});

test('a nose between two eyes keeps its own drawing, and so do the eyes', () => {
  const face = parts => {
    const { data, paint } = canvas(256);
    paint(0, 0, 256, 256, SKIN);
    if (parts.includes('eyes')) { oval(paint, 90, 100, 10, 14); oval(paint, 150, 100, 10, 14); }
    if (parts.includes('nose')) oval(paint, 122, 118, 12, 12);
    return data;
  };
  for (const size of [128, 64]) {
    const drawings = parts => enclosedInk(reduceMoru(face(parts), 256, size), size).map(mark => mark.drawing);
    const [eye] = drawings(['eyes']), [nose] = drawings(['nose']);
    assert.notEqual(eye, nose, `${size}px: the probe needs two different drawings`);
    assert.deepEqual(drawings(['eyes', 'nose']), [eye, eye, nose], `${size}px: a mark took the drawing of its neighbour`);
  }
});

test('a mark exactly between two sizes takes the smaller', () => {
  const { data, paint } = canvas(128);
  paint(0, 0, 128, 128, SKIN);
  paint(40, 40, 52, 46, INK);
  assert.deepEqual(enclosedInk(reduceMoru(data, 128, 32), 32).map(mark => mark.drawing), ['###']);
});

test('the marks stay centred on the body across grid positions', () => {
  for (const size of [128, 64]) {
    let leaning = 0;
    for (let shift = 0; shift < 256 / size; shift++) for (let inset = 14; inset < 22; inset++) for (const eyeWidth of [10, 12]) {
      const { data, paint } = canvas(256);
      paint(60 + shift, 60, 160 + shift, 160, INK);
      paint(64 + shift, 64, 156 + shift, 156, SKIN);
      paint(64 + shift + inset, 90, 64 + shift + inset + eyeWidth, 110, INK);
      paint(156 + shift - inset - eyeWidth, 90, 156 + shift - inset, 110, INK);
      const row = drawnMap(reduceMoru(data, 256, size), size, INK)[Math.round(100 * size / 256)].replace(/^\.+|\.+$/g, '');
      const [, left, right] = row.match(/^#+(\.+)#+\.+#+(\.+)#+$/) ?? [];
      const place = `${size}px shift ${shift} inset ${inset}`;
      assert.ok(left && right, `${place}: the face lost an eye: ${row}`);
      assert.ok(Math.abs(left.length - right.length) <= 1, `${place}: the eyes sit ${left.length} and ${right.length} from the outline`);
      leaning += left.length - right.length;
    }
    assert.equal(leaning, 0, `${size}px: the eyes lean to one side of the body across grid positions`);
  }
});

test('the larger mark keeps its place when a smaller one crowds it', () => {
  const eyeAlone = (() => { const { data, paint } = canvas(128); paint(0, 0, 128, 128, SKIN); paint(40, 40, 49, 57, INK); return enclosedInk(reduceMoru(data, 128, 32), 32)[0]; })();
  const { data, paint } = canvas(128);
  paint(0, 0, 128, 128, SKIN);
  paint(40, 40, 49, 57, INK);
  paint(50, 44, 62, 49, INK);
  const marks = enclosedInk(reduceMoru(data, 128, 32), 32), eye = marks.find(mark => mark.height === eyeAlone.height);
  assert.equal(marks.length, 2, 'the eye and the whisker merged');
  assert.deepEqual([eye.x0, eye.y0, eye.drawing], [eyeAlone.x0, eyeAlone.y0, eyeAlone.drawing]);
});

test('marks drawn apart stay apart after the reduction', () => {
  const { data, paint } = canvas(128);
  paint(0, 0, 128, 128, SKIN);
  const pairs = [[9, 20], [50, 21], [89, 22], [9, 61], [50, 63]];
  for (const [x, y] of pairs) { paint(x, y, x + 12, y + 5, INK); paint(x, y + 7, x + 12, y + 12, INK); }
  for (const size of [64, 32]) {
    const whiskers = enclosedInk(reduceMoru(data, 128, size), size);
    assert.equal(whiskers.length, pairs.length * 2, `${size}px merged two whiskers that the source keeps apart`);
    assert.equal(new Set(whiskers.map(whisker => whisker.drawing)).size, 1, `${size}px whiskers differ`);
  }
});

test('a piece smaller than a quarter of a drawn pixel takes the colour around it', () => {
  const { data, paint, at } = canvas(16);
  paint(0, 0, 16, 16, SKIN);
  paint(2, 2, 3, 3, INK);
  paint(6, 2, 9, 3, INK);
  paint(2, 8, 4, 10, INK);
  paint(12, 2, 14, 14, INK);
  const cleaned = despeckle(data, 16);
  assert.deepEqual(at(cleaned, 2, 2), SKIN, 'a lone pixel survived');
  assert.deepEqual([6, 7, 8].map(x => at(cleaned, x, 2)), [SKIN, SKIN, SKIN], 'a three-pixel run survived or left its middle behind');
  assert.deepEqual(at(cleaned, 2, 8), INK, 'a four-pixel piece was erased');
  assert.deepEqual(at(cleaned, 12, 8), INK, 'a drawn stroke was erased');
});

test('the soft gray edge of the outline joins it, that of a facial mark dissolves, and a gray surface stays', () => {
  const { data, paint, at } = canvas(64);
  paint(8, 8, 40, 40, INK);
  paint(12, 12, 36, 36, SKIN);
  paint(6, 8, 8, 40, FRINGE_GRAY);
  paint(12, 12, 14, 36, FRINGE_GRAY);
  paint(40, 20, 52, 32, FRINGE_GRAY);
  paint(20, 20, 26, 26, FRINGE_GRAY);
  paint(22, 22, 24, 24, INK);
  paint(30, 30, 32, 32, FRINGE_GRAY);
  const joined = inkFringe(data, 64);
  assert.deepEqual(at(joined, 6, 20), INK, 'the fringe outside the outline stayed gray');
  assert.deepEqual(at(joined, 13, 20), INK, 'the fringe inside the outline stayed gray');
  assert.deepEqual(at(joined, 41, 26), INK, 'the edge of a gray surface on the outline stayed gray');
  assert.deepEqual([44, 48, 51].map(x => at(joined, x, 26)), [FRINGE_GRAY, FRINGE_GRAY, FRINGE_GRAY], 'a gray surface turned to ink');
  assert.deepEqual([at(joined, 21, 21), at(joined, 22, 22)], [SKIN, INK], 'the soft edge of a facial mark did not dissolve into the fill');
  assert.deepEqual(at(joined, 31, 31), FRINGE_GRAY, 'gray that touches no ink turned to ink');
});

test('the lighter haze beside the outline dissolves into the fill, and the same gray away from ink stays', () => {
  const { data, paint, at } = canvas(64);
  paint(8, 8, 40, 40, INK);
  paint(10, 10, 38, 38, SKIN);
  paint(10, 10, 12, 38, HAZE_GRAY);
  paint(6, 8, 8, 40, HAZE_GRAY);
  paint(22, 22, 26, 26, HAZE_GRAY);
  const cleared = inkFringe(data, 64);
  assert.deepEqual(at(cleared, 11, 20), SKIN, 'haze inside the outline stayed gray');
  assert.equal(cleared[(20 * 64 + 7) * 4 + 3], 0, 'haze outside the outline was not cleared');
  assert.deepEqual(at(cleared, 9, 20), INK, 'the outline changed');
  assert.deepEqual(at(cleared, 24, 24), HAZE_GRAY, 'gray that touches no ink was repainted');
});

test('haze inside a one-pixel diagonal outline takes the fill, never the outside it touches by a corner', () => {
  const { data, paint, at } = canvas(64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const depth = x + y - 24;
    if (depth >= 0) paint(x, y, x + 1, y + 1, depth === 0 ? INK : depth <= 3 ? HAZE_GRAY : SKIN);
  }
  const cleared = inkFringe(data, 64);
  let holes = 0;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) if (x + y > 24 && cleared[(y * 64 + x) * 4 + 3] === 0) holes++;
  assert.equal(holes, 0, 'a pixel inside the outline was cleared');
  assert.deepEqual(at(cleared, 13, 12), SKIN, 'haze beside the diagonal outline stayed gray');
});

test('a stone crumb on the ivory takes the ivory, and stone that is a surface, on the silhouette or beside another colour stays', () => {
  const { data, paint, at } = canvas(64);
  paint(2, 2, 46, 62, INK);
  paint(4, 4, 44, 60, IVORY);
  paint(4, 4, 44, 12, SKIN);
  paint(8, 16, 20, 18, INK);
  paint(8, 18, 14, 20, SKIN);
  paint(26, 16, 29, 19, SKIN);
  paint(6, 24, 13, 33, SKIN);
  paint(18, 24, 26, 32, SKIN);
  paint(32, 24, 35, 27, FREE_INK);
  paint(35, 24, 38, 27, SKIN);
  paint(10, 40, 20, 50, INK);
  paint(13, 43, 16, 46, SKIN);
  paint(50, 10, 60, 20, IVORY);
  paint(48, 12, 50, 15, SKIN);
  paint(24, 50, 40, 58, INK);
  paint(26, 52, 38, 56, SKIN);
  paint(25, 51, 26, 52, IVORY);
  const cleaned = ivoryFringe(data, 64);
  assert.deepEqual([at(cleaned, 9, 18), at(cleaned, 13, 19)], [IVORY, IVORY], 'a crumb under a whisker stayed gray');
  assert.deepEqual(at(cleaned, 27, 17), IVORY, 'a crumb alone on the ivory stayed gray');
  assert.deepEqual([at(cleaned, 6, 24), at(cleaned, 12, 32)], [IVORY, IVORY], 'a piece one pixel under four drawn pixels stayed gray');
  assert.deepEqual([at(cleaned, 18, 24), at(cleaned, 25, 31)], [SKIN, SKIN], 'a piece of four drawn pixels was erased');
  assert.deepEqual(at(cleaned, 20, 8), SKIN, 'the body beside the ivory was erased');
  assert.deepEqual(at(cleaned, 36, 25), SKIN, 'stone beside another colour was erased');
  assert.deepEqual(at(cleaned, 14, 44), SKIN, 'stone enclosed in ink alone turned ivory');
  assert.deepEqual(at(cleaned, 49, 13), SKIN, 'stone on the silhouette turned ivory');
  assert.deepEqual([at(cleaned, 26, 52), at(cleaned, 37, 55)], [SKIN, SKIN], 'stone enclosed in ink that meets the ivory only by a corner turned ivory');
  assert.deepEqual([at(cleaned, 9, 16), at(cleaned, 33, 25), at(cleaned, 30, 40)], [INK, FREE_INK, IVORY], 'a colour other than stone changed');
});

test('a stone hairline between ink and ivory takes the ivory even where it joins the body, and a thicker strip stays', () => {
  const { data, paint, at } = canvas(64);
  paint(2, 2, 62, 62, INK);
  paint(4, 4, 60, 60, IVORY);
  paint(4, 4, 24, 60, SKIN);
  paint(24, 21, 40, 23, INK);
  paint(24, 20, 34, 21, SKIN);
  paint(34, 18, 37, 21, SKIN);
  paint(24, 30, 44, 32, INK);
  paint(24, 29, 44, 30, SKIN);
  paint(24, 42, 44, 44, INK);
  paint(24, 40, 44, 42, SKIN);
  paint(24, 48, 27, 49, SKIN);
  paint(24, 54, 44, 56, FREE_INK);
  paint(24, 53, 44, 54, SKIN);
  paint(30, 10, 54, 12, INK);
  paint(30, 4, 36, 10, SKIN);
  paint(48, 4, 54, 10, SKIN);
  paint(36, 9, 48, 10, SKIN);
  const cleaned = ivoryFringe(data, 64);
  assert.deepEqual([24, 34, 43].map(x => at(cleaned, x, 29)), [IVORY, IVORY, IVORY], 'a hairline joined to the body stayed gray');
  assert.deepEqual([at(cleaned, 28, 20), at(cleaned, 35, 19)], [IVORY, IVORY], 'a crumb the hairline tied to the body stayed gray');
  assert.deepEqual([at(cleaned, 31, 5), at(cleaned, 40, 9), at(cleaned, 52, 8)], [IVORY, IVORY, IVORY], 'two crumbs a hairline joined into one larger piece stayed gray');
  assert.deepEqual([at(cleaned, 24, 40), at(cleaned, 43, 41)], [SKIN, SKIN], 'a strip half a drawn pixel thick was erased');
  assert.deepEqual(at(cleaned, 25, 48), SKIN, 'the edge of the body away from ink was erased');
  assert.deepEqual(at(cleaned, 30, 53), SKIN, 'a hairline beside another colour was erased');
  assert.deepEqual([at(cleaned, 23, 29), at(cleaned, 10, 30)], [SKIN, SKIN], 'the body lost pixels');
});

test('a faint gray mark on the body ivory becomes ink, a shorter piece there dissolves, and gray anywhere else stays', () => {
  const { data, paint, at } = canvas(96);
  paint(2, 2, 50, 94, INK);
  paint(4, 4, 48, 92, SKIN);
  paint(8, 50, 44, 90, IVORY);
  paint(8, 10, 44, 22, IVORY);
  paint(54, 2, 94, 94, INK);
  paint(56, 4, 92, 92, IVORY);
  paint(12, 56, 20, 57, FRINGE_GRAY);
  paint(12, 57, 20, 58, HAZE_GRAY);
  paint(24, 56, 28, 57, FRINGE_GRAY);
  paint(32, 56, 35, 57, MID_FRINGE_GRAY);
  paint(11, 65, 19, 68, HAZE_GRAY);
  paint(12, 66, 18, 67, FRINGE_GRAY);
  paint(34, 62, 42, 67, SKIN);
  paint(36, 64, 40, 65, FRINGE_GRAY);
  paint(33, 70, 43, 77, SKIN);
  paint(36, 73, 40, 74, FRINGE_GRAY);
  paint(38, 53, 40, 54, FRINGE_GRAY);
  paint(38, 54, 40, 55, HAZE_GRAY);
  paint(4, 49, 8, 50, FRINGE_GRAY);
  paint(8, 49, 13, 50, INK);
  paint(7, 50, 8, 55, INK);
  paint(12, 14, 20, 15, FRINGE_GRAY);
  paint(12, 30, 18, 31, FRINGE_GRAY);
  paint(22, 65, 30, 68, SKIN);
  paint(23, 66, 29, 67, FRINGE_GRAY);
  paint(10, 74, 30, 80, FRINGE_GRAY);
  paint(30, 84, 36, 85, FRINGE_GRAY);
  data.fill(0, (85 * 96 + 36) * 4, (85 * 96 + 37) * 4);
  paint(60, 40, 68, 41, FRINGE_GRAY);
  const drawn = faintMarks(data, 96);
  assert.deepEqual([12, 16, 19].map(x => at(drawn, x, 56)), [INK, INK, INK], 'a faint whisker on the belly stayed gray');
  assert.deepEqual([12, 16, 19].map(x => at(drawn, x, 57)), [IVORY, IVORY, IVORY], 'the haze under the redrawn whisker stayed gray');
  assert.deepEqual([24, 27].map(x => at(drawn, x, 56)), [INK, INK], 'a piece exactly one drawn pixel long was not drawn');
  assert.deepEqual([32, 34].map(x => at(drawn, x, 56)), [IVORY, IVORY], 'a piece shorter than a drawn pixel stayed on the belly');
  assert.deepEqual([12, 17].map(x => at(drawn, x, 66)), [INK, INK], 'a faint whisker that only its haze joins to the belly stayed gray');
  assert.deepEqual([at(drawn, 11, 65), at(drawn, 15, 67), at(drawn, 18, 66)], [IVORY, IVORY, IVORY], 'the haze around that whisker stayed gray');
  assert.deepEqual([36, 39].map(x => at(drawn, x, 64)), [INK, INK], 'a whisker half a drawn pixel of stone away from the ivory stayed gray');
  assert.deepEqual([36, 39].map(x => at(drawn, x, 73)), [FRINGE_GRAY, FRINGE_GRAY], 'gray farther from the ivory than half a drawn pixel changed');
  assert.deepEqual([at(drawn, 38, 53), at(drawn, 39, 54)], [IVORY, IVORY], 'a short piece or the haze beside it stayed on the belly');
  assert.deepEqual([4, 7].map(x => at(drawn, x, 49)), [FRINGE_GRAY, FRINGE_GRAY], 'gray that meets the ivory only by a corner changed');
  assert.deepEqual([12, 19].map(x => at(drawn, x, 14)), [INK, INK], 'a whisker on a second ivory area of the same body stayed gray');
  assert.deepEqual(at(drawn, 14, 30), FRINGE_GRAY, 'gray on the body fill, farther from the ivory than its blend reaches, changed');
  assert.deepEqual([23, 28].map(x => at(drawn, x, 66)), [INK, INK], 'a faint whisker that only its stone blend joins to the belly stayed gray');
  assert.deepEqual([at(drawn, 10, 74), at(drawn, 29, 79)], [FRINGE_GRAY, FRINGE_GRAY], 'a gray surface larger than a mark changed');
  assert.deepEqual([at(drawn, 30, 84), at(drawn, 35, 84)], [FRINGE_GRAY, FRINGE_GRAY], 'gray that reaches the outside by a corner changed');
  assert.deepEqual([at(drawn, 60, 40), at(drawn, 67, 40)], [FRINGE_GRAY, FRINGE_GRAY], 'gray on a prop with more ivory than the belly changed');
  assert.deepEqual([at(drawn, 3, 30), at(drawn, 30, 62), at(drawn, 30, 30), at(drawn, 70, 60)], [INK, IVORY, SKIN, IVORY], 'the outline, the belly, the body or the prop changed');
});

test('a still pose of 32px or more keeps none of the dark gray that ink fades through', async () => {
  const { poses } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  const cleaned = Object.entries(poses).filter(([, pose]) => pose.nativeSize >= 32);
  assert.ok(cleaned.length >= 15, 'the still poses are missing from the catalogue');
  for (const [name, pose] of cleaned) {
    const { data } = await sharp(`assets/brand/moru/${pose.path}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let faded = 0;
    for (let p = 0; p < data.length; p += 4) if (data[p + 3] && [FRINGE_GRAY, MID_FRINGE_GRAY].some(gray => gray.every((channel, i) => data[p + i] === channel))) faded++;
    assert.equal(faded, 0, `${name} was exported without the cleaning its clips get`);
  }
});

test('the 64px motion rows the app plays are the rows this export wrote', async () => {
  const { runtime, clips } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  for (const [state, id] of Object.entries(runtime)) {
    const played = await readFile(`public/brand/mascot-${state}-row.png`);
    assert.deepEqual(played, await readFile(`assets/brand/moru/${clips[id].sprite64}`), `the app still plays an older ${state} row`);
  }
});

test('every stone pixel beside a resting whisker belongs to the body, at both exported sizes', async () => {
  const { clips } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  for (const [file, size] of [[clips.blink.sprite64, 64], [clips.blink.sprite, 128]]) {
    const frame = await frameOf(`assets/brand/moru/${file}`, 0, size);
    const stone = p => frame[p * 4 + 3] === 255 && SKIN.every((channel, i) => frame[p * 4 + i] === channel);
    const pieceOf = new Int32Array(size * size).fill(-1), areas = [];
    for (let start = 0; start < size * size; start++) {
      if (pieceOf[start] >= 0 || !stone(start)) continue;
      const piece = [start]; pieceOf[start] = areas.length;
      for (let j = 0; j < piece.length; j++) for (const step of [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1]) {
        const n = piece[j] + step;
        if (n >= 0 && n < size * size && pieceOf[n] < 0 && stone(n)) { pieceOf[n] = areas.length; piece.push(n); }
      }
      areas.push(piece.length);
    }
    const body = areas.indexOf(Math.max(...areas));
    const whiskers = enclosedInk(frame, size).filter(mark => mark.width >= 2 * mark.height && mark.pixels.some(p => [-size, size].some(step => IVORY.every((channel, i) => frame[(p + step) * 4 + i] === channel))));
    assert.ok(whiskers.length >= 4, `${size}px resting face shows only ${whiskers.length} whiskers on the ivory`);
    for (const whisker of whiskers) for (const p of whisker.pixels) for (const step of [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1]) {
      const n = p + step;
      assert.ok(!stone(n) || pieceOf[n] === body, `${size}px resting face keeps a detached gray crumb at ${n % size},${Math.floor(n / size)}`);
    }
  }
});

test('ink drawn away from every fill takes the indigo that reads on the dark canvas', () => {
  const { data, paint, at } = canvas(64);
  paint(8, 20, 28, 40, INK);
  paint(10, 22, 26, 38, SKIN);
  paint(44, 4, 52, 14, INK);
  paint(60, 60, 62, 62, INK);
  const lifted = liftFreeInk(data, 64);
  assert.deepEqual(at(lifted, 48, 8), FREE_INK, 'a detached stroke kept the outline ink');
  assert.deepEqual(at(lifted, 8, 20), INK, 'the outline of a fill changed colour');
  assert.deepEqual(at(lifted, 16, 30), SKIN, 'a fill changed colour');
  assert.equal(at(lifted, 60, 60), null, 'a detached crumb smaller than a drawn pixel survived');
});

test('a dim blue flipper stays in the indigo family instead of turning gray', () => {
  for (const rgb of [[64, 64, 112], [70, 74, 118]]) {
    const actual = moruColor(...rgb);
    assert.ok(actual[2] - actual[0] >= 60, `dim flipper ${rgb} lost its colour: ${actual}`);
  }
});

test('the resting face shows two identical level eyes at both exported sizes', async () => {
  const { clips } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  for (const [file, size] of [[clips.blink.sprite64, 64], [clips.blink.sprite, 128]]) {
    const marks = enclosedInk(await frameOf(`assets/brand/moru/${file}`, 0, size), size);
    const tallest = Math.max(...marks.map(mark => mark.height)), eyes = marks.filter(mark => mark.height === tallest);
    assert.equal(eyes.length, 2, `${size}px resting face does not show two eyes of one height`);
    assert.equal(eyes[0].drawing, eyes[1].drawing, `${size}px resting eyes differ`);
    assert.equal(eyes[0].y0, eyes[1].y0, `${size}px resting eyes are not level`);
  }
});

/** A 64px seal face: two eyes, a nose, a whisker under each eye and a belly crease, each drawable or absent. */
function restingFace({ shift = 0, leftEye = [20, 20, 24, 28], rightEye = [36, 20, 40, 28], leftWhisker = [17, 30, 25, 32], rightWhisker = [38, 34, 46, 36], nose = [28, 30, 32, 34], noseHole = null, crease = [20, 44, 30, 46], crumb = null } = {}) {
  const { data, paint } = canvas(64);
  paint(8 + shift, 8, 56 + shift, 56, INK);
  paint(10 + shift, 10, 54 + shift, 54, SKIN);
  for (const mark of [leftEye, rightEye, leftWhisker, rightWhisker, nose, crease, crumb]) if (mark) paint(...mark, INK);
  if (noseHole) paint(...noseHole, SKIN);
  return { data, paint };
}

test('a resting clip keeps the first pose and redraws each changed mark in the place it took', () => {
  const resting = restingFace().data;
  const closing = restingFace({
    shift: 1,
    // Nearer the lost whisker by centre, yet on the eye's box: it takes the eye's place.
    leftEye: [16, 27, 26, 29], leftWhisker: null,
    rightEye: [34, 26, 42, 28],
    rightWhisker: [38, 38, 46, 40],
    noseHole: [29, 31, 31, 33],
    // The crease is drawn one pixel aside with a crumb beside it: the crease holds, the crumb claims nothing.
    crease: [21, 44, 31, 46], crumb: [32, 47, 34, 49],
  }).data;
  const [first, held, last] = holdBody([resting, closing, resting], 64);
  const expected = restingFace();
  for (const gone of [[20, 20, 24, 28], [36, 20, 40, 28], [38, 34, 46, 36]]) expected.paint(...gone, SKIN);
  for (const drawn of [[16, 27, 26, 29], [34, 26, 42, 28], [38, 38, 46, 40]]) expected.paint(...drawn, INK);
  expected.paint(29, 31, 31, 33, SKIN);
  assert.deepEqual(held, expected.data, 'the pose kept its own outline or crumb, lost a mark it could not see, or redrew a mark in the wrong place');
  assert.deepEqual([first, last], [resting, resting], 'the first or the last pose changed');
});

test('a resting pose whose marks moved less than half a drawn pixel is the first pose', () => {
  const resting = restingFace().data;
  const drifted = restingFace({ shift: 1, leftEye: [21, 21, 25, 28], rightEye: [35, 20, 39, 28], leftWhisker: [17, 30, 25, 33], nose: [28, 31, 32, 35], crease: null }).data;
  assert.deepEqual(holdBody([resting, drifted, resting], 64)[1], resting);
});

test('a resting mark that is as near two marks by their boxes takes the one whose centre is nearer', () => {
  const resting = restingFace({ rightWhisker: [44, 26, 52, 28], crumb: [38, 38, 46, 40] }).data;
  const lowered = restingFace({ rightWhisker: [38, 31, 46, 35] }).data;
  const expected = restingFace({ rightWhisker: [44, 26, 52, 28], crumb: [38, 31, 46, 35] }).data;
  assert.deepEqual(holdBody([resting, lowered, resting], 64)[1], expected);
});

test('a resting clip refuses a pose that lost an eye to its outline', () => {
  const resting = restingFace().data;
  const winking = restingFace({ leftEye: null, rightEye: [34, 26, 42, 28] }).data;
  assert.throws(() => holdBody([resting, winking, resting], 64), /pose 2 lost an eye/);
});

test('between its first and last pose the blink changes only its facial marks, and both eyes close', async () => {
  const { clips } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  for (const [file, size] of [[clips.blink.sprite64, 64], [clips.blink.sprite, 128]]) {
    const resting = await frameOf(`assets/brand/moru/${file}`, 0, size);
    const restingMarks = enclosedInk(resting, size), eyeHeight = Math.max(...restingMarks.map(mark => mark.height));
    const restingInk = new Set(restingMarks.flatMap(mark => mark.pixels));
    let closedPoses = 0;
    for (let frame = 1; frame < clips.blink.frames - 1; frame++) {
      const pose = await frameOf(`assets/brand/moru/${file}`, frame, size), marks = enclosedInk(pose, size);
      const poseInk = new Set(marks.flatMap(mark => mark.pixels));
      for (let p = 0; p < size * size; p++) {
        if (pose.compare(resting, p * 4, p * 4 + 4, p * 4, p * 4 + 4) === 0) continue;
        const besideMark = [-size - 1, -size, -size + 1, -1, 0, 1, size - 1, size, size + 1].some(step => restingInk.has(p + step) || poseInk.has(p + step));
        assert.ok(besideMark, `${size}px blink pose ${frame} redraws the body at ${p % size},${Math.floor(p / size)}`);
      }
      if (marks.every(mark => mark.height < eyeHeight)) closedPoses++;
    }
    assert.ok(closedPoses >= 8, `${size}px blink lowers both eyelids in only ${closedPoses} poses`);
  }
});

test('a clip that stays on the ground keeps the body on one floor line', async () => {
  const root = 'assets/brand/moru';
  const { clips } = JSON.parse(await readFile(`${root}/moru.json`, 'utf8'));
  const spec = JSON.parse(await readFile(`${root}/moru-source.json`, 'utf8'));
  const grounded = spec.authored.filter(clip => !clip.scene && !clip.airborne);
  assert.ok(grounded.length > 30, 'the grounded inventory is nearly empty');
  for (const clip of grounded) {
    const bottoms = [];
    for (let frame = 0; frame < clip.frames; frame++) bottoms.push(moruBodyAnchor(await frameOf(`${root}/${clips[clip.id].sprite}`, frame, 128), 128).bottom);
    // Two native pixels: a breath or a squash moves the belly edge that far.
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 2, `${clip.id} leaves the floor: body bottoms ${Math.min(...bottoms)}–${Math.max(...bottoms)}`);
  }
});
