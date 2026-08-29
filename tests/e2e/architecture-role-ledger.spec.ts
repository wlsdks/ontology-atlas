import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

/**
 * The role ledger — **the receipt has to fit the box, and the chain has to fit the canvas.**
 *
 * Both halves are geometry no unit test can see. jsdom lays no text out, so the sentence inside a
 * role box measures nothing there; and whether seven boxes clear the canvas depends on the panel
 * height the real layout hands the scroller. Both were real defects on 2026-08-30, found by
 * screenshotting the running app rather than by reading the arithmetic:
 *
 * 1. the first two-line receipt made the boxes 82px tall, and **Shared foundation — the role every
 *    arrow points at — was cut in half** below the fold at 1512;
 * 2. the one-line receipt then rendered 144–156px wide inside a 148px box, so the sentence
 *    **crossed both outlines**.
 *
 * The vault is seeded through the picker stub because the receipt lives in
 * `.ontology-atlas/architecture/<slug>.json`, which only a vault handle can reach — the shipped
 * sample has none, so no other entry point can put a ledger on the screen at all.
 */

const VAULT_ROOT = path.resolve(__dirname, '../../docs/ontology');

/** Enough of the dogfood vault to open it and reach the profile the receipt is written for. */
const KEEP = /^(architecture\/|projects\/|domains\/|README)/;

function collectVault(dir: string, prefix = ''): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(seed, collectVault(path.join(dir, entry.name), rel));
    else if (/\.(md|json)$/.test(entry.name) && KEEP.test(rel))
      seed[rel] = fs.readFileSync(path.join(dir, entry.name), 'utf8');
  }
  return seed;
}

/**
 * ⚠️ **The receipt is written by this spec, not read off the disk.** `.ontology-atlas/` is
 * gitignored — it is the private sidecar boundary, so the dogfood vault carries a real record on
 * the machine that measured it and none at all on a fresh checkout. Reading it made this gate pass
 * locally and fail in CI with zero ledgers. Minting one here also lets the measurement cover the
 * *longest* sentence a box can hold rather than only the shortest: one violated role with a
 * five-digit import count sits beside the clean ones.
 */
function seedRecord(seed: Record<string, string>): void {
  const profile = seed['architecture/ontology-atlas-web.md'];
  const uid = /profile_uid:\s*([0-9a-f-]+)/.exec(profile ?? '')?.[1];
  const slug = /profile_slug:\s*(\S+)/.exec(profile ?? '')?.[1];
  if (!uid || !slug) throw new Error('the seeded profile lost its uid or slug');
  seed[`.ontology-atlas/architecture/${slug}.json`] = JSON.stringify({
    contract: 'architectureRecord:v1',
    profile: { uid, slug, contentHash: `sha256:${'a'.repeat(64)}` },
    brief: {
      contract: 'architectureBrief:v1',
      measured: {
        at: '2026-08-30T00:00:00.000Z',
        tool: { name: 'ontology-atlas', version: '0.13.0' },
        source: { kind: 'git', revision: 'abc1234', dirty: false },
      },
      conformance: {
        status: 'violated',
        violationCount: 2,
        violations: [
          { fromRole: 'entities', toRole: 'widgets', from: 'a.ts', to: 'b.ts' },
          { fromRole: 'entities', toRole: 'views', from: 'c.ts', to: 'd.ts' },
        ],
        observedRoleEdges: [
          { fromRole: 'routing', toRole: 'shared', count: 45 },
          { fromRole: 'app', toRole: 'shared', count: 16 },
          { fromRole: 'views', toRole: 'shared', count: 26_000 },
          { fromRole: 'widgets', toRole: 'shared', count: 314 },
          { fromRole: 'features', toRole: 'shared', count: 143 },
          { fromRole: 'entities', toRole: 'shared', count: 23 },
          { fromRole: 'entities', toRole: 'widgets', count: 2 },
          { fromRole: 'entities', toRole: 'views', count: 1 },
        ],
        unknown: { emptyRoles: ['shared'] },
      },
    },
  });
}

/** The inner width a box gives its sentence: the box, less the padding either side. */
const BOX_SIDE_PAD = 12;

test('a measured profile states each role’s receipt inside its box, whole chain on screen', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 945 });
  await seedFirstRunSeen(page);
  const seed = collectVault(VAULT_ROOT);
  seedRecord(seed);
  await stubDirectoryPicker(page, seed);

  await page.goto('/en/topology/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('topology-map-v2-canvas').first()).toBeVisible({ timeout: 60_000 });
  /* Until the picked vault is the source — the sample answers the same selectors otherwise. */
  await expect
    .poll(() => page.evaluate(() => !document.body.innerText.includes('SAMPLE FOR NOW')), {
      timeout: 60_000,
    })
    .toBe(true);

  for (const locale of ['en', 'ko']) {
    await page.goto(`/${locale}/architecture/?e2e=1&guides=off`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('architecture-flow-panel')).toBeVisible({ timeout: 60_000 });
    const ledgers = page.locator('[data-testid^="architecture-role-ledger-"]');
    await expect(ledgers).toHaveCount(7, { timeout: 30_000 });

    for (const size of [
      { width: 1512, height: 945 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      /* The axis is chosen from the measured canvas width; let that settle before reading it. */
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const svg = document.querySelector('[data-testid="architecture-graph"]');
              return svg?.getBoundingClientRect().width ?? 0;
            }),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);

      const measured = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('[data-testid^="architecture-graph-box-"]')];
        const rect = boxes[0]?.querySelector('rect');
        return {
          boxWidth: Number(rect?.getAttribute('width') ?? 0),
          /*
           * How far the lowest box falls below the fold — the measurement that catches a chain
           * running off the screen. Neither the scroller's `scrollHeight` nor the box's position
           * inside the canvas can say this: the canvas sizes itself to its drawing and lets the
           * page scroll instead, which is exactly how the cut-in-half box on 2026-08-30 stayed
           * invisible to arithmetic. Measured: 0px at a 74px box, 60px at 90px.
           */
          belowFold: Math.max(
            0,
            ...boxes.map((box) => box.getBoundingClientRect().bottom - window.innerHeight),
          ),
          sentences: [
            ...document.querySelectorAll('[data-testid^="architecture-role-ledger-"]'),
          ].map((text) => (text as SVGTextElement).getBBox().width),
        };
      });

      const where = `${locale} @ ${size.width}`;
      /* No sentence crosses its own outline. */
      expect(Math.max(...measured.sentences), where).toBeLessThanOrEqual(
        measured.boxWidth - BOX_SIDE_PAD * 2,
      );
      /* And no role box sits below the fold: the whole chain is one screen. */
      expect(measured.belowFold, where).toBeLessThanOrEqual(1);
    }
  }
});
