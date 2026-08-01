import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { STOREFRONT_STUDIO_NODE_PARAM } from "./storefront-node";

/**
 * 키보드 경로 계약 — **합성 이벤트로는 잴 수 없는 층**.
 *
 * ## 왜 이 파일이 생겼나
 *
 * 2026-07-28 디자인 카운슬 「상호작용」이 키보드 결함 3건을 냈다. 검증해 보니
 * 최소 둘이 **계측 기법의 산물**이었다:
 *
 * - "허브에서 Enter 가 아무것도 안 연다" — 허브 항목은 `<button type="button">`
 *   이라 **네이티브로 Enter → click** 이 발화한다. 합성 `KeyboardEvent` 는 그
 *   네이티브 활성화를 재현하지 않으므로, 그 방법으로는 무엇을 눌러도 안 열린다.
 * - "데이터시트 `role=null`" — 패널은 `role="group"` + `aria-label` 을 갖고 있다.
 *   측정이 **포지셔너 래퍼**를 잡은 것이다(`design.md` 가 명시한 함정: "잰 원소를
 *   틀리면 결론이 통째로 뒤집힌다").
 *
 * 그래서 이 층은 **신뢰 이벤트를 보내는 도구**로만 판정한다. Playwright 의
 * `keyboard.press` 는 CDP 를 통해 진짜 키 이벤트를 보내므로 네이티브 버튼 활성화·
 * 포커스 이동·단축키가 실제로 동작한다.
 *
 * 지키는 것은 셋이다 — 목록을 늘릴 때도 "합성으로는 못 재는 것" 만 넣는다.
 */

test.use({ viewport: { width: 1512, height: 950 } });

async function openTopology(page: import("@playwright/test").Page) {
  // `?guides=off` — 첫 방문 안내가 스크림으로 키보드 경로를 가로챈다.
  await page.goto("/ko/topology/?guides=off");
  await expect(page.getByTestId("topology-index-panel")).toBeVisible();
  const dismiss = page.getByTestId("first-run-starter-dismiss");
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  await expect(page.getByTestId("topology-index-row").first()).toBeVisible();
}

/**
 * INDEX 트리 행으로 연다 — 허브 레일이 아니라.
 *
 * 허브 레일은 `suppressed={!leftPanelCollapsed && !drawerOpen}` 이라 INDEX 가
 * 펼쳐진 기본 상태에서 아예 없다. 그걸 모르고 `role="option"` 을 찾으면 스펙이
 * **조용히 전부 skip** 된다(초안이 그랬다). INDEX 행은 어느 상태에서나 있으므로
 * 키보드 경로의 안정적인 입구다.
 */
async function openDatasheetByKeyboard(page: import("@playwright/test").Page) {
  const row = page.getByTestId("topology-index-row").nth(1);
  await row.focus();
  // Enter 는 네이티브 활성화 — 합성 KeyboardEvent 로는 재현되지 않는 지점이다.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({
    timeout: 5000,
  });
}

test.describe("키보드 경로 (신뢰 이벤트)", () => {
  test("INDEX 행에서 Enter 로 데이터시트를 연다", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);
  });

  test("데이터시트는 이름을 가진 그룹이다 (스크린리더가 등장을 안다)", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);

    // **포지셔너가 아니라 그 안의 패널**을 본다 — 배치용 래퍼에 role 이 없는 것은
    // 정상이고, 그걸 재면 "무음" 이라는 잘못된 결론이 나온다(카운슬 실패 사례).
    const named = page
      .getByTestId("topology-node-popover-positioner")
      .locator('[role="group"][aria-label]');
    await expect(named.first()).toBeVisible();
    const label = await named.first().getAttribute("aria-label");
    expect(label?.trim()).toBeTruthy();
  });

  test("Escape 는 연 표면을 닫는다", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);

    await page.keyboard.press("Escape");
    // 퇴장 전이(EXIT_WINDOW) 뒤 언마운트 — 넉넉히 기다린다.
    await expect(page.getByTestId("topology-node-popover-positioner")).toHaveCount(0, {
      timeout: 5000,
    });
  });
});

/**
 * **포커스는 `<body>` 로 떨어지지 않는다.**
 *
 * 2026-07-29 키보드 실측이 잡은 두 자리. 둘 다 "닫으면 body 로 간다" 는 같은
 * 증상인데 원인이 반대편에 있었다.
 *
 * - **공방 소켓 피커**: 전역 Escape 핸들러가 `setOpenRelation(null)` 을 직접
 *   불러 포커스 반환 코드를 건너뛰었다. 그 위 주석은 "포커스는 소켓 트리거에
 *   남는다" 고 약속하고 있었다. 타이핑하던 검색어까지 함께 사라져 손실이 두
 *   겹이다.
 * - **단축키 시트**: 여는 버튼이 시트가 켜지는 순간 언마운트돼서, 트랩이
 *   포커스를 캡처할 때 이미 `document.activeElement === body` 였다.
 *   `body.isConnected` 는 언제나 참이라 복원 분기는 성공한 것처럼 보이면서
 *   **포커스를 body 에 다시 꽂았다.** 겉보기 증상과 원인이 반대편에 있어서,
 *   닫는 쪽만 고치는 시도는 전부 빗나갔다.
 *
 * 되돌아갈 곳이 사라졌으면 **본문 시작**(`<main>`)으로 보낸다 — 페이지 처음부터
 * 다시 걷는 것보다 낫다. 살아남은 트리거가 있으면 그쪽이 언제나 이긴다.
 */
test.describe("포커스 반환", () => {
  test("공방 피커를 Escape 로 닫으면 연 소켓으로 돌아온다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ko/ontology/studio/?node=${STOREFRONT_STUDIO_NODE_PARAM}&guides=off`, {
      waitUntil: "domcontentloaded",
    });

    const socket = page.getByTestId("studio-socket-up");
    await expect(socket).toBeVisible({ timeout: 30_000 });
    await socket.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("studio-picker")).toBeVisible();
    await page.keyboard.type("결제");
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
      .toBe("studio-socket-up");
  });

  test("단축키 시트를 닫으면 body 가 아니라 본문으로 간다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

    const opener = page.getByTestId("topology-shortcuts-help-button");
    await expect(opener).toBeVisible({ timeout: 30_000 });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shortcut-sheet-close")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .not.toBe("BODY");
  });

  /**
   * **살아남는 트리거는 여전히 이긴다** — fallback 이 정상 복원을 덮어쓰면
   * 고친 게 아니라 바꾼 것이다.
   */
  test("살아남은 트리거에서 열면 그 트리거로 정확히 돌아온다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

    const survivor = page.getByTestId("topology-auto-arrange");
    await expect(survivor).toBeVisible({ timeout: 30_000 });
    await survivor.focus();
    await page.keyboard.press("?");
    await expect(page.getByTestId("shortcut-sheet-close")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
      .toBe("topology-auto-arrange");
  });
});
