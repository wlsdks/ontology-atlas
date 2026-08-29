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

/** Opens the seeded vault the only way a browser can: through the picker the stub replaces. */
async function openSeededVault(page: import('@playwright/test').Page) {
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
}

test('a measured profile states each role’s receipt inside its box, whole chain on screen', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openSeededVault(page);

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

/**
 * The workbench is a canvas with docks, not a page that scrolls.
 *
 * ⚠️ **What this replaces, in numbers** (installed app and browser, 1512×945, 2026-08-30). The
 * screen was a two-row grid: the canvas took 967px of an 844px viewport row and the second row —
 * the applied scopes, the rules, the receipt, the chosen role — got 64px each, with 66px and 219px
 * of their own hidden content. The page scroller had 187px of travel and was already at its end,
 * so the lower half was not long, it was unreachable. The owner's instruction for the fix is the
 * subject of this gate: structurally there is to be no scroll below the canvas at all — a canvas,
 * and panels that open on a click.
 */
test('the workbench holds one screen: no page scroll, and the panels open on a click', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openSeededVault(page);

  for (const size of [
    { width: 1512, height: 945 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/en/architecture/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('architecture-flow-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid^="architecture-role-ledger-"]')).toHaveCount(7, {
      timeout: 30_000,
    });
    const where = `@ ${size.width}`;

    /* Nothing below the fold, because there is no below: the layout does not scroll. */
    const travel = () =>
      page.evaluate(() => {
        const scroller = document.querySelector(
          '[data-testid="architecture-layout-scroll"]',
        ) as HTMLElement;
        return scroller.scrollHeight - scroller.clientHeight;
      });
    expect(await travel(), where).toBeLessThanOrEqual(1);

    /* The dock is closed, and what the receipt says is on the canvas anyway. */
    const dock = page.getByTestId('architecture-inspector');
    await expect(dock, where).toHaveAttribute('data-architecture-inspector-open', 'false');
    await expect(page.getByTestId('architecture-record-status'), where).toBeVisible();

    /* Clicking a role opens the dock, and the dock leads with that role's own answer. */
    await page.locator('[data-testid="architecture-graph-box-widgets"]').click();
    await expect(dock, where).toHaveAttribute('data-architecture-inspector-open', 'true');
    const detail = page.getByTestId('architecture-role-detail');
    await expect(detail, where).toBeVisible();
    expect(await travel(), where).toBeLessThanOrEqual(1);

    /* Opening a dock never costs the drawing: the chain still ends above the fold. */
    const belowFold = await page.evaluate(() =>
      Math.max(
        0,
        ...[...document.querySelectorAll('[data-testid^="architecture-graph-box-"]')].map(
          (box) => box.getBoundingClientRect().bottom - window.innerHeight,
        ),
      ),
    );
    expect(belowFold, where).toBeLessThanOrEqual(1);

    /* Escape closes the dock and keeps the choice — the canvas still shows what was picked. */
    await page.keyboard.press('Escape');
    await expect(dock, where).toHaveAttribute('data-architecture-inspector-open', 'false');

    /* And the button opens it again without any role being chosen. */
    await page.getByTestId('architecture-inspector-toggle').click();
    await expect(dock, where).toHaveAttribute('data-architecture-inspector-open', 'true');
    await expect(page.getByTestId('architecture-edge-sentences'), where).toBeVisible();
  }
});
