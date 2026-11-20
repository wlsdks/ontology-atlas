import { expect, test, type Page } from '@playwright/test';
import { seedFirstRunSeen } from '../../first-run-seed';
import { installLibraryWorkHarness } from '../../library-work-harness';
import { stubDirectoryPicker } from '../../vault-picker-stub';
import { digest, wiki } from './library-question-desk-harness';

const refund = '# Refund handling\nRefund approval queues a stock restoration job.\nThe job may complete in the next inventory batch.\n';
const inventory = '# Inventory state\nRefund approval does not immediately restore inventory.\nA separate stock restoration job updates quantity after it runs.\n';
const project = '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Refunds\nslug: refunds\n---\n';

/**
 * Thirteen leads for "refund": eight wiki claims over two pages and five source passages over two
 * files. The claims cite lines without the word, so no passage is the place a claim cites.
 */
function thirteenLeads(): Record<string, string> {
  const returns = '# Returns\nRefund window is 15 days.\nRefund fee is 3 percent.\nRefund goes to the card.\nRefund rule four.\nOpened items are excluded.\nThe fee is waived for defects.\nCards are credited in five days.\nRule four covers sales.\n';
  const notes = '# Notes\nRefund queue runs nightly.\nRefund audit is weekly.\nThe queue starts at midnight.\nThe audit reads one week.\nIt skips holidays.\nIt reports to finance.\n';
  const page = (title: string, source: string, text: string, from: number, firstCited: number) => [
    '---', `title: ${title}`, 'created_by: agent:fixture', 'compiled_at: 2026-09-20T00:00:00Z',
    'sources:', `  - ${source}`, 'source_hash:', `  ${source}: ${digest(text)}`, 'status: draft', `summary: ${title}.`, '---',
    '## Summary', `${title}.`, '## Facts',
    ...[0, 1, 2, 3].map((offset) => `- Refund claim ${from + offset} about refund approval. [[src:${source}#l${offset + firstCited}]]`),
    '## Decisions', '## Open questions', '## Not in sources',
  ].join('\n');
  return {
    'project.md': project,
    'sources/returns.md': returns,
    'sources/notes.md': notes,
    'wiki/returns.md': page('Returns', 'sources/returns.md', returns, 1, 6),
    'wiki/notes.md': page('Notes', 'sources/notes.md', notes, 5, 4),
  };
}

async function openWiki(page: Page) {
  await page.goto('/en/');
  await page.getByRole('button', { name: /^Open (?:a|my) folder/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await page.goto('/en/library/?tab=wiki&guides=off');
  await expect(page.getByTestId('question-desk-input')).toBeVisible();
}

const fieldTop = (page: Page) => page.getByTestId('question-desk-input').evaluate((field) => field.getBoundingClientRect().top);

test('a long retained question stays inside the inquiry at 200 percent text on a narrow screen', async ({ page }) => {
  const title = 'Which original explains refund approval, inventory restoration timing, exceptions, and the next batch conditions?';
  await installLibraryWorkHarness(page, { files: {
    'project.md': project,
    'sources/refund-handling.md': refund,
    'wiki/answers/retained.md': wiki(title, 'sources/refund-handling.md', digest(refund), 'Approval queues a restoration job.')
      .replace('status: draft', 'status: draft\nanswer_thread: wiki/answers/retained'),
  } });
  await openWiki(page);
  const question = page.getByTestId('library-questions-open');
  await expect(question).toContainText(title);
  await expect(page.getByTestId('question-desk-saved')).toContainText(title);
  await expect(page.getByTestId('question-desk-originals')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await expect.poll(() => question.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const pane = element.closest('[data-question-desk-container]')!.getBoundingClientRect();
    return Math.max(pane.left - button.left, button.right - pane.right);
  })).toBeLessThanOrEqual(1);
  await question.click();
  await expect(page.getByTestId('retained-answer-context')).toBeVisible();
});

test('a folder with no wiki page and no saved question starts from three originals', async ({ page }) => {
  await installLibraryWorkHarness(page, { files: {
    'project.md': project,
    'sources/a.md': refund, 'sources/b.md': inventory, 'sources/c.md': refund, 'sources/d.md': inventory,
  } });
  await openWiki(page);
  const originals = page.getByTestId('question-desk-originals');
  await expect(originals.getByRole('button')).toHaveCount(3);
  await expect(originals).toContainText('1 more sources are available in the Sources tab.');
  await expect(page.getByTestId('question-desk-saved')).toHaveCount(0);
});

for (const [width, height] of [[1512, 901], [1920, 1080]] as const) {
  test(`keeps the field on one row through results, Show more and a report at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const harness = await installLibraryWorkHarness(page, { files: thirteenLeads() });
    await openWiki(page);
    await expect(page.getByTestId('question-desk-recent')).toBeVisible();
    const entry = await fieldTop(page);
    await page.getByTestId('question-desk-input').fill('When is a refund approved?');
    await page.getByTestId('question-desk-input').press('Enter');
    const leads = page.getByTestId('question-desk-lead');
    await expect(leads).toHaveCount(3);
    await expect(page.getByTestId('question-desk-results-head')).toContainText('13 passages found');
    await expect(page.getByTestId('question-desk-recent')).toHaveCount(0);
    expect(await fieldTop(page)).toBe(entry);
    await expect(page.getByTestId('question-desk-input')).toBeFocused();

    await page.getByTestId('question-desk-show-more').click();
    await expect(leads).toHaveCount(13);
    await expect(leads.nth(3).locator('[data-lead-open]')).toBeFocused();
    expect(await fieldTop(page)).toBe(entry);
    for (const text of await leads.allTextContents()) expect(text).not.toMatch(/\.md#/u);
    await expect(page.getByText(/Source freshness does not establish/)).toHaveCount(0);

    await page.getByTestId('question-desk-summarize').click();
    await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
    await harness.answer(page, '## Answer\nRefunds go back to the card. [[src:sources/returns.md#l4]]\n\n## Source-backed evidence\n- The refund goes to the card. [[src:sources/returns.md#l4]]\n\n## Disagreements or changed claims\nNone read.\n\n## Unknowns and search limits\nThe timing is unknown.');
    await expect(page.getByTestId('question-desk-report')).toBeVisible();
    await expect(page.getByTestId('question-desk-results-head')).toHaveText('Passages the search found');
    await page.getByTestId('library-question-desk').evaluate((desk) => { desk.scrollTop = 0; });
    expect(await fieldTop(page)).toBe(entry);

    // The report cost an agent turn: editing the question keeps it, and new rows replace it.
    await page.getByTestId('question-desk-input').fill('When does the refund queue run?');
    await expect(page.getByTestId('question-desk-report')).toBeVisible();
    await page.getByTestId('question-desk-input').press('Enter');
    await expect(page.getByTestId('question-desk-report')).toHaveCount(0);
    await expect(page.getByTestId('question-desk-results-head')).toContainText('passages found');
    expect(await fieldTop(page)).toBe(entry);
  });
}

test('coverage opens from the info glyph, closes on Escape, and Tab walks field, search, glyph, report, then rows', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 901 });
  await installLibraryWorkHarness(page, { files: thirteenLeads() });
  await openWiki(page);
  const desk = page.getByTestId('library-question-desk');
  await page.getByTestId('question-desk-input').fill('When is a refund approved?');
  await page.getByTestId('question-desk-search').click();
  await expect(page.getByTestId('question-desk-lead')).toHaveCount(3);
  await expect(desk.locator('details, svg.lucide-plus, svg.lucide-minus, [class*="lucide-chevron"]')).toHaveCount(0);

  const glyph = page.getByTestId('question-desk-coverage-info');
  await glyph.click();
  const popover = page.getByTestId('question-desk-coverage-info-popover');
  await expect(popover).toContainText('Wiki 2/2 · Sources 2/2');
  await expect(popover).toContainText('Source freshness does not establish');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(glyph).toBeFocused();

  await page.getByTestId('question-desk-input').focus();
  const firstRow = page.getByTestId('question-desk-lead').first();
  const stops = [
    page.getByTestId('question-desk-search'), glyph, page.getByTestId('question-desk-summarize'),
    firstRow.locator('[data-lead-open]'),
  ];
  for (const stop of stops) {
    await page.keyboard.press('Tab');
    await expect(stop).toBeFocused();
  }
  const jev = firstRow.getByRole('button', { name: 'Check claim with Jev' });
  for (let presses = 0; presses < 4 && !(await jev.evaluate((element) => element === document.activeElement)); presses += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(jev).toBeFocused();
  await expect(jev).toHaveCSS('opacity', '1');
});

test('keeps the report scroll viewport and focused citations above mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  const harness = await installLibraryWorkHarness(page, { files: {
    'project.md': project,
    'sources/refund-handling.md': refund,
    'wiki/refund-overview.md': wiki('Refund overview', 'sources/refund-handling.md', digest(refund), 'Refund approval queues a stock restoration job.'),
  } });
  await openWiki(page);
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('question-desk-input').fill('When does refund approval restore stock?');
  await page.getByTestId('question-desk-search').click();
  await page.getByTestId('question-desk-summarize').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await harness.answer(page, '## Answer\nA separate job restores stock. [[src:sources/refund-handling.md#l2]]\n\n## Source-backed evidence\n- Approval queues a restoration job. [[src:sources/refund-handling.md#l2]]\n- The job may finish in the next inventory batch. [[src:sources/refund-handling.md#l3]]\n\n## Disagreements or changed claims\nNo additional claims were read.\n\n## Unknowns and search limits\nThe completion time is unknown.');
  await expect(page.getByTestId('question-desk-report')).toBeVisible();
  await page.getByRole('button', { name: 'Close conversation', exact: true }).click();
  await expect.poll(() => page.locator('[data-report-evidence-pair]').evaluate((pair) => {
    const headings = pair.querySelectorAll('[data-report-section-heading]');
    return headings[1]!.getBoundingClientRect().top > headings[0]!.getBoundingClientRect().bottom;
  })).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const desk = page.getByTestId('library-question-desk');
  await expect.poll(() => desk.evaluate((element) => {
    const navigation = document.querySelector('[data-tabbar="primary"]')!;
    const contentTop = navigation.getBoundingClientRect().top + parseFloat(getComputedStyle(navigation).borderTopWidth);
    return element.getBoundingClientRect().bottom - contentTop;
  })).toBeLessThanOrEqual(0);
  // On screen a citation is the file and its line; the address is its description and what print shows.
  const citation = page.getByRole('button', { name: 'refund-handling.md · line 3', exact: true });
  await expect(citation).toHaveAccessibleDescription('sources/refund-handling.md#l3');
  await expect(citation.locator('[data-citation-address]')).toBeHidden();
  // Print: the dialog is stubbed so the print copy stays in the page while print media is on.
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByTestId('question-desk-print-pdf').click();
  await page.emulateMedia({ media: 'print' });
  const printed = page.locator('[data-question-desk-print-root] [data-source-anchor="l3"]');
  await expect(printed.locator('[data-citation-address]')).toBeVisible();
  await expect(printed.locator('[data-citation-address]')).toHaveText('sources/refund-handling.md#l3');
  await expect(printed.locator('[data-citation-place]')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('[data-question-desk-print-root]')).toHaveCount(0);
  await expect(citation.locator('[data-citation-place]')).toBeVisible();
  await citation.focus();
  await expect.poll(() => citation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('library-source-passage')).toHaveAttribute('data-state', 'resolved');
});

test('Wiki question desk finds contradictory leads and keeps the no-key source path usable', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 901 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    'sources/refund-handling.md': refund,
    'sources/inventory-state.md': inventory,
    'wiki/refund-overview.md': wiki('Refund overview', 'sources/refund-handling.md', 'f'.repeat(64), 'Refund approval immediately restores stock.'),
    'wiki/inventory-state.md': wiki('Inventory state', 'sources/inventory-state.md', digest(inventory), 'Refund approval does not immediately restore inventory.'),
  });
  await page.goto('/en/library/?tab=wiki&guides=off', { waitUntil: 'domcontentloaded' });
  // A press before hydration is lost on a cold dev server, and the folder never opens.
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Open (?:a|my) folder/ }).first().click();
  await page.getByTestId('library-workspace-wiki').click();
  await expect(page.getByTestId('library-question-desk')).toBeVisible();
  await page.getByTestId('question-desk-input').fill('Does refund approval immediately restore stock?');
  await page.getByTestId('question-desk-search').click();
  const results = page.getByTestId('question-desk-results');
  await expect(results).toBeVisible();
  await page.getByTestId('question-desk-coverage-info').click();
  await expect(page.getByTestId('question-desk-coverage-info-popover')).toContainText('Wiki 2/2 · Sources 2/2 · 0 leads omitted');
  await page.keyboard.press('Escape');
  await page.getByTestId('question-desk-show-more').click();
  await expect(results.getByRole('button', { name: 'Refund approval immediately restores stock.' })).toBeVisible();
  // Each source line both claims cite is that claim's row, opened from its cited file: one sentence, one row.
  await expect(results.getByRole('button', { name: 'Refund approval does not immediately restore inventory.' })).toHaveCount(1);
  await expect(results.getByRole('button', { name: 'Refund approval queues a stock restoration job.' })).toHaveCount(0);
  await expect(page.getByTestId('question-desk-results-head')).toHaveText('4 passages found');
  const stale = page.getByTestId('question-desk-lead').filter({ has: page.getByRole('button', { name: 'Refund approval immediately restores stock.' }) });
  await expect(stale).toContainText('Source needs review');
  await expect(page.getByTestId('question-desk-summarize')).toHaveCount(0);
  await expect(page.getByText('Check claim with Jev')).toHaveCount(0);
  await page.setViewportSize({ width: 1040, height: 720 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByTestId('question-desk-input')).toBeVisible();
  await expect(page.getByTestId('library-index')).toBeHidden();
  await expect(results.getByRole('button', { name: 'Refund approval immediately restores stock.' })).toBeVisible();
  await page.getByTestId('question-desk-browse').click();
  await expect(page.getByTestId('library-index')).toBeVisible();
  await page.getByTestId('question-desk-back').click();
  await expect(page.getByTestId('library-question-desk')).toBeVisible();
  await page.setViewportSize({ width: 1512, height: 901 });
  await stale.getByRole('button', { name: 'refund-handling.md · line 2' }).click();
  await expect(page.getByTestId('library-source-passage')).toHaveAttribute('data-state', 'resolved');
  await page.getByTestId('library-reader-back').click();
  await page.getByTestId('library-workspace-wiki').click();
  await expect(page.getByTestId('library-question-desk')).toBeVisible();
  await expect(page.getByTestId('question-desk-input')).toHaveValue('Does refund approval immediately restore stock?');
  await expect(page.getByTestId('question-desk-results')).toBeVisible();
  await page.getByTestId('question-desk-input').fill('Who owns the lunar migration?');
  await page.getByTestId('question-desk-search').click();
  await expect(page.getByTestId('question-desk-unknown')).toContainText('Word search can miss documents in another language');
});
