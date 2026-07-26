import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { useDogfoodSample } from "./sample-source";

/**
 * `topology-map-v2` canvas engine smoke — current-surface replacement for
 * the Sigma-era specs deleted in the 2026-07 e2e decontamination pass
 * (topology-overlap / topology-drag / topology-analysis-workflow /
 * topology-visual-regression / topology-loading, all targeting the retired
 * WebGL renderer and its `sigma-*` testids).
 *
 * Small and stable on purpose — a handful of contracts that are true of the
 * *current* map today, not an exhaustive interaction suite. Uses real
 * dogfood vault slugs (`docs/ontology/`) rather than fixtures.
 */

const REAL_CAPABILITY_SLUG = "capability:topology-analysis-modes";

// `next dev` can transiently double-render a page's client tree under load
// (streaming/hydration artifact — not present in a production static
// export). It doesn't show up running one spec alone, only when the whole
// suite runs back-to-back and the dev server is under sustained pressure.
// Letting the network settle before querying a testid gives the duplicate
// time to collapse to one before a Playwright strict-mode locator can trip
// on it — same fix applied to the analogous `project-selector-new-cta`
// duplicate in `ontology-ui.spec.ts`.
async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  // 온보딩 자동 표면 억제 (2026-07-24 CI flake 정정) — /topology 는 샘플
  // 모드 첫 방문에 폴더 안내 시트 + 900ms 자동 투어를 띄운다. 자동 투어의
  // full-screen 스크림(z-70)이 느린 CI 러너에서 패널 액션 버튼을 덮어
  // 클릭이 타임아웃났다(topology 스모크는 온보딩이 아니라 지도만 검증).
  // 시드로 자동 표면을 끈다 — 수동 진입은 영향 없다.
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("topology-map-v2 smoke", () => {
  // 이 파일의 단언은 전부 dogfood 볼트 데이터(프로젝트 이름 · 딥링크 슬러그 ·
  // 노드 라벨)에 기댄다. 2026-07-26 기본 샘플이 예시 비즈니스로 바뀌었으니
  // 기본값에 기대지 않고 파일 단위로 명시 선택한다.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  test("renders the canvas engine with a non-zero surface", async ({ page }) => {
    await gotoAndSettle(page, "/ko/topology/");
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test("a valid ?p= deep link keeps the URL and opens the datasheet", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("p")).toBe(REAL_CAPABILITY_SLUG);
  });

  test("a missing bare slug shows a visible not-found toast", async ({ page }) => {
    await gotoAndSettle(page, "/en/topology/?p=missing-xyz");
    await expect(page.getByText("Node not found: missing-xyz")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Escape deselects the focused node", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    // Retry the keypress rather than a single press-then-assert: right after
    // a fresh navigation, `next dev`'s React StrictMode double-invokes the
    // window keydown effect (mount → unmount → mount), so the very first
    // Escape can land on a listener mid-resubscription and no-op (confirmed
    // live — 1st Escape leaves the panel, 2nd closes it + drops `?p=`).
    // Production static export has no StrictMode double-invoke, so a real
    // user's single Escape works.
    //
    // The inner assertion MUST use a short timeout: `toHaveCount` defaults to
    // the global 15s expect timeout, which would swallow the entire `toPass`
    // budget on the first no-op press so the retry never fires a 2nd press.
    // A 1s inner window lets `toPass` loop back and press again.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(detailPanel).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    // M-7 Esc 사다리 (UX 라운드 S3): 첫 유효 Esc 는 팝오버/패널만 닫고
    // ego 포커스(`?p=`)는 유지 — one step at a time. 포커스 해제는 다음 Esc.
    expect(new URL(page.url()).searchParams.get("p")).toBe(REAL_CAPABILITY_SLUG);
    await expect(async () => {
      await page.keyboard.press("Escape");
      expect(new URL(page.url()).searchParams.get("p")).toBeNull();
    }).toPass({ timeout: 15_000 });
  });

  test("opening the doc and going back keeps the map selection", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    const documentAction = detailPanel.getByTestId("topology-v2-detail-panel-action-document");
    await expect(documentAction).toBeVisible();
    await expect(documentAction).not.toHaveAttribute("aria-disabled", "true");
    await documentAction.click();
    await expect(page).toHaveURL(/\/en\/docs\//, { timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`p=${REAL_CAPABILITY_SLUG.replace(":", "%3A")}`));
    await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible({ timeout: 15_000 });
  });
});
