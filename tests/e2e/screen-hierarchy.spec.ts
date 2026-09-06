import { test, expect } from "@playwright/test";

import { AUDITED_ROUTES } from "./audited-routes";

/**
 * Screen hierarchy — **is what the eye should land on first actually the largest,
 * and is there exactly one filled accent?**
 *
 * ## Why this layer has to exist
 *
 * On 2026-08-06 the design lead seat named two defects on
 * `/project/new`, and both were **confirmed by measurement**:
 *
 * | Defect | Measured |
 * |---|---|
 * | The side panel's "0%" **ties** with the page title | both 30px |
 * | An amber banner says *"you need to open a folder"* but **there is no way to open one** | **0** folder-opening controls |
 *
 * Both are **defects that leave no value in the code** — "0%" was using a
 * legitimate ramp step (`text-hero`), and the banner's wording was fine. Neither a
 * value lint nor a source-scanning contract can see them. **They are visible only
 * on the rendered screen.**
 *
 * ## Why the render rather than the source
 *
 * "nothing is larger than the title" is a **relation between two elements**, and
 * those two live in different files (the title in the page, the statistic in a
 * form widget). A check that reads one file's syntax tree cannot express it in
 * principle.
 *
 * ## Why every route rather than one (2026-08-08)
 *
 * At birth this file looked at **one route, `/project/new`**. The sibling gate born
 * the same day (`open-vault-cta.spec.ts`) was widened to the full set for exactly
 * that reason, and widening it immediately found the same disease in **two more
 * places**. This repository has already paid for this failure mode
 * (`design-gates.md`): **a check built from an allowlist fails on what is not on
 * the list, and what is not on the list is always what was just created.**
 *
 * So the route list is not hand-written here — the authoritative one
 * (`audited-routes.ts`) is imported, and any route left out is recorded below as
 * **an exception with its measurement and what measures it instead**, never as
 * silence.
 *
 * ## Full measurement (2026-08-08 · static export · 1512×900 · `?guides=off`)
 *
 * | Route | Title | Title≥ violations | Filled accents | Notes |
 * |---|---|---|---|---|
 * | `/ko/` | 34px | 0 | 1 (`gateway-hero-cta`) | ② renamed 2026-08-19 |
 * | `/ko/topology/` | **none** (h1 = `sr-only` 1×1) | — | 1 (`first-run-starter-open`) | ① exception |
 * | `/ko/docs/` | **none** (h1 = `sr-only` 1×1) | — | 0 | ① exception |
 * | `/ko/ontology/insights/` | 23px | 3 (`insights-bignum` ×2, `insights-verdict-word`) | 0 | ① figures |
 * | `/ko/projects/` | 23px | 0 | 0 | the 10 capacity bars are data-marks (h≤8) |
 * | `/ko/project/storefront/` | 23px | 0 | 0 | two h1s (23·16) — an a11y matter |
 * | `/ko/project/storefront/edit/` | 30px | 0 | 1 (`project-save-top`) | fixed from 2 on 2026-08-08 |
 * | `/ko/project/new/` | 30px | 0 | 1 (`project-save`) | where this file was born |
 * | `/ko/project/fallback/` | 23px | 0 | 0 | same screen as `/projects` |
 * | `/ko/git/` | 23px | 0 | 1 (`atlas-git-web-get-app`) | |
 * | `/ko/download/` | 34px | 0 | 1 (`gateway-hero-cta`) | ② renamed 2026-08-19 |
 * | `/ko/guide/` | 34px | 0 | 0 | |
 * | `/ko/guide/what-is-atlas/` | 34px | 0 | 0 | |
 * | `/ko/changelog/` | 34px | 0 | 0 | 225 text nodes scanned |
 * | `/ko/this-route-does-not-exist/` | 23px | 0 | 1 | |
 * | `/this-route-does-not-exist/` | 23px | 0 | 1 | same root file |
 *
 * ② 2026-08-19: deleting the install section removed the panel's
 * `download-primary-cta`. There is still exactly one filled accent per route and
 * it is the hero CTA — the count did not change, only the name.
 *
 * The old Studio addresses became map-compatibility redirects with no screen of
 * their own, so they left this table and the shared audit list. The map's
 * contextual editor is covered separately by the vault-backed state audit.
 *
 * ## Exceptions went from three to two (2026-08-08, same day)
 *
 * Two of the "① exception (registered by measurement)" rows above were
 * **violations awaiting a verdict**, and an owner-delegated verdict fixed them, so
 * they entered as rules rather than exceptions:
 *
 * | Fixed | Before | After |
 * |---|---|---|
 * | Studio h1 "What shall we do?" | `text-body-lg` 14px + secondary (tied with the entry card labels and losing on colour) | `text-title` 16px + primary (0 ties) |
 * | Save at the end of the edit form | filled indigo 142×40 (a twin of the top sticky one) | `outline` — the only filled accent is the top sticky |
 *
 * The remaining exceptions are the two screens with no rendered title (map, docs),
 * and those are held by "a screen with no title really has no title" below.
 */

/** Interactive controls — the things that can own a filled accent surface. */
const CONTROL = 'a[href],button,[role="button"],[role="link"],input,select,summary';

/**
 * **The size floor that separates a filled accent from a data-mark.**
 *
 * Not a hard-coded design judgement but a gap found by measurement (2026-08-08):
 * the tallest accent-coloured data-mark is **8px** (`domain-capacity-bar-*` · node
 * hint dots 6 · studio suggestion dots 4 · docs h2 underline), and the smallest
 * real CTA is **36×85** (`atlas-git-web-get-app`). 24×44 sits between them, and the
 * lower value equals WCAG 2.5.8's minimum target.
 *
 * The colours themselves are never hard-coded — they are read from `:root` (see
 * `readAccents` below). A stale colour list calls the healthy broken and the
 * broken healthy.
 */
const ACCENT_MIN_HEIGHT = 24;
const ACCENT_MIN_WIDTH = 44;

/**
 * **Probe hook — it only ever *adds* defects.**
 *
 * `HIERARCHY_PROBE=title` / `=accent` / `=h1` / `=blind-accent` / `=blind-title`
 * (comma-combinable) plants a violating element on each route or blinds the
 * detector. It is never a path that makes the check **pass** (it only adds
 * violations), so it is not a hole in the gate — the worst it can do is "always
 * red". It lives in the file so that `/gate-probe` need not be reproduced by hand
 * every time the gate changes.
 *
 * The third one, `h1`, **aims at the exceptions themselves**: it plants a rendered
 * h1 on the title-less screens (map, docs) to check whether "the exception turns
 * red when it goes stale" is actually true. Registering an exception without
 * measuring whether it can turn red leaves it indistinguishable from a check that
 * is green forever.
 *
 * Measured 2026-08-08:
 *
 * | Probe | What turned red |
 * |---|---|
 * | `title` | ① on **15/15 non-exception** routes (the 2 exceptions stayed green — by design) |
 * | `accent` | ② on the **8 routes** that already had one accent |
 * | `accent` | the "the edit screen's primary CTA is the top sticky" guard, on seeing a second accent |
 * | `h1` | the title-less exception guard, on map and docs |
 * | `blind-accent` | ② treating "0 accents (all routes)" as a **measurement failure, not a pass** |
 * | `blind-title` | ① on "no baseline" at the first non-exception route (`/ko/`) |
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
  await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

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

      // ── ① Text at or above the title's size ─────────────────────────
      //
      // The baseline is **the largest rendered h1**, not `querySelector("h1")`:
      // measured 2026-08-08, two cases betrayed that selector — on map/docs the
      // h1 is `sr-only` (1×1, inherited 16px), so an invisible 16px would become
      // the baseline; on project detail there are two h1s (a 23px visible title
      // plus a 16px second one), so the baseline would hang on DOM order.
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
 * **Exceptions to ① — one route per row, with its measurement and what measures
 * it instead.**
 *
 * ⚠️ Adding a row here switches the rule off for that screen. So every row carries
 * **its own check** (the `titleGuard` describe) — when an exception goes stale that
 * check turns red first and sends a person back to this list. No exception is kept
 * whose reason is "pending" (`open-vault-cta` paid that price on 2026-08-08).
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
    why: "지도와 같다 — h1 「문서함」이 `sr-only` 1×1. 같은 검사가 못박는다",
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
    testids: ["insights-bignum", "insights-verdict-word"],
    why:
      "2026-09-05 (#1455) 「분석 화면은 측정치로 시작한다」 — 인구조사 숫자(40px, 서명 숫자)와 판정 낱말(23px)이 " +
      "이 화면의 주목 승자다. h1 「분석」(23px)은 목적지 이름이고, 숫자가 그 위에 서는 것이 결정이다. " +
      "아래 「숫자가 제목보다 크게 서 있다」가 그 숫자가 사라지거나 줄면 빨갛게 만든다",
  },
];
const TITLE_FIGURE_IDS = new Map(TITLE_FIGURES.map((f) => [f.route, new Set(f.testids)]));

/**
 * **Exceptions to ② — same discipline.**
 */
const ACCENT_EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  /*
   * The edit exception (`/ko/project/storefront/edit/`) was **deleted** on
   * 2026-08-08 when the hierarchy (design-lead) verdict was applied.
   * `project-save-top` (sticky header) and `project-save` (end of form) were **two
   * filled indigos** with the same action, the same label, and the same 142×40. The
   * sticky one is visible at any scroll position so it carries the primary CTA, and
   * the repeat at the end of the form dropped to `Button`'s existing `outline` — in
   * edit mode only. The create screen (`/ko/project/new/`) has no sticky bar, so
   * there that button is the only primary CTA and stays filled (which is why the
   * rule holds as "exactly 1" on both routes).
   */
];
const ACCENT_EXEMPT_ROUTES = new Set(ACCENT_EXEMPT.map((e) => e.route));

test.describe("화면 위계 — 감사 대상 전 라우트", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("① 페이지 제목보다 크거나 같은 글자가 제목 밖에 없다", async ({ page }) => {
    test.setTimeout(240_000);

    const violations: string[] = [];
    let totalScanned = 0;
    let routesWithTitle = 0;

    for (const route of AUDITED_ROUTES) {
      const m = await measureRoute(page, route);
      totalScanned += m.scanned;

      // Idling guard ⓐ — per route. If almost no text was scanned, a 0 below means
      // "we did not look", not "it is clean". The floor is 3 because 404 really has
      // only 4 (measured) — the thinnest screen sets the floor.
      expect(m.scanned, `${route}: 글자 원소를 거의 못 훑었다 — 스캐너가 죽었다`).toBeGreaterThan(2);

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
        violations.push(`${route} → "${o.text}" ${o.px}px ≥ 제목 ${m.titlePx}px (${o.testid ?? "-"})`);
      }
    }

    // Idling guard ⓑ — across the whole sweep. Measured 964 (887 excluding the 3 exception routes).
    expect(totalScanned, "전 라우트를 합쳐도 훑은 글자가 적다 — 스윕이 죽었다").toBeGreaterThan(600);
    expect(routesWithTitle, "제목을 가진 라우트를 거의 못 찾았다 — 기준 판정기가 죽었다").toBeGreaterThan(10);

    expect(
      violations,
      "페이지 제목과 같거나 큰 글자가 제목 밖에 있다 — 무엇이 먼저인지가 사라진다",
    ).toEqual([]);
  });

  test("② 채워진 강조색 면(주 CTA)이 화면에 최대 하나다", async ({ page }) => {
    test.setTimeout(240_000);

    const violations: string[] = [];
    let totalFilled = 0;
    let totalConsidered = 0;

    for (const route of AUDITED_ROUTES) {
      const m = await measureRoute(page, route);
      totalFilled += m.filled.length;
      totalConsidered += m.considered;

      // Idling guard ⓐ — were the reference colours **actually read** from `:root`?
      // If a token is renamed, this check sees "0 accents" and goes green forever.
      expect(m.accentTokens, `${route}: 악센트 토큰을 :root 에서 못 읽었다 — 색 기준을 잃었다`).toBeGreaterThan(2);
      expect(m.considered, `${route}: 배경색을 들여다본 원소가 없다 — 스캐너가 죽었다`).toBeGreaterThan(20);

      if (ACCENT_EXEMPT_ROUTES.has(route)) continue;
      if (m.filled.length > 1) {
        violations.push(`${route} → ${m.filled.length}개: ${JSON.stringify(m.filled)}`);
      }
    }

    // Idling guard ⓑ — finding none makes "at most one everywhere" true, but that
    // is a measurement failure. Measured 9 (7 excluding the 2 exception routes).
    expect(
      totalFilled,
      "채워진 악센트 컨트롤을 전 라우트에서 하나도 못 찾았다 — 판정기가 죽었다(측정 실패)",
    ).toBeGreaterThan(5);
    // Measured 2974 (2026-08-08). The floor comes from measurement, not a guess —
    // the first attempt pinned 3000 and turned a healthy state red (a false red is
    // a gate defect too).
    expect(totalConsidered, "그려진 원소를 거의 못 봤다 — 스윕이 죽었다").toBeGreaterThan(2000);

    expect(
      violations,
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
  test("예외가 낡지 않았다 — 분석의 숫자가 제목보다 크게 서 있다", async ({ page }) => {
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

  /**
   * A write-lock banner must **not stop at stating the reason**. This checks only
   * that the way forward is inside that same box.
   *
   * ## What was removed from this file (2026-08-07)
   *
   * This used to click the CTA and measure **whether the URL changed to `/ko/`**.
   * That assertion was wrong in two ways:
   *
   * ① **Scope** — it was hand-pinned to one route (`/project/new`) and one testid,
   *    while the same disease was alive in two more places (insights, project
   *    detail). The classic allowlist-gate failure (`design-gates.md`).
   * ② **Depth** — the URL changing and being able to open a folder there are
   *    different facts, and only the first was measured. For a web visitor with no
   *    vault that destination (`/`) is the **gateway** (the download screen, 0
   *    folder controls), so it was a dead end one hop away — and this check was
   *    green the whole time.
   *
   * So that layer moved to `tests/e2e/open-vault-cta.spec.ts`, which sweeps every
   * audited route and measures whether the path **actually opens the folder
   * picker**. This file keeps only what its name says: hierarchy.
   */
  test("쓰기 잠금 배너가 갈 길을 함께 준다 — 막다른 경고가 아니다", async ({ page }) => {
    await page.goto("/ko/project/new/?guides=off");
    await page.waitForLoadState("networkidle");

    const banner = page.getByTestId("project-write-disabled-banner");
    await expect(banner, "쓰기 잠금 배너가 안 뜬다 — 이 검사가 헛돈다").toBeVisible();

    await expect(
      banner.getByTestId("project-write-disabled-open-folder"),
      "배너가 이유만 말하고 갈 길을 안 준다 — 막다른 CTA 다",
    ).toBeVisible();
  });
});
