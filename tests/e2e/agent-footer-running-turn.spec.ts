import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { openFolderFromFirstRun } from './open-folder';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **Nothing on the composer footer is drawn over anything else while a turn runs.**
 *
 * Measured on the rendered footer, 2026-09-19. A running turn puts the Stop chip on the right-hand
 * group, which takes it to 215 of the 228 pixels the footer has at the panel's documented minimum.
 * The picker row was left with nine, and the picker inside it does not shrink below its floor, so
 * it drew **on top of the status word**: three of five probe points over the status came back as
 * the picker or its chevron.
 *
 * ⚠️ The footer's `scrollWidth` equalled its `clientWidth` the whole time. Nothing measuring
 * rectangles would have seen this — occlusion is not geometry, so every visible piece is probed
 * with `elementFromPoint` across its own box.
 */
const MIN = 320;
const BELOW_FIT = 380;
const FITS = 400;

async function open(page: Page, width: number, locale: 'en' | 'ko') {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript((stored) => {
    window.localStorage.setItem('atlas.acp-chat.width', String(stored));
  }, width);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, locale);
  await page.goto(`/${locale}/library/?guides=off&e2e=1`);
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  return harness;
}

async function startTurn(page: Page, harness: Awaited<ReturnType<typeof installLibraryWorkHarness>>) {
  const chat = page.getByTestId('acp-chat-panel');
  await chat.getByRole('textbox').fill('Which pages went stale?');
  await page.getByTestId('acp-chat-send').click();
  await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
  await harness.read(page);
  await page.waitForTimeout(900);
}

/** Every visible piece of the footer, and what is actually painted on top of it. */
const covered = (page: Page) => page.evaluate(() => {
  const footer = document.querySelector('[data-testid="acp-chat-footer"]') as HTMLElement;
  return [...footer.querySelectorAll<HTMLElement>('[data-testid], [data-acp-status-badge]')]
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .flatMap((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return [];
      const name = el.getAttribute('data-testid') ?? 'status';
      const over = [0.15, 0.35, 0.5, 0.65, 0.85]
        .map((across) => document.elementFromPoint(
          Math.round(rect.left + rect.width * across),
          Math.round(rect.top + rect.height / 2),
        ))
        .filter((top) => !(top && (el.contains(top) || top.contains(el))))
        .map((top) => top?.getAttribute('data-testid') ?? top?.tagName ?? 'none');
      return over.length > 0 ? [{ name, over }] : [];
    });
});

const modeWordIsWhole = (page: Page) => page.evaluate(() => {
  const trigger = document.querySelector('[data-testid="acp-chat-mode"]');
  if (!trigger) return null;
  const label = [...trigger.querySelectorAll('span')].find((span) => span.scrollWidth > 0);
  return label ? label.scrollWidth <= label.clientWidth + 1 : null;
});

for (const locale of ['en', 'ko'] as const) {
  for (const width of [MIN, BELOW_FIT]) {
    test(`a running turn covers nothing at ${width} (${locale})`, async ({ page }) => {
      const harness = await open(page, width, locale);
      await startTurn(page, harness);
      const clashes = await covered(page);
      expect(
        clashes,
        `these footer pieces are drawn over: ${clashes.map((c) => `${c.name} by ${c.over.join('/')}`).join(', ')}`,
      ).toEqual([]);
      // It yielded rather than overlapping, and it is gone rather than clipped.
      await expect(page.getByTestId('acp-chat-mode')).toBeHidden();
      await expect(page.getByTestId('acp-chat-stop')).toBeVisible();
    });
  }

  /*
   * ⚠️ **Whole or absent — never a cut word.** The first version of this asserted the mode is
   * *visible* at 400 and whole there, and 400 was a width measured on macOS. On the CI runner the
   * same Korean words lay out wider, so the picker stayed on the row and clipped, and the case
   * failed on its first run and both retries — deterministic, not flaky, and pointing at a real
   * guarantee dressed up as a pixel. The guarantee is that a person never reads a truncated mode
   * name; which side of the threshold a given width falls on is a layout decision, not a promise.
   */
  test(`the mode is whole or stands down, never clipped, while a turn runs (${locale})`, async ({ page }) => {
    const harness = await open(page, FITS, locale);
    await startTurn(page, harness);
    expect(await covered(page)).toEqual([]);
    const mode = page.getByTestId('acp-chat-mode');
    if (await mode.isVisible()) {
      expect(await modeWordIsWhole(page), 'the mode showed a cut word instead of standing down').toBe(true);
    } else {
      await expect(page.getByTestId('acp-chat-stop'), 'the mode stood down, so the stop control has the row').toBeVisible();
    }
  });

  test(`the mode is there at the minimum width while nothing is running, and comes back when the turn ends (${locale})`, async ({ page }) => {
    const harness = await open(page, MIN, locale);
    // The promise the runtime name already yields to keep: idle, the picker says its whole word.
    await expect(page.getByTestId('acp-chat-mode')).toBeVisible();
    expect(await modeWordIsWhole(page)).toBe(true);

    await startTurn(page, harness);
    await expect(page.getByTestId('acp-chat-mode')).toBeHidden();

    await harness.answer(page, 'Only the architecture page is stale.');
    await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
    await expect(page.getByTestId('acp-chat-mode')).toBeVisible();
    expect(await modeWordIsWhole(page), 'it came back cut').toBe(true);
  });
}
