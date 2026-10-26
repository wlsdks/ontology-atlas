import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { auditPage, FREEZE_CSS } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { installBriefingRuntime, setBriefingMode } from './change-briefing-fixture';

test('keeps grouped evidence and file comparison reachable across responsive bands and text zoom', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const rampNames = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
  const measurements: unknown[] = [];
  for (const width of [390, 600, 768, 834, 1024, 1440, 1512, 1920, 2560]) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', isMobile: width <= 768, hasTouch: width <= 768 });
    const page = await context.newPage();
    await installBriefingRuntime(page);
    await mountDesktopVault(page);
    await page.goto('/en/changes/?guides=off');
    await page.getByTestId('briefing-source-browser').click();
    await expect(page.getByTestId('briefing-ready')).toBeVisible();
    await page.setViewportSize({ width, height: 900 });
    await setBriefingMode(page, 'long');
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    await expect(page.getByTestId('briefing-area-mcp')).toBeVisible();
    await page.addStyleTag({ content: FREEZE_CSS });
    const overview = await auditPage(page, { width, rampNames, scope: 'main' });
    measurements.push({ width, state: 'overview', ...overview });
    expect(shouldFail([overview]), JSON.stringify(overview.findings)).toBe(false);
    await page.getByTestId('briefing-area-mcp').click();
    await page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-0.ts', exact: true }).click();
    await expect(page.getByTestId('briefing-patch')).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('[data-testid="briefing-patch"]')?.scrollIntoView({ block: 'start' });
      const main = document.querySelector('main');
      if (main) main.scrollTop += 800;
    });
    await expect(page.getByRole('navigation', { name: 'Files in this group', exact: true })).toBeInViewport();
    const reading = await auditPage(page, { width, rampNames, scope: 'main' });
    measurements.push({ width, state: 'long-code-reading', ...reading });
    expect(shouldFail([reading]), JSON.stringify(reading.findings)).toBe(false);
    if (process.env.ATLAS_BRIEFING_PROOF) {
      mkdirSync(process.env.ATLAS_BRIEFING_PROOF, { recursive: true });
      await page.screenshot({ path: `${process.env.ATLAS_BRIEFING_PROOF}/reading-${width}.png` });
    }
    await page.getByTestId('briefing-comparison').click();
    await page.getByTestId('briefing-net-paths').click();
    const evidence = await auditPage(page, { width, rampNames, scope: 'main' });
    measurements.push({ width, state: 'expanded-evidence', ...evidence });
    expect(shouldFail([evidence]), JSON.stringify(evidence.findings)).toBe(false);
    await page.evaluate(() => { document.querySelector('main')?.scrollTo(0, 0); });
    const result = await auditPage(page, { width, rampNames, scope: 'main' });
    measurements.push({ width, ...result });
    if (process.env.ATLAS_BRIEFING_PROOF) {
      const folder = process.env.ATLAS_BRIEFING_PROOF;
      mkdirSync(folder, { recursive: true });
      writeFileSync(`${folder}/responsive.json`, JSON.stringify(measurements, null, 2));
      await page.screenshot({ path: `${folder}/02-rendered-${width}.png` });
    }
    expect(shouldFail([result]), JSON.stringify(result.findings)).toBe(false);
    if (width === 1024) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      const zoomed = await auditPage(page, { width, rampNames, scope: 'main' });
      measurements.push({ width, zoom: '200%', ...zoomed });
      expect(shouldFail([zoomed]), JSON.stringify(zoomed.findings)).toBe(false);
      await page.evaluate(() => {
        document.querySelector('[data-testid="briefing-patch"]')?.scrollIntoView({ block: 'start' });
        const main = document.querySelector('main');
        if (main) main.scrollTop += 1200;
      });
      await expect(page.getByRole('navigation', { name: 'Files in this group', exact: true })).toBeInViewport();
      const zoomedReading = await auditPage(page, { width, rampNames, scope: 'main' });
      measurements.push({ width, zoom: '200%', state: 'long-code-reading', ...zoomedReading });
      expect(shouldFail([zoomedReading]), JSON.stringify(zoomedReading.findings)).toBe(false);
    }
    await context.close();
  }
  if (process.env.ATLAS_BRIEFING_PROOF) writeFileSync(`${process.env.ATLAS_BRIEFING_PROOF}/responsive.json`, JSON.stringify(measurements, null, 2));
});
