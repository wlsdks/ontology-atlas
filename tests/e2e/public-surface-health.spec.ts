import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForPageSettled } from "./settle";

/**
 * Are the public screens **silently broken** — two things: narrow viewports and the
 * console.
 *
 * **This file replaces three** (2026-08-16). There used to be three specs here and
 * **not one of them contained a single assertion**:
 *
 * | File | Lines | `expect` |
 * |---|---:|---:|
 * | `mobile-overflow-check.spec.ts` | 23 | **0** |
 * | `mobile-keyboard-audit.spec.ts` | 89 | **0** |
 * | `ui-audit-v2.spec.ts` | 101 | **0** |
 *
 * All three only gathered values into `console.log` or dropped screenshots in
 * `output/`, so **whatever broke, they were green.** On top of that the first used a
 * widget deleted on 2026-05-03 (`project-knowledge-topology`) as its selector, so
 * there was nothing to measure, and the third swallowed even navigation failures
 * into `console.log` (passing on a 500). This is the repository's rule exactly — **a
 * check that can never turn red is indistinguishable from no check.**
 *
 * What those three gathered was not worthless, so **the gathering was turned into
 * assertions**: horizontal overflow and console errors. A user meets both
 * immediately, and neither is knowable without opening the screen.
 *
 * The third file's shortcut checks (⌘K, ?) were **not discarded** — both are already
 * covered by specs that do assert (`docs-rename-address`, `user-journey-a`,
 * `destination-shortcuts` · `keyboard-path` · `map-keyboard-walk`).
 *
 * **Inventory when switched on: 0.** The six routes below were measured at 390×844
 * with no overflow and no console errors, so this check locks today's state rather
 * than creating new debt. Since 2026-09-27 only the gateway stays at 390; the
 * workbench routes are read at 1512.
 *
 * **One visit per route.** The same walk also carries two checks that used to be
 * separate specs: heading/landmark structure (exactly one `h1`, a `main` landmark, a
 * skip link) and Hangul purity on the two English routes that draw no vault text
 * (`/en/project/new/`, `/en/download/`). Hangul purity must be browser-measured because
 * lint and the message catalogue cannot see strings from code constants and JSX
 * literals; it stays limited to routes with no vault text, since the example vault is
 * legitimately Korean. A route that starts drawing vault data breaks it and forces
 * that list to be revisited. Language regressions elsewhere are blocked by
 * `tests/contract/taxonomy-locale-label.contract.test.ts`.
 */

/** Every route is opened once at the workbench reference size and gets the checks listed for it. */
const WORKBENCH_ROUTES = [
  "/en/",
  "/en/topology/",
  "/en/docs/",
  "/en/projects/",
  "/en/download/",
  "/en/guide/",
  "/en/project/ontology-atlas/",
  "/en/ontology/insights/",
  "/en/project/new/",
] as const;

const OVERFLOW_ROUTES = new Set<string>([
  "/en/",
  "/en/topology/",
  "/en/docs/",
  "/en/projects/",
  "/en/download/",
  "/en/guide/",
]);

const STRUCTURE_ROUTES = new Set<string>([
  "/en/",
  "/en/project/ontology-atlas/",
  "/en/docs/",
  "/en/topology/",
  "/en/projects/",
  "/en/ontology/insights/",
]);

const VAULT_FREE_EN_ROUTES = new Set<string>(["/en/project/new/", "/en/download/"]);

/** The phone reference width is kept for the public gateway, where a shared link lands. */
const GATEWAY_ROUTES = ["/en/", "/en/download/"] as const;

const DESKTOP = { width: 1512, height: 950 };
const PHONE = { width: 390, height: 844 };

/**
 * Noise to filter out.
 *
 * Empty today — the inventory when switching on was 0, so no exemption was needed.
 * When something is added later, **write the reason on that line**: an exemption is
 * the claim "this error is not ours", and an unevidenced claim means the check was
 * quietly switched off.
 */
const IGNORED_CONSOLE: RegExp[] = [];

const HANGUL_SOURCE = "[\\u3131-\\u318E\\uAC00-\\uD7A3]";

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    problems.push(`console: ${text.slice(0, 200)}`);
  });
  page.on("pageerror", (error: Error) => {
    problems.push(`pageerror: ${error.message.slice(0, 200)}`);
  });
  return problems;
}

async function open(page: Page, route: string) {
  const response = await page.goto(
    route === "/en/docs/" ? "/en/library/?tab=ontology" : route,
    { waitUntil: "domcontentloaded" },
  );
  if (route === "/en/docs/") {
    await expect(page).toHaveURL(
      (url) => url.pathname === "/en/library/" && url.searchParams.get("tab") === "ontology",
    );
    await expect(
      page.locator("#library-workspace-tabpanel-ontology [data-docs-viewer]"),
    ).toBeVisible();
  }
  // ⚠️ The previous specs swallowed navigation failures into `console.log` — passing even on a 500.
  expect(response?.ok(), `${route} 를 열지 못했다 (${response?.status()})`).toBe(true);
}

async function expectNoOverflow(page: Page, route: string, viewportWidth: number) {
  const width = await page.evaluate(() => ({
    /*
     * ⚠️ **Do not measure with `documentElement.scrollWidth`** — this app sets
     * `overflow-x: hidden` on `html` and `body`, so that value **always** equals
     * `clientWidth`. The first version using it stayed green even with a 2000px
     * element planted on purpose — **a check that could never turn red**, the same
     * illness as the three specs this file replaced.
     *
     * `body.scrollWidth` really does reflect overflowing content (the planted
     * 2000px was caught as is). And it does not catch things like a label clipped
     * inside its own box — correctly, since that is that box's business rather than
     * page overflow.
     */
    scroll: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  /*
   * The 1px slack covers sub-pixel rounding. Beyond that, content pushed off screen
   * is clipped and becomes unreachable, which breaks this repository's rule that wide
   * content scrolls inside its own box.
   */
  expect(
    width.scroll,
    `${route} overflows horizontally at ${viewportWidth}px (${width.scroll} > ${width.client}). ` +
      "Wide content such as tables, code blocks and diagrams must scroll inside its own box.",
  ).toBeLessThanOrEqual(width.client + 1);
}

async function readStructure(page: Page): Promise<string[]> {
  const info = await page.evaluate(() => {
    const h1s = Array.from(document.querySelectorAll("h1")).map(
      (h) => (h as HTMLElement).innerText?.trim() ?? "",
    );
    const hasMain =
      document.querySelector("main") !== null || document.querySelector('[role="main"]') !== null;
    const hasSkipLink = document.querySelector('a[href="#main"]') !== null;
    return { h1s, hasMain, hasSkipLink };
  });
  const findings: string[] = [];
  if (info.h1s.length !== 1) {
    findings.push(`h1-count h1 count=${info.h1s.length} (${JSON.stringify(info.h1s)})`);
  }
  if (!info.hasMain) findings.push("no-main");
  if (!info.hasSkipLink) findings.push("no-skip-link");
  return findings;
}

const STRUCTURE_MESSAGE =
  `Heading/landmark contract violated. A title being **visible** on screen and a title\n` +
  `**existing** in the document are different problems; a person who skims by headings only gets the latter.\n` +
  `On a screen whose body is a single card (degraded or empty state), emit the h1 through EmptyState's titleAs.`;

async function readHangul(page: Page): Promise<string[]> {
  const hits = await page.evaluate((hangulSource) => {
    const hangul = new RegExp(hangulSource);
    // Anything not drawn on screen is out of scope — counting the <script> where the
    // RSC payload lives fails every page (the serialised ko catalogue).
    const nonVisual = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
    const found: string[] = [];

    const describe = (el: Element): string => {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur !== document.body && parts.length < 5) {
        const testId = cur.getAttribute("data-testid");
        parts.push(cur.tagName.toLowerCase() + (testId ? `[${testId}]` : ""));
        cur = cur.parentElement;
      }
      return parts.join("<");
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.nodeValue ?? "").trim();
      const parent = node.parentElement;
      if (text && hangul.test(text) && parent) {
        let ancestor: Element | null = parent;
        let hidden = false;
        while (ancestor) {
          if (nonVisual.has(ancestor.tagName)) {
            hidden = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (!hidden) found.push(`"${text.slice(0, 60)}" @ ${describe(parent)}`);
      }
      node = walker.nextNode();
    }

    // <option> text is collapsed, but it is what the user reads the moment they open it.
    for (const select of Array.from(document.querySelectorAll("select"))) {
      for (const option of Array.from(select.options)) {
        const text = (option.textContent ?? "").trim();
        if (hangul.test(text)) {
          found.push(`"${text}" @ select[${select.getAttribute("data-testid") ?? select.name}]>option`);
        }
      }
    }

    return Array.from(new Set(found));
  }, HANGUL_SOURCE);
  return hits;
}

test.describe("public screens at the workbench size", () => {
  for (const route of WORKBENCH_ROUTES) {
    test(`${route} has no overflow, quiet console, one h1 with landmarks and English-only text where those apply`, async ({
      page,
    }) => {
      const problems = collectProblems(page);
      if (VAULT_FREE_EN_ROUTES.has(route)) await seedFirstRunSeen(page);
      await page.setViewportSize(DESKTOP);
      await open(page, route);
      // The page's own fetches have answered (their errors reach the console first), its
      // fonts are in and every entrance has finished: the layout that is measured is at rest.
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await waitForAnimationsDone(page.locator("body"));
      await waitForPageSettled(page);

      if (OVERFLOW_ROUTES.has(route)) await expectNoOverflow(page, route, DESKTOP.width);
      if (STRUCTURE_ROUTES.has(route)) {
        expect(
          (await readStructure(page)).map((finding) => `${finding} @ ${route}`),
          STRUCTURE_MESSAGE,
        ).toEqual([]);
      }
      if (VAULT_FREE_EN_ROUTES.has(route)) {
        const hits = await readHangul(page);
        expect(
          hits,
          `${route} 에 한국어가 렌더됐다 — 영문 화면의 문자열은 화면 언어를 따라야 한다:\n${hits.join("\n")}`,
        ).toEqual([]);
      }
      if (OVERFLOW_ROUTES.has(route)) {
        expect(problems, `${route} 에서 콘솔 오류가 났다:\n  ${problems.join("\n  ")}`).toEqual([]);
      }
    });
  }
});

test.describe("public gateway at the phone width", () => {
  for (const route of GATEWAY_ROUTES) {
    test(`${route} does not overflow horizontally and keeps the console quiet at 390px`, async ({
      page,
    }) => {
      const problems = collectProblems(page);
      await page.setViewportSize(PHONE);
      await open(page, route);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await waitForAnimationsDone(page.locator("body"));

      await expectNoOverflow(page, route, PHONE.width);
      expect(problems, `${route} 에서 콘솔 오류가 났다:\n  ${problems.join("\n  ")}`).toEqual([]);
    });
  }
});
