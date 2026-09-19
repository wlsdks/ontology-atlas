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
 *
 * ## One opening per width, not three (2026-09-20)
 *
 * The three rules used to be three tests per width, so the same heavy opening — seed, harness,
 * `/docs/`, open the folder, `/library/`, the wiki workspace, the conversation, ready — ran
 * thirty times to prove ten rows. A peer session measured what that cost the fleet: on a loaded
 * runner the shard this file sits in reached the thirty-minute step ceiling twice, killing two
 * landings without one failing assertion. The rules are all about **the same row in the same
 * state**, so they are asserted from one opening, softly, and a row that breaks two rules still
 * reports both.
 *
 * ⚠️ **Every wait here is explicit, and that is the point.** `playwright.config.ts` sets no
 * `actionTimeout`, so a bare `click()` on an element that never arrives waits until the sixty
 * second **test** timeout — the failure the peer measured was exactly 1.0 minute every time,
 * with no line saying which step hung, and the same case then passed in under two seconds. An
 * `expect(...).toBeVisible()` before each press fails in fifteen seconds naming the step it was
 * waiting for. Never replace one of these with a bare press.
 *
 * ## Which deliberate break reddens which rule (probed 2026-09-20)
 *
 * Worth writing down, because the obvious break does **not** work: restoring the picker's old
 * `basis-0 flex-1` in place of its `min-w-[3rem]` floor leaves all ten cases green. Below the
 * threshold the runtime name has already stood down, so the picker is alone on its row and
 * cannot be squeezed; above it the name's `shrink-[99]` makes the name yield first. The picker's
 * own floor is no longer what holds rule 1.
 *
 * | Rule | The break that reddens it | Measured |
 * |---|---|---|
 * | The picker says its whole word | drop the runtime name's `shrink-[99]` **and** show it below the threshold | `22px of a 40px word` (en), `30px of a 60px word` (ko) at 320 |
 * | The name stands down | drop the `@min-[286px]/composer:inline` gate | red at 320, 360, 370 in both locales |
 *
 * So rule 1 guards `shrink-[99]`, not the picker's width class. Anyone narrowing this sweep
 * should re-run those two breaks rather than trusting that a green run means it is still armed.
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

/** One press, with the wait for it written down. See the header on why this is never a bare click. */
async function press(page: Page, locator: ReturnType<Page['getByTestId']>, step: string) {
  await expect(locator, `waiting for ${step}`).toBeVisible();
  await locator.click();
}

async function openDockAt(page: Page, width: number, locale: 'en' | 'ko') {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript((stored) => {
    window.localStorage.setItem('atlas.acp-chat.width', String(stored));
  }, width);
  const harness = await installLibraryWorkHarness(page, {});
  await page.goto(`/${locale}/docs/`);
  await press(page, page.getByRole('button', { name: /Open my folder|내 폴더 열기/i }), 'the open-folder door');
  await page.goto(`/${locale}/library/?guides=off&e2e=1`);
  await press(page, page.getByTestId('library-workspace-wiki'), 'the wiki workspace');
  await press(page, page.getByTestId('library-open-conversation'), 'the conversation');
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
    test(`the composer footer keeps its word, its name and its send at ${width} (${locale})`, async ({ page }) => {
      const harness = await openDockAt(page, width, locale);
      const chat = page.getByTestId('acp-chat-panel');

      // ── 1. The picker says its whole word ──────────────────────────────────────────────────
      const measured = await modeWordIsWhole(page);
      expect
        .soft(
          measured.whole,
          `the mode picker showed ${measured.shown}px of a ${measured.needed}px word at ${width} (${locale})`,
        )
        .toBe(true);

      // ── 2. The runtime name stands down, or is back whole ──────────────────────────────────
      const name = page.getByTestId('acp-chat-runtime-label');
      if (NAME_HIDDEN.includes(width)) {
        await expect
          .soft(name, `the runtime name should stand down at ${width} (${locale})`)
          .toBeHidden();
      } else {
        await expect
          .soft(name, `the runtime name should be back at ${width} (${locale})`)
          .toBeVisible();
        const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect
          .soft(clipped, `the runtime name was truncated at ${width} (${locale})`)
          .toBe(false);
      }

      /*
       * ── 3. Send stays on the row, with a live turn ─────────────────────────────────────────
       *
       * The old shape kept this row at `basis-0 flex-1` so a long option label could not push
       * send off the composer. Content-sizing it gives that job to `min-w-0` plus the default
       * shrink instead, so the promise is re-proved here rather than assumed — with a live turn,
       * so the Stop chip is standing beside send and the row is at its widest. This runs last
       * because it is the only part that changes the row it measures.
       */
      await chat.getByRole('textbox').fill('Which pages went stale?');
      await press(page, page.getByTestId('acp-chat-send'), 'the send press');
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
      expect.soft(fits.overflow, 'the footer row overflowed its own box').toBeLessThanOrEqual(1);
      expect.soft(fits.spill, 'send was pushed past the end of the footer row').toBeLessThanOrEqual(1);
      expect.soft(fits.sendWidth, 'send was squeezed below its own size').toBeGreaterThanOrEqual(28);
    });
  }
}
