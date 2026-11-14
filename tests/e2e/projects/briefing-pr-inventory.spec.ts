import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { auditPage, FREEZE_CSS } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { gotoOriginals, installBriefingRuntime, openChangesFromRail, openOriginals, setBriefingMode } from './change-briefing-fixture';

async function openBriefing(page: Page) {
  await installBriefingRuntime(page);
  await mountDesktopVault(page);
  await gotoOriginals(page, '/en/changes/?guides=off');
  await expect(page.getByRole('button', { name: 'Read GitHub PRs' })).toBeVisible();
}

test('keeps scope help and search usable in the PR list toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBriefing(page);
  await setBriefingMode(page, 'inventory-large');
  await expect(page.getByText('Updated in this period · open and closed PRs')).toBeVisible();
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  const scope = page.getByRole('button', { name: 'Read scope' });
  await scope.focus();
  await expect(page.getByRole('tooltip').filter({ hasText: 'PRs updated in the selected local dates' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const search = page.getByRole('textbox', { name: 'Find loaded PRs by title or number' });
  await search.fill('Change request 42');
  const match = page.getByRole('button', { name: /Change request 42/ });
  await expect(match).toBeVisible();
  await match.click();
  await page.getByRole('button', { name: 'Back to pull requests' }).click();
  await expect(match).toBeFocused();
  const periodHeight = await page.getByRole('combobox', { name: 'Period' }).evaluate(element => element.getBoundingClientRect().height);
  const rangeHeight = await page.getByRole('button', { name: 'Choose dates' }).evaluate(element => element.parentElement!.getBoundingClientRect().height);
  expect(Math.abs(periodHeight - rangeHeight)).toBeLessThanOrEqual(2);
  if (process.env.ATLAS_PR_PROOF) {
    mkdirSync(process.env.ATLAS_PR_PROOF, { recursive: true });
    await page.screenshot({ path: `${process.env.ATLAS_PR_PROOF}/pr-search-1440.png` });
  }
});

test('opens period files from a PR and returns to the same original', async ({ page }) => {
  await openBriefing(page);
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await page.getByRole('button', { name: /Make checkout confirmation clear/ }).click();
  await page.getByRole('button', { name: 'View files touched in this period' }).click();
  await expect(page.getByRole('heading', { name: 'Read code changes for the whole period' })).toBeVisible();
  await expect(page.getByText('These are files touched in the selected period, not a verified list of files changed by this PR.')).toBeVisible();
  await expect(page.getByTestId('briefing-file-list').getByText('service.ts')).toBeVisible();
  await page.getByTestId('briefing-file-list').getByText('service.ts').click();
  await expect(page.getByText(/Compares .*not a single PR or commit/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to PR' }).click();
  await expect(page.getByRole('heading', { name: 'Make checkout confirmation clear' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View files touched in this period' })).toBeFocused();
});

test('returns to a visible action in a long PR after visiting combined originals', async ({ page }) => {
  await openBriefing(page);
  await page.getByTestId('briefing-mixed').click();
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: 'Back to pull requests' }).click();
  await setBriefingMode(page, 'inventory-reader-long');
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await page.getByRole('button', { name: /Make checkout confirmation clear/ }).click();
  const files = page.getByRole('button', { name: 'View files touched in this period' });
  await files.click();
  await page.getByRole('button', { name: 'Back to PR' }).click();
  await expect(files).toBeFocused();
  await expect(files).toBeInViewport();
});

test('opens only a commit’s recorded paths and returns to that commit', async ({ page }) => {
  await openBriefing(page);
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await page.getByRole('button', { name: /revert previous rule/ }).click();
  await page.getByRole('button', { name: 'View files touched by this commit' }).click();
  await expect(page.getByRole('heading', { name: 'Files: this commit · Comparison: whole selected period' })).toBeVisible();
  await expect(page.getByTestId('briefing-file-list').getByText('service.ts')).toBeVisible();
  await expect(page.getByTestId('briefing-file-list').getByText('unmapped.ts')).toHaveCount(0);
  await page.getByTestId('briefing-file-list').getByText('service.ts').click();
  await expect(page.getByText(/Compares .*not a single PR or commit/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to commit' }).click();
  await expect(page.getByRole('heading', { name: 'revert previous rule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View files touched by this commit' })).toBeFocused();
});

test('keeps a selected file beyond the first page reachable on a narrow screen', async ({ page }) => {
  await openBriefing(page);
  await page.setViewportSize({ width: 600, height: 900 });
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Read again' }).click();
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await page.getByRole('button', { name: /change tooling/ }).click();
  await page.getByRole('button', { name: 'View files touched by this commit' }).click();
  const search = page.getByRole('searchbox', { name: 'Find a changed file' });
  await search.fill('tool-60');
  await page.getByRole('button', { name: /mcp\/src\/tool-60\.ts/ }).click();
  await expect(page.getByRole('region', { name: 'Changed lines: mcp/src/tool-60.ts' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to files' }).click();
  await search.clear();
  const selected = page.getByRole('button', { name: /mcp\/src\/tool-60\.ts/ });
  await expect(selected).toBeVisible();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
});

test('separates public PRs, commit originals, and period files', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBriefing(page);
  expect(await page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls.some(call => call.command === 'git_briefing_public_inventory'))).toBe(false);
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare agent request' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Select PR/ })).toHaveCount(0);
  if (process.env.ATLAS_PR_PROOF) { mkdirSync(process.env.ATLAS_PR_PROOF, { recursive: true }); await page.screenshot({ path: `${process.env.ATLAS_PR_PROOF}/pr-list.png` }); }
  await page.getByRole('button', { name: /Make checkout confirmation clear/ }).click();
  await expect(page.getByText('Author original for PR 17.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep the order timeline readable/ })).toBeHidden();
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await expect(page.getByRole('button', { name: /author claim: changed checkout/ })).toBeVisible();
  await expect(page.getByText('Author original for PR 17.')).toBeHidden();
  await page.getByRole('button', { name: /author claim: changed checkout/ }).click();
  await expect(page.getByText(/Why: keep the return action visible/)).toBeVisible();
  await page.getByRole('radio', { name: 'Files', exact: true }).click();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
  await expect(page.getByText(/Why: keep the return action visible/)).toBeHidden();
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts' }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('+limit = 20');
});

test('keeps the earlier mixed briefing separately accessible when returning', async ({ page }) => {
  await openBriefing(page);
  await page.getByTestId('briefing-mixed').focus();
  await page.getByTestId('briefing-mixed').press('Enter');
  await expect(page.getByRole('heading', { name: 'Earlier combined briefing' })).toBeFocused();
  await expect(page.getByText('Commit messages and PR descriptions matched to them. This is not the full PR list.')).toBeVisible();
  await page.getByRole('button', { name: 'Read GitHub PR descriptions', exact: true }).click();
  await page.getByTestId('briefing-originals').click();
  await expect(page.getByRole('button', { name: /Keep map navigation readable/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to pull requests' }).press('Enter');
  await expect(page.getByTestId('briefing-mixed')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Read GitHub PRs' })).toBeVisible();
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await expect(page.getByRole('button', { name: /author claim: changed checkout/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep map navigation readable/ })).toBeHidden();
  await page.getByTestId('briefing-mixed').click();
  await expect(page.getByRole('button', { name: /Keep map navigation readable/ })).toBeVisible();
});

test('keeps combined and commit explanations separate after running both and returning', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'fixture-text-model' })));
  await openBriefing(page);
  await page.getByTestId('briefing-mixed').click();
  await page.getByRole('button', { name: 'Read GitHub PR descriptions', exact: true }).click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByText('Readable map navigation', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to pull requests' }).click();
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare a commit explanation' }).click();
  await expect(page.locator('h3:visible').filter({ hasText: /^Readable map navigation$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Summarize commit messages only', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByText('Commit notes', { exact: true })).toBeVisible();
  await page.getByTestId('briefing-mixed').click();
  await expect(page.getByText('Readable map navigation', { exact: true })).toBeVisible();
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await openChangesFromRail(page);
  await expect(page.getByText('Readable map navigation', { exact: true })).toBeVisible();
});

test('serializes mixed and commit requests and keeps Stop reachable after leaving', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'fixture-text-model' })));
  await openBriefing(page);
  await page.getByTestId('briefing-mixed').click();
  await page.getByRole('button', { name: 'Read GitHub PR descriptions', exact: true }).click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const calls = () => page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls.filter(call => call.command === 'source_briefing_chat').length);
  await expect.poll(calls).toBe(1);
  await page.getByRole('button', { name: 'Back to pull requests' }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare a commit explanation' }).click();
  await page.getByRole('button', { name: 'Summarize commit messages only' }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls.filter(call => call.command === 'llm_chat_cancel').length)).toBe(1);
  expect(await calls()).toBe(1);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect.poll(calls).toBe(2);
  await expect(page.getByText('Commit notes', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __briefingProbe: { peak: number } }).__briefingProbe.peak)).toBe(1);
});

test('reads public PRs even when the selected period has no commits', async ({ page }) => {
  await openBriefing(page);
  await setBriefingMode(page, 'empty');
  await page.getByRole('button', { name: 'Read again' }).click();
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep the order timeline readable/ })).toBeVisible();
  await expect(page.getByTestId('briefing-status')).toHaveCount(0);
});

test('reads a public PR from a source-only entry without opening a vault', async ({ page }) => {
  await installBriefingRuntime(page);
  await page.goto('/en/changes/?guides=off');
  await setBriefingMode(page, 'empty');
  await page.getByRole('button', { name: 'Choose Git repository' }).click();
  await openOriginals(page);
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls.map(call => call.command));
  expect(calls).toContain('git_source_briefing');
  expect(calls).not.toContain('git_change_briefing');
});

test('keeps completed PRs while explicitly continuing an incomplete read', async ({ page }) => {
  await openBriefing(page);
  await setBriefingMode(page, 'inventory-pages');
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await page.getByRole('button', { name: 'Read more PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep the order timeline readable/ })).toBeVisible();
});

test('reports a later-page failure without losing the page already read', async ({ page }) => {
  await openBriefing(page);
  await setBriefingMode(page, 'inventory-partial-error');
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect(page.getByText('Could not read public PRs. Check the connection and whether the repository is accessible.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await page.getByRole('button', { name: 'Read more PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Keep the order timeline readable/ })).toBeVisible();
});

test('keeps Stop reachable when switching away from an active PR read', async ({ page }) => {
  await openBriefing(page);
  await setBriefingMode(page, 'inventory-hold');
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls.some(call => call.command === 'git_briefing_public_inventory'))).toBe(true);
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('radio', { name: 'Pull requests', exact: true }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read more PRs' })).toBeVisible();
});

test('finds a late PR in a long list and returns to the filtered row at narrow and desktop widths', async ({ page }) => {
  await openBriefing(page);
  await setBriefingMode(page, 'inventory-large');
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  if (process.env.ATLAS_PR_PROOF) {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.screenshot({ path: `${process.env.ATLAS_PR_PROOF}/pr-large-1920.png` });
  }
  for (const width of [390, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const search = page.getByRole('textbox', { name: 'Find loaded PRs by title or number' });
    await search.fill('#60');
    const row = page.getByRole('button', { name: /Change request 60/ });
    await row.click();
    await expect(page.getByText('Author original for PR 60.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to pull requests' }).click();
    await expect(search).toHaveValue('#60');
    await expect(row).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('shows failure without losing originals and offers a fixed GitHub recovery link', async ({ page }) => {
  await openBriefing(page);
  await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await setBriefingMode(page, 'inventory-unavailable');
  await page.getByRole('button', { name: 'Refresh PRs' }).click();
  await expect(page.getByText('Could not read public PRs. Check the connection and whether the repository is accessible.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Make checkout confirmation clear/ })).toBeVisible();
  await setBriefingMode(page, 'inventory-oversized');
  await page.getByRole('button', { name: 'Refresh PRs' }).click();
  const link = page.getByRole('link', { name: 'Open PRs on GitHub' });
  await expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pulls');
  await link.focus();
  await expect(link).toBeFocused();
});

test('retries local remote detection without an automatic GitHub read', async ({ page }) => {
  await openBriefing(page);
  await setBriefingMode(page, 'remote-error');
  await page.getByRole('button', { name: 'Read again' }).click();
  await expect(page.getByText('Could not read the repository’s GitHub address.')).toBeVisible();
  await setBriefingMode(page, 'ready');
  await page.getByRole('button', { name: 'Check repository again' }).click();
  await expect(page.getByRole('button', { name: 'Read GitHub PRs' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls.some(call => call.command === 'git_briefing_public_inventory'))).toBe(false);
});

test('measures the PR list and original at desktop, narrow and doubled text sizes', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const ramps = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
  const measurements: unknown[] = [];
  if (process.env.ATLAS_PR_PROOF) mkdirSync(process.env.ATLAS_PR_PROOF, { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440, 1920, 2560]) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', isMobile: width <= 768, hasTouch: width <= 768 });
    const page = await context.newPage();
    await openBriefing(page);
    await page.getByRole('button', { name: 'Read GitHub PRs' }).click();
    const row = page.getByRole('button', { name: /Make checkout confirmation clear/ });
    await expect(row).toBeVisible();
    await page.setViewportSize({ width, height: 900 });
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.mouse.move(0, 0);
    const list = await auditPage(page, { width, rampNames: ramps, scope: 'main' });
    measurements.push({ width, state: 'list', ...list });
    expect(shouldFail([list]), JSON.stringify(list.findings)).toBe(false);
    expect(list.findings.target, JSON.stringify(list.findings.target)).toEqual([]);
    if (process.env.ATLAS_PR_PROOF) await page.screenshot({ path: `${process.env.ATLAS_PR_PROOF}/pr-list-${width}.png` });
    const scope = page.getByRole('button', { name: 'Read scope' });
    const refresh = page.getByRole('button', { name: 'Refresh PRs' });
    const refreshTop = await refresh.evaluate(element => element.getBoundingClientRect().top);
    await scope.click();
    await expect(page.getByRole('tooltip').filter({ hasText: 'PRs updated in the selected local dates' })).toBeVisible();
    expect(Math.abs(await refresh.evaluate(element => element.getBoundingClientRect().top) - refreshTop)).toBeLessThanOrEqual(1);
    await page.locator('main').evaluate(element => { element.scrollTop += 16; });
    const tooltip = page.getByRole('tooltip').filter({ hasText: 'PRs updated in the selected local dates' });
    const box = await tooltip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    if (process.env.ATLAS_PR_PROOF) await page.screenshot({ path: `${process.env.ATLAS_PR_PROOF}/pr-scope-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await row.click();
    await expect(page.getByText('Author original for PR 17.')).toBeVisible();
    const original = await auditPage(page, { width, rampNames: ramps, scope: 'main' });
    measurements.push({ width, state: 'original', ...original });
    expect(shouldFail([original]), JSON.stringify(original.findings)).toBe(false);
    expect(original.findings.target, JSON.stringify(original.findings.target)).toEqual([]);
    if (process.env.ATLAS_PR_PROOF) await page.screenshot({ path: `${process.env.ATLAS_PR_PROOF}/pr-original-${width}.png` });
    await page.getByRole('button', { name: 'Back to pull requests' }).click();
    await expect(row).toBeFocused();
    if (width === 1024) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      const zoomed = await auditPage(page, { width, rampNames: ramps, scope: 'main' });
      measurements.push({ width, state: 'list', zoom: '200%', ...zoomed });
      expect(shouldFail([zoomed]), JSON.stringify(zoomed.findings)).toBe(false);
      await row.click();
      const zoomedOriginal = await auditPage(page, { width, rampNames: ramps, scope: 'main' });
      measurements.push({ width, state: 'original', zoom: '200%', ...zoomedOriginal });
      expect(shouldFail([zoomedOriginal]), JSON.stringify(zoomedOriginal.findings)).toBe(false);
      await page.getByRole('button', { name: 'Back to pull requests' }).click();
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    }
    await context.close();
  }
  if (process.env.ATLAS_PR_PROOF) writeFileSync(`${process.env.ATLAS_PR_PROOF}/pr-measurements.json`, JSON.stringify(measurements, null, 2));
});
