import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 로컬 작업 폴더 진입 정책 회귀 차단.
 *
 * [2026-07 재작성] PR #435 (P1b/N1) 가 정책을 뒤집었다: 게이트는 런타임
 * (웹/데스크톱)이 아니라 **능력(FSA 지원)** 만 본다. FSA 를 지원하는
 * 브라우저(Chromium 포함) 웹 세션은 로컬 vault 를 직접 열 수 있고,
 * `?intent=local` 은 로컬 워크스페이스 피커를 연다. 구 계약("hosted 는
 * read-only + macOS 다운로드 안내")을 단언하던 이전 스펙은 #435 에서
 * 함께 스윕됐어야 할 썩은 스펙이었다.
 *
 * 실행: 별도 dev server (`next dev -p 3100`) 가 떠 있어야 함.
 *   pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts
 */

const PRESET_LOCAL_SOURCE = `
  try { window.localStorage.setItem('demo:docs-vault:source', 'local'); }
  catch (_) { /* private mode */ }
`;

test.describe("local workspace capability gate (N1)", () => {
  // 이 스펙은 **돌아온 사용자**의 문서함 크롬을 검증한다 — 첫 방문 안내
  // 오버레이가 떠 있으면 스크림이 클릭을 삼킨다(안내 자체는 전용 스펙이 본다).
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
  });

  test("browser local intent opens the local workspace picker", async ({ page }) => {
    await page.addInitScript(PRESET_LOCAL_SOURCE);

    await page.goto("/en/docs/?intent=local");

    // FSA 지원 브라우저: Local 소스가 활성 + 선택되고 피커 표면이 뜬다.
    await expect(page.getByRole("radio", { name: "Local" })).toBeEnabled();
    await expect(page.getByRole("radio", { name: "Local" })).toBeChecked();
    await expect(
      page.getByRole("heading", { name: /Open or create a local workspace/ }),
    ).toBeVisible();
    // 구 read-only 게이트 카피는 부활 금지.
    await expect(
      page.getByText(/Editing a local ontology workspace now starts in the installed macOS app/),
    ).toHaveCount(0);
  });

  test("sample source keeps the document tree browsable", async ({ page }) => {
    await page.goto("/en/docs/");

    await expect(page.getByRole("radio", { name: "Sample" })).toBeChecked();
    await expect(page.getByRole("banner").getByText(/documents/)).toBeVisible();
    // docs-chrome-round 슬라이스 A 계약: 데스크톱(lg+)에서 문서 목록은 기본
    // 펼침, 헤더 PanelLeft 타일로 0px 접기/펼치기 왕복 (localStorage persist).
    await expect(page.getByRole("navigation", { name: "Document list" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse document list" }).click();
    await expect(page.getByRole("navigation", { name: "Document list" })).toBeHidden();
    await page.getByRole("button", { name: "Expand document list" }).click();
    const documentList = page.getByRole("navigation", { name: "Document list" });
    await expect(documentList).toBeVisible();
    // 2026-07-26 — 기본 샘플이 dogfood → 예시 비즈니스로 바뀌면서 여기 박혀
    // 있던 dogfood 전용 문서명(`Agent Graph Workflow`)이 더는 기본 화면에
    // 없다. 이 테스트의 계약은 "특정 문서가 있다" 가 아니라 "접기/펼치기 뒤에도
    // 목록이 탐색 가능하다" 였으므로, 어느 샘플이든 성립하는 형태로 고친다.
    await expect(documentList.getByRole("button").first()).toBeVisible();
    expect(await documentList.getByRole("button").count()).toBeGreaterThan(0);
  });
});
