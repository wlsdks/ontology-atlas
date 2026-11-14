import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { gotoOriginals, installBriefingRuntime, openChangesFromRail, setBriefingMode } from './change-briefing-fixture';

async function capture(page: Page, name: string) {
  if (!process.env.ATLAS_FILES_WORKSPACE_PROOF) return;
  mkdirSync(process.env.ATLAS_FILES_WORKSPACE_PROOF, { recursive: true });
  await page.screenshot({ path: `${process.env.ATLAS_FILES_WORKSPACE_PROOF}/${name}.png` });
}

async function openFiles(page: Page, width: number) {
  await installBriefingRuntime(page);
  await mountDesktopVault(page);
  await gotoOriginals(page, '/en/changes/?guides=off');
  await page.setViewportSize({ width, height: 900 });
  await page.getByTestId('briefing-source-browser').click();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
}

test('keeps the file list beside one comparison and returns to groups on desktop', async ({ page }) => {
  await openFiles(page, 1440);
  const group = page.getByTestId('briefing-group-capabilities/checkout');
  await group.click();
  await expect(group).toBeHidden();
  await expect(page.getByTestId('briefing-file-list')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Commit messages', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-file-list')).toBeVisible();
  await expect(page.getByTestId('briefing-patch')).toContainText('+limit = 20');
  await capture(page, 'desktop-file');
  await page.getByRole('radio', { name: 'Commits', exact: true }).click();
  await expect(page.getByRole('button', { name: /author claim: changed checkout/ })).toBeVisible();
  await expect(page.getByTestId('briefing-file-list')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Files', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('+limit = 20');
  await page.getByRole('button', { name: 'Back to groups', exact: true }).click();
  await expect(group).toBeVisible();
  await expect(group).toBeFocused();
  await expect(page.getByTestId('briefing-patch')).toHaveCount(0);
});

test('restores an expanded file list and scroll position after leaving a group', async ({ page }) => {
  await openFiles(page, 1440);
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  const group = page.getByTestId('briefing-area-mcp');
  await group.click();
  const list = page.getByTestId('briefing-file-list');
  await list.getByRole('button', { name: 'Show 21 more files', exact: true }).click();
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const before = await list.evaluate(element => element.scrollTop);
  await page.getByRole('button', { name: 'Back to groups', exact: true }).click();
  await expect(group).toBeFocused();
  await group.click();
  await expect(page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-60.ts', exact: true })).toBeVisible();
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(before);
});

test('restores the file list after visiting the map and returning', async ({ page }) => {
  await openFiles(page, 1440);
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  await page.getByTestId('briefing-area-mcp').click();
  const list = page.getByTestId('briefing-file-list');
  await list.getByRole('button', { name: 'Show 21 more files', exact: true }).click();
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const before = await list.evaluate(element => element.scrollTop);
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page).toHaveURL(/topology/);
  await openChangesFromRail(page);
  await expect(list).toBeVisible();
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(before);
});

test('navigates filtered files and keeps the current comparison when it is filtered out', async ({ page }) => {
  await openFiles(page, 1440);
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  await page.getByTestId('briefing-area-mcp').click();
  const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
  await search.fill('tool-5');
  await page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-50.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('diff --git a/mcp/src/tool-50.ts b/mcp/src/tool-50.ts');
  await capture(page, 'desktop-filtered');
  await page.getByRole('button', { name: 'Next matching file', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Changed lines: mcp/src/tool-51.ts' })).toBeVisible();
  await search.fill('no-such-file');
  await expect(page.getByRole('region', { name: 'Changed lines: mcp/src/tool-51.ts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous matching file', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next matching file', exact: true })).toBeDisabled();
  await search.clear();
  await expect(page.getByRole('button', { name: 'Next file', exact: true })).toBeEnabled();
});

test('shows a single pane at narrow width and returns to the same filtered row', async ({ page }) => {
  await openFiles(page, 390);
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
  await search.fill('service');
  const row = page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true });
  await row.click();
  await expect(page.getByTestId('briefing-file-list')).toBeHidden();
  await expect(page.getByTestId('briefing-patch')).toBeVisible();
  await capture(page, 'narrow-file');
  await page.getByRole('button', { name: 'Back to files', exact: true }).click();
  await expect(search).toHaveValue('service');
  await expect(row).toBeFocused();
});

test('keeps keyboard focus visible when the file workspace changes width', async ({ page }) => {
  await openFiles(page, 1440);
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  const row = page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true });
  await row.click();
  const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
  await search.focus();
  await page.setViewportSize({ width: 800, height: 900 });
  const backToFiles = page.getByRole('button', { name: 'Back to files', exact: true });
  await expect(backToFiles).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(row).toBeFocused();
  await row.focus();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(backToFiles).toBeFocused();
});

test('returns focus to search when no filtered file row remains', async ({ page }) => {
  await openFiles(page, 1440);
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
  await search.fill('no-such-file');
  await page.setViewportSize({ width: 800, height: 900 });
  await page.getByRole('button', { name: 'Back to files', exact: true }).click();
  await expect(search).toBeFocused();
});

test('moves focus out of the comparison when the file list becomes the only pane', async ({ page }) => {
  await openFiles(page, 800);
  await setBriefingMode(page, 'many');
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  await page.getByTestId('briefing-area-mcp').click();
  const row = page.getByRole('button', { name: 'Read changed lines: mcp/src/tool-1.ts', exact: true });
  await row.click();
  await page.getByRole('button', { name: 'Back to files', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Next file', exact: true }).focus();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(row).toBeFocused();
});

test('shows the active search while reading one pane at 200% text size', async ({ page }) => {
  await openFiles(page, 1440);
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  const search = page.getByRole('searchbox', { name: 'Find a changed file', exact: true });
  await search.fill('service');
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(search).toBeHidden();
  await expect(page.getByTestId('briefing-reading-header')).toContainText('Search: service');
  await expect(page.getByRole('button', { name: 'Back to files', exact: true })).toBeVisible();
});
