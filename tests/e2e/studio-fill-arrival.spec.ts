import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 공방 채움 확정 — **재료가 자리로 걸어 들어온다**.
 *
 * 소유자가 이름으로 부른 순간이다: *"세팅할때마다 뭔가 움직이면서 표현되는
 * 그런거"*. 2026-07-28 실측으로 그 절정에서 **아무것도 이동하지 않았다** —
 * 피커·소켓이 0프레임에 사라지고 완성된 위성이 0프레임에 나타났다.
 *
 * "내가 방금 구조 한 조각을 지었다" 는 감각은 재료가 자리로 *가는* 것을 볼 때
 * 생긴다. 그래서 새 위성은 자기 소켓이 있던 쪽에서 걸어온다 — 방위마다 축이
 * 다르므로 **어느 소켓이 이 위성이 됐는지를 이동이 말한다**(끄면 그 대응을
 * 잃으므로 정보다).
 *
 * ## 왜 애니메이션 이벤트를 잡나
 *
 * 도착 표시(`data-testid`)는 400ms 뒤 걷힌다 — 안 걷으면 이후의 재렌더가 같은
 * 위성을 다시 도착시킨다. 그래서 사라지는 속성이 아니라 **일어난 사건**을
 * 기록해서 본다.
 */
test("빈 소켓을 채우면 새 위성이 확정 램프로 도착한다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto(
    `/ko/ontology/studio/?guides=off&node=${encodeURIComponent("capability:order-create")}`,
    { waitUntil: "networkidle" },
  );

  const stage = page.getByTestId("studio-compass-stage");
  await expect(stage).toBeVisible({ timeout: 20_000 });

  const socket = page.locator('[data-testid^="studio-socket-"]').first();
  await expect(socket, "빈 소켓이 없으면 이 게이트는 아무것도 안 지킨다").toBeVisible();
  await socket.click();

  const candidate = page.locator('[data-testid^="studio-suggest-row-"]').first();
  await expect(candidate).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __fillAnims: string[] }).__fillAnims = [];
    document.addEventListener(
      "animationstart",
      (event) => {
        (window as unknown as { __fillAnims: string[] }).__fillAnims.push(
          (event as AnimationEvent).animationName,
        );
      },
      true,
    );
  });

  await candidate.click();

  await expect
    .poll(
      async () =>
        page.evaluate(
          () => (window as unknown as { __fillAnims: string[] }).__fillAnims,
        ),
      { timeout: 5_000 },
    )
    .toContain("studioFillArrive");
});
