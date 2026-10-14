import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness } from '../library-work-harness';

/** Each message is the one `readAcpTrouble` classifies into that kind. */
const LAUNCH = 'spawn npx ENOENT';
const NETWORK = 'fetch failed: ECONNREFUSED';

async function openDockWithFailingStart(page: Page, startError: string) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { startError });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  /*
   * ⚠️ **Opening a folder lands on the map, and the walk has to wait for it.** Navigating
   * straight to the Library raced the vault opening: on the static export the goto won often
   * enough that this spec failed in CI on a first-run gateway screen, three retries deep, with an
   * error naming `library-workspace-wiki` — an element that was never going to appear, because the
   * folder was not open yet. `library-compile-dock.spec.ts` already walks it this way.
   */
  await page.getByRole('heading', { name: 'Map', level: 1 }).waitFor({ timeout: 30_000 });
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  return page.getByTestId('acp-chat-error');
}

test('the card that cannot offer a retry offers the screen it names instead', async ({ page }) => {
  const card = await openDockWithFailingStart(page, LAUNCH);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-trouble', 'launch');

  const door = card.getByTestId('acp-chat-error-agents');
  await expect(door).toBeVisible();
  await expect(door).toHaveAttribute('href', /\/agents/);
  // Nothing is drawn over the door: it owns the point a person would press.
  expect(
    await door.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    }),
  ).toBe(true);

  // Still no retry, on purpose. The door replaces it; it does not join it.
  await expect(card.getByTestId('acp-chat-error-retry')).toHaveCount(0);

  // And the door actually arrives at Agents.
  await door.click();
  await expect(page).toHaveURL(/\/en\/agents/);
});

test('a kind whose retry can work keeps the retry, and gets no door', async ({ page }) => {
  const card = await openDockWithFailingStart(page, NETWORK);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-trouble', 'network');
  await expect(card.getByTestId('acp-chat-error-retry')).toBeVisible();
  await expect(card.getByTestId('acp-chat-error-agents')).toHaveCount(0);
});
