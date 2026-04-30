import { expect, test } from "@playwright/test";
import { createAccountMemberUser } from "./support/emulator-admin";

test.describe("public account menu", () => {
  test("데모 로그인 상태에서는 프로젝트 화면에서 계정 메뉴를 열 수 있다", async ({
    page,
  }) => {
    await page.goto("/login/");
    await page.getByRole("button", { name: "데모 로그인" }).click();
    await expect(page).toHaveURL(/\/projects\/\?account=stress-lab$/);

    const trigger = page.locator('button[aria-label="내 정보 보기"]').first();
    await trigger.click();

    const menu = page.getByRole("menu", { name: "내 정보 메뉴" });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("데모 사용자");
    await expect(menu.getByRole("menuitem", { name: /프로젝트/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /계정 설정/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "로그아웃" })).toBeVisible();
  });

  test("관리자 상태에서는 프로젝트 상세에서도 관리자 이동과 로그아웃 메뉴가 보인다", async ({
    page,
  }) => {
    await page.goto("/dev/login/");
    await page.getByRole("button", { name: "개발용 로컬 우회로 접속" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\//);

    await page.goto("/project/view/?slug=iam&account=sandbox-lab");
    const trigger = page.locator('button[aria-label="내 정보 보기"]').first();

    await expect(trigger).toContainText("관리자");
    await trigger.click();

    const menu = page.getByRole("menu", { name: "내 정보 메뉴" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /프로젝트/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /계정 설정/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "설정", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "로그아웃" })).toBeVisible();
  });

  test("공간 소유자는 공개 화면에서 바로 설정 화면과 수정 작업으로 이어질 수 있다", async ({
    page,
  }) => {
    const suffix = Date.now();
    const email = `owner-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `공간 소유자 ${suffix}`;

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

    await expect(page).toHaveURL(/\/projects\/\?account=sandbox-lab$/);
    await page.locator("summary").filter({ hasText: "새 프로젝트" }).click();
    await expect(page.getByRole("button", { name: "빠른 만들기" })).toBeVisible();

    const trigger = page.locator('button[aria-label="내 정보 보기"]').first();
    await trigger.click();
    const menu = page.getByRole("menu", { name: "내 정보 메뉴" });
    await expect(menu).toContainText("공간 소유자");
    await expect(menu.getByRole("menuitem", { name: /계정 설정/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "설정", exact: true })).toBeVisible();

    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");
    await expect(page.getByTestId("public-quick-edit-toggle")).toBeVisible();
    await page.getByTestId("public-quick-edit-toggle").click();
    await expect(page.getByRole("dialog", { name: "프로젝트 정보 수정" })).toBeVisible();
    await page.getByRole("link", { name: "전체 편집" }).click();

    await expect(page).toHaveURL(/\/admin\/project\/edit\/\?/);
    await expect(page).toHaveURL(/slug=sandbox-core/);
    await expect(page.getByTestId("project-save-top")).toBeVisible();
  });

  test("권한 없는 로그인 사용자는 공개 화면을 읽기 전용으로 본다", async ({
    page,
  }) => {
    const suffix = Date.now();
    const email = `viewer-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `읽기 사용자 ${suffix}`;

    await page.goto("/signup/?account=sandbox-lab");
    await page.getByLabel("이름").fill(displayName);
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByLabel("비밀번호 확인").fill(password);
    await page.getByRole("button", { name: "이메일로 회원가입" }).click();

    await expect(page).toHaveURL(/\/projects\/\?account=sandbox-lab$/);
    await expect(page.getByRole("button", { name: "새 프로젝트 만들기" })).toHaveCount(0);

    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");
    await expect(page.getByLabel("프로젝트 관리")).toHaveCount(0);

    const trigger = page.locator('button[aria-label="내 정보 보기"]').first();
    await trigger.click();
    const menu = page.getByRole("menu", { name: "내 정보 메뉴" });
    await expect(menu).toContainText(displayName);
    await expect(menu.getByRole("menuitem", { name: /계정 설정/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "설정", exact: true })).toHaveCount(0);
  });
});
