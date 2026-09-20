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
  // A fixed sleep is forbidden (`.claude/rules/testing.md`) and 900ms is not a settle under CI
  // load either. The tool row the read produces is the condition this actually waited for.
  await expect(chat.locator('[data-acp-entry="tool"]').first()).toBeVisible();
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

/*
 * ⚠️ **Measure the text against its box in the same units, or sub-pixel rounding invents a clip.**
 *
 * This compared `scrollWidth` with `clientWidth`, which are integers, against a label whose real
 * box is fractional. Measured locally: the Korean mode name lays out at 58.94px inside a 58.94px
 * label, and those two round to 60 and 59 — a one-pixel "overflow" in a word that is not clipped
 * at all. A `+ 1` tolerance hid it on macOS; on the CI runner the fractions fall differently and
 * the same untruncated word failed, on the first run and both retries, in Korean only.
 *
 * A Range over the text node measures what is actually drawn, fractionally, against a box read
 * the same way — so the comparison no longer depends on which side of .5 a platform lands.
 * `document.fonts.ready` stays: a measurement taken in a fallback face is a different number again.
 *
 * The slack is one pixel, not half of one. At half a pixel **both** locales failed on the runner
 * while both passed here, which kills every locale-specific explanation and says the fractional
 * measurement itself sits a little wider there. One pixel is still far short of an ellipsis, which
 * costs more than ten, so the case still catches the thing it is for — and it now prints the two
 * widths it compared, so the next failure argues with a number instead of a theory.
 */
const modeWordIsWhole = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="acp-chat-mode"]');
    if (!trigger) return null;
    const label = [...trigger.querySelectorAll('span')].find((span) => span.scrollWidth > 0);
    if (!label) return null;
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect().width;
    const box = label.getBoundingClientRect().width;
    const composer = document.querySelector('[data-testid="acp-chat-composer"]');
    return {
      whole: text <= box + 1,
      text: Math.round(text * 100) / 100,
      box: Math.round(box * 100) / 100,
      word: label.textContent,
      composer: composer ? Math.round(composer.getBoundingClientRect().width * 100) / 100 : null,
    };
  });
};

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

  test(`the mode keeps its whole word while a turn runs once the row fits it (${locale})`, async ({ page }) => {
    const harness = await open(page, FITS, locale);
    await startTurn(page, harness);
    expect(await covered(page)).toEqual([]);
    await expect(page.getByTestId('acp-chat-mode')).toBeVisible();
    const fit = await modeWordIsWhole(page);
    // The numbers go in the message, not a hypothesis: two locale-specific explanations for this
    // case were plausible and wrong, and neither could have been ruled out from a bare boolean.
    expect(fit?.whole, `the mode showed a cut word instead of standing down: ${JSON.stringify(fit)}`).toBe(true);
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
