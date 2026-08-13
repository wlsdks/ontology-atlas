import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **가이드 장 끝이 막다른 길이 아니다** (2026-08-13 실측에서 생긴 게이트).
 *
 * 가이드는 순서가 있는 13장인데, 본문이 끝나는 자리에 다음 장으로 가는 길이
 * 0개였다 — 다 읽은 사람이 왼쪽 차례로 되돌아가 방금 읽은 장이 몇 번째인지
 * 스스로 찾아야 했다. 순서의 정본(`guide-pages.ts`)이 이미 있으므로 장 끝
 * 이전/다음 내비가 그 순서를 그대로 쓴다.
 *
 * 첫 장은 다음만, 마지막 장(trust)은 이전만 갖는 것까지 잰다 — 없는 장으로
 * 가는 문을 그리면 그게 새 막다른 길이다.
 */
test.describe("가이드 장 끝 이전/다음", () => {
  test("첫 장은 다음만 갖고, 누르면 실제로 다음 장에 착지한다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/?guides=off", { waitUntil: "domcontentloaded" });
    const pager = page.getByTestId("guide-pager");
    await expect(pager).toBeVisible();
    await expect(page.getByTestId("guide-pager-prev")).toHaveCount(0);
    const next = page.getByTestId("guide-pager-next");
    await expect(next).toBeVisible();
    await next.click();
    await page.waitForURL(/\/guide\/first-five-minutes/, { timeout: 15_000 });
    // 가운데 장은 양쪽 다 갖는다.
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toBeVisible();
  });

  test("마지막 장은 이전만 갖는다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/trust/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("guide-pager")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toHaveCount(0);
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
  });
});
