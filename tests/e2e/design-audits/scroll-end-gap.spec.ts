import { waitForDocumentPaint } from '../visual-ready';
import { test, expect } from "@playwright/test";
import { AUDITED_ROUTES } from "../audited-routes";
import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { PAGE_FRAME_FORM } from "@/shared/ui/tokens/page-frame";

/** The form column's rendered max width, read from the spec so a re-decided value cannot drift. */
const FORM_FRAME_WIDTH = /max-w-\[(\d+px)\]/.exec(PAGE_FRAME_FORM)?.[1] ?? "";
import { stubDirectoryPicker } from "../vault-picker-stub";
import { waitForBoxStill } from "../settle";

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
 * How far the last ink must sit above the floating back-to-top pill's top edge. The pane reserves
 * the pill's inset plus its height plus 12px (`--doc-reading-back-to-top-clearance`). 8 is
 * subpixel slack, deliberately low: the defect is the line being under the pill.
 */
const MIN_PILL_CLEARANCE = 8;

/**
 * Uses the canonical audited-route list; `audited-route-coverage.contract.test.ts` forces a new
 * route into it, so this gate follows automatically. The tab-bar check judges only a fixed
 * bottom strip that stands at a desktop width.
 */
const ROUTES = AUDITED_ROUTES.map((url) => [url, url] as const);

/** `/docs` without a target is a redirect; the audit measures its canonical Ontology reader. */
function auditDestination(url: string) {
  return url === "/ko/docs/" ? "/ko/library/?tab=ontology" : url;
}

async function waitForAuditDestination(
  page: import("@playwright/test").Page,
  sourceUrl: string,
) {
  if (sourceUrl !== "/ko/docs/") return;
  await expect(page).toHaveURL(
    (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
  );
  await expect(
    page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
  ).toBeVisible();
}


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
  // The app's window floor (`minWidth`/`minHeight`); the window-state plugin restores the last
  // size, so the floor is a routine first viewport. At `lg` (1024) and up: no tab bar, and the
  // `lg:pb-10` 40px `--page-bottom-breath` reservation applies.
  { label: "desktop-1040x720", w: 1040, h: 720 },
  // Every width here is at least `lg`; tablet and phone widths are not a target.
] as const;

type Measured = {
  slot: boolean;
  scrollable: boolean;
  rootHeight: number;
  scrollHeight: number;
  /**
   * The gap below the last ink at the end of a scroll; `null` when no ink is found, because a
   * measurement failure is neither a pass nor a violation.
   */
  gap: number | null;
  /** When a fixed bottom tab bar exists, how far the last ink sits above it. */
  tabClearance: number | null;
  /**
   * The page's own bottom reservation and whether it wears the page frame. `gap` alone cannot tell
   * a 40px frame reserve from a card's own 28px padding. Frame membership is read from the rendered
   * max width, with widths imported from `page-frame.ts`, not from a literal here.
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
     * The page root is the first child that has a box: Next injects `<script>` into this slot too,
     * and a zero-height first child finds no ink.
     */
    const root = ([...slot.children] as HTMLElement[]).find(
      (el) => el.getBoundingClientRect().height > 0,
    ) ?? null;
    slot.scrollTop = slot.scrollHeight;

    /**
     * Anything an ancestor clipped is not this page's ink: a sticky sidebar with its own scroll
     * (the changelog table of contents) has item rects far outside it. The slot itself is not
     * inspected, since it is the container scrolled to the end.
     */
    /**
     * Returns the visible bottom edge after ancestor clipping, or `null` when fully outside. A child
     * straddling the clip box's bottom edge is not fully outside, so its bottom is clamped by
     * intersection.
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
         * A closed `<details>`'s content has a box but is not ink: Chromium hides it with
         * `content-visibility: hidden` rather than `display: none`, so use `checkVisibility()`.
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
       * A decorative layer with no pointer events is not a bar (the gateway field canvas is
       * `fixed inset-0`). A real bar is a low strip pinned to the bottom, under half the screen.
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

    for (const [label, url] of ROUTES) {
      await page.goto(auditDestination(url), { waitUntil: "domcontentloaded" });
      await waitForAuditDestination(page, url);
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
      if (m.framed) {
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

    /*
     * ④'s idling guard, the same shape as ③'s. `framed` is detected from the rendered max width,
     * so a shell change or a token rename would silently take every frame member out of view and
     * this check would pass while measuring nothing — which is the exact failure mode that let the
     * reservation defect through in the first place.
     */
    {
      expect(
        framedRoutes,
        `${vp.label}: no route wearing the page frame was found, so check (4) ran on nothing. ` +
          `Either the frame is gone (then the contract changed) or the --page-max detection is stale.`,
        ).toBeGreaterThan(1);
      /*
       * The frame that must be seen is the 960 form column: assert the width itself, not only the
       * count, so a detector that knows only `--page-max` fails. The wide-frame members
       * (`/ko/projects/`, `/ko/ontology/insights/`) are not reached: their root is not the slot child.
       */
      expect(
        [...framedWidths],
        `${vp.label}: 960 폼 틀을 한 번도 계측하지 못했다 — 폭 판별이 옛 틀만 안다`,
      ).toContain(FORM_FRAME_WIDTH);
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
}

/**
 * With no folder two of these routes are short and `!m.scrollable` skips them before any assertion,
 * so this opens the folder first, the state those screens are used in, and measures the same
 * three checks. Both viewports are at least `lg`.
 */
const VAULT_ROUTES = [
  "/ko/agents/?tab=mcp",
  "/ko/agents/?tab=mcp&mcp=connectors",
  "/ko/agents/",
  "/ko/ontology/insights/",
  // The board's default landing is the brief, four cards ending well above the fold; the concept
  // questions (composition, relations, growth) run past the window with a folder open, which is
  // what makes the scroll end reachable.
  "/ko/ontology/insights/?tab=composition",
  "/ko/projects/",
  // With a folder open the Docs sidebar has two capped lists above the tree, so the column's own
  // scroll end can be reached and cut.
  "/ko/docs/",
  // Both halves of the Library can be taller than the window with a folder open (many files in the
  // index, any long wiki page), and the no-folder pass cannot reach either.
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
         * Trailing sections carry a line each so the page's last ink sits at the back-to-top pill;
         * empty sections would leave the pill clearance check nothing to measure.
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
     * The Library scrolls inside its own boxes (index column and reading pane), not in the shell slot,
     * so measure the two inner scrollers directly: the wiki reader with a page open, and the index.
     */
    await page.goto("/ko/library/", { waitUntil: "domcontentloaded" });
    await routeSettled(page);
    await page.getByTestId("library-workspace-wiki").click({ timeout: 15_000 });
    const firstPage = page.locator('[data-testid^="library-wiki-wiki/"]').first();
    await expect(firstPage, "/ko/library/: the fixture's wiki page is not listed — nothing below is measured").toBeAttached({
      timeout: 15_000,
    });
    {
      await firstPage.click();
      await page.getByTestId("library-reading-pane").waitFor({ timeout: 15_000 });
      await waitForBoxStill(page.getByTestId("library-reading-pane"));
      const reader = await measureInner(page, '[data-testid="library-reading-pane"]');
      if (reader.scrollable) {
        if (reader.gap === null) violations.push("/ko/library/ reader: 잉크를 하나도 못 찾았다 — 계측 실패이지 통과가 아니다");
        else if (reader.gap < MIN_GAP) violations.push(`/ko/library/ reader: 스크롤 끝 하단 여백 ${reader.gap}px (< ${MIN_GAP})`);
        /*
         * The gap must clear the floating back-to-top pill's top edge, not just exist: the pill body sits
         * 60px above the scroller's bottom edge and covers the last line otherwise.
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
