/**
 * Draws what the Work status lobby plays: the life clips the cast's verdicts approved, as two sheet layers (the
 * body, and what goes over the wardrobe), the wardrobe sheet and the atlas of poses and anchors. The moves the
 * verdicts left out (bound, belly slide, run) and the fishing and climbing spots the lobby has no pond or ladder for are not drawn.
 *
 *   pnpm brand:life    writes public/brand/moru-life-{base,over,wardrobe}.png and public/brand/moru-life.json
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { writeCataloguePace } from './moru-cast/catalogue-pace.mjs';
import { exportLifeAtlas } from './moru-cast/life/export-atlas.mjs';
import { REPO } from './moru-cast/lib.mjs';

/** The clips the lobby's runtime (`src/shared/ui/marks/moru/life/`) can ask for. */
export const LOBBY_CLIPS = [
  'rest', 'blink', 'look-ahead', 'look-back', 'sway', 'step', 'turn', 'wave', 'highfive', 'ask', 'reply-fish', 'reply-idea',
  'shrug', 'boo', 'startled', 'laugh', 'huff', 'yawn', 'nap', 'swap', 'roll', 'tiptoe',
];
const NAMES = { base: 'moru-life-base.png', over: 'moru-life-over.png', wardrobe: 'moru-life-wardrobe.png', json: 'moru-life.json' };
/** Lines of poses this wide keep the sheet near square, so no long clip widens every row. */
const WRAP = 1024;

export async function buildLife() {
  await writeCataloguePace();
  const dir = join(REPO, 'public/brand');
  await exportLifeAtlas({ dir, only: new Set(LOBBY_CLIPS), wrap: WRAP, names: NAMES });
  const sizes = await Promise.all(Object.values(NAMES).map(async name => [name, (await stat(join(dir, name))).size]));
  console.log(`[moru] lobby: ${sizes.map(([name, bytes]) => `${name} ${bytes}`).join(', ')}; ${sizes.reduce((sum, [, bytes]) => sum + bytes, 0)} bytes`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildLife();
