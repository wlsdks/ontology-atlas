import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { useDogfoodSample } from "./sample-source";

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
 * ⚠️ **[2026-08-08] 소스 표시는 헤더 라디오가 아니라 볼트 칩 메뉴 안에 있다.**
 * PR #987 이 헤더 우측의 「샘플|로컬」 라디오 쌍을 걷어내고 그 판정을 볼트 칩
 * 메뉴로 옮겼다. 이 스펙은 그 라디오를 클릭하고 있어서 두 시험이 2분 타임아웃으로
 * 죽었고 — `docs-deeplink.spec.ts` 와 **같은 원인의 두 번째 피해자**였다.
 * 소스 상태를 읽을 때는 아래 `expectSourceIs*` 를 쓴다.
 *
 * 실행: 별도 dev server (`next dev -p 3100`) 가 떠 있어야 함.
 *   pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts
 */

/**
 * 볼트 칩 메뉴를 열어 어느 소스가 선택돼 있는지 읽고 닫는다.
 *
 * 메뉴 항목은 `menuitemradio` 라서 선택 상태가 `aria-checked` 로 나온다 —
 * 라벨 텍스트가 아니라 그 속성을 본다(로케일이 바뀌어도 계약은 그대로다).
 */
async function expectSourceIs(page: import("@playwright/test").Page, which: "sample" | "local") {
  await page.getByTestId("vault-chip-menu-trigger").click();
  const picked = page.getByTestId(`vault-chip-use-${which}`);
  await expect(picked).toBeVisible({ timeout: 10_000 });
  await expect(picked).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  /*
   * 퇴장을 **기다린다**. Surface 는 나가는 동안 `inert` 로 DOM 에 남아 있고
   * (`use-presence.ts` 의 EXIT_WINDOW_MS), Playwright 의 텍스트 셀렉터는 inert
   * 요소도 여전히 찾아낸다 — 실제로 그 때문에 바로 다음 단언이 strict mode 충돌로
   * 죽었다(메뉴 안 「Built-in sample (this tool's own documents)」이 두 번째로
   * 잡혔다). 닫힘을 기다리지 않으면 이 헬퍼가 뒤따르는 단언을 오염시킨다.
   */
  await expect(picked).toBeHidden();
}

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

    // FSA 지원 브라우저: Local 소스가 선택되고 피커 표면이 뜬다.
    await expectSourceIs(page, "local");
    await expect(
      page.getByRole("heading", { name: /Open or create a local workspace/ }),
    ).toBeVisible();
    // 구 read-only 게이트 카피는 부활 금지.
    await expect(
      page.getByText(/Editing a local ontology workspace now starts in the installed macOS app/),
    ).toHaveCount(0);
  });

  test("sample source keeps the document tree browsable", async ({ page }) => {
    // 이 spec 은 dogfood 데이터에서 돈다 — 기본값에 기대지 않고 명시 선택한다.
    await useDogfoodSample(page);
    await page.goto("/en/docs/");

    await expectSourceIs(page, "sample");
    // 문서 수는 #987 이후 볼트 칩이 갖는다 — 배너 전체를 훑으면 메뉴 문구까지
    // 걸리므로, 그 사실이 실제로 사는 자리에서 잰다.
    await expect(page.getByTestId("vault-chip-menu-trigger")).toHaveText(
      /\d+ documents/,
    );
    // docs-chrome-round 슬라이스 A 계약: 데스크톱(lg+)에서 문서 목록은 기본
    // 펼침, 헤더 PanelLeft 타일로 0px 접기/펼치기 왕복 (localStorage persist).
    await expect(page.getByRole("navigation", { name: "Document list" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse document list" }).click();
    await expect(page.getByRole("navigation", { name: "Document list" })).toBeHidden();
    await page.getByRole("button", { name: "Expand document list" }).click();
    const documentList = page.getByRole("navigation", { name: "Document list" });
    await expect(documentList).toBeVisible();
    await expect(documentList.getByRole("button", { name: "Agent Graph Workflow" })).toBeVisible();
  });
});
