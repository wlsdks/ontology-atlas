import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **Every error card offers the thing its own sentence asks for.**
 *
 * The retry was added to the card on 2026-08-24 because five of the six kinds ended in 「press New
 * chat」 and New chat was a pencil glyph two hundred pixels away — *"if this is normal I still would
 * not know what to do"*. `launch` was deliberately left without a retry, and correctly: another
 * attempt at a start we already know cannot work teaches people to distrust the button.
 *
 * ⚠️ **What that left behind was the same dead end it had just closed.** Rendered for the first
 * time on 2026-09-20 (the harness could not fail a start until this round): the `launch` card told
 * the reader to check this tool's state on the Agents screen "on the left", and carried exactly one
 * control — the connection check, which the panel's own comment calls the row's *second* action. The only
 * action on the card was not the one the sentence asked for, and the screen it named had to be
 * found by hand. The direction was a guess too: the rail that holds Agents is hidden below `lg`.
 *
 * This is an end-to-end gate rather than a unit one because the error card is reached through a
 * failing start, which is a bridge fact, not a prop.
 */

/** Each message is the one `readAcpTrouble` classifies into that kind. */
const LAUNCH = 'spawn npx ENOENT';
const NETWORK = 'fetch failed: ECONNREFUSED';

async function openDockWithFailingStart(page: Page, startError: string) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { startError });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
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
});

test('a kind whose retry can work keeps the retry, and gets no door', async ({ page }) => {
  const card = await openDockWithFailingStart(page, NETWORK);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-trouble', 'network');
  await expect(card.getByTestId('acp-chat-error-retry')).toBeVisible();
  await expect(card.getByTestId('acp-chat-error-agents')).toHaveCount(0);
});

test('the door actually arrives at Agents', async ({ page }) => {
  const card = await openDockWithFailingStart(page, LAUNCH);
  await card.getByTestId('acp-chat-error-agents').click();
  await expect(page).toHaveURL(/\/en\/agents/);
});
