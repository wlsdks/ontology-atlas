import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_ID } from "@/shared/config/demo-space";

async function loginAsDemo(page: import("@playwright/test").Page) {
  await page.goto("/login/");
  await page.getByRole("button", { name: "데모 로그인" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/\\?account=${DEMO_ACCOUNT_ID}$`));
  await expect(page.getByText("데모 사용자")).toBeVisible({ timeout: 15000 });
}

test.describe("stress topology flows", () => {
  test("고밀도 내부 데이터 계정도 공개 홈 상세 씬을 바로 연다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/?account=stress-lab&p=stress-core-01");
    await expect(
      page.getByRole("dialog", { name: "스트레스 코어 01 상세 정보" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("project-knowledge-topology-scene-canvas")).toBeVisible();
    await expect(page.getByText("항목 2652개")).toBeVisible();
  });

  test("대형 프로젝트 허브에서도 프로젝트 선택 화면이 즉시 보인다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/projects/?account=stress-lab");

    await expect(page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("스트레스 코어 01")).toBeVisible();

    const projectLinks = page.getByRole("link", { name: "프로젝트 보기" });
    await expect(projectLinks).toHaveCount(10);
  });

  test("대형 문서 계정에서도 공개 상세와 홈 드로어가 열린다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/projects/?account=stress-lab");
    await page
      .locator("article")
      .filter({ hasText: "스트레스 코어 01" })
      .getByRole("link", { name: "프로젝트 보기" })
      .click();

    await expect(page.getByRole("heading", { name: "스트레스 코어 01" })).toBeVisible({
      timeout: 20000,
    });
    await page.getByTestId("project-detail-topology-link").click();
    await expect(page).toHaveURL(/\/\?p=stress-core-01&account=stress-lab$/);
    await expect(page.getByTestId("project-knowledge-topology-scene-canvas")).toBeVisible();
    await expect(page.getByText("문서 240개", { exact: true })).toBeVisible();
    await expect(page.getByText(/항목 [1-9]\d{3}개/, { exact: false })).toBeVisible();

    await page.goto("/?account=stress-lab&p=stress-core-01");
    await expect(page.getByRole("dialog", { name: "스트레스 코어 01 상세 정보" })).toBeVisible();
    await expect(page.getByTestId("project-knowledge-topology-scene-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "네비게이터 열기" })).toBeVisible();
    await page.getByRole("button", { name: "네비게이터 열기" }).click();
    await expect(page.getByRole("region", { name: "영역 네비게이터" })).toBeVisible();
  });
});
