import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The chrome must not summon things it does not draw itself** (added 2026-08-01).
 *
 * The owner caught this while recording the demo video — *"A strange tooltip on
 * hover, and some box appearing every time a tab is selected."* (a strange tooltip on
 * hover, and some box appearing every time a tab is selected). Both are **drawn by
 * the OS or the browser**, so they use neither our tokens nor our motion, and they
 * land on top of our screen.
 *
 * 1. **Native tooltips** — the rail destinations carried a `title`. That label is
 *    already visible directly beneath the icon, so the tooltip added no information
 *    while covering the label with a grey box. The icon-only utility tiles at the
 *    bottom are the exception: there the `title` is the only name.
 * 2. **Programmatic focus rings** — on a route change `RouteFocusManager` adds
 *    `tabindex="-1"` to the destination `h1` and focuses it (a legitimate pattern for
 *    screen readers). WebKit drew its default focus ring there, leaving a blue box
 *    around the title. `tabindex="-1"` is unreachable by Tab, so removing the ring
 *    costs keyboard users no signal.
 *
 * A value lint cannot catch either in principle — one is **the presence of an
 * attribute** and the other is **a browser default style**, so neither leaves a
 * literal in our code.
 */
test.describe("크롬 소음", () => {
  test("레일 목적지에 네이티브 툴팁이 없다 — 라벨이 이미 보인다", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/", { waitUntil: "networkidle" });

    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="app-nav-rail-item-"]')]
        .filter((el) => el.getAttribute("title"))
        .map((el) => `${el.getAttribute("data-testid")} title="${el.getAttribute("title")}"`),
    );
    expect(
      offenders,
      "레일 목적지에 `title` 이 있다 — 네이티브 툴팁이 그 아래 보이는 라벨을 덮는다",
    ).toEqual([]);

    // Detector armed check — finding no destinations makes the assertion above idle.
    const count = await page.locator('[data-testid^="app-nav-rail-item-"]').count();
    expect(count, "레일 목적지를 하나도 못 찾았다").toBeGreaterThan(3);
  });

  test("라우트 이동이 제목에 포커스 링을 남기지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/", { waitUntil: "networkidle" });
    await page.getByTestId("app-nav-rail-item-insights").click();
    await page.waitForURL(/insights/);
    await page.waitForTimeout(800);

    const ring = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      if (!h1) return { found: false, focused: false, outline: "" };
      const cs = getComputedStyle(h1);
      return {
        found: true,
        focused: document.activeElement === h1,
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      };
    });

    expect(ring.found, "목적지에 h1 이 없다").toBe(true);
    // Focus **must still have moved** — only the ring was removed, not the accessibility.
    expect(ring.focused, "라우트 이동이 제목으로 포커스를 옮기지 않았다").toBe(true);
    expect(
      ring.outline,
      `제목에 포커스 링이 남았다(${ring.outline}) — 마우스로만 이동한 사람에게 "여기 입력하라"는 거짓 신호다`,
    ).toMatch(/none|0px/);
  });
});
