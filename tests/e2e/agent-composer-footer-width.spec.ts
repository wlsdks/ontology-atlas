import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { openFolderFromFirstRun } from './open-folder';
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
/**
 * **What actually reddens each rule, measured rather than assumed (2026-09-20).**
 *
 * The obvious reversal does not work, and a green run from it would be misread as proof. Restoring
 * the mode picker's old `basis-0 flex-1` leaves every case green: below the threshold the runtime
 * name has already stood down, and above it the name's `shrink-[99]` makes the name yield first.
 *
 * | rule | what turns it red |
 * |---|---|
 * | the mode keeps its word | drop `shrink-[99]` from the runtime name **and** show the name below the threshold — 22px of a 40px word in English, 30px of a 60px word in Korean, at 320 |
 * | the name stands down | drop `@min-[286px]/composer:inline` from the runtime name (verified: two cases fail on `toBeHidden`) |
 *
 * Found by main-7-c2's gate probe and confirmed here on the second row.
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
  /*
   * ⚠️ **Each step waits by name.** `playwright.config.ts` sets a 60s test budget and no
   * `actionTimeout`, so a bare `.click()` on an element that never arrives waits out the whole
   * test — sixty seconds of a shard for one step, which is what the one-minute failures in CI
   * were. A visibility expectation first spends fifteen.
   *
   * It is **not** true that the bare press says nothing: Playwright's call log already names the
   * locator it waited for (`- waiting for getByTestId(...)`), as this repository's own CI output
   * shows. What the explicit wait buys is the cost and a sentence in the project's words — which
   * door this was — rather than a test-timeout stack. Corrected after main-6-a8 probed it both
   * ways; the first version of this comment claimed the failure was silent, and it is not.
   */
  await openFolderFromFirstRun(page, locale);
  await page.goto(`/${locale}/library/?guides=off&e2e=1`);
  const workspace = page.getByTestId('library-workspace-wiki');
  await expect(workspace, 'waiting for the wiki workspace').toBeVisible();
  await workspace.click();
  const conversation = page.getByTestId('library-open-conversation');
  await expect(conversation, 'waiting for the conversation door').toBeVisible();
  await conversation.click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  return harness;
}

/**
 * **Move the dock to a width without opening it again.**
 *
 * The dock publishes its width as `--library-agent-chat-width` and the panel is laid out from
 * that variable, so every question this file asks — truncation, hiding, overflow — is answered by
 * CSS from the box. Setting the variable moves the box.
 *
 * ## Why it is worth doing (measured 2026-09-19 and 2026-09-20)
 *
 * This file used to open the dock once per case: thirty cases, each a viewport, a seed, a harness,
 * two navigations and three clicks. Locally that is 2.6s each and fine. In CI it turned shard 1 of
 * 3 from its usual eleven minutes into **thirty**, with cases timing out at exactly 60s and then
 * passing on retry in 2.1s — and every one of those retries is another landing that has to be run
 * again. It broke this repository's own landings twice, on two different sessions' pull requests.
 *
 * One boot, then the sweep. The verdicts are unchanged; only the price is.
 */
async function moveDockTo(page: Page, width: number): Promise<number> {
  await page.evaluate((next) => {
    const dock = document.querySelector('[data-testid="library-agent-dock"]') as HTMLElement | null;
    dock?.style.setProperty('--library-agent-chat-width', `${next}px`);
  }, width);
  // One frame for layout, and the container queries that hang off it, to settle.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  return page.evaluate(() =>
    Math.round((document.querySelector('[data-testid="acp-chat-panel"]') as HTMLElement).getBoundingClientRect().width),
  );
}

/**
 * ⚠️ **A sweep that never moves is a sweep that always passes.**
 *
 * Every question this file asks is answered from the panel's own box. If the variable stopped
 * driving that box, the sweep would measure one width nine times and stay green for ever — the
 * shape this repository already records as "a gate with no subjects prints a pass". So each run
 * hands its measured widths here: distinct requests must have produced distinct boxes.
 */
function assertTheDockActuallyMoved(requested: readonly number[], measured: readonly number[]) {
  expect(
    new Set(measured).size,
    `the dock did not move: ${requested.length} widths produced ${new Set(measured).size} box(es) (${measured.join(', ')})`,
  ).toBe(new Set(requested).size);
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
  test(`the composer footer holds its words across the drag range (${locale})`, async ({ page }) => {
    await openDockAt(page, EVERY_WIDTH[0], locale);

    const boxes: number[] = [];
    for (const width of EVERY_WIDTH) {
      boxes.push(await moveDockTo(page, width));

      const measured = await modeWordIsWhole(page);
      expect(
        measured.whole,
        `the mode picker showed ${measured.shown}px of a ${measured.needed}px word at ${width} (${locale})`,
      ).toBe(true);

      const name = page.getByTestId('acp-chat-runtime-label');
      if (NAME_HIDDEN.includes(width)) {
        await expect(name, `the runtime name did not stand down at ${width} (${locale})`).toBeHidden();
      } else {
        await expect(name, `the runtime name did not come back at ${width} (${locale})`).toBeVisible();
        const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(clipped, `the runtime name was truncated at ${width} (${locale})`).toBe(false);
      }
    }
    assertTheDockActuallyMoved(EVERY_WIDTH, boxes);
  });

  test(`send stays on the row across the drag range, with a turn running (${locale})`, async ({ page }) => {
    /*
     * The old shape kept this row at `basis-0 flex-1` so a long option label could not push send
     * off the composer. Content-sizing it gives that job to `min-w-0` plus the default shrink
     * instead, so the promise is re-proved here rather than assumed — at every width, with a
     * live turn so the Stop chip is standing beside send and the row is at its widest.
     */
    const harness = await openDockAt(page, EVERY_WIDTH[0], locale);
    const chat = page.getByTestId('acp-chat-panel');
    await chat.getByRole('textbox').fill('Which pages went stale?');
    const send = page.getByTestId('acp-chat-send');
    await expect(send, 'waiting for send to be pressable').toBeEnabled();
    await send.click();
    await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
    await harness.read(page);
    await expect(page.getByTestId('acp-chat-stop')).toBeVisible();

    const boxes: number[] = [];
    for (const width of EVERY_WIDTH) {
      boxes.push(await moveDockTo(page, width));
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
      expect(fits.overflow, `the footer row overflowed its own box at ${width} (${locale})`).toBeLessThanOrEqual(1);
      expect(fits.spill, `send was pushed past the end of the footer row at ${width} (${locale})`).toBeLessThanOrEqual(1);
      expect(fits.sendWidth, `send was squeezed below its own size at ${width} (${locale})`).toBeGreaterThanOrEqual(28);
    }
    assertTheDockActuallyMoved(EVERY_WIDTH, boxes);
  });
}
