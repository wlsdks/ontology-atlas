import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **공방에서 도착하는 것만 움직인다** (2026-08-12).
 *
 * ## 왜 이 spec 이 생겼나
 *
 * 소유자: *"공방쪽은 2D인데 좀 움직이고 그런 모션좀 넣어달랬는데 안해주더라고"*.
 *
 * 재 보니 공방은 **움직이고 있었다** — 방위를 채우면 지지대가 흐르고
 * (`studioStrutFlow`) 도착 표시가 뜬다(`studioFillArrive`). 문제는 그 반대였다:
 * 채우는 순간을 프레임으로 재니 입장 애니메이션(`studioStageIn`)이 **중앙 카드와
 * 나머지 세 소켓, 추가 버튼에까지** 다시 붙었다. 채운 것은 아래 방위 하나인데
 * 화면 전체가 다시 들어온 것이다.
 *
 * 그래서 「안 움직인다」로 느껴졌다 — **모든 것이 같이 움직이면 아무것도 도착하지
 * 않는다.** 이 저장소의 모션 규칙이 「움직임은 무엇이 어디서 어디로 갔는지 설명해야
 * 한다」고 정해 둔 그 지점이고, 규칙이 금지하는 「인과 없는 움직임」이다.
 *
 * 원인은 CSS 가 아니라 **정체성**이었다: 관계가 landing 하면 React 가 나침 무대를
 * 다시 마운트하고, CSS 입장 애니메이션은 마운트마다 재생된다.
 *
 * ## 잠그는 성질
 *
 * ① 채울 때 **입장이 다시 재생되지 않는다** ② 그러면서 **도착은 움직인다**.
 * 둘을 같이 잠근다 — ①만 잠그면 「전부 끄기」로도 통과하고, 그건 이 화면을 정적으로
 * 만드는 것이다.
 */

test("공방 · 방위를 채우면 도착한 것만 움직인다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/ontology/studio/?guides=off", { waitUntil: "domcontentloaded" });

  const entry = page.getByTestId("studio-entry-create");
  await expect(entry).toBeVisible({ timeout: 30_000 });
  /*
   * ⚠️ **하이드레이션을 기다린다.** 카드가 보이는 것과 그 카드가 눌리는 것은 다른
   * 순간이다 — 기다리지 않고 누른 판은 DOM 클릭이 나갔는데도 무대가 열리지 않았다
   * (React 가 아직 핸들러를 붙이지 않았다). 「보인다」로 「누를 수 있다」를 갈음하지 않는다.
   */
  await page.waitForTimeout(1_500);
  await entry.click();
  const name = page.getByTestId("studio-create-name");
  await expect(name, "무대에 이름 입력 자리가 없다").toBeVisible({ timeout: 30_000 });
  await name.fill("결제 승인");
  await page.getByTestId("studio-socket-down").click();
  await expect(page.getByTestId("studio-picker")).toBeVisible({ timeout: 10_000 });

  /*
   * 입장 창(520ms)이 지난 뒤에 채운다 — 사용자도 무대가 들어온 뒤에 누른다.
   * 그 전에 누르면 입장이 아직 정당하게 돌고 있어 이 판정이 뜻을 잃는다.
   */
  await page.waitForTimeout(700);

  const running = await page.evaluate(async () => {
    const row = document.querySelector('[data-testid^="studio-picker-row-"]') as HTMLElement | null;
    if (!row) return null;
    const seen = new Set<string>();
    let stop = false;
    const tick = () => {
      if (stop) return;
      for (const animation of document.getAnimations?.() ?? []) {
        const name = (animation as unknown as { animationName?: string }).animationName ?? "";
        const target = (animation.effect as unknown as { target?: Element })?.target;
        const id = (target as HTMLElement | undefined)?.dataset?.testid ?? target?.tagName ?? "?";
        if (name) seen.add(`${name}@${id}`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    row.click();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    stop = true;
    return [...seen];
  });

  expect(running, "피커 행을 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
  const names = running!;
  console.log(`[studio-motion] 채울 때 도는 애니메이션: ${names.join(" · ") || "(없음)"}`);

  // ① 이미 있던 것이 다시 들어오지 않는다.
  const reentered = names.filter((entry) => entry.startsWith("studioStageIn@"));
  expect(
    reentered,
    `방위 하나를 채웠는데 무대가 다시 입장했다 — 무엇이 도착했는지 읽히지 않는다: ${reentered.join(", ")}`,
  ).toEqual([]);

  // ② 그러면서 도착은 움직인다 — ①만 잠그면 「전부 끄기」도 통과한다.
  expect(
    names.some((entry) => entry.startsWith("studioFillArrive@") || entry.startsWith("studioStrutFlow@")),
    `채웠는데 아무것도 도착하지 않았다: ${names.join(", ") || "(애니메이션 0)"}`,
  ).toBe(true);
});
