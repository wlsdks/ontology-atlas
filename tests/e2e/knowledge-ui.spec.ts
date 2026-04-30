import { expect, test } from "@playwright/test";

test.describe("knowledge admin UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/login/?account=sandbox-lab");
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();
  });

  test("문서 목록은 문서 상태와 접이식 필터를 제공한다", async ({ page }) => {
    await page.goto("/knowledge/documents/?account=sandbox-lab");

    await expect(page.getByRole("heading", { name: "문서 목록" })).toBeVisible();
    await expect(page.getByText("문서 상태", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("확인 필요", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "필터 열기" })).toBeVisible();

    await page.getByRole("button", { name: "필터 열기" }).click();
    await expect(page.getByLabel("프로젝트")).toBeVisible();
    await expect(page.getByLabel("검색")).toBeVisible();
  });

  test("새 문서 등록 화면은 템플릿과 온톨로지 안내를 제공한다", async ({ page }) => {
    await page.goto("/knowledge/documents/new/?account=sandbox-lab");

    await expect(page.getByRole("heading", { name: "새 문서 등록" })).toBeVisible();
    await expect(page.getByText("명세서 템플릿", { exact: true })).toBeVisible();
    await expect(page.getByText("결정 기록 템플릿", { exact: true })).toBeVisible();
    await expect(page.getByText("등록 전에 볼 것")).toBeVisible();
    await expect(page.getByText("입력 규칙 보기")).toBeVisible();
  });

  test("문서 상세는 작업 패널을 전환할 수 있다", async ({ page }) => {
    await page.goto("/knowledge/documents/view/?id=auth-workflow&account=sandbox-lab");

    await expect(page.getByRole("heading", { name: "샌드박스 인증 워크플로 문서" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "개요와 버전" })).toBeVisible();
    await page.getByText("연결 작업 열기").click();
    await expect(page.getByRole("link", { name: "프로젝트 공개 화면" })).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 수정" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^문서 확인$/ })).toBeVisible();

    await page.getByRole("tab", { name: "분석 결과" }).click();
    await expect(page.getByRole("heading", { name: "분석 상태" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "분석 결과와 근거" })).toBeVisible();
    await page.getByText("후보와 근거 펼치기").click();
    await expect(page.getByText("연결 후보", { exact: true })).toBeVisible();
    await expect(page.getByText("항목 후보", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "문서 확인으로 가기" })).toBeVisible();
  });

  test("문서 확인에서 골라내기와 공개 화면에 보이기를 진행할 수 있다", async ({ page }) => {
    await page.goto("/review/knowledge/?id=auth-workflow&account=sandbox-lab");

    await expect(page.getByRole("heading", { name: "문서 확인" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "지금 볼 문서", exact: true })).toBeVisible();
    await page.getByText("다른 화면 열기").click();
    await expect(page.getByRole("link", { name: "프로젝트 공개 화면" })).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 수정" })).toBeVisible();
    await expect(page.getByText("항목 후보", { exact: true })).toBeVisible();
    await expect(page.getByText("후보 연결", { exact: true })).toBeVisible();
    await expect(page.getByText("근거 발췌", { exact: true })).toBeVisible();
  });

  test("문서 확인 골라내기와 공개에 보이기 이후 프로젝트 상세에서 문서 연결을 볼 수 있다", async ({
    page,
  }) => {
    await page.goto("/review/knowledge/?id=auth-workflow&account=sandbox-lab");

    await page.getByRole("button", { name: "고른 결과 저장" }).click();
    await expect(
      page.getByText(/선택한 결과를 승인 그래프에 반영했습니다/),
    ).toBeVisible();

    await page.getByText("다른 작업 열기").click();
    await page.getByRole("button", { name: "공개 화면에 보이기" }).click();
    await expect(page.getByRole("status")).toContainText("공개 화면에 보였어요");

    await page.goto("/projects/?account=sandbox-lab");
    await page
      .locator("article")
      .filter({ hasText: "샌드박스 코어" })
      .getByRole("link", { name: "개요" })
      .click();
    await expect(
      page.getByRole("heading", { name: "샌드박스 코어" }),
    ).toBeVisible({ timeout: 45000 });
    await expect(
      page.getByRole("heading", { name: "토폴로지 미리보기" }),
    ).toBeVisible();
    const internalTopology = page.getByTestId("project-knowledge-topology");
    await expect(page.getByTestId("project-knowledge-topology-viewport")).toBeVisible();
    await expect(internalTopology.getByText(/문서 [1-9]\d*개/, { exact: false })).toBeVisible();
    await expect(internalTopology.getByText(/항목 [1-9]\d*개/, { exact: false })).toBeVisible();
    await expect(internalTopology.getByText(/연결 [1-9]\d*개/, { exact: false })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "프로젝트 설명 문서" }),
    ).toBeVisible();
    const documentInsight = page.locator("#project-detail-insight");
    await expect(documentInsight.getByText("대표 문서", { exact: true })).toBeVisible();
    await expect(
      documentInsight.getByText("샌드박스 인증 워크플로 문서", { exact: true }),
    ).toBeVisible();
  });
});
