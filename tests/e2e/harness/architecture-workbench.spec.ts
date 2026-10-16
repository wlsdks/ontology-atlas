import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { useDogfoodSample } from '../sample-source';
import { waitForAnimationsDone, waitForBoxStill } from '../settle';

test.use({ viewport: { width: 1512, height: 945 } });


test('the agent task chooser offers a re-check and an improvement search beside the derived task', async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  await page.addInitScript(() => {
    (window as unknown as { __copied: string[] }).__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copied: string[] }).__copied.push(text);
        },
      },
    });
  });
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/ko/architecture/?view=architecture&guides=off');
  await expect(page.getByTestId('architecture-graph')).toBeVisible();

  const trigger = page.getByTestId('architecture-agent-task-menu');
  await expect(page.getByTestId('architecture-agent-task-popover')).toHaveCount(0);
  await trigger.click();
  const menu = page.getByTestId('architecture-agent-task-popover');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  await expect(menu.getByTestId('architecture-agent-task-verify')).toHaveAttribute('aria-current', 'true');
  /* The menu owns the space under the trigger: nothing covers its items. */
  const owns = await menu.getByTestId('architecture-agent-task-improve').evaluate((item) => {
    const rect = item.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === item || item.contains(hit);
  });
  expect(owns).toBe(true);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  /* Escape closed the menu only; no dock was open, and none opened. */
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute(
    'data-architecture-inspector',
    'none',
  );

  await trigger.click();
  await menu.getByTestId('architecture-agent-task-improve').click();
  await expect(page.getByTestId('architecture-agent-action')).toHaveAttribute(
    'data-architecture-copy-state',
    'copied',
  );
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied).toHaveLength(1);
  expect(copied[0]).toContain('"kind":"improve"');
  expect(copied[0]).toContain('This is an improvement-finding task');
  expect(copied[0]).toContain('Write nothing');
});

test('obsolete workflow-stage links do not resurrect the removed prose panels', async ({ page }) => {
  await page.goto('/ko/architecture/?view=architecture&stage=plan');
  await expect(page.getByTestId('architecture-graph')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('[data-architecture-stage]')).toHaveCount(0);
  await expect(page.locator('pre[aria-label]')).toHaveCount(0);

  await page.getByTestId('architecture-graph-box-application').click();
  const address = new URL(page.url()).searchParams;
  expect(address.get('stage')).toBeNull();
  expect(address.get('role')).toBe('application');
});

test('keyboard opens, closes, restores focus, and reopens the selected role', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/ko/architecture/?view=architecture&guides=off');

  const evidence = page.getByTestId('architecture-evidence-rail');
  await evidence.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('architecture-evidence-dock')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(evidence).toBeFocused();

  const role = page.getByTestId('architecture-graph-box-application');
  await role.focus();
  await page.keyboard.press('Enter');
  await expect(role).toHaveAttribute('aria-pressed', 'true');
  await expect(role).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute(
    'data-architecture-inspector',
    'role',
  );

  await page.keyboard.press('Escape');
  await expect(role).toBeFocused();
  await expect(role).toHaveAttribute('aria-pressed', 'false');
  await expect(role).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Space');
  await expect(role).toHaveAttribute('aria-expanded', 'true');
  await expect(role).toHaveAttribute('aria-pressed', 'true');

  /* The 380px role dock must take unused connector space before it hides a role. This is the
     installed app's 1512px width: previously the final role sat partly behind the dock and the
     toolbar looked fixed while the first real action broke the canvas beneath it. */
  await waitForAnimationsDone(page.locator('body'));
  await waitForBoxStill(page.getByTestId('architecture-graph'));
  await waitForBoxStill(page.getByTestId('architecture-graph-box-application'));
  const selectedFit = await page.getByTestId('architecture-graph').evaluate((svg) => {
    const viewport = svg.closest('[data-testid="architecture-canvas-scroller"]')!.getBoundingClientRect();
    const boxes = [...svg.querySelectorAll('[data-testid^="architecture-graph-box-"]')];
    return {
      hidden: boxes.filter((box) => {
        const rect = box.getBoundingClientRect();
        return rect.left < viewport.left - 1 || rect.right > viewport.right + 1;
      }).length,
      columnGap: Number(svg.getAttribute('data-column-gap')),
    };
  });
  expect(selectedFit.hidden).toBe(0);
  expect(selectedFit.columnGap).toBeGreaterThanOrEqual(20);
});

test('a link carries the chosen role, and refuses one the profile lacks', async ({ page }) => {
  /*
   * ⚠️ Selecting a role left the address unchanged and a reload dropped it — the same defect the
   * stage had, on the half a person is likelier to send: "look at what widgets may depend on" is a
   * link, not an instruction to go and click something. It is also the technique the public
   * writing on driving coding agents keeps naming: a deep link straight to the exact state rather
   * than the clicks that reproduce it.
   *
   * The second half matters more than the first. Before the honoured role was derived,
   * `?role=not-a-real-role` did not render an empty card — it rendered one titled with the string
   * and asserting that it depends on no role at all. A screen stating a dependency rule for a role
   * that does not exist is saying something false, and a crafted or stale link is enough to do it.
   */
  /* A window that holds the whole chain; below it the canvas pans, which is a different subject. */
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/ko/architecture/?view=architecture');

  await page.getByTestId('architecture-graph-box-application').click();
  expect(new URL(page.url()).searchParams.get('role')).toBe('application');

  await page.reload();
  await expect(page.getByTestId('architecture-graph-box-application')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  /* Deselecting takes it back out, so the bare address keeps meaning "nothing chosen". */
  await page.getByTestId('architecture-graph-box-application').click();
  expect(new URL(page.url()).searchParams.get('role')).toBeNull();

  await page.goto('/ko/architecture/?role=not-a-real-role');
  await expect(page.locator('[data-testid^="architecture-concepts-"]')).toHaveCount(0);

  /*
   * ⚠️ And it says so. Declining a link silently renders a page identical to one nobody has
   * clicked on yet: a second fresh-eyes walker arrived on a role this profile does not have and
   * could not tell "the link pointed somewhere I do not have" from "I have not picked anything".
   * The three arrival states must be distinguishable from each other, which is why all three are
   * asserted here rather than only the one that changed.
   */
  const notice = page.getByTestId('architecture-role-not-in-profile');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('not-a-real-role');

  await page.goto('/ko/architecture/?view=architecture');
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute(
    'data-architecture-inspector',
    'none',
  );
  await expect(notice).toHaveCount(0);
  /* The button opens the profile's rules, never a role's answer: nothing has been chosen. */
  await page.getByTestId('architecture-inspector-toggle').click();
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute(
    'data-architecture-inspector',
    'rules',
  );
  await expect(page.getByTestId('architecture-rules')).toBeVisible();

  await page.goto('/ko/architecture/?role=application');
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute(
    'data-architecture-inspector',
    'role',
  );
  await expect(page.getByTestId('architecture-role-detail-empty')).toHaveCount(0);
  await expect(notice).toHaveCount(0);
});

test('a chain is never cut in silence — it turns, or it says what is hidden', async ({ page }) => {
  const sizes = [
    [1920, 1200],
    [1440, 1000],
    [1280, 720],
    [1100, 900],
    [1040, 720],
  ] as const;

  await page.goto('/ko/architecture/?view=architecture');
  // Wait for hydration to replace the neutral identity boundary before measuring the canvas.
  await expect(page.getByTestId('architecture-graph')).toBeVisible();
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    /* ResizeObserver updates the measured axis, then React commits the resulting SVG on the next
       frame. Measuring before that lands reads a stale role group against the new canvas and
       reports a role cut in silence even though the settled frame is whole — so the graph's box
       has to stop moving first, however many frames that takes on this runner. */
    await waitForBoxStill(page.getByTestId('architecture-graph'));
    /* Whatever is out of view may pan, but it must be counted on screen and reachable. */
    const hidden = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="architecture-graph"]');
      const canvas = svg?.closest('[data-testid="architecture-canvas-scroller"]')?.getBoundingClientRect();
      if (!canvas) return 0;
      /* A box, not a pixel: a canvas one rounding pixel short of its drawing hides nothing, and a
         count that says "0 more below" would be noise. What must never be silent is a whole role
         out of view. */
      return [...document.querySelectorAll('[data-testid^="architecture-graph-box-"]')].filter(
        (box) => {
          const at = box.getBoundingClientRect();
          return at.bottom > canvas.bottom + 4 || at.top < canvas.top - 4 ||
            at.right > canvas.right + 4 || at.left < canvas.left - 4;
        },
      ).length;
    });
    if (hidden > 0) {
      const counted = await page
        .locator(
          '[data-testid="architecture-canvas-hidden-below"], [data-testid="architecture-canvas-hidden-right"], [data-testid="architecture-canvas-hidden-left"]',
        )
        .count();
      expect(
        counted,
        `${hidden} role(s) are out of view in silence at ${width}x${height}`,
      ).toBeGreaterThan(0);
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      `the page scrolls sideways at ${width}x${height}`,
    ).toBe(0);

    if (width >= 1280) {
      expect(
        await page.evaluate(() => {
          const scroller = document.querySelector(
            '[data-testid="architecture-layout-scroll"]',
          ) as HTMLElement;
          return scroller.scrollHeight - scroller.clientHeight;
        }),
        `the workbench scrolls vertically at ${width}x${height}`,
      ).toBeLessThanOrEqual(1);
    }

    /*
     * Slack is shared between both sides, within 2px for the odd-pixel split;
     * skipped where there is no slack.
     */
    const gaps = await page
      .locator('[data-testid="architecture-graph"]')
      .evaluate((svg) => {
        const scroller = svg.closest('[data-testid="architecture-canvas-scroller"]') as HTMLElement;
        const s = scroller.getBoundingClientRect();
        const v = svg.getBoundingClientRect();
        return { left: v.left - s.left, right: s.right - v.right };
      });
    if (gaps.left + gaps.right > 4) {
      expect(
        Math.abs(gaps.left - gaps.right),
        `the drawing hugs one edge at ${width}x${height} (left ${Math.round(gaps.left)}, right ${Math.round(gaps.right)})`,
      ).toBeLessThanOrEqual(2);
    }
  }
});


/* For a stadium the allowed line width is the straight middle plus the cap chord at that height. */
test('a role sentence stays inside the drawn box, including a stadium cap', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/en/architecture/?view=architecture&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('architecture-graph')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);

  const offenders = await page.evaluate(() => {
    const PAD = 8;
    const out: string[] = [];
    for (const g of document.querySelectorAll('[data-testid^="architecture-graph-box-"]')) {
      const id = g.getAttribute('data-testid')!.replace('architecture-graph-box-', '');
      const box = g.getBoundingClientRect();
      const w = Number(g.getAttribute('data-box-width'));
      const h = Number(g.getAttribute('data-box-height'));
      const rect = g.querySelector('rect');
      /* Process cards are softly rounded too (`rx=6`). A stadium is the shape whose cap radius is
         half its height; treating every rounded rectangle as a stadium invented a 186px cap chord
         inside a 220px process card and reported contained text as overflow. */
      const isStadium = Number(rect?.getAttribute('rx') ?? 0) >= h / 2 - 0.5;
      const chordAt = (y: number) => {
        if (!isStadium) return w;
        const r = h / 2;
        const d = Math.abs(y - r);
        return Math.max(0, w - h) + 2 * Math.sqrt(Math.max(0, r * r - d * d));
      };
      for (const span of g.querySelectorAll('[data-testid^="architecture-box-line-"] tspan, [data-testid^="architecture-box-line-"]')) {
        const b = span.getBoundingClientRect();
        if (b.width === 0) continue;
        const top = b.top - box.top;
        const bottom = b.bottom - box.top;
        const allowed = Math.min(chordAt(top), chordAt(bottom)) - PAD * 2;
        if (b.width > allowed + 0.5)
          out.push(`${id}: "${span.textContent}" is ${b.width.toFixed(1)}px wide, room ${allowed.toFixed(1)}px`);
      }
    }
    return out;
  });
  expect(offenders, offenders.join('\n')).toEqual([]);
});


test('every drawn stroke says its sentence, and no sentence touches anything', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/en/architecture/?view=architecture&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('architecture-graph')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);

  const rest = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-testid^="architecture-graph-box-"]')].map((b) => b.getBoundingClientRect());
    const drawn = [...document.querySelectorAll('[data-edge-sentence="drawn"]')].map((t) => ({ id: t.getAttribute('data-testid'), r: t.getBoundingClientRect() }));
    const hits = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const offenders: string[] = [];
    for (const s of drawn) if (boxes.some((b) => hits(s.r, b))) offenders.push(`${s.id} touches a box`);
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) if (hits(drawn[i].r, drawn[j].r)) offenders.push(`${drawn[i].id} touches ${drawn[j].id}`);
    const strokes = document.querySelectorAll('path[data-edge-drawn="true"]').length;
    return { drawn: drawn.length, strokes, offenders };
  });
  expect(rest.offenders, rest.offenders.join('\n')).toEqual([]);
  expect(rest.drawn).toBeGreaterThan(0);
  /* Adjacent strokes carry their rule; where a measured count shares the gap the rule wins. */
  expect(rest.drawn).toBeLessThanOrEqual(rest.strokes);
  /* Every role in a hexagonal profile touches every other, so nothing recedes here; the hover
     transition is measured on the seven-role profile in architecture-role-ledger.spec.ts. */
});


test('an explicit (hexagonal) profile on the ladder still says each rule on its own stroke', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/en/architecture/?view=architecture&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  const graph = page.getByTestId('architecture-graph');
  await expect(graph).toHaveAttribute('data-architecture-layout-ready', 'true', { timeout: 60_000 });
  await expect(graph).toHaveAttribute('data-evidence-layout', 'paired-ladder');
  const read = () =>
    page.evaluate(() => ({
      rulesDrawn: document.querySelectorAll('[data-edge-sentence-kind="permitted"][data-edge-sentence="drawn"]').length,
      saidOnce: document.querySelectorAll('[data-edge-sentence="said-once"], [data-edge-sentence-kind="rule"]').length,
      adjacentStrokes: document.querySelectorAll('path[data-edge-drawn="true"][data-edge-kind="permitted"]').length,
    }));
  await expect.poll(async () => (await read()).rulesDrawn, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const counts = await read();
  expect(counts.saidOnce, 'only a lower-only profile says its rule once').toBe(0);
  expect(counts.rulesDrawn, 'every drawn rule stroke says its sentence').toBe(counts.adjacentStrokes);
});


test('the ladder tightens its rows rather than hiding the seventh role at 1280x800', async ({
  page,
}) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/ko/architecture/?view=architecture&guides=off', { waitUntil: 'domcontentloaded' });
  const graph = page.getByTestId('architecture-graph');
  await expect(graph).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  /* ResizeObserver measures the canvas, React commits the resulting SVG on the next frame. */
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  await expect(graph).toHaveAttribute('data-evidence-layout', 'paired-ladder');
  await expect(graph).toHaveAttribute('data-ladder-density', 'tight');
  await expect(page.getByTestId('architecture-canvas-hidden-below')).toHaveCount(0);
  await expect(graph).toHaveAttribute('data-skip-lane', 'free');
  const cut = await page
    .locator('[data-testid^="architecture-box-line-"]')
    .evaluateAll((lines) => lines.filter((line) => (line.textContent ?? '').trimEnd().endsWith('…')).length);
  expect(cut, 'held, the skip lane would cut 4 of 7 descriptions; free, the empty ladder cuts 1').toBeLessThanOrEqual(1);

  const outside = await page.evaluate(() => {
    const scroller = document
      .querySelector('[data-testid="architecture-canvas-scroller"]')!
      .getBoundingClientRect();
    const out: string[] = [];
    for (const box of document.querySelectorAll('[data-testid^="architecture-graph-box-"]')) {
      const at = box.getBoundingClientRect();
      if (
        at.left < scroller.left - 1 ||
        at.right > scroller.right + 1 ||
        at.top < scroller.top - 1 ||
        at.bottom > scroller.bottom + 1
      )
        out.push(`${box.getAttribute('data-testid')} is out of view`);
    }
    return out;
  });
  expect(outside, outside.join('\n')).toEqual([]);
});

for (const locale of ['ko', 'en'] as const) {
  /* One test per locale rather than a loop inside one: Korean runs taller than English at the same
     size, so a failure has to name which build it is, and a `use`-prefixed fixture helper may not
     be called in a loop body (`react-hooks/rules-of-hooks` reads it as a React hook). */
  test(`${locale}: the structure ladder uses the card width, draws no band before a scan, and column headers do not sit on the surface`, async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 901 });
    await seedFirstRunSeen(page);
    await useDogfoodSample(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${locale}/architecture/?view=architecture&guides=off`);
    await expect(page.getByTestId('architecture-graph-box-views')).toBeVisible({ timeout: 30_000 });
    /* The sketch sizes itself from its container, so a rect read before that settles reports the
       SVG's pre-layout scale — measured at 0.245 of the final one. */
    await page.waitForFunction(() => {
      const w = document.querySelector('[data-testid="architecture-graph-box-views"]')?.getBoundingClientRect().width ?? 0;
      const prev = (window as unknown as { __faceW?: number }).__faceW;
      (window as unknown as { __faceW?: number }).__faceW = w;
      return w > 300 && prev === w;
    }, undefined, { timeout: 20_000, polling: 120 });

    const measured = await page.evaluate(() => {
      const round = (n: number) => Math.round(n * 10) / 10;
      const card = document.querySelector('[data-testid="architecture-flow-panel"]')!.getBoundingClientRect();
      const planes = [...document.querySelectorAll('[data-testid^="architecture-layer-plane-"]')].map(
        (plane) => plane.getBoundingClientRect(),
      );
      const boxes = [...document.querySelectorAll('[data-graph-box]')].map((box) => box.getBoundingClientRect());
      const headings = [
        ...document.querySelectorAll('[data-testid="architecture-paired-lane-headings"] text'),
      ];
      const empties = document.querySelectorAll('[data-testid="architecture-observation-empty"]');
      /* A role sentence ending in an ellipsis is the defect the card-width fix ended (inspection
         122, S8): the ladder held its faces whatever the card's width and cut all seven. */
      const truncated = [...document.querySelectorAll('[data-testid^="architecture-box-line-"]')]
        .filter((node) => (node.textContent ?? '').trimEnd().endsWith('…')).length;
      const panel = empties[0]?.getBoundingClientRect() ?? null;
      const lines = [
        ...(empties[0]?.querySelectorAll(
          '[data-testid="architecture-observation-empty-title"], [data-testid="architecture-observation-empty-line"]',
        ) ?? []),
      ].map((line) => line.getBoundingClientRect());
      const sentences = [
        ...document.querySelectorAll(
          '[data-edge-sentence-kind="permitted"][data-edge-sentence="drawn"], [data-testid="architecture-lower-only-sentence"]',
        ),
      ].map((sentence) => sentence.getBoundingClientRect());
      const headingBottom = Math.max(...headings.map((h) => h.getBoundingClientRect().bottom));
      /* The drawing is the reviewed faces plus the one empty column beside them. */
      const left = Math.min(...boxes.map((b) => b.left), panel?.left ?? Infinity);
      const right = Math.max(...boxes.map((b) => b.right), panel?.right ?? -Infinity);
      return {
        planes: planes.length,
        ruleSaidOnce: document.querySelectorAll('[data-testid="architecture-lower-only-sentence"]').length,
        bandRatio: (right - left) / card.width,
        offCentre: round((left + right) / 2 - (card.left + card.right) / 2),
        emptyStates: empties.length,
        truncated,
        placeholders: document.querySelectorAll(
          '[data-testid^="architecture-observation-box-"], [data-testid^="architecture-delta-marker-"]',
        ).length,
        headingToPanel: panel ? round(panel.top - headingBottom) : null,
        linesOutside: panel
          ? lines.filter((line) => line.left < panel.left + 8 || line.right > panel.right - 8).length
          : null,
        lineCount: lines.length,
        planesIntoPanel: panel ? planes.filter((plane) => plane.right > panel.left).length : null,
        sentencesIntoPanel: panel ? sentences.filter((sentence) => sentence.right > panel.left - 4).length : null,
        headingOffPanelCentre: (() => {
          const heading = document.querySelector('[data-testid="architecture-observation-heading"]')?.getBoundingClientRect();
          return panel && heading ? round((heading.left + heading.right) / 2 - (panel.left + panel.right) / 2) : null;
        })(),
      };
    });

    // Before a scan: no band, and the lower-only rule said once.
    expect(measured.planes, `${locale}: a band stands before anything was observed`).toBe(0);
    expect(measured.ruleSaidOnce, `${locale}: the lower-only rule is not said once`).toBe(1);
    // Empty takes the observed frame, skip lane held (0.62 at 1512).
    expect(measured.bandRatio, `${locale}: the drawing gave the card back`).toBeGreaterThan(0.6);
    expect(measured.truncated, `${locale}: role sentences are cut again`).toBe(0);
    expect(Math.abs(measured.offCentre), `${locale}: the drawing slid off centre`).toBeLessThanOrEqual(8);
    // Before any inspection the measured columns say so once, not in fourteen placeholders.
    expect(measured.emptyStates, `${locale}: the empty state is not one`).toBe(1);
    expect(measured.placeholders, `${locale}: per-role placeholders are back`).toBe(0);
    // Nothing in the chrome row may touch, let alone overlap, what is under it.
    expect(measured.headingToPanel, `${locale}: the empty state touches its heading`).toBeGreaterThan(0);
    // Its words stay inside it, and it covers neither the planes nor a rule sentence.
    expect(measured.lineCount, `${locale}: the empty state says nothing`).toBeGreaterThan(1);
    expect(measured.linesOutside, `${locale}: an empty-state line runs past its panel`).toBe(0);
    expect(measured.planesIntoPanel, `${locale}: a layer plane runs under the empty state`).toBe(0);
    expect(measured.sentencesIntoPanel, `${locale}: a rule sentence runs into the empty state`).toBe(0);
    // The heading over the empty state shares its centre line with the words under it.
    expect(Math.abs(measured.headingOffPanelCentre ?? Infinity), `${locale}: the heading sits off the empty state`).toBeLessThanOrEqual(1);
  });
}
