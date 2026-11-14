import { expect, test } from '@playwright/test';
import { waitForBoxStill } from '../settle';
import { setBriefingMode } from './change-briefing-fixture';
import { calls, chooseModel, enter, prepare, readPrs } from './git-pr-briefing-helpers';

test('keeps reading modes exclusive and loads further originals into keyboard focus', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'source-pages');
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  const summary = page.getByTestId('briefing-summary-mode');
  await summary.focus(); await summary.press('ArrowRight');
  const sources = page.getByTestId('briefing-sources');
  await expect(sources).toBeVisible();
  await expect(page.getByTestId('briefing-summary')).not.toBeVisible();
  await expect(page.getByTestId('briefing-ready')).not.toBeVisible();
  await sources.getByRole('button', { name: /Read \d+ more sources/ }).click();
  await expect(sources.locator('[data-control="row"]').nth(40)).toBeFocused();
  const next = sources.locator('[data-control="row"]').nth(44);
  const before = await next.evaluate(element => {
    const main = element.closest('main')!;
    main.scrollTop += element.getBoundingClientRect().top - 300;
    (element as HTMLElement).focus({ preventScroll: true });
    return { scroll: main.scrollTop, top: element.getBoundingClientRect().top };
  });
  await next.press('Enter');
  await expect(page.getByTestId('briefing-original')).toBeFocused();
  await page.getByTestId('briefing-original').getByRole('button', { name: 'Back to source list', exact: true }).first().click();
  await expect(next).toBeFocused();
  await expect.poll(() => next.evaluate(element => ({ scroll: element.closest('main')!.scrollTop, top: element.getBoundingClientRect().top }))).toEqual(before);
  await page.getByRole('button', { name: 'Back to pull requests' }).click();
  await page.getByTestId('briefing-source-browser').click();
  await expect(sources).not.toBeVisible();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
  await page.getByTestId('briefing-mixed').click();
  await page.getByTestId('briefing-originals').click();
  await expect(sources).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
});

test('returns from an original to its source-list entry before an explanation exists', async ({ page }) => {
  await enter(page);
  await readPrs(page);
  await page.getByTestId('briefing-originals').click();
  const entry = page.getByRole('button', { name: /Keep map navigation readable PR #2925/ });
  await entry.click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeFocused();
  await expect(page.getByTestId('briefing-theme')).toHaveCount(0);
  const back = original.getByRole('button', { name: 'Back to source list', exact: true });
  await expect(back).toHaveCount(2);
  await back.first().click();
  await expect(entry).toBeFocused();
  await expect(original).toHaveCount(0);
  await entry.press('Enter');
  await expect(original).toBeFocused();
  await back.last().click();
  await expect(entry).toBeFocused();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(1);
});

test('offers explicit PR reading, previews sources and opens exact originals from citations', async ({ page }) => {
  await enter(page);
  await expect(page.getByTestId('briefing-overview')).toHaveCount(0);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  await prepare(page);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Review text to send', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep map navigation readable', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('53 ms and 57 ms');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const theme = page.getByTestId('briefing-theme');
  await expect(theme).toContainText('53 ms and 57 ms against a 50 ms bar');
  await expect(page.locator('#git-briefing-title')).toBeFocused();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
  await chooseModel(page);
  await expect(page).toHaveURL(/tab=models/);
  await page.goBack();
  await expect(theme).toBeVisible();
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(1);
  const citation = theme.getByRole('button', { name: 'Read source Keep map navigation readable', exact: true }).first();
  await citation.click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeFocused();
  await expect(original).toContainText('Checks: 131 author-reported tests passed.');
  await original.getByRole('button', { name: 'Back to overview', exact: true }).first().click();
  await expect(citation).toBeFocused();
  await citation.press('Enter');
  await expect(original).toBeVisible();
  await original.getByRole('button', { name: 'Read code changes for the whole period', exact: true }).click();
  await expect(page.getByTestId('briefing-source-browser')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('+limit = 20');
});

test('keeps the original reader in focus when a waiting explanation finishes', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(1);
  await page.getByTestId('briefing-originals').click();
  const source = page.getByRole('button', { name: /Keep map navigation readable PR #2925/ });
  await source.click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeFocused();
  await waitForBoxStill(original);
  const readerTop = await original.evaluate(element => element.getBoundingClientRect().top);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect(page.getByTestId('briefing-theme')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await waitForBoxStill(original);
  await expect(original).toBeFocused();
  await expect(original).toBeInViewport();
  expect(Math.abs(await original.evaluate(element => element.getBoundingClientRect().top) - readerTop)).toBeLessThanOrEqual(1);
  await original.getByRole('button', { name: 'Back to source list', exact: true }).first().click();
  await expect(source).toBeFocused();
});

test('keeps the original in place when an explanation finishes at doubled text size', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
    (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true;
  });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(1);
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
  const original = page.getByTestId('briefing-original');
  await waitForBoxStill(original);
  const before = await original.evaluate(element => element.getBoundingClientRect().top);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await waitForBoxStill(original);
  await expect(original).toBeFocused();
  expect(Math.abs(await original.evaluate(element => element.getBoundingClientRect().top) - before)).toBeLessThanOrEqual(1);
});

test('offers a visible return at the end of a long original and restores its citation', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => {
    const runtime = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
    const invoke = runtime.invoke;
    runtime.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'git_briefing_pull_descriptions') {
        const response = result as { descriptions: { body: string }[] };
        response.descriptions[0].body += '\n\n## Original details\n\n' + Array.from({ length: 80 }, (_, index) => `Original inspection note ${index}: retain the full source context.`).join('\n');
      }
      return result;
    };
  });
  await prepare(page);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  for (const width of [1512, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const citation = page.getByTestId('briefing-theme').getByRole('button', { name: 'Read source Keep map navigation readable', exact: true }).first();
    await citation.click();
    const original = page.getByTestId('briefing-original');
    await expect(original).toBeFocused();
    await expect(original).toContainText('Original inspection note 79:');
    await original.locator('[data-source-passage]').last().evaluate(element => element.scrollIntoView({ block: 'end' }));
    await page.mouse.wheel(0, 160);
    const back = original.getByRole('button', { name: 'Back to overview', exact: true }).last();
    await expect(back).toBeInViewport();
    await back.click();
    await expect(original).toBeHidden();
    await expect(citation).toBeFocused();
    await expect(citation).toBeInViewport();
  }
});

test('does not apply old-run citation badges to new originals with reused positional IDs', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Summarize commit messages only', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-theme')).toBeVisible();
  await setBriefingMode(page, 'fresh-period');
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await expect(page.locator('#git-briefing-title')).toHaveText('Explanation from the previous run');
  await page.getByTestId('briefing-originals').click();
  const fresh = page.getByRole('button', { name: /^New period work/ });
  await expect(fresh).toContainText('99999999');
  await expect(fresh).not.toContainText('Cited in explanation');
  await fresh.click();
  await expect(page.getByTestId('briefing-original')).toContainText('A separately dated change.');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
});

for (const [triggerId, dialogId] of [['briefing-coverage', 'briefing-coverage-dialog'], ['briefing-settings', 'briefing-settings-dialog']]) {
  test(`returns pointer-opened ${triggerId} to its opener`, async ({ page }) => {
    await enter(page);
    await page.evaluate(() => document.addEventListener('mousedown', event => {
      if ((event.target as Element).closest('button')) event.preventDefault();
    }));
    await page.getByRole('button', { name: 'Read again', exact: true }).focus();
    const trigger = page.getByTestId(triggerId);
    await trigger.click();
    const dialog = page.getByTestId(dialogId);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
    expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
  });
}

for (const [triggerId, dialogId, closeName] of [
  ['briefing-coverage', 'briefing-coverage-dialog', 'Close coverage'],
  ['briefing-settings', 'briefing-settings-dialog', 'Close settings'],
]) {
  test(`keeps ${dialogId} in focus when the explanation finishes`, async ({ page }) => {
    await enter(page); await prepare(page);
    await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
    await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
    await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(1);
    const trigger = page.getByTestId(triggerId);
    await trigger.click();
    const dialog = page.getByTestId(dialogId);
    const close = dialog.getByRole('button', { name: closeName, exact: true });
    await expect(close).toBeFocused();
    await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
    await expect(page.getByTestId('briefing-theme')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await waitForBoxStill(dialog);
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
  });
}
