import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **걸어온 길 왕복** (2026-08-13 걷기에서 승격 — 이 여정을 재는 게이트가 0개였다).
 *
 * 지도의 방문 자취는 소유자가 직접 고른 기능(발자국 번호·자취 팝오버)인데,
 * 「쌓인다 → 목록이 맞다 → 뒤로 점프한다 → 지운다」를 이어 재는 검사가 없었다.
 * 키보드 걷기 스펙은 방향키 이동만 보고 자취 UI 는 안 본다.
 *
 * 세 걸음을 팝오버 행 이동으로 쌓는다(같은 노드 재클릭은 문서 열기로 빠지는
 * 별도 계약이라 쓰지 않는다 — 첫 시도가 그렇게 문서함으로 이탈했다, 실측).
 */
test("걸어온 길 — 쌓이고, 목록이 맞고, 뒤로 점프하고, 지워진다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  const selection = () =>
    page.evaluate(
      () => (window as unknown as { __atlasMap: { selection: () => { nodeId: string | null } } }).__atlasMap.selection().nodeId,
    );

  // 1걸음 — 주문 도메인 클릭 (캔버스 좌표)
  const t = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; label: string; x: number; y: number }> } }).__atlasMap;
    const box = document.querySelector('[data-testid="topology-map-v2-canvas"]')?.getBoundingClientRect();
    const n = m?.nodes().find((n) => !n.hidden && n.label === "주문");
    return n && box ? { px: box.left + n.x, py: box.top + n.y } : null;
  });
  expect(t, "주문 도메인을 못 찾았다 — 공회전").not.toBeNull();
  await page.mouse.click(t!.px, t!.py);
  await page.waitForTimeout(900);
  expect(await selection()).toBe("domain:order");

  // 2·3걸음 — 팝오버 행으로 이동
  await page.getByText("장바구니", { exact: true }).first().click();
  await page.waitForTimeout(900);
  expect(await selection()).toBe("capability:cart");
  await page.getByText("주문서 작성", { exact: true }).first().click();
  await page.waitForTimeout(900);
  expect(await selection()).toBe("capability:checkout");

  // 칩이 세 걸음을 센다
  const chip = page.getByText(/걸어온 길 · 3/);
  await expect(chip, "자취 칩이 걸음 수를 안 센다").toBeVisible();
  await chip.click();
  await page.waitForTimeout(700);

  // 목록 — 지금 여기 + 1걸음 전 + 2걸음 전
  await expect(page.getByText("지금 여기")).toBeVisible();
  await expect(page.getByText("1걸음 전")).toBeVisible();
  await expect(page.getByText("2걸음 전")).toBeVisible();

  // 뒤로 점프 — 2걸음 전(주문) 행을 누르면 선택이 돌아간다
  await page.getByText("주문", { exact: true }).last().click();
  await page.waitForTimeout(900);
  expect(await selection(), "자취 행이 그 노드로 데려가지 않았다").toBe("domain:order");

  // 지우기 — 칩이 사라진다
  await page.getByText(/걸어온 길 · \d/).click();
  await page.waitForTimeout(500);
  await page.getByText("지우기", { exact: true }).click();
  await page.waitForTimeout(700);
  await expect(page.getByText(/걸어온 길 · \d/)).toHaveCount(0);
});
