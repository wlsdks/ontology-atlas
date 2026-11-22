/**
 * Regenerates the whole Moru cast preview into a git-ignored folder (`output/moru-cast/`, or `MORU_CAST_OUT`):
 * every clip as a 128px strip, a 64px strip and two GIFs, the measurements, the contact sheets, the cast line-up,
 * the bubble and prop sheet, the life prototype page and the farm page. Nothing here is shipped; the plan and
 * the open items are in `docs/specs/2026-11-22-moru-cast.md`.
 *
 *   pnpm brand:cast-preview
 *
 * The life runtime, scripts/brand/moru-cast/life/behaviour.mjs, is pure (no DOM, clock or randomness of its own);
 * life/build-page.mjs inlines it as text, and the measuring scripts below import it.
 *
 * Every step is also a script of its own, run after this one has written what it reads:
 *   node scripts/brand/moru-cast/build-clips.mjs [clip id]   one clip, or the clips whose id contains it
 *   node scripts/brand/moru-cast/check-64-neutral.mjs [ids]  64px poses against the shipped 64px neutral
 *   node scripts/brand/moru-cast/actor-gap.mjs <ids>         nearest pixels of two actors, per pose
 *   node scripts/brand/moru-cast/life/measure-life.mjs [seconds] [Moru] [Hz] [width] [movers]
 *   node scripts/brand/moru-cast/life/pose-variety.mjs       distinct poses a floor of 20 shows
 * The browser measurements drive the life page with Playwright:
 *   node scripts/brand/moru-cast/life/browser/cpu.mjs [seconds]
 *   node scripts/brand/moru-cast/life/browser/heap.mjs [seconds]
 *   node scripts/brand/moru-cast/life/browser/where.mjs webkit|chromium [seconds]
 *   node scripts/brand/moru-cast/life/browser/capture.mjs <name> <query> <width> <height> <seconds> [fps] [from]
 *   node scripts/brand/moru-cast/life/browser/cover-page.mjs <query> <width> <seconds> [near]
 */
import { mkdir, rm } from 'node:fs/promises';
import { relative } from 'node:path';
import { OUT, REPO } from './lib.mjs';
import { writeCataloguePace } from './catalogue-pace.mjs';

// Only a folder under output/ or .tmp/ is cleared first, so a mistyped MORU_CAST_OUT cannot empty anything else.
if (/^(output|\.tmp)\/./.test(relative(REPO, OUT))) await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeCataloguePace();
await import('./build-clips.mjs');
await import('./palette-contrast.mjs');
await import('./palette-check.mjs');
await import('./check-64-neutral.mjs');
await import('./cast-sheet.mjs');
await import('./contact-sheets.mjs');
await import('./life/export-atlas.mjs');
await import('./life/wardrobe-check.mjs');
await import('./life/build-page.mjs');
await import('./farm/build-farm-page.mjs');
console.log('Moru cast preview written to', OUT);
