import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness, type LibraryWorkRuntimeId } from '../library-work-harness';

/** Each message is the one `readAcpTrouble` classifies into that kind. */
const LAUNCH = 'spawn npx ENOENT';
const NETWORK = 'fetch failed: ECONNREFUSED';
const AUTH = 'Failed to authenticate: OAuth session expired (authentication_failed)';

async function openDockWithFailingStart(page: Page, startError: string, runtimeId?: LibraryWorkRuntimeId) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { startError, runtimeId });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open (?:a|my) folder/i }).click();
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

// The harness's default runtime id is in no chat registry, so it stands for a tool the card does not know.
const SIGN_IN_REPAIR: ReadonlyArray<{ runtimeId?: LibraryWorkRuntimeId; hint: RegExp; command: RegExp | null }> = [
  { runtimeId: 'claude-acp', hint: /keychain entry/, command: /^security delete-generic-password/ },
  { runtimeId: 'codex-acp', hint: /codex login/, command: /^codex login$/ },
  { hint: /where you set it up/, command: null },
];

for (const { runtimeId, hint, command } of SIGN_IN_REPAIR) {
  test(`a sign-in trouble names the repair for ${runtimeId ?? 'an unknown tool'}`, async ({ page }) => {
    const card = await openDockWithFailingStart(page, AUTH, runtimeId);
    await expect(card).toHaveAttribute('data-trouble', 'auth');
    await expect(card).toContainText(hint);
    await card.getByTestId('acp-chat-error-details').click();
    const repair = card.getByTestId('acp-chat-auth-repair');
    if (command) await expect(repair).toHaveText(command);
    else await expect(repair).toHaveCount(0);
  });
}
