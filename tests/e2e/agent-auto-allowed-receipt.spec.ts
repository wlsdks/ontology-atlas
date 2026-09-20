import { expect, test } from '@playwright/test';

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
 *
 * ## What that hid
 *
 * `touch-target-contract.spec.ts` sweeps real controls against the 44px floor and would have
 * caught this; it never saw these two. Measured under `(pointer: coarse)`: `Open` was **16x44**
 * wide by the floor's own reckoning — 16x24 in fact — and `Ask next time` **43x24**. A sixteen
 * pixel target is not reachable by a finger, on the one notice where the way back matters.
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

test('both doors on that receipt clear the touch floor', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1512, height: 982 } });
  const page = await context.newPage();
  await driveAutoAllowedWrite(page);
  await expect(page.locator('[data-acp-entry="notice"]')).toBeVisible();

  const floor = await page.evaluate(() =>
    Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--touch-target-min'), 10),
  );
  expect(floor, 'the floor itself must be a real number to measure against').toBeGreaterThan(0);

  for (const id of ['acp-notice-open-page', 'acp-notice-ask-next']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(Math.round(box.height), `${id} is below the touch floor`).toBeGreaterThanOrEqual(floor);
    expect(Math.round(box.width), `${id} is below the touch floor`).toBeGreaterThanOrEqual(floor);
  }
  await context.close();
});
