import { expect, test, type Page } from "@playwright/test";

import { AUDITED_ROUTES } from "./audited-routes";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Everything pressable uses the same cursor.**
 *
 * **Why this gate exists (audit 2026-08-05).** Measured at 1512 across 7 routes:
 * 75 `a` links were `pointer` while 58 buttons were `default`. Nobody had decided
 * that — it was **the browser's per-tag defaults taken as they came**. On top of
 * that, hand-written `cursor-pointer` was scattered across 22 places in 10 files,
 * and even among buttons it contradicted itself 5:56 — not a split from policy but
 * whatever each author wrote at the time.
 *
 * Owner decision: **pointer everywhere.** The policy lives in one place, the base
 * layer of `app/globals.css`.
 *
 * **Why here and not lint.** A violation **leaves no value in the code at all.** A
 * new component that simply uses `<button>` falls to the browser default with no
 * class and no inline style — there is no string to look at. The selectors in
 * `eslint.config.mjs` can catch only *redundantly written* values; "the central
 * rule disappeared or does not reach here" is knowable only by **measuring the
 * rendered result** (`design.md`: "layers lint cannot see belong to contract
 * tests").
 *
 * **What is not measured.**
 *
 * - **Disabled controls** — `disabled:cursor-not-allowed` (7 places) and
 *   `disabled:cursor-wait` (5) say "you cannot press this". Requiring pointer here
 *   would erase that signal.
 * - **Canvas** — the map is correctly `grab`/`grabbing` (it is dragged, not
 *   pressed).
 * - **Scrims** — pressing closes them, but they are a surface, not a control
 *   (`cursor-default` is right).
 */
const VIEWPORT = { width: 1512, height: 900 };

/** Measures only controls that are really rendered, not disabled, and not over the canvas. */
async function measure(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, summary, a[href]")]
      .filter((el) => {
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) return false;
        if (r.top >= innerHeight || r.bottom <= 0 || r.left >= innerWidth || r.right <= 0) return false;
        if (el.closest("details:not([open])")) return false;
        if ((el as HTMLButtonElement).disabled) return false;
        if (el.getAttribute("aria-disabled") === "true") return false;
        return true;
      })
      .map((el) => ({
        cursor: getComputedStyle(el).cursor,
        tag: el.tagName.toLowerCase(),
        label: (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 28),
      })),
  );
}

for (const route of AUDITED_ROUTES) {
  test(`커서 어포던스 — ${route} 의 활성 컨트롤은 전부 pointer`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.waitForTimeout(900);

    const controls = await measure(page);

    // The detector must not run on an empty set — with 0 controls this assertion is a free pass.
    expect(controls.length, "이 화면에서 잰 컨트롤이 0개다 — 게이트가 헛돈다").toBeGreaterThan(0);

    const offenders = controls.filter((c) => c.cursor !== "pointer");
    expect(
      offenders.map((c) => `${c.tag}«${c.label}» → ${c.cursor}`),
      "활성 컨트롤인데 pointer 가 아니다 — app/globals.css 의 base 커서 규칙을 확인",
    ).toEqual([]);
  });
}

/**
 * Confirms the method itself distinguishes "not pointer" (`/gate-probe`).
 *
 * The check above passes on an empty list. If the filter quietly over-excludes
 * (say, every control is classified as disabled), it stays green while the defect
 * lives. So **a deliberately non-pointer button** is planted on the same page and
 * the probe confirms it is caught.
 */
test("판정 방식이 pointer 아닌 버튼을 실제로 잡는다 — 헛도는 검사가 아님", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });

  const before = (await measure(page)).filter((c) => c.cursor !== "pointer");
  expect(before, "심기 전부터 위반이 있으면 프로브가 무의미하다").toEqual([]);

  await page.evaluate(() => {
    const b = document.createElement("button");
    b.textContent = "probe";
    b.style.cursor = "default";
    b.style.width = "40px";
    b.style.height = "20px";
    document.body.prepend(b);
  });

  const after = (await measure(page)).filter((c) => c.cursor !== "pointer");
  expect(after.length, "심어 둔 위반을 못 잡는다 — 필터가 과하게 걸러내고 있다").toBe(1);
});
