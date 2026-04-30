import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_ID } from "@/shared/config/demo-space";
import { slugify } from "@/shared/lib/slugify";
import { createAccountMemberUser, deleteAccountProject } from "./support/emulator-admin";

async function loginAsDemo(page: import("@playwright/test").Page) {
  await page.goto("/login/");
  await page.getByRole("button", { name: "데모 로그인" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/\\?account=${DEMO_ACCOUNT_ID}$`));
  await expect(page.getByText("데모 사용자")).toBeVisible({ timeout: 15000 });
}

test.describe("public topology flows", () => {
  test("상단 영역 패널은 계정 메뉴와 겹치지 않게 열리고 계정 메뉴를 닫는다", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/?account=sandbox-lab");

    const accountTrigger = page.locator('button[aria-label="내 정보 보기"]').first();
    await accountTrigger.click();
    if ((await accountTrigger.getAttribute("aria-expanded")) !== "true") {
      await accountTrigger.click();
    }
    await expect(accountTrigger).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: "네비게이터 열기" }).click();

    await expect(accountTrigger).toHaveAttribute("aria-expanded", "false");
    const navigator = page.getByRole("region", { name: "영역 네비게이터" });
    await expect(navigator).toBeVisible();

    const triggerBox = await accountTrigger.boundingBox();
    const navigatorBox = await navigator.boundingBox();

    expect(triggerBox).not.toBeNull();
    expect(navigatorBox).not.toBeNull();
    expect(navigatorBox!.y).toBeGreaterThan(triggerBox!.y + triggerBox!.height - 2);
  });

  test("홈 관계도에서 프로젝트 상세로 이동하고 토폴로지를 열 수 있다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/?p=iam");

    await expect(
      page.getByRole("button", { name: /선택한 프로젝트 닫기|좌측 패널 펼치기/ }),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("button", { name: "네비게이터 열기" })).toHaveCount(0);
    const projectDrawer = page.getByTestId("project-drawer");
    await expect(projectDrawer).toBeVisible();
    await expect(projectDrawer.getByRole("heading", { name: "IAM" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "IAM 상세 정보" })).toBeVisible();
    await expect(projectDrawer.getByText("어디와 연결돼 있나")).toBeVisible();

    await projectDrawer.getByRole("link", { name: "프로젝트 보기" }).click();

    await expect(page).toHaveURL(/\/project\/view\/\?slug=iam$/);
    await expect(page.getByRole("heading", { name: "IAM" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "토폴로지 미리보기" })).toBeVisible();

    await page.getByTestId("project-detail-topology-link").click();

    await expect(page).toHaveURL(/\?p=iam$/);
    await expect(page.getByRole("dialog", { name: "IAM 상세 정보" })).toBeVisible();
  });

  test("개별 프로젝트에서 내부 지도 전체 화면으로 이동할 수 있다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/project/view/?slug=stress-core-01&account=stress-lab");

    await expect(page.getByRole("heading", { name: "스트레스 코어 01" })).toBeVisible();
    await page.getByTestId("project-detail-topology-link").click();

    await expect(page).toHaveURL(/\/\?p=stress-core-01&account=stress-lab$/);
    await expect(page.getByTestId("project-knowledge-topology-scene-canvas")).toBeVisible();
    await expect(page.getByText("항목 2652개")).toBeVisible();
  });

  test("전체 토폴로지에서 Sigma 지도와 그래프 컨트롤이 노출된다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/?account=sandbox-lab");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "그래프 컨트롤 열기" })).toBeVisible();
    await page.getByRole("button", { name: "그래프 컨트롤 열기" }).click();
    await expect(page.locator("#sigma-search-input")).toBeVisible();
  });

  test("오래된 프로젝트 토폴로지 경로는 메인 토폴로지로 이동한다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/project/topology/?slug=stress-core-01&account=stress-lab");

    await expect(page).toHaveURL(/\/\?p=stress-core-01&account=stress-lab$/);
    await expect(page.getByTestId("project-knowledge-topology-scene-canvas")).toBeVisible();
    await expect(page.getByText("항목 2652개")).toBeVisible();
  });

  test("프로젝트 검색은 바깥 배경을 누르면 닫힌다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/?account=sandbox-lab");

    await page.getByRole("button", { name: "프로젝트 검색" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByTestId("search-palette-backdrop").click({ position: { x: 12, y: 12 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("비어 있는 공간에서도 전체 지도에서 바로 시작할 수 있다", async ({ page }) => {
    const accountId = `empty-lab-${Date.now()}`;

    await page.goto(`/dev/login/?account=${accountId}`);
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();

    await page.goto(`/?account=${accountId}`);
    await expect(page.getByRole("heading", { name: "아직 이 공간에 프로젝트가 없습니다" })).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 목록 보기" })).toBeVisible();
  });

  test("선택한 프로젝트가 있으면 드로어에서 연결 맥락과 다음 프로젝트를 바로 읽을 수 있다", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/?account=sandbox-lab&p=sandbox-core");

    const projectDrawer = page.getByTestId("project-drawer");
    await expect(projectDrawer).toBeVisible();
    await expect(projectDrawer.getByText("어디와 연결돼 있나")).toBeVisible();
    await expect(projectDrawer.getByText("이어서 볼 프로젝트")).toBeVisible();
  });

  test("계정 기반 상세에서는 프로젝트 목록으로 바로 돌아갈 수 있다", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");

    await expect(page.getByRole("link", { name: "프로젝트 목록" })).toBeVisible();
    await page.getByRole("link", { name: "프로젝트 목록" }).click();

    await expect(page).toHaveURL(/\/projects\/\?account=sandbox-lab$/);
    await expect(page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible();
  });

  test("관리자는 공개 상세에서 바로 편집과 문서 작업으로 이동할 수 있다", async ({ page }) => {
    await page.goto("/dev/login/?account=sandbox-lab");
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/\?account=sandbox-lab$/);

    await page.goto("/?account=sandbox-lab&p=sandbox-core");
    await expect(page.getByLabel("전체 지도 빠른 작업")).toHaveCount(0);
    const projectActions = page.getByRole("region", { name: "프로젝트 관리" });
    await expect(projectActions).toBeVisible();
    await expect(projectActions.getByRole("link", { name: "새 프로젝트" })).toHaveCount(0);
    await expect(projectActions.getByRole("link", { name: "문서 등록" })).toBeVisible();
    await expect(projectActions.getByRole("link", { name: "전체 편집" })).toBeVisible();
    await page.getByLabel("프로젝트 관리 도움말").hover();
    await expect(page.getByRole("tooltip")).toContainText("등록한 문서는 연결 후보와 공개 문서의 시작점이 됩니다.");

    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");
    await expect(page.getByText("개별 프로젝트")).toBeVisible();
    await expect(page.getByTestId("public-quick-edit-toggle")).toBeVisible();
    await page.getByTestId("public-quick-edit-toggle").click();
    await expect(page.getByRole("link", { name: "전체 편집" })).toBeVisible();
    await expect(page.getByRole("link", { name: "문서 등록" })).toBeVisible();
    await expect(page.getByRole("link", { name: "문서 목록" })).toBeVisible();

    await page.getByRole("link", { name: "전체 편집" }).click();
    await expect(page).toHaveURL(/\/admin\/project\/edit\/\?/);
    await expect(page).toHaveURL(/slug=sandbox-core/);
    await expect(page.getByRole("heading", { name: "샌드박스 코어" })).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 상세로" })).toBeVisible();
  });

  test("공개 상세에서 편집으로 들어가 취소하면 원래 보던 공개 화면으로 돌아간다", async ({ page }) => {
    await page.goto("/dev/login/?account=sandbox-lab");
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();

    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");
    await page.getByTestId("public-quick-edit-toggle").click();
    const quickEditDialog = page.getByRole("dialog", { name: "프로젝트 정보 수정" });
    await expect(quickEditDialog).toBeVisible();
    await quickEditDialog.getByRole("link", { name: "전체 편집" }).click();

    await expect(page).toHaveURL(/returnTo=/);
    await page.getByRole("button", { name: "취소" }).first().click();

    await expect(page).toHaveURL(/\/project\/view\/\?slug=sandbox-core&account=sandbox-lab$/);
    await expect(page.getByRole("heading", { name: "샌드박스 코어" })).toBeVisible();
  });

  test("관리자는 프로젝트 편집에서 저장하고 계속 보기를 눌러 같은 화면에서 결과를 확인할 수 있다", async ({
    page,
  }) => {
    await page.goto("/dev/login/?account=sandbox-lab");
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();

    await page.goto("/project/sandbox-core/edit/?account=sandbox-lab");
    await expect(page.getByRole("heading", { name: "샌드박스 코어" })).toBeVisible();

    const description = page.getByTestId("project-input-description");
    await description.fill("샌드박스 코어의 문서 기반 온톨로지를 빠르게 검토하는 허브입니다.");
    await page.getByRole("button", { name: "저장하고 계속 보기" }).first().click();

    await expect(page).toHaveURL(/\/project\/sandbox-core\/edit\/\?account=sandbox-lab$/);
    await expect(page.getByRole("status")).toContainText("변경 사항을 저장했습니다.");
    await expect(page.getByText("왼쪽 입력이 여기와 공개 화면에 바로 반영됩니다.")).toBeVisible();
  });

  test("관리자는 프로젝트 선택 화면에서 바로 운영 화면으로 이동할 수 있다", async ({ page }) => {
    await page.goto("/dev/login/?account=sandbox-lab");
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();

    await page.goto("/projects/?account=sandbox-lab");
    const operationsToggle = page.locator("summary").filter({ hasText: "관리 도구" }).first();
    await expect(operationsToggle).toBeVisible();
    await operationsToggle.click();
    await expect(page.getByRole("link", { name: "프로젝트 보드" })).toBeVisible();
    await expect(page.getByRole("link", { name: "문서 목록" })).toBeVisible();
    await expect(page.getByRole("link", { name: "문서 검토" })).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 보기" }).first()).toBeVisible();
  });

  test("공간 소유자는 공개 상세에서 바로 수정하고 같은 화면에서 결과를 확인할 수 있다", async ({
    page,
  }) => {
    const suffix = Date.now();
    const email = `inline-owner-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `인라인 소유자 ${suffix}`;
    const description = `공개 상세에서 바로 수정한 설명 ${suffix}`;

    await createAccountMemberUser({
      email,
      password,
      displayName,
      accountId: "sandbox-lab",
      role: "owner",
    });

    await page.goto("/login/?account=sandbox-lab");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "이메일로 로그인" }).click();

    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");
    await page.getByTestId("public-quick-edit-toggle").click();
    const quickEditDialog = page.getByRole("dialog", { name: "프로젝트 정보 수정" });
    await expect(quickEditDialog).toBeVisible();
    const originalDescription = await page.getByTestId("project-detail-description").textContent();
    await page.getByTestId("public-quick-edit-description").fill(description);
    await page.getByRole("button", { name: "변경 적용" }).click();

    await expect(page.getByRole("status")).toContainText("바로 반영한 항목: 설명");
    await expect(page.getByTestId("project-detail-description")).toHaveText(description);

    if (originalDescription) {
      await page.getByTestId("public-quick-edit-description").fill(originalDescription);
      await page.getByRole("button", { name: "변경 적용" }).click();
      await expect(page.getByRole("status")).toContainText("바로 반영한 항목: 설명");
      await expect(page.getByTestId("project-detail-description")).toHaveText(originalDescription);
    }
  });

  test("공간 소유자는 프로젝트 목록에서 바로 새 프로젝트를 만들고 첫 문서를 추가할 수 있다", async ({
    page,
  }) => {
    const suffix = Date.now();
    const email = `owner-create-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `생성 소유자 ${suffix}`;
    const projectName = `빠른 생성 프로젝트 ${suffix}`;
    const projectDescription = `프로젝트 목록에서 바로 만든 설명 ${suffix}`;
    const projectSlug = slugify(projectName);

    await createAccountMemberUser({
      email,
      password,
      displayName,
      accountId: "sandbox-lab",
      role: "owner",
    });

    try {
      await page.goto("/login/?account=sandbox-lab");
      await page.getByLabel("이메일").fill(email);
      await page.getByLabel("비밀번호").fill(password);
      await page.getByRole("button", { name: "이메일로 로그인" }).click();

      await expect(page).toHaveURL(/\/projects\/\?account=sandbox-lab$/);
      await page.locator("summary").filter({ hasText: "새 프로젝트" }).click();
      await page.getByRole("button", { name: "빠른 만들기" }).click();
      await page.getByTestId("quick-create-name").fill(projectName);
      await page.getByTestId("quick-create-description").fill(projectDescription);
      await page.getByTestId("quick-create-owner").fill("빠른 생성 담당");
      await page.getByTestId("quick-create-submit").click();

      await expect(page).toHaveURL(/\/admin\/knowledge\/documents\/new\/\?/);
      await expect(page.getByRole("heading", { name: "문서 등록" })).toBeVisible();
      await expect(page.locator('input[name="title"]')).toHaveValue(`${projectName} 명세`);
      await expect(page.locator('input[name="projectIds"]')).toHaveValue(projectSlug);
      await expect(page.getByText("프로젝트에 바로 연결됩니다.")).toBeVisible();
      await expect(page.locator('textarea[name="rawMarkdown"]')).toHaveValue(/# 요약/);
    } finally {
      await deleteAccountProject("sandbox-lab", projectSlug);
    }
  });

  test("공간 소유자가 프로젝트 목록에서 새 프로젝트를 만들면 원래 공개 화면 복귀 정보가 유지된다", async ({
    page,
  }) => {
    const projectName = `뒤로가기 확인 ${Date.now()}`;
    const projectSlug = slugify(projectName);

    try {
      await page.goto("/dev/login/?account=sandbox-lab");
      await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();

      await page.goto(
        `/projects/?account=sandbox-lab&returnTo=${encodeURIComponent("/?account=sandbox-lab&p=sandbox-core")}`,
      );
      await expect(page).toHaveURL(/\/projects\/\?account=sandbox-lab&returnTo=/);
      await page.locator("summary").filter({ hasText: "새 프로젝트" }).click();
      await page.getByRole("button", { name: "빠른 만들기" }).click();
      await page.getByTestId("quick-create-name").fill(projectName);
      await page.getByTestId("quick-create-description").fill("공개 화면으로 다시 돌아가야 하는 흐름 확인");
      await page.getByRole("button", { name: "만들고 첫 문서 쓰기" }).click();

      await expect(page).toHaveURL(/\/admin\/knowledge\/documents\/new\/\?/);
      await expect(page).toHaveURL(/returnTo=%2F%3Faccount%3Dsandbox-lab%26p%3Dsandbox-core/);
      await expect(page.locator('input[name="title"]')).toHaveValue(`${projectName} 명세`);
    } finally {
      await deleteAccountProject("sandbox-lab", projectSlug);
    }
  });
});
