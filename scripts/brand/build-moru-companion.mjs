/** Export the decorative companion from retained native-resolution catalogue frames. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

export async function buildMoruCompanion() {
  const root = 'assets/brand/moru';
  const catalogue = JSON.parse(await readFile(`${root}/moru.json`, 'utf8'));
  await exportSheet('moru-companion', ['wave', 'blink', 'tilt', 'hop', 'folder-open', 'folder-peek', 'soft-bow', 'pup-peek'], catalogue, root);
  await exportSheet('moru-reactions', ['shy', 'clap', 'dance', 'thinking', 'pondering', 'hearts', 'laugh', 'flipper-groove', 'soft-bow', 'flipper-five', 'hat-tip', 'nose-balance', 'pup-peek', 'heart-gift', 'magic-fish', 'star-sneeze', 'bubble-chase', 'sing'], catalogue, root);
  // Large pending fallbacks need native 128px source pixels, not an enlarged 64px export.
  for (const [state, id] of Object.entries({ waiting: 'blink', connect: 'connect', compile: 'source-read', greeting: 'wave' })) {
    await writeFile(`public/brand/mascot-${state}-row-128.png`, await readFile(`${root}/${catalogue.clips[id].sprite}`));
  }
}

async function exportSheet(name, sequence, catalogue, root) {
  const cell = catalogue.nativeCell, columns = 32;
  let frame = 0;
  const layers = [], clips = {};
  for (const id of sequence) {
    const clip = catalogue.clips[id];
    const strip = sharp(`${root}/${clip.sprite}`);
    for (let i = 0; i < clip.frames; i++) {
      const index = frame + i;
      layers.push({ input: await strip.clone().extract({ left: i * cell, top: 0, width: cell, height: cell }).png().toBuffer(), left: index % columns * cell, top: Math.floor(index / columns) * cell });
    }
    clips[id] = { firstFrame: frame, durationsMs: clip.durationsMs };
    frame += clip.frames;
  }
  const rows = Math.ceil(frame / columns);
  const sprite = await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: '#00000000' } }).composite(layers).png().toBuffer();
  await writeFile(`public/brand/${name}.png`, sprite);
  const digest = createHash('sha256').update(sprite).digest('hex').slice(0, 12);
  await writeFile(`src/shared/ui/marks/${name}.json`, JSON.stringify({ cell, columns, rows, frames: frame, digest, clips }, null, 2) + '\n');
}
