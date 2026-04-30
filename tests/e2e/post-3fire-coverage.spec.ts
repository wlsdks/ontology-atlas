import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_ID } from "@/shared/config/demo-space";

/**
 * 3-fire 로드맵 (Fire 5b / Fire 4-d / Fire 6) + 후속 audit batch (PR #205~#215)
 * 이 14 PR 누적 변경의 핵심 동선이 운영 환경에서 회귀 0 인지 자동 검증.
 *
 * 검증 대상 (수동 점검 대신):
 * - Fire 5b: TooltipProvider 전역 + Tooltip Trigger DOM 마운트 (data-state)
 * - Fire 4-d: DocsVaultPage 의 sidebar / outline panel 컴포넌트 분리 후 정상 마운트
 * - Fire 6: ProjectForm RHF 도입 + form 마운트 회귀 0
 * - audit batch: 라벨 '정리' / focus-visible / aria-current / FrontmatterOnboarding
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 (로컬 dev) 가정.
 */

async function loginAsDemo(page: import("@playwright/test").Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login/");
  await page.getByRole("button", { name: "데모 로그인" }).first().click();
  await expect(page).toHaveURL(
    new RegExp(`account=${DEMO_ACCOUNT_ID}`),
    { timeout: 20_000 },
  );
}

test.describe("Fire 5b — Tooltip 전역 마운트 + Trigger 회귀", () => {
  test("/docs/ 진입 시 Radix Tooltip Trigger 가 DOM 에 마운트", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/docs/");
    // 검색 / 고급 / 편집 / 링크복사 / 인쇄 / 삭제 / 새 프로젝트 등이 Tooltip wrap.
    // Radix Trigger 는 data-state 속성을 가짐 (closed / delayed-open / instant-open).
    const triggerCount = await page.locator('[data-state="closed"]').count();
    expect(triggerCount).toBeGreaterThan(0);
  });

  test("title HTML 속성 — 마이그레이션된 button 사이트에서 제거됨", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/docs/");
    // '고급 메뉴 열기' button 은 Fire 5b 에서 Tooltip wrap 후 title 제거.
    const settingsBtn = page.locator('button[aria-label="고급 메뉴 열기"]');
    await expect(settingsBtn).toBeVisible({ timeout: 10_000 });
    const title = await settingsBtn.getAttribute("title");
    expect(title).toBeNull();
  });
});

test.describe("Fire 4-d — DocsVaultPage 분리 후 핵심 영역 마운트", () => {
  test("/docs/ — sidebar tree (DocsSidebarBody) 마운트", async ({ page }) => {
    await loginAsDemo(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/docs/");
    // sidebar tree (DocsVaultTree) — `<nav aria-label="문서 트리">` 마운트.
    // Fire 4-d-2 의 DocsSidebarBody 안에 wrap 됨.
    const tree = page.locator('nav[aria-label="문서 트리"]');
    await expect(tree.first()).toBeVisible({ timeout: 15_000 });
  });

  test("/docs/?slug=ARCHITECTURE — outline panel '공유 · 출력' details 마운트 (DocsVaultDocOutlinePanel)", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/docs/?slug=ARCHITECTURE");
    // Fire 4-d-3 의 outline panel 이 desktop 우측에 마운트 — '공유 · 출력' details
    // summary 텍스트로 검증.
    await expect(
      page.getByText("공유 · 출력").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Fire 6 — ProjectForm RHF 도입 후 form 마운트 회귀", () => {
  test("/project/new/ — slug input + name input 마운트", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/project/new/");
    const slugInput = page.locator(
      'input[data-testid="project-input-slug"]',
    );
    const nameInput = page.locator(
      'input[data-testid="project-input-name"]',
    );
    await expect(slugInput).toBeVisible({ timeout: 15_000 });
    await expect(nameInput).toBeVisible();
  });

  test("/project/new/ — 이름 입력 시 slug 자동완성 (RHF setValue 동기화 확인)", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/project/new/");
    const slugInput = page.locator(
      'input[data-testid="project-input-slug"]',
    );
    const nameInput = page.locator(
      'input[data-testid="project-input-name"]',
    );
    await expect(slugInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill("Demo Project Test");
    // syncSlugFromName 이 setValue + rhfSetValue 두 호출 — 외부 useState 가
    // source of truth 라 input 값에 반영.
    await expect(slugInput).toHaveValue("demo-project-test", {
      timeout: 5_000,
    });
  });
});

test.describe("audit batch — 라벨 / focus / FrontmatterOnboarding", () => {
  test("OperationsNav 라벨 '정리' 노출 (이전 '카테고리' 변경)", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/knowledge/");
    // '정리' 라벨이 a[role=link] / a 안에 있어야 (audit A1 fix).
    await expect(
      page.getByRole("link", { name: "정리" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("OperationsNav 활성 항목 aria-current=page (audit A6, role=tab 제거)", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/knowledge/");
    // '문서' 가 활성 — aria-current='page'
    const activeLinks = page.locator('a[aria-current="page"]');
    await expect(activeLinks.first()).toBeVisible({ timeout: 15_000 });
  });

  test("BottomTabBar focus-visible:ring 클래스 — audit A7", async ({ page }) => {
    await loginAsDemo(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/knowledge/");
    // Bottom 탭바 link 의 className 검증 — focus-visible:ring 포함.
    const tabbar = page.locator('nav[aria-label="주요 메뉴"]');
    await expect(tabbar).toBeVisible({ timeout: 15_000 });
    const firstLink = tabbar.locator("a").first();
    const cls = (await firstLink.getAttribute("class")) ?? "";
    expect(cls).toContain("focus-visible:ring");
  });

  test("FrontmatterOnboarding widget — /knowledge/documents/new/ 우측 마운트", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/knowledge/documents/new/");
    // complementary aria-label='frontmatter 가이드' 가 마운트.
    const onboarding = page.locator(
      '[aria-label="frontmatter 가이드"]',
    );
    await expect(onboarding).toBeVisible({ timeout: 15_000 });
    // 등급 chip 3개 (A strict / B lenient / C freeform).
    const chips = onboarding.locator('button[aria-pressed]');
    expect(await chips.count()).toBe(3);
  });

  test("ProjectKnowledgeTopology / OperationsNav 의 '프로젝트 →' (↗ 아님)", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/knowledge/");
    // '프로젝트' 외부 링크 button 의 텍스트 — '↗' 가 아닌 '→'.
    const projectButton = page.getByRole("button", { name: /프로젝트/ });
    if ((await projectButton.count()) > 0) {
      const text = await projectButton.first().textContent();
      expect(text).not.toContain("↗");
      expect(text).toContain("→");
    }
  });
});

test.describe("⌘K vs ⇧⌘K 검색 분리 (Fire 2)", () => {
  test("홈 / 진입 + ⇧⌘K — GlobalSearch ontology filter row 마운트", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/");
    // SearchPalette / sigma 가 mount 될 시간 (캔버스 init 대기).
    await page.waitForTimeout(1500);
    await page.keyboard.press("Meta+Shift+k");
    // chip filter row 'ontology 필터' 마운트 — 가장 신뢰성 있는 selector.
    await expect(
      page.locator('[aria-label="ontology 필터"]'),
    ).toBeVisible({ timeout: 10_000 });
  });
});
