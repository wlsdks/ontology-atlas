import { waitForDocumentPaint } from '../visual-ready';
import { test, expect } from "@playwright/test";

import { AUDITED_ROUTES } from "../audited-routes";

/**
 * Is what the eye should land on first the largest, and is there exactly one filled accent?
 * Both are relations between rendered elements in different files, visible only on the rendered
 * screen. The route list is imported from `audited-routes.ts`; exceptions carry their measurement.
 */

/** Interactive controls — the things that can own a filled accent surface. */
const CONTROL = 'a[href],button,[role="button"],[role="link"],input,select,summary';

/**
 * The tallest accent-coloured data-mark is 8px (`domain-capacity-bar-*`) and the smallest real CTA
 * is 36x85 (`atlas-git-web-get-app`); 24x44 sits between them, and 24 equals WCAG 2.5.8's minimum
 * target. Colours are read from `:root` (`readAccents`), never hard-coded.
 */
const ACCENT_MIN_HEIGHT = 24;
const ACCENT_MIN_WIDTH = 44;

/**
 * Probe hook: `HIERARCHY_PROBE=title|accent|h1|blind-accent|blind-title` (comma-combinable) plants a
 * violating element or blinds the detector. It only adds violations, so it can never make the
 * check pass; `h1` aims at the title-less exceptions to prove they turn red when stale.
 */
const PROBE = (process.env.HIERARCHY_PROBE ?? "").split(",").map((s) => s.trim());

/** What is measured on each route. */
type RouteMeasurement = {
  route: string;
  /** The largest font size among rendered h1s. 0 means there is no rendered title. */
  titlePx: number;
  paintedH1: number;
  offenders: { text: string; px: number; testid: string | null }[];
  scanned: number;
  /** How many accent tokens were actually read from `:root`. */
  accentTokens: number;
  /** Rendered elements whose background colour was inspected — 0 means the scanner died. */
  considered: number;
  filled: { token: string; testid: string | null; text: string; w: number; h: number }[];
};

/**
 * Opens one route and measures **both properties in a single pass**.
 *
 * The constants above are passed as arguments because this runs inside the
 * browser and closures are not serialised.
 */
async function measureRoute(
  page: import("@playwright/test").Page,
  route: string,
): Promise<RouteMeasurement> {
  const destination = route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route;
  await page.goto(`${destination}${destination.includes("?") ? "&" : "?"}guides=off`, {
    waitUntil: "domcontentloaded",
  });
  if (route === "/ko/docs/") {
    await expect(page).toHaveURL(
      (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
    );
    await expect(
      page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
    ).toBeVisible();
  }
  if (route === "/ko/ontology/insights/") {
    // The dynamic entry paints a real h1 inside its loading shell, which would make the title baseline
    // look valid before the analytical finding mounts. Wait for the route's subject, then require
    // the loading shell to be gone.
    await expect(page.getByTestId("analysis-workspace")).toBeVisible();
    await expect(page.getByTestId("insights-loading")).toHaveCount(0);
  }
  await waitForDocumentPaint(page);

  if (PROBE.some((k) => k.length > 0)) {
    await page.evaluate((kinds: string[]) => {
      const paintedH1 = [...document.querySelectorAll("h1")].filter((h) => {
        const b = h.getBoundingClientRect();
        return b.width > 2 && b.height > 2;
      });
      const base = Math.max(
        0,
        ...paintedH1.map((h) => parseFloat(getComputedStyle(h).fontSize)),
      );
      if (kinds.includes("title") && base > 0) {
        const d = document.createElement("div");
        d.textContent = "PROBE-제목보다-큼";
        d.style.cssText = `position:fixed;left:0;top:0;z-index:99999;background:#000;color:#fff;font-size:${base + 6}px`;
        d.setAttribute("data-hierarchy-probe", "title");
        document.body.appendChild(d);
      }
      if (kinds.includes("h1")) {
        const h = document.createElement("h1");
        h.textContent = "PROBE-보이는-제목";
        h.style.cssText =
          "position:fixed;left:0;bottom:0;z-index:99999;background:#000;color:#fff;font-size:28px";
        h.setAttribute("data-hierarchy-probe", "h1");
        document.body.appendChild(h);
      }
      if (kinds.includes("accent")) {
        const a = document.createElement("a");
        a.href = "#probe";
        a.textContent = "PROBE";
        a.style.cssText =
          "position:fixed;right:0;top:0;z-index:99999;width:120px;height:48px;background:var(--color-indigo-brand)";
        a.setAttribute("data-hierarchy-probe", "accent");
        document.body.appendChild(a);
      }
      // ── The two probes that aim at the idling guards themselves ─────
      //
      // The three above measure "does a planted defect turn it red"; these two
      // measure "does a dead detector turn it red". The latter is exactly the
      // failure that cost this repository a release — a smoke gate whose markers
      // outlived their components had never once checked what it claimed
      // (`AGENTS.md`, /gate-probe).
      if (kinds.includes("blind-accent")) {
        // Repoint the colour baseline at values nothing matches = "0 filled
        // accents". The rule (≤1) becomes true, but that must count as a
        // **measurement failure**, not a pass.
        // Use **distinct** unused colours. Four copies of the same colour collapse
        // into one token, so the earlier guard (`accentTokens > 2`) catches it
        // first and the guard actually under test (`totalFilled > 5`) never runs —
        // which is what happened on the first attempt.
        const names = [
          "--color-indigo-brand",
          "--color-indigo-brand-hover",
          "--color-indigo-accent",
          "--color-indigo-hover",
        ];
        names.forEach((name, i) => {
          document.documentElement.style.setProperty(name, `rgb(1, 2, ${3 + i})`);
        });
      }
      if (kinds.includes("blind-title")) {
        // Hide the title = lose the baseline. "0 items larger than the title"
        // becomes true, but that too is a measurement failure.
        for (const h of document.querySelectorAll("h1")) {
          (h as HTMLElement).style.display = "none";
        }
      }
    }, PROBE);
  }

  const measured = await page.evaluate(
    ({ control, minH, minW }) => {
      const painted = (el: Element) => {
        const c = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return false;
        if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) {
          return false;
        }
        return !el.closest("details:not([open])");
      };

      // Text at or above the title's size. The baseline is the largest rendered h1, not
      // `querySelector("h1")`: on map/docs the h1 is `sr-only` (1x1, inherited 16px), and project
      // detail has two h1s, so the first-in-DOM baseline would hang on order.
      const h1s = [...document.querySelectorAll("h1")];
      const paintedH1s = h1s.filter(painted);
      let base: Element | null = null;
      let titlePx = 0;
      for (const h of paintedH1s) {
        const px = parseFloat(getComputedStyle(h).fontSize);
        if (px > titlePx) {
          titlePx = px;
          base = h;
        }
      }

      const offenders: { text: string; px: number; testid: string | null }[] = [];
      let scanned = 0;
      for (const el of document.querySelectorAll("*")) {
        if (el.childElementCount > 0) continue;
        const text = (el.textContent || "").trim();
        if (!text) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (el.closest(".sr-only")) continue;
        scanned += 1;
        if (titlePx === 0) continue;
        if (el === base || base?.contains(el)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px >= titlePx) {
          offenders.push({
            text: text.slice(0, 24),
            px,
            testid:
              el.getAttribute("data-testid") ||
              el.closest("[data-testid]")?.getAttribute("data-testid") ||
              null,
          });
        }
      }

      // ── ② Filled accent surfaces ────────────────────────────────────
      //
      // The reference values are read from `:root`. Comparison has to happen
      // after the browser normalises arbitrary CSS notation (hex, rgb, oklch), so
      // each colour is applied to a throwaway element and read back computed.
      const root = getComputedStyle(document.documentElement);
      const normalize = (value: string) => {
        const probe = document.createElement("div");
        probe.style.color = value;
        document.body.appendChild(probe);
        const out = getComputedStyle(probe).color;
        probe.remove();
        return out;
      };
      const accents = new Map<string, string>();
      for (const name of [
        "--color-indigo-brand",
        "--color-indigo-brand-hover",
        "--color-indigo-accent",
        "--color-indigo-hover",
      ]) {
        const raw = root.getPropertyValue(name).trim();
        if (raw) accents.set(normalize(raw), name);
      }

      // Fold to the control — do not count a button and a filled span inside it twice.
      const byControl = new Map<
        Element,
        { token: string; testid: string | null; text: string; w: number; h: number }
      >();
      let considered = 0;
      for (const el of document.querySelectorAll("*")) {
        if (!painted(el)) continue;
        considered += 1;
        const token = accents.get(getComputedStyle(el).backgroundColor);
        if (!token) continue;
        const b = el.getBoundingClientRect();
        if (b.height < minH || b.width < minW) continue; // data-marks are filtered out here
        const ctl = el.closest(control);
        if (!ctl) continue;
        if (byControl.has(ctl)) continue;
        byControl.set(ctl, {
          token,
          testid: ctl.getAttribute("data-testid") || el.getAttribute("data-testid") || null,
          text: (ctl.textContent || "").trim().slice(0, 28),
          w: Math.round(b.width),
          h: Math.round(b.height),
        });
      }

      return {
        titlePx,
        paintedH1: paintedH1s.length,
        offenders,
        scanned,
        accentTokens: accents.size,
        considered,
        filled: [...byControl.values()],
      };
    },
    { control: CONTROL, minH: ACCENT_MIN_HEIGHT, minW: ACCENT_MIN_WIDTH },
  );

  return { route, ...measured };
}

/**
 * Exceptions to the title rule, one route per row with its measurement and what measures it
 * instead. Adding a row switches the rule off for that screen, so each row carries its own check
 * (the `titleGuard` describe). No exception is kept whose reason is "pending".
 */
const TITLE_EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: "/ko/topology/",
    why:
      "그려진 제목이 없다 — h1 「지형도」는 `sr-only`(1×1 · clip inset(50%) · 상속 16px). " +
      "주목 승자는 지도 자체이고, 제목 급 글자라는 기준이 이 화면엔 없다. " +
      "대신 아래 「제목 없는 화면은 정말 없다」가 «그려진 h1 0개» 를 못박는다",
  },
  {
    route: "/ko/docs/",
    why: "통합 Ontology reader의 h1이 `sr-only` 1×1이다. 같은 검사가 못박는다",
  },
];
const TITLE_EXEMPT_ROUTES = new Set(TITLE_EXEMPT.map((e) => e.route));

/**
 * **Figures that outrank the title on purpose — one route, named elements, measured.**
 *
 * Narrower than `TITLE_EXEMPT`: the rule still runs on the route and still demands a
 * painted h1, and only the listed elements may sit at or above it. Everything else
 * on the screen is measured as usual. The `titleGuard` below proves the figures are
 * still there and still larger, so a redesign that shrinks them turns this red first
 * and sends a person back to this list.
 */
const TITLE_FIGURES: ReadonlyArray<{ route: string; testids: readonly string[]; why: string }> = [
  {
    route: "/ko/ontology/insights/",
    testids: ["analysis-finding-heading"],
    why:
      "Decision 488f9b25 makes the selected responsibility pair the analytical finding. " +
      "Its named hero may outrank the navigation title; the nonempty figure guard below remains active.",
  },
];
const TITLE_FIGURE_IDS = new Map(TITLE_FIGURES.map((f) => [f.route, new Set(f.testids)]));

/**
 * **Exceptions to ② — same discipline.**
 */
const ACCENT_EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  /*
   * The edit screen has a sticky header CTA, so its end-of-form button is `outline`; the create
   * screen has no sticky bar, so its button is the only primary CTA and stays filled.
   */
];
const ACCENT_EXEMPT_ROUTES = new Set(ACCENT_EXEMPT.map((e) => e.route));

test.describe("화면 위계 — 감사 대상 전 라우트", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  /* Both rules read the same `measureRoute` result, so one walk serves both. */
  test("① 페이지 제목보다 크거나 같은 글자가 제목 밖에 없다 · ② 채워진 강조색 면이 화면에 최대 하나다", async ({ page }) => {
    test.setTimeout(240_000);

    const titleViolations: string[] = [];
    const accentViolations: string[] = [];
    let totalScanned = 0;
    let routesWithTitle = 0;
    let totalFilled = 0;
    let totalConsidered = 0;

    for (const route of AUDITED_ROUTES) {
      const m = await measureRoute(page, route);
      totalScanned += m.scanned;
      totalFilled += m.filled.length;
      totalConsidered += m.considered;

      // ① Idling guard ⓐ — per route. If almost no text was scanned, a 0 below means
      // "we did not look", not "it is clean". The floor is 3 because 404 really has
      // only 4 (measured) — the thinnest screen sets the floor.
      expect(m.scanned, `${route}: 글자 원소를 거의 못 훑었다 — 스캐너가 죽었다`).toBeGreaterThan(2);
      // ② Idling guard ⓐ — were the reference colours **actually read** from `:root`?
      // If a token is renamed, this check sees "0 accents" and goes green forever.
      expect(m.accentTokens, `${route}: 악센트 토큰을 :root 에서 못 읽었다 — 색 기준을 잃었다`).toBeGreaterThan(2);
      expect(m.considered, `${route}: 배경색을 들여다본 원소가 없다 — 스캐너가 죽었다`).toBeGreaterThan(20);

      if (!ACCENT_EXEMPT_ROUTES.has(route) && m.filled.length > 1) {
        accentViolations.push(`${route} → ${m.filled.length}개: ${JSON.stringify(m.filled)}`);
      }

      if (TITLE_EXEMPT_ROUTES.has(route)) continue;

      // Outside the exceptions there **must be a baseline** — if the rendered h1
      // disappears this check silently measures nothing. That state is not a pass.
      expect(
        m.titlePx,
        `${route}: 그려진 h1 이 없다 — 기준을 잃었다. 의도한 것이면 TITLE_EXEMPT 에 실측치와 함께 등재하라`,
      ).toBeGreaterThan(0);
      routesWithTitle += 1;

      const figures = TITLE_FIGURE_IDS.get(route);
      for (const o of m.offenders) {
        if (figures && o.testid && figures.has(o.testid)) continue;
        titleViolations.push(`${route} → "${o.text}" ${o.px}px ≥ 제목 ${m.titlePx}px (${o.testid ?? "-"})`);
      }
    }

    // ① Idling guard ⓑ — across the whole sweep. Measured 964 (887 excluding the 3 exception routes).
    expect(totalScanned, "전 라우트를 합쳐도 훑은 글자가 적다 — 스윕이 죽었다").toBeGreaterThan(600);
    expect(routesWithTitle, "제목을 가진 라우트를 거의 못 찾았다 — 기준 판정기가 죽었다").toBeGreaterThan(10);
    // ② Idling guard ⓑ — finding none makes "at most one everywhere" true, but that
    // is a measurement failure. Measured 9 (7 excluding the 2 exception routes).
    expect(
      totalFilled,
      "채워진 악센트 컨트롤을 전 라우트에서 하나도 못 찾았다 — 판정기가 죽었다(측정 실패)",
    ).toBeGreaterThan(5);
    // The floor comes from measurement (2974 considered), not a guess: pinning higher turns a
    // healthy state red.
    expect(totalConsidered, "그려진 원소를 거의 못 봤다 — 스윕이 죽었다").toBeGreaterThan(2000);

    expect(
      titleViolations,
      "페이지 제목과 같거나 큰 글자가 제목 밖에 있다 — 무엇이 먼저인지가 사라진다",
    ).toEqual([]);
    expect(
      accentViolations,
      "채워진 강조색 면이 한 화면에 둘 이상이다 — 주 CTA 가 둘이면 하나는 거짓말이다",
    ).toEqual([]);
  });

  /**
   * Each exception to ① pays for itself by proving it has **not gone stale**. Left
   * alone, no layer of this file runs on that screen — it stays green even if a
   * title appears, even if the ties grow to four.
   */
  test("예외가 낡지 않았다 — 제목 없는 화면은 정말 제목이 없다", async ({ page }) => {
    for (const route of ["/ko/topology/", "/ko/docs/"]) {
      const m = await measureRoute(page, route);
      expect(
        m.paintedH1,
        `${route}: 그려진 제목이 생겼다 — TITLE_EXEMPT 에서 이 줄을 지우고 규칙을 켜라`,
      ).toBe(0);
      expect(m.titlePx, `${route}: 기준이 생겼다 — 예외가 낡았다`).toBe(0);
    }
  });

  /**
   * The figure exception pays the same way: the numerals must still be painted,
   * still be the listed elements, and still stand above the title. If the census
   * strip is redesigned below 23px the row in `TITLE_FIGURES` is dead weight and
   * this turns red first.
   */
  test("the selected Analysis finding remains larger than its navigation title", async ({ page }) => {
    for (const figure of TITLE_FIGURES) {
      const m = await measureRoute(page, figure.route);
      expect(m.titlePx, `${figure.route}: 그려진 h1 이 없다 — 숫자 예외는 제목이 있어야 성립한다`).toBeGreaterThan(0);
      const seen = new Set(m.offenders.map((o) => o.testid));
      for (const id of figure.testids) {
        expect(
          seen.has(id),
          `${figure.route}: ${id} 가 제목보다 크지 않다 — TITLE_FIGURES 에서 이 줄을 지우고 규칙을 켜라`,
        ).toBe(true);
      }
    }
  });

  /**
   * **The two that were fixed are now measured by ① and ② themselves** — with no
   * exception there is no watchdog either.
   *
   * One thing rule ② cannot express: the edit screen's primary CTA **must be the
   * top sticky one**. "At most one" is true whichever of the two it is, so
   * inverting the fix (demoting the top one and filling the bottom one) would still
   * be green. Only that direction is pinned here.
   */
  test("편집 화면의 채워진 주 CTA 는 위쪽 sticky 저장이다", async ({ page }) => {
    const m = await measureRoute(page, "/ko/project/storefront/edit/");
    expect(
      m.filled.map((f) => f.testid),
      "편집 화면의 채워진 악센트가 상단 sticky 저장 하나가 아니다 — 방향이 뒤집혔거나 둘로 늘었다",
    ).toEqual(["project-save-top"]);
    // The bottom Save must stay alive — this was a demotion, not a removal.
    await expect(
      page.getByTestId("project-save"),
      "폼 끝의 저장이 사라졌다 — 이건 강등이 아니라 기능 제거다",
    ).toBeVisible();
  });
});
