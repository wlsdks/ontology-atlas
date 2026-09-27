import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';
import { waitForAnimationsDone } from './settle';
import { stubDirectoryPicker } from './vault-picker-stub';

const refund = '# Refund handling\nRefund approval queues a stock restoration job.\nThe job may complete in the next inventory batch.\n';
const inventory = '# Inventory state\nRefund approval does not immediately restore inventory.\nA separate stock restoration job updates quantity after it runs.\n';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const wiki = (title: string, source: string, hash: string, fact: string) => [
  '---', `title: ${title}`, 'created_by: agent:fixture', 'compiled_at: 2026-09-20T00:00:00Z',
  'sources:', `  - ${source}`, 'source_hash:', `  ${source}: ${hash}`, 'status: draft',
  `summary: ${title}.`, '---', '## Summary', `${title}.`, '## Facts',
  `- ${fact} [[src:${source}#l2]]`, '## Decisions', '## Open questions', '## Not in sources',
].join('\n');

test('keeps a short positive inquiry centered and expanded evidence reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await installLibraryWorkHarness(page, { files: {
    'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Refunds\nslug: refunds\n---\n',
    'sources/refund-handling.md': refund,
    'sources/inventory-state.md': inventory,
    'wiki/refund-overview.md': wiki('Refund overview', 'sources/refund-handling.md', digest(refund), 'Refund approval queues a stock restoration job.'),
  } });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /^Open my folder/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await page.goto('/en/library/?tab=wiki&guides=off');
  await page.getByTestId('question-desk-input').fill('refund');
  await page.getByTestId('question-desk-search').click();
  const toggle = page.getByTestId('question-desk-evidence-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const desk = page.getByTestId('library-question-desk');
  await expect.poll(() => desk.evaluate((element) => {
    const pane = element.getBoundingClientRect();
    const group = element.querySelector('[data-question-desk-container]')!.getBoundingClientRect();
    const form = element.querySelector('form')!.getBoundingClientRect();
    return Math.max(Math.abs(form.left - pane.left - (pane.right - form.right)),
      Math.abs(group.top - pane.top - (pane.bottom - group.bottom)));
  })).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await expect.poll(() => desk.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const citation = page.getByRole('button', { name: 'sources/refund-handling.md#l2', exact: true }).last();
  await citation.focus();
  await expect.poll(() => citation.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('library-source-passage')).toHaveAttribute('data-state', 'resolved');
});

test('keeps the report scroll viewport and focused citations above mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  const harness = await installLibraryWorkHarness(page, { files: {
    'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Refunds\nslug: refunds\n---\n',
    'sources/refund-handling.md': refund,
    'wiki/refund-overview.md': wiki('Refund overview', 'sources/refund-handling.md', digest(refund), 'Refund approval queues a stock restoration job.'),
  } });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /^Open my folder/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await page.goto('/en/library/?tab=wiki&guides=off');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('question-desk-input').fill('When does refund approval restore stock?');
  await page.getByTestId('question-desk-search').click();
  await page.getByTestId('question-desk-summarize').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await harness.answer(page, '## Answer\nA separate job restores stock. [[src:sources/refund-handling.md#l2]]\n\n## Source-backed evidence\n- Approval queues a restoration job. [[src:sources/refund-handling.md#l2]]\n- The job may finish in the next inventory batch. [[src:sources/refund-handling.md#l3]]\n\n## Disagreements or changed claims\nNo additional claims were read.\n\n## Unknowns and search limits\nThe completion time is unknown.');
  await expect(page.getByTestId('question-desk-report')).toBeVisible();
  await page.getByRole('button', { name: 'Close conversation', exact: true }).click();
  await expect(page.locator('[data-report-evidence-pair]')).toHaveCSS('display', 'grid');
  await expect.poll(() => page.locator('[data-report-evidence-pair]').evaluate((pair) => {
    const headings = pair.querySelectorAll('[data-report-section-heading]');
    return Math.abs(headings[0]!.getBoundingClientRect().top - headings[1]!.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const desk = page.getByTestId('library-question-desk');
  await expect.poll(() => desk.evaluate((element) => {
    const navigation = document.querySelector('[data-tabbar="primary"]')!;
    const contentTop = navigation.getBoundingClientRect().top + parseFloat(getComputedStyle(navigation).borderTopWidth);
    return element.getBoundingClientRect().bottom - contentTop;
  })).toBeLessThanOrEqual(0);
  const citation = page.getByRole('button', { name: 'sources/refund-handling.md#l3', exact: true });
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
  await page.getByRole('button', { name: /^Open my folder/ }).first().click();
  await page.getByTestId('library-workspace-wiki').click();
  await expect(page.getByTestId('library-question-desk')).toBeVisible();
  mkdirSync('/tmp/atlas-question-desk-sol', { recursive: true });
  await page.screenshot({ path: '/tmp/atlas-question-desk-sol/desk-initial.png' });
  await page.getByTestId('question-desk-input').fill('Does refund approval immediately restore stock?');
  await page.getByTestId('question-desk-search').click();
  await expect(page.getByTestId('question-desk-results')).toBeVisible();
  await expect(page.getByTestId('question-desk-results')).toContainText('Wiki 2/2 · Originals 2/2 · 0 leads omitted');
  await expect(page.getByTestId('question-desk-coverage-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('question-desk-coverage-toggle').click();
  await expect(page.getByTestId('question-desk-coverage-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('question-desk-results')).toContainText('Searched 2 of 2 Wiki pages and 2 of 2 original files.');
  await expect(page.getByTestId('question-desk-results')).toContainText('Refund approval immediately restores stock.');
  await expect(page.getByTestId('question-desk-results')).toContainText('Refund approval does not immediately restore inventory.');
  await expect(page.getByTestId('question-desk-results')).toContainText('Source changed since this page was written');
  await expect(page.getByTestId('question-desk-results')).toContainText('Refund approval queues a stock restoration job.');
  await expect(page.getByTestId('question-desk-summarize')).toBeDisabled();
  await expect(page.getByText('Check claim with Jev')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/atlas-question-desk-sol/desk-results.png', fullPage: true });
  writeFileSync('/tmp/atlas-question-desk-sol/desk-results.ax.txt', await page.locator('body').ariaSnapshot());
  await page.setViewportSize({ width: 1040, height: 720 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/atlas-question-desk-sol/desk-1040.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByTestId('question-desk-input')).toBeVisible();
  await expect(page.getByTestId('library-index')).toBeHidden();
  await expect(page.getByText('Refund approval immediately restores stock.')).toBeVisible();
  await page.screenshot({ path: '/tmp/atlas-question-desk-sol/desk-mobile.png' });
  await page.getByTestId('question-desk-browse').click();
  await expect(page.getByTestId('library-index')).toBeVisible();
  await page.screenshot({ path: '/tmp/atlas-question-desk-sol/desk-mobile-browse.png' });
  await page.getByTestId('question-desk-back').click();
  await expect(page.getByTestId('library-question-desk')).toBeVisible();
  await page.setViewportSize({ width: 1512, height: 901 });
  await expect(page.getByTestId('question-desk-evidence-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'sources/refund-handling.md#l2' }).first().click();
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

test('Jev preview keeps the exact claim and long original passage reachable before consent', async ({ page }) => {
  const longPassage = 'Refund approval queues a stock restoration job; inventory changes only after that job runs. '.repeat(20);
  const source = `# Refund handling\n${longPassage}\n`;
  const sourcePath = 'sources/refund-handling.md';
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: {
    'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Refunds\nslug: refunds\n---\n',
    [sourcePath]: source,
    'wiki/refund-overview.md': wiki('Refund overview', sourcePath, digest(source), 'Refund approval queues a stock restoration job.'),
  } });
  await page.addInitScript(() => {
    const host = window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
      __atlasJevRequests: string[];
    };
    const originalInvoke = host.__TAURI_INTERNALS__.invoke;
    host.__atlasJevRequests = [];
    host.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'jev_secret_status') return Promise.resolve({ stored: true, last4: '4321' });
      if (command === 'jev_judge') {
        host.__atlasJevRequests.push(String(args?.payload ?? ''));
        return Promise.reject(new Error('The consent preview probe never authorizes sending.'));
      }
      return originalInvoke(command, args);
    };
  });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /^Open my folder/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await page.goto('/en/library/?tab=wiki&guides=off');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('question-desk-input').fill('When does refund approval restore stock?');
  await page.getByTestId('question-desk-search').click();
  await expect(page.getByTestId('question-desk-results')).toBeVisible();
  await expect(page.getByTestId('question-desk-evidence-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('question-desk-evidence-toggle').click();
  await expect(page.getByTestId('question-desk-evidence-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByText('Check claim with Jev').click();
  const panel = page.getByTestId('question-desk-jev-consent');
  await expect(panel).toBeVisible();
  const payload = await page.getByTestId('question-desk-jev-payload').textContent();
  expect(JSON.parse(payload!).state).toEqual({
    claim: 'Refund approval queues a stock restoration job.',
    evidence: longPassage.trim(),
  });
  mkdirSync('/tmp/atlas-question-desk-sol', { recursive: true });
  for (const [width, height] of [[1040, 720], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await expect(panel).toBeVisible();
    await waitForAnimationsDone(panel);
    await panel.evaluate((element) => { element.scrollTop = 0; });
    await expect(page.getByTestId('question-desk-jev-payload')).toContainText(longPassage.slice(0, 60));
    await page.screenshot({ path: `/tmp/atlas-question-desk-sol/jev-consent-${width}.png` });
    writeFileSync(`/tmp/atlas-question-desk-sol/jev-consent-${width}.ax.txt`, await page.locator('body').ariaSnapshot());
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByTestId('question-desk-jev-send')).toBeInViewport();
    await page.screenshot({ path: `/tmp/atlas-question-desk-sol/jev-consent-${width}-end.png` });
  }
  expect(await page.evaluate(() => (window as unknown as { __atlasJevRequests: string[] }).__atlasJevRequests)).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __atlasJevRequests: string[] }).__atlasJevRequests)).toEqual([]);
});
