import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Chrome that clips **a string it wrote itself** fails.
 *
 * Defect caught by the 2026-07-28 sweep: at the bottom of the `/topology` INDEX
 * panel the EN "Agent not connected" was clipped 104→89px into "Agent not conn…",
 * and in KO the growth signal was clipped 92→29px. The width budget could not
 * accommodate the locale's string lengths, and because `truncate` was in place the
 * screen looked quietly fine — nothing broke, nothing failed, the status just went
 * unread.
 *
 * **Why not "no clipping at all".** Clipping itself is not a defect. **User data of
 * unknown length** (node titles, document names) must be clipped, and `design.md`'s
 * dimensional-regularity rule says so — the full value is given on hover or in the
 * detail view instead. The defect is when **a string we wrote, with a finite set of
 * values**, is clipped. That is not graceful abbreviation but a wrong width budget,
 * and there is nowhere giving the full value.
 *
 * So this spec measures only chrome regions containing not one character of vault
 * data. Today that is the INDEX footer, where the defect occurred. Regions of the
 * same nature are added to `MEASURED_REGIONS`.
 *
 * jsdom cannot measure this (with no layout, scrollWidth is always 0) — a contract
 * needing a browser, so it lives in e2e.
 */

const MEASURED_REGIONS = [
  {
    testId: "topology-index-footer",
    why: "연결 상태 · 성장 신호 · 인계 메뉴 · 팔레트 힌트 — 전부 앱이 쓴 문자열",
  },
];

/** Both extremes, narrow and wide. The panel is fixed-width, so intermediate values add nothing. */
const VIEWPORTS = [
  { label: "1512", w: 1512, h: 950 },
  { label: "768", w: 768, h: 1024 },
];

const LOCALES = ["en", "ko"];

test.describe("크롬 텍스트 맞춤 — 앱이 쓴 문자열은 잘리지 않는다", () => {
  for (const locale of LOCALES) {
    for (const vp of VIEWPORTS) {
      test(`INDEX 푸터 (${locale} · ${vp.label}px)`, async ({ page }) => {
        await seedFirstRunSeen(page);
        await page.setViewportSize({ width: vp.w, height: vp.h });

        // The footer exists only with a vault open (the first-run starter occupies that
        // space otherwise). OPFS stands in for the folder picker so the vault is created
        // through the real journey — each context gets a fresh OPFS, so tests do not
        // bleed into each other.
        await page.addInitScript(() => {
          (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
            async () => navigator.storage.getDirectory();
        });

        await page.goto(`/${locale}/topology/`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("first-run-starter-create").click();
        await page.getByTestId("vault-guide-create-new").click();

        /*
         * ⚠️ **Creating a vault collapses INDEX** (corrected by measurement 2026-08-17).
         *
         * This setup assumed INDEX stayed expanded after creation; it now goes
         * `collapsed` immediately after. The reason the first line still passed is nasty —
         * the panel is briefly drawn **during the collapse animation**, so `toBeVisible`
         * is true at 0ms and the whole panel is gone half a second later. The next line
         * then waited out its full 15 seconds and died.
         *
         * Measured cost: this one spec burned 4 combinations × (run + 2 retries) = 12 ×
         * 18 seconds, and the `E2E smoke` workflow was **failing at 15 minutes on every
         * run**. The same was true on main — not caused by this change; the gate was
         * already red.
         *
         * So the state is allowed to **settle** and then expanded if it is collapsed. What
         * is being measured is whether the expanded footer's text is clipped, not whether
         * expanded is the default, so this gate keeps doing its job when the default
         * changes.
         */
        /*
         * ⚠️ **"the value is one of two" is not settlement.** The first attempt passed as
         * soon as the state was `collapsed|expanded`, and this screen is `collapsed` **from
         * the start**, so that poll finished instantly. Expand was therefore clicked while
         * the vault was still loading, and the late-arriving state transition collapsed it
         * again — the classic race that passes locally (fast dev) and dies only on CI
         * (slow runner).
         *
         * Settlement is judged by **the value staying put** — the same value observed
         * consecutively.
         */
        /*
         * Timeline measured under 6× CPU throttling to imitate CI:
         *
         * ```
         *    0–1200ms  idx=expanded  panel present, footer absent  (vault still loading)
         *      1600ms  idx=collapsed panel, footer, and tab all present (one collapsing frame)
         *      2000ms+ idx=collapsed only the tab remains          (settled here)
         * ```
         *
         * So settlement must not be judged by "the value holds briefly" — `expanded`
         * persists for 1.2 seconds during loading, which would be mistaken for settlement
         * and measured too early. And the instant the footer passes `toBeVisible` is **one
         * frame of the collapse animation**, after which it is gone.
         *
         * So instead of "expand once and trust it", **retry until the footer is present
         * while expanded.** A late transition that collapses it again is undone by the
         * next round.
         */
        await expect
          .poll(
            async () => {
              const state = await page.evaluate(
                () => document.documentElement.dataset.topologyIndex ?? "",
              );
              if (state !== "expanded") {
                const tab = page.getByTestId("topology-index-tab");
                if ((await tab.count()) > 0) await tab.click().catch(() => {});
              }
              await page.waitForTimeout(300);
              return page.evaluate(
                () =>
                  document.documentElement.dataset.topologyIndex === "expanded" &&
                  Boolean(document.querySelector('[data-testid="topology-index-footer"]')),
              );
            },
            { timeout: 45_000, message: "INDEX 를 펼친 채로 붙들지 못했다" },
          )
          .toBe(true);

        await expect(page.getByTestId("topology-index-footer")).toBeVisible({ timeout: 30_000 });
        // The two that are always present are still required — without them the footer is under-rendered.
        await expect(page.getByTestId("topology-index-agent-connect")).toBeVisible();
        await expect(page.getByTestId("topology-index-agent-handoff")).toBeVisible();
        /*
         * ⚠️ **The growth signal is not required** (corrected 2026-08-17).
         *
         * This row used to be required with `toBeVisible`. But in the code it is
         * **conditional by design** — `footerGrowthText` is only passed when
         * `recentlyUpdatedCount > 0` (HomePage), and the widget renders
         * `footerGrowthText ? … : null`. A layout gate was therefore mandating a condition
         * that **depends on data and on the clock**: whether any project changed in the
         * last 7 days.
         *
         * Measured on a freshly created OPFS vault: that row is not drawn. So the gate
         * waited 15 seconds and died, burning 4 combinations × (run + 2 retries) = 12 × 18
         * seconds and making `E2E smoke` **fail at 15 minutes every run**. The same was
         * true on main.
         *
         * What this gate measures is whether the footer's text is clipped, not whether
         * something changed this week. So **it is measured when drawn and skipped when
         * not** — mandating a conditional element does not strengthen a gate, it makes it
         * go red at random depending on the environment.
         */
        const growth = page.getByTestId("topology-index-footer-growth");
        if ((await growth.count()) > 0) await expect(growth).toBeVisible();

        for (const region of MEASURED_REGIONS) {
          const clipped = await page.evaluate((testId) => {
            const root = document.querySelector(`[data-testid="${testId}"]`);
            if (!root) return [{ text: `region ${testId} not found`, scrollWidth: 1, clientWidth: 0 }];

            const out: { text: string; scrollWidth: number; clientWidth: number }[] = [];
            const visit = (el: Element) => {
              const text = (el.textContent ?? "").trim();
              // Measure text leaves only — a container's scrollWidth mixes in child layout and
              // does not answer "is the text clipped".
              if (text && el.children.length === 0 && el.scrollWidth > el.clientWidth) {
                out.push({ text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
              }
              for (const child of Array.from(el.children)) visit(child);
            };
            visit(root);
            return out;
          }, region.testId);

          expect(
            clipped,
            `${region.testId} 가 자기 문자열을 자른다 (${region.why}):\n` +
              clipped
                .map((c) => `  "${c.text}" ${c.scrollWidth}px → ${c.clientWidth}px`)
                .join("\n"),
          ).toEqual([]);
        }
      });
    }
  }
});

/**
 * **The first-run card — every character of the visitor's first screen is a
 * string the app wrote.**
 *
 * Defects caught by dogfooding on 2026-07-29 (English screen):
 *
 * - The sample toggle's "Example — online store" was 115.1px in a 98px cell and
 *   clipped to "Example — online…". The Korean ("예시 — 온라인 쇼핑몰") fitted and
 *   passed silently.
 * - The glossary used `flex-wrap`, so only the "Element" row dropped its
 *   definition to the next line and the `term = definition` grammar broke on that
 *   row alone.
 *
 * Both **passed the existing overflow sweep**, because nothing left the viewport.
 * `truncate` did its job and so did `flex-wrap`. "Did it exceed the box" and "is it
 * readable inside the box" are different questions, and this spec owns the latter.
 *
 * No vault is created — the card exists only **before** a folder is picked, so its
 * state is mutually exclusive with the block above (the footer after vault
 * creation).
 */
const FIRST_RUN_VIEWPORTS = [
  { label: "1512", w: 1512, h: 950 },
  { label: "1024", w: 1024, h: 800 },
];

test.describe("크롬 텍스트 맞춤 — 첫 실행 카드", () => {
  for (const locale of LOCALES) {
    for (const vp of FIRST_RUN_VIEWPORTS) {
      test(`첫 실행 카드 (${locale} · ${vp.label}px)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(`/${locale}/topology/?guides=off`, { waitUntil: "domcontentloaded" });

        const card = page.getByTestId("first-run-starter");
        await expect(card).toBeVisible({ timeout: 30_000 });
        // Measure after the glossary has rendered — the card appears before the inventory attaches.
        await expect(page.getByTestId("first-run-starter-glossary")).toBeVisible();

        const clipped = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="first-run-starter"]');
          if (!root) return [{ text: "first-run-starter not found", scrollWidth: 1, clientWidth: 0 }];
          const out: { text: string; scrollWidth: number; clientWidth: number }[] = [];
          const visit = (el: Element) => {
            const text = (el.textContent ?? "").trim();
            if (text && el.children.length === 0 && el.scrollWidth > el.clientWidth) {
              out.push({ text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
            }
            for (const child of Array.from(el.children)) visit(child);
          };
          visit(root);
          return out;
        });

        expect(
          clipped,
          `첫 실행 카드가 자기 문자열을 자른다 — 이 카드는 전부 앱이 쓴 문구다:\n` +
            clipped.map((c) => `  "${c.text}" ${c.scrollWidth}px → ${c.clientWidth}px`).join("\n"),
        ).toEqual([]);

        /**
         * **The glossary reads as `term = definition` on one line in every language.**
         * All three `=` signs must sit at the same x and the definitions must start at the
         * same x — one row differing makes that row a different grammar.
         */
        const columns = await page.evaluate(() => {
          const dl = document.querySelector('[data-testid="first-run-starter-glossary"]')!;
          const rects = (sel: string) =>
            Array.from(dl.querySelectorAll(sel)).map((e) => {
              const b = e.getBoundingClientRect();
              return { x: Math.round(b.x), y: Math.round(b.y) };
            });
          return { terms: rects("dt"), equals: rects("span"), defs: rects("dd") };
        });

        // Columns: term, `=`, and definition each stand at the same x across the three rows.
        expect(new Set(columns.terms.map((r) => r.x)).size, `용어 열: ${JSON.stringify(columns.terms)}`).toBe(1);
        expect(new Set(columns.equals.map((r) => r.x)).size, `= 열: ${JSON.stringify(columns.equals)}`).toBe(1);
        expect(new Set(columns.defs.map((r) => r.x)).size, `정의 열: ${JSON.stringify(columns.defs)}`).toBe(1);

        /**
         * **Rows must be measured too.** A column check alone also passes when the three
         * cells are **stacked into one column**, because all the x values match then as
         * well. That really happened: Tailwind did not generate
         * `grid-cols-[auto_auto_1fr]`, the screen became a single-column stack, and this
         * check passed green. The contract is not "it is aligned" but **"`term =
         * definition` is on one line"**.
         */
        for (let i = 0; i < columns.terms.length; i += 1) {
          const row = [columns.terms[i], columns.equals[i], columns.defs[i]];
          expect(
            new Set(row.map((r) => r.y)).size,
            `${i}번째 줄이 한 줄에 안 선다: ${JSON.stringify(row)}`,
          ).toBe(1);
        }
      });
    }
  }
});
