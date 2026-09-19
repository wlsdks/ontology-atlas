import { expect, test } from "@playwright/test";

/**
 * **Picking a subject must not move the control you just clicked.**
 *
 * The Analysis board has two rows: the subject (brief · concepts · wiki · guidance) and, for
 * concepts only, its seven questions. Between them sits the census strip, which counts the
 * ontology and is therefore drawn for concepts alone.
 *
 * Measured 2026-09-20: while the strip stood *above* the subject control, choosing concepts
 * inserted 188px over it — the control jumped from y=104 to y=292 at both 1512 and 1920, out
 * from under the pointer that had just clicked it, and the accessibility tree read the strip's
 * numbers before naming the subject they belonged to. Moving the strip between the rows fixes
 * it, and this measures the fix rather than the arrangement, so a later rearrangement is free
 * as long as the control stays still.
 */

const SUBJECTS = ["brief", "ontology", "library", "harness"] as const;

async function subjectControlTop(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="insights-core-switch"]');
    if (!el) throw new Error("the subject control is gone — this test is watching nothing");
    return Math.round(el.getBoundingClientRect().top);
  });
}

for (const [width, height] of [
  [1512, 900],
  [1920, 1080],
] as const) {
  test.describe(`분석 보드 — 주제를 골라도 그 컨트롤은 제자리다 (${width})`, () => {
    test.use({ viewport: { width, height } });

    test("네 주제 모두에서 주제 컨트롤의 위치가 같다", async ({ page }) => {
      await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("insights-core-switch")).toBeVisible({ timeout: 20_000 });

      const tops: Record<string, number> = {};
      for (const subject of SUBJECTS) {
        await page.getByTestId(`insights-core-${subject}`).click();
        await expect(page.getByTestId(`insights-core-${subject}`)).toHaveAttribute("aria-checked", "true");
        tops[subject] = await subjectControlTop(page);
      }

      // Idling guard — without the strip actually appearing under concepts there is nothing that
      // could have pushed the control, and four equal numbers would prove nothing.
      await page.getByTestId("insights-core-ontology").click();
      await expect(page.getByRole("tablist")).toBeVisible();
      const stripBelowControl = await page.evaluate(() => {
        const control = document.querySelector('[data-testid="insights-core-switch"]');
        const tablist = document.querySelector('[role="tablist"]');
        if (!control || !tablist) return null;
        const gap = tablist.getBoundingClientRect().top - control.getBoundingClientRect().bottom;
        return Math.round(gap);
      });
      expect(stripBelowControl, "주제 행과 질문 행 사이가 비어 있다 — 인구조사 띠가 없다").toBeGreaterThan(100);

      const distinct = new Set(Object.values(tops));
      expect(
        distinct.size,
        `주제를 바꾸면 그 컨트롤이 움직인다: ${JSON.stringify(tops)}`,
      ).toBe(1);
    });
  });
}

/**
 * **The landing's action has to act.**
 *
 * The board holds its tab in component state and writes the address itself, so a link to
 * `?tab=do-next` changed the address and left the reader on the brief. A hard load of the same
 * address worked, which is what made it read as a routing problem rather than a dead control
 * (walkthrough, 2026-09-20). This is the click a person actually makes.
 */
test.describe("분석 브리핑 — 「열기」는 같은 화면 안에서 그 질문을 연다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("고칠 것으로 보내는 줄을 누르면 주제와 판이 따라온다", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("insights-core-switch")).toBeVisible({ timeout: 20_000 });

    const repair = page.locator('[data-brief-destination="do-next"]').first();
    await expect(repair, "브리핑에 같은 화면으로 보내는 줄이 없다 — 이 시험이 공회전한다").toBeVisible();
    await repair.click();

    await expect(page.getByTestId("insights-core-ontology")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-insights-panel="do-next"]')).toBeVisible();
    // The address follows, and the flags that were already on it survive.
    await expect(page).toHaveURL(/tab=do-next/);
    await expect(page).toHaveURL(/guides=off/);
  });
});

/**
 * **The app's floor must show an answer, not only numbers.**
 *
 * The board is used in a window the app itself will not let get smaller than 1040x720. Measured
 * 2026-09-20 at that size: two control rows plus a census strip that reflowed two-by-two left the
 * first finding at y=671 of 720, flush against the bottom edge, so the person who pressed a
 * question scrolled before reading anything. Every question panel starts at the same height, so
 * one number pins all seven.
 */
test.describe("분석 보드 — 앱 최소 창에서 첫 답이 화면 안에 있다", () => {
  test.use({ viewport: { width: 1040, height: 720 } });

  for (const tab of ["do-next", "unmatched", "composition"] as const) {
    test(`${tab} 판의 첫 줄이 접히는 선 위에 있다`, async ({ page }) => {
      await page.goto(`/ko/ontology/insights/?guides=off&tab=${tab}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(`[data-insights-panel="${tab}"]`)).toBeVisible({ timeout: 20_000 });

      const seen = await page.evaluate(() => {
        const panel = document.querySelector("[data-insights-panel]");
        const box = panel?.getBoundingClientRect();
        return {
          panelTop: box ? Math.round(box.top) : null,
          viewport: window.innerHeight,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });

      expect(seen.overflow, "가로로 넘친다").toBe(0);
      expect(seen.panelTop, "판이 시작되기도 전에 창을 다 쓴다").not.toBeNull();
      // The chrome above the answer may take at most two thirds of the window. Measured after the
      // census strip moved to this container's own 960 step: 442 of 720, or 61%.
      expect(
        seen.panelTop! / seen.viewport,
        `판이 y=${seen.panelTop} 에서 시작한다 (창 ${seen.viewport})`,
      ).toBeLessThan(0.67);
    });
  }
});

/**
 * **A switch that happens in place still has to hand focus somewhere.**
 *
 * The link a reader pressed leaves the DOM with the old panel, so focus fell to `<body>`: they
 * had neither the link nor the answer, and the next Tab restarted inside the new panel by luck
 * (design-interaction, 2026-09-20). Focus moves for this path only; the question row keeps its
 * own roving focus.
 *
 * **One word, one outcome.** The unchecked-evidence line leaves the product for the download
 * page and printed the same word as the line above it, which stays on this board.
 */
test.describe("분석 브리핑 — 제자리 전환이 초점과 낱말을 흘리지 않는다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("Enter 로 연 질문 판에 초점이 남는다", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    const repair = page.locator('[data-brief-destination="do-next"]').first();
    await expect(repair).toBeVisible({ timeout: 20_000 });

    await repair.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-insights-panel="do-next"]')).toBeVisible();

    const landed = await page.evaluate(() => {
      const active = document.activeElement;
      const panel = document.querySelector('[data-insights-panel]');
      return {
        onBody: active === document.body,
        insidePanel: Boolean(active && panel && (active === panel || panel.contains(active))),
        panelKey: panel?.getAttribute("data-insights-panel") ?? null,
      };
    });
    expect(landed.panelKey, "판이 바뀌지 않았다 — 이 시험이 공회전한다").toBe("do-next");
    expect(landed.onBody, "초점이 문서 바닥으로 떨어졌다").toBe(false);
    expect(landed.insidePanel, "초점이 새 판 안에 없다").toBe(true);
  });

  test("한 카드 안에서 같은 낱말이 두 곳으로 보내지 않는다", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("brief-tab")).toBeVisible({ timeout: 20_000 });

    const pairs = await page.locator("[data-brief-destination]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: (node.textContent ?? "").trim(),
        away: node.getAttribute("data-brief-destination") === "away",
        href: node.getAttribute("href") ?? "",
      })),
    );
    expect(pairs.length, "브리핑에 목적지가 없다 — 이 시험이 공회전한다").toBeGreaterThan(2);

    // One label may not carry two kinds of outcome anywhere on this tab.
    const kindsByLabel = new Map<string, Set<string>>();
    for (const pair of pairs) {
      const kind = pair.away ? (pair.href.includes("/download/") ? "download" : "away") : "same-board";
      if (!kindsByLabel.has(pair.label)) kindsByLabel.set(pair.label, new Set());
      kindsByLabel.get(pair.label)!.add(kind);
    }
    const ambiguous = [...kindsByLabel].filter(([, kinds]) => kinds.size > 1).map(([label]) => label);
    expect(ambiguous, `같은 낱말이 서로 다른 결과로 보낸다: ${ambiguous.join(", ")}`).toEqual([]);
  });
});
