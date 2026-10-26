import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { auditPage } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { calls, enter, prepare, reviewSummary } from './git-pr-briefing-helpers';
import { waitForBoxStill } from '../settle';
import { setBriefingMode } from './change-briefing-fixture';

test('inspects sources and request details before sending, cancels and resets the next preview', async ({ page }) => {
  await enter(page); await prepare(page);
  const dialog = page.getByRole('dialog', { name: 'Explain this period', exact: true });
  await expect(dialog.locator('dl')).toContainText('fixture-text-model');
  await expect(dialog.locator('dl')).toContainText('http://localhost:11434');
  await expect(page.getByTestId('briefing-plan-requests')).toHaveAttribute('data-reading-parts', '1');
  const sources = dialog.getByRole('button', { name: 'Review text to send', exact: true });
  const details = dialog.getByRole('button', { name: 'Request details', exact: true });
  await expect(sources).toHaveAttribute('aria-expanded', 'false');
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await sources.click();
  await dialog.getByRole('button', { name: 'Keep map navigation readable', exact: true }).click();
  await expect(dialog).toContainText('131 author-reported tests passed.');
  await details.click();
  await expect(sources).toHaveAttribute('aria-expanded', 'false');
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.locator('#briefing-preview-sources')).toBeHidden();
  await expect(dialog.locator('#briefing-preview-details')).toContainText('bytes');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create summary', exact: true })).toBeFocused();
  await reviewSummary(page);
  await expect(page.getByRole('button', { name: 'Request details', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
});

test('discloses the extra overview request and keeps oversized originals inspectable', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'batch');
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { capacity: number } }).__briefingProbe.capacity = 1800; });
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  await prepare(page);
  const dialog = page.getByRole('dialog');
  const parts = Number(await page.getByTestId('briefing-plan-requests').getAttribute('data-reading-parts'));
  expect(parts).toBeGreaterThan(1);
  await expect(page.getByTestId('briefing-plan-requests')).toContainText(String(parts + 1));
  await expect(page.getByTestId('briefing-plan-requests')).toContainText('1800');
  await dialog.getByRole('button', { name: 'Review text to send', exact: true }).click();
  const part = dialog.getByRole('combobox', { name: 'Choose reading request to inspect', exact: true });
  await part.click();
  await page.getByRole('option').last().click();
  await expect(dialog).toContainText('Earlier work 8');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await setBriefingMode(page, 'long-original');
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { capacity: number } }).__briefingProbe.capacity = 1000; });
  await prepare(page);
  const gap = dialog.getByRole('button', { name: /source records cannot be sent/ });
  await expect(gap).toBeVisible();
  await gap.click();
  await dialog.getByRole('button', { name: 'Keep map navigation readable', exact: true }).click();
  await expect(dialog).toContainText('Original section 159');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
});

for (const [width, height] of [[390, 844], [600, 900], [768, 1024], [834, 1112], [1024, 768], [1440, 900], [1512, 900], [1920, 1080], [2560, 1440]]) {
  test(`keeps the default and expanded request preview reachable at ${width}`, async ({ page }, testInfo) => {
    await enter(page); await prepare(page);
    await page.setViewportSize({ width, height });
    const dialog = page.getByRole('dialog', { name: 'Explain this period', exact: true });
    const ramps = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
    for (const expanded of [false, true]) {
      if (expanded) await dialog.getByRole('button', { name: 'Request details', exact: true }).click();
      await waitForBoxStill(dialog);
      const audit = await auditPage(page, { width, rampNames: ramps, scope: '[role="dialog"]' });
      await testInfo.attach(`preview-${width}-${expanded}`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
      expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
      await expect(dialog.getByRole('button', { name: 'Create period explanation', exact: true })).toBeInViewport();
    }
  });
}

for (const width of [390, 1512]) {
  test(`keeps original inspection and part selection bounded at ${width}`, async ({ page }, testInfo) => {
    await enter(page);
    await setBriefingMode(page, 'batch');
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    await setBriefingMode(page, 'long-original');
    await page.evaluate(() => { (window as unknown as { __briefingProbe: { capacity: number } }).__briefingProbe.capacity = 20000; });
    await prepare(page);
    await page.setViewportSize({ width, height: 900 });
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Review text to send', exact: true }).click();
    const part = dialog.getByRole('combobox', { name: 'Choose reading request to inspect', exact: true });
    await part.click();
    await expect(page.getByRole('listbox')).toBeInViewport({ ratio: 1 });
    await page.getByRole('option').first().click();
    await dialog.getByRole('button', { name: 'Keep map navigation readable', exact: true }).click();
    const original = dialog.locator('pre');
    await expect(original).toContainText('Original section 159');
    const ramps = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
    for (const end of [false, true]) {
      if (end) await original.evaluate(element => element.scrollIntoView({ block: 'end' }));
      await waitForBoxStill(dialog);
      const audit = await auditPage(page, { width, rampNames: ramps, scope: '[role="dialog"]' });
      await testInfo.attach(`preview-${width}-original-${end}`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
      expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
      await expect(dialog.getByRole('button', { name: 'Create period explanation', exact: true })).toBeInViewport();
    }
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  });

  test(`retains request actions at doubled text size and ${width} width`, async ({ page }, testInfo) => {
    await enter(page); await prepare(page);
    await page.setViewportSize({ width, height: 900 });
    const dialog = page.getByRole('dialog');
    const title = dialog.getByRole('heading', { name: 'Explain this period', exact: true });
    const original = await title.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expect.poll(() => title.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(original * 2);
    await waitForBoxStill(dialog);
    const ramps = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
    const audit = await auditPage(page, { width, rampNames: ramps, scope: '[role="dialog"]' });
    await testInfo.attach(`preview-${width}-text-zoom`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
    expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Create period explanation', exact: true })).toBeInViewport();
  });
}
