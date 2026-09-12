import { waitForDocumentPaint } from './visual-ready';
import { test, expect } from "@playwright/test";
import { AUDITED_ROUTES } from "./audited-routes";
import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { PAGE_FRAME_FORM } from "@/shared/ui/page-frame";

/** The form column's rendered max width, read from the spec so a re-decided value cannot drift. */
const FORM_FRAME_WIDTH = /max-w-\[(\d+px)\]/.exec(PAGE_FRAME_FORM)?.[1] ?? "";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { waitForBoxStill } from "./settle";

/**
 * The route has arrived and its layout has stopped moving.
 *
 * Every measurement below is a rect or a scroll height, so it has to be taken on a laid
 * out screen. The 900 and 1,200 ms sleeps this replaces were two guesses at hydration
 * finishing on this machine.
 */
async function routeSettled(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await waitForBoxStill(page.locator("body"));
}


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
 * What a page wearing `PAGE_FRAME` must reserve at the bottom at `≥lg` — the frame's
 * `--page-bottom-breath` (40px), minus the same subpixel slack `MIN_GAP` allows.
 *
 * It is deliberately **not** read from the token at runtime: a check that recomputes its own
 * expectation from the thing it is checking cannot fail. If the breath is re-decided, this number
 * moves in the same diff, and `page-frame.contract.test.ts` is where that decision is recorded.
 */
const MIN_FRAME_RESERVE = 36;

/**
 * How far the last ink must sit **above the floating «back to top» pill's top edge**.
 *
 * The reserve the pane declares is the pill's inset plus its height plus 12px of breath
 * (`--doc-reading-back-to-top-clearance`), which measured 64px of clearance on 2026-09-08.
 * 8 is subpixel slack over "not touching" — a deliberately low bar, because the defect this
 * guards is the line being **under** the pill, and a number tuned to today's reserve would
 * fail on a re-decided one instead of on a regression.
 */
const MIN_PILL_CLEARANCE = 8;

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
  // The installed app's opening window — `tauri.conf.json` main window content size. Before
  // this entry, neither size the macOS app actually opens at was ever measured here.
  { label: "desktop-1512x900", w: 1512, h: 900 },
  // The app's window floor (`minWidth`/`minHeight`). `tauri-plugin-window-state` restores the
  // owner's last size, so the floor is a routine first viewport, not an occasional one. Still
  // `≥lg` (1024): no tab bar; the `lg:pb-10` 40px `--page-bottom-breath` reservation applies.
  { label: "desktop-1040x720", w: 1040, h: 720 },
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
  /**
   * **What the page itself reserves at the bottom, and whether it wears the page frame.**
   *
   * `gap` alone cannot tell "the frame reserved 40px" from "the last card happened to have 28px of
   * its own padding" — measured 2026-09-05 with the reservation deliberately removed, the gap on
   * `/ko/mcp/` was **28px**, over `MIN_GAP` and therefore green, while the page reserved nothing at
   * all. So the reservation is read directly.
   *
   * Frame membership is detected from the **rendered** max width rather than from a class name: a
   * class assertion belongs in `page-frame.contract.test.ts`, and this file's job is pixels.
   *
   * ⚠️ **There are two frames, and this detector once knew only one** (2026-09-06). It compared the
   * root's max width with `--page-max` alone, so when `/agents` and `/mcp` moved onto the 960 form
   * column they stopped being recognised as framed at all — and at 1040/1280/1512 the count of
   * routes ④ judged fell to **zero**, which the idling guard below caught exactly as it was written
   * to. The widths come from `page-frame.ts` rather than from a literal here, so a re-decided 960
   * cannot leave this file measuring the old one.
   */
  framed: boolean;
  /** The rendered max width that made `framed` true — which of the two frames this page wears. */
  frameWidth: string;
  rootPaddingBottom: number;
};

async function measure(page: import("@playwright/test").Page): Promise<Measured> {
  return page.evaluate((formWidth) => {
    const slot = [...document.querySelectorAll("div")].find(
      (d) =>
        getComputedStyle(d).overflowY === "auto" &&
        (d.parentElement?.className ?? "").includes("flex min-h-0 flex-1"),
    );
    if (!slot) {
      return {
        slot: false,
        scrollable: false,
        rootHeight: 0,
        scrollHeight: 0,
        gap: null,
        tabClearance: null,
        framed: false,
        frameWidth: "",
        rootPaddingBottom: 0,
      };
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
    const rootStyle = root ? getComputedStyle(root) : null;
    const pageMax = getComputedStyle(document.documentElement).getPropertyValue("--page-max").trim();
    const widths = [pageMax, formWidth].filter(Boolean);
    return {
      slot: true,
      framed: Boolean(rootStyle && widths.includes(rootStyle.maxWidth)),
      frameWidth: rootStyle && widths.includes(rootStyle.maxWidth) ? rootStyle.maxWidth : "",
      rootPaddingBottom: rootStyle ? Math.round(Number.parseFloat(rootStyle.paddingBottom) || 0) : 0,
      scrollable: slot.scrollHeight > slot.clientHeight + 1,
      rootHeight: Math.round(root?.getBoundingClientRect().height ?? 0),
      scrollHeight: Math.round(slot.scrollHeight),
      gap: Number.isFinite(inkBottom) ? Math.round(slotRect.bottom - inkBottom) : null,
      tabClearance:
        bottomBar && Number.isFinite(inkBottom)
          ? Math.round(bottomBar.getBoundingClientRect().top - inkBottom)
          : null,
    };
  }, FORM_FRAME_WIDTH);
}

for (const vp of VIEWPORTS) {
  test(`스크롤 끝 하단 여백 — ${vp.label}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });

    const violations: string[] = [];
    let scrolledRoutes = 0;
    /** How many routes the shell body slot was actually found on. */
    let slotRoutes = 0;
    /** How many routes ④ actually judged. 0 at a desktop width means that check never ran. */
    let framedRoutes = 0;
    /** Which frame widths ④ actually saw — both must appear, or one frame is unmeasured. */
    const framedWidths = new Set<string>();
    /** How many routes ③ actually judged. 0 means that check never ran. */
    let tabMeasured = 0;

    for (const [label, url] of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForDocumentPaint(page);
      await waitForBoxStill(page.locator("body"));
      const m = await measure(page);
      if (!m.slot) {
        expect(
          SLOTLESS_ROUTES.has(url),
          `${label}: 셸 본문 슬롯을 못 찾았다 — 셸 구조가 바뀌면 이 게이트가 죽는다`,
        ).toBe(true);
        continue;
      }
      slotRoutes += 1;

      /*
       * ④ **A page wearing the frame reserves the desktop breath, scrolling or not.**
       *
       * This sits **above** the `scrollable` guard on purpose. Two destinations (`/agents`,
       * `/mcp`) are shorter than the viewport in the state this file opens them in — nothing is
       * attached — so every check below was skipped for them on every desktop pass, and a real
       * defect shipped underneath: `PAGE_FRAME` reserved nothing at the bottom at `lg`, and with a
       * folder open the last card sat flush against the installed app's window edge. Planting that
       * defect left all three desktop passes green.
       *
       * A reservation is measurable whether or not the page is long enough to need it today, which
       * is exactly why it is the part that can be judged here.
       */
      if (vp.w >= BOTTOM_TAB_BAR_MAX_WIDTH && m.framed) {
        framedRoutes += 1;
        framedWidths.add(m.frameWidth);
        if (m.rootPaddingBottom < MIN_FRAME_RESERVE) {
          violations.push(
            `${label}: 페이지 틀을 입고도 데스크톱 바닥 예약이 ${m.rootPaddingBottom}px (< ${MIN_FRAME_RESERVE})`,
          );
        }
      }

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
    /*
     * ④'s idling guard, the same shape as ③'s. `framed` is detected from the rendered max width,
     * so a shell change or a token rename would silently take every frame member out of view and
     * this check would pass while measuring nothing — which is the exact failure mode that let the
     * reservation defect through in the first place.
     */
    if (vp.w >= BOTTOM_TAB_BAR_MAX_WIDTH) {
      expect(
        framedRoutes,
        `${vp.label}: 페이지 틀을 입은 라우트를 한 번도 못 찾았다 — ④ 검사가 통째로 공회전했다. ` +
          `틀이 사라졌거나(그러면 계약이 바뀐 것) --page-max 판별이 낡았다.`,
        ).toBeGreaterThan(1);
      /*
       * ⚠️ **The frame that moved is the one that must be seen.** `/agents` and `/mcp` are the two
       * routes ④ has ever actually judged, and on 2026-09-06 they moved onto the 960 form column.
       * A detector that still knew only `--page-max` would have kept passing on the day the
       * reservation stopped being measured, so the width itself is asserted rather than only the
       * count.
       *
       * ⚠️ **A named gap, not a silent one:** the two wide-frame members among the audited routes
       * (`/ko/projects/`, `/ko/ontology/insights/`) are *not* reached by this measurement — their
       * page root is not the slot child this function reads, which is why removing the two narrow
       * members earlier took `framedRoutes` to **zero** rather than to two. That is older than this
       * change and is left as it is rather than widened here; the class layer of the same
       * prescription is covered by `page-frame.contract.test.ts` for every member.
       */
      expect(
        [...framedWidths],
        `${vp.label}: 960 폼 틀을 한 번도 계측하지 못했다 — 폭 판별이 옛 틀만 안다`,
      ).toContain(FORM_FRAME_WIDTH);
    }

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

/**
 * **The routes above are opened with no folder, and two of them are short in that state.**
 *
 * Measured 2026-09-05 at 1040×720 and 1512×900: with nothing attached, `/mcp` is 533px and
 * `/agents` 228px inside a 720px slot. `!m.scrollable` skips them before any assertion runs, so
 * both were carried through every desktop pass **without being judged once** — and a defect
 * shipped underneath that: `PAGE_FRAME` reserved nothing at the bottom at `lg`, so with a folder
 * open the last card sat flush against the bottom edge of the installed app's window. Planting
 * that exact defect and re-running the three desktop passes above left all three green.
 *
 * A gate that cannot reach a state cannot judge it. So this opens the folder first, which is the
 * state those screens are actually used in, and measures the same three checks there. The routes
 * are the frame family plus the two tabs of `/mcp`, because a tab is a different document height
 * and the frame is what both of them lean on.
 *
 * Two viewports, both `≥lg`: the app's window floor and the width where content most reliably
 * exceeds the viewport. Below `lg` the reservation is the per-surface tab-bar reserve, which the
 * pass above already measures on every route.
 */
const VAULT_ROUTES = [
  "/ko/mcp/",
  "/ko/mcp/?tab=connectors",
  "/ko/agents/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  // Docs joined on 2026-09-05: with a folder open its sidebar grew two capped lists above
  // the tree, so the column's own scroll end is a thing that can now be reached and cut.
  "/ko/docs/",
  // The Library joined on 2026-09-06, when those two lists left Docs for their own
  // destination. Both halves of this screen can be taller than the window with a folder
  // open — the index when the folder holds many files, and the reader on any long wiki
  // page — and the no-folder pass above cannot reach either.
  "/ko/library/",
] as const;

const VAULT_VIEWPORTS = [
  { label: "desktop-1040x720", w: 1040, h: 720 },
  { label: "desktop-1280x700", w: 1280, h: 700 },
] as const;

for (const vp of VAULT_VIEWPORTS) {
  test(`스크롤 끝 하단 여백 — 폴더를 연 ${vp.label}`, async ({ page }) => {
    test.setTimeout(180_000);
    // The Library measurement below needs a wiki page long enough to scroll; the shared
    // fixture is map-only, so this pass adds one source and one long page of its own.
    await stubDirectoryPicker(page, {
      ...FIXTURE_VAULT,
      "sources/handover.txt": "Handover notes\nline two\n",
      "wiki/handover.md": [
        "---",
        "title: Handover",
        "created_by: agent:claude",
        "compiled_at: 2026-09-06T10:00:00Z",
        "sources:",
        "  - sources/handover.txt",
        "source_hash:",
        "  sources/handover.txt: " + "a".repeat(64),
        "status: draft",
        "summary: A long page.",
        "---",
        "",
        "## Summary",
        "",
        "A long page, so the reader scrolls.",
        "",
        "## Facts",
        "",
        ...Array.from({ length: 40 }, (_, i) => `- Fact number ${i + 1} of the handover. [[src:sources/handover.txt#l1]]`),
        "",
        "## Decisions",
        "",
        "## Open questions",
        "",
        "## Not in sources",
        "",
        /*
         * The trailing sections carry a line each **on purpose**. Left empty, the page's last
         * painted ink stopped 176px above the back-to-top pill, so check ⑥ below could not
         * reach the thing it measures: with the reserve deliberately removed the whole pass
         * stayed green (probed 2026-09-08). A fixture that cannot reach the defect is not a
         * fixture.
         */
        "- Nothing outside the gathered sources is claimed on this page.",
        "- The last line of the page, which is what check ⑥ measures against the pill.",
        "",
      ].join("\n"),
    });
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });

    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
    await expect(
      page.getByTestId("first-run-starter"),
      "볼트가 안 물렸다 — 아래 측정은 전부 무의미하다",
    ).toHaveCount(0, { timeout: 30_000 });

    const violations: string[] = [];
    let scrolledRoutes = 0;

    for (const url of VAULT_ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await routeSettled(page);
      const m = await measure(page);
      expect(m.slot, `${url}: 셸 본문 슬롯을 못 찾았다 — 셸 구조가 바뀌었다`).toBe(true);
      if (!m.scrollable) continue;
      scrolledRoutes += 1;

      if (m.rootHeight < m.scrollHeight - 1) {
        violations.push(`${url}: 페이지 루트가 압축됐다 (박스 ${m.rootHeight} < 내용 ${m.scrollHeight})`);
      }
      if (m.gap === null) {
        violations.push(`${url}: 잉크를 하나도 못 찾았다 — 계측 실패이지 통과가 아니다`);
      } else if (m.gap < MIN_GAP) {
        violations.push(`${url}: 스크롤 끝 하단 여백 ${m.gap}px (< ${MIN_GAP})`);
      }
    }

    /*
     * The idling guard this whole test exists because of. If the folder stopped attaching, or the
     * screens became short again, every assertion above would pass while measuring nothing — which
     * is precisely how the pass above stayed green over a live defect.
     */
    expect(
      scrolledRoutes,
      `${vp.label}: 폴더를 열고도 스크롤되는 라우트가 없다 — 이 검사가 통째로 공회전했다`,
    ).toBeGreaterThan(0);

    /*
     * ⑤ **The Library scrolls inside its own boxes, not in the shell slot.** Its `<main>` is
     * `overflow-hidden` with the index column and the reading pane scrolling within it, so
     * the slot above never scrolls and every check above skipped this destination on every
     * pass (design-workbench, council 2026-09-07). Measure the two inner scrollers directly:
     * the wiki reader with a page open, and the index column.
     */
    await page.goto("/ko/library/", { waitUntil: "domcontentloaded" });
    await routeSettled(page);
    await page.getByTestId("library-index-segment-wiki").click({ timeout: 15_000 });
    const firstPage = page.locator('[data-testid^="library-wiki-wiki/"]').first();
    expect(await firstPage.count(), "/ko/library/: the fixture's wiki page is not listed — nothing below is measured").toBeGreaterThan(0);
    {
      await firstPage.click();
      await page.getByTestId("library-reading-pane").waitFor({ timeout: 15_000 });
      await waitForBoxStill(page.getByTestId("library-reading-pane"));
      const reader = await measureInner(page, '[data-testid="library-reading-pane"]');
      if (reader.scrollable) {
        if (reader.gap === null) violations.push("/ko/library/ reader: 잉크를 하나도 못 찾았다 — 계측 실패이지 통과가 아니다");
        else if (reader.gap < MIN_GAP) violations.push(`/ko/library/ reader: 스크롤 끝 하단 여백 ${reader.gap}px (< ${MIN_GAP})`);
        /*
         * ⑥ **The gap must clear the thing standing in it, not merely exist.**
         *
         * The reading pane lays a floating «back to top» pill over its own scroll area, so
         * at the end of the scroll the page stops and the pill stays on top of whatever is
         * beneath it. ⑤ could not see that: it measures to the scroller's bottom **edge**,
         * and the pill's own body is 60px above that edge. Owner report on the installed
         * app, 2026-09-08 — at the foot of the Library's check results the pill covered the
         * "N more names" fold chip and hid its words — while this file was green, because
         * the gap at the edge was 52px.
         *
         * So the yardstick here is the pill's top edge, not the scroller's bottom. Measured
         * the same day on the wiki reader before the fix: −8px at 1400×860, 1200×800 and
         * 1040×720 alike (at 1040 that was 60px of the last line's width behind the pill),
         * and +64px after it.
         */
        const pill = await measureBackToTopClearance(page, '[data-testid="library-reading-pane"]');
        if (pill === null) {
          violations.push(
            "/ko/library/ reader: 「맨 위로」 알약이나 잉크를 못 찾았다 — ⑥가 통째로 공회전했다",
          );
        } else if (pill < MIN_PILL_CLEARANCE) {
          violations.push(`/ko/library/ reader: 마지막 줄이 「맨 위로」 알약에 가렸다 (여유 ${pill}px)`);
        }
      }
    }
    const index = await measureInner(page, '[data-testid="library-index-scroll"]');
    if (index.scrollable) {
      if (index.gap === null) violations.push("/ko/library/ index: 잉크를 하나도 못 찾았다 — 계측 실패이지 통과가 아니다");
      else if (index.gap < MIN_GAP) violations.push(`/ko/library/ index: 스크롤 끝 하단 여백 ${index.gap}px (< ${MIN_GAP})`);
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
}

/**
 * How far the last painted ink sits **above the floating «back to top» pill** at the end of
 * the scroll, inside one reading pane. Negative means the ink is behind the pill.
 *
 * `null` is **a measurement failure, not a pass** — the pane always renders the pill (it
 * fades rather than unmounting), so not finding one means the structure changed and the
 * caller must say so rather than skip.
 *
 * ⚠️ The pill is a *sibling* of the scroll container, not a descendant, so its own rect
 * must be excluded from the ink walk by construction: only the scroller is walked.
 */
async function measureBackToTopClearance(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<number | null> {
  return page.evaluate((sel) => {
    const pane = document.querySelector<HTMLElement>(sel);
    if (!pane) return null;
    const pill = pane.querySelector<HTMLElement>('[data-testid="back-to-top-button"]');
    if (!pill) return null;
    const scrolls = (el: HTMLElement) => {
      const overflow = getComputedStyle(el).overflowY;
      return (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 1;
    };
    const scroller = [...pane.querySelectorAll<HTMLElement>("*")]
      .filter(scrolls)
      .sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (!scroller) return null;
    scroller.scrollTop = scroller.scrollHeight;
    let lastInk = -Infinity;
    for (const el of scroller.querySelectorAll<HTMLElement>("*")) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 2 || rect.width <= 2) continue;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
      lastInk = Math.max(lastInk, rect.bottom);
    }
    if (!Number.isFinite(lastInk)) return null;
    return Math.round(pill.getBoundingClientRect().top - lastInk);
  }, selector);
}

/**
 * The scroll-end gap of one inner scroller: the box itself when it scrolls, else the first
 * descendant that does. Scrolls to the end, then measures from the last painted ink to the
 * scroller's bottom edge — the same yardstick `measure()` uses for the shell slot.
 */
async function measureInner(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<{ scrollable: boolean; gap: number | null }> {
  return page.evaluate((sel) => {
    const host = document.querySelector<HTMLElement>(sel);
    if (!host) return { scrollable: false, gap: null };
    const scrolls = (el: HTMLElement) => {
      const overflow = getComputedStyle(el).overflowY;
      return (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 1;
    };
    const scroller = scrolls(host)
      ? host
      : [...host.querySelectorAll<HTMLElement>("*")].find(scrolls) ?? null;
    if (!scroller) return { scrollable: false, gap: null };
    scroller.scrollTop = scroller.scrollHeight;
    const bottom = scroller.getBoundingClientRect().bottom;
    // Last ink — a container's bottom padding is spacing, not content, so only leaves count.
    let lastInk = -Infinity;
    for (const el of scroller.querySelectorAll<HTMLElement>("*")) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 2 || rect.width <= 2) continue;
      lastInk = Math.max(lastInk, rect.bottom);
    }
    if (!Number.isFinite(lastInk)) return { scrollable: true, gap: null };
    return { scrollable: true, gap: Math.round(bottom - lastInk) };
  }, selector);
}
