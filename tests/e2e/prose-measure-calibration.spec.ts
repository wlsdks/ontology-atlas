import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';

/**
 * **`--measure-prose` must be worth the sentence written next to it.**
 *
 * `docs/DESIGN-SYSTEM.md` and `src/views/gateway-doc/ui/GatewayDocPage.tsx` both state the
 * intent of this token as *"65–75 characters per line"*. Until 2026-09-11 the token read
 * `70ch` and produced **92** — because `ch` is the advance of the digit `0`, and a
 * proportional Latin average is only about three quarters of that. The number in the token
 * and the number in the sentence were never the same quantity, and nothing measured the
 * gap.
 *
 * ## Why this is a spec and not a contract test
 *
 * Both halves of the fact live only in a rendered page: the resolved length of
 * `var(--measure-prose)` and the advance width of real glyphs in the shipped
 * **Pretendard Variable**. A source test can read `60ch` out of `app/globals.css` and still
 * know nothing about how many characters that is — which is exactly the blindness that let
 * the mis-calibration stand. Swapping the body font would move this number without touching
 * one line of CSS, and this gate would say so.
 *
 * ## What is measured
 *
 * `"0".repeat(100)` gives `1ch` to two decimal places, and a fixed English sample of known
 * length gives the average character. Their ratio times the token's number is the
 * characters-per-line the token actually buys. Both sides scale with the font size, so the
 * answer is the same at 14, 15, 16 and 17px — asserted here rather than assumed, because a
 * font whose digits are not proportional to its letters would break that and nothing else
 * would notice.
 *
 * ## The band, and why it is not a point
 *
 * | measure | characters per line |
 * |---|---:|
 * | `50ch` | 65 |
 * | `57ch` | 75 |
 * | **`60ch` (shipped)** | **78** |
 * | `70ch` (the defect) | 91 |
 *
 * The floor is **65** and the ceiling **82** — the stated intent plus the slack a font
 * revision or a hinting change may move a proportional average, and still well below the
 * 91 the old value produced. A single exact number would fail on a font update that changed
 * nothing a reader could see; a band wider than this would re-admit the defect.
 */
const MIN_CHARS_PER_MEASURE = 65;
const MAX_CHARS_PER_MEASURE = 82;

/**
 * A fixed sample, not the page's own text: the average must not move because someone edited
 * a document. 120 characters of ordinary English prose including spaces, which is what a
 * line of this product's body text is made of.
 */
const SAMPLE =
  'The quick brown fox jumps over the lazy dog while a completed order becomes money in a merchant account.';

const PROBE_FONT_SIZES = [14, 15, 16, 17] as const;

type Calibration = {
  readonly fontSize: number;
  readonly chPx: number;
  readonly latinPx: number;
  readonly hangulPx: number;
  readonly measurePx: number;
  readonly measureRaw: string;
  readonly latinChars: number;
  readonly hangulChars: number;
};

/**
 * Measure the token against real glyphs at one font size.
 *
 * ⚠️ **A fresh element per measurement, with `transition: none`.** Reusing one node reports
 * the previous width while a transition is still running — a repository-wide false-positive
 * source (`docs/DESIGN-SYSTEM.md`, computed-style probes). The probe is absolutely
 * positioned off-canvas so it can never reflow the page it is measuring, and
 * `letter-spacing: normal` keeps a tracking token off the average.
 */
async function calibrate(
  page: import('@playwright/test').Page,
  sample: string,
  fontSizes: readonly number[],
): Promise<Calibration[]> {
  return page.evaluate(
    ([text, sizes]) => {
      const widthOf = (content: string, fontSize: number) => {
        const probe = document.createElement('span');
        probe.style.cssText = [
          'position:fixed',
          'left:-99999px',
          'top:0',
          'white-space:pre',
          'transition:none',
          'letter-spacing:normal',
          `font-size:${fontSize}px`,
        ].join(';');
        probe.textContent = content;
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      const measureOf = (fontSize: number) => {
        const probe = document.createElement('div');
        probe.style.cssText = [
          'position:fixed',
          'left:-99999px',
          'top:0',
          'width:var(--measure-prose)',
          'transition:none',
          `font-size:${fontSize}px`,
        ].join(';');
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      const measureRaw = getComputedStyle(document.documentElement)
        .getPropertyValue('--measure-prose')
        .trim();
      return (sizes as number[]).map((fontSize) => {
        const chPx = widthOf('0'.repeat(100), fontSize) / 100;
        const latinPx = widthOf(text as string, fontSize) / (text as string).length;
        const hangulPx = widthOf('가'.repeat(50), fontSize) / 50;
        const measurePx = measureOf(fontSize);
        return {
          fontSize,
          chPx,
          latinPx,
          hangulPx,
          measurePx,
          measureRaw,
          latinChars: measurePx / latinPx,
          hangulChars: measurePx / hangulPx,
        };
      });
    },
    [sample, fontSizes] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the prose measure buys 65-82 characters per line in the shipped font', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('body')).toBeVisible();
  // Pretendard arrives as a web font; measuring before it lands measures the fallback.
  await page.evaluate(() => document.fonts.ready);

  const readings = await calibrate(page, SAMPLE, PROBE_FONT_SIZES);
  expect(readings.length).toBe(PROBE_FONT_SIZES.length);

  for (const reading of readings) {
    const detail = [
      `--measure-prose: ${reading.measureRaw} = ${reading.measurePx.toFixed(1)}px at ${reading.fontSize}px`,
      `1ch = ${reading.chPx.toFixed(3)}px, average Latin character = ${reading.latinPx.toFixed(3)}px`,
      `=> ${reading.latinChars.toFixed(1)} Latin characters per line (${reading.hangulChars.toFixed(1)} Hangul)`,
    ].join(' · ');
    expect(
      reading.latinChars,
      `the prose measure is too wide to follow by eye — ${detail}`,
    ).toBeLessThanOrEqual(MAX_CHARS_PER_MEASURE);
    expect(
      reading.latinChars,
      `the prose measure is narrower than a readable line — ${detail}`,
    ).toBeGreaterThanOrEqual(MIN_CHARS_PER_MEASURE);
  }

  /*
   * Font-size invariance. Both sides of the ratio are lengths in the same font, so the
   * character count must not depend on the size the cap is read at — one token has to mean
   * one line length across `text-body` (12.5px), `text-body-lg` (14px) and the 16px root.
   * A font whose digits stop being proportional to its letters would break this silently.
   */
  const counts = readings.map((reading) => reading.latinChars);
  const spread = Math.max(...counts) - Math.min(...counts);
  expect(
    spread,
    `the measure buys a different number of characters per font size: ${readings
      .map((reading) => `${reading.fontSize}px=${reading.latinChars.toFixed(1)}`)
      .join(', ')}`,
  ).toBeLessThan(1);
});

test('the docs and Library body applies the measure inside its column', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('[data-docs-viewer]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const applied = await page.evaluate(() => {
    const article = document.querySelector('[data-docs-viewer]');
    if (!article) return null;
    const paragraphs = [...article.querySelectorAll('p')].filter(
      (element) => (element.textContent ?? '').trim().length > 80,
    );
    if (paragraphs.length === 0) return null;
    const widest = paragraphs
      .map((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;left:-99999px;width:var(--measure-prose);transition:none;font-size:${style.fontSize}`;
        element.append(probe);
        const measurePx = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          contentPx:
            element.getBoundingClientRect().width -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight),
          measurePx,
        };
      })
      .reduce((a, b) => (b.contentPx > a.contentPx ? b : a));
    const columnProbe = document.createElement('div');
    columnProbe.style.cssText =
      'position:absolute;left:-99999px;width:var(--measure-doc-column);transition:none';
    article.append(columnProbe);
    const columnPx = columnProbe.getBoundingClientRect().width;
    columnProbe.remove();
    return { ...widest, columnPx, count: paragraphs.length };
  });

  expect(applied, 'no docs body paragraph was rendered to measure').not.toBeNull();
  const { contentPx, measurePx, columnPx } = applied!;
  // The cap binds: the paragraph is held at the measure, not at the column box around it.
  expect(
    contentPx,
    `a docs body paragraph runs ${contentPx.toFixed(1)}px, past the ${measurePx.toFixed(1)}px prose measure — the column is capping the line instead of the measure`,
  ).toBeLessThanOrEqual(measurePx + 1);
  // And the two really are different widths here, so the assertion above is not vacuous.
  expect(
    measurePx,
    'the prose measure is not narrower than the document column at this size, so the cap above proves nothing',
  ).toBeLessThan(columnPx);
});

/**
 * ⚠️ **A gate that can only pass is not a gate.** The defect this file exists for is a
 * *wider* token, so the probe plants exactly that — `70ch`, the value that shipped until
 * 2026-09-11 — and requires the measurement to leave the band. Then it restores the real
 * value through the same channel and requires GREEN again, so a probe that had simply
 * stopped measuring would be caught too.
 */
test('instrument probe — the planted 70ch reads out of band and the shipped value reads in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('body')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const shipped = await calibrate(page, SAMPLE, [16]);
  expect(shipped[0].latinChars).toBeLessThanOrEqual(MAX_CHARS_PER_MEASURE);

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--measure-prose', '70ch');
  });
  const planted = await calibrate(page, SAMPLE, [16]);
  expect(
    planted[0].latinChars,
    `the planted 70ch measured ${planted[0].latinChars.toFixed(1)} characters and stayed inside the band — this gate is permanently green`,
  ).toBeGreaterThan(MAX_CHARS_PER_MEASURE);

  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--measure-prose');
  });
  const restored = await calibrate(page, SAMPLE, [16]);
  expect(restored[0].measureRaw).toBe(shipped[0].measureRaw);
  expect(restored[0].latinChars).toBeLessThanOrEqual(MAX_CHARS_PER_MEASURE);
  expect(restored[0].latinChars).toBeGreaterThanOrEqual(MIN_CHARS_PER_MEASURE);
});
