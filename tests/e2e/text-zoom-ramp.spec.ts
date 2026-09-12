import { expect, test } from "@playwright/test";

import {
  DOC_COLUMN_GUTTER_PX,
  DOC_COLUMN_PX,
  PROSE_MEASURE_PX,
  docColumnPxAtRoot,
  proseMeasurePxAtRoot,
} from "../../src/shared/ui/reading-measure";

/**
 * **Does the browser's text-only zoom reach the type?**
 *
 * A browser has two zooms and they are not the same control. *Page* zoom scales the layout, so
 * a person who wants larger words gets a narrower window with it. *Text-only* zoom — Chrome's
 * Appearance → Font size, Firefox's "Zoom text only", Safari's accessibility text size —
 * multiplies the **root font size** and nothing else, and it is the one a person uses when the
 * window is already the size they want.
 *
 * Until 2026-09-12 that control was inert on every Atlas surface, because the type ramp was
 * absolute `px`: measured across the ramp, at every setting up to 200%, the screen was
 * pixel-for-pixel identical (carry-forward finding, U2 council, 2026-09-11). The ramp is now
 * written in `rem` and this spec is the browser half of that change. Its sibling,
 * `tests/contract/type-ramp-root-relative.contract.test.ts`, reads the declarations; it cannot
 * see a screen, and this file cannot tell `px` from `rem` at the default root. Both are needed.
 *
 * ## Why the root font size is set in script and not emulated
 *
 * There is no `emulateMedia` for this: text-only zoom is a browser **setting**, not a media
 * feature, and Playwright exposes no switch for it. What the setting does is multiply the root
 * font size, so the measurement does exactly that — `documentElement.style.fontSize = '32px'`
 * is 200% of the 16px default, and every `rem` in the cascade resolves against it.
 *
 * ## What is asserted, and what is deliberately not
 *
 * | | at the 16px root | at a 32px root |
 * |---|---|---|
 * | every ramp step | its pinned pixel — the byte-identity witness | exactly 2× |
 * | the reading column | 709.1px | 1338.1px — the measure doubles, the two gutters hold |
 * | chrome geometry | 36 · 20 · 64 · 420 · 560 · 26 · 40 | **the same numbers** |
 * | horizontal overflow | none | none |
 * | text outside the viewport | none that is not inside a clipping ancestor | the same |
 *
 * The last row is the one worth reading twice. Elements whose rect extends past the viewport
 * exist at **both** roots on these routes — a truncated path, a sidebar sentence — and they are
 * correct: an ancestor marked `truncate` clips them and shows an ellipsis, which is the
 * behaviour the author chose for a narrow box. A count of such rects therefore grows with the
 * type and says nothing. What must stay at zero is text that reaches past the viewport with
 * **nothing clipping it**, because that text is unreachable: the document does not scroll to it.
 */

/** What each probe below hands back. `eval()` erases the type, so each call names it again. */
interface RampRead {
  readonly step: string;
  readonly fontSize: number;
  readonly lineHeight: number;
}
interface BoxRead {
  readonly name: string;
  readonly width: number;
}

/** 200% of the 16px default. The one number this whole file is about. */
const ZOOMED_ROOT_PX = 32;
const DEFAULT_ROOT_PX = 16;

/**
 * The ramp, and the pixel each step renders at the default root — the same table
 * `app/globals.css` declares, written here as the numbers rather than as `rem`, so that a
 * conversion arithmetic error cannot agree with itself.
 */
const RAMP = [
  { step: "caption", fontSize: 9.5, lineHeight: 14 },
  { step: "label", fontSize: 11, lineHeight: 16 },
  { step: "body", fontSize: 12.5, lineHeight: 20 },
  { step: "body-lg", fontSize: 14, lineHeight: 22 },
  { step: "title", fontSize: 16, lineHeight: 24 },
  // `--leading-prose` is the ratio 1.7, so this pair is 16 × 1.7.
  { step: "reading", fontSize: 16, lineHeight: 27.2 },
  { step: "display", fontSize: 23, lineHeight: 28 },
  { step: "hero", fontSize: 30, lineHeight: 34 },
  { step: "hero-lg", fontSize: 34, lineHeight: 38 },
] as const;

/**
 * Chrome geometry: the boxes the fixed-scale contract pins (owner, 2026-07-24) plus the widths
 * a reader's font setting must not move. A hit target that grew or shrank with a font size
 * would be a different promise than the one every other gate measures.
 */
const CHROME_BOXES = [
  "--chrome-tile-size",
  "--app-nav-rail-icon-size",
  "--app-nav-rail-width",
  "--app-nav-rail-tile-width",
  "--app-nav-rail-tile-height",
  "--dialog-w-sm",
  "--dialog-w-md",
  "--measure-doc-gutter",
  "--measure-stage-column",
  "--topology-index-tab-width",
  "--touch-target-min",
] as const;

const ROUTES = [
  "/ko/docs/",
  "/ko/topology/?guides=off",
  "/ko/download/",
  "/ko/library/?guides=off",
] as const;

const WIDTHS = [1512, 1040] as const;

/**
 * ⚠️ **A fresh element per token, with transitions off.** Reusing one probe element returns the
 * *previous* token's value while a transition is still running — 1,240 false readings were
 * measured that way once. Each step gets its own span, is read once, and is removed.
 */
const READ_RAMP = `(steps) => steps.map((step) => {
  const el = document.createElement('span');
  el.className = 'text-' + step;
  el.style.transition = 'none';
  el.textContent = 'Ag가';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const read = { step, fontSize: parseFloat(cs.fontSize), lineHeight: parseFloat(cs.lineHeight) };
  el.remove();
  return read;
})`;

/**
 * A token's length in rendered pixels, read from a box that wears it — because a custom
 * property's own computed value is the unresolved token stream (`calc(66 * 0.5957 * 1rem + …)`),
 * not a number.
 */
const READ_BOXES = `(names) => names.map((name) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;visibility:hidden;transition:none;width:var(' + name + ')';
  document.body.appendChild(el);
  const width = Math.round(el.getBoundingClientRect().width * 100) / 100;
  el.remove();
  return { name, width };
})`;

/**
 * **Text that is visibly cut off and offered no way to see the rest.**
 *
 * ⚠️ The obvious measurement here is wrong, and it is wrong in the direction that passes.
 * `html` and `body` both carry `overflow-x: hidden` on every Atlas route (measured), so
 * `documentElement.scrollWidth` can never exceed `clientWidth` and an element whose rect
 * reaches past the viewport always has a clipping ancestor. A gate built on either of those
 * two facts is green before it is written — the same shape as the width-conditional gate that
 * measured a control only at the one width where it did not exist.
 *
 * So the question is asked about the **text**, not the box: is a leaf's content taller or wider
 * than the box it sits in, and does the box that clips it offer a way to the rest? An ellipsis
 * (`text-overflow`), a line clamp (`-webkit-line-clamp`) and a scroller (`auto`/`scroll`) are
 * all such offers, and all three are things an author chose for a narrow box; the type merely
 * reaches them sooner. What is left over — cut with nothing on offer — is text a reader cannot
 * get to at all, and that is the number this holds at zero.
 */
const CUT_TEXT = `() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    // A 1px box is the visually-hidden idiom (skip links, rail tooltips), not a cut.
    if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) continue;
    let clipper = null;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const ns = getComputedStyle(node);
      const clips = (axis) => ['hidden', 'clip', 'auto', 'scroll'].includes(axis);
      if (clips(ns.overflowX) || clips(ns.overflowY)) { clipper = node; break; }
    }
    if (!clipper) continue;
    const ks = getComputedStyle(clipper);
    const offersRest =
      ks.textOverflow === 'ellipsis' ||
      (ks.webkitLineClamp && ks.webkitLineClamp !== 'none') ||
      ['auto', 'scroll'].includes(ks.overflowX) ||
      ['auto', 'scroll'].includes(ks.overflowY);
    if (offersRest) continue;
    out.push(
      '«' + text.slice(0, 40) + '» ' + el.scrollWidth + 'x' + el.scrollHeight
        + ' in ' + el.clientWidth + 'x' + el.clientHeight
        + ' · clipped by .' + String(clipper.className).slice(0, 60),
    );
  }
  return out;
}`;

test.describe("브라우저 «글자만 확대»가 타입 램프에 닿는다", () => {
  test("램프의 모든 단이 기본 루트에서 지정된 픽셀로, 32px 루트에서 정확히 두 배로 렌더된다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

    const steps = RAMP.map((entry) => entry.step);

    // At 100% — the byte-identity witness. Every number here is what the ramp rendered
    // before it was written in `rem`; the unit changed and the pixel did not.
    const atDefault = (await page.evaluate(eval(READ_RAMP), steps)) as RampRead[];
    expect(atDefault).toEqual(
      RAMP.map((entry) => ({
        step: entry.step,
        fontSize: entry.fontSize,
        lineHeight: entry.lineHeight,
      })),
    );

    await page.evaluate((root) => {
      document.documentElement.style.fontSize = `${root}px`;
    }, ZOOMED_ROOT_PX);

    const atZoom = (await page.evaluate(eval(READ_RAMP), steps)) as RampRead[];
    expect(atZoom).toEqual(
      RAMP.map((entry) => ({
        step: entry.step,
        fontSize: entry.fontSize * 2,
        lineHeight: entry.lineHeight * 2,
      })),
    );
  });

  test("계측기가 공회전하지 않는다 — 램프를 px 로 되돌리면 두 배 주장이 무너진다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

    // The probe above would report "doubled" for any ramp that happens to be root-relative,
    // including one it never read. Pin one step back to `px` on the root, raise the root, and
    // the assertion must fail for that step and hold for its neighbour — so the measurement is
    // reading the cascade and not its own expectations.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--text-body", "12.5px");
      document.documentElement.style.fontSize = "32px";
    });
    const planted = (await page.evaluate(eval(READ_RAMP), ["body", "body-lg"])) as RampRead[];
    expect(planted.find((entry) => entry.step === "body")?.fontSize).toBe(12.5);
    expect(planted.find((entry) => entry.step === "body-lg")?.fontSize).toBe(28);

    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--text-body");
    });
    const restored = (await page.evaluate(eval(READ_RAMP), ["body"])) as RampRead[];
    expect(restored[0]?.fontSize).toBe(25);
  });

  test("읽기 칼럼은 자기 안의 글자와 함께 넓어지고, 크롬 기하는 제자리에 있다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

    const readColumn = async () => {
      const boxes = (await page.evaluate(eval(READ_BOXES), [
        "--measure-doc-column",
        "--measure-prose",
        ...CHROME_BOXES,
      ])) as BoxRead[];
      return new Map<string, number>(boxes.map((entry) => [entry.name, entry.width]));
    };

    const before = await readColumn();
    expect(before.get("--measure-doc-column")).toBeCloseTo(DOC_COLUMN_PX, 0);
    // `--measure-prose` is `66ch`, which is relative to the *element's* font size; the probe
    // box inherits the body's, so this is the measure as a line actually gets it.
    expect(before.get("--measure-prose")).toBeCloseTo(PROSE_MEASURE_PX, 0);

    await page.evaluate((root) => {
      document.documentElement.style.fontSize = `${root}px`;
    }, ZOOMED_ROOT_PX);
    const after = await readColumn();

    // The column is the measure spent at the root plus two absolute gutters, so it grows by
    // the measure and not by a factor of two: 709.1 → 1338.1.
    expect(after.get("--measure-doc-column")).toBeCloseTo(docColumnPxAtRoot(ZOOMED_ROOT_PX), 0);
    expect(after.get("--measure-prose")).toBeCloseTo(proseMeasurePxAtRoot(ZOOMED_ROOT_PX), 0);
    expect(
      (after.get("--measure-doc-column") ?? 0) - (before.get("--measure-doc-column") ?? 0),
    ).toBeCloseTo(proseMeasurePxAtRoot(DEFAULT_ROOT_PX), 0);

    const moved: string[] = [];
    for (const name of CHROME_BOXES) {
      if (before.get(name) !== after.get(name)) {
        moved.push(`  ${name}: ${before.get(name)} → ${after.get(name)}`);
      }
    }
    expect(
      moved,
      "크롬 기하가 독자의 글꼴 설정에 따라 움직였다. 타입은 독자를 따르고\n" +
        "박스는 따르지 않는다 — 히트 영역·레일 폭·대화상자 단은 px 로 남는다.\n" +
        "움직인 값:\n" +
        moved.join("\n"),
    ).toEqual([]);
    // The gutters are part of that list and also part of the column's derivation, so their
    // holding still is what makes the growth above the measure exactly.
    expect(after.get("--measure-doc-gutter")).toBe(DOC_COLUMN_GUTTER_PX);
  });

  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} · ${width}px — 200% 글자 확대에서 가로 넘침도, 갇힌 글자도 없다`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

        for (const root of [DEFAULT_ROOT_PX, ZOOMED_ROOT_PX]) {
          await page.evaluate((size) => {
            document.documentElement.style.fontSize = `${size}px`;
          }, root);
          // Two frames for the reflow the root change causes.
          await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );

          const cut = (await page.evaluate(eval(CUT_TEXT))) as string[];
          expect(
            cut,
            `루트 ${root}px 에서 잘린 채 나머지를 볼 방법이 없는 글자가 있다.\n` +
              `줄임표·라인 클램프·스크롤러 중 하나라도 있으면 좁은 상자의 설계된 동작이지만,\n` +
              `셋 다 없으면 독자는 그 글자에 닿을 수 없다. html·body 가 둘 다\n` +
              `overflow-x: hidden 이라 문서 scrollWidth 로는 이걸 절대 못 본다.\n` +
              cut.join("\n"),
          ).toEqual([]);
        }
      });
    }
  }

  test("잘린 글자 탐지기가 실제로 문다 — 심어 넣은 절단을 찾아낸다", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 900 });
    await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

    // Every route above reports zero, and an instrument that reports zero because it looks at
    // nothing reports zero forever. This one is made to bite twice: once on a box that clips
    // with nothing on offer (it must be found), and once on the same box with an ellipsis
    // added (it must not be), so the exemption is measured and not assumed.
    const plant = (textOverflow: string) => `
      const old = document.getElementById('atlas-cut-probe');
      if (old) old.remove();
      const box = document.createElement('div');
      box.id = 'atlas-cut-probe';
      box.style.cssText = 'position:absolute;top:0;left:0;width:40px;height:20px;'
        + 'overflow:hidden;white-space:nowrap;background:#fff;color:#000;'
        + 'text-overflow:${textOverflow}';
      box.textContent = 'planted cut text that cannot possibly fit';
      document.body.appendChild(box);
    `;

    await page.evaluate(plant("clip"));
    const withDefect = (await page.evaluate(eval(CUT_TEXT))) as string[];
    expect(
      withDefect.some((entry) => entry.includes("planted cut text")),
      "탐지기가 심어 넣은 절단을 못 봤다 — 위의 0 은 증거가 아니다",
    ).toBe(true);

    await page.evaluate(plant("ellipsis"));
    const withEllipsis = (await page.evaluate(eval(CUT_TEXT))) as string[];
    expect(
      withEllipsis.some((entry) => entry.includes("planted cut text")),
      "줄임표가 붙은 절단까지 위반으로 셌다 — 설계된 잘림을 결함으로 읽는다",
    ).toBe(false);

    await page.evaluate(() => document.getElementById("atlas-cut-probe")?.remove());
    expect(await page.evaluate(eval(CUT_TEXT))).toEqual([]);
  });

  test("실제 문서 본문이 200% 에서 두 배로 읽힌다 — 프로브가 아니라 화면에서", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-docs-viewer]").first()).toBeVisible({ timeout: 30_000 });

    // The probes above build their own elements. This reads a paragraph the page rendered and
    // the box it is laid out in, so the claim is about the product and not about the instrument.
    const readBody = () =>
      page.evaluate(() => {
        const paragraph = [...document.querySelectorAll("[data-docs-viewer] p")].find(
          (el) => (el.textContent || "").trim().length > 80 && el.getBoundingClientRect().width > 2,
        );
        if (!paragraph) return null;
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:absolute;left:-99999px;transition:none;width:var(--measure-doc-column)";
        paragraph.append(probe);
        const columnWidth = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          fontSize: Number.parseFloat(getComputedStyle(paragraph).fontSize),
          lineHeight: Number.parseFloat(getComputedStyle(paragraph).lineHeight),
          textWidth: Math.round(paragraph.getBoundingClientRect().width),
          columnWidth: Math.round(columnWidth * 100) / 100,
        };
      });

    const before = await readBody();
    expect(before, "/ko/docs/ 에서 본문 문단을 못 찾았다 — 측정 대상이 없다").not.toBeNull();

    await page.evaluate((root) => {
      document.documentElement.style.fontSize = `${root}px`;
    }, ZOOMED_ROOT_PX);
    const after = await readBody();

    expect(after!.fontSize).toBeCloseTo(before!.fontSize * 2, 1);
    expect(after!.lineHeight).toBeCloseTo(before!.lineHeight * 2, 1);
    // The body is `--text-reading`, so this is the step the reading column is derived at: the
    // paragraph and the box it lives in move together, which is the whole point of the slice.
    expect(before!.fontSize).toBe(16);
    expect(after!.columnWidth).toBeCloseTo(docColumnPxAtRoot(ZOOMED_ROOT_PX), 0);
    expect(after!.textWidth).toBeGreaterThan(before!.textWidth);
  });
});
