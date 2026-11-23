import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

/**
 * The agent's own `usage_update` reaches the rail, the composer and the mapping row; nothing
 * shows before it arrives. The shapes are what `claude-agent-acp` 0.110.0 sends.
 */

const projectNote = `---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n\n## Uncertainty\n\n- Not mapped yet: 3 of 9 areas, 96 of 120 abilities.\n`;

type HarnessWindow = { __atlasLibraryWorkHarness?: { usage(fields: Record<string, unknown>): void } };

const COPY = {
  en: { footer: '88% of 5-hour limit', limit: '88% used', row: 'Your 5-hour limit is at 88%; this run may reach it.' },
  ko: { footer: '5시간 한도 88%', limit: '88% 사용', row: '5시간 한도를 88% 썼어요. 이 작업 중에 한도에 닿을 수 있어요.' },
} as const;

async function openMapConversation(page: Page, locale: keyof typeof COPY) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: { 'project.md': projectNote } });
  await openFolderFromFirstRun(page, locale);
  await page.goto(`/${locale}/topology/?guides=off`);
  await page.getByTestId('topology-vault-agent-toggle').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
}

async function reportUsage(page: Page) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  await page.evaluate((resetSeconds) => {
    const harness = (window as unknown as HarnessWindow).__atlasLibraryWorkHarness;
    harness?.usage({
      used: 42_180,
      size: 200_000,
      _meta: {
        '_claude/rateLimit': {
          status: 'allowed_warning',
          rateLimitType: 'five_hour',
          utilization: 0.88,
          resetsAt: resetSeconds.fiveHour,
          unifiedWindows: { seven_day: { utilization: 0.42, resetsAt: resetSeconds.weekly, status: 'allowed' } },
        },
      },
    });
    harness?.usage({ used: 42_180, size: 200_000, cost: { amount: 0.4213, currency: 'USD' } });
  }, { fiveHour: nowSeconds + 3 * 3_600, weekly: nowSeconds + 50 * 3_600 });
}

const tile = (page: Page) => page.getByTestId('app-nav-rail-utility-tier').getByTestId('agent-usage-tile');
const popover = (page: Page) => page.getByTestId('agent-usage-popover');

for (const locale of ['en', 'ko'] as const) {
  test(`the agent's reported usage reaches the rail, the composer and the mapping row (${locale})`, async ({ page }) => {
    await openMapConversation(page, locale);
    await expect(tile(page), 'nothing shows before the agent reports').toHaveCount(0);
    await expect(page.getByTestId('acp-chat-limit-near')).toHaveCount(0);

    await reportUsage(page);
    await expect(tile(page)).toBeVisible();
    await expect(page.getByTestId('agent-usage-ring-fiveHour')).toHaveAttribute('data-level', 'warning');
    await expect(page.getByTestId('acp-chat-limit-near')).toHaveText(COPY[locale].footer);
    await expect(page.getByTestId('mapping-run-limit')).toHaveText(COPY[locale].row);
    await expect(page.getByTestId('mapping-run-action')).toBeEnabled();

    for (const width of [1512, 1040]) {
      await page.setViewportSize({ width, height: width === 1512 ? 982 : 720 });
      await tile(page).click();
      await expect(popover(page)).toBeVisible();
      await expect(popover(page).getByTestId('agent-usage-limit').first()).toContainText(COPY[locale].limit);
      await expect(popover(page).getByTestId('agent-usage-cost')).toContainText('$0.42');
      await expect(popover(page), 'the agent is named as the composer names it').toContainText('Claude Agent');
      await expect(popover(page)).not.toContainText('claude-code');
      await page.waitForFunction(() => document.querySelector('[data-testid="agent-usage-popover"]')?.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running') ?? false);
      await page.screenshot({ path: test.info().outputPath(`agent-usage-${locale}-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(popover(page)).toHaveCount(0);
      await expect(tile(page)).toBeFocused();
    }
  });
}
