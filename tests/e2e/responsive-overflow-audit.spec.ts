import { expect, test } from "@playwright/test";

/**
 * Responsive overflow sweep (final review 2026-07-25).
 *
 * Every defect the owner reported repeatedly during that wave was the same kind:
 * "Text spilling out of its box, things overlapping,
 * content past the box at the bottom." No automated gate caught them, so they were
 * found by eye every time — and the shortcut sheet's scroll-height regression passed
 * the jsdom unit tests and was only caught at final review.
 *
 * What this spec checks:
 *  1. The document itself does not scroll horizontally (`scrollWidth <=
 *     clientWidth`). Design rule: wide content scrolls inside its own container, so
 *     the page body being pushed sideways is a defect.
 *  2. No interactive or text element leaves the viewport.
 *  3. No two `role="dialog"` are open at once (#62, overlay exclusivity).
 *
 * Widths: 1512 (the 14-inch contract) · 1024 (the lg boundary) · 834 (tablet
 * portrait) · 390 (mobile). At each width it sweeps the 4 live surfaces plus
 * download.
 */

const WIDTHS = [
  { label: "14in", width: 1512, height: 900 },
  { label: "lg-edge", width: 1024, height: 800 },
  { label: "tablet", width: 834, height: 1112 },
  { label: "mobile", width: 390, height: 844 },
] as const;

const ROUTES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/download/",
] as const;

const SELECTOR = "button, a, h1, h2, h3, p, li, dt, dd, input, kbd, [role='tab']";

for (const vp of WIDTHS) {
  for (const route of ROUTES) {
    test(`${vp.label} ${vp.width}px — ${route} 가로 오버플로·겹침 없음`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      // Time for canvases and charts to finish their first layout.
      await page.waitForTimeout(900);

      const report = await page.evaluate((selector) => {
        const vw = document.documentElement.clientWidth;
        const offenders: { tag: string; text: string; left: number; right: number }[] = [];
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const r = el.getBoundingClientRect();
          // Excludes sr-only (1px) and non-rendered elements.
          if (r.width < 2 || r.height < 2) continue;
          if (getComputedStyle(el).visibility === "hidden") continue;
          if (r.right > vw + 1 || r.left < -1) {
            offenders.push({
              tag: el.tagName,
              text: (el.textContent ?? "").trim().slice(0, 48),
              left: Math.round(r.left),
              right: Math.round(r.right),
            });
          }
        }
        return {
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: vw,
          offenders: offenders.slice(0, 6),
          offenderCount: offenders.length,
          dialogCount: document.querySelectorAll('[role="dialog"]').length,
        };
      }, SELECTOR);

      expect(
        report.docScrollWidth,
        `문서가 가로로 스크롤됨 (${report.docScrollWidth} > ${report.docClientWidth})`,
      ).toBeLessThanOrEqual(report.docClientWidth + 1);

      expect(
        report.offenderCount,
        `뷰포트를 벗어난 요소: ${JSON.stringify(report.offenders, null, 2)}`,
      ).toBe(0);

      // #62 — zero conflicting overlays open at once. The first-visit auto tour may have one.
      expect(
        report.dialogCount,
        "role=dialog 가 둘 이상 동시에 열려 있음 (#62 오버레이 배타 위반)",
      ).toBeLessThanOrEqual(1);
    });
  }
}
/**
 * **The vertical axis — what the bottom tab bar is covering** (added 2026-08-01).
 *
 * The sweep above looks at **the horizontal axis only**, so it could not in
 * principle catch two defects found at the rc.5 review — both occurred while
 * `scrollWidth == clientWidth` held:
 *
 * 1. The docs bottom bar ("open in map", backlink chips) sank 20–30px behind the tab
 *    bar across the whole `<lg` range. Beyond being covered, **input was stolen**:
 *    pressing it navigated to `/download/`, so someone trying to open a document in
 *    the map landed on the download page.
 * 2. The map's first-interaction instruction (`sample-node-hint`) was 83% covered by
 *    height between 768–1023. It used the horizontal inset token and therefore never
 *    received the bottom reserve.
 *
 * So two things are measured. **A rect intersection is not enough** — the essence of
 * this defect is not overlap but **unreachability**, and only `elementFromPoint`
 * answers that.
 *
 * 1024 is the control: the tab bar is `display:none` there, so overlap must be 0,
 * and a non-zero result means this test is failing to find the tab bar (detecting a
 * silent disablement).
 */
const TAB_BAR = 'nav[data-tabbar="primary"]';

for (const width of [375, 768, 1023, 1024] as const) {
  for (const route of ["/ko/docs/", "/ko/topology/"] as const) {
    test(`${width}px ${route} — 하단 탭바가 아무것도 덮지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(route);
      await page.waitForTimeout(900);

      const report = await page.evaluate(
        ({ tabBarSelector, selector }) => {
          const bar = document.querySelector(tabBarSelector);
          const barRect = bar ? bar.getBoundingClientRect() : null;
          const barVisible = Boolean(
            barRect && barRect.height > 2 && getComputedStyle(bar!).display !== "none",
          );
          if (!barVisible) return { barVisible, covered: [], stolen: [] };

          const covered: { tag: string; text: string; overlap: number }[] = [];
          const stolen: { tag: string; text: string; hit: string }[] = [];
          for (const el of Array.from(document.querySelectorAll(selector))) {
            if (el === bar || bar!.contains(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none") continue;
            // Anything outside the viewport (only visible after scrolling) is out of scope.
            if (r.bottom <= 0 || r.top >= window.innerHeight) continue;

            const overlap = Math.min(r.bottom, barRect!.bottom) - Math.max(r.top, barRect!.top);
            if (overlap <= 1) continue;
            const label = (el.textContent ?? "").trim().slice(0, 40);
            covered.push({ tag: el.tagName, text: label, overlap: Math.round(overlap) });

            // Reachability — does the centre point return itself (or a descendant/ancestor)?
            const hit = document.elementFromPoint(
              Math.round(r.left + r.width / 2),
              Math.round(r.top + r.height / 2),
            );
            if (!hit || !(el.contains(hit) || hit.contains(el))) {
              stolen.push({
                tag: el.tagName,
                text: label,
                hit: hit
                  ? `${hit.tagName}${hit.getAttribute("data-testid") ? `[${hit.getAttribute("data-testid")}]` : ""}`
                  : "null",
              });
            }
          }
          /**
           * Second pass — **small surfaces anchored to the bottom**. The selector above is
           * `button/a/p/…`, so it cannot see hints, chips, or readouts built from `div`.
           * `sample-node-hint` fell into exactly that blind spot and passed while 83%
           * covered.
           *
           * Containers are excluded: the tab bar floating over a screen-filling element such
           * as the map canvas is **by design**, not a defect. The discriminator is size —
           * what the tab bar *must not* cover is a small surface sitting near the bottom,
           * and what it *may* float above is the large surface beneath it.
           */
          for (const el of Array.from(document.querySelectorAll("[data-testid]"))) {
            if (el === bar || bar!.contains(el) || el.contains(bar!)) continue;
            const cs = getComputedStyle(el);
            if (cs.position !== "absolute" && cs.position !== "fixed") continue;
            if (cs.visibility === "hidden" || cs.display === "none") continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            if (r.height > 200 || r.width > window.innerWidth * 0.9) continue; // A container
            const overlap = Math.min(r.bottom, barRect!.bottom) - Math.max(r.top, barRect!.top);
            if (overlap <= 1) continue;
            const id = el.getAttribute("data-testid") ?? el.tagName;
            if (covered.some((c) => c.text === id)) continue;
            covered.push({ tag: el.tagName, text: id, overlap: Math.round(overlap) });
          }

          return { barVisible, covered: covered.slice(0, 8), stolen: stolen.slice(0, 8) };
        },
        { tabBarSelector: TAB_BAR, selector: SELECTOR },
      );

      if (width >= 1024) {
        // Control — a visible tab bar here breaks the premise that it is `<lg` only.
        expect(report.barVisible, "1024px 에서 하단 탭바가 아직 떠 있다").toBe(false);
        return;
      }

      expect(
        report.barVisible,
        `${width}px 에서 하단 탭바를 못 찾았다 — 이 시험이 지금 아무것도 지키지 않는다`,
      ).toBe(true);

      // Theft comes first: being covered but still pressable is a different grade; being unpressable is the defect.
      expect(
        report.stolen,
        `하단 탭바가 다른 컨트롤의 클릭을 가로챈다: ${JSON.stringify(report.stolen, null, 2)}`,
      ).toEqual([]);
      expect(
        report.covered,
        `하단 탭바가 요소를 덮는다: ${JSON.stringify(report.covered, null, 2)}`,
      ).toEqual([]);
    });
  }
}
