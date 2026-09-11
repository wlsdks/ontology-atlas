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
 * 2. the saved answer is reachable from the home in one press (since 2026-09-12 the
 *    questions are a door on the strip rather than a section inside step three, and at
 *    exactly one answer that door is the question);
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

const SECOND_ANSWER = 'wiki/answers/approval.md';
const SECOND_ANSWER_SLUG = 'wiki/answers/approval';

/**
 * The same folder with **two** saved answers.
 *
 * Since 2026-09-12 the saved questions are a door on the home's strip, and at exactly one
 * answer that door *is* the question — its title is the label and its press opens the page,
 * which is what keeps the 2026-09-11 falsifier ("one press from the home") holding. So the
 * claims about the list itself — Ask's plane, the row's anatomy, the observation glyph —
 * need the count where a list exists, and that count is two.
 */
const FILES_WITH_TWO_ANSWERS: Record<string, string> = {
  ...FILES,
  [SECOND_ANSWER]: ANSWER_PAGE
    .replace('title: What is the retention policy?', 'title: Who approves external communication?')
    .replace(`answer_thread: ${ANSWER_SLUG}`, `answer_thread: ${SECOND_ANSWER_SLUG}`),
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

async function openLibraryHome(page: Page, files: Record<string, string> = FILES) {
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
  await page.getByTestId('app-nav-rail-item-library').click();
  // The home is the folder's picture; everything else on it is a door (2026-09-12).
  await page.getByTestId('library-graph-canvas').waitFor();
}

test.describe('the Library spine at one saved answer', () => {
  /**
   * **The three steps survive the first answer — and are now one press from the home.**
   *
   * The 2026-09-11 record made the stepper unconditional because the first saved answer
   * used to delete it. It is still unconditional; what moved on 2026-09-12 is where it is
   * drawn. The owner read the always-drawn cards as a first-run screen that never leaves,
   * so the home is the folder's graph and the steps live behind `How to use`. This case
   * therefore reads the same three facts one press deeper, and adds the one the move is
   * answerable for: the saved answer is still **one press** from the home.
   */
  test('keeps the three steps behind the guide door and the answer one press away', async ({ page }) => {
    await openLibraryHome(page);

    // 1 — the stage is drawn although an answer exists; it is in the popup, not the pane.
    await expect(page.getByTestId('library-stage')).toHaveCount(0);
    await page.getByTestId('library-guide-open').click();
    const guide = page.getByTestId('library-guide-popover');
    await expect(guide.getByTestId('library-stage')).toBeVisible();
    for (const step of ['library-stage-gather', 'library-stage-compile', 'library-stage-read']) {
      await expect(guide.getByTestId(step)).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(guide).toHaveCount(0);

    /*
     * 2 — **the 2026-09-11 falsifier, still holding**: *a person with one saved answer
     * cannot reopen it from the home in one press*. At one answer the questions door is
     * that question — its own title — and its press opens the page. A door labelled
     * `Questions 1` opening a list of one row would be two presses, which is why this is
     * the shape that was built.
     */
    const door = page.getByTestId('library-questions-open');
    await expect(door).toContainText('What is the retention policy?');
    await door.click();
    await expect(page.getByTestId('library-reading-pane')).toBeVisible();
    await expect(page.getByTestId('retained-answer-context')).toBeVisible();
  });

  /**
   * The list itself, at the count where there is a list: Ask's plane, the row's anatomy
   * and the observation glyph, all three ruled on by the 2026-09-11 council and all three
   * now inside the questions popup.
   */
  test('draws the saved questions as doors inside their own popup', async ({ page }) => {
    await openLibraryHome(page, FILES_WITH_TWO_ANSWERS);
    const opener = page.getByTestId('library-questions-open');
    await expect(opener).toContainText('2');
    await opener.click();
    const popup = page.getByTestId('library-questions-popover');
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute('data-transient-surface', 'anchored');
    await expect(popup.getByTestId('library-questions')).toBeVisible();
    const row = popup.getByTestId(`library-question-${ANSWER_SLUG}`);
    await expect(row).toBeVisible();

    // 3 — Ask keeps the outline plane. Compared against the token the variant resolves to,
    //     so a renamed class cannot pass and `ghost` (transparent) cannot.
    const ask = popup.getByTestId('library-questions-ask');
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
    const observation = popup.getByTestId('answer-observation').first();
    await expect(observation).toHaveAttribute('data-state', 'unchanged');
    expect(await observation.evaluate((el) => el.querySelector('svg') !== null)).toBe(true);
    await expect(row).toHaveAccessibleDescription(/No change since source observation/);

    // The row is a door, and it opens the answer it names.
    await row.click();
    await expect(popup).toHaveCount(0);
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
    await page.getByTestId('library-graph-canvas').waitFor();
    await page.getByTestId('library-guide-open').click();

    const stage = page.getByTestId('library-guide-popover').getByTestId('library-stage');
    /*
     * The arithmetic is unchanged and still says both steps are next — `libraryStepStates`
     * is the seam the header strip reads too, so demoting it there would have moved the
     * status line as well. What moved is the printed word (design-lead F3).
     */
    await expect(stage.getByTestId('library-stage-compile')).toHaveAttribute('data-step-state', 'next');
    await expect(stage.getByTestId('library-stage-read')).toHaveAttribute('data-step-state', 'next');
    await expect(stage.locator('[data-testid="library-stage-state-next"]')).toHaveCount(1);
    await expect(
      stage.getByTestId('library-stage-compile').locator('[data-testid="library-stage-state-next"]'),
    ).toHaveCount(1);
    await expect(
      stage.getByTestId('library-stage-read').locator('[data-testid="library-stage-state-waiting"]'),
    ).toHaveCount(1);
  });
});

test.describe('the Library spine in a short surface', () => {
  /**
   * **The fold follows the stepper into the popup** (2026-09-12).
   *
   * The failure mode was height, not width (design-responsive C1/C3): the three steps used
   * to be drawn in the landing pane, and below `lg` that pane is the upper half of one
   * column — at 390×844 the saved-question row inside step three stood 272px below its
   * fold and at 1024×640 it stood 34 below. So the fold is a **container** query, and its
   * height lives in `--library-spine-collapse-height`.
   *
   * The steps are now behind `How to use`, and the quantity the fold wants is unchanged:
   * how much room the surface has. `LibraryHomePopover` therefore carries the container
   * (its wrapper is definite in both axes, which size containment needs), and this case
   * reads the token rather than repeating the number, so a drift between it and the rule
   * in `app/globals.css` still fails here.
   */
  test('folds a finished step when the popup has less room than the token', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 900 });
    await openLibraryHome(page);
    await page.getByTestId('library-guide-open').click();
    const guide = page.getByTestId('library-guide-popover');
    await expect(guide).toBeVisible();

    // 1 — the popup is inside the window at the app's own minimum, and scrolls inside.
    const fit = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="library-guide-popover"]')!;
      const rect = panel.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewport: window.innerHeight,
        scrolls: [...panel.querySelectorAll('*')].some(
          (node) => getComputedStyle(node).overflowY === 'auto',
        ),
      };
    });
    expect(fit.top).toBeGreaterThanOrEqual(0);
    expect(fit.bottom, 'the popup falls out of the window').toBeLessThanOrEqual(fit.viewport + 1);
    expect(fit.scrolls, 'the popup has no scroller of its own').toBe(true);

    // 2 — the fold boundary is the token, read from the document rather than retyped.
    const collapse = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--library-spine-collapse-height'),
      ),
    );
    expect(collapse).toBeGreaterThan(0);
    const caption = guide.getByTestId('library-stage-gather').locator('.library-spine-fold-away').first();
    /* The room the popup gets is whatever is under its door, so the window height that
       straddles the token is the token plus the strip above the popup and the gutter under
       it. Derived from the measured top rather than assumed. */
    const chrome = Math.round(fit.top + 24);

    await page.setViewportSize({ width: 1040, height: collapse + chrome + 60 });
    await expect(guide.getByTestId('library-stage-gather')).toHaveAttribute('data-step-state', 'done');
    await expect(caption).toBeVisible();

    await page.setViewportSize({ width: 1040, height: collapse + chrome - 60 });
    await expect(caption).toBeHidden();
    const head = (await guide.getByTestId('library-stage-gather').boundingBox())!;
    expect(head.height, 'a folded step is one head row').toBeLessThanOrEqual(48);
  });
});

/**
 * **Each surface prints one availability sentence, on every route** (design-interaction C2
 * and design-lead F5, council 2026-09-11; rewritten 2026-09-12).
 *
 * Measured at 1512 on the no-agent folder before the 2026-09-11 change:
 * `stage.blockedNoAgent` stood at y≈410 under step two's Compile and again at y≈633 under
 * Ask — the same words twice in one viewport, ~200px apart. And the `local` route had no
 * sentence at all, so Ask and Check the wiki were simply absent there, which is the one
 * hole left in "availability is a state with its reason".
 *
 * What changed on 2026-09-12 is not the rule but the meaning of "one viewport": the
 * stepper and the saved questions were two halves of one column, and are now two popups
 * that can never be open at once. So the rule is read per surface — open a door, and that
 * surface carries exactly one `data-landing-blocked-reason` with its dead controls tied to
 * it. A card pointing at the *other* popup's paragraph would be an `aria-describedby` into
 * a closed surface.
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
  await page.getByTestId('library-graph-canvas').waitFor({ timeout: 30_000 });
}

/**
 * The questions surface, at the count where the door is the question.
 *
 * With exactly one saved answer — which is what both harnesses in this file hold — the
 * questions door **is** that question: its title is the label and its press opens the
 * page, which is what keeps the 2026-09-11 falsifier ("one press from the home") holding.
 * The list, with Ask and its reason, is then one press from the page a person is on,
 * through the answer's own `Back to questions` (2026-09-12).
 */
async function openQuestionsSurface(page: Page) {
  await page.getByTestId('library-questions-open').click();
  await page.getByRole('button', { name: /Back to questions/ }).click();
  const surface = page.getByTestId('library-questions-popover');
  await surface.waitFor();
  return surface;
}

test.describe('the Library home states availability once per surface', () => {
  test('with no agent and no address, the guide owns the sentence', async ({ page }) => {
    await openLocalRouteLibrary(page, false);
    // Nothing on the home itself: the picture makes no claim about an agent.
    await expect(page.locator('[data-landing-blocked-reason]')).toHaveCount(0);

    await page.getByTestId('library-guide-open').click();
    const guide = page.getByTestId('library-guide-popover');
    await expect(guide.locator('[data-landing-blocked-reason]')).toHaveCount(1);
    const reason = guide.getByTestId('library-stage-compile-blocked');
    await expect(reason).toContainText('No verified coding agent');
    /* Compile is blocked by that very sentence, so Check the wiki points at it rather than
       drawing a second copy — the card's own dedupe. */
    await expect(guide.getByTestId('library-stage-lint-blocked')).toHaveCount(0);

    await page.keyboard.press('Escape');
    const questions = await openQuestionsSurface(page);
    const ask = questions.getByTestId('library-questions-ask');
    await expect(ask).toBeVisible();
    await expect(ask).toBeDisabled();
    // Tied to the paragraph in *this* surface, never to one in the closed popup.
    await expect(ask).toHaveAttribute('aria-describedby', 'library-questions-ask-blocked');
    await expect(questions.getByTestId('library-questions-ask-blocked')).toContainText(
      'No verified coding agent',
    );
  });

  test('on the local route, each surface prints its own and keeps its controls', async ({ page }) => {
    await openLocalRouteLibrary(page, true);
    const questions = await openQuestionsSurface(page);
    const reason = questions.getByTestId('library-questions-ask-blocked');
    await expect(reason).toContainText('A local model can only compile');
    const ask = questions.getByTestId('library-questions-ask');
    await expect(ask).toBeVisible();
    await expect(ask).toBeDisabled();
    await expect(ask).toHaveAttribute('aria-describedby', 'library-questions-ask-blocked');

    /*
     * Check the wiki is present and dead in the guide — the folder holds two pages, which
     * is the first moment two pages can disagree. On this route Compile *can* run, so its
     * own paragraph is absent and the card prints Check's reason itself rather than
     * pointing across a closed surface (the 2026-09-12 repair).
     */
    await page.keyboard.press('Escape');
    await page.getByTestId('library-guide-open').click();
    const guide = page.getByTestId('library-guide-popover');
    await expect(guide.locator('[data-landing-blocked-reason]')).toHaveCount(1);
    await expect(guide.getByTestId('library-stage-compile-blocked')).toHaveCount(0);
    const lint = guide.getByTestId('library-stage-lint');
    await expect(lint).toBeVisible();
    await expect(lint).toBeDisabled();
    await expect(lint).toHaveAttribute('aria-describedby', 'library-stage-lint-blocked');
    await expect(guide.getByTestId('library-stage-lint-blocked')).toContainText(
      'A local model can only compile',
    );
  });
});
