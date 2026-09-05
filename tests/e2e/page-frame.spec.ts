import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The titles of the three list destinations stand in the same place.**
 *
 * **What happened (2026-08-09, owner report):**
 *
 * > *"Insights, projects, and skills should all have the same top spacing — don't
 * > we have a design system? why are they all different?"*
 *
 * Measured, the distance to the title was **32 / 48 / 20px**. And the top was not
 * the only axis that diverged: the horizontal inset (40/40/32) and the maximum
 * width (1600/1600/1400) all differed too, and the same 1600 was written in **two
 * places**, a CSS token and a JS constant.
 *
 * **Why measure rather than check classes.** The 48px is not one margin but a
 * **sum**: 40 top padding + (36 header row − 28 title leading). So checking only
 * the `PAGE_FRAME` string passes even when the header row height is missing — that
 * +8 is visible only once rendered.
 *
 * ⚠️ No value is pinned; only **whether the three agree with each other**. Writing
 * a reference value as a literal makes this test fail first when the ramp moves
 * legitimately, and then the next person reverts the spec (the same shape as the
 * two failures `design-gates.md` already records).
 */

const MEMBERS = [
  { route: "/ko/projects/", title: "프로젝트" },
  { route: "/ko/ontology/insights/", title: "그래프 인사이트" },
  { route: "/ko/agents/", title: "에이전트" },
  // MCP (2026-09-05) — a new list destination wearing the same frame. A member that is
  // not on this list is a screen free to pick its own top spacing again, which is the
  // exact defect this spec exists for.
  { route: "/ko/mcp/", title: "MCP" },
] as const;

async function measureHeader(
  page: import("@playwright/test").Page,
  route: string,
) {
  await page.goto(`${route}?guides=off`);
  const heading = page.locator("main h1").first();
  await expect(heading).toBeVisible({ timeout: 15_000 });
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const h1 = main.querySelector("h1")!;
    // **The frame element is not found structurally.** Wrapper depth differs per
    // screen, so a selector like `main > div` matches on one screen only (measured:
    // null on insights). The frame is defined as "the ancestor carrying the maximum
    // width", so that is how it is found.
    // ⚠️ On some screens `main` itself is the frame (insights) — stopping the walk at
    // `main` returns `null` for that screen alone, which is a failure to measure, not
    // a defect.
    let column: HTMLElement | null = null;
    for (let node: HTMLElement | null = h1.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).maxWidth !== "none") {
        column = node;
        break;
      }
      if (node === main) break;
    }
    const cs = column ? getComputedStyle(column) : null;
    // **Measure only what the frame owns** — measuring from above `main` mixes in
    // things outside it. Measured at 768: projects 96 / insights 40 / skills 48, and
    // the cause was not the frame but **where the mobile settings row sat** (inside
    // `main` for projects, outside for insights, absent for skills). That is not the
    // question this spec answers — measuring them together makes the gate catch the
    // wrong thing and the next person revert the frame.
    return {
      titleY: column
        ? Math.round(h1.getBoundingClientRect().top - column.getBoundingClientRect().top)
        : null,
      padTop: cs?.paddingTop ?? null,
      padLeft: cs?.paddingLeft ?? null,
    };
  });
}

test.describe("페이지 틀", () => {
  /**
   * Measures whether the three destinations sharing PAGE_FRAME really render with
   * the same title origin and inset. A string contract alone cannot catch a
   * difference in header interior height.
   */
  test("목적지들의 제목이 같은 y 에 선다 (1280 · 768)", async ({ page }) => {
    await seedFirstRunSeen(page);
    for (const width of [1280, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const measured: { title: string; titleY: number | null; padLeft: string | null }[] = [];
      for (const member of MEMBERS) {
        const m = await measureHeader(page, member.route);
        measured.push({ title: member.title, titleY: m.titleY, padLeft: m.padLeft });
      }
      /*
       * Derived from the member list rather than pinned by hand: MCP joined the family on
       * 2026-09-05, and a hand-written 3 turns a new member into a failure instead of a
       * measurement. The floor keeps "measured nothing" from reading as a pass.
       */
      expect(MEMBERS.length, "멤버가 비면 이 시험이 헛돈다").toBeGreaterThan(2);
      expect(measured.length, "라우트를 하나도 못 재면 이 시험이 헛돈다").toBe(MEMBERS.length);
      expect(
        measured.filter((m) => m.titleY === null).map((m) => m.title),
        "틀 요소를 못 찾은 라우트가 있다 — 「못 쟀다」를 「통과」로 세지 않는다",
      ).toEqual([]);

      const ys = new Set(measured.map((m) => m.titleY));
      expect(
        ys.size,
        `${width}px 에서 제목 y 가 갈렸다: ` +
          measured.map((m) => `${m.title} ${m.titleY}`).join(" / "),
      ).toBe(1);

      const lefts = new Set(measured.map((m) => m.padLeft));
      expect(
        lefts.size,
        `${width}px 에서 좌우 인셋이 갈렸다: ` +
          measured.map((m) => `${m.title} ${m.padLeft}`).join(" / "),
      ).toBe(1);
    }
  });
});
