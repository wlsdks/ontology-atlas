import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { auditPage, FREEZE_CSS } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { installBriefingRuntime } from './change-briefing-fixture';

test('opens a recorded original without starting a model or PR request and returns to its row', async ({ page }) => {
  await installBriefingRuntime(page);
  await mountDesktopVault(page);
  await page.goto('/en/changes/?guides=off');
    await page.getByTestId('briefing-mixed').click();
  const recent = page.getByTestId('briefing-recent-originals');
  await expect(recent).toBeVisible();
  await expect(page.getByText('PR descriptions not checked', { exact: false })).toBeVisible();
  const row = recent.getByRole('button', { name: /author claim: changed checkout/ });
  await expect(row).toBeVisible();
  await row.click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeVisible();
  await expect(original).toContainText('Why: keep the return action visible.');
  await original.getByRole('button', { name: 'Back to overview', exact: true }).first().click();
  await expect(row).toBeFocused();
  const calls = await page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string }[] } }).__briefingProbe.calls);
  expect(calls.filter(call => ['source_briefing_chat', 'git_briefing_pull_descriptions'].includes(call.command))).toEqual([]);
});

test('returns to a visible original when saved PRs arrive and preserves both lookup gaps', async ({ page }) => {
  await installBriefingRuntime(page);
  await page.addInitScript(() => {
    const runtime = window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      __releaseSavedPr?: () => void;
    };
    const invoke = runtime.__TAURI_INTERNALS__.invoke;
    runtime.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'git_briefing_saved_pull_descriptions') return new Promise(resolve => {
        runtime.__releaseSavedPr = () => resolve({ status: 'ready', omitted: 0, ignored: 0, pulls: {
          status: 'partial', repository: 'owner/repo', unchecked: 1, uncheckedCommits: ['d'.repeat(40)], unlinked: 1,
          descriptions: [{ number: 42, title: 'Saved original', body: 'Recorded text', digest: 'e'.repeat(64), integration: 'c'.repeat(40), updatedAt: '2026-10-25T00:00:00Z', fetchedAt: '2026-10-25T01:00:00Z', copyKind: 'saved' }],
        } });
      });
      const result = await invoke(command, args);
      if (command === 'git_change_briefing' || command === 'git_source_briefing') {
        const data = result as { commits: { hash: string; subject: string; message: string; committedAt: string; paths: string[] }[] };
        return { ...data, commits: [...data.commits, ...Array.from({ length: 4 }, (_, index) => ({ hash: String(index + 1).repeat(40), subject: `Extra recorded commit ${index + 1}`, message: `Extra recorded commit ${index + 1}`, committedAt: '2026-10-25T00:00:00Z', paths: [] }))] };
      }
      return result;
    };
  });
  await mountDesktopVault(page);
  await page.goto('/en/changes/?guides=off');
    await page.getByTestId('briefing-mixed').click();
  const recent = page.getByTestId('briefing-recent-originals');
  const originalRow = recent.getByRole('button', { name: /Extra recorded commit 3/ });
  await expect(originalRow).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __releaseSavedPr?: () => void }).__releaseSavedPr)).toBe('function');
  await originalRow.click();
  await page.evaluate(() => (window as unknown as { __releaseSavedPr: () => void }).__releaseSavedPr());
  await expect(page.getByText('Saved PRs · latest GitHub content unchecked')).toBeVisible();
  await page.getByTestId('briefing-original').getByRole('button', { name: 'Back to overview', exact: true }).first().click();
  await expect(originalRow).toBeVisible();
  await expect(originalRow).toBeFocused();
  await expect(page.getByText('PR lookup incomplete', { exact: true })).toBeVisible();
  await expect(page.getByText('This PR could not be tied to the selected history.', { exact: false })).toBeVisible();
});

test('shows incomplete lookup and unlinked PR gaps together for a fresh lookup', async ({ page }) => {
  await installBriefingRuntime(page);
  await page.addInitScript(() => {
    const runtime = window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } };
    const invoke = runtime.__TAURI_INTERNALS__.invoke;
    runtime.__TAURI_INTERNALS__.invoke = async (command, args) => command === 'git_briefing_pull_descriptions'
      ? { status: 'partial', repository: 'owner/repo', unchecked: 1, uncheckedCommits: ['d'.repeat(40)], unlinked: 1, descriptions: [] }
      : invoke(command, args);
  });
  await mountDesktopVault(page);
  await page.goto('/en/changes/?guides=off');
    await page.getByTestId('briefing-mixed').click();
  await page.getByRole('button', { name: 'Read GitHub PR descriptions', exact: true }).click();
  await expect(page.getByText('PR lookup incomplete', { exact: true })).toBeVisible();
  await expect(page.getByText('This PR could not be tied to the selected history.', { exact: false })).toBeVisible();
});

test('keeps recorded originals reachable across the responsive overview', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const rampNames = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
  const results: unknown[] = [];
  for (const width of [390, 600, 768, 834, 1024, 1440, 1920, 2560]) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', isMobile: width <= 768, hasTouch: width <= 768 });
    const page = await context.newPage();
    await installBriefingRuntime(page);
    await mountDesktopVault(page);
    await page.goto('/en/changes/?guides=off');
    await page.getByTestId('briefing-mixed').click();
    await expect(page.getByTestId('briefing-recent-originals')).toBeVisible();
    await page.setViewportSize({ width, height: 900 });
    await page.addStyleTag({ content: FREEZE_CSS });
    const result = await auditPage(page, { width, rampNames, scope: 'main' });
    results.push({ width, ...result });
    expect(shouldFail([result]), JSON.stringify(result.findings)).toBe(false);
    if (width === 1024) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      const enlarged = await auditPage(page, { width, rampNames, scope: 'main' });
      results.push({ width, textScale: 2, ...enlarged });
      expect(shouldFail([enlarged]), JSON.stringify(enlarged.findings)).toBe(false);
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    }
    if (process.env.ATLAS_BRIEFING_OVERVIEW_PROOF) {
      mkdirSync(process.env.ATLAS_BRIEFING_OVERVIEW_PROOF, { recursive: true });
      await page.screenshot({ path: `${process.env.ATLAS_BRIEFING_OVERVIEW_PROOF}/overview-${width}.png` });
    }
    await context.close();
  }
  if (process.env.ATLAS_BRIEFING_OVERVIEW_PROOF) writeFileSync(`${process.env.ATLAS_BRIEFING_OVERVIEW_PROOF}/responsive.json`, JSON.stringify(results, null, 2));
});
