import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { FIT_LOCALES } from '../locales';
import { stubDirectoryPicker } from '../vault-picker-stub';
import { waitForAnimationsDone, waitForBoxStill } from "../settle";

/**
 * The architecture graph has finished rearranging.
 *
 * A selection cuts strokes, scrolls a box into view and fades sentences in, and a resize
 * relays the whole ladder — so what the measurements below need is "the arrangement has
 * landed", which is the graph's box repeating across frames with nothing still animating
 * inside it. The 300–900 ms sleeps this replaces were four different guesses at the same
 * state.
 */
async function graphSettled(page: import("@playwright/test").Page) {
  const graph = page.locator('[data-testid="architecture-graph"]');
  await expect(graph).toHaveCount(1, { timeout: 30_000 });
  await waitForAnimationsDone(graph);
  await waitForBoxStill(graph);
}


const VAULT_ROOT = path.resolve(__dirname, '../../../docs/ontology');

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
  await expect(page.getByTestId('ontology-map-canvas').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid^="first-run-starter"]')).toHaveCount(0, {
    timeout: 60_000,
  });
}

test('a measured profile separates each role contract and receipt, whole chain on screen', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openSeededVault(page);

  for (const locale of FIT_LOCALES) {
    await page.goto(`/${locale}/architecture/?view=architecture&e2e=1&guides=off`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('architecture-flow-panel')).toBeVisible({ timeout: 60_000 });
    const ledgers = page.locator('[data-testid^="architecture-role-ledger-"]');
    await expect(ledgers).toHaveCount(7, { timeout: 30_000 });

    for (const size of [
      { width: 1512, height: 945 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      /* The axis is chosen from the measured canvas width, a frame or more after the resize.
         A width above zero is true of the old layout too, so wait for the relaid graph to land. */
      await graphSettled(page);

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
           * Distance the lowest box falls below the fold;
           * the canvas sizes to its drawing, so scrollHeight cannot show it.
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
      expect(measured.evidenceLayout, where).toBe('paired-ladder');
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
      /* 0.7, not 0.35: at 0.35 receded text falls below 3:1 contrast; at 0.7 it stays at or above 3:1. */
      await expect
        .poll(() => receded.evaluate((el) => getComputedStyle(el).opacity), { timeout: 2000 })
        .toBe('0.7');
      const duration = await receded.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(duration, `${locale}: selected recede runs at the feedback step`).toBe('0.12s');
      await routing.click();
      await page.mouse.move(5, 5);
    }
  }
});

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
    await page.goto('/en/architecture/?view=architecture&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
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
    /* 40 is the standard `md` control height, matching the Harness shell tabs. */
    expect(toolbarGeometry.map((rect) => rect.height), `${where} toolbar heights`).toEqual([
      40,
      40,
      40,
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

    await expect(page.getByTestId('architecture-graph-run'), where).toHaveCount(0);
    await expect(page.getByTestId('architecture-walk'), where).toHaveCount(0);
    await expect(page.getByRole('radio'), where).toHaveCount(0);
    await page.getByTestId('architecture-inspector-close').click();
    await expect(dock, where).toHaveAttribute('data-architecture-inspector', 'none');
    expect(new URL(page.url()).searchParams.get('role'), where).toBeNull();
  }
});

test('a skip sentence never sits on another arc, sampled along the strokes', async ({ page }) => {
  /* An arc is a curve, so sample points along it against every visible sentence box with 2px of air. */
  test.setTimeout(180_000);
  await openSeededVault(page);
  await page.goto('/en/architecture/?view=architecture&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('architecture-flow-panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid^="architecture-role-ledger-"]')).toHaveCount(7, { timeout: 30_000 });
  for (const size of [
    { width: 1512, height: 945 },
    { width: 1920, height: 1080 },
    /* A wide but short canvas is the one place the split across chain still draws. */
    { width: 1920, height: 800 },
  ]) {
    await page.setViewportSize(size);
    // The ladder relays out for the new width; measure the arrangement it lands on.
    await graphSettled(page);
    for (const role of ['entities', 'views']) {
      await page.getByTestId(`architecture-graph-box-${role}`).click();
      await graphSettled(page);
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

test('choosing a role does not turn the chain, and the chosen box is in view', async ({ page }) => {
  test.setTimeout(180_000);
  await openSeededVault(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/en/architecture/?view=architecture&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid^="architecture-role-ledger-"]')).toHaveCount(7, { timeout: 30_000 });
  await graphSettled(page);
  const axisOf = () =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-testid^="architecture-graph-box-"]')].map((b) => b.getBoundingClientRect());
      return boxes.length > 1 && Math.abs(boxes[0].top - boxes[1].top) < 1 ? 'across' : 'down';
    });
  expect(await axisOf(), 'the seven-role chain runs down at 1920×1080 at rest').toBe('down');
  for (const role of ['shared', 'routing', 'entities']) {
    await page.getByTestId(`architecture-graph-box-${role}`).click();
    await graphSettled(page);
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
    await graphSettled(page);
  }
});
