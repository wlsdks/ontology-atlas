import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { liftFreeInk, moruBodyAnchor, moruColor, reduceMoru } from './build-moru-sprites.mjs';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const INK = [23, 25, 35], SKIN = [214, 211, 201], FREE_INK = [109, 115, 210];

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
  const playback = JSON.parse(await readFile(`src/shared/ui/marks/${name}.json`, 'utf8'));
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
  for (const [state, id] of Object.entries({ waiting: 'blink', connect: 'connect', compile: 'source-read', greeting: 'wave' })) {
    assert.deepEqual(await readFile(`public/brand/mascot-${state}-row-128.png`), await readFile(`assets/brand/moru/${source.clips[id].sprite}`));
  }
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
    }
    for (const file of [clip.gif, clip.webp]) {
      const metadata = await sharp(`${root}/${file}`, { animated: true }).metadata();
      assert.equal(metadata.pages, clip.frames, `${name}: ${file} lost frames`);
      assert.equal(metadata.width, 256); assert.equal(metadata.pageHeight, 256);
    }
    if (clip.source) {
      const stats = await sharp(`${root}/${clip.source}`).stats();
      assert.equal(stats.channels.at(-1).min, 0, `${name}: source background is not fully transparent`);
    }
    else for (const id of clip.constituents) assert.ok(manifest.clips[id]?.source, `${name}: missing authored constituent`);
  }
});

test('a drawn pixel that straddles two exported pixels lands in exactly one of them', () => {
  const { data, paint, at } = canvas(16);
  paint(6, 0, 10, 16, INK);
  const reduced = reduceMoru(data, 16, 4);
  for (let y = 0; y < 4; y++) assert.deepEqual([0, 1, 2, 3].map(x => at(reduced, x, y, 4) ? 1 : 0), [0, 1, 0, 0], 'a one-pixel stroke doubled or vanished');
});

test('a stroke on a fill that straddles two exported pixels stays one pixel wide', () => {
  const { data, paint, at } = canvas(16);
  paint(0, 0, 16, 16, SKIN);
  paint(6, 0, 10, 16, INK);
  const reduced = reduceMoru(data, 16, 4);
  for (let y = 0; y < 4; y++) assert.deepEqual([0, 1, 2, 3].map(x => at(reduced, x, y, 4)), [SKIN, INK, SKIN, SKIN], 'a whisker doubled or vanished');
});

test('an outline that shares its block with a fill survives the reduction', () => {
  const { data, paint, at } = canvas(8);
  paint(0, 0, 8, 8, SKIN);
  paint(4, 0, 6, 8, INK);
  paint(0, 4, 1, 8, INK);
  const reduced = reduceMoru(data, 8, 2);
  assert.deepEqual(at(reduced, 1, 0, 2), INK, 'an outline covering half its block lost to the fill');
  assert.deepEqual(at(reduced, 0, 1, 2), SKIN, 'a sliver of ink replaced the fill');
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

test('the resting face keeps both eyes at the same width at both exported sizes', async () => {
  const { clips } = JSON.parse(await readFile('assets/brand/moru/moru.json', 'utf8'));
  for (const [file, size] of [[clips.blink.sprite64, 64], [clips.blink.sprite, 128]]) {
    const data = await frameOf(`assets/brand/moru/${file}`, 0, size);
    const ink = p => data[p * 4 + 3] === 255 && data[p * 4] < 32, seen = new Uint8Array(size * size), eyes = [];
    for (let start = 0; start < size * size; start++) {
      if (seen[start] || !ink(start)) continue;
      const group = [start]; seen[start] = 1;
      let enclosed = true, x0 = size, x1 = 0, y0 = size, y1 = 0;
      for (let j = 0; j < group.length; j++) {
        const p = group[j], x = p % size, y = (p - x) / size;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
          const xx = x + dx, yy = y + dy, n = yy * size + xx;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size || !data[n * 4 + 3]) enclosed = false;
          else if (!seen[n] && ink(n)) { seen[n] = 1; group.push(n); }
        }
      }
      if (enclosed) eyes.push({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
    }
    // The eyes are the two tallest marks inside the face; whiskers and the nose are shorter.
    eyes.sort((a, b) => b.height - a.height);
    assert.ok(eyes.length >= 3 && eyes[1].height > eyes[2].height, `${size}px resting face does not show two eyes`);
    assert.equal(eyes[0].width, eyes[1].width, `${size}px resting face has one eye narrower than the other`);
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
