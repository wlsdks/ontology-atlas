import { expect, test } from '@playwright/test';
import enMessages from '../../messages/en.json';

import { seedFirstRunSeen } from './first-run-seed';
import { openFolderFromFirstRun } from './open-folder';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **The receipt for a file written without asking, and the two doors on it.**
 *
 * ## Why this spec exists at all
 *
 * Until 2026-09-20 no test reached this notice. It needs four things together — the folder set to
 * write automatically, a permission that carries a real `filePath` rather than the MCP envelope, a
 * page that passes the wiki contract, and a native folder root — and no spec had assembled them.
 * So the surface that reports **a write nobody approved** was drawn by nothing but the product.
 */

const FITTING_PAGE = [
  '---',
  'title: Architecture',
  'created_by: agent:claude',
  'compiled_at: 2026-09-20T00:00:00.000Z',
  'sources:',
  '  - sources/architecture.docx',
  'source_hash: abc123',
  'status: compiled',
  'summary: What the architecture page records and where it came from.',
  '---',
  '',
  '## Summary',
  '',
  'The renderer is a custom canvas surface. [[src:sources/architecture.docx#p1]]',
  '',
  '## Facts',
  '',
  '- State lives in React and the URL. [[src:sources/architecture.docx#p2]]',
  '',
  '## Decisions',
  '',
  '- Another renderer needs a decision. [[src:sources/architecture.docx#p3]]',
  '',
  '## Open questions',
  '',
  '- Nothing outstanding.',
  '',
  '## Not in sources',
  '',
  '- Nothing.',
].join('\n');

/** The four things the automatic-write path needs together. */
async function driveAutoAllowedWrite(page: import('@playwright/test').Page) {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {
    writeMode: 'auto',
    filePermission: true,
    // The content the write carries; `architecturePage` is the harness's own default and not
    // an option a caller may set.
    permissionText: FITTING_PAGE,
  });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await page.getByTestId('acp-chat-panel').getByRole('textbox').fill('Update the architecture page from its source.');
  await page.getByTestId('acp-chat-send').click();
  await harness.read(page);
  await harness.wait(page);
  return harness;
}

test('a page that fits lands without a card, and the transcript says so', async ({ page }) => {
  await driveAutoAllowedWrite(page);
  const notice = page.locator('[data-acp-entry="notice"]');
  await expect(notice).toBeVisible();
  // It names the page it wrote, and offers both ways on from here.
  await expect(notice).toContainText('wiki/architecture.md');
  await expect(notice.getByTestId('acp-notice-open-page')).toBeVisible();
  await expect(notice.getByTestId('acp-notice-ask-next')).toBeVisible();
  // No card stood: this is the path where the screen already knew the answer.
  await expect(page.getByTestId('acp-permission-card')).toHaveCount(0);
});

test('an explicit question report still asks before a write when the folder allows automatic Wiki writes', async ({ page }) => {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {
    writeMode: 'auto', filePermission: true, permissionText: FITTING_PAGE,
  });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/library/?tab=wiki&guides=off&e2e=1');
  await page.getByTestId('question-desk-input').fill('What does the architecture build?');
  await page.getByTestId('question-desk-search').click();
  await page.getByTestId('question-desk-summarize').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'thinking');
  await harness.read(page);
  await harness.wait(page);
  const permission = page.getByTestId('acp-permission-card');
  await expect(permission).toBeVisible();
  expect((await harness.snapshot(page)).writes).toEqual([]);
  await permission.getByRole('button', { name: 'No thanks', exact: true }).click();
  await expect(permission).toHaveCount(0);
  expect((await harness.snapshot(page)).writes).toEqual([]);
});

async function switchReportRuntime(page: import('@playwright/test').Page, editQuestionBeforeSwitch = false) {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {
    runtimeIds: ['claude-acp', 'codex-acp'], writeMode: 'auto', filePermission: true, permissionText: FITTING_PAGE,
  });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/library/?tab=wiki&guides=off&e2e=1');
  await page.getByTestId('question-desk-input').fill('What does the architecture build?');
  await page.getByTestId('question-desk-search').click();
  await page.getByTestId('question-desk-summarize').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.filter(call => call.method === 'session/prompt').length).toBe(1);
  if (editQuestionBeforeSwitch) await page.getByTestId('question-desk-input').fill('A different current question');
  await page.getByTestId('acp-chat-runtime').click();
  await page.getByRole('option', { name: 'Codex', exact: true }).click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.filter(call => call.method === 'session/prompt').length).toBe(2);
  return harness;
}

test('an exact report retry on another runtime keeps its read-only authority', async ({ page }) => {
  const harness = await switchReportRuntime(page);
  await harness.read(page);
  await harness.wait(page);
  const permission = page.getByTestId('acp-permission-card');
  await expect(permission).toBeVisible();
  await permission.getByRole('button', { name: 'No thanks', exact: true }).click();
  await expect(permission).toHaveCount(0);
  expect((await harness.snapshot(page)).writes).toEqual([]);
});

test('a switched-runtime report retains strict filing instead of becoming an ordinary answer', async ({ page }) => {
  const harness = await switchReportRuntime(page);
  await harness.answer(page, 'This freeform response is not a four-section report. [[src:sources/architecture.docx#p1]]');
  const file = page.getByTestId('library-file-answer');
  await expect(file).toBeVisible();
  await file.click();
  await expect.poll(async () => {
    if ((await harness.snapshot(page)).writes.length > 0) return 'wrote';
    return await page.getByTestId('library-file-answer-note').isVisible() ? 'refused' : 'pending';
  }).toBe('refused');
  await expect(page.getByTestId('library-file-answer-note')).toHaveText(enMessages.library.questionDesk.report.fileRefused.shape);
  await expect(page.getByTestId('question-desk-report')).toBeVisible();
  await expect(page.locator('#question-desk-report-title')).toHaveText('What does the architecture build?');
  await expect(page.getByTestId('question-desk-report-raw')).toBeVisible();
  expect((await harness.snapshot(page)).writes).toEqual([]);
});

test('editing the question invalidates the old retry context without offering generic filing', async ({ page }) => {
  const harness = await switchReportRuntime(page, true);
  await harness.answer(page, 'An old report reply. [[src:sources/architecture.docx#p1]]');
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await expect(page.getByTestId('question-desk-input')).toHaveValue('A different current question');
  await expect(page.getByTestId('question-desk-report')).toHaveCount(0);
  await expect(page.getByTestId('library-file-answer')).toHaveCount(0);
  expect((await harness.snapshot(page)).writes).toEqual([]);
});
