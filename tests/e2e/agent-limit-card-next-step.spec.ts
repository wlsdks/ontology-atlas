import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **The error card must not name an action it does not offer.**
 *
 * That rule is why Retry lives inside this card at all (owner, installed app, 2026-08-24:
 * *"if this is normal I still would not know what to do"*). The usage-limit sentence had quietly
 * broken it again — it ended 「until then pick another tool below and carry on」 while the footer
 * showed the tool's **name**, not a picker.
 *
 * ⚠️ **Both states are measured**, because the sentence is only wrong in one of them and a gate
 * that looked at the other would stay green forever. With one tool installed — the ordinary case,
 * and the one that hits a usage limit — there is nothing to pick; with two there is, and the
 * original sentence is right.
 */
const LIMIT_ERROR = 'session limit reached (429)';

async function openAtLimit(page: Page, tools: 1 | 2) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, {});
  await page.addInitScript((count) => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
    }).__TAURI_INTERNALS__;
    if (!internals) return;
    const original = internals.invoke.bind(internals);
    internals.invoke = async (command, args) => {
      if (command === 'acp_start') throw new Error('session limit reached (429)');
      const answer = await original(command, args);
      if (command !== 'acp_detect_runtimes' || count < 2) return answer;
      const found = answer as Array<Record<string, unknown>>;
      return [...found, { ...found[0], id: 'codex-acp', label: 'Codex', cliPath: '/opt/homebrew/bin/codex' }];
    };
  }, tools);
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  const card = page.getByTestId('acp-chat-error');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveAttribute('data-trouble', 'limit');
  return card;
}

test('with one tool it does not tell you to pick another, and names where to get one', async ({ page }) => {
  const card = await openAtLimit(page, 1);
  await expect(page.getByTestId('acp-chat-runtime'), 'there is no tool picker with one tool').toHaveCount(0);
  await expect(card).not.toContainText('pick another tool below');
  await expect(card).toContainText('the only tool set up here');
  // The next step it does name has to be a real destination, not the absent picker.
  await expect(card).toContainText('Agents');
  await expect(page.getByTestId('acp-chat-error-retry')).toBeVisible();
});

test('with two tools the picker is there, so the original sentence is the true one', async ({ page }) => {
  const card = await openAtLimit(page, 2);
  await expect(page.getByTestId('acp-chat-runtime'), 'two tools means a picker to choose between them').toHaveCount(1);
  await expect(card).toContainText('pick another tool below');
  await expect(card).not.toContainText('the only tool set up here');
});

test('the sentence is chosen by the same fact the picker is, not by the error text', async ({ page }) => {
  await openAtLimit(page, 1);
  const shown = await page.evaluate(() => ({
    picker: Boolean(document.querySelector('[data-testid="acp-chat-runtime"]')),
    label: (document.querySelector('[data-testid="acp-chat-runtime-label"]')?.textContent ?? '').trim(),
    controls: [...document.querySelectorAll('[data-testid="acp-chat-panel"] button')]
      .map((button) => button.getAttribute('data-testid'))
      .filter(Boolean),
  }));
  expect(shown.picker).toBe(false);
  expect(shown.label).not.toBe('');
  expect(shown.controls, 'nothing on this screen can switch tools').not.toContain('acp-chat-runtime');
});

test.afterEach(async ({ page }, info) => {
  if (info.status === 'failed') await page.screenshot({ path: info.outputPath('limit-card.png') });
});

test.describe(() => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for copy selection');
  test('the error is the limit one, so the fixture proves the branch it claims to', async ({ page }) => {
    const card = await openAtLimit(page, 1);
    await card.getByTestId('acp-chat-error-details').click();
    await expect(card).toContainText(LIMIT_ERROR);
  });
});
