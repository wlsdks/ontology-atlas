import { expect, test } from '@playwright/test';
import { setBriefingMode } from './change-briefing-fixture';
import { calls, chooseModel, enter, expectCoverage, openCoverage, prepare, readPrs } from './git-pr-briefing-helpers';

test('returns to the original when retry removes the rejected-response opener', async ({ page }) => {
  await enter(page); await prepare(page);
  await setBriefingMode(page, 'model-invalid');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-error')).toBeVisible();
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
  const original = page.getByTestId('briefing-original');
  await expect(original).toBeFocused();
  await page.getByRole('button', { name: 'Inspect the rejected response', exact: true }).click();
  await setBriefingMode(page, 'ready');
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  const dialog = page.getByTestId('briefing-coverage-dialog');
  await dialog.getByRole('button', { name: 'Retry part 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close coverage', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(original).toBeFocused();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await expect(original).toBeFocused();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(2);
});

async function prepareParts(page: import('@playwright/test').Page) {
  await enter(page);
  await setBriefingMode(page, 'batch');
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { capacity: number } }).__briefingProbe.capacity = 1800; });
  await page.getByRole('button', { name: 'Read again', exact: true }).click();
  await expectCoverage(page, '10 commit messages read');
  await prepare(page);
}

test('reads all fitting records once, then builds an overview from original passages', async ({ page }) => {
  await prepareParts(page);
  await page.getByRole('button', { name: 'Request details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('one at a time');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expectCoverage(page, 'All planned parts are finished.');
  const requests = await calls(page, 'source_briefing_chat');
  const overview = JSON.parse(String(requests.at(-1)!.args.packet));
  expect(overview.scope).toBe('overview-from-selected-original-passages');
  const reading = requests.slice(0, -1).map(request => JSON.parse(String(request.args.packet)));
  const ids = reading.flatMap(packet => packet.sources.map((source: { id: string }) => source.id));
  expect(ids).toHaveLength(11); expect(new Set(ids).size).toBe(11);
  expect(String(requests.at(-1)!.args.packet)).not.toContain('The author reports 131 passing tests.');
  expect(requests.every(request => (request.args.expectedCapacity as { inputByteLimit: number }).inputByteLimit === 1800)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __briefingProbe: { peak: number } }).__briefingProbe.peak)).toBe(1);
  await expectCoverage(page, '11 of 11 source records sent');
  await openCoverage(page);
  const parts = page.getByRole('combobox', { name: 'Read part explanations', exact: true });
  await parts.click();
  await parts.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByTestId('briefing-coverage-dialog')).toBeVisible();
  await expect(parts).toBeFocused();
  await parts.click();
  await page.getByRole('option', { name: /Commit notes.*Part 2 of/ }).click();
  await expect(page.locator('#git-briefing-title')).toContainText('Part 2 of');
  await chooseModel(page);
  await expect(page).toHaveURL(/tab=models/);
  await page.goBack();
  await expect(page.locator('#git-briefing-title')).toContainText('Part 2 of');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(requests.length);
});

test('keeps completed parts after stop and resumes without resending them', async ({ page }) => {
  await prepareParts(page);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { holdAt: number } }).__briefingProbe.holdAt = 2; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(2);
  await expectCoverage(page, '1 of');
  await expect(page.getByTestId('briefing-theme')).toBeVisible();
  const first = String((await calls(page, 'source_briefing_chat'))[0].args.packet);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect(page.getByRole('button', { name: 'Continue remaining parts', exact: true })).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(2);
  await page.getByRole('button', { name: 'Continue remaining parts', exact: true }).click();
  await expectCoverage(page, 'All planned parts are finished.');
  expect((await calls(page, 'source_briefing_chat')).filter(request => String(request.args.packet) === first)).toHaveLength(1);
});

test('retries only the overview after preserving every completed part', async ({ page }) => {
  await prepareParts(page);
  const parts = Number(await page.getByTestId('briefing-plan-requests').getAttribute('data-reading-parts'));
  await page.evaluate(number => { (window as unknown as { __briefingProbe: { failAt: number } }).__briefingProbe.failAt = number; }, parts + 1);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry overview', exact: true })).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(parts + 1);
  await page.getByRole('button', { name: 'Retry overview', exact: true }).click();
  await expectCoverage(page, 'All planned parts are finished.');
  const requests = await calls(page, 'source_briefing_chat');
  expect(requests).toHaveLength(parts + 2);
  expect(JSON.parse(String(requests.at(-1)!.args.packet)).scope).toBe('overview-from-selected-original-passages');
});

test('retains attributed old parts but requires a new plan when native capacity changes', async ({ page }) => {
  await prepareParts(page);
  await setBriefingMode(page, 'batch-stale');
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { failAt: number } }).__briefingProbe.failAt = 2; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare new plan', exact: true })).toBeVisible();
  await expect(page.locator('#git-briefing-title')).toHaveText('Explanation from the previous run');
  await expect(page.getByTestId('briefing-theme')).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(2);
  await expect(page.getByRole('button', { name: 'Continue remaining parts', exact: true })).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { capacity: number } }).__briefingProbe.capacity = 2000; });
  await page.getByRole('button', { name: 'Prepare new plan', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expectCoverage(page, 'All planned parts are finished.');
  expect(((await calls(page, 'source_briefing_chat'))[2].args.expectedCapacity as { inputByteLimit: number }).inputByteLimit).toBe(2000);
});

test('waits for an interrupted request to settle across a Models round trip before continuing', async ({ page }) => {
  await prepareParts(page);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { holdAt: number } }).__briefingProbe.holdAt = 2; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(2);
  await chooseModel(page);
  await expect(page).toHaveURL(/tab=models/);
  await page.goBack();
  await expect(page.getByTestId('briefing-narrative')).toContainText('Stopping the current request.');
  await expect(page.getByRole('button', { name: 'Continue remaining parts', exact: true })).toHaveCount(0);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(2);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await page.getByRole('button', { name: 'Continue remaining parts', exact: true }).click();
  await expectCoverage(page, 'All planned parts are finished.');
  expect(await page.evaluate(() => (window as unknown as { __briefingProbe: { peak: number } }).__briefingProbe.peak)).toBe(1);
});

for (const mode of ['pr-unavailable', 'pr-error', 'pr-rate-limited', 'pr-partial-failed']) {
  test(`keeps collected PR originals and the explanation after ${mode} on retry`, async ({ page }) => {
    await enter(page); await prepare(page);
    await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
    const theme = page.getByTestId('briefing-theme');
    await expect(theme).toContainText('53 ms and 57 ms');
    await setBriefingMode(page, mode);
    await readPrs(page);
    await expect.poll(() => calls(page, 'git_briefing_pull_descriptions').then(values => values.length)).toBe(2);
    await page.getByTestId('briefing-originals').click();
    const retry = page.getByRole('button', { name: /^(Read GitHub PR descriptions|Read latest PR descriptions)$/ });
    if (mode === 'pr-rate-limited') await expect(retry).toBeDisabled();
    else await expect(retry).toBeEnabled();
    await page.getByTestId('briefing-summary-mode').click();
    await expectCoverage(page, '1 PR descriptions read');
    await expectCoverage(page, 'Prepare a new plan before continuing.', true);
    const citation = theme.getByRole('button', { name: 'Read source Keep map navigation readable', exact: true }).first();
    await citation.click();
    await expect(page.getByTestId('briefing-original')).toContainText('Checks: 131 author-reported tests passed.');
    await page.getByTestId('briefing-original').getByRole('button', { name: 'Back to overview', exact: true }).first().click();
    await expect(citation).toBeFocused();
    expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
    if (mode === 'pr-rate-limited') return;
    await setBriefingMode(page, 'pr-empty');
    await readPrs(page);
    await expectCoverage(page, '0 PR descriptions read');
    await expectCoverage(page, 'Prepare a new plan before continuing.');
  });
}

test('explains GitHub rate limits and keeps local work available without automatic retries', async ({ page }) => {
  await page.clock.install();
  await enter(page);
  await setBriefingMode(page, 'pr-rate-limited');
  const read = page.getByRole('button', { name: /^(Read GitHub PR descriptions|Read latest PR descriptions)$/ });
  await read.click();
  await expect(read).toBeDisabled();
  await expect(page.locator('#git-pr-rate-limit')).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(read).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Summarize commit messages only', exact: true })).toBeEnabled();
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(1);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
});
