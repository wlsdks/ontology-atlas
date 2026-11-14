import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { installBriefingRuntime, setBriefingMode, startInBriefingMode } from './change-briefing-fixture';

const korean = (namespace: string) => JSON.parse(readFileSync(`messages/ko/${namespace}.json`, 'utf8'));
const GIT_READS = new Set(['git_change_briefing', 'git_source_briefing', 'git_briefing_repositories']);

async function open(page: Page, mode: string, locale = 'en') {
  await startInBriefingMode(page, mode);
  await installBriefingRuntime(page);
  await mountDesktopVault(page);
  await page.goto(`/${locale}/changes/?guides=off`);
}
async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { __briefingProbe: { calls: { command: string; args: Record<string, unknown> }[] } }).__briefingProbe.calls);
}

test('names the destination Changes in the rail and heading', async ({ page }) => {
  await open(page, 'digest', 'ko');
  const name = korean('navRail').changes;
  await expect(page.getByTestId('app-nav-rail').getByRole('link', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
});

test('opens a busy day on one number, at most eight groups that add up and only local Git reads', async ({ page }) => {
  await open(page, 'digest');
  const digest = page.getByTestId('change-digest');
  await expect(digest.getByRole('heading').first()).toHaveText('33');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  const groups = page.getByTestId('change-digest-groups').locator('[data-digest-group]');
  const names = await groups.evaluateAll(rows => rows.map(row => row.getAttribute('aria-label') ?? ''));
  expect(names.length).toBeLessThanOrEqual(8);
  expect(names.reduce((sum, name) => sum + Number(/(\d+) changes?$/.exec(name)?.[1]), 0)).toBe(33);
  expect(names[0]).toBe('map: 18 changes');
  expect(names.at(-1)).toBe('Other changes: 2 changes');
  await expect(page.getByTestId('change-digest-notable').getByRole('button')).toHaveText([/feat\(brand\): adopt Moru motions/, /docs: delete documents nobody reads/]);
  const commands = new Set((await calls(page)).map(call => call.command));
  expect([...commands].filter(command => !GIT_READS.has(command))).toEqual([]);
});

test('expands a group in place, opens a change original and returns to that row', async ({ page }) => {
  await open(page, 'digest');
  const map = page.getByRole('button', { name: 'map: 18 changes', exact: true });
  await map.click();
  await expect(map).toHaveAttribute('aria-expanded', 'true');
  const rows = page.getByRole('button', { name: /^Read the original: fix\(map\)/ });
  await expect(rows).toHaveCount(17);
  await expect(page.getByRole('link', { name: '결제 승인', exact: true })).toHaveAttribute('href', /\/topology\/\?p=/);
  const row = rows.nth(2);
  const title = (await row.getAttribute('title'))!;
  await row.click();
  await expect(page.getByRole('heading', { name: `Merge #3114: ${title}`, exact: true })).toBeVisible();
  await expect(page.getByTestId('change-digest')).toBeHidden();
  await page.locator('[data-commit-reader]').getByRole('button', { name: 'Back to summary', exact: true }).click();
  await expect(row).toBeFocused();
  await expect(map).toHaveAttribute('aria-expanded', 'true');
});

test('shows the readers for the same period in Originals and returns focus to Originals', async ({ page }) => {
  await open(page, 'digest');
  const range = await page.getByTestId('briefing-range').textContent();
  const originals = page.getByTestId('change-originals');
  await originals.click();
  await expect(page.getByTestId('briefing-prs')).toBeVisible();
  await expect(page.getByTestId('briefing-commits')).toBeVisible();
  await expect(page.getByTestId('briefing-source-browser')).toBeVisible();
  await expect(page.getByTestId('briefing-range')).toHaveText(range!);
  await page.getByTestId('change-back-to-summary').click();
  await expect(originals).toBeFocused();
  await expect(page.getByTestId('change-digest')).toBeVisible();
});

test('opens on the latest day with changes when today has none', async ({ page }) => {
  await open(page, 'digest-latest');
  await expect(page.getByTestId('change-digest').getByRole('heading').first()).toHaveText('33');
  const latest = new Date(); latest.setDate(latest.getDate() - 2);
  await expect(page.getByTestId('briefing-range')).toHaveText(new Intl.DateTimeFormat('en', { year: latest.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(latest));
});

test('offers the latest changes from an empty period the person chose', async ({ page }) => {
  await open(page, 'digest-latest');
  await expect(page.getByTestId('change-digest')).toBeVisible();
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByTestId('change-digest-empty')).toContainText('Nothing was merged in this period.');
  await expect(page.getByTestId('change-digest-groups')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to the latest changes', exact: true }).click();
  await expect(page.getByTestId('change-digest').getByRole('heading').first()).toHaveText('33');
});

test('says a partial read counted only the newest changes and still adds them up', async ({ page }) => {
  await open(page, 'digest-partial');
  await expect(page.getByTestId('change-digest-partial')).toHaveText('Only the newest 20 changes of this period were read. Choose a shorter period to see the rest.');
  await expect(page.getByTestId('change-digest').getByRole('heading').first()).toHaveText('20');
});

test('keeps the digest of the period shown when an older read answers late', async ({ page }) => {
  await open(page, 'digest');
  await expect(page.getByTestId('change-digest')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await setBriefingMode(page, 'digest-empty');
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByTestId('change-digest-empty')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release());
  await expect(page.getByTestId('change-digest-empty')).toBeVisible();
  await expect(page.getByTestId('change-digest')).toHaveCount(0);
});
