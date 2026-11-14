import { expect, test } from '@playwright/test';
import { waitForAnimationsDone, waitForBoxStill } from '../settle';
import { gotoOriginals, setBriefingMode } from './change-briefing-fixture';
import { calls, enter, expectCoverage, openCoverage, prepare, readPrs, reviewSummary } from './git-pr-briefing-helpers';

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

test('keeps progress and Stop reachable while reading Code', async ({ page }) => {
  await enter(page); await prepare(page);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { hold: boolean } }).__briefingProbe.hold = true; });
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await expect.poll(() => calls(page, 'source_briefing_chat').then(values => values.length)).toBe(1);
  await page.getByRole('button', { name: 'Back to pull requests' }).click();
  await page.getByTestId('briefing-source-browser').click();
  await expect(page.getByTestId('briefing-code-heading')).toBeVisible();
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await expect(stop).toBeVisible();
  await expect(page.getByTestId('briefing-narrative')).not.toContainText('This period explanation is partial.');
  await stop.click();
  await expect.poll(() => calls(page, 'llm_chat_cancel').then(values => values.length)).toBe(1);
  await page.evaluate(() => { (window as unknown as { __briefingProbe: { release: () => void } }).__briefingProbe.release(); });
  await expect(stop).toHaveCount(0);
  await expect(page.getByTestId('briefing-code-heading')).toBeVisible();
  await page.getByTestId('briefing-mixed').click();
  await expect(page.getByTestId('briefing-period-run')).toContainText('Summary stopped');
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
  await gotoOriginals(page, '/ko/changes/?guides=off');
  await page.getByTestId('briefing-mixed').click();
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
