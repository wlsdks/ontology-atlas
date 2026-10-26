import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { auditPage } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { enter, calls } from './git-pr-briefing-helpers';

test.use({ viewport: { width: 1920, height: 1080 } });

async function choosePeriod(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Period', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

for (const [period, start, end] of [
  ['Daily', '2024-02-20', '2024-02-20'],
  ['Weekly', '2024-02-19', '2024-02-25'],
  ['Monthly', '2024-02-01', '2024-02-29'],
  ['Yearly', '2024-01-01', '2024-12-31'],
]) {
  test(`starts the first custom interval from the displayed ${period.toLowerCase()} range`, async ({ page }, testInfo) => {
    await enter(page);
    await choosePeriod(page, period);
    await page.getByLabel('Date in this period', { exact: true }).fill('2024-02-20');
    await expect(page.getByTestId('briefing-range')).toHaveText(start === end ? start : `${start} – ${end}`);
    await choosePeriod(page, 'Custom dates');
    await expect(page.getByLabel('Start date', { exact: true })).toHaveValue(start);
    await expect(page.getByLabel('End date', { exact: true })).toHaveValue(end);
    await expect(page.getByTestId('briefing-range')).toHaveText(`${start} – ${end}`);
    if (period === 'Daily') {
      const rampNames = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
      const audit = await auditPage(page, { width: 1920, rampNames, scope: 'main' });
      await testInfo.attach('custom-period-audit', { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
      expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
    }
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
    expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
  });
}

test('keeps an applied custom range and unfinished invalid draft when returning from a preset', async ({ page }) => {
  await enter(page);
  await choosePeriod(page, 'Custom dates');
  await page.getByLabel('Start date', { exact: true }).fill('2024-02-10');
  await page.getByLabel('End date', { exact: true }).fill('2024-02-12');
  await page.getByRole('button', { name: 'Read this period', exact: true }).click();
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-02-10 – 2024-02-12');
  await page.getByLabel('End date', { exact: true }).fill('2024-02-09');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await choosePeriod(page, 'Daily');
  await page.getByLabel('Date in this period', { exact: true }).fill('2025-07-18');
  await choosePeriod(page, 'Custom dates');
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2024-02-10');
  await expect(page.getByLabel('End date', { exact: true })).toHaveValue('2024-02-09');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Read this period', exact: true }).click();
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-02-10 – 2024-02-12');
  await page.getByLabel('End date', { exact: true }).fill('2024-02-13');
  await page.getByRole('button', { name: 'Read this period', exact: true }).click();
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-02-10 – 2024-02-13');
});

test('does not replace an empty preset date with the launch date on first custom entry', async ({ page }) => {
  await enter(page);
  await page.getByLabel('Date in this period', { exact: true }).fill('');
  await expect(page.getByTestId('briefing-status')).toBeVisible();
  await choosePeriod(page, 'Custom dates');
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('End date', { exact: true })).toHaveValue('');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
});

test('keeps an open original when first custom entry describes the same period', async ({ page }) => {
  await enter(page);
  await choosePeriod(page, 'Daily');
  await page.getByLabel('Date in this period', { exact: true }).fill('2024-02-20');
  await page.getByTestId('briefing-originals').click();
  await page.getByTestId('briefing-sources').locator('[data-control="row"]').first().click();
  const original = page.getByTestId('briefing-original');
  const title = await original.getByRole('heading').innerText();
  await choosePeriod(page, 'Custom dates');
  await expect(original.getByRole('heading')).toHaveText(title);
  await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toBeFocused();
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2024-02-20');
});
