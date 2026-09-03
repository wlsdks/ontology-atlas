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

test('a measured profile separates each role contract and receipt, whole chain on screen', async ({
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
        const paintedFaces = [...document.querySelectorAll('.architecture-node-face')];
        return {
          boxWidth: Number(boxes[0]?.getAttribute('data-box-width') ?? 0),
          observationWidth: Number(
            document
              .querySelector('[data-testid^="architecture-observation-box-"]')
              ?.getAttribute('width') ?? 0,
          ),
          evidenceLayout: document
            .querySelector('[data-testid="architecture-graph"]')
            ?.getAttribute('data-evidence-layout'),
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
          /* The two caption lines of the role's sentence, measured the same way (Direction C). */
          captions: [
            ...document.querySelectorAll('[data-testid^="architecture-box-line-"]'),
          ].map((text) => (text as SVGTextElement).getBBox().width),
          /* Direction B: every drawn sentence clears every box and every other sentence. */
          sentenceOffenders: (() => {
            /* The role group includes one transparent hit rect spanning contract, delta, and
               observation. It is interactive geometry, not paint; collision checks use only the
               actual card faces. */
            const boxRects = paintedFaces.map((b) => b.getBoundingClientRect());
            const drawn = [...document.querySelectorAll('[data-edge-sentence="drawn"]')].map((t) => ({
              id: t.getAttribute('data-testid'),
              r: t.getBoundingClientRect(),
            }));
            const hits = (a: DOMRect, b: DOMRect) =>
              a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const out: string[] = [];
            for (const s of drawn) if (boxRects.some((b) => hits(s.r, b))) out.push(`${s.id} touches a box`);
            for (let i = 0; i < drawn.length; i++)
              for (let j = i + 1; j < drawn.length; j++)
                if (hits(drawn[i].r, drawn[j].r)) out.push(`${drawn[i].id} touches ${drawn[j].id}`);
            return out;
          })(),
          sentencesDrawn: document.querySelectorAll('[data-edge-sentence="drawn"]').length,
        };
      });

      const where = `${locale} @ ${size.width}`;
      /* No sentence crosses its own outline. */
      expect(Math.max(...measured.sentences), where).toBeLessThanOrEqual(
        measured.observationWidth - BOX_SIDE_PAD * 2,
      );
      expect(Math.max(...measured.captions), where).toBeLessThanOrEqual(
        measured.boxWidth - BOX_SIDE_PAD * 2,
      );
      /* And no role box sits below the fold: the whole chain is one screen. */
      expect(measured.belowFold, where).toBeLessThanOrEqual(1);
      /* Direction B: the strokes say their sentences, and none of them touches anything. */
      expect(measured.sentenceOffenders, `${where} ${measured.sentenceOffenders.join('\n')}`).toEqual([]);
      expect(measured.sentencesDrawn, where).toBeGreaterThanOrEqual(6);
      expect(measured.evidenceLayout, where).toBe(
        'paired-ladder',
      );
    }

    /* Hover answers locally; only a committed selection may dim the rest of the graph. */
    {
      await page.setViewportSize({ width: 1512, height: 945 });
      const routing = page.getByTestId('architecture-graph-box-routing');
      await routing.hover();
      const receded = page.getByTestId('architecture-graph-box-entities');
      await expect(routing).toHaveAttribute('data-architecture-role-state', 'hover');
      await expect
        .poll(() => receded.evaluate((el) => getComputedStyle(el).opacity), { timeout: 2000 })
        .toBe('1');

      await routing.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0 });
      await expect(routing).toHaveAttribute('data-architecture-role-state', 'active');
      await routing.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0 });

      await routing.click();
      await expect(routing).toHaveAttribute('data-architecture-role-state', 'selected');
      /* 0.65, not 0.35 (2026-09-03): at 0.35 a receded title measured 3.0:1 and its sentence
         1.7:1; the rest of the chain steps back but stays readable. */
      await expect
        .poll(() => receded.evaluate((el) => getComputedStyle(el).opacity), { timeout: 2000 })
        .toBe('0.65');
      const duration = await receded.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(duration, `${locale}: selected recede runs at the feedback step`).toBe('0.12s');
      await routing.click();
      await page.mouse.move(5, 5);
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

    /* The dock is closed, and the one-line evidence rail keeps the receipt verdict visible. */
    const dock = page.getByTestId('architecture-inspector');
    await expect(dock, where).toHaveAttribute('data-architecture-inspector-open', 'false');
    const evidenceRail = page.getByTestId('architecture-evidence-rail');
    await expect(evidenceRail, where).toBeVisible();
    await expect(evidenceRail, where).toContainText(/Inspection receipt|Source check required/);
    const toolbarGeometry = await page.evaluate(() =>
      ['architecture-evidence-rail', 'architecture-agent-action', 'architecture-inspector-toggle']
        .map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect))
        .map((rect) => ({ y: Math.round(rect.y), height: Math.round(rect.height) })),
    );
    expect(toolbarGeometry.map((rect) => rect.height), `${where} toolbar heights`).toEqual([
      44,
      44,
      44,
    ]);
    expect(new Set(toolbarGeometry.map((rect) => rect.y)).size, `${where} toolbar alignment`).toBe(1);

    /* Full provenance is a comparison dock, not a floating card covering the diagram. */
    const canvasBeforeEvidence = await page
      .getByTestId('architecture-flow-panel')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    await evidenceRail.click();
    const evidenceDock = page.getByTestId('architecture-evidence-dock');
    await expect(evidenceDock, where).toBeVisible();
    await expect(page.getByTestId('architecture-record-status'), where).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .getByTestId('architecture-flow-panel')
            .evaluate((element) => element.getBoundingClientRect().width),
        { message: `${where} evidence dock did not finish reserving its width` },
      )
      .toBeLessThan(canvasBeforeEvidence.width - 358);
    const canvasWithEvidence = await page
      .getByTestId('architecture-flow-panel')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    const evidenceDockRect = await evidenceDock.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(canvasWithEvidence.x, where).toBe(canvasBeforeEvidence.x);
    expect(canvasWithEvidence.y, where).toBe(canvasBeforeEvidence.y);
    expect(canvasWithEvidence.height, where).toBe(canvasBeforeEvidence.height);
    expect(canvasWithEvidence.width, `${where} evidence dock did not reserve its own width`).toBeLessThan(
      canvasBeforeEvidence.width - 300,
    );
    expect(canvasWithEvidence.width, `${where} evidence dock crushed the diagram`).toBeGreaterThan(900);
    expect(
      evidenceDockRect.x - (canvasWithEvidence.x + canvasWithEvidence.width),
      `${where} evidence dock covered the diagram`,
    ).toBeGreaterThanOrEqual(-1);
    expect(await travel(), where).toBeLessThanOrEqual(1);
    await page.getByTestId('architecture-evidence-close').click();
    await expect(page.getByTestId('architecture-graph'), where).toHaveAttribute(
      'data-evidence-layout',
      'paired-ladder',
    );

    /* Clicking a role opens the dock, and the dock leads with that role's own answer. */
    await page.locator('[data-testid="architecture-graph-box-widgets"]').click();
    await expect(dock, where).toHaveAttribute('data-architecture-inspector-open', 'true');
    if (size.width === 1512) {
      const selectionTrace = page.getByTestId('architecture-selection-trace-widgets');
      await expect(selectionTrace, where).toHaveAttribute('data-selected', 'true');
      await expect(selectionTrace, where).toHaveCSS('opacity', '1');
    }
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
    await expect(page.getByTestId('architecture-rules'), where).toBeVisible();

    /* Playback, guided walking, and prose-only workflow stages were removed: direct role
       selection plus the two factual docks are the complete visible path. */
    await expect(page.getByTestId('architecture-graph-run'), where).toHaveCount(0);
    await expect(page.getByTestId('architecture-walk'), where).toHaveCount(0);
    await expect(page.getByRole('radio'), where).toHaveCount(0);
    await page.getByTestId('architecture-inspector-close').click();
    await expect(dock, where).toHaveAttribute('data-architecture-inspector', 'none');
    expect(new URL(page.url()).searchParams.get('role'), where).toBeNull();
  }
});

test('a skip sentence never sits on another arc, sampled along the strokes', async ({ page }) => {
  /*
   * ⚠️ Review 2026-08-30 at 1920 with Entities selected: the sentence beside the shorter of two
   * nested skips sat on its own apex and the longer arc ran through it. The rectangle gates
   * compare sentences with boxes and with each other; an arc is a curve, so it is measured as
   * points along its length against every visible sentence's box, with 2px of air.
   */
  test.setTimeout(180_000);
  await openSeededVault(page);
  await page.goto('/en/architecture/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('architecture-flow-panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid^="architecture-role-ledger-"]')).toHaveCount(7, { timeout: 30_000 });
  for (const size of [
    { width: 1512, height: 945 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    for (const role of ['entities', 'views']) {
      await page.getByTestId(`architecture-graph-box-${role}`).click();
      await page.waitForTimeout(400);
      const touches = await page.evaluate(() => {
        const visible = (el: Element) => Number(getComputedStyle(el).opacity) > 0.05;
        const sentences = [...document.querySelectorAll('[data-edge-sentence]')]
          .filter(visible)
          .map((el) => ({ id: el.getAttribute('data-testid') ?? '', r: el.getBoundingClientRect() }));
        const arcs = [...document.querySelectorAll('path[data-edge-drawn="true"]')].filter(visible) as SVGPathElement[];
        const out: string[] = [];
        for (const arc of arcs) {
          const total = arc.getTotalLength();
          if (total === 0) continue;
          const key = `${arc.getAttribute('data-edge-from') ?? ''}-${arc.getAttribute('data-edge-to') ?? ''}`;
          const ctm = arc.getScreenCTM();
          if (!ctm) continue;
          for (let i = 0; i <= 60; i += 1) {
            const p = arc.getPointAtLength((i / 60) * total).matrixTransform(ctm);
            for (const s of sentences) {
              if (s.id.endsWith(`-${key}`)) continue;
              if (p.x >= s.r.left - 2 && p.x <= s.r.right + 2 && p.y >= s.r.top - 2 && p.y <= s.r.bottom + 2) {
                out.push(`${key} through ${s.id}`);
                break;
              }
            }
          }
        }
        return [...new Set(out)];
      });
      expect(touches, `${role} selected at ${size.width}: an arc runs through a sentence`).toEqual([]);
    }
    await page.getByTestId('architecture-graph-box-views').click();
    await page.mouse.move(2, 2);
  }
});

test('the count of what is below sits inside the faded strip, never on opaque ink', async ({ page }) => {
  /*
   * ⚠️ Review 2026-08-30, seven-role profile in a 1512x620 window: the badge stood 28px tall on a
   * 16px fade, so 12px of it sat on the last visible box's receipt line. The strip is two insets
   * tall now and the badge must lie within it; the four-role sample never cuts a chain at the
   * bottom, so only this profile can exercise the count.
   */
  test.setTimeout(180_000);
  await openSeededVault(page);
  await page.goto('/en/architecture/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('architecture-flow-panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid^="architecture-role-ledger-"]')).toHaveCount(7, { timeout: 30_000 });
  await page.setViewportSize({ width: 1512, height: 620 });
  const pill = page.getByTestId('architecture-canvas-hidden-below');
  await expect(pill).toBeVisible({ timeout: 10_000 });
  const strip = await page.evaluate(() => {
    const badge = document.querySelector('[data-testid="architecture-canvas-hidden-below"]')!;
    const scroller = document.querySelector('[data-testid="architecture-graph"]')!.parentElement!;
    /* The strip is whatever the mask actually fades, read back from the computed gradient
       ("linear-gradient(to top, transparent 0px, rgb(0, 0, 0) 32px)"), not a number of our own. */
    const style = getComputedStyle(scroller);
    const mask = style.maskImage !== 'none' ? style.maskImage : style.webkitMaskImage;
    const toTop = /to top,.*\s([\d.]+)px\)/.exec(mask ?? '');
    const fadePx = toTop ? parseFloat(toTop[1]) : 0;
    const p = badge.getBoundingClientRect();
    const c = scroller.getBoundingClientRect();
    return { mask, fadePx, pillTop: p.top, pillBottom: p.bottom, stripTop: c.bottom - fadePx, bottom: c.bottom };
  });
  expect(strip.fadePx, `no bottom fade read from the mask: ${strip.mask}`).toBeGreaterThan(0);
  expect(strip.pillTop, `the count stands ${strip.stripTop - strip.pillTop}px above the ${strip.fadePx}px fade`).toBeGreaterThanOrEqual(strip.stripTop - 0.5);
  expect(strip.pillBottom).toBeLessThanOrEqual(strip.bottom + 0.5);
});

test('choosing a role does not turn the chain, and the chosen box is in view', async ({ page }) => {
  /*
   * ⚠️ Measured 2026-08-30 at 1920: the chain ran across at rest; choosing Entities opened the
   * inspector beside the canvas, the canvas narrowed from 1756px to 1376px, and the whole drawing
   * turned into a column under the click. The axis is measured against the canvas at rest now;
   * a selection may cut the chain but not turn it, and the chosen box is scrolled into view.
   */
  test.setTimeout(180_000);
  await openSeededVault(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/en/architecture/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid^="architecture-role-ledger-"]')).toHaveCount(7, { timeout: 30_000 });
  await page.waitForTimeout(600);
  const axisOf = () =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-testid^="architecture-graph-box-"]')].map((b) => b.getBoundingClientRect());
      return boxes.length > 1 && Math.abs(boxes[0].top - boxes[1].top) < 1 ? 'across' : 'down';
    });
  /* Since 2026-09-03 the seven rows fit a 1080px canvas, so the comparison ladder runs down at
     rest here too; the claim under test is unchanged — a click may not turn it. */
  expect(await axisOf(), 'the seven-role chain runs down at 1920×1080 at rest').toBe('down');
  for (const role of ['shared', 'routing', 'entities']) {
    await page.getByTestId(`architecture-graph-box-${role}`).click();
    await page.waitForTimeout(900);
    expect(await axisOf(), `choosing ${role} turned the chain`).toBe('down');
    const seen = await page.evaluate((id) => {
      const box = document.querySelector(`[data-testid="architecture-graph-box-${id}"]`)!.getBoundingClientRect();
      const scroller = document.querySelector('[data-testid="architecture-graph"]')!.parentElement!.getBoundingClientRect();
      return box.left >= scroller.left - 1 && box.right <= scroller.right + 1 && box.top >= scroller.top - 1 && box.bottom <= scroller.bottom + 1;
    }, role);
    expect(seen, `${role} is chosen but not in view`).toBe(true);
    /* No stale sentence survives the re-render: one sentence element per stroke, no two alike. */
    const counts = await page.evaluate(() => {
      const strokes = document.querySelectorAll('path[data-edge-from]').length;
      const sentences = [...document.querySelectorAll('[data-edge-sentence]')];
      const seenKeys = new Set<string>();
      let alike = 0;
      for (const t of sentences) {
        const k = `${t.getAttribute('data-edge-sentence-kind')}:${t.getAttribute('data-testid')}`;
        if (seenKeys.has(k)) alike += 1;
        seenKeys.add(k);
      }
      return { strokes, sentences: sentences.length, alike };
    });
    expect(counts.sentences, 'a sentence element per stroke').toBe(counts.strokes);
    expect(counts.alike, 'two sentence elements share one stroke').toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
});
