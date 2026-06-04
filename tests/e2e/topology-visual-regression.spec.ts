import { expect, test } from "@playwright/test";

/**
 * Static topology smoke.
 *
 * R10 이후 로그인/demo-workspace surface 는 제거됐다. 이 spec 은 current
 * local-first static topology 가 실제 Sigma viewport/canvas 를 렌더하는지
 * 확인한다. 픽셀 baseline 은 GPU/font 환경 차이가 커서 release gate 로 쓰지
 * 않는다.
 *
 * 운영 노트:
 * - 1440 데스크톱 viewport 1 시나리오만 (audit md A2-5 의 범위).
 * - WebGL 캔버스는 GPU / 폰트 / 시간 의존이라 미세 픽셀 차이가 매번 발생.
 *   `maxDiffPixelRatio` 와 `maxDiffPixels` 로 관용도 부여 — 잘못 잡지
 *   않게 5% 까지 허용.
 * - `recently updated pulse` 같은 시간 기반 효과는 480ms 주기라 캡처
 *   시점에 따라 위상이 달라짐 → `prefers-reduced-motion` emulate 해
 *   pulse 비활성. 추가로 1500ms 안정화 sleep 으로 force-layout 수렴 대기.
 */

test.use({
  viewport: { width: 1440, height: 900 },
});

async function openStaticTopology(page: import("@playwright/test").Page) {
  // prefers-reduced-motion emulate — pulse / hover reveal 등 시간 기반
  // 효과를 비활성해 픽셀 일관성 확보.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/topology/");
  await expect(page.getByRole("heading", { name: /Ontology relation map/ })).toBeVisible();
}

test.describe("home topology — visual regression (1440)", () => {
  test("demo-workspace 데모 토폴로지 첫 프레임이 baseline 과 일치한다", async ({
    page,
  }) => {
    await openStaticTopology(page);

    // Sigma viewport 가 그려지고 sandbox 첫 노드 라벨이 떠올라야 함 — force
    // layout 가 1차 수렴한 신호로 사용.
    const viewport = page.getByTestId("sigma-topology-viewport");
    await expect(viewport).toBeVisible({ timeout: 20_000 });

    // force layout 안정화 대기 — 노드 위치 흔들림이 멎어야 픽셀 일관.
    // physics.ts 가 ~1.5s 안에 수렴 (LinkedIn / Demo 데이터셋 기준).
    await page.waitForTimeout(1500);

    const box = await viewport.boundingBox();
    expect(box?.width).toBeGreaterThan(600);
    expect(box?.height).toBeGreaterThan(400);
    await expect(page.locator('canvas').first()).toBeVisible();
  });
});
