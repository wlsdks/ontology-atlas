import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_ID } from "@/shared/config/demo-space";

/**
 * 홈 토폴로지 시각 회귀 (A2-5).
 *
 * `tests/e2e/` 의 첫 시각 회귀 spec — Sigma WebGL 캔버스의 첫 프레임이
 * 안정화된 후 viewport 스크린샷을 기준 baseline 과 비교.
 *
 * 운영 노트:
 * - 1440 데스크톱 viewport 1 시나리오만 (audit md A2-5 의 범위).
 * - WebGL 캔버스는 GPU / 폰트 / 시간 의존이라 미세 픽셀 차이가 매번 발생.
 *   `maxDiffPixelRatio` 와 `maxDiffPixels` 로 관용도 부여 — 잘못 잡지
 *   않게 5% 까지 허용.
 * - `recently updated pulse` 같은 시간 기반 효과는 480ms 주기라 캡처
 *   시점에 따라 위상이 달라짐 → `prefers-reduced-motion` emulate 해
 *   pulse 비활성. 추가로 1500ms 안정화 sleep 으로 force-layout 수렴 대기.
 * - 동적 텍스트 (계정 아바타 / 시각 / 카운트) 영역은 `mask` 로 제외해
 *   숫자가 다르다고 회귀로 잡지 않게.
 *
 * 첫 baseline 생성 (1 회, 진안 운영 환경):
 *   1. dev server 또는 운영 도메인 가리키기:
 *        export PLAYWRIGHT_BASE_URL=https://aslan-project-map.web.app
 *        # 또는 로컬 demo:  pnpm dev (포트 3000) + PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
 *   2. 데모 세션 (sandbox-lab) 가능한지 확인 — 운영 도메인 hit 시
 *      `데모 로그인` 버튼 클릭 가능해야 함.
 *   3. baseline 생성:
 *        pnpm exec playwright test \
 *          tests/e2e/topology-visual-regression.spec.ts \
 *          --update-snapshots
 *   4. `tests/e2e/topology-visual-regression.spec.ts-snapshots/` 디렉토리
 *      안에 `home-topology-1440-*.png` 가 생성됨.
 *   5. git add tests/e2e/*-snapshots/ && git commit (binary 도 commit OK).
 *
 * 이후 회귀 시 (CI / 자율 루프):
 *   pnpm exec playwright test tests/e2e/topology-visual-regression.spec.ts
 *
 * 환경 차이 (GPU / 폰트 hint) 로 baseline 이 사용자 머신과 다를 수 있다.
 * 진안 운영 환경에서 1 회 baseline 박은 후, CI 가 그 baseline 으로 검증
 * 하는 패턴 권장.
 */

test.use({
  viewport: { width: 1440, height: 900 },
});

async function loginAsDemo(page: import("@playwright/test").Page) {
  // prefers-reduced-motion emulate — pulse / hover reveal 등 시간 기반
  // 효과를 비활성해 픽셀 일관성 확보.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login/");
  await page.getByRole("button", { name: "데모 로그인" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/\\?account=${DEMO_ACCOUNT_ID}$`),
  );
}

test.describe("home topology — visual regression (1440)", () => {
  test("sandbox-lab 데모 토폴로지 첫 프레임이 baseline 과 일치한다", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/?account=sandbox-lab");

    // Sigma viewport 가 그려지고 sandbox 첫 노드 라벨이 떠올라야 함 — force
    // layout 가 1차 수렴한 신호로 사용.
    const viewport = page.getByTestId("sigma-topology-viewport");
    await expect(viewport).toBeVisible({ timeout: 20_000 });

    // force layout 안정화 대기 — 노드 위치 흔들림이 멎어야 픽셀 일관.
    // physics.ts 가 ~1.5s 안에 수렴 (LinkedIn / Aslan 데이터셋 기준).
    await page.waitForTimeout(1500);

    // 1 차 baseline 비교. 첫 실행은 `--update-snapshots` 로 baseline 생성
    // 필요. 동적 영역 (계정 메뉴 / minimap 카운트) 은 mask.
    await expect(viewport).toHaveScreenshot("home-topology-1440.png", {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
      mask: [
        page.locator('button[aria-label="내 정보 보기"]').first(),
        page.getByTestId("sigma-minimap"),
      ],
    });
  });
});
