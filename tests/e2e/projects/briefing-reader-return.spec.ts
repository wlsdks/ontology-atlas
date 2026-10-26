import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { auditPage } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { setBriefingMode } from './change-briefing-fixture';
import { calls, enter, prepare, readPrs } from './git-pr-briefing-helpers';

test.use({ viewport: { width: 1920, height: 1080 } });

async function leaveAndReturn(page: import('@playwright/test').Page) {
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page).toHaveURL(/topology/);
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
  await expect(page.getByTestId('briefing-narrative')).toBeVisible();
}

test('returns to the same long original and reading position after leaving Changes', async ({ page }, testInfo) => {
  await enter(page);
  await setBriefingMode(page, 'long-original');
  await readPrs(page);
  await page.getByTestId('briefing-originals').click();
  const row = page.getByRole('button', { name: /Keep map navigation readable PR #2925/ });
  const listPosition = await row.evaluate(element => element.closest('main')!.scrollTop);
  await row.click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toContainText('Original section 159');
  const position = await original.evaluate(element => {
    const main = element.closest('main')!;
    main.scrollTop = 1800;
    return main.scrollTop;
  });
  expect(position).toBeGreaterThan(1000);
  await expect.poll(() => original.evaluate(element => element.closest('main')!.scrollTop)).toBe(position);
  await leaveAndReturn(page);
  await expect(original).toBeVisible();
  await expect(original).toContainText('Original section 159');
  await expect(original).toBeFocused();
  await expect.poll(() => original.evaluate(element => element.closest('main')!.scrollTop)).toBe(position);
  const rampNames = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
  const audit = await auditPage(page, { width: 1920, rampNames, scope: 'main' });
  await testInfo.attach('restored-reading-audit', { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
  expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
  await original.getByRole('button', { name: 'Back to source list', exact: true }).first().click();
  await expect(row).toBeFocused();
  await expect.poll(() => row.evaluate(element => element.closest('main')!.scrollTop)).toBe(listPosition);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(1);
});

test('retains the expanded source list and original return row across routes', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'source-pages');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  await page.getByTestId('briefing-originals').click();
  const sources = page.getByTestId('briefing-sources');
  await sources.getByRole('button', { name: /Read \d+ more sources/ }).click();
  const row = sources.locator('[data-control="row"]').nth(44);
  const before = await row.evaluate(element => {
    const main = element.closest('main')!;
    main.scrollTop += element.getBoundingClientRect().top - 300;
    return { scroll: main.scrollTop, top: element.getBoundingClientRect().top };
  });
  await row.click();
  const original = page.getByTestId('briefing-original');
  const title = await original.getByRole('heading').innerText();
  await leaveAndReturn(page);
  await expect(original.getByRole('heading')).toHaveText(title);
  await expect(original).toBeFocused();
  await original.getByRole('button', { name: 'Back to source list', exact: true }).first().click();
  await expect(row).toBeFocused();
  await expect.poll(() => row.evaluate(element => ({ scroll: element.closest('main')!.scrollTop, top: element.getBoundingClientRect().top }))).toEqual(before);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
});

test('restores a citation return target without carrying the reader into another period', async ({ page }) => {
  await enter(page);
  await prepare(page);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const citation = page.getByTestId('briefing-theme').getByRole('button', { name: 'Read source Keep map navigation readable', exact: true }).last();
  await citation.click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeFocused();
  await leaveAndReturn(page);
  await expect(original).toBeVisible();
  await original.getByRole('button', { name: 'Back to summary', exact: true }).first().click();
  await expect(citation).toBeFocused();
  await citation.press('Enter');
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(original).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await expect(original).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(1);
});

test('returns to the summary heading when the originating explanation was replaced', async ({ page }) => {
  await enter(page);
  await prepare(page);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await page.getByTestId('briefing-theme').getByRole('button', { name: 'Read source Keep map navigation readable', exact: true }).first().click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeFocused();
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await page.getByTestId('briefing-summary-mode').click();
  await setBriefingMode(page, 'model-three');
  await page.getByRole('button', { name: 'Rebuild summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-theme')).toHaveCount(3);
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await page.getByTestId('briefing-originals').click();
  await expect(original).toBeVisible();
  await leaveAndReturn(page);
  await expect(original).toBeVisible();
  await original.getByRole('button', { name: 'Back to summary', exact: true }).first().click();
  await expect(page.locator('#git-briefing-title')).toBeFocused();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(2);
});
