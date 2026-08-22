import { test, expect } from "@playwright/test";
import { AUDITED_ROUTES } from "./audited-routes";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Whether the bottom gap survives at the end of a scroll — the shell body slot's
 * no-compression contract.
 *
 * **What it guards.** The shell body slot (`AppShell`'s `overflow-y-auto` column)
 * is the scroll container. The page root uses `min-h-full` to fill the slot, and
 * that explicit min-height overrides a flex item's automatic minimum size (its
 * content height). So when content grew taller than the viewport, flex
 * **compressed** the page box down to the viewport height; the content spilled out
 * as visible overflow so scrolling still worked, but the bottom reservation the
 * page declared clung to the bottom of the shrunken box and vanished at the end of
 * the scroll.
 *
 * Measured at 1512×950 at the time of the defect: on the download page the last
 * line of text sat **flush against** the bottom of the viewport (0px gap), and at
 * 768 the last line of the project detail was **17px behind** the bottom tab bar.
 * Per the touch contract in `.claude/rules/design.md`, being hidden behind the tab
 * bar is a defect.
 *
 * **Why e2e and not a unit test.** This defect is **the result of layout
 * computation**. jsdom performs no layout and can reproduce neither the
 * compression nor the scroll-end gap — a class-string assertion
 * (`AppShell.test.tsx`) only checks the prescription is in place, not that it
 * actually recovers pixels. Both layers are kept.
 */

/** The measured minimum reservation is 40px (`lg:pb-10`). 24 only absorbs subpixel jitter. */
const MIN_GAP = 24;

/**
 * Uses the **canonical** audited-route list as is (2026-08-06).
 *
 * **Why it moved off a hand-picked five.** The previous list was five hand-written
 * lines and **nobody had recorded why those five**. That blind spot hid a real
 * defect: `/` (the gateway) was not on the list, and there the last line sat
 * **17px** behind the bottom tab bar (at both 390 and 768, re-confirmed against the
 * production static export).
 *
 * Worse is **why it was not caught**. `/` and `/download` render the same gateway
 * view, but the tab bar stands only on `/` (`shouldHideBottomTabBar` hides it on
 * `/download` alone). What was on the list was the side **without** the tab bar,
 * and with no tab bar `tabClearance` is `null` and check ③ below is **silently
 * skipped**. The same screen was being measured only from the side where the check
 * is disabled.
 *
 * So three things were fixed together: the list became canonical, phone width
 * joined the matrix, and ③ now fails if it never ran (`tabMeasured` below). Since
 * `audited-route-coverage.contract.test.ts` already forces a new route into the
 * canonical list, this gate follows automatically — one fewer hand-maintained
 * list.
 */
const ROUTES = AUDITED_ROUTES.map((url) => [url, url] as const);

/** The width where the bottom tab bar stands — `BottomTabBar` is `lg:hidden`, so below 1024. */
const BOTTOM_TAB_BAR_MAX_WIDTH = 1024;

/**
 * Routes where **having no shell body slot is correct**.
 *
 * The 404 is rendered by the root `app/not-found.tsx` **outside** the shell (a fact
 * `audited-routes.ts` records from measurement). So a missing slot here is not a
 * defect — the scroll contract simply does not apply.
 *
 * ⚠️ If the slot disappears on a route **not** in this set, the shell structure has
 * changed and the assertion below fails. Collapsing it into "skip when there is no
 * slot" would let the gate silently skip everything and go green even when the
 * whole shell changed.
 */
const SLOTLESS_ROUTES = new Set(
  AUDITED_ROUTES.filter((url) => url.includes("this-route-does-not-exist")),
);

const VIEWPORTS = [
  // A combination where all routes scroll — the "content > viewport" needed to reproduce compression.
  { label: "desktop-1280x700", w: 1280, h: 700 },
  // `<lg` — the width where the bottom tab bar stands and the page contracts its reservation.
  { label: "tablet-768x950", w: 768, h: 950 },
  // Phone. Absent from the previous matrix, leaving **the narrowest width with a tab bar** unmeasured.
  { label: "phone-390x844", w: 390, h: 844 },
] as const;

type Measured = {
  slot: boolean;
  scrollable: boolean;
  rootHeight: number;
  scrollHeight: number;
  /**
   * The gap remaining below the last "ink" at the end of a scroll.
   *
   * **`null` when no ink is found at all.** This used to return `0` in that case,
   * and since `0 < MIN_GAP` **a measurement failure was reported as a "0px gap
   * violation"** (measured 2026-08-06 on `/ko/project/storefront/`). Failing to
   * measure is neither a pass nor a failure but **a measurement failure**, and the
   * caller must say so.
   */
  gap: number | null;
  /** When a fixed bottom tab bar exists, how far the last ink sits above it. */
  tabClearance: number | null;
};

async function measure(page: import("@playwright/test").Page): Promise<Measured> {
  return page.evaluate(() => {
    const slot = [...document.querySelectorAll("div")].find(
      (d) =>
        getComputedStyle(d).overflowY === "auto" &&
        (d.parentElement?.className ?? "").includes("flex min-h-0 flex-1"),
    );
    if (!slot) {
      return { slot: false, scrollable: false, rootHeight: 0, scrollHeight: 0, gap: null, tabClearance: null };
    }
    /**
     * The page root — **not the first child.**
     *
     * Next injects `<script>` inside this slot too, and when that is the first child
     * the previous code took a zero-height node as the page root and **found no ink at
     * all** (measured 2026-08-06 on `/ko/project/storefront/`: the slot's children were
     * `[SCRIPT, SCRIPT, DIV(1004px)]` — `rootHeight 0`, 0 ink). Pick the first child
     * that has a box.
     */
    const root = ([...slot.children] as HTMLElement[]).find(
      (el) => el.getBoundingClientRect().height > 0,
    ) ?? null;
    slot.scrollTop = slot.scrollHeight;

    /**
     * Anything an ancestor clipped is **not this page's ink.**
     *
     * The desktop table of contents on `/ko/changelog/` is a sticky sidebar with its
     * own scroll (`max-h-[…] overflow-y-auto`), so its item rects extend far outside
     * the sidebar. The previous code counted one as the page's last ink and produced a
     * **false violation of `gap −184px`** (measured 2026-08-06 at 1280×700 — the
     * sidebar spans 63.8–619.8 while the ink found was at 883.8).
     *
     * The slot itself is not inspected — the slot is the container we scrolled to the
     * end, and what sits lowest inside it is exactly what we want to measure.
     */
    /**
     * Returns the **visible bottom edge** after ancestor clipping, or `null` when
     * fully outside.
     *
     * ⚠️ Checking only "is it fully outside" is not enough (code review 2026-08-07). A
     * child **straddling** the clipping box's bottom edge is not fully outside, so it
     * passes and its `bottom` — including the clipped, invisible part — is used as is.
     * The `/ko/changelog/` sidebar false violation this function exists to prevent
     * then reappears with nothing more than a different scroll position or viewport.
     * So the value is **clamped** by intersection.
     */
    const visibleBottom = (el: Element, r: DOMRect): number | null => {
      let bottom = r.bottom;
      for (let n = el.parentElement; n && n !== slot; n = n.parentElement) {
        if (getComputedStyle(n).overflow === "visible") continue;
        const nr = n.getBoundingClientRect();
        if (r.top > nr.bottom || r.bottom < nr.top) return null;
        bottom = Math.min(bottom, nr.bottom);
      }
      return bottom;
    };

    // Last ink — a container's bottom padding is spacing, not content, so only leaves are inspected.
    let inkBottom = Number.NEGATIVE_INFINITY;
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        const cs = getComputedStyle(child);
        if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        if ((child.className ?? "").toString().includes("sr-only")) continue;
        /**
         * ⚠️ **A closed `<details>`'s content has a box but is not ink.**
         *
         * Recent Chromium hides a closed disclosure with `content-visibility: hidden`
         * rather than `display: none` (changed behaviour, for the expand animation). It
         * passes all three conditions above while being absent from the screen — measured
         * 2026-07-29: the collapsed trust section on `/download` became 561px of phantom
         * ink and drove the bottom gap to −505px. `checkVisibility()` is the standard
         * test.
         */
        if (typeof child.checkVisibility === "function" && !child.checkVisibility()) continue;
        const r = child.getBoundingClientRect();
        if (child.children.length === 0 && r.height > 2 && r.width > 2 && r.bottom > inkBottom) {
          const shown = visibleBottom(child, r);
          if (shown !== null && shown > inkBottom) inkBottom = shown;
        }
        walk(child);
      }
    };
    if (root) walk(root);

    const bottomBar = [...document.querySelectorAll("*")].find((el) => {
      const s = getComputedStyle(el);
      if (s.position !== "fixed") return false;
      /**
       * A decorative layer that takes no pointer events is not a bar (caught during the
       * 2026-08-18 remake). The gateway's field canvas (`gateway-fx-field`) is
       * `fixed inset-0` and satisfied every previous condition (height > 20, touching the
       * bottom, width > 50%); with top = 0 it produced a false clearance violation around
       * −700px. A real bar is **a low strip pinned to the bottom** — anything taller than
       * half the screen is a background, not a bar, and something with
       * `pointer-events: none` has no authority to obscure content in the first place.
       */
      if (s.pointerEvents === "none") return false;
      const r = el.getBoundingClientRect();
      return (
        r.height > 20 &&
        r.height < window.innerHeight * 0.5 &&
        r.bottom >= window.innerHeight - 2 &&
        r.width > window.innerWidth * 0.5
      );
    });

    const slotRect = slot.getBoundingClientRect();
    return {
      slot: true,
      scrollable: slot.scrollHeight > slot.clientHeight + 1,
      rootHeight: Math.round(root?.getBoundingClientRect().height ?? 0),
      scrollHeight: Math.round(slot.scrollHeight),
      gap: Number.isFinite(inkBottom) ? Math.round(slotRect.bottom - inkBottom) : null,
      tabClearance:
        bottomBar && Number.isFinite(inkBottom)
          ? Math.round(bottomBar.getBoundingClientRect().top - inkBottom)
          : null,
    };
  });
}

for (const vp of VIEWPORTS) {
  test(`스크롤 끝 하단 여백 — ${vp.label}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });

    const violations: string[] = [];
    let scrolledRoutes = 0;
    /** How many routes the shell body slot was actually found on. */
    let slotRoutes = 0;
    /** How many routes ③ actually judged. 0 means that check never ran. */
    let tabMeasured = 0;

    for (const [label, url] of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const m = await measure(page);
      if (!m.slot) {
        expect(
          SLOTLESS_ROUTES.has(url),
          `${label}: 셸 본문 슬롯을 못 찾았다 — 셸 구조가 바뀌면 이 게이트가 죽는다`,
        ).toBe(true);
        continue;
      }
      slotRoutes += 1;
      if (!m.scrollable) continue;
      scrolledRoutes += 1;

      // ① No compression — the page box must carry the content height for the reservation to stay in place.
      if (m.rootHeight < m.scrollHeight - 1) {
        violations.push(
          `${label}: 페이지 루트가 압축됐다 (박스 ${m.rootHeight} < 내용 ${m.scrollHeight})`,
        );
      }
      // ② A gap must remain at the end of the scroll. **Failing to measure is not a pass.**
      if (m.gap === null) {
        violations.push(
          `${label}: 잉크를 하나도 못 찾았다 — 계측 실패이지 통과가 아니다 (슬롯 구조가 바뀌었나)`,
        );
      } else if (m.gap < MIN_GAP) {
        violations.push(`${label}: 스크롤 끝 하단 여백 ${m.gap}px (< ${MIN_GAP})`);
      }
      // ③ With a bottom tab bar present, nothing may slip behind it.
      if (m.tabClearance !== null) {
        tabMeasured += 1;
        if (m.tabClearance < MIN_GAP) {
          violations.push(`${label}: 마지막 줄이 하단 탭바에 가렸다 (여유 ${m.tabClearance}px)`);
        }
      }
    }

    // Gate liveness — no scrolling route at all is a defect, not a pass.
    expect(scrolledRoutes, "스크롤되는 라우트가 없다 — 매트릭스가 결함을 못 본다").toBeGreaterThan(1);

    // The slot-found route count is asserted **as a derived value** — pinning a
    // number by hand means a person must follow every route addition, and a gate goes
    // stale when they do not.
    expect(
      slotRoutes,
      "셸 본문 슬롯이 있어야 하는 라우트 수가 안 맞는다 — 셸 구조나 404 배선이 바뀌었다",
    ).toBe(ROUTES.length - SLOTLESS_ROUTES.size);

    /**
     * Asserts that ③ **judged at least once**.
     *
     * `tabClearance` is `null` when no tab bar is found, and `null` silently skips the
     * check above. The previous list held only routes without a tab bar, so this check
     * **never ran once** while the test stayed green — that is how the 17px occlusion
     * stayed hidden. At widths where the tab bar stands, at least one route must
     * actually be judged.
     */
    if (vp.w < BOTTOM_TAB_BAR_MAX_WIDTH) {
      expect(
        tabMeasured,
        `${vp.label}: 하단 탭바를 한 번도 못 찾았다 — ③ 검사가 통째로 공회전했다. ` +
          `탭바가 사라졌거나(그러면 이 폭의 계약이 바뀐 것) 셀렉터가 낡았다.`,
      ).toBeGreaterThan(0);
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
}
