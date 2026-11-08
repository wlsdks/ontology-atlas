import { expect, test } from '@playwright/test';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

for (const locale of ['en', 'ko']) {
  test(`local permission profiles stay absent and unsolicited moves are stated (${locale})`, async ({ page }) => {
    const harness = await installLibraryWorkHarness(page, {
      runtimeId: 'codex-acp', currentModeId: 'permission-profile:local',
      modes: [
        { id: 'read-only', name: 'Read-only' },
        { id: 'permission-profile:local', name: 'Local write profile' },
        { id: 'workspace-write', name: 'Workspace access' },
      ],
    });
    await openFolderFromFirstRun(page, locale);
    await page.goto(`/${locale}/library/?guides=off&e2e=1`);
    await page.getByTestId('library-workspace-wiki').click();
    await page.getByTestId('library-open-conversation').click();
    await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
    await page.getByTestId('acp-chat-mode').click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).not.toContainText('Local write profile');
    await page.keyboard.press('Escape');
    await harness.moveMode(page, 'permission-profile:local');
    const notice = page.locator('[data-notice="profile-mode-moved"]');
    await expect(notice).toContainText('permission-profile:local');
    await expect(notice).toContainText(locale === 'en' ? 'has not verified' : '확인하지 못했어요');
    await page.getByTestId('acp-chat-mode').click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.getByRole('option').click();
    const calls = (await harness.snapshot(page)).calls.filter(call => call.method === 'session/set_mode');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call.params).toMatchObject({ params: { modeId: 'read-only' } });
  });
}
