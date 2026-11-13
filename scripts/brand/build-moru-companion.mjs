/** Export the decorative companion from retained native-resolution catalogue frames. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

export async function buildMoruCompanion() {
  const root = 'assets/brand/moru';
  const catalogue = JSON.parse(await readFile(`${root}/moru.json`, 'utf8'));
  const sequence = ['wave', 'blink', 'tilt', 'hop', 'folder-open'];
  const cell = catalogue.nativeCell;
  let frame = 0;
  const layers = [], clips = {};
  for (const id of sequence) {
    const clip = catalogue.clips[id];
    layers.push({ input: `${root}/${clip.sprite}`, left: frame * cell, top: 0 });
    clips[id] = { firstFrame: frame, durationsMs: clip.durationsMs };
    frame += clip.frames;
  }
  const sprite = await sharp({ create: { width: frame * cell, height: cell, channels: 4, background: '#00000000' } }).composite(layers).png().toBuffer();
  await writeFile('public/brand/moru-companion.png', sprite);
  const digest = createHash('sha256').update(sprite).digest('hex').slice(0, 12);
  await writeFile('src/shared/ui/marks/moru-companion.json', JSON.stringify({ cell, frames: frame, digest, clips }, null, 2) + '\n');
}
