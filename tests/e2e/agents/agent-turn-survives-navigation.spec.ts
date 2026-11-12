import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

type HarnessWindow = { __atlasLibraryWorkHarness?: { snapshot: () => { calls: Array<{ method: string }> } } };

const sessionStarts = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls ?? [])
      .map((call) => call.method)
      .filter((method) => method === 'session/new' || method === 'session/load').length,
  );

async function openMapChat(page: Page) {
  const door = page.getByTestId('topology-vault-agent-toggle');
  await expect(door, 'waiting for the map agent door').toBeVisible();
  await door.click();
  await expect(page.getByTestId('acp-chat-panel')).toBeVisible();
}

test('an answer still being written survives a visit to another screen', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/topology/?guides=off');

  await openMapChat(page);
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await chat.getByRole('textbox').fill('Which pages went stale?');
  await page.getByTestId('acp-chat-send').click();
  await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
  expect(await sessionStarts(page)).toBe(1);

  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library\//);
  await expect(page.locator('[data-kept-agent-parking] [data-testid="acp-chat-panel"]')).toHaveCount(1);
  const filler = Array.from({ length: 80 }, (_, index) => `Checked page ${index + 1}.`).join('\n\n');
  await harness.answer(page, `${filler}\n\nTwo pages went stale while you were away.`);

  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page).toHaveURL(/\/topology\//);
  await openMapChat(page);
  await expect(chat).toContainText('Which pages went stale?');
  await expect(chat.getByText('Two pages went stale while you were away.')).toBeInViewport();
  expect(await sessionStarts(page)).toBe(1);
});

test('a conversation at rest is not kept running after its screen is left', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/topology/?guides=off');

  await openMapChat(page);
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library\//);
  await expect(page.locator('[data-kept-agent-parking] [data-testid="acp-chat-panel"]')).toHaveCount(0);
});
