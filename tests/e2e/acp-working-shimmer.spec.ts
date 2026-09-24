import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { openFolderFromFirstRun } from './open-folder';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **Work in flight moves; work that landed is still** (owner, 2026-09-24).
 *
 * While the agent worked, a running tool row and the composer's 「thinking · 25s」 were the same
 * static grey as a finished transcript. The class assertions in `AcpChatPanel.test.tsx` prove which
 * element carries `.acp-working-shimmer`; they cannot prove the browser actually animates it, that
 * the band is painted through the glyphs, or that reduced motion takes it away. This measures the
 * computed style in a real engine instead, on the protocol-level ACP harness the library specs use.
 */
async function open(page: Page) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  const chat = page.getByTestId('acp-chat-panel');
  await chat.getByRole('textbox').fill('Which pages went stale?');
  await page.getByTestId('acp-chat-send').click();
  await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
  await harness.read(page);
  await expect(chat.locator('[data-acp-entry="tool"] [data-tool-running]')).toBeVisible();
  return harness;
}

/** What the engine paints on a piece of text, read fresh. */
const ink = (page: Page, selector: string) => page.evaluate((selector) => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    animationName: style.animationName,
    backgroundImage: style.backgroundImage,
    backgroundClip: style.backgroundClip || style.getPropertyValue('-webkit-background-clip'),
    fill: style.getPropertyValue('-webkit-text-fill-color'),
    running: el.getAnimations().some((animation) => animation.playState === 'running'),
    position: style.backgroundPosition,
    duration: style.animationDuration,
    iterations: style.animationIterationCount,
  };
}, selector);

const LABEL = '[data-acp-entry="tool"] [data-tool-label-text]';
const OUTCOME = '[data-acp-entry="tool"] [data-testid="acp-chat-tool-outcome"]';
const STATUS = '[data-testid="acp-status-words"]';

test('a running call and the thinking status sweep, and the call stills once it lands', async ({ page }) => {
  const harness = await open(page);

  for (const selector of [LABEL, OUTCOME, STATUS]) {
    const live = await ink(page, selector);
    expect(live, selector).not.toBeNull();
    expect(live!.animationName, selector).toBe('acpWorkingShimmer');
    expect(live!.running, selector).toBe(true);
    expect(live!.backgroundImage, selector).toContain('linear-gradient');
    expect(live!.backgroundClip, selector).toBe('text');
    expect(live!.fill, selector).toBe('rgba(0, 0, 0, 0)');
  }
  // The band actually travels: two reads a frame-run apart see a different position.
  const first = (await ink(page, LABEL))!.position;
  await expect.poll(async () => (await ink(page, LABEL))!.position).not.toBe(first);

  await harness.wait(page);
  await expect(page.locator('[data-acp-entry="tool"]').first()).not.toHaveAttribute('data-tool-outcome', 'running');
  const landed = await ink(page, LABEL);
  expect(landed!.animationName).toBe('none');
  expect(landed!.backgroundImage).toBe('none');
  expect(landed!.running).toBe(false);

  // The harness's next call is a write that stops on a permission request. It is still open, but
  // the work is in the person's hands: no sweep, and it says it waits on them like the composer.
  const WAITING = '[data-acp-entry="tool"][data-tool-phase="awaiting"]';
  await expect(page.locator(WAITING)).toBeVisible();
  await expect(page.locator(`${WAITING} [data-testid="acp-chat-tool-outcome"]`)).toHaveText('Waiting for you');
  for (const selector of [`${WAITING} [data-tool-label-text]`, `${WAITING} [data-testid="acp-chat-tool-outcome"]`, STATUS]) {
    const waiting = await ink(page, selector);
    expect(waiting!.animationName, selector).toBe('none');
    expect(waiting!.running, selector).toBe(false);
    expect(waiting!.backgroundImage, selector).toBe('none');
  }
});

test('reduced motion keeps the running words still and plainly legible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  for (const selector of [LABEL, OUTCOME, STATUS]) {
    const still = await ink(page, selector);
    expect(still, selector).not.toBeNull();
    expect(still!.backgroundImage, selector).toBe('none');
    expect(still!.fill, selector).not.toBe('rgba(0, 0, 0, 0)');
    // The global rule reduces the loop to one 0.01ms pass. A read in the frame the row mounted
    // can still see that pass as playing, so it waits for the engine to retire it.
    expect(still!.duration, selector).toBe('1e-05s');
    expect(still!.iterations, selector).toBe('1');
    await expect.poll(async () => (await ink(page, selector))!.running, selector).toBe(false);
  }
  // The fact is still said without motion: the hollow ring and the present-tense word.
  await expect(page.locator('[data-acp-entry="tool"] [data-tool-running]')).toBeVisible();
  await expect(page.locator('[data-acp-entry="tool"]').first()).toHaveAttribute('data-tool-outcome', 'running');
});
