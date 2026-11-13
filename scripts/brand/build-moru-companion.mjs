/** Export the decorative companion from retained native-resolution catalogue frames. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

export async function buildMoruCompanion() {
  const root = 'assets/brand/moru';
  const catalogue = JSON.parse(await readFile(`${root}/moru.json`, 'utf8'));
  await exportStrip('moru-companion', ['wave', 'blink', 'tilt', 'hop', 'folder-open'], catalogue, root);
  await exportStrip('moru-reactions', ['shy', 'clap', 'dance'], catalogue, root);
  // Large pending fallbacks need native 128px source pixels, not an enlarged 64px export.
  for (const [state, id] of Object.entries({ waiting: 'blink', connect: 'connect', compile: 'source-read', greeting: 'wave' })) {
    await writeFile(`public/brand/mascot-${state}-row-128.png`, await readFile(`${root}/${catalogue.clips[id].sprite}`));
  }
}

async function exportStrip(name, sequence, catalogue, root) {
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
  await writeFile(`public/brand/${name}.png`, sprite);
  const digest = createHash('sha256').update(sprite).digest('hex').slice(0, 12);
  await writeFile(`src/shared/ui/marks/${name}.json`, JSON.stringify({ cell, frames: frame, digest, clips }, null, 2) + '\n');
}
