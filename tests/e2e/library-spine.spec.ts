import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

import { installLibraryWorkHarness } from './library-work-harness';
import { installLocalCompileHarness } from './library-local-compile-harness';
import { seedFirstRunSeen } from './first-run-seed';

/**
 * **The spine survives the first saved answer.**
 *
 * Until 2026-09-11 the Library landing read `retainedAnswers.length === 0 ? <stage> :
 * null`, so saving one answer deleted the only screen that named the next step, and Ask
 * fell from `outline` to `ghost` at exactly the moment a person had proved they use it.
 * `docs/DECISIONS.md`, "The Library keeps its spine, and computes the structural check
 * itself", makes the stage unconditional and seats the saved questions inside step three.
 *
 * `library-landing.spec.ts` already pins the stage at **zero** answers, so this spec owns
 * the count that used to remove it: one. Three facts, each of which was false before the
 * record:
 *
 * 1. the three-step stage is drawn with one retained answer on the landing;
 * 2. the saved question's row is *inside* `library-stage-read`, not above the stepper;
 * 3. Ask is still the `outline` button — proved by its resolved background, because a
 *    class-name assertion would pass a variant renamed in the primitive.
 */

const SOURCE = 'sources/storage.md';
const ANSWER = 'wiki/answers/retention.md';
const ANSWER_SLUG = 'wiki/answers/retention';
const ORIGINAL = 'Keep records for 24 days.\nThe owner must approve external communication.\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const ANSWER_PAGE = `---
title: What is the retention policy?
created_by: human
compiled_at: 2026-09-10T00:00:00Z
sources: [${SOURCE}]
source_hash:
  ${SOURCE}: ${hash(ORIGINAL)}
status: draft
summary: Retained account of the policy.
answer_thread: ${ANSWER_SLUG}
answer_observed_at: 2026-09-10T00:00:00Z
answer_scope_sources: [${SOURCE}]
answer_source_observations:
  ${SOURCE}: ${hash(ORIGINAL)}
---
## Summary
The recorded period is 24 days.

## Facts
- Storage guidance says 24 days. [[src:${SOURCE}#l1]]

## Decisions

## Open questions

## Not in sources
`;

const FILES: Record<string, string> = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Knowledge review\nslug: knowledge-review\n---\n# Knowledge review\n',
  [SOURCE]: ORIGINAL,
  [ANSWER]: ANSWER_PAGE,
};

/**
 * The same folder plus a source nobody has written up.
 *
 * That is what makes **two** steps honestly next — Compile, because a source is waiting,
 * and Read, because there is already a page to read — which is the state where the stepper
 * printed the same word on two cards (design-lead F3).
 */
const FILES_WITH_WAITING_SOURCE: Record<string, string> = {
  ...FILES,
  'sources/unwritten.md': 'Nobody has compiled this one yet.\n',
};

async function openLibraryWithOneAnswer(page: Page) {
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: FILES });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
  await page.getByTestId('app-nav-rail-item-library').click();
  await page.getByTestId('library-questions').waitFor();
}

test.describe('the Library spine at one saved answer', () => {
  test('keeps the three steps and holds the question inside step three', async ({ page }) => {
    await openLibraryWithOneAnswer(page);

    // 1 — the stage is drawn although an answer exists.
    await expect(page.getByTestId('library-stage')).toBeVisible();
    for (const step of ['library-stage-gather', 'library-stage-compile', 'library-stage-read']) {
      await expect(page.getByTestId(step)).toBeVisible();
    }
    await expect(page.getByTestId('library-stage-title')).toBeVisible();

    // 2 — the saved question is a row inside the reading step, not a pane of its own.
    const row = page.getByTestId(`library-question-${ANSWER_SLUG}`);
    await expect(row).toBeVisible();
    expect(
      await row.evaluate((el) => Boolean(el.closest('[data-testid="library-stage-read"]'))),
    ).toBe(true);

    // 3 — Ask keeps the outline plane. Compared against the token the variant resolves to,
    //     so a renamed class cannot pass and `ghost` (transparent) cannot.
    const ask = page.getByTestId('library-questions-ask');
    await expect(ask).toBeVisible();
    const plane = await ask.evaluate((el) => {
      /* A fresh probe with motion off: the token is authored as `#ffffff05` and the
         control reports `rgba(255, 255, 255, 0.02)`, so the two are compared after the
         engine has resolved both — and a reused element would report a mid-transition
         value instead of the resting one. */
      const probe = document.createElement('div');
      probe.style.transition = 'none';
      probe.style.backgroundColor = 'var(--color-overlay-1)';
      document.body.append(probe);
      const outline = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { background: getComputedStyle(el).backgroundColor, outline };
    });
    expect(plane.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(plane.background).toBe(plane.outline);

    /*
     * 4 — **the row says "door" at rest** (design-lead F2 with design-interaction C1,
     *     council 2026-09-11). It was a borderless `RowButton` in a `divide-y` list: rest
     *     measured 1.000:1 with no border and no fill, 25px from the only bordered control
     *     in the block, which opens a *new* question. It now repeats the index's own wiki
     *     row — a soft edge over `overlay-2` — and this compares the resolved values
     *     against a fresh probe with motion off, because the row's own transition would
     *     otherwise report a mid-flight colour (the Ask precedent above).
     */
    const rowPlane = await row.evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.transition = 'none';
      probe.style.borderStyle = 'solid';
      probe.style.borderWidth = '1px';
      probe.style.borderColor = 'var(--color-border-soft)';
      probe.style.backgroundColor = 'var(--color-overlay-2)';
      document.body.append(probe);
      const probed = getComputedStyle(probe);
      const soft = probed.borderTopColor;
      const fill = probed.backgroundColor;
      probe.remove();
      const own = getComputedStyle(el);
      return {
        border: own.borderTopColor,
        width: Number.parseFloat(own.borderTopWidth),
        background: own.backgroundColor,
        soft,
        fill,
      };
    });
    expect(rowPlane.border, 'the resting row draws no edge').not.toBe('rgba(0, 0, 0, 0)');
    expect(rowPlane.border).toBe(rowPlane.soft);
    expect(rowPlane.width).toBeGreaterThan(0);
    expect(rowPlane.background).toBe(rowPlane.fill);

    /*
     * 5 — **the observation is drawn at the grade the index already spends on it**
     *     (design-infoviz, council 2026-09-11). One `text-body` strong mark drew all five
     *     states, so *no change since source observation* was as loud as *a cited original
     *     is missing*. The state with nothing to act on is the source list's check plus its
     *     `sr-only` word, so the glyph is what is asserted and the sentence stays in the
     *     row's accessible description.
     */
    const observation = page.getByTestId('answer-observation');
    await expect(observation).toHaveAttribute('data-state', 'unchanged');
    expect(await observation.evaluate((el) => el.querySelector('svg') !== null)).toBe(true);
    await expect(row).toHaveAccessibleDescription(/No change since source observation/);

    // The row is a door, and it opens the answer it names.
    await row.click();
    await expect(page.getByTestId('library-reading-pane')).toBeVisible();
    await expect(page.getByTestId('retained-answer-context')).toBeVisible();
  });
});

/**
 * **A hand-written page keeps its door on an empty wiki.**
 *
 * The control is the wiki list's own last row, so a folder with no pages drew it nowhere
 * — and that is exactly the folder where writing the first page by hand is the move a
 * person has. Same record.
 */
test.describe('the Library index with an empty wiki', () => {
  test('still offers the hand-written page', async ({ page }) => {
    await seedFirstRunSeen(page);
    await installLibraryWorkHarness(page, {
      files: {
        'project.md': '---\nuid: 00000000-0000-4000-8000-000000000002\nkind: project\ntitle: Empty wiki\nslug: empty-wiki\n---\n# Empty wiki\n',
        [SOURCE]: ORIGINAL,
        'wiki/_template.md': '---\ntitle: <the page name>\n---\n\n## Summary\n',
      },
    });
    await page.goto('/en/docs/');
    await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
    await page.getByTestId('app-nav-rail-item-library').click();
    await page.getByTestId('library-index-segment-wiki').click();
    await expect(page.getByTestId('library-wiki-empty')).toBeVisible();

    const door = page.getByTestId('library-new-page');
    await expect(door).toBeVisible();
    await door.click();
    await expect(page.getByTestId('library-new-page-title')).toBeVisible();
  });
});

/**
 * **One card says `next`, and the pane's own height decides what folds.**
 *
 * Both facts come from the council of 2026-09-11 and both were measured on this branch's
 * export, so they are pinned here rather than left to a screenshot.
 */
test.describe('the Library spine names one lead step', () => {
  test('prints `next` on the lead card and `waiting` on the later one', async ({ page }) => {
    await seedFirstRunSeen(page);
    await installLibraryWorkHarness(page, { files: FILES_WITH_WAITING_SOURCE });
    await page.goto('/en/docs/');
    await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
    await page.getByTestId('app-nav-rail-item-library').click();
    await page.getByTestId('library-questions').waitFor();

    const stage = page.getByTestId('library-stage');
    /*
     * The arithmetic is unchanged and still says both steps are next — `libraryStepStates`
     * is the seam the header strip reads too, so demoting it there would have moved the
     * status line as well. What moved is the printed word (design-lead F3).
     */
    await expect(page.getByTestId('library-stage-compile')).toHaveAttribute('data-step-state', 'next');
    await expect(page.getByTestId('library-stage-read')).toHaveAttribute('data-step-state', 'next');
    await expect(stage.locator('[data-testid="library-stage-state-next"]')).toHaveCount(1);
    await expect(
      page.getByTestId('library-stage-compile').locator('[data-testid="library-stage-state-next"]'),
    ).toHaveCount(1);
    await expect(
      page.getByTestId('library-stage-read').locator('[data-testid="library-stage-state-waiting"]'),
    ).toHaveCount(1);
  });
});

test.describe('the Library spine in a short pane', () => {
  /**
   * The failure mode is height, not width (design-responsive C1/C3): below `lg` the reader
   * is the upper half of one column, so at 390×844 the saved-question row stood 272px
   * below the pane's fold and at 1024×640 it stood 34 below — while the same folder at
   * 1512×901 was clear. The fold is therefore a **container** query on the pane, and its
   * height lives in `--library-spine-collapse-height`; this case reads that token rather
   * than repeating the number, so a drift between it and the rule in `app/globals.css`
   * fails here.
   */
  test('folds a finished step at the token height and keeps the question inside the pane', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await openLibraryWithOneAnswer(page);
    const row = page.getByTestId(`library-question-${ANSWER_SLUG}`);
    await expect(row).toBeVisible();

    // 1 — the app's own minimum window: the row and its observation line are in the pane.
    const fit = await page.evaluate((slug) => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const pane = box('[data-testid="library-reader-landing"]');
      const question = box(`[data-testid="library-question-${slug}"]`);
      const line = box('[data-testid="answer-observation"]');
      return {
        paneTop: pane.top,
        paneBottom: pane.bottom,
        paneHeight: pane.height,
        rowTop: question.top,
        rowBottom: question.bottom,
        lineBottom: line.bottom,
        viewport: window.innerHeight,
      };
    }, ANSWER_SLUG);
    expect(fit.rowTop, 'the question row starts above the pane').toBeGreaterThanOrEqual(fit.paneTop - 1);
    expect(fit.rowBottom, 'the question row falls below the pane').toBeLessThanOrEqual(fit.paneBottom + 1);
    expect(fit.lineBottom, 'the observation line falls below the pane').toBeLessThanOrEqual(fit.paneBottom + 1);

    // 2 — the fold boundary is the token, read from the document rather than retyped.
    const collapse = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--library-spine-collapse-height'),
      ),
    );
    expect(collapse).toBeGreaterThan(0);
    /* Everything the window spends outside this pane: the rail's row, the work lane, the
       header. Derived once so the two viewports below straddle the pane's own height
       rather than the window's. */
    const chrome = fit.viewport - fit.paneHeight;
    const caption = page.getByTestId('library-stage-gather').locator('.library-spine-fold-away').first();

    await page.setViewportSize({ width: 1040, height: Math.round(collapse + chrome + 60) });
    await expect(page.getByTestId('library-stage-gather')).toHaveAttribute('data-step-state', 'done');
    await expect(caption).toBeVisible();

    await page.setViewportSize({ width: 1040, height: Math.round(collapse + chrome - 60) });
    await expect(caption).toBeHidden();
    const head = (await page.getByTestId('library-stage-gather').boundingBox())!;
    expect(head.height, 'a folded step is one head row').toBeLessThanOrEqual(48);
  });
});

/**
 * **The landing prints one availability sentence, on every route** (design-interaction C2
 * and design-lead F5, council 2026-09-11).
 *
 * Measured at 1512 on the no-agent folder before this change: `stage.blockedNoAgent` stood
 * at y≈410 under step two's Compile and again at y≈633 under Ask — the same words twice in
 * one viewport, ~200px apart. And the `local` route had no sentence at all, so Ask and
 * Check the wiki were simply absent there, which is the one hole left in "availability is a
 * state with its reason".
 *
 * The local-compile harness is the only one that answers `acp_detect_runtimes` with an
 * empty list, so it is what both routes are built from: with the saved local address it is
 * the `local` route, and with that address removed it is a computer with neither.
 */
async function openLocalRouteLibrary(page: Page, keepLocalAddress: boolean) {
  await seedFirstRunSeen(page);
  await installLocalCompileHarness(page);
  if (!keepLocalAddress) {
    /* Registered after the harness, so it runs after the harness's own seed on each
       navigation: no runtime and no saved address is the `unavailable` route. */
    await page.addInitScript(() => {
      window.localStorage.removeItem('ontology-atlas:local-endpoint');
      window.localStorage.removeItem('ontology-atlas:compile-brain');
    });
  }
  await page.goto('/en/docs/?guides=off', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await expect(page.getByRole('heading', { name: 'Map', level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Library' }).click();
  await page.getByTestId('library-questions').waitFor({ timeout: 30_000 });
}

test.describe('the Library landing states availability once', () => {
  test('with no agent and no address, step two owns the sentence', async ({ page }) => {
    await openLocalRouteLibrary(page, false);
    await expect(page.locator('[data-landing-blocked-reason]')).toHaveCount(1);
    const reason = page.getByTestId('library-stage-compile-blocked');
    await expect(reason).toContainText('No verified coding agent');
    const ask = page.getByTestId('library-questions-ask');
    await expect(ask).toBeVisible();
    await expect(ask).toBeDisabled();
    // The disabled control is tied to the one paragraph rather than to a copy of it.
    await expect(ask).toHaveAttribute('aria-describedby', 'library-stage-compile-blocked');
    await expect(page.getByTestId('library-questions-ask-blocked')).toHaveCount(0);
  });

  test('on the local route, step three owns it and both agent-only controls stay on screen', async ({ page }) => {
    await openLocalRouteLibrary(page, true);
    await expect(page.locator('[data-landing-blocked-reason]')).toHaveCount(1);
    const reason = page.getByTestId('library-questions-ask-blocked');
    await expect(reason).toContainText('A local model can only compile');
    const ask = page.getByTestId('library-questions-ask');
    await expect(ask).toBeVisible();
    await expect(ask).toBeDisabled();
    await expect(ask).toHaveAttribute('aria-describedby', 'library-questions-ask-blocked');
    /* Check the wiki is present and dead beside it — the folder holds two pages, which is
       the first moment two pages can disagree. */
    const lint = page.getByTestId('library-stage-lint');
    await expect(lint).toBeVisible();
    await expect(lint).toBeDisabled();
    await expect(lint).toHaveAttribute('aria-describedby', 'library-questions-ask-blocked');
  });
});
