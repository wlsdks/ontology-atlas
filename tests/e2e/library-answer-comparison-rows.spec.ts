import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { installLibraryWorkHarness, type LibraryWorkHarness } from './library-work-harness';
import { seedFirstRunSeen } from './first-run-seed';

/**
 * **The comparison has to compare.**
 *
 * `library-answer-refresh.spec.ts` owns what the screen *does* — the draft is filed
 * exclusively, prior uncertainty survives, both versions stay reachable at 1024. This spec
 * owns whether a person can read the two versions against each other, which is geometry and
 * therefore cannot be asserted in jsdom:
 *
 * 1. every contract section sits on **one row**, so "Facts" on the left and "Facts" on the
 *    right start at the same y (measured on the owner's 2026-09-11 capture of the installed
 *    app: they differed by 61px and the reader did the aligning);
 * 2. each column is **one measure** wide, so neither side is a 90-character line;
 * 3. the **difference is stated above** the two versions rather than disclosed under the
 *    longer one;
 * 4. the save button stays reachable at every width the dialog is used at.
 *
 * Text is never rewritten to achieve this — the 2026-09-11 record "Local Compile approval
 * exposes the exact previous and proposed text" refuses selective diffs — so the alignment
 * comes from the five headings the wiki contract already fixes.
 */

const SOURCE = 'sources/storage.md';
const AUDIT = 'sources/audit.md';
const ANSWER = 'wiki/answers/original.md';
const ORIGINAL = 'Keep records for 24 days.\nThe owner must approve external communication.\n';
const REVISED = 'Keep records for 18 days, replacing the previous 24-day guidance.\n';
const AUDIT_TEXT = 'The audit worksheet lists 24 days.\nThe worksheet review is pending.\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** English, and deliberately lopsided: the left Summary is long where the right one is short. */
const OLD_BODY = `## Summary
The recorded retention period is twenty-four days, which every downstream schedule in the launch plan was written against, and nobody has revisited it since the first review.

## Facts
- Storage guidance says 24 days. [[src:${SOURCE}#l1]]

## Decisions
- Human note: do not announce externally until the owner approves. [[src:${SOURCE}#l2]]

## Open questions
- The audit worksheet is not yet reviewed. [[src:${AUDIT}#l2]]

## Not in sources
- No signed approval was provided.
`;
const NEW_BODY = `## Summary
The guidance now says 18 days.

## Facts
- Storage guidance now says 18 days. [[src:${SOURCE}#l1]]
- The audit worksheet still lists twenty-four days, so the two documents disagree about the same retention period and neither one has been withdrawn. [[src:${AUDIT}#l1]]

## Decisions

## Open questions
- The audit worksheet is not yet reviewed. [[src:${AUDIT}#l2]]

## Not in sources
- No signed approval was provided.
`;

/** Korean prose, to measure the wrap of Hangul in the same column. */
const OLD_BODY_KO = `## Summary
보관 기간은 24일로 기록되어 있고, 출시 계획의 모든 일정이 그 숫자를 기준으로 작성되었으며 첫 검토 이후 아무도 다시 확인하지 않았습니다.

## Facts
- 보관 지침은 24일이라고 적고 있습니다. [[src:${SOURCE}#l1]]

## Decisions
- 사람이 남긴 메모: 소유자가 승인하기 전에는 외부에 알리지 않습니다. [[src:${SOURCE}#l2]]

## Open questions
- 감사 워크시트는 아직 검토되지 않았습니다. [[src:${AUDIT}#l2]]

## Not in sources
- 서명된 승인 문서는 제출되지 않았습니다.
`;
const NEW_BODY_KO = `## Summary
지침은 이제 18일이라고 적고 있습니다.

## Facts
- 보관 지침은 이제 18일이라고 적고 있습니다. [[src:${SOURCE}#l1]]
- 감사 워크시트는 여전히 24일로 적혀 있어서 같은 보관 기간을 두고 두 문서가 어긋나 있고, 둘 중 어느 쪽도 철회되지 않았습니다. [[src:${AUDIT}#l1]]

## Decisions

## Open questions
- 감사 워크시트는 아직 검토되지 않았습니다. [[src:${AUDIT}#l2]]

## Not in sources
- 서명된 승인 문서는 제출되지 않았습니다.
`;

const retainedPage = (body: string) => `---
title: What is the retention policy?
created_by: human
compiled_at: 2026-09-10T00:00:00Z
sources: [${SOURCE}, ${AUDIT}]
source_hash:
  ${SOURCE}: unmeasured
  ${AUDIT}: unmeasured
status: draft
summary: Retained account of the policy.
answer_thread: wiki/answers/original
answer_observed_at: 2026-09-10T00:00:00Z
answer_scope_sources: [${SOURCE}, ${AUDIT}]
answer_source_observations:
  ${SOURCE}: ${hash(ORIGINAL)}
  ${AUDIT}: ${hash(AUDIT_TEXT)}
---
${body}`;

const SECTIONS = ['Summary', 'Facts', 'Decisions', 'Open questions', 'Not in sources'] as const;

async function openComparison(page: Page, locale: 'en' | 'ko', bodies: { old: string; next: string }) {
  await seedFirstRunSeen(page);
  const harness: LibraryWorkHarness = await installLibraryWorkHarness(page, {
    files: {
      'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Knowledge review\nslug: knowledge-review\n---\n# Knowledge review\n',
      [SOURCE]: ORIGINAL, [AUDIT]: AUDIT_TEXT, [ANSWER]: retainedPage(bodies.old),
    },
  });
  await page.goto(`/${locale}/docs/`);
  await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
  await page.getByTestId('app-nav-rail-item-library').click();
  await page.getByTestId('library-questions').waitFor();
  await page.getByTestId('library-question-wiki/answers/original').click();
  await harness.mutateSource(page, SOURCE, REVISED);
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'changed');
  await page.getByTestId('answer-refresh-start').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await harness.answer(page, bodies.next);
  await page.getByTestId('answer-review-open').click();
  await expect(page.getByTestId('answer-comparison')).toBeVisible();
  return harness;
}

/**
 * **One layout, one read.** Every rect comes out of a single `evaluate`, because two
 * round-trips are two layouts: the first Korean run reported a 1.6px offset on one row that
 * a font swap between the left and the right query had invented. `document.fonts.ready`
 * settles Pretendard first, for the same reason.
 */
async function measure(page: Page, sections: readonly string[]) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return await page.evaluate((names) => {
    const dialog = document.querySelector('[data-testid="answer-comparison"]')!;
    const pane = (side: string) => dialog.querySelector(`[data-testid="answer-comparison-${side}"]`)!;
    const before = pane('before'), after = pane('after');
    /** The widest rendered line in one column, in characters: one client rect is one line. */
    const charsPerLine = (root: Element) => {
      let widest = 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim();
        if (!text) continue;
        range.selectNodeContents(node);
        const lines = [...range.getClientRects()].filter((rect) => rect.width > 1).length;
        if (lines > 0) widest = Math.max(widest, text.length / lines);
      }
      return Math.round(widest);
    };
    const headingY = (root: Element, name: string) => {
      const heading = root.querySelector(`[data-comparison-heading="${name}"]`);
      return heading ? heading.getBoundingClientRect().y : Number.NaN;
    };
    const leftBox = before.getBoundingClientRect(), rightBox = after.getBoundingClientRect();
    const delta = dialog.querySelector('[data-testid="answer-comparison-delta"]')!.getBoundingClientRect();
    const grid = dialog.querySelector('[data-testid="answer-comparison-scroll"]')!.getBoundingClientRect();
    return {
      rows: names.map((section) => ({ section, left: headingY(before, section), right: headingY(after, section) })),
      columns: { left: Math.round(leftBox.width), right: Math.round(rightBox.width), gutter: Math.round(rightBox.x - (leftBox.x + leftBox.width)) },
      chars: { left: charsPerLine(before), right: charsPerLine(after) },
      delta: { bottom: Math.round(delta.bottom), gridTop: Math.round(grid.y) },
      marks: {
        changed: dialog.querySelectorAll('[data-source-changed]').length,
        observation: dialog.querySelectorAll('[data-comparison-observation="changed"]').length,
      },
    };
  }, sections);
}

const evidence = process.env.ATLAS_COMPARISON_EVIDENCE;

for (const width of [1512, 1920]) {
  test(`the answer comparison puts every contract section on one row at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openComparison(page, 'en', { old: OLD_BODY, next: NEW_BODY });
    const report = await measure(page, SECTIONS);

    // 1 — one row per section: both headings start on the same line.
    for (const row of report.rows) {
      expect(row.left, `${row.section} left heading`).not.toBeNaN();
      expect(row.right, `${row.section} right heading`).not.toBeNaN();
      expect(Math.abs(row.left - row.right), `${row.section} heading y left vs right`).toBeLessThanOrEqual(1);
    }

    // 2 — one measure per column, equal columns, one gutter between them.
    expect(report.columns.left).toBe(report.columns.right);
    expect(report.columns.left).toBeLessThanOrEqual(510);
    expect(report.columns.gutter).toBe(40);
    expect(report.chars.left).toBeLessThanOrEqual(82);
    expect(report.chars.right).toBeLessThanOrEqual(82);

    // 3 — the difference is above the two versions, not under one of them.
    expect(report.delta.bottom).toBeLessThanOrEqual(report.delta.gridTop);

    // 4 — one amber mark per changed original, on both columns, matching the stated count.
    expect(report.marks.observation).toBe(1);
    expect(report.marks.changed).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('answer-comparison-delta')).toContainText(SOURCE);

    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      writeFileSync(`${evidence}/rows-${width}.json`, JSON.stringify(report, null, 2));
      writeFileSync(`${evidence}/comparison-${width}-ax.txt`, await page.getByTestId('answer-comparison').ariaSnapshot());
      await page.screenshot({ path: `${evidence}/comparison-${width}.png`, animations: 'disabled' });
    }
  });
}

test('the comparison keeps its measure and its footer in Korean and at every width', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await openComparison(page, 'ko', { old: OLD_BODY_KO, next: NEW_BODY_KO });
  const report = await measure(page, SECTIONS);
  for (const row of report.rows) {
    expect(Math.abs(row.left - row.right), `${row.section} heading y left vs right`).toBeLessThanOrEqual(1);
  }
  // Hangul at this measure: `--measure-prose` is calibrated to keep ~36 syllables per line.
  expect(report.chars.left).toBeLessThanOrEqual(40);
  expect(report.chars.right).toBeLessThanOrEqual(40);

  for (const width of [390, 768, 1024, 1512]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(page.getByTestId('answer-revision-save')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (evidence && width === 390) {
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/comparison-ko-390.png`, animations: 'disabled' });
    }
  }
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(`${evidence}/rows-ko.json`, JSON.stringify(report, null, 2));
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.screenshot({ path: `${evidence}/comparison-ko-1512.png`, animations: 'disabled' });
  }
});

/**
 * **The two actions on this answer are not peers** (2026-09-11 record: a refresh button was
 * mistaken for a read-only review action). Asking an agent for a draft is an outlined control
 * inside a group with a lede; leaving for the list is a link below it. Proven by geometry and
 * paint rather than by class name: the link carries no filled or outlined box, and it sits
 * under both controls that act on the answer.
 */
test('the answer page demotes leaving for the list below asking for a draft', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, {
    files: {
      'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Knowledge review\nslug: knowledge-review\n---\n# Knowledge review\n',
      [SOURCE]: ORIGINAL, [AUDIT]: AUDIT_TEXT, [ANSWER]: retainedPage(OLD_BODY),
    },
  });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await page.getByTestId('app-nav-rail-item-library').click();
  await page.getByTestId('library-questions').waitFor();
  await page.getByTestId('library-question-wiki/answers/original').click();
  await expect(page.getByTestId('retained-answer-context')).toBeVisible();

  const hierarchy = await page.evaluate(() => {
    const read = (id: string) => {
      const node = document.querySelector(`[data-testid="${id}"]`)!;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return { y: Math.round(box.y), height: Math.round(box.height), background: style.backgroundColor, border: style.borderTopWidth };
    };
    const group = document.querySelector('[role="group"][aria-label]')!;
    return {
      refresh: read('answer-refresh-start'),
      home: read('answer-back-home'),
      lede: Math.round(document.querySelector('#answer-refresh-lede')!.getBoundingClientRect().y),
      groupLabelled: group.getAttribute('aria-label') !== '' && group.contains(document.querySelector('[data-testid="answer-refresh-start"]')),
      homeInGroup: group.contains(document.querySelector('[data-testid="answer-back-home"]')),
    };
  });

  expect(hierarchy.groupLabelled).toBe(true);
  expect(hierarchy.homeInGroup).toBe(false);
  expect(hierarchy.lede).toBeLessThan(hierarchy.refresh.y);
  expect(hierarchy.home.y).toBeGreaterThan(hierarchy.refresh.y + hierarchy.refresh.height);
  // A link, not a third button: no plane and no outline of its own.
  expect(hierarchy.home.background).toBe('rgba(0, 0, 0, 0)');
  expect(hierarchy.home.border).toBe('0px');
  expect(hierarchy.refresh.background).not.toBe('rgba(0, 0, 0, 0)');

  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(`${evidence}/answer-page-hierarchy.json`, JSON.stringify(hierarchy, null, 2));
    await page.screenshot({ path: `${evidence}/answer-page-1512.png`, animations: 'disabled' });
  }
});
