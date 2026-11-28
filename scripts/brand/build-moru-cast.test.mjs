import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CAST, CAST_PINK, CAST_ROWS, castFile, castPoses, castSources, drawCast, recoloured } from './build-moru-cast.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const MORU = ['171923', '17192d', '50569c', '6d73d2', '555451', '777572', '99968f', 'aaa9a5', 'b8b4aa', '9399e5'];
const sources = castSources();
const hexes = data => { const found = new Set(); for (let p = 0; p < data.length; p += 4) if (data[p + 3]) found.add([0, 1, 2].map(i => data[p + i].toString(16).padStart(2, '0')).join('')); return found; };
const outside = (data, character) => [...hexes(data)].filter(hex => !MORU.includes(hex) && hex !== CAST_PINK && hex !== CAST[character].body && hex !== CAST[character].belly);
const raw = input => sharp(input).ensureAlpha().raw().toBuffer();

test('each committed cast row is what the script draws today', async () => {
  for (const { row, character, data } of await drawCast()) {
    assert.ok((await raw(castFile(row, character))).equals(data), `${row} for ${character} is stale; run pnpm brand:cast`);
  }
});

test('a cast row holds only Moru\'s ink and its own pair, and an undressed character is the grey row recoloured', async () => {
  for (const row of Object.keys(CAST_ROWS)) {
    const grey = await raw(`public/brand/mascot-${row}-row-128.png`);
    for (const character of Object.keys(CAST)) {
      const shipped = await raw(castFile(row, character));
      assert.deepEqual(outside(shipped, character), [], `${row} for ${character} holds colours outside its palette`);
      if (CAST[character].pieces.length === 0) assert.ok(shipped.equals(recoloured(grey, CAST[character])), `${row} for ${character} changed a pose`);
    }
  }
});

test('the 64px poses come from the catalogue reducer with exact ink and no stray colour', async () => {
  const { rows, rest } = await sources;
  for (const row of ['waiting', 'galumph-left']) {
    const pack = await raw(`assets/brand/moru/sprites/64/authored/moru-${CAST_ROWS[row]}.png`);
    for (const character of Object.keys(CAST)) {
      const poses = castPoses(rows[row].work, rows[row].plain, rest, character, 64);
      for (const [i, pose] of poses.entries()) {
        assert.deepEqual(outside(pose, character), [], `${row} ${character} pose ${i + 1} at 64px`);
        assert.ok(hexes(pose).has('17192d'), `${row} ${character} pose ${i + 1} lost its outline ink`);
        if (CAST[character].pieces.length) continue;
        const cell = Buffer.alloc(64 * 64 * 4), width = 64 * poses.length;
        for (let y = 0; y < 64; y++) pack.copy(cell, y * 256, (y * width + i * 64) * 4, (y * width + i * 64 + 64) * 4);
        assert.ok(pose.equals(recoloured(cell, CAST[character])), `${row} ${character} pose ${i + 1} differs from the shipped 64px pose`);
      }
    }
  }
});

/** Pixels in one pose that differ from the grey pose in the character's palette: its head piece, where it wears one. */
const PIECE_FLOOR = 100;

test('a character with a head piece wears it in every pose of every row a room plays', async () => {
  for (const row of Object.keys(CAST_ROWS)) {
    const grey = await raw(`public/brand/mascot-${row}-row-128.png`);
    for (const [character, look] of Object.entries(CAST)) {
      if (look.pieces.length === 0) continue;
      const shipped = await raw(castFile(row, character)), bare = recoloured(grey, look), width = shipped.length / 4 / 128;
      for (let frame = 0; frame < width / 128; frame++) {
        let worn = 0;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          const p = (y * width + frame * 128 + x) * 4;
          if (shipped[p + 3] && shipped.readUInt32BE(p) !== bare.readUInt32BE(p)) worn++;
        }
        assert.ok(worn >= PIECE_FLOOR, `${row} for ${character} pose ${frame + 1} shows ${worn} piece pixels`);
      }
    }
  }
});

test('a character with no head piece has a body colour far enough from the grey to tell apart', () => {
  const chroma = hex => { const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...c) - Math.min(...c); };
  for (const [character, look] of Object.entries(CAST)) {
    if (look.pieces.length === 0) assert.ok(chroma(look.body) >= 40, `${character}'s body ${look.body} reads as grey under a room's light`);
  }
});
