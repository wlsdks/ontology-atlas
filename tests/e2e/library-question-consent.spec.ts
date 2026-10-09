import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { digest, wiki } from './library-question-desk-harness';
import { installLibraryWorkHarness } from './library-work-harness';
import { waitForAnimationsDone } from './settle';

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
