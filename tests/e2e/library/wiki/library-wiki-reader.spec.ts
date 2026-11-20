import { expect, test, type Page } from '@playwright/test';
import { installLibraryWorkHarness, type LibraryWorkHarness } from '../../library-work-harness';
import { startSampling, stopSampling } from '../../motion-sampler';
import { digest } from '../answers/library-question-desk-harness';

const returns = [
  '# Returns',
  'Items can be returned within 14 days of delivery.',
  'Opened items are excluded unless they arrive damaged.',
  'The return label is free for members.',
  'Refunds go back to the original card.',
].join('\n') + '\n';
const carrier = [
  '# Carrier terms',
  'Carrier A collects parcels before 6 pm.',
  'Lost parcels are refunded at the declared value.',
].join('\n') + '\n';

const project = '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Returns\nslug: returns\n---\n';
const concept = '---\nuid: 00000000-0000-4000-8000-000000000002\nkind: capability\ntitle: Refund processing\nslug: refund-processing\n---\n\nRefunds.\n';

/** Filler facts, so the page is longer than the reader and a claim near its end needs a scroll. */
const filler = (count: number) => Array.from({ length: count }, (_, index) => `- Filler fact ${index + 1} about parcels and labels. [[src:sources/returns.md#l5]]`);

function page(title: string, sources: Record<string, string>, body: string[]): string {
  return [
    '---', `title: ${title}`, 'created_by: agent:claude', 'compiled_at: 2026-10-19T11:52:00Z',
    'sources:', ...Object.keys(sources).map((path) => `  - ${path}`),
    'source_hash:', ...Object.entries(sources).map(([path, hash]) => `  ${path}: ${hash}`),
    'status: draft', `summary: ${title}.`, '---', ...body,
  ].join('\n');
}

/** Two pages that link each other, a concept, a link to nothing, one page citing one file and one citing two. */
function folder(): Record<string, string> {
  return {
    'project.md': project,
    'capabilities/refund-processing.md': concept,
    'sources/returns.md': returns,
    'sources/carrier.md': carrier,
    'wiki/returns.md': page('Return policy', { 'sources/returns.md': digest(returns) }, [
      '## Summary', '',
      'See [[wiki/settlement-reconciliation-check]] and [[wiki/nowhere]] and [[capabilities/refund-processing]].',
      'This page is [[wiki/returns]].', '',
      '## Facts', '',
      '- Items can be returned within 14 days of delivery. [[src:sources/returns.md#l2]]',
      '- Opened items are excluded. [[src:sources/returns.md#l3]]',
      ...filler(70),
      '- The return label is free for members. [[src:sources/returns.md#l4]]',
      '', '## Decisions', '', '## Open questions', '', '## Not in sources', '',
    ]),
    'wiki/settlement-reconciliation-check.md': page('Settlement reconciliation check', {
      'sources/returns.md': digest(returns),
      // Recorded before the carrier terms changed, so its citations read the file as it is now.
      'sources/carrier.md': digest('an older carrier file\n'),
    }, [
      '## Summary', '', 'Back to [[wiki/returns]].', '',
      '## Facts', '',
      '- Refunds go back to the original card. [[src:sources/returns.md#l5]]',
      '- Lost parcels are refunded at the declared value. [[src:sources/carrier.md#l3]] [[src:sources/carrier.md#l2]]',
      '- A cited file that left the folder. [[src:sources/gone.md#l1]]',
      '', '## Decisions', '', '## Open questions', '', '## Not in sources', '',
    ]),
  };
}

async function openWikiTab(page: Page, files: Record<string, string>): Promise<LibraryWorkHarness> {
  const harness = await installLibraryWorkHarness(page, { files });
  await page.goto('/en/');
  await page.getByRole('button', { name: /^Open (?:a|my) folder/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await page.goto('/en/library/?tab=wiki&guides=off');
  await expect(page.getByTestId('question-desk-input')).toBeVisible();
  return harness;
}

async function openPage(page: Page, slug: string) {
  await page.getByTestId(`library-wiki-${slug}`).click();
  await expect(page.getByTestId('library-reading-pane').locator('[data-docs-viewer]')).toBeVisible();
}

/** Every read of a file under `sources/` the page has made, by path. */
async function sourceReads(page: Page, harness: LibraryWorkHarness): Promise<string[]> {
  const { calls } = await harness.snapshot(page);
  return calls
    .filter((call) => call.method === 'read_vault_binary_file' || call.method === 'read_vault_text_file')
    .map((call) => String((call.params as { relativePath?: unknown } | undefined)?.relativePath ?? ''))
    .filter((path) => /(^|\/)sources\//u.test(path));
}

const reader = (page: Page) => page.getByTestId('library-reading-pane');
const scroller = (page: Page) => page.getByTestId('library-wiki-header').locator('xpath=..');

test('the row above a page names that page, not the folder', async ({ page }) => {
  await openWikiTab(page, folder());
  await openPage(page, 'wiki/returns');
  const row = page.getByTestId('library-reader-back').locator('..');
  await expect(row.getByTestId('library-status-strip')).toHaveCount(0);
  await expect(row.getByTestId('wiki-reader-status')).toHaveText('draft');
  await expect(row.getByTestId('wiki-reader-byline')).toContainText('Claude (agent)');
  // The folder's counts are one press away: Close returns to the Wiki home.
  await page.getByTestId('library-reader-back').click();
  await expect(page.getByTestId('question-desk-input')).toBeVisible();
});

test('a link says the name of what it opens, and a link to nothing says it is missing', async ({ page }) => {
  await openWikiTab(page, folder());
  await openPage(page, 'wiki/returns');
  const body = reader(page).locator('[data-docs-viewer]');
  await expect(body.locator('[data-link-target="wiki/settlement-reconciliation-check"]')).toHaveText('Settlement reconciliation check');
  const concept = body.locator('[data-link-target="capabilities/refund-processing"]');
  await expect(concept).toHaveText('Refund processing');
  await expect(concept.locator('[data-kind-glyph]')).toHaveCount(1);
  const missing = body.locator('[data-link-missing]');
  await expect(missing).toContainText('wiki/nowhere');
  await expect(missing).toHaveAccessibleDescription('Nothing in this folder has this name.');
  const hint = body.locator('[data-link-missing-hint]');
  await expect(hint).toHaveText('Nothing in this folder has this name.');
  await expect(hint).toHaveCSS('opacity', '0');
  await missing.hover();
  await expect(hint).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(hint).toHaveCSS('opacity', '0');
  await missing.focus();
  await expect(hint).toHaveCSS('opacity', '1');
  // A page's link to itself is plain text.
  await expect(body.getByText('wiki/returns', { exact: true })).toHaveCount(0);
  await expect(body.locator('[data-link-target="wiki/returns"]')).toHaveCount(0);
});

test('a citation opens its passage beside it, reading nothing before the press', async ({ page }) => {
  const harness = await openWikiTab(page, folder());
  await openPage(page, 'wiki/returns');
  expect(await sourceReads(page, harness)).toEqual([]);

  // One source: a citation says only where in it.
  const citations = reader(page).locator('[data-docs-viewer] button[data-source-anchor]');
  await expect(citations.first()).toHaveText('line 2');
  for (const text of await citations.allTextContents()) expect(text).not.toContain('returns.md');

  const citation = citations.first();
  await citation.click();
  const popover = page.getByTestId('wiki-citation-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toBeFocused();
  await expect(popover).toHaveAttribute('aria-label', 'returns.md · line 2');
  const cited = await popover.getByTestId('wiki-citation-cited').textContent();
  expect(cited).toBe('Items can be returned within 14 days of delivery.');
  expect(new Set(await sourceReads(page, harness))).toEqual(new Set(['sources/returns.md']));
  // The popover never covers its citation.
  const [chip, panel] = await Promise.all([citation.boundingBox(), popover.boundingBox()]);
  expect(panel!.y >= chip!.y + chip!.height || panel!.y + panel!.height <= chip!.y).toBe(true);

  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(citation).toBeFocused();
  // Escape closed the popover, not the page.
  await expect(reader(page)).toBeVisible();

  // Open the source shows the same unit the Sources reader marks.
  await citation.click();
  await page.getByTestId('wiki-citation-open-source').click();
  await expect(page.getByTestId('library-source-passage-cited')).toHaveText(cited!);
});

test('a page citing two files names the file on every citation, and its popovers say what changed or left', async ({ page }) => {
  await openWikiTab(page, folder());
  await openPage(page, 'wiki/settlement-reconciliation-check');
  const citations = reader(page).locator('[data-docs-viewer] button[data-source-anchor]');
  await expect(citations).toHaveCount(4);
  for (const text of await citations.allTextContents()) expect(text).toMatch(/\.md · line \d+$/u);

  // Two citations after one sentence are two presses, each with its own popover.
  const lost = citations.filter({ hasText: 'carrier.md · line 3' });
  await lost.click();
  const popover = page.getByTestId('wiki-citation-popover');
  await expect(popover).toHaveAttribute('data-state', 'changed');
  await expect(popover.getByTestId('wiki-citation-changed')).toHaveText('This file changed after the page was written. This is its text now.');
  await expect(popover.getByTestId('wiki-citation-cited')).toHaveText('Lost parcels are refunded at the declared value.');
  await citations.filter({ hasText: 'carrier.md · line 2' }).click();
  const open = page.locator('[data-testid="wiki-citation-popover"][data-surface-state="entered"]');
  await expect(open).toHaveCount(1);
  await expect(open.getByTestId('wiki-citation-cited')).toHaveText('Carrier A collects parcels before 6 pm.');
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);

  await citations.filter({ hasText: 'gone.md' }).click();
  await expect(popover).toHaveAttribute('data-state', 'missing');
  await expect(popover.getByTestId('wiki-citation-missing')).toHaveText('This file is no longer in the folder.');
  await expect(popover.getByTestId('wiki-citation-cited')).toHaveCount(0);
});

test('the page ends with what it cites, what links here and the concepts it touches', async ({ page }) => {
  await openWikiTab(page, folder());
  await openPage(page, 'wiki/returns');
  const foot = page.getByTestId('wiki-page-foot');
  await expect(foot.getByTestId('wiki-foot-sources')).toContainText('returns.md73 citations');
  await expect(foot.getByTestId('wiki-foot-linked-from')).toContainText('Settlement reconciliation check');
  await expect(foot.getByTestId('wiki-foot-concepts')).toContainText('Refund processing');
  const heights = await foot.getByTestId('wiki-foot-row').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);

  // A page no other page links to and that names no concept shows only its sources.
  await page.getByTestId('library-reader-back').click();
  await openPage(page, 'wiki/settlement-reconciliation-check');
  await expect(foot.getByTestId('wiki-foot-sources')).toContainText('carrier.md2 citations');
  await expect(foot.getByTestId('wiki-foot-sources')).toContainText('gone.md1 citation');
  await expect(foot.getByTestId('wiki-foot-linked-from')).toContainText('Return policy');
  await expect(foot.getByTestId('wiki-foot-concepts')).toHaveCount(0);
});

test('a link opens its page in place, and Back returns to the scroll it left, without a long frame', async ({ page }) => {
  await openWikiTab(page, folder());
  await openPage(page, 'wiki/returns');
  await scroller(page).evaluate((element) => { element.scrollTop = 120; });

  await startSampling(page, { tracks: [{ name: 'popover', selector: '[data-testid="wiki-citation-popover"]' }] });
  const citation = reader(page).locator('[data-docs-viewer] button[data-source-anchor]').first();
  await citation.click();
  await expect(page.getByTestId('wiki-citation-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wiki-citation-popover')).toHaveCount(0);
  // Measured just before the press: a click scrolls its target into view first.
  const link = reader(page).locator('[data-link-target="wiki/settlement-reconciliation-check"]');
  await scroller(page).evaluate((element) => { element.scrollTop = 60; });
  await expect(link).toBeInViewport({ ratio: 1 });
  const before = await scroller(page).evaluate((element) => element.scrollTop);
  expect(before).toBe(60);
  await link.click();
  await expect(page.getByTestId('library-wiki-header')).toContainText('Settlement reconciliation check');
  await expect.poll(() => scroller(page).evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByTestId('library-reader-trail-back').click();
  await expect(page.getByTestId('library-wiki-header')).toContainText('Return policy');
  const recording = await stopSampling(page);

  expect(await scroller(page).evaluate((element) => element.scrollTop)).toBe(before);
  const gaps = recording.frames.slice(1).map((t, index) => t - recording.frames[index]!);
  expect(Math.max(...gaps), 'the longest frame interval').toBeLessThanOrEqual(50);
});

test('a desk row opens the page at its claim, marked, and Close returns to the results as they were', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 901 });
  await openWikiTab(page, folder());
  await page.getByTestId('question-desk-input').fill('return label free members');
  await page.getByTestId('question-desk-input').press('Enter');
  const lead = page.getByTestId('question-desk-lead').filter({ hasText: 'The return label is free for members.' }).first();
  await expect(lead).toBeVisible();
  // Every lead shown and the desk scrolled, so returning has a place to keep.
  await page.getByTestId('question-desk-show-more').click();
  const desk = page.getByTestId('library-question-desk');
  await desk.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(lead.locator('[data-lead-open]')).toBeInViewport({ ratio: 1 });
  const deskTop = await desk.evaluate((element) => element.scrollTop);
  expect(deskTop).toBeGreaterThan(0);
  const shownLeads = await page.getByTestId('question-desk-lead').count();

  await lead.locator('[data-lead-open]').click();
  const claim = reader(page).locator('[data-docs-viewer] li', { hasText: 'The return label is free for members.' });
  const mark = page.locator('[data-reader-claim-mark]');
  await expect(mark).toHaveCount(1);
  await expect.poll(async () => {
    const [box, view] = await Promise.all([claim.boundingBox(), scroller(page).boundingBox()]);
    return box!.y >= view!.y && box!.y + box!.height <= view!.y + view!.height;
  }).toBe(true);
  const [markBox, claimBox] = await Promise.all([mark.boundingBox(), claim.boundingBox()]);
  expect(markBox!.y).toBeLessThanOrEqual(claimBox!.y);
  expect(markBox!.y + markBox!.height).toBeGreaterThanOrEqual(claimBox!.y + claimBox!.height);
  // The mark fades and leaves the DOM.
  await expect(mark).toHaveCount(0, { timeout: 5_000 });

  await page.getByTestId('library-reader-back').click();
  await expect(lead).toBeVisible();
  await expect(page.getByTestId('question-desk-lead')).toHaveCount(shownLeads);
  expect(await desk.evaluate((element) => element.scrollTop)).toBe(deskTop);
});

test('a claim already on the first screen opens without a scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 901 });
  await openWikiTab(page, folder());
  await page.getByTestId('question-desk-input').fill('returned within 14 days');
  await page.getByTestId('question-desk-input').press('Enter');
  await page.getByTestId('question-desk-lead').filter({ hasText: 'Items can be returned within 14 days' }).first().locator('[data-lead-open]').click();
  await expect(page.locator('[data-reader-claim-mark]')).toHaveCount(1);
  const tops = await scroller(page).evaluate(async (element) => {
    const seen: number[] = [];
    const end = performance.now() + 1000;
    while (performance.now() < end) {
      seen.push(element.scrollTop);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen;
  });
  expect(new Set(tops), 'the reader moved while the claim was already on screen').toEqual(new Set([0]));
});
