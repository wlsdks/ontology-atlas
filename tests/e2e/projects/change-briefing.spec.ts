import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { installBriefingRuntime, setBriefingMode } from './change-briefing-fixture';

async function capture(page: import('@playwright/test').Page, state: string) {
  const folder = process.env.ATLAS_BRIEFING_PROOF;
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: `${folder}/state-${state}.png` });
}

async function enter(page: import('@playwright/test').Page) {
  await installBriefingRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
  await page.getByTestId('briefing-source-browser').click();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
}

test('reads grouped source evidence and actual changed lines without leaving Atlas', async ({ page }) => {
  await enter(page);
  const group = page.getByTestId('briefing-group-capabilities/checkout');
  await group.click();
  await expect(page.getByRole('region', { name: 'Source evidence', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('-limit = 10\n+limit = 20');
  await expect(page.getByTestId('briefing-group-unmapped')).toBeVisible();
  await page.getByRole('button', { name: 'Back to groups', exact: true }).click();
  await expect(group).toBeFocused();
  await expect(group).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('briefing-comparison').click();
  await page.getByTestId('briefing-net-paths').click();
  await page.getByRole('button', { name: 'Read changed lines: outside-period.ts', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Changed lines: outside-period.ts', exact: true })).toContainText('outside-period.ts');
});

test('navigates calendar periods and applies an inclusive custom interval', async ({ page }) => {
  await enter(page);
  await page.getByRole('combobox', { name: 'Period', exact: true }).click();
  await page.getByRole('option', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Date in this period', { exact: true }).fill('2024-02-20');
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-02-01 – 2024-02-29');
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-03-01 – 2024-03-31');
  await page.getByRole('combobox', { name: 'Period', exact: true }).click();
  await page.getByRole('option', { name: 'Custom dates', exact: true }).click();
  await page.getByLabel('Start date', { exact: true }).fill('2024-02-29');
  await page.getByLabel('End date', { exact: true }).fill('2024-02-28');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await capture(page, 'invalid-dates');
  await page.getByLabel('End date', { exact: true }).fill('2024-02-29');
  await page.getByRole('button', { name: 'Read this period', exact: true }).click();
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-02-29 – 2024-02-29');
  await expect.poll(() => page.evaluate(() => {
    const calls = (window as unknown as { __briefingProbe: { calls: { args: Record<string, unknown> }[] } }).__briefingProbe.calls;
    const last = calls.filter(call => typeof call.args.startEpoch === 'number').at(-1)!.args;
    return [last.startEpoch, last.endEpoch];
  })).toEqual([new Date('2024-02-29T00:00:00').getTime() / 1000, new Date('2024-03-01T00:00:00').getTime() / 1000]);
});

for (const mode of ['partial', 'empty', 'stale', 'no-history', 'ungranted'] as const) {
  test(`preserves date recovery for ${mode} source evidence`, async ({ page }) => {
    await enter(page);
    await setBriefingMode(page, mode);
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    if (mode === 'partial') await expect(page.getByTestId('briefing-ready')).toBeVisible();
    else await expect(page.getByTestId('briefing-status')).toBeVisible();
    await expect(page.getByTestId('briefing-range')).toBeVisible();
    await capture(page, mode);
    if (mode === 'stale' || mode === 'ungranted') await expect(page.getByTestId('briefing-ready')).toHaveCount(0);
  });
}

for (const mode of ['binary', 'truncated', 'revert', 'patch-error'] as const) {
  test(`keeps surrounding evidence when the file comparison is ${mode}`, async ({ page }) => {
    await enter(page);
    await setBriefingMode(page, mode);
    await page.getByTestId('briefing-group-capabilities/checkout').click();
    await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
    const evidence = page.getByRole('region', { name: 'Source evidence', exact: true });
    if (mode === 'binary') await expect(evidence).toContainText('binary');
    if (mode === 'truncated') await expect(evidence).toContainText('32 KiB');
    if (mode === 'revert') await expect(evidence).toContainText('no differences');
    if (mode === 'patch-error') await expect(page.getByRole('button', { name: 'Retry file comparison', exact: true })).toBeVisible();
    await expect(evidence).toContainText('author claim: changed checkout');
    await capture(page, mode);
  });
}

test('ignores an older period response after the next scope has loaded', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => { const probe = (window as unknown as { __briefingProbe: { hold: boolean; mode: string } }).__briefingProbe; probe.hold = true; probe.mode = 'empty'; });
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await expect(page.getByTestId('briefing-status')).toBeVisible();
  await capture(page, 'loading');
  await setBriefingMode(page, 'ready');
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release(): void } }).__briefingProbe.release(); });
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
});

test('does not insert an obsolete file comparison into a newly selected group', async ({ page }) => {
  await enter(page);
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await expect(page.getByText('Reading this file between the shown revisions…', { exact: true })).toBeVisible();
  await page.getByTestId('briefing-group-unmapped').click();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release(): void } }).__briefingProbe.release(); });
  await expect(page.getByTestId('briefing-patch')).toHaveCount(0);
  await expect(page.getByTestId('briefing-group-unmapped')).toHaveAttribute('aria-pressed', 'true');
});

test('returns from the map to the same calendar range and selected comparison', async ({ page }) => {
  await enter(page);
  await page.getByRole('combobox', { name: 'Period', exact: true }).click();
  await page.getByRole('option', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Date in this period', { exact: true }).fill('2024-02-20');
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toBeVisible();
  await page.getByRole('link', { name: 'Open capability on map', exact: true }).click();
  await expect(page).toHaveURL(/\/topology\//);
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toContainText('Monthly');
  await expect(page.getByTestId('briefing-range')).toHaveText('2024-02-01 – 2024-02-29');
  await expect(page.getByTestId('briefing-group-capabilities/checkout')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('briefing-patch')).toContainText('+limit = 20');
  await setBriefingMode(page, 'changed-head');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  await expect(page.getByTestId('briefing-group-capabilities/checkout')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('briefing-patch')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toContainText('Monthly');
});

test('narrows unmapped evidence by literal source area and expands every counted file', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  await page.getByTestId('briefing-group-unmapped').click();
  await page.getByRole('button', { name: 'mcp · 61', exact: true }).click();
  const evidence = page.getByRole('region', { name: 'Source evidence', exact: true });
  await expect(evidence.getByRole('button', { name: /^Read changed lines: mcp\// })).toHaveCount(40);
  await evidence.getByRole('button', { name: 'Show 21 more files', exact: true }).click();
  await expect(evidence.getByRole('button', { name: /^Read changed lines: mcp\// })).toHaveCount(61);
  await expect(evidence.getByRole('button', { name: 'Read changed lines: mcp/src/tool-40.ts', exact: true })).toBeFocused();
  await evidence.getByRole('button', { name: 'Source areas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'mcp · 61', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await capture(page, 'source-area-expanded');
  await page.getByRole('button', { name: 'All unmapped changes', exact: true }).click();
  await expect(evidence.getByRole('button', { name: 'Read changed lines: 한글/unmapped.ts', exact: true })).toBeVisible();
});

test('offers an honest browser limit without fabricated source history', async ({ page }) => {
  await page.goto('/en/changes/?guides=off');
  await expect(page.getByTestId('briefing-status')).toContainText('installed app');
  await expect(page.getByTestId('briefing-ready')).toHaveCount(0);
  await capture(page, 'web-limit');
});

test('never presents an empty partial read as proof that the period has no commits', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'partial-empty');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  await expect(page.getByText('Showing a limited read of this period. Narrow the dates for a more complete briefing.', { exact: true })).toBeVisible();
  await expect(page.getByText('No commits found in this period.', { exact: true })).toHaveCount(0);
});


test('opens a literal source area directly from the overview and returns focus to its entry', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  const area = page.getByTestId('briefing-area-mcp');
  await area.click();
  const evidence = page.getByRole('region', { name: 'Source evidence', exact: true });
  await expect(evidence.getByRole('heading', { name: 'mcp', exact: true })).toBeVisible();
  await expect(evidence.getByRole('button', { name: /^Read changed lines: mcp\// })).toHaveCount(40);
  await expect(evidence.getByRole('button', { name: 'Read changed lines: 한글/unmapped.ts', exact: true })).toHaveCount(0);
  await evidence.getByRole('button', { name: 'Read changed lines: mcp/src/tool-0.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toBeVisible();
  await expect(page.getByTestId('briefing-touched-files')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('briefing-touched-files').click();
  await evidence.getByRole('button', { name: 'Read changed lines: mcp/src/tool-1.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-touched-files')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Changed lines: mcp/src/tool-1.ts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to groups', exact: true }).click();
  await expect(area).toBeFocused();
  await expect(area).toHaveAttribute('aria-pressed', 'true');
});


test('keeps file switching reachable during a long diff and scopes navigation to its area', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'long');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
  await page.getByTestId('briefing-area-mcp').click();
  await page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-0.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('value259');
  const navigation = page.getByRole('navigation', { name: 'Files in this group', exact: true });
  await expect(navigation).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('[data-testid="briefing-patch"]')?.scrollIntoView({ block: 'start' });
    const main = document.querySelector('main');
    if (main) main.scrollTop += 800;
  });
  await expect(navigation).toBeInViewport();
  await expect(navigation.getByRole('button', { name: 'Previous file', exact: true })).toBeDisabled();
  const next = navigation.getByRole('button', { name: 'Next file', exact: true });
  await next.press('Enter');
  await expect(page.getByRole('region', { name: 'Changed lines: mcp/src/tool-1.ts', exact: true })).toBeVisible();
  await expect(next).toBeFocused();
  await next.press('Enter');
  await expect(page.getByRole('region', { name: 'Changed lines: mcp/src/tool-2.ts', exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: 'Choose another file', exact: true }).click();
  await expect(page.getByTestId('briefing-touched-files')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-39.ts', exact: true }).click();
  await next.click();
  await expect(page.getByTestId('briefing-file-position')).toHaveText('File 41 of 61');
  await navigation.getByRole('button', { name: 'Choose another file', exact: true }).click();
  const current = page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-40.ts', exact: true });
  await expect(current).toBeVisible();
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-60.ts', exact: true }).click();
  await expect(next).toBeDisabled();
  await expect(page.getByTestId('briefing-file-position')).toHaveText('File 61 of 61');
  await page.getByTestId('briefing-comparison').click();
  await page.getByTestId('briefing-net-paths').click();
  await page.getByRole('button', { name: 'Read changed lines: outside-period.ts', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Changed lines: outside-period.ts', exact: true })).toBeVisible();
  await expect(navigation).toHaveCount(0);
});


test('starts from a cold native launch and reads source history without opening an ontology', async ({ page }) => {
  await installBriefingRuntime(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/en/?shell=desktop');
  await page.getByRole('link', { name: /Git and PR briefing/ }).click();
  await expect(page.locator('[data-tabbar=primary]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/changes/);
  await page.getByRole('button', { name: 'Choose Git repository', exact: true }).click();
  await page.getByTestId('briefing-source-browser').click();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Period', exact: true }).click();
  await page.getByRole('option', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Date in this period', { exact: true }).fill('2026-10-25');
  await page.getByTestId('briefing-settings').click();
  await page.getByRole('link', { name: 'Choose model', exact: true }).click();
  await expect(page).toHaveURL(/tab=models/);
  await expect(page.locator('[data-tabbar=primary]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to explanation', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toHaveText('Monthly');
  await expect(page.getByTestId('briefing-range')).toHaveText('2026-10-01 – 2026-10-31');
  await page.getByTestId('briefing-group-unmapped').click();
  await page.getByRole('button', { name: 'author claim: changed checkout; not independently verified', exact: true }).click();
  await expect(page.locator('pre').filter({ hasText: 'Why: keep the return action visible.' })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string; args: Record<string, unknown> }[] } }).__briefingProbe.calls);
  expect(calls.some(call => call.command === 'git_source_briefing' && call.args.sourcePath === '/source/storefront' && !('vaultPath' in call.args))).toBe(true);
  await expect(page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true })).toHaveCount(0);
});

test('opens code context from a labelled control and returns focus when it closes', async ({ page }) => {
  await enter(page);
  await expect(page.getByTestId('briefing-code-heading')).toBeVisible();
  await expect(page.getByTestId('briefing-source-browser')).toBeFocused();
  const close = page.getByRole('button', { name: 'Close code changes', exact: true });
  await close.focus(); await close.press('Enter');
  await expect(page.getByTestId('briefing-source-browser')).toBeFocused();
  await expect(page.getByTestId('briefing-source-browser')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('briefing-source-browser').press('Enter');
  await expect(page.getByTestId('briefing-code-heading')).toBeVisible();
  await expect(page.getByTestId('briefing-source-browser')).toBeFocused();
});
