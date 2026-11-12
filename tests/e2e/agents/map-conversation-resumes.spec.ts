import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

type HarnessWindow = { __atlasLibraryWorkHarness?: { snapshot: () => { calls: Array<{ method: string }> } } };

const methods = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls ?? []).map((call) => call.method),
  );

async function openMapChat(page: Page) {
  await page.goto('/en/topology/?guides=off');
  const door = page.getByTestId('topology-vault-agent-toggle');
  await expect(door, 'waiting for the map agent door').toBeVisible();
  await door.click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
}

test('the map reopens the conversation a person left for another screen', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, {
    pastSessions: [{ sessionId: 'library-acp-session', title: 'Earlier', updatedAt: '2026-09-20T00:00:00.000Z' }],
  });
  await openFolderFromFirstRun(page, 'en');

  await openMapChat(page);
  expect(await methods(page)).toContain('session/load');

  await page.goto('/en/library/?guides=off&e2e=1');
  await expect(page.getByTestId('library-workspace-wiki')).toBeVisible();

  await openMapChat(page);
  const after = await methods(page);
  expect(after).toContain('session/load');
  expect(after).not.toContain('session/new');
});
