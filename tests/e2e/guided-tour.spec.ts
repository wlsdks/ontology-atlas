import { expect, test } from "@playwright/test";

/**
 * Guided tour (`src/features/guided-tour`) click-through — walks all 8
 * declarative steps (dev persona branch at step 7) at 1440x900, screenshots
 * each step, and asserts the cutout/card render sane, resolvable rects.
 *
 * Manual-verification companion for the 2026-07-24 tour polish pass — not a
 * committed CI spec (guided tour has no prior e2e coverage; unit coverage
 * lives in `src/features/guided-tour/**\/*.test.ts(x)`).
 */

async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  // 이 spec 은 투어를 **수동으로** 열어 검증한다. 두 자동 표면을 시드로
  // 억제한다: ① 폴더-우선 안내 시트(vault-open-guide:auto:v1), ② 첫 방문
  // 자동 투어(guided-tour:v1). 자동 투어를 끄지 않으면 900ms 발화가 수동
  // 클릭과 경합해 느린 CI 에서 tour-button 이 오버레이에 가려 클릭이 타임
  // 아웃된다(2026-07-24 CI flake 원인). done 시드는 재실행을 막지 않는다 —
  // tour-button 은 저장 상태와 무관하게 항상 tour.start() 를 부른다.
  await page.addInitScript(() => {
    window.localStorage.setItem("vault-open-guide:auto:v1", "1");
    window.localStorage.setItem("guided-tour:v1", "done");
  });
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("guided tour click-through (dev branch, 1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("all 8 steps render a resolvable anchor + card", async ({ page }, testInfo) => {
    await gotoAndSettle(page, "/en/");

    const tourButton = page.getByTestId("topology-tour-button");
    await expect(tourButton).toBeVisible({ timeout: 15_000 });
    await tourButton.click();

    const card = page.getByTestId("guided-tour-card");
    const overlay = page.getByTestId("guided-tour-overlay");

    // Step 1 — welcome (no anchor, centered card, full scrim)
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    await expect(card).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("01-welcome.png") });

    // Step 2 — nodes (canvas-node: project)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "nodes");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("02-nodes.png") });

    // Step 3 — relations (testid: topology-relation-legend)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("03-relations.png") });

    // Step 4 — try-click (interactive canvas-node: domain). Click through the
    // funnel cutout by reading its rect rather than guessing a coordinate.
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    await expect(page.getByTestId("guided-tour-waiting")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("04-try-click-waiting.png") });

    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const cutoutBox = await cutout.boundingBox();
    expect(cutoutBox).not.toBeNull();
    if (cutoutBox) {
      await page.mouse.click(
        cutoutBox.x + cutoutBox.width / 2,
        cutoutBox.y + cutoutBox.height / 2,
      );
    }

    // Step 5 — datasheet (auto-advanced after the click above resolves a selection)
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("05-datasheet.png") });

    // Step 6 — index
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("06-index.png") });

    // Step 7 — recent (branch step)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "recent");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("07-recent.png") });

    // Step 8 — agent (dev branch)
    const devBranchButton = card.getByTestId("guided-tour-dev-branch");
    await expect(devBranchButton).toBeVisible();
    await devBranchButton.click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent", { timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("08-agent.png") });

    // Finish
    await card.getByTestId("guided-tour-finish").click();
    await expect(overlay).toHaveCount(0);
  });

  // 2026-07-24 라이브 결함 회귀 — 4단계(try-click)에서 스포트라이트 구멍이
  // 그려진 노드와 어긋나면 사용자가 밝은 노드를 눌러도 4-스트립 blocker 가
  // 클릭을 삼켜 투어가 영구 정지한다. 프로브(topology-tour-anchor)는 엔진의
  // worldToScreen 실좌표이므로 "프로브 중심 = 항상 클릭 통과" 를 계약으로
  // 고정한다.
  test("step 4: probe center is click-passable and advances the tour", async ({ page }) => {
    await gotoAndSettle(page, "/en/");

    const tourButton = page.getByTestId("topology-tour-button");
    await expect(tourButton).toBeVisible({ timeout: 15_000 });
    await tourButton.click();

    const card = page.getByTestId("guided-tour-card");
    const overlay = page.getByTestId("guided-tour-overlay");
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "nodes");
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    const probe = page.getByTestId("topology-tour-anchor");
    const box = await probe.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // 구멍-프로브 정합: 프로브 중심의 최상단 요소가 blocker 스트립이 아니라
    // 캔버스여야 한다 (스트립이면 클릭이 캔버스에 도달하지 못한다).
    const hitTag = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x as number, y as number)?.tagName ?? "NONE",
      [cx, cy],
    );
    expect(hitTag).toBe("CANVAS");

    await page.mouse.click(cx, cy);
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
  });
});
