import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

import { installLibraryWorkHarness } from './library-work-harness';
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
