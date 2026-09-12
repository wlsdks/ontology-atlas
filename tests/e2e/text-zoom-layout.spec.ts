import { expect, test } from "@playwright/test";

import {
  CUT_TEXT,
  TEXT_ZOOM_ROUTES,
  TEXT_ZOOM_WIDTHS,
  ZOOMED_ROOT_PX,
} from "./text-zoom-probes";

/**
 * **The browser's own text-size setting, at 200% — the layout half.**
 *
 * Its sibling `text-zoom-ramp.spec.ts` sets the root in script, which is exact for the type
 * and wrong for everything else: `rem` inside a **media query** resolves against the root
 * element's *initial* font size — the browser's own default — and an author-set
 * `html { font-size }` cannot move it. Tailwind v4's breakpoints are `rem`
 * (`48rem` / `64rem` / `80rem`), so a real font-size preference moves them and the script
 * stand-in does not.
 *
 * Measured at a 1512 viewport: with the author-set root, `(min-width: 48rem)` is **true**;
 * with the browser's default font size at 32px it is **false**, while the repository's own
 * `(min-width: 768px)` queries stay **true** in both. A real reader at 200% is therefore in a
 * state no stand-in produces — the below-`lg` layout inside a 1512 window, mixed with
 * desktop-true px queries — and a layout claim measured the other way describes a screen the
 * browser never draws.
 *
 * `launchOptions` lives at the top of the file because Playwright refuses it inside a
 * `describe`: it forces a new worker. The first test is a self-probe on that breakpoint, so
 * this file cannot quietly fall back to the stand-in's state and keep reporting zero.
 */
test.use({
  launchOptions: {
    args: ["--blink-settings=defaultFontSize=32,defaultFixedFontSize=26"],
  },
});

test.describe("실제 브라우저 글자 크기 설정 200%", () => {
  test("계측 상태가 진짜다 — rem 미디어 쿼리가 실제로 움직였다", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

    // Without this, the whole group could silently fall back to the script stand-in's state —
    // where every `rem` breakpoint stays at its 16px value — and keep reporting zero. The two
    // populations disagreeing is the state a real reader is in, so it is asserted, not assumed.
    const state = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).fontSize,
      remBreakpoint: matchMedia("(min-width: 48rem)").matches,
      pxBreakpoint: matchMedia("(min-width: 768px)").matches,
    }));
    expect(state.root).toBe(`${ZOOMED_ROOT_PX}px`);
    expect(
      state.remBreakpoint,
      "48rem 이 1512 에서 참이다 — 브라우저 기본 글자 크기가 32px 이 아니라 " +
        "author-set 루트로 측정되고 있다. 이 그룹의 모든 레이아웃 주장이 무의미해진다",
    ).toBe(false);
    expect(state.pxBreakpoint, "레포의 px 미디어 쿼리는 그대로여야 한다").toBe(true);
  });

  for (const width of TEXT_ZOOM_WIDTHS) {
    for (const route of TEXT_ZOOM_ROUTES) {
      test(`${route} · ${width}px — 잘린 채 닿을 수 없는 글자가 없다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );

        const cut = (await page.evaluate(eval(CUT_TEXT))) as string[];
        expect(
          cut,
          "잘린 채 나머지를 볼 방법이 없는 글자가 있다. 줄임표·라인 클램프·스크롤러 중\n" +
            "하나라도 있으면 좁은 상자의 설계된 동작이지만, 셋 다 없으면 독자는 그 글자에\n" +
            "닿을 수 없다. html·body 가 둘 다 overflow-x: hidden 이라 문서 scrollWidth\n" +
            "로는 이걸 절대 못 본다.\n" +
            cut.join("\n"),
        ).toEqual([]);
      });
    }
  }

  for (const width of [600, 768] as const) {
    test(`${width}px — 하단 탭 바가 예약한 자리에 실제로 들어간다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
      // The bar mounts with the below-`lg` shell rather than with the route, so it is waited
      // for by name — an absent bar would otherwise read as a reserve that fits.
      await page
        .locator('[data-testid^="bottom-tab-"]')
        .first()
        .waitFor({ state: "attached", timeout: 30_000 });

      // A reserve derived from a `min-height` is a reserve only while the minimum binds. The
      // bar is an icon shell plus a gap plus one `leading-caption` line, and that line now
      // follows the reader: measured before the repair, the bar stood 73.13px tall against a
      // 56px reserve and three text leaves on this route at 600 wide sat behind it.
      //
      // ⚠️ **This asserts the token, not every consumer of it.** Two things a bigger reserve
      // cannot reach were measured on this route at a 32px root and are recorded with the
      // other open costs in `docs/DECISIONS.md` rather than gated here: the frontmatter
      // disclosure's box is 178px tall around 375–449px of content with `overflow: visible`,
      // so its lines paint past any reserve; and the reading scroller's own box ends well
      // above the bar, so which box owes the bar room is a question about that view. Gating
      // either would make this test unfixable by the token it is about.
      const measured = await page.evaluate(() => {
        const item = document.querySelector('[data-testid^="bottom-tab-"]');
        // The bar is whichever ancestor is actually pinned to the bottom; the markup's own
        // element is not a `nav`, so the fixed ancestor is what is looked for.
        let bar: HTMLElement | null = null;
        for (let node = item?.parentElement ?? null; node; node = node.parentElement) {
          const position = getComputedStyle(node).position;
          if (position === "fixed" || position === "sticky") {
            bar = node;
            break;
          }
        }
        bar ??=
          (item?.closest('nav,[class*="fixed"]') as HTMLElement | null) ??
          (item?.parentElement as HTMLElement | null) ??
          null;
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:absolute;visibility:hidden;transition:none;width:var(--topology-mobile-bottom-tab-reserve)";
        document.body.appendChild(probe);
        const reserve = probe.getBoundingClientRect().width;
        probe.remove();
        if (!bar) return { reserve, barHeight: null as number | null };
        const barRect = bar.getBoundingClientRect();
        return { reserve, barHeight: barRect.height };
      });

      expect(measured.barHeight, "하단 탭 바를 못 찾았다 — 측정 대상이 없다").not.toBeNull();
      expect(
        measured.reserve,
        `예약(${measured.reserve}px)이 바의 실제 높이(${measured.barHeight}px)보다 작다`,
      ).toBeGreaterThanOrEqual(measured.barHeight!);

    });
  }

  test("게이트웨이 헤드라인이 자기 섹션 제목보다 작아지지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/ko/download/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    // `--text-monument`'s `cqw` term cannot be reached by text zoom, so while its floor was
    // `40px` the `h1` stood at 40px (768) and 44.54px (1024) under its own 46px `h2`s — a page
    // whose headline was smaller than its sections. The floor is `2.5rem` now, the same 40px
    // at the default root.
    const sizes = await page.evaluate(() => {
      const size = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize);
      const painted = (el: Element) => el.getBoundingClientRect().width > 2;
      return {
        h1: [...document.querySelectorAll("h1")].filter(painted).map(size),
        h2: [...document.querySelectorAll("h2")].filter(painted).map(size),
      };
    });
    expect(sizes.h1.length, "h1 이 없다 — 측정 대상이 없다").toBeGreaterThan(0);
    expect(sizes.h2.length, "h2 가 없다 — 비교 대상이 없다").toBeGreaterThan(0);
    expect(Math.min(...sizes.h1)).toBeGreaterThanOrEqual(Math.max(...sizes.h2));
  });
});
