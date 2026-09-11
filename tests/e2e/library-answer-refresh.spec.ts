import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseFrontmatter } from '../../src/shared/lib/parse-frontmatter';
import { installLibraryWorkHarness, type LibraryWorkHarness } from './library-work-harness';
import { seedFirstRunSeen } from './first-run-seed';

const SOURCE = 'sources/storage.md';
const AUDIT = 'sources/audit.md';
const ANSWER = 'wiki/answers/original.md';
const ORIGINAL = 'Keep records for 24 days.\nThe owner must approve external communication.\n';
const REVISED = 'Keep records for 18 days, replacing the previous 24-day guidance.\nThe owner must approve external communication.\n';
const AUDIT_TEXT = 'The audit worksheet lists 24 days.\nThe worksheet review is pending.\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const OLD_BODY = `## Summary
The recorded period is 24 days.

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
The storage guidance changed to 18 days; the audit worksheet still disagrees.

## Facts
- Storage guidance now says 18 days. [[src:${SOURCE}#l1]]

## Decisions
- Human note: do not announce externally until the owner approves. [[src:${SOURCE}#l2]]

## Open questions
- The audit worksheet is not yet reviewed. [[src:${AUDIT}#l2]]
- The audit worksheet says 24 days while storage guidance says 18. Both accounts remain unresolved. [[src:${AUDIT}#l1]] [[src:${SOURCE}#l1]]

## Not in sources
- No signed approval was provided.
`;
const OLD_PAGE = `---
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
${OLD_BODY}`;
const FILES = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Knowledge review\nslug: knowledge-review\n---\n# Knowledge review\n',
  [SOURCE]: ORIGINAL, [AUDIT]: AUDIT_TEXT, [ANSWER]: OLD_PAGE,
};

async function openLibrary(page: Page, files = FILES, locale = 'en') {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files });
  await page.goto(`/${locale}/docs/`);
  await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
  await page.getByTestId('app-nav-rail-item-library').click();
  await page.getByTestId('library-questions').waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('body *')).some((el) => el.children.length === 0 && /Loading the map|지도를 불러/.test(el.textContent ?? '') && el.getBoundingClientRect().width > 0));
  return harness;
}

async function generateDraft(page: Page, harness: LibraryWorkHarness) {
  await page.getByTestId('answer-refresh-start').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await harness.answer(page, NEW_BODY);
  await page.getByTestId('answer-review-open').click();
  await expect(page.getByTestId('answer-comparison')).toBeVisible();
}

async function tabTo(page: Page, testId: string) {
  for (let step = 0; step < 120; step += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((id) => document.activeElement?.getAttribute('data-testid') === id, testId)) {
      expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true);
      return;
    }
  }
  throw new Error(`Keyboard could not reach ${testId}`);
}

test('a changed original becomes a compared, retained answer revision without losing prior uncertainty', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const harness = await openLibrary(page);
  await page.getByTestId('library-question-wiki/answers/original').click();
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'unchanged');
  await harness.mutateSource(page, SOURCE, REVISED);
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'changed');
  await generateDraft(page, harness);
  const comparison = page.getByTestId('answer-comparison');
  await expect(comparison.getByTestId('answer-comparison-before')).toContainText('24 days');
  await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Both accounts remain unresolved');
  expect(Object.keys((await harness.snapshot(page)).files).filter((path) => path.startsWith('wiki/answers/'))).toEqual([ANSWER]);

  await comparison.getByTestId('answer-comparison-after').locator('button[data-source-path="sources/storage.md"][data-source-anchor="l1"]').first().click();
  await expect(comparison).not.toBeVisible();
  await expect(page.getByTestId('library-source-citation')).toContainText('l1');
  await page.getByTestId('answer-review-open').click();
  await expect(comparison).toBeVisible();

  const evidence = process.env.ATLAS_ANSWER_EVIDENCE;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/08-comparison.png`, animations: 'disabled' });
    writeFileSync(`${evidence}/08-comparison-ax.txt`, await page.locator('body').ariaSnapshot());
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('answer-revision-save')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (evidence) await page.screenshot({ path: `${evidence}/09-comparison-mobile.png`, animations: 'disabled' });
  await comparison.getByRole('radio', { name: 'Previous retained answer' }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(comparison.getByTestId('answer-comparison-before')).toBeVisible();
  await expect(comparison.getByTestId('answer-comparison-after')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(comparison.getByRole('radio', { name: 'Previous retained answer' })).toBeChecked();
  await comparison.getByRole('radio', { name: 'Proposed new draft' }).click();
  const finalGap = comparison.getByTestId('answer-comparison-after').getByText('No signed approval was provided.', { exact: true });
  await finalGap.scrollIntoViewIfNeeded();
  await expect(finalGap).toBeInViewport();
  await tabTo(page, 'answer-revision-save');
  await expect(page.getByTestId('answer-revision-save')).toBeFocused();
  await expect(page.getByTestId('answer-revision-save')).toBeInViewport();
  if (evidence) {
    await page.screenshot({ path: `${evidence}/09-comparison-mobile-end.png`, animations: 'disabled' });
    writeFileSync(`${evidence}/09-comparison-mobile-end-ax.txt`, await page.locator('body').ariaSnapshot());
  }
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('answer-review-open')).toBeFocused();
  await page.getByTestId('answer-review-open').click();
  await page.getByTestId('answer-revision-save').click();
  await expect(comparison).not.toBeVisible();
  await expect(page.getByTestId('answer-history-state')).toContainText('matches');
  const saved = await harness.snapshot(page);
  const nextPath = Object.keys(saved.files).find((path) => path.startsWith('wiki/answers/') && path !== ANSWER)!;
  expect(saved.files[ANSWER]).toBe(OLD_PAGE);
  expect(saved.files[SOURCE]).toBe(REVISED);
  const next = parseFrontmatter(saved.files[nextPath]);
  expect(next.frontmatter.answer_previous).toBe('wiki/answers/original');
  expect(next.frontmatter.source_hash).toEqual({ [SOURCE]: 'unmeasured', [AUDIT]: 'unmeasured' });
  expect(next.body).toContain('## Open questions\n- The audit worksheet is not yet reviewed.');
  expect(next.body).toContain('Human note: do not announce externally');
  await page.getByRole('button', { name: 'Read previous version', exact: true }).click();
  await expect(page.getByTestId('retained-answer-context')).toContainText('earlier retained answer');
  await page.getByRole('button', { name: 'Back to questions', exact: true }).click();
  await expect(page.getByTestId('library-questions').getByRole('button', { name: 'What is the retention policy?' })).toHaveCount(1);
  expect(errors).toEqual([]);
  if (evidence) {
    writeFileSync(`${evidence}/saved-files.json`, JSON.stringify(saved.files, null, 2));
    await page.screenshot({ path: `${evidence}/10-retained-question.png`, animations: 'disabled' });
  }
});

test('a human edit made during refresh stops stale acceptance and survives', async ({ page }) => {
  const harness = await openLibrary(page);
  await page.getByTestId('library-question-wiki/answers/original').click();
  await harness.mutateSource(page, SOURCE, REVISED);
  await generateDraft(page, harness);
  const corrected = `${OLD_PAGE}\nHuman correction made during the review.\n`;
  await harness.mutateSource(page, ANSWER, corrected);
  await page.getByTestId('answer-revision-save').click();
  await expect(page.getByTestId('answer-comparison').getByRole('alert')).toContainText('changed');
  const after = await harness.snapshot(page);
  expect(after.files[ANSWER]).toBe(corrected);
  expect(Object.keys(after.files).filter((path) => path.startsWith('wiki/answers/'))).toEqual([ANSWER]);
});

test('retained answer refresh and confirmation are reachable by keyboard', async ({ page }) => {
  const harness = await openLibrary(page);
  await harness.mutateSource(page, SOURCE, REVISED);
  await tabTo(page, 'library-question-wiki/answers/original');
  await page.keyboard.press('Enter');
  await tabTo(page, 'answer-refresh-start');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await harness.answer(page, NEW_BODY);
  await tabTo(page, 'answer-review-open');
  await page.keyboard.press('Enter');
  await tabTo(page, 'answer-revision-save');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('answer-comparison')).not.toBeVisible();
  await expect(page.getByTestId('answer-refresh-start')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true);
  expect(Object.keys((await harness.snapshot(page)).files).filter((path) => path.startsWith('wiki/answers/'))).toHaveLength(2);
});

test('new and missing originals remain distinguishable without running an agent', async ({ page }) => {
  const harness = await openLibrary(page);
  await page.getByTestId('library-question-wiki/answers/original').click();
  await harness.mutateSource(page, 'sources/amendment.md', 'A new amendment requires review.\n');
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'new-sources');
  await page.evaluate(async (path) => {
    const runtime = window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> } };
    await runtime.__TAURI_INTERNALS__.invoke('remove_vault_entry', { relativePath: path });
  }, SOURCE);
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'missing');
  expect((await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(false);
});

test('a Library without code nodes opens retained questions and routes an inline citation to the original location', async ({ page }) => {
  const { 'project.md': _project, ...documents } = FILES;
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: documents });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await expect(page.getByTestId('library-questions')).toBeVisible();
  await expect(page.getByTestId('app-nav-rail-item-architecture')).toHaveCount(0);
  await page.getByTestId('library-question-wiki/answers/original').click();
  await page.getByTestId('library-reading-pane').locator(`[data-source-path="${SOURCE}"][data-source-anchor="l1"]`).click();
  await expect(page.getByTestId('library-source-citation')).toContainText('l1');
  await expect(page.locator('body')).toContainText(SOURCE);
});

test('a running refresh remains visibly reopenable and can be stopped after closing the conversation', async ({ page }) => {
  const harness = await openLibrary(page);
  await page.getByTestId('library-question-wiki/answers/original').click();
  await expect(page.getByTestId('answer-refresh-start')).toContainText('Ask agent');
  await page.getByTestId('answer-refresh-start').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await page.getByRole('button', { name: 'Close conversation', exact: true }).click();
  const reopen = page.getByTestId('library-open-conversation');
  await expect(reopen).toContainText('Conversation');
  await reopen.click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('answer-refresh-start')).toBeEnabled();
  await expect(page.getByTestId('retained-answer-context')).toContainText('did not complete');
  expect((await harness.snapshot(page)).files[ANSWER]).toBe(OLD_PAGE);
});

for (const { retained, kind, manual, name } of [
  { retained: true, kind: 'compile', manual: true, name: 'asks before a retained answer write during compilation' },
  { retained: false, kind: 'compile', manual: false, name: 'continues allowing ordinary valid write-ups during compilation' },
  { retained: false, kind: 'refresh', manual: true, name: 'asks before any page write during answer refresh' },
]) {
  test(`automatic page mode ${name}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    const validWriteUp = `${OLD_PAGE.split('answer_thread:')[0]}---\n${OLD_BODY}`;
    const harness = await installLibraryWorkHarness(page, {
      files: FILES, permissionFile: retained ? ANSWER : 'wiki/storage.md', permissionText: validWriteUp, writeMode: 'auto', filePermission: true,
    });
    await page.goto('/en/docs/');
    await page.getByRole('button', { name: /Open my folder/i }).click();
    await page.getByTestId('app-nav-rail-item-library').click();
    await page.getByTestId('library-question-wiki/answers/original').click();
    expect(await page.evaluate(() => localStorage.getItem('library.wikiWriteMode'))).toBe('auto');
    if (kind === 'refresh') await page.getByTestId('answer-refresh-start').click();
    /* By testid, not by label: the door's words became plain language on 2026-09-12
       (`Ask the agent to compile`), and this test is about the write permission, not the
       copy. The index is the only surface drawing it here — the stage is not on an open
       answer page. */
    else await page.getByTestId('library-compile').click();
    await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
    await harness.read(page);
    await harness.wait(page);
    if (manual) {
      await expect(page.getByTestId('acp-permission-card')).toBeVisible();
      await expect(page.getByTestId('acp-permission-card')).toContainText('The page keeps its shape');
      await page.getByTestId('acp-permission-reject').click();
    } else {
      await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => {
        const message = call.params as { id?: number; result?: { outcome?: { optionId?: string } } } | undefined;
        return call.method === 'response' && message?.id === 902 && message.result?.outcome?.optionId === 'allow';
      })).toBe(true);
    }
    expect((await harness.snapshot(page)).files[ANSWER]).toBe(OLD_PAGE);
  });
}
