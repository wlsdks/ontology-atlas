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

test('selects a group, opens a change in its detail, then its original and returns to that row', async ({ page }) => {
  await open(page, 'digest');
  const map = page.getByRole('option', { name: 'map: 18 changes', exact: true });
  await expect(map).toHaveAttribute('aria-selected', 'true');
  const rows = page.locator('[data-digest-list="label:map"] [data-change-hash]');
  await expect(rows).toHaveCount(18);
  await expect(page.getByRole('link', { name: '결제 승인', exact: true }).first()).toHaveAttribute('href', /\/topology\/\?p=/);
  const row = rows.nth(2);
  const title = (await row.getAttribute('title'))!;
  await expect(row).not.toContainText('(map)');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  const detail = page.getByTestId('change-detail');
  await expect(detail).toHaveCount(1);
  await expect(detail).toContainText(/files? changed/);
  await detail.getByRole('button', { name: `Read commit: ${title}`, exact: true }).click();
  await expect(page.locator('[data-commit-reader]').getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByTestId('change-digest')).toBeHidden();
  await page.locator('[data-commit-reader]').getByRole('button', { name: 'Back to summary', exact: true }).click();
  await expect(row).toBeFocused();
  await expect(map).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('change-detail')).toHaveCount(1);
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('change-detail')).toHaveCount(0);
  await expect(row).toBeFocused();
  await row.click();
  await expect(detail).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('change-detail')).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('opens a change beside the whole list where the scope pane is wide, and under a shortened list where it is not', async ({ page }) => {
  await open(page, 'digest');
  const rows = page.locator('[data-digest-list="label:map"] [data-change-hash]');
  await expect(rows).toHaveCount(18);
  await page.setViewportSize({ width: 1512, height: 982 });
  await rows.nth(2).click();
  const detail = page.getByTestId('change-detail');
  await expect(detail).toBeVisible();
  const wide = await page.evaluate(() => {
    const list = document.querySelector('[data-digest-list="label:map"] [data-change-list]')!.getBoundingClientRect();
    const shown = document.querySelector('[data-testid="change-detail"]')!.getBoundingClientRect();
    return { listRight: list.right, listHeight: list.height, detailLeft: shown.left };
  });
  expect(wide.detailLeft).toBeGreaterThanOrEqual(wide.listRight);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => page.evaluate(() => {
    const list = document.querySelector('[data-digest-list="label:map"] [data-change-list]')!.getBoundingClientRect();
    const shown = document.querySelector('[data-testid="change-detail"]')!.getBoundingClientRect();
    return shown.top >= list.bottom && list.height < 18 * 40;
  })).toBe(true);
});

test('reads the kinds of work from commit types and adds them up to the headline', async ({ page }) => {
  await open(page, 'digest');
  const kinds = page.getByTestId('change-digest-headline').getByTestId('change-digest-kinds');
  await expect(kinds.locator('[data-digest-kind]')).toHaveCount(5);
  const counts = await kinds.locator('[data-kind-count]').allTextContents();
  expect(counts.reduce((sum, count) => sum + Number(count), 0)).toBe(33);
  await expect(kinds.locator('[data-digest-kind]').first()).toHaveAttribute('data-digest-kind', 'fix');
});

test('draws one timeline mark per change of a day, and pressing one selects its group and change', async ({ page }) => {
  await open(page, 'digest');
  const marks = page.getByTestId('change-digest-timeline').locator('[data-timeline-mark]');
  await expect(marks).toHaveCount(33);
  const mark = marks.nth(26);
  await expect(mark).toHaveAttribute('aria-label', '15:30: 1 change');
  await mark.focus();
  await expect(page.getByTestId('change-digest-timeline-readout')).toHaveText('15:30 · design(harness): tell guidance lines apart 2');
  await mark.click();
  await expect(page.getByRole('option', { name: 'harness: 3 changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  const row = page.locator(`[data-digest-list="label:harness"] [data-change-hash="${await mark.getAttribute('data-timeline-mark')}"]`);
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toBeFocused();
  await expect(page.getByTestId('change-detail')).toBeVisible();
});

test('keeps exactly one group selected without unfolding rows and moves the selection with arrow keys', async ({ page }) => {
  await open(page, 'digest');
  const digest = page.getByTestId('change-digest');
  await expect(digest).toBeVisible();
  await expect(digest.locator('[aria-expanded]')).toHaveCount(0);
  const listbox = page.getByTestId('change-digest-groups').getByRole('listbox');
  await expect(listbox.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
  await listbox.getByRole('option', { name: 'map: 18 changes', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(listbox.getByRole('option', { name: 'brand: 6 changes', exact: true })).toBeFocused();
  await expect(listbox.getByRole('option', { name: 'brand: 6 changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('change-digest-group').getByRole('heading')).toHaveText(/^brand\s*6$/);
  await page.keyboard.press('End');
  await expect(listbox.getByRole('option', { name: 'Other changes: 2 changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(listbox.getByRole('option', { name: 'map: 18 changes', exact: true })).toBeFocused();
  await expect(listbox.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
});

test('gives the notable cards in one row one height when their titles wrap differently', async ({ page }) => {
  await open(page, 'digest');
  const cards = page.getByTestId('change-digest-notable').locator('[data-notable-card]');
  await expect(cards).toHaveCount(2);
  await page.setViewportSize({ width: 900, height: 900 });
  const boxes = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect()).map(box => ({ top: box.top, height: box.height })));
  const titles = await cards.locator('[data-change-hash]').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(titles[0]).toBeGreaterThan(titles[1]);
  expect(boxes[1].top).toBe(boxes[0].top);
  expect(boxes[1].height).toBe(boxes[0].height);
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
