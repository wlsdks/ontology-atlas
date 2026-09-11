import { expect, test } from '@playwright/test';

import {
  DOC_BODY_FONT_PX,
  DOC_COLUMN_GUTTER_PX,
  DOC_COLUMN_PX,
  PROSE_MEASURE_PX,
  PROSE_MEASURE_STEPS,
  PROSE_ZERO_ADVANCE_EM,
} from '../../src/shared/ui/reading-measure';

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
 * | `60ch` (until 2026-09-12) | 78 |
 * | **`66ch` (shipped)** | **86** |
 * | `70ch` (the 2026-09-11 defect) | 91 |
 *
 * ⚠️ **The band moved with the measure on 2026-09-12.** The owner read a 500px line inside a
 * 1168px pane and asked for the line rather than the void (`docs/DECISIONS.md`, "The reading
 * column is worth more of its pane than the measure was buying"), which put the measure at
 * `66ch` spent at `--text-reading` — **86** Latin characters and 46 Hangul syllables. The
 * floor is **80** and the ceiling **92**: 80 is under the shipped 86 by the same slack a
 * hinted rasterizer already spends here (the four probe sizes measured 74–81 at `60ch` on
 * CI's Linux Chromium, so a silent return to `60ch` still fails this floor), and 92 is one
 * step past the value, so the token cannot drift wider without saying so. What the band no
 * longer guards is the old *45–75* guidance; that is the dissent the record keeps, and its
 * falsifier is a reader who loses their line on the wiki page at 1512.
 */
const MIN_CHARS_PER_MEASURE = 80;
const MAX_CHARS_PER_MEASURE = 92;

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

/**
 * The family name `next/font/local` emits for the shipped face. It is the source file's
 * basename lowercased — not a hash — so it can be named here and checked against the
 * `--font-pretendard` token the product actually sets.
 */
const SHIPPED_FONT_FAMILY = 'pretendard';

/**
 * ⚠️ **Prove the font before measuring the font.**
 *
 * Every number below is an advance width in Pretendard Variable. If the face has not loaded,
 * the measurements are of a fallback on whatever machine is running, and every assertion becomes
 * a lie about the product — reported as calibration drift, which is the one reading that must
 * never happen. `document.fonts.ready` is not enough: it resolves when loading has *settled*,
 * including settling on failure.
 *
 * ## What each signal is actually worth (measured 2026-09-11, this export)
 *
 * The woff2 request was blocked two ways — aborted, and answered `200 text/plain` — and the
 * three candidate signals were read in each case:
 *
 * | signal | font loaded | font failed | worth |
 * |---|---|---|---|
 * | `FontFace.status` for the family | `loaded` | **`error`** | the real signal |
 * | `document.fonts.check('16px pretendard')` | `true` | **`false`** | good, but see below |
 * | computed `font-family` of a probe | `pretendard, …` | `pretendard, …` | **none** |
 *
 * The computed family names the *declared* stack whether or not anything loaded, so it proves
 * only that the product still sets this family — worth asserting, worthless as proof of
 * rendering. And `check()` answers "can this be rendered without loading anything new", so it
 * returns **`true` for a family that was never declared at all** (measured: `check('16px
 * pretendard-not-shipped')` = true, because the fallback can render it). It is therefore only
 * meaningful for a family the stylesheet does declare, which is why the face-status assertion
 * comes first and carries the verdict.
 */
async function assertShippedFontIsRendering(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  const state = await page.evaluate((family) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre;font-size:16px';
    probe.textContent = '0'.repeat(100);
    document.body.append(probe);
    const appliedFamily = getComputedStyle(probe).fontFamily;
    probe.remove();
    return {
      appliedFamily,
      tokenFamily: getComputedStyle(document.documentElement)
        .getPropertyValue('--font-pretendard')
        .trim(),
      checks: document.fonts.check(`16px ${family as string}`),
      faces: [...document.fonts].map((face) => `${face.family}:${face.status}`),
    };
  }, SHIPPED_FONT_FAMILY);

  const normalise = (value: string) => value.replaceAll('"', '').replaceAll("'", '').toLowerCase();
  const detail = [
    `document.fonts.check('16px ${SHIPPED_FONT_FAMILY}') = ${state.checks}`,
    `--font-pretendard = ${state.tokenFamily || '(empty)'}`,
    `computed font-family on a body probe = ${state.appliedFamily}`,
    `registered faces = ${state.faces.join(', ') || '(none)'}`,
  ].join(' · ');
  const notRendering = `the shipped font is not rendering on this runner; calibration cannot be measured here — ${detail}`;

  // The verdict: a registered face for this family finished loading. `error` here is the shape
  // a 404, a wrong MIME type or a rejected format takes.
  expect(
    state.faces.some((face) => normalise(face) === `${SHIPPED_FONT_FAMILY}:loaded`),
    notRendering,
  ).toBe(true);
  expect(state.checks, notRendering).toBe(true);
  // Not proof of rendering (see the table above) — proof the product still asks for this face.
  expect(normalise(state.tokenFamily), notRendering).toContain(SHIPPED_FONT_FAMILY);
  expect(normalise(state.appliedFamily).split(',')[0].trim(), notRendering).toBe(
    SHIPPED_FONT_FAMILY,
  );
}

/**
 * ⚠️ **A rasterizer may quantise advances to whole pixels; the product's numbers may not.**
 *
 * Measured 2026-09-11, the same build on two runners:
 *
 * | | `0` advance @16px | `0` advance @14px | `60ch` @14px |
 * |---|---|---|---|
 * | macOS (CoreText, subpixel) | 9.531px | 8.340px | 500.4px |
 * | CI Linux Chromium (FreeType, hinted) | 10px | 9px | **540.0px** |
 *
 * Both runners were rendering **Pretendard** — `ceil(14 × 0.5957) = 9` and
 * `ceil(16 × 0.5957) = 10`, and the only advance ratios satisfying both are `(0.5714, 0.625]`,
 * which excludes every plausible Linux fallback (Liberation/Arimo 0.5562, Noto Sans 0.5615,
 * Roboto 0.5679, DejaVu Sans 0.6362). It also excludes this export's **own** declared fallback:
 * blocking the woff2 was measured at **9.032px** at 16px (`local(Arial)` × the 101.55%
 * size-adjust), i.e. 0.5645em — so a load failure and a hinted success are not confusable, and
 * `0.6250` is the second, not the first.
 *
 * The consequence for this gate: an assertion comparing a **`ch`-resolved length** against the
 * **derived px constant** is asserting the rasterizer's rounding, not the design. It is asserted
 * against the derivation instead, and the font metric is checked at 100px where one pixel of
 * hinting is 1% rather than 12%.
 *
 * The product is unaffected either way: the column is absolute, so a hinted runner simply has
 * the column rather than the `ch` cap bind the line — at the same width.
 */
const FONT_METRIC_PROBE_PX = 100;
const FONT_METRIC_TOLERANCE_EM = 0.01;

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the prose measure buys 80-92 characters per line in the shipped font', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('body')).toBeVisible();
  await assertShippedFontIsRendering(page);

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
   * ⚠️ A cross-size *invariance* assertion used to live here — the measure had to buy the same
   * character count at 14/15/16/17px, which it does wherever advances are subpixel. It was
   * removed on 2026-09-11: on CI's Linux Chromium the same build measured 78.5 / 74.3 / 80.6 /
   * 75.7, a spread produced entirely by whole-pixel advance hinting. Every one of those four is
   * inside the band above, which is the claim that matters; the spread was measuring the
   * rasterizer. The band is asserted per size, so a real drift at any one size still fails.
   */
});

test('the docs and Library body applies the measure inside its column', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('[data-docs-viewer]').first()).toBeVisible();
  await assertShippedFontIsRendering(page);

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

  /*
   * The line a person reads is the column's content box. Since the column *is* the measure plus
   * one gutter each side, that box is the measure spent at `text-body-lg` — and this holds
   * whichever of the two caps binds, which is what makes it portable across rasterizers (see the
   * quantisation note above: on a hinted runner the `ch` cap resolves wider and the column binds
   * instead, at the same width). The defect it replaced showed as a 680px content box holding a
   * 497px line.
   */
  const contentBox = columnPx - 2 * DOC_COLUMN_GUTTER_PX;
  expect(
    contentBox,
    `the document column's content box is ${contentBox.toFixed(1)}px but the measure spent at ${DOC_BODY_FONT_PX}px is ${PROSE_MEASURE_PX.toFixed(1)}px — the box is no longer the measure`,
  ).toBeCloseTo(PROSE_MEASURE_PX, 0);
  expect(
    contentPx,
    `a docs body paragraph runs ${contentPx.toFixed(1)}px inside a ${contentBox.toFixed(1)}px content box — the line and the box it sits in have drifted apart`,
  ).toBeCloseTo(contentBox, 0);
  // Neither cap may be *wider* than the box, or the line would be held by something else again.
  expect(
    contentPx,
    `a docs body paragraph runs ${contentPx.toFixed(1)}px, past the ${measurePx.toFixed(1)}px prose measure`,
  ).toBeLessThanOrEqual(measurePx + 1);
});

/**
 * ⚠️ **The one hand-written font metric, gated.**
 *
 * `--measure-prose` is `ch` and therefore font-relative; `--measure-doc-column` is a box and
 * therefore cannot be, so the column is derived by converting the measure once at
 * `--text-body-lg` using `--measure-zero-advance` — the advance of the digit `0`, measured
 * rather than chosen. That constant is the only place the shipped font's metrics are written
 * down instead of asked for, and `src/shared/ui/reading-measure.ts` mirrors the whole
 * derivation for the three consumers that cannot read a CSS variable.
 *
 * This test asks the browser for all of it: that the ratio still describes the font, that the
 * rendered token matches the mirror, and that the derived column really is the measure plus two
 * gutters. Any one of the four numbers drifting fails here.
 */
test('the derived column, the measured advance and the JS mirror all still agree', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('body')).toBeVisible();
  await assertShippedFontIsRendering(page);

  const read = await page.evaluate(([bodyFontPx, metricPx]) => {
    const lengthOf = (value: string, fontSize: number) => {
      const probe = document.createElement('div');
      probe.style.cssText = `position:fixed;left:-99999px;top:0;width:${value};transition:none;font-size:${fontSize}px`;
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    const advanceOf = (fontSize: number) => {
      const probe = document.createElement('span');
      probe.style.cssText = `position:fixed;left:-99999px;top:0;white-space:pre;transition:none;letter-spacing:normal;font-size:${fontSize}px`;
      probe.textContent = '0'.repeat(100);
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return width;
    };
    const root = getComputedStyle(document.documentElement);
    return {
      steps: Number(root.getPropertyValue('--measure-prose-steps').trim()),
      zeroAdvance: Number(root.getPropertyValue('--measure-zero-advance').trim()),
      gutterPx: lengthOf('var(--measure-doc-gutter)', 16),
      columnPx: lengthOf('var(--measure-doc-column)', 16),
      measureAtBodyPx: lengthOf('var(--measure-prose)', bodyFontPx),
      /*
       * The font metric is read at 100px, where a rasterizer that quantises advances to whole
       * pixels is off by at most 1% — at 16px the same rounding is 5%, which is wider than the
       * gap between Pretendard and every face that could stand in for it.
       */
      renderedZeroAdvanceEm: advanceOf(metricPx) / metricPx,
      renderedZeroAdvanceAtBodyPx: advanceOf(bodyFontPx),
    };
  }, [DOC_BODY_FONT_PX, FONT_METRIC_PROBE_PX] as const);

  // ① The declared advance still describes the shipped font.
  expect(
    Math.abs(read.renderedZeroAdvanceEm - PROSE_ZERO_ADVANCE_EM),
    `--measure-zero-advance is ${read.zeroAdvance} but the shipped font's "0" measures ${read.renderedZeroAdvanceEm.toFixed(4)}em at ${FONT_METRIC_PROBE_PX}px — the derived column is a different width from the measure it claims to be`,
  ).toBeLessThanOrEqual(FONT_METRIC_TOLERANCE_EM);

  // ② The CSS tokens and the JS mirror are one derivation.
  expect(read.steps, 'the CSS measure and its JS mirror disagree').toBe(PROSE_MEASURE_STEPS);
  expect(read.zeroAdvance).toBeCloseTo(PROSE_ZERO_ADVANCE_EM, 4);
  expect(read.gutterPx).toBeCloseTo(DOC_COLUMN_GUTTER_PX, 1);
  expect(
    read.columnPx,
    `the rendered --measure-doc-column is ${read.columnPx.toFixed(1)}px but reading-measure.ts says ${DOC_COLUMN_PX.toFixed(1)}px — the popout window, the image hints and the outline rail's floors are all reading the stale one`,
  ).toBeCloseTo(DOC_COLUMN_PX, 0);

  // ③ The column really is the measure plus two gutters, at the size the body is set in.
  expect(
    read.columnPx - 2 * read.gutterPx,
    `the column minus its gutters (${(read.columnPx - 2 * read.gutterPx).toFixed(1)}px) is not the measure spent at ${DOC_BODY_FONT_PX}px (${PROSE_MEASURE_PX.toFixed(1)}px)`,
  ).toBeCloseTo(PROSE_MEASURE_PX, 0);
  /*
   * ④ And the `ch` cap the prose actually wears agrees with that box to within the rasterizer's
   * rounding — one pixel per glyph, which is the most a hinted advance can differ by. A wider
   * margin here would admit a real calibration change; a tighter one asserts subpixel
   * positioning, which the CI runner does not have (see the quantisation note above: it measured
   * 540.0px where macOS measures 500.4px, both rendering Pretendard).
   */
  expect(
    Math.abs(read.measureAtBodyPx - PROSE_MEASURE_PX),
    `the prose measure resolves to ${read.measureAtBodyPx.toFixed(1)}px at ${DOC_BODY_FONT_PX}px but the box derived from it is ${PROSE_MEASURE_PX.toFixed(1)}px — a gap of more than one rounded pixel per glyph is calibration drift, not hinting (rendered "0" advance at ${DOC_BODY_FONT_PX}px: ${read.renderedZeroAdvanceAtBodyPx.toFixed(3)}px, declared: ${(PROSE_ZERO_ADVANCE_EM * DOC_BODY_FONT_PX).toFixed(3)}px)`,
  ).toBeLessThanOrEqual(PROSE_MEASURE_STEPS);
});

/**
 * ⚠️ **A gate that can only pass is not a gate.** The defect this file exists for is a
 * *wider* token, so the probe plants one and requires the measurement to leave the band. Then
 * it restores the real value through the same channel and requires GREEN again, so a probe
 * that had simply stopped measuring would be caught too.
 *
 * ⚠️ **The planted value moved on 2026-09-12, and it had to.** It used to be `70ch` — the
 * value that shipped until 2026-09-11 — which measured 88.4 characters here. When the measure
 * moved to `66ch` (86 characters) the band's ceiling rose to 92 and the old plant landed
 * *inside* it: the probe would have reported the instrument healthy while planting a defect
 * the gate could no longer see. It plants `80ch` instead, one clear step past the ceiling, and
 * the plant's own margin is asserted below so this cannot happen silently again.
 */
const PLANTED_MEASURE = '80ch';

test('instrument probe — a planted wider measure reads out of band and the shipped value reads in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/en/docs/?guides=off');
  await expect(page.locator('body')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const shipped = await calibrate(page, SAMPLE, [16]);
  expect(shipped[0].latinChars).toBeLessThanOrEqual(MAX_CHARS_PER_MEASURE);

  await page.evaluate((measure) => {
    document.documentElement.style.setProperty('--measure-prose', measure);
  }, PLANTED_MEASURE);
  const planted = await calibrate(page, SAMPLE, [16]);
  expect(
    planted[0].latinChars,
    `the planted ${PLANTED_MEASURE} measured ${planted[0].latinChars.toFixed(1)} characters and stayed inside the band — this gate is permanently green`,
  ).toBeGreaterThan(MAX_CHARS_PER_MEASURE);
  /* And it clears the ceiling by more than the rasterizer's own spread, so the next change to
     the band cannot quietly swallow the plant the way it swallowed `70ch`. */
  expect(
    planted[0].latinChars - MAX_CHARS_PER_MEASURE,
    `the plant clears the ceiling by only ${(planted[0].latinChars - MAX_CHARS_PER_MEASURE).toFixed(1)} characters — widen ${PLANTED_MEASURE} or the probe is measuring hinting`,
  ).toBeGreaterThan(4);

  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--measure-prose');
  });
  const restored = await calibrate(page, SAMPLE, [16]);
  expect(restored[0].measureRaw).toBe(shipped[0].measureRaw);
  expect(restored[0].latinChars).toBeLessThanOrEqual(MAX_CHARS_PER_MEASURE);
  expect(restored[0].latinChars).toBeGreaterThanOrEqual(MIN_CHARS_PER_MEASURE);
});
