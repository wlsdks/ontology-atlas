import { expect, test } from "@playwright/test";

/**
 * /ontology surface smoke (T-6 / T-9 / UX 정정).
 *
 * 데모 데이터에는 ontology 노드가 없으므로 빈 상태 + CTA + nav 진입점 검증.
 */
test.describe("ontology view UI", () => {
  test("desktop: OperationsNav 의 온톨로지 탭으로 진입 가능", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/knowledge/");
    // OperationsNav 의 5번째 탭
    const ontologyTab = page.getByRole("link", { name: "온톨로지", exact: true }).first();
    await expect(ontologyTab).toBeVisible();
    await ontologyTab.click();
    await expect(page).toHaveURL(/\/ontology\/?$/);
  });

  test("desktop: 헤더와 빈 상태 + 검수 큐 CTA 가 노출", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ontology/");

    await expect(page.getByRole("heading", { name: "온톨로지 트리" })).toBeVisible();
    // 통계 카드 4개
    await expect(page.getByText("트리 노드", { exact: true })).toBeVisible();
    await expect(page.getByText("총 관계", { exact: true })).toBeVisible();
    await expect(page.getByText("근거 문서", { exact: true })).toBeVisible();
    // 발행 시점 빈 값일 때 "아직 없음" 표시 (— 가 아님)
    await expect(page.getByText("아직 없음")).toBeVisible();

    // 빈 상태 hint
    await expect(
      page.getByText(/아직 승인된 ontology 노드가 없어요/),
    ).toBeVisible();

    // next-action CTA
    const cta = page.getByRole("link", { name: /검수 큐 열기/ });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/review\/knowledge\/?$/);
  });

  test("mobile: BottomTabBar 의 문서 탭이 /ontology 에서도 active", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ontology/");

    // BottomTabBar 의 "문서" 탭이 aria-current=page
    const navByLabel = page.getByRole("navigation", { name: "주요 메뉴" });
    const documentsTab = navByLabel.getByRole("link", { name: "문서" });
    await expect(documentsTab).toBeVisible();
    await expect(documentsTab).toHaveAttribute("aria-current", "page");
  });

  test("mobile: knowledge hub 의 온톨로지 카드로 발견 가능", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/knowledge/");

    // SummaryCard "온톨로지 — 승인된 그래프 트리"
    await expect(page.getByText("승인된 그래프 트리")).toBeVisible();
    const ontologyCardCta = page.getByRole("link", {
      name: /온톨로지 열기/,
    });
    await expect(ontologyCardCta).toBeVisible();
    await ontologyCardCta.click();
    await expect(page).toHaveURL(/\/ontology\/?(\?|$)/);
  });

  test("desktop: 데이터가 없으면 detail 패널은 노출되지 않음 (빈 상태 회귀 방지)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ontology/");
    // 빈 상태에서는 트리에 row 가 없으므로 클릭할 게 없고, 패널도 처음부터 숨김.
    await expect(page.getByTestId("ontology-node-detail")).toHaveCount(0);
  });

  test("mobile: 본문 mono 텍스트가 한 줄에 깔끔히 (whitespace-nowrap)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ontology/");

    // mono span 이 wrap 되지 않도록 white-space: nowrap 적용 확인
    const monoSpan = page.locator("text=project → domain → capability → element").first();
    await expect(monoSpan).toBeVisible();
    const whiteSpace = await monoSpan.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe("nowrap");
  });
});
