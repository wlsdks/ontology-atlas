import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **The composer footer's one rule: the picker never hides the choice it is naming.**
 *
 * Measured across the drag range on 2026-09-19, at the panel's own documented minimum the mode
 * picker's word box was fourteen pixels wide for a forty-pixel word in English and a sixty-pixel
 * one in Korean — `Ask first` rendered as `A…` — while the runtime name it shares the row with
 * was never truncated by a single pixel at any width. The picker was `basis-0 flex-1` and was
 * therefore served last.
 *
 * ⚠️ **This measures the widths where each state actually exists.** A width-conditional gate that
 * only ever measures one width is permanently green (the blind spot this repository recorded on
 * 2026-09-03). So the sweep covers the panel's documented minimum, the width either side of the
 * threshold, and the width the app's own smallest window opens at — in both locales, because the
 * Korean mode name is half again as wide as the English one and it is the Korean one that decides.
 */
/** The panel's own documented floor (`panel-width.ts`), where the clipping was worst. */
const CHAT_WIDTH_MIN = 320;
/**
 * The width that only Korean failed at. The Korean mode name is 60px against English's 40, so a
 * sweep written in English alone would have called this row healthy — and Korean is the locale
 * the owner reads it in.
 */
const KOREAN_ONLY_CLIP = 360;
const BELOW_THRESHOLD = 370;
const AT_THRESHOLD = 380;
const SMALLEST_WINDOW_DEFAULT = 436;

const NAME_HIDDEN = [CHAT_WIDTH_MIN, KOREAN_ONLY_CLIP, BELOW_THRESHOLD];
const NAME_SHOWN = [AT_THRESHOLD, SMALLEST_WINDOW_DEFAULT];
const EVERY_WIDTH = [...NAME_HIDDEN, ...NAME_SHOWN];

async function openDockAt(page: Page, width: number, locale: 'en' | 'ko') {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript((stored) => {
    window.localStorage.setItem('atlas.acp-chat.width', String(stored));
  }, width);
  const harness = await installLibraryWorkHarness(page, {});
  await page.goto(`/${locale}/docs/`);
  await page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }).click();
  await page.goto(`/${locale}/library/?guides=off&e2e=1`);
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  return harness;
}

/** Is the browser ellipsising the trigger's own label, rather than the label simply being short? */
async function modeWordIsWhole(page: Page): Promise<{ whole: boolean; shown: number; needed: number }> {
  return page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="acp-chat-mode"]');
    if (!trigger) throw new Error('the mode picker is not on the composer footer');
    const label = [...trigger.querySelectorAll('span')].find((span) => span.scrollWidth > 0);
    if (!label) throw new Error('the mode picker has no label to measure');
    return { whole: label.scrollWidth <= label.clientWidth + 1, shown: label.clientWidth, needed: label.scrollWidth };
  });
}

for (const locale of ['en', 'ko'] as const) {
  for (const width of EVERY_WIDTH) {
    test(`the mode picker says its whole word at ${width} (${locale})`, async ({ page }) => {
      await openDockAt(page, width, locale);
      const measured = await modeWordIsWhole(page);
      expect(
        measured.whole,
        `the mode picker showed ${measured.shown}px of a ${measured.needed}px word at ${width} (${locale})`,
      ).toBe(true);
    });
  }

  for (const width of EVERY_WIDTH) {
    /*
     * The old shape kept this row at `basis-0 flex-1` so a long option label could not push send
     * off the composer. Content-sizing it gives that job to `min-w-0` plus the default shrink
     * instead, so the promise is re-proved here rather than assumed — at every width, with a
     * live turn so the Stop chip is standing beside send and the row is at its widest.
     */
    test(`send stays on the row at ${width} (${locale})`, async ({ page }) => {
      const harness = await openDockAt(page, width, locale);
      const chat = page.getByTestId('acp-chat-panel');
      await chat.getByRole('textbox').fill('Which pages went stale?');
      await page.getByTestId('acp-chat-send').click();
      await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
      await harness.read(page);
      await expect(page.getByTestId('acp-chat-stop')).toBeVisible();
      const fits = await page.evaluate(() => {
        const footer = document.querySelector('[data-testid="acp-chat-footer"]') as HTMLElement;
        const send = document.querySelector('[data-testid="acp-chat-send"]') as HTMLElement;
        const row = footer.getBoundingClientRect();
        const button = send.getBoundingClientRect();
        return {
          overflow: Math.round(footer.scrollWidth - footer.clientWidth),
          spill: Math.round(button.right - row.right),
          sendWidth: Math.round(button.width),
        };
      });
      expect(fits.overflow, 'the footer row overflowed its own box').toBeLessThanOrEqual(1);
      expect(fits.spill, 'send was pushed past the end of the footer row').toBeLessThanOrEqual(1);
      expect(fits.sendWidth, 'send was squeezed below its own size').toBeGreaterThanOrEqual(28);
    });
  }

  for (const width of NAME_HIDDEN) {
    test(`the runtime name stands down at ${width} (${locale})`, async ({ page }) => {
      await openDockAt(page, width, locale);
      await expect(page.getByTestId('acp-chat-runtime-label')).toBeHidden();
    });
  }

  for (const width of NAME_SHOWN) {
    test(`the runtime name is back, whole, at ${width} (${locale})`, async ({ page }) => {
      await openDockAt(page, width, locale);
      const name = page.getByTestId('acp-chat-runtime-label');
      await expect(name).toBeVisible();
      const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clipped, `the runtime name was truncated at ${width} (${locale})`).toBe(false);
    });
  }
}
