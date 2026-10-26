import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { auditPage } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { installBriefingRuntime, setBriefingMode } from './change-briefing-fixture';

for (const width of [390, 1512]) {
  test(`finds a file beyond the first batch without scrolling the whole list at ${width}`, async ({ page }) => {
    await installBriefingRuntime(page);
    await mountDesktopVault(page);
    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
    await page.getByTestId('briefing-source-browser').click();
    await setBriefingMode(page, 'long');
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('briefing-area-mcp').click();
    const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
    await expect(search).toBeVisible();
    const list = page.getByTestId('briefing-file-list');
    const size = await list.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
    expect(size.height).toBeLessThan(page.viewportSize()!.height / 2);
    expect(size.content).toBeGreaterThan(size.height);
    await search.fill('TOOL-60');
    const file = page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-60.ts', exact: true });
    await expect(file).toBeVisible();
    await file.click();
    await expect(page.getByTestId('briefing-file-position')).toHaveText('File 61 of 61');
    await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(file).toBeFocused();
    await search.fill('not-a-changed-file');
    await expect(list.getByRole('button')).toHaveCount(0);
    await search.fill('');
    await expect(file).toBeVisible();
  });
}

const ramps = parseRampNames(readdirSync('app/styles').filter(file => file.endsWith('.css')).map(file => readFileSync(`app/styles/${file}`, 'utf8')).join('\n'));
for (const [width, height] of [[390, 844], [600, 900], [768, 1024], [834, 1112], [1024, 768], [1440, 900], [1512, 900], [1920, 1080], [2560, 1440]]) {
  test(`keeps the changed-file collection bounded and reachable at ${width}`, async ({ page }, testInfo) => {
    await installBriefingRuntime(page);
    await mountDesktopVault(page);
    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
    await page.getByTestId('briefing-source-browser').click();
    await setBriefingMode(page, 'long');
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    await page.setViewportSize({ width, height });
    await page.getByTestId('briefing-area-mcp').click();
    const list = page.getByTestId('briefing-file-list');
    await expect(list).toBeVisible();
    for (const end of [false, true]) {
      if (end) await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const audit = await auditPage(page, { width, rampNames: ramps, scope: '[aria-label="Source evidence"]' });
      await testInfo.attach(`files-${width}-${end}`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
      expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
    }
  });
}

for (const width of [390, 1512]) {
  test(`retains file search and selected-file recovery at doubled text size and ${width}`, async ({ page }, testInfo) => {
    await installBriefingRuntime(page);
    await mountDesktopVault(page);
    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
    await page.getByTestId('briefing-source-browser').click();
    await setBriefingMode(page, 'long');
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('briefing-area-mcp').click();
    const heading = page.getByRole('region', { name: 'Source evidence', exact: true }).getByRole('heading', { name: 'mcp', exact: true });
    const before = await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => { document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`; });
    expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(before * 2);
    const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
    await search.fill('tool-60');
    const file = page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-60.ts', exact: true });
    await file.click();
    await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
    await expect(file).toBeFocused();
    await expect(search).toHaveValue('');
    const audit = await auditPage(page, { width, rampNames: ramps, scope: '[aria-label="Source evidence"]' });
    await testInfo.attach(`files-${width}-text-zoom`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
    expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
  });
}
