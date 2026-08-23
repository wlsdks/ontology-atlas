import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Fails when Korean is **rendered** on an English screen.
 *
 * Why this has to be e2e: the defect the 2026-07-28 sweep caught (the category and
 * status dropdowns and the card preview on `/en/project/new` were Korean) was
 * invisible to every existing gate. `pnpm test:i18n:messages` only checks key
 * symmetry in **the message catalogue**, and those strings came not from the
 * catalogue but from code constants (`entities/status` defaults) and JSX literals.
 * Neither lint nor vitest can see "is this string actually drawn on the English
 * screen" — only the browser knows that layer.
 *
 * **Why only these two routes** (the reach, and its reason). Almost every screen in
 * the app draws **text from the user's vault**. Korean is correct in the example
 * vault (`online shopping mall`, `order creation`, …) and in node titles the user wrote,
 * and machine-translating a user's own strings would violate this product's principles.
 * So "zero Korean on every /en route" is not a true proposition, and enforcing it
 * would require wrapping all vault-derived text in markers — a large change that
 * cannot be switched on now.
 *
 * Instead only **routes that draw not one character of vault text** are locked. An
 * exhaustive measurement today (1512×950, example vault loaded) found exactly the two
 * below, and the place that broke (`/project/new`) is among them. If a route starts
 * drawing vault data this spec breaks first and forces the list to be revisited — it
 * does not rot silently.
 *
 * Language regressions on the other routes are blocked at the root:
 * `tests/contract/taxonomy-locale-label.contract.test.ts`.
 */
const VAULT_FREE_EN_ROUTES = [
  // Where the defect occurred — the new-project form (category/status dropdowns plus
  // the card preview). No project exists yet, so every string drawn is app chrome.
  "/en/project/new/",
  // The download page — release facts plus static copy only.
  "/en/download/",
];

const HANGUL_SOURCE = "[\\u3131-\\u318E\\uAC00-\\uD7A3]";

test.describe("영문 화면 어권 순도", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1512, height: 950 });
  });

  for (const route of VAULT_FREE_EN_ROUTES) {
    test(`${route} 에 한국어가 렌더되지 않는다`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // The form and preview fill in after hydration.
      await page.waitForTimeout(1500);

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

      expect(
        hits,
        `${route} 에 한국어가 렌더됐다 — 영문 화면의 문자열은 화면 언어를 따라야 한다:\n${hits.join("\n")}`,
      ).toEqual([]);
    });
  }
});
