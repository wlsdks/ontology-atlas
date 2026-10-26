import { expect, test } from '@playwright/test';
import { waitForAnimationsDone, waitForBoxStill } from '../settle';
import { setBriefingMode } from './change-briefing-fixture';
import { calls, chooseModel, enter, expectCoverage, openCoverage, prepare, readPrs, reviewSummary } from './git-pr-briefing-helpers';

test('keeps reading modes exclusive and loads further originals into keyboard focus', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'source-pages');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
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
  await page.getByTestId('briefing-source-browser').click();
  await expect(sources).not.toBeVisible();
  await expect(page.getByTestId('briefing-ready')).toBeVisible();
  await page.getByTestId('briefing-originals').click();
  await expect(sources).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
  expect(await calls(page, 'git_briefing_pull_descriptions')).toHaveLength(0);
});

test('anchors modal choices during entry motion and dismisses them before the dialog', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enter(page); await prepare(page);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-theme')).toHaveCount(1);
  const samples = page.evaluate(() => new Promise<{ moving: number; maxDx: number; finalGap: number }>(resolve => {
    let moving = 0; let maxDx = 0; let steady = 0;
    function frame() {
      const dialog = document.querySelector('[data-testid="briefing-coverage-dialog"]');
      const trigger = dialog?.querySelector('[role="combobox"]');
      const list = dialog?.querySelector('[role="listbox"]');
      if (dialog && trigger && list) {
        const t = trigger.getBoundingClientRect(); const l = list.getBoundingClientRect();
        maxDx = Math.max(maxDx, Math.abs(t.left - l.left));
        if (getComputedStyle(dialog).transform !== 'none') { moving++; steady = 0; } else steady++;
        if (steady >= 4) {
          resolve({ moving, maxDx, finalGap: list.getAttribute('data-placement') === 'above' ? t.top - l.bottom : l.top - t.bottom });
          return;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  await openCoverage(page);
  const trigger = page.getByRole('combobox', { name: 'Read part explanations', exact: true });
  await trigger.focus(); await trigger.press('ArrowDown');
  const measured = await samples;
  expect(measured.moving).toBeGreaterThan(0);
  expect(measured.maxDx).toBeLessThan(3);
  expect(Math.abs(measured.finalGap - 4)).toBeLessThan(1);
  await trigger.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByTestId('briefing-coverage-dialog')).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => document.addEventListener('mousedown', event => {
    if ((event.target as Element).closest('[role="combobox"]')) event.preventDefault();
  }));
  await page.getByRole('button', { name: 'Close coverage', exact: true }).focus();
  await trigger.click();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByTestId('briefing-coverage-dialog')).toBeVisible();
  await trigger.press('Escape');
  await expect(page.getByTestId('briefing-coverage-dialog')).toHaveCount(0);
});

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

test('keeps progress and Stop reachable while reading Code', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(1);
  await page.getByTestId('briefing-source-browser').click();
  await expect(page.getByTestId('briefing-code-heading')).toBeVisible();
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await expect(stop).toBeVisible();
  await expect(page.getByTestId('briefing-narrative')).not.toContainText('This period explanation is partial.');
  await stop.click();
  await expect.poll(() => calls(page, 'llm_chat_cancel').then(values => values.length)).toBe(1);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect(stop).toHaveCount(0);
  await expect(page.getByTestId('briefing-period-run')).toContainText('Summary stopped');
  await expect(page.getByTestId('briefing-code-heading')).toBeVisible();
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
  await original.getByRole('button', { name: 'Back to summary', exact: true }).first().click();
  await expect(citation).toBeFocused();
  await citation.press('Enter');
  await expect(original).toBeVisible();
  await original.getByRole('button', { name: 'Read code changes for the whole period', exact: true }).click();
  await expect(page.getByTestId('briefing-source-browser')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('briefing-group-capabilities/checkout').click();
  await page.getByRole('button', { name: 'Read changed lines: src/features/checkout/service.ts', exact: true }).click();
  await expect(page.getByTestId('briefing-patch')).toContainText('+limit = 20');
});

test('rejects invented citations and keeps a stopped late answer out of the current period', async ({ page }) => {
  await enter(page); await prepare(page);
  await setBriefingMode(page, 'model-invalid');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-error')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect the rejected response', exact: true }).click();
  await expectCoverage(page, 'invented:p0');
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
  await expect(page.getByTestId('briefing-original')).toContainText('53 ms and 57 ms');
  await expect(page.getByTestId('briefing-theme')).toHaveCount(0);
  await setBriefingMode(page, 'ready');
  await reviewSummary(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(calls => calls.length)).toBe(2);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => calls(page, 'llm_chat_cancel').then(calls => calls.length)).toBe(1);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expectCoverage(page, 'Stopped after 0 of 1 parts.');
  await expect(page.getByTestId('briefing-theme')).toHaveCount(0);
});


test('can enrich a commit-only explanation with newly fetched PR descriptions', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Summarize commit messages only', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-theme')).toBeVisible();
  await readPrs(page);
  await expectCoverage(page, 'Prepare a new plan before continuing.');
  await reviewSummary(page);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-theme')).toContainText('53 ms and 57 ms');
  await page.getByTestId('briefing-originals').click();
  await page.getByTestId('briefing-originals').click();
  await expect(page.getByTestId('briefing-sources')).toContainText('Sent, but not explained');
  const request = (await calls(page, 'source_briefing_chat')).at(-1)!;
  expect(JSON.parse(String(request.args.packet)).coverage).toMatchObject({ collectedCommits: 2, collectedPrs: 1, excludedRecords: 0, prLookup: { status: 'measured', unchecked: 0 } });
});


test('invalidates a local explanation when empty PR lookup coverage changes', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'pr-unavailable');
  await readPrs(page);
  await page.getByRole('button', { name: 'Summarize commit messages only', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-theme')).toBeVisible();
  await setBriefingMode(page, 'pr-empty');
  await readPrs(page);
  await expectCoverage(page, 'Prepare a new plan before continuing.');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
});


test('explains an output-length failure without accepting the truncated explanation', async ({ page }) => {
  await enter(page); await prepare(page);
  await setBriefingMode(page, 'model-length');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect(page.getByTestId('briefing-error')).toHaveAttribute('data-briefing-error', 'incompleteAnalysis');
  await expect(page.getByTestId('briefing-theme')).toHaveCount(0);
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
  await expect(page.getByTestId('briefing-original')).toContainText('53 ms and 57 ms');
});


test('rejects an untranslated response in the Korean interface without losing originals', async ({ page }) => {
  await enter(page);
  await page.goto('/ko/changes/?guides=off');
  await page.getByRole('button', { name: 'GitHub PR 설명 읽기', exact: true }).click();
  await page.getByRole('button', { name: '요약 만들기', exact: true }).click();
  await page.getByRole('button', { name: '이 기간 설명 만들기', exact: true }).click();
  await expect(page.getByTestId('briefing-error')).toHaveAttribute('data-briefing-error', 'languageMismatch');
  await expect(page.getByTestId('briefing-theme')).toHaveCount(0);
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
  await expect(page.getByTestId('briefing-original')).toContainText('53 ms and 57 ms');
});


test('opens exact author validation instead of rendering a model misclassification', async ({ page }) => {
  await enter(page); await prepare(page);
  await setBriefingMode(page, 'model-mislabel-check');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const theme = page.getByTestId('briefing-theme');
  await expect(theme.getByTestId('briefing-check-records')).toBeVisible();
  await expect(theme).not.toContainText('native desktop checks');
  await theme.getByTestId('briefing-check-records').getByRole('button').first().click();
  await expect(page.getByTestId('briefing-original')).toContainText('Checks: 131 author-reported tests passed.');
  await expect(page.getByTestId('briefing-original')).not.toContainText('native desktop checks');
});


test('omits model classifications that cite completed changes as checks or open issues', async ({ page }) => {
  await enter(page); await prepare(page);
  await setBriefingMode(page, 'model-fixed-as-open');
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const theme = page.getByTestId('briefing-theme');
  await expect(theme).toContainText('Return controls stay visible beside panels.');
  await expect(theme).not.toContainText('still require a fix');
  await expect(theme).not.toContainText('prove validation');
  await expect(theme.getByTestId('briefing-limit-source')).toHaveCount(0);
  await expect(theme.getByTestId('briefing-check-source')).toHaveCount(0);
  await expectCoverage(page, 'Not explained:');
  await page.getByTestId('briefing-originals').click();
  await page.getByRole('button', { name: /Keep map navigation readable PR #2925/ }).click();
  await expect(page.getByTestId('briefing-original')).toContainText('53 ms and 57 ms');
});

async function prepareParts(page: import('@playwright/test').Page) {
  await enter(page);
  await setBriefingMode(page, 'batch');
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { capacity: number } }).__briefingProbe.capacity = 1800; });
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
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
    const back = original.getByRole('button', { name: 'Back to summary', exact: true }).last();
    await expect(back).toBeInViewport();
    await back.click();
    await expect(original).toBeHidden();
    await expect(citation).toBeFocused();
    await expect(citation).toBeInViewport();
  }
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

test('opens an accessible period preview and restores focus after closing it', async ({ page }) => {
  await enter(page);
  await readPrs(page);
  const trigger = page.getByRole('button', { name: 'Create summary', exact: true });
  for (const width of [1512, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Explain this period', exact: true })).toBeVisible();
    await waitForAnimationsDone(page.getByRole('dialog'));
    await waitForBoxStill(page.getByRole('dialog'));
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run(context: Document, options: unknown): Promise<{ passes: unknown[]; violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[] }> } }).axe;
      return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    });
    expect(result.passes.length, 'the open preview must apply a nonempty set of WCAG rules').toBeGreaterThanOrEqual(15);
    expect(result.violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, reason: node.failureSummary })) }))).toEqual([]);
    await page.getByRole('dialog').press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
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

for (const mode of ['model-post-audit', 'model-finalize-audit']) test(`does not claim no transmission after a post-response audit failure: ${mode}`, async ({ page }) => {
  await enter(page); await prepare(page);
  await setBriefingMode(page, mode);
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const error = page.getByTestId('briefing-error');
  await expect(error).toHaveAttribute('data-briefing-error', 'auditFailed');
  await expect(error).toContainText('This request may have been sent.');
  await expect(error).not.toContainText('No new analysis was sent');
  await expect(page.getByTestId('briefing-theme')).toHaveCount(0);
  await openCoverage(page);
  await expectCoverage(page, '3 delivery unconfirmed');
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
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
    await page.getByTestId('briefing-original').getByRole('button', { name: 'Back to summary', exact: true }).first().click();
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

test('keeps saved-copy management available in an empty period without a remote read', async ({ page }) => {
  await enter(page);
  await setBriefingMode(page, 'empty');
  await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
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
  await page.getByRole('button',{name:'Refresh briefing',exact:true}).click();
  await expect(page.getByTestId('briefing-status')).toBeVisible();
  await page.getByTestId('briefing-settings').click();
  await expect(page.getByRole('button',{name:'Clear all saved PR copies',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear all saved PR copies',exact:true}).click();
  expect(await calls(page,'git_briefing_clear_saved_pulls')).toHaveLength(2);
  expect(await calls(page,'source_briefing_chat')).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId('briefing-narrative')).toBeVisible();
  await expectCoverage(page, '1 PR descriptions read', true);
  expect(await calls(page,'git_briefing_pull_descriptions')).toHaveLength(0);
});

for (const mode of ['cache-unavailable', 'cache-unsupported', 'cache-save-failed']) {
  test(`keeps fresh original reading available when local copies fail: ${mode}`, async ({ page }) => {
    await enter(page);
    await setBriefingMode(page, mode);
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).click();
    await expect(page.getByTestId('briefing-narrative')).toBeVisible();
    await readPrs(page);
    await expectCoverage(page, '1 PR descriptions read');
    if (mode === 'cache-save-failed') {
      for (const view of ['briefing-summary-mode', 'briefing-source-browser', 'briefing-originals']) {
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
  await expectCoverage(page, 'Opened 1 saved PR descriptions');
  await setBriefingMode(page,'pr-empty');
  await readPrs(page);
  await expectCoverage(page, '0 PR descriptions read');
  await page.reload();
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


for (const [triggerId, dialogId] of [['briefing-coverage', 'briefing-coverage-dialog'], ['briefing-settings', 'briefing-settings-dialog']]) {
  test(`returns pointer-opened ${triggerId} to its opener`, async ({ page }) => {
    await enter(page);
    await page.evaluate(() => document.addEventListener('mousedown', event => {
      if ((event.target as Element).closest('button')) event.preventDefault();
    }));
    await page.getByRole('button', { name: 'Refresh briefing', exact: true }).focus();
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
