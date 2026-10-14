import { expect, test } from '@playwright/test';

import {
  DOC_BODY_FONT_PX,
  DOC_COLUMN_GUTTER_PX,
  DOC_COLUMN_PX,
  PROSE_MEASURE_PX,
  PROSE_MEASURE_STEPS,
  PROSE_ZERO_ADVANCE_EM,
} from '../../src/shared/ui/tokens/reading-measure';

import { seedFirstRunSeen } from './first-run-seed';

async function openOntologyAudit(page: import('@playwright/test').Page) {
  await page.goto('/en/library/?tab=ontology&guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(
    (url) => url.pathname === '/en/library/' && url.searchParams.get('tab') === 'ontology',
  );
  await expect(
    page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
  ).toBeVisible();
}

/**
 * `--measure-prose` must buy the characters per line its docs state. `ch` is the advance of `0`,
 * so a Latin average is about three quarters of it; only a rendered page with Pretendard
 * Variable can measure that. The band is 80 to 92 characters, one step past the shipped `66ch`.
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
 * Prove the font before measuring it: `document.fonts.ready` resolves even when loading failed.
 * `FontFace.status` is the real signal; computed `font-family` names the declared stack only,
 * and `document.fonts.check` returns true for a family never declared.
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

  // A registered face for this family must have finished loading; `error` is the shape a 404,
  // wrong MIME type or rejected format takes.
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
 * A hinted rasterizer may quantise advances to whole pixels (CI Linux Chromium: `0` is 10px
 * at 16px, 540px for `60ch` at 14px). Assert against the derivation and check the font metric
 * at 100px, where one pixel of hinting is 1%.
 */
const FONT_METRIC_PROBE_PX = 100;
const FONT_METRIC_TOLERANCE_EM = 0.01;

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the prose measure buys 80-92 characters per line in the shipped font', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await openOntologyAudit(page);
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
   * Cross-size invariance is not asserted: hinting spreads the count on CI's Linux Chromium.
   * The band is asserted per size, so a real drift at any one size still fails.
   */
});

test('the docs and Library body applies the measure inside its column', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await openOntologyAudit(page);
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
 * down instead of asked for, and `src/shared/ui/tokens/reading-measure.ts` mirrors the whole
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
  await openOntologyAudit(page);
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
 * A gate that can only pass is not a gate: plant a wider token and require the reading to leave
 * the band, then restore it and require green. `80ch` is one clear step past the ceiling of 92,
 * and the plant's own margin is asserted below.
 */
const PLANTED_MEASURE = '80ch';

test('instrument probe — a planted wider measure reads out of band and the shipped value reads in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await openOntologyAudit(page);
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
