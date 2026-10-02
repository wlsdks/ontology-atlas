import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Guided tour (`src/features/guided-tour`) click-through — walks all 8
 * declarative steps (dev persona branch at step 7) at 1440x900 and asserts the
 * cutout/card render sane, resolvable rects.
 *
 * Manual-verification companion for the 2026-07-24 tour polish pass — not a
 * committed CI spec (guided tour has no prior e2e coverage; unit coverage
 * lives in `src/features/guided-tour/**\/*.test.ts(x)`).
 */

async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  // This spec opens the tour **manually**. Without seeding away the first-visit
  // automatic surfaces (the folder-first guidance sheet and the auto tour), the 900ms
  // trigger races the manual click and on a slow CI runner the tour button is covered
  // by the overlay and the click times out (the cause of the 2026-07-24 CI flake).
  // Seeding "done" does not prevent a rerun — the tour button always calls
  // tour.start() regardless of stored state.
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("guided tour click-through (dev branch, 1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("all 8 steps render a resolvable anchor + card", async ({ page }) => {
    // The tour runs on the map — since 2026-07-30 `/` is the gateway.
    await gotoAndSettle(page, "/en/topology/?e2e=1");

    const tourButton = page.getByTestId("topology-tour-button");
    await expect(tourButton).toBeVisible({ timeout: 15_000 });
    await tourButton.click();

    const card = page.getByTestId("guided-tour-card");
    const overlay = page.getByTestId("guided-tour-overlay");

    // Step 1 — welcome (no anchor, centered card, full scrim)
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    await expect(card).toBeVisible();

    // Step 2 — nodes (canvas-node: project)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "nodes");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 3 — relations (centered explanation; the persistent corner legend is retired)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await expect(page.getByTestId("guided-tour-cutout")).toHaveCount(0);

    // Step 4 — try-click (interactive canvas-node: domain). Click through the
    // funnel cutout by reading its rect rather than guessing a coordinate.
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    await expect(page.getByTestId("guided-tour-waiting")).toBeVisible();

    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const cutoutBox = await cutout.boundingBox();
    expect(cutoutBox).not.toBeNull();
    // The card asks the person to press the lit node; it must not sit on that
    // node's name (2026-09-19: the card's top cut the hub's name in half).
    const nameClearance = await page.evaluate(() => {
      const probe = window.__atlasMap!;
      const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      const cut = document.querySelector('[data-testid="guided-tour-cutout"]')!.getBoundingClientRect();
      const cx = cut.left + cut.width / 2 - canvas.left;
      const cy = cut.top + cut.height / 2 - canvas.top;
      const lit = probe.nodes().reduce((best, n) => (Math.hypot(n.x - cx, n.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? n : best));
      const name = probe.labels().find((l) => l.nodeId === lit.id);
      const card = document.querySelector('[data-testid="guided-tour-card"]')!.getBoundingClientRect();
      return { lit: lit.label, nameBottom: name ? canvas.top + name.maxY : null, cardTop: card.top, cardBelow: card.top > cut.top };
    });
    expect(nameClearance.nameBottom, `켜진 노드 ${nameClearance.lit} 의 이름이 안 그려졌다`).not.toBeNull();
    if (nameClearance.cardBelow) {
      expect(nameClearance.cardTop, `카드 위쪽(${Math.round(nameClearance.cardTop)})이 켜진 노드의 이름(${Math.round(nameClearance.nameBottom!)})을 덮는다`).toBeGreaterThanOrEqual(nameClearance.nameBottom!);
    }
    /* Regression for the 2026-07-24 live defect: if the spotlight hole is misaligned with the
       drawn node, the four-strip blocker swallows the click on the lit node and the tour stalls.
       The probe (`topology-tour-anchor`) reports the engine's real worldToScreen coordinates, so
       its centre must be the canvas itself, not a blocker strip, and a press there advances. */
    const anchor = (await page.getByTestId("topology-tour-anchor").boundingBox())!;
    const cx = anchor.x + anchor.width / 2;
    const cy = anchor.y + anchor.height / 2;
    expect(
      await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? "NONE", [cx, cy]),
    ).toBe("CANVAS");
    await page.mouse.click(cx, cy);

    // Step 5 — datasheet (auto-advanced after the click above resolves a selection)
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 6 — index
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 7 — recent (branch step)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "recent");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 8 — agent (dev branch)
    const devBranchButton = card.getByTestId("guided-tour-dev-branch");
    await expect(devBranchButton).toBeVisible();
    await devBranchButton.click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent", { timeout: 5_000 });

    // Finish
    await card.getByTestId("guided-tour-finish").click();
    await expect(overlay).toHaveCount(0);
  });
});

/**
 * **The INDEX step shows the INDEX, not the first-run card** (2026-09-19).
 *
 * A first-run person starts the tour from the first-run card, so at the
 * "INDEX: the map's table of contents" step that card was still standing where
 * the list should be, and the cutout lit a sample picker and an open-folder
 * button while the copy described a list of names. The card gives way to the
 * list for that step; the other specs seed the card away and could not see it.
 */
test.describe("guided tour on a true first run", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the INDEX step lights the list, not the first-run card", async ({ page }) => {
    await page.goto("/en/topology/?e2e=1&guides=off");
    await page.waitForLoadState("networkidle");
    const starterTour = page.getByTestId("first-run-tour-cta");
    await expect(starterTour, "이 스펙은 첫 실행 카드에서 출발한다").toBeVisible();
    await starterTour.click();
    const overlay = page.getByTestId("guided-tour-overlay");
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    const card = page.getByTestId("guided-tour-card");
    for (const step of ["nodes", "relations", "try-click"]) {
      await card.getByTestId("guided-tour-next").click();
      await expect(overlay).toHaveAttribute("data-tour-step", step);
    }
    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const box = (await cutout.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");

    await expect(page.getByTestId("topology-index-tree"), "INDEX 단계인데 목록이 안 보인다").toBeVisible();
    await expect(page.getByTestId("first-run-starter"), "INDEX 단계인데 첫 실행 카드가 서 있다").toHaveCount(0);

    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "recent");
    await card.getByTestId("guided-tour-dev-branch").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent");
    await expect(page.getByTestId("first-run-starter-more-toggle"), "the developer step left the group holding the command folded").toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("first-run-starter-cli-toggle"), "개발자 단계인데 명령 한 줄이 접혀 있다").toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const block = document.querySelector('[data-testid="first-run-starter-cli-bridge"]')!.getBoundingClientRect();
            const card = document.querySelector('[data-testid="first-run-starter"]')!.getBoundingClientRect();
            return Math.round(block.bottom - card.bottom);
          }),
        { timeout: 5_000, message: "명령 블록이 카드 아래로 잘려 있다" },
      )
      .toBeLessThanOrEqual(1);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const rect = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
            const block = rect("first-run-starter-cli-bridge");
            const cutout = rect("guided-tour-cutout");
            const tourCard = rect("guided-tour-card");
            const inside =
              block.top >= cutout.top - 1 &&
              block.bottom <= cutout.bottom + 1 &&
              block.left >= cutout.left - 1 &&
              block.right <= cutout.right + 1;
            const covered =
              block.left < tourCard.right && block.right > tourCard.left && block.top < tourCard.bottom && block.bottom > tourCard.top;
            return { inside, covered };
          }),
        { timeout: 5_000, message: "the developer step lights the card but the command sits outside the cutout or under the tour card" },
      )
      .toEqual({ inside: true, covered: false });
  });
});
