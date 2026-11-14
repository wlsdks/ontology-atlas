import { expect, test } from '@playwright/test';
import { waitForBoxStill } from '../settle';
import { openOriginals, setBriefingMode } from './change-briefing-fixture';
import { calls, enter, expectCoverage, prepare, readPrs } from './git-pr-briefing-helpers';

test('keeps saved-copy management available in an empty period without a remote read', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'empty');
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  await expect(page.getByTestId('briefing-status')).toBeVisible();
  await page.getByTestId('briefing-settings').click();
  await expect(page.getByRole('button', { name: 'Clear all saved PR copies', exact: true })).toBeVisible();
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
});

test('reopens saved originals after reload without network and keeps versions after failed refresh', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await openOriginals(page);
  await page.getByTestId('briefing-mixed').click();
  await expectCoverage(page, 'Opened 1 saved PR descriptions. GitHub has not been checked.');
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  await page.getByTestId('briefing-originals').click();
  const row=page.getByRole('button', { name: /Keep map navigation readable PR #2925/ });
  await expect(row).toContainText('Saved PR copy');
  await row.click();
  await expect(page.getByTestId('briefing-original')).toContainText('53 ms and 57 ms');
  await expect(page.getByTestId('briefing-original')).not.toContainText('2026-10-25T01:00:00Z');
  await expect(page.getByTestId('briefing-original')).toContainText('2026');
  await page.getByTestId('briefing-original').getByRole('button', { name: 'Back to source list', exact: true }).first().click();
  await expect(row).toBeFocused();
  await setBriefingMode(page,'pr-rate-limited');
  await readPrs(page);
  await expectCoverage(page, '1 PR descriptions read');
  await expect(row).toContainText('Saved PR copy');
  await page.reload();
  await openOriginals(page);
  await page.getByTestId('briefing-mixed').click();
  await expectCoverage(page, 'Opened 1 saved PR descriptions');
  expect(await calls(page,'git_briefing_pull_descriptions')).toHaveLength(0);
});

test('clears copies without a usable source and keeps open originals session-only', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByTestId('briefing-settings').click();
  await page.getByRole('button',{name:'Clear all saved PR copies',exact:true}).click();
  await expectCoverage(page, '1 PR descriptions read');
  await page.getByTestId('briefing-originals').click();
  await expect(page.getByRole('button',{name:/Keep map navigation readable PR #2925/})).toContainText('App-session copy');
  await setBriefingMode(page,'ungranted');
  await page.getByRole('button',{name:'Read again',exact:true}).click();
  await expect(page.getByTestId('briefing-status')).toBeVisible();
  await page.getByTestId('briefing-settings').click();
  await expect(page.getByRole('button',{name:'Clear all saved PR copies',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear all saved PR copies',exact:true}).click();
  expect(await calls(page,'git_briefing_clear_saved_pulls')).toHaveLength(2);
  expect(await calls(page,'source_briefing_chat')).toHaveLength(0);
  await page.reload();
  await openOriginals(page);
  await page.getByTestId('briefing-mixed').click();
  await expect(page.getByTestId('briefing-narrative')).toBeVisible();
  await expectCoverage(page, '1 PR descriptions read', true);
  expect(await calls(page,'git_briefing_pull_descriptions')).toHaveLength(0);
});

for (const mode of ['cache-unavailable', 'cache-unsupported', 'cache-save-failed']) {
  test(`keeps fresh original reading available when local copies fail: ${mode}`, async ({ page }) => {
    await enter(page);
    await setBriefingMode(page, mode);
    await page.getByRole('button', { name: 'Read again', exact: true }).click();
    await expect(page.getByTestId('briefing-narrative')).toBeVisible();
    await readPrs(page);
    await expectCoverage(page, '1 PR descriptions read');
    if (mode === 'cache-save-failed') {
      for (const view of ['briefing-summary-mode', 'briefing-originals']) {
        await page.getByTestId(view).click();
        await expect(page.getByRole('status').filter({ hasText: 'Could not update saved PR copies' })).toBeVisible();
      }
    }
    await page.getByTestId('briefing-originals').click();
    await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
    await expect(page.getByTestId('briefing-original')).toContainText('53 ms and 57 ms');
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  });
}

test('keeps measured empty results empty after restart and reports failed clearing truthfully', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await setBriefingMode(page,'cache-clear-failed');
  await page.getByTestId('briefing-settings').click();
  await page.getByRole('button',{name:'Clear all saved PR copies',exact:true}).click();
  await expect(page.getByTestId('briefing-saved-panel')).toContainText('Could not clear all saved PR copies');
  await page.reload();
  await openOriginals(page);
  await page.getByTestId('briefing-mixed').click();
  await expectCoverage(page, 'Opened 1 saved PR descriptions');
  await setBriefingMode(page,'pr-empty');
  await readPrs(page);
  await expectCoverage(page, '0 PR descriptions read');
  await page.reload();
  await openOriginals(page);
  await page.getByTestId('briefing-mixed').click();
  await page.getByTestId('briefing-originals').click();
  await expect(page.getByRole('button', { name: 'Read GitHub PR descriptions', exact: true })).toBeVisible();
  await expectCoverage(page, '1 PR descriptions read', true);
  expect(await calls(page,'git_briefing_pull_descriptions')).toHaveLength(0);
});

for (const action of ['manual-read', 'clear'] as const) {
  test(`does not reapply a held saved-original result after ${action}`, async ({ page }) => {
    await enter(page); await prepare(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('atlas-fixture-pr-copies')!);
      value.descriptions[0].title = 'Older saved original'; value.descriptions[0].digest = 'f'.repeat(64);
      localStorage.setItem('atlas-fixture-pr-copies', JSON.stringify(value));
    });
    await page.addInitScript(() => {
      const target = window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> }; __savedHeld: boolean; __savedReturned: boolean; __releaseSaved: () => void };
      const invoke = target.__TAURI_INTERNALS__.invoke; let first = true;
      target.__TAURI_INTERNALS__.invoke = async (command, args) => {
        const value = await invoke(command, args);
        if (command === 'git_briefing_saved_pull_descriptions' && first) {
          first = false; target.__savedHeld = true;
          await new Promise<void>(resolve => { target.__releaseSaved = resolve; }); target.__savedReturned = true;
        }
        return value;
      };
    });
    await page.reload();
    await openOriginals(page);
    await page.getByTestId('briefing-mixed').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __savedHeld: boolean }).__savedHeld)).toBe(true);
    if (action === 'manual-read') {
      await readPrs(page);
      await expectCoverage(page, '1 PR descriptions read');
    } else {
      await page.getByTestId('briefing-settings').click();
      await page.getByRole('button', { name: 'Clear all saved PR copies', exact: true }).click();
      await expect(page.getByTestId('briefing-saved-panel')).toContainText('Saved PR copies cleared.');
    }
    await page.evaluate(() => (window as unknown as { __releaseSaved: () => void }).__releaseSaved());
    await expect.poll(() => page.evaluate(() => (window as unknown as { __savedReturned: boolean }).__savedReturned)).toBe(true);
    await waitForBoxStill(page.getByTestId('briefing-narrative'));
    if (action === 'clear') {
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await expect(page.getByTestId('briefing-settings-dialog')).toHaveCount(0);
    }
    await page.getByTestId('briefing-originals').click();
    await expect(page.getByTestId('briefing-narrative')).not.toContainText('Older saved original');
    if (action === 'manual-read') await expect(page.getByRole('button', { name: /Keep map navigation readable PR #2925/ })).toBeVisible();
    else await expectCoverage(page, '1 PR descriptions read', true);
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  });
}

test('opens settings by keyboard and returns focus without clearing copies', async ({ page }) => {
  await enter(page);
  const trigger = page.getByTestId('briefing-settings');
  await trigger.focus(); await trigger.press('Enter');
  const dialog = page.getByTestId('briefing-settings-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close settings', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await calls(page, 'git_briefing_clear_saved_pulls')).toHaveLength(0);
});
