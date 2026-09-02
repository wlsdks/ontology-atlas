import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { useDogfoodSample } from './sample-source';

test.use({ viewport: { width: 600, height: 900 } });


test('핵심 행동만 남고 에이전트 작업 버튼은 하단 탭에 가리지 않는다', async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/architecture/?guides=off');

  await expect(page.getByText('Atlas Web Workbench').first()).toBeVisible();
  await expect(page.getByTestId('architecture-graph-run')).toHaveCount(0);
  await expect(page.getByTestId('architecture-walk')).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('[data-architecture-stage]')).toHaveCount(0);

  const agentButton = page.getByTestId('architecture-agent-action');
  await expect(agentButton).toBeVisible();
  const report = await agentButton.evaluate(
    (button) => {
      const bar = document.querySelector<HTMLElement>('nav[data-tabbar="primary"]');
      const barShown = Boolean(bar) && bar!.getBoundingClientRect().height > 0;
      const buttonRect = button.getBoundingClientRect();
      const barRect = barShown ? bar!.getBoundingClientRect() : null;
      const hit = document.elementFromPoint(
        buttonRect.left + buttonRect.width / 2,
        buttonRect.top + buttonRect.height / 2,
      );
      return {
        clearance: barRect ? barRect.top - buttonRect.bottom : null,
        hitOwnsPoint: hit === button || button.contains(hit),
      };
    },
  );

  if (report.clearance !== null) expect(report.clearance).toBeGreaterThanOrEqual(-1);
  expect(report.hitOwnsPoint).toBe(true);
});

test('obsolete workflow-stage links do not resurrect the removed prose panels', async ({ page }) => {
  await page.goto('/ko/architecture/?stage=plan');
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
  await page.goto('/ko/architecture/?guides=off');

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
  await expect(role).toHaveAttribute('aria-pressed', 'true');
  await expect(role).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Space');
  await expect(role).toHaveAttribute('aria-expanded', 'true');
  await expect(role).toHaveAttribute('aria-pressed', 'true');

  /* The 380px role dock must take unused connector space before it hides a role. This is the
     installed app's 1512px width: previously the final role sat partly behind the dock and the
     toolbar looked fixed while the first real action broke the canvas beneath it. */
  await page.waitForTimeout(240);
  const selectedFit = await page.getByTestId('architecture-graph').evaluate((svg) => {
    const viewport = svg.parentElement!.getBoundingClientRect();
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

test('a real viewport resize may reflow the chain without losing the selected role', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto('/ko/architecture/?guides=off');
  const graph = page.getByTestId('architecture-graph');
  await expect(graph).toHaveAttribute('data-architecture-axis', 'down');

  const role = page.getByTestId('architecture-graph-box-application');
  await role.click();
  await expect(role).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 1112, height: 834 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(graph).toHaveAttribute('data-architecture-axis', 'across');
  await expect(role).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 834, height: 1112 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(graph).toHaveAttribute('data-architecture-axis', 'down');
  await expect(role).toHaveAttribute('aria-pressed', 'true');
});

test('320px and a 200%-equivalent viewport keep controls and evidence inside the page', async ({
  page,
}) => {
  for (const width of [320, 384]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko/architecture/?guides=off');
    await expect(page.getByTestId('architecture-graph')).toBeVisible();
    const before = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      agentOwnsPoint: (() => {
        const button = document.querySelector<HTMLElement>(
          '[data-testid="architecture-agent-action"]',
        );
        if (!button) return false;
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === button || Boolean(hit && button.contains(hit));
      })(),
    }));
    expect(before.overflow, `${width}px document overflow`).toBeLessThanOrEqual(0);
    expect(before.agentOwnsPoint, `${width}px agent control`).toBe(true);

    await page.getByTestId('architecture-evidence-rail').click();
    const dock = page.getByTestId('architecture-evidence-dock');
    await expect(dock).toBeVisible();
    const after = await dock.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        right: rect.right,
        viewport: document.documentElement.clientWidth,
        columns: getComputedStyle(
          element.querySelector('[data-testid="architecture-evidence-plane"] > div')!,
        ).gridTemplateColumns.split(' ').length,
      };
    });
    expect(after.right, `${width}px evidence right edge`).toBeLessThanOrEqual(after.viewport + 1);
    expect(after.columns, `${width}px evidence columns`).toBe(1);
  }
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
  /* A window that holds the whole chain: below this the canvas pans, and panning to a box is a
     different subject than the address this test is about (2026-08-30). */
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/ko/architecture/');

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

  /*
   * ⚠️ The three arrival states stay distinguishable, but the panel they live in is closed by
   * default now (2026-08-30): a bare address is a canvas with no panel at all, a bad role opens
   * the panel and is refused in it, a real role opens the panel and is answered in it.
   */
  await page.goto('/ko/architecture/');
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
  /*
   * ⚠️ **This replaces four gates, and the claim is narrower than the one first written.** They
   * each set up a drawing cut at one edge and checked that something said so: a fade, a count, a
   * drag that reached the rest. A chain turns down when it stops fitting across, and the canvas
   * row keeps a `min-content` floor, so for a chain a cut is no longer something this screen
   * produces — it shows in full and the page scrolls if the window cannot hold it.
   *
   * **It holds for a chain and not for every profile**, which the first version of this comment
   * claimed. `graph-layout.test.ts` proves the counter-shape: three roles at one rank are three
   * lanes wide whichever way the chain runs, so no rotation makes them fit a narrow canvas. Both
   * sample vaults are chains, which is why an end-to-end fixture cannot produce the fan and why
   * the over-broad claim survived being written — the covered-edge machinery below is what serves
   * that shape, and it is guarded by geometry rather than by a browser.
   */
  const sizes = [
    [1920, 1200],
    [1440, 1000],
    [1400, 400],
    [1280, 720],
    [1100, 900],
    [900, 600],
    [820, 300],
    [700, 900],
    [390, 844],
  ] as const;

  await page.goto('/ko/architecture/');
  // Vault-backed routes prerender the neutral identity boundary now. Wait for hydration to replace
  // that boundary before measuring the canvas; querying the layout during the fallback measures no
  // product at all and used to throw on a null scroller.
  await expect(page.getByTestId('architecture-graph')).toBeVisible();
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    /* ResizeObserver updates the measured axis, then React commits the resulting SVG on the next
       frame. Measuring between those two frames reads a stale role group against the new canvas
       and reports a role cut in silence even though the settled frame is whole. */
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    /*
     * ⚠️ **The claim narrowed on 2026-08-30, and this is the half that survived.** It used to
     * assert the canvas never overflows at any size, which held only because the *page* scrolled
     * instead — and that page scroll is what buried the panels below the canvas in 64px slivers
     * nobody could reach. At workbench width the layout no longer scrolls at all, so a window too
     * short for the chain leaves the rest behind the canvas's own pan. That is allowed. Doing it
     * without saying so is not: whatever is out of view is counted on screen and can be reached.
     */
    const hidden = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="architecture-graph"]');
      const canvas = svg?.parentElement?.getBoundingClientRect();
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

    /* And at workbench width the layout itself never scrolls: the canvas holds the height and the
       panels open beside it (the owner's ask, 2026-08-30). */
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
     * ⚠️ **The slack is shared, not dumped on one side.** The drawing keeps one width whatever the
     * window does, so a wide screen has real slack — and all of it was landing on the right, the
     * default of a row flex container. Measured on the built export 2026-08-29: left gap 0 with
     * 544px spare at 1512, 952px at 1920, 1586px at 2560. A drawing pinned to one edge of an
     * otherwise empty stage reads as a screen that has not finished loading.
     *
     * The tolerance is 2px for the odd-pixel split, and the assertion is skipped where there is no
     * slack to share — the check above already proves nothing is cut there.
     */
    const gaps = await page
      .locator('[data-testid="architecture-graph"]')
      .evaluate((svg) => {
        const scroller = svg.parentElement as HTMLElement;
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


/*
 * ⚠️ **A caption never crosses its own outline, on either profile** (owner, 2026-08-30, pointing
 * at the Adapters pill: both lines of the sentence ran past the caps). The first caption gate
 * measured the 180px receipt box only; this one runs on the shipped four-role sample, whose boxes
 * are 148px and whose end roles are stadiums. For a stadium the allowed width at a line is the
 * straight middle plus the cap chord at that height, so a line lower in the box gets less room.
 */
test('a role sentence stays inside the drawn box, including a stadium cap', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/en/architecture/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
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


/*
 * ⚠️ **Every stroke at rest says its sentence, and no sentence touches anything** (Direction B,
 * 2026-08-30). The sentences are the dock's own strings; a sentence with no room is held with a
 * reason rather than cropped, so the assertion is on what is drawn: no drawn sentence intersects a
 * box or another drawn sentence. And the hover recede is a transition, not a hard cut: the
 * unrelated box carries the feedback duration and settles at its receded opacity.
 */
test('every drawn stroke says its sentence, and no sentence touches anything', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/en/architecture/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
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
