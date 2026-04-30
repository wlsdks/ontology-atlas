import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_ID } from "@/shared/config/demo-space";

test.describe("public auth flows", () => {
  test("비로그인 첫 접속 시 서비스 첫 화면이 보인다", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("문서가")).toBeVisible();
    await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
    await expect(page.getByRole("link", { name: "내 워크스페이스 만들기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "데모 로그인" })).toBeVisible();
  });

  test("로그인 전 프로젝트 화면에 직접 들어가면 서비스 첫 화면으로 돌아온다", async ({ page }) => {
    await page.goto("/project/view/?slug=sandbox-core&account=sandbox-lab");

    await expect(page).toHaveURL(/\/\?account=sandbox-lab&next=/);
    await expect(page.getByRole("button", { name: "데모 로그인" })).toBeVisible();
    await expect(page.getByText("로그인하면 원래 보던 화면으로 돌아갑니다.")).toBeVisible();
  });

  test("로그인과 회원가입 화면에서 데모 로그인으로 바로 들어갈 수 있다", async ({ page }) => {
    await page.goto("/login/");
    await expect(page.getByRole("button", { name: "데모 로그인" }).first()).toBeVisible();
    await page.getByRole("button", { name: "데모 로그인" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/\\?account=${DEMO_ACCOUNT_ID}$`));
    await expect(page.locator('button[aria-label="내 정보 보기"]').first()).toContainText("데모 사용자");
    await page.locator('button[aria-label="내 정보 보기"]').first().click();
    await page.getByRole("menuitem", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/\?account=stress-lab$/);
    await expect(page.getByRole("button", { name: "데모 로그인" })).toBeVisible();

    await page.goto("/signup/");
    await expect(page.getByRole("button", { name: "데모 로그인" }).first()).toBeVisible();
    await page.getByRole("button", { name: "데모 로그인" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/\\?account=${DEMO_ACCOUNT_ID}$`));
    await expect(page.locator('button[aria-label="내 정보 보기"]').first()).toContainText("데모 사용자");
  });

  test("회원가입 후 로그아웃하고 다시 로그인할 수 있다", async ({ page }) => {
    const suffix = Date.now();
    const email = `tester-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `테스터 ${suffix}`;

    await page.goto("/signup/?next=%2F%3Faccount%3Dsandbox-lab&account=sandbox-lab");
    await expect(page.getByRole("heading", { name: "계정 만들기" })).toBeVisible();

    await page.getByLabel("이름").fill(displayName);
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByLabel("비밀번호 확인").fill(password);
    await page.getByRole("button", { name: "이메일로 회원가입" }).click();

    await expect(page).toHaveURL(/\/\?account=sandbox-lab$/);
    const trigger = page.locator('button[aria-label="내 정보 보기"]').first();
    const expectIdentity = async () => {
      const menuText = (await page.getByRole("menu", { name: "내 정보 메뉴" }).textContent()) ?? "";
      expect(menuText.includes(displayName) || menuText.includes(email)).toBe(true);
    };
    await trigger.click();
    await expectIdentity();
    await expect(page.getByRole("menu", { name: "내 정보 메뉴" })).toContainText("회원");

    await page.getByRole("menuitem", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/\?account=sandbox-lab$/);
    await page.getByRole("link", { name: "로그인" }).click();

    await expect(page).toHaveURL(/\/login\/\?account=sandbox-lab$/);
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "이메일로 로그인" }).click();

    await expect(page).toHaveURL(/\/\?account=sandbox-lab$/);
    await trigger.click();
    await expectIdentity();
  });

  test("next 파라미터가 없으면 로그인 후 프로젝트 선택 화면으로 이동한다", async ({ page }) => {
    const suffix = Date.now();
    const email = `selector-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `선택 사용자 ${suffix}`;

    await page.goto("/signup/?account=sandbox-lab");
    await page.getByLabel("이름").fill(displayName);
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByLabel("비밀번호 확인").fill(password);
    await page.getByRole("button", { name: "이메일로 회원가입" }).click();

    await expect(page).toHaveURL(/\/projects\/\?account=sandbox-lab$/);
    await expect(page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible();
    await expect(page.locator('button[aria-label="내 정보 보기"]').first()).toBeVisible();
  });

  test("로그인 화면에서 비밀번호 재설정 화면으로 이동할 수 있다", async ({ page }) => {
    await page.goto("/login/?account=sandbox-lab");
    await page.getByLabel("이메일").fill("recover@narnia.local");
    await page.getByRole("link", { name: "비밀번호 재설정" }).click();

    await expect(page).toHaveURL(/\/reset-password\/\?account=sandbox-lab&email=recover%40narnia\.local$/);
    await expect(page.getByRole("heading", { name: "비밀번호 재설정" })).toBeVisible();
    await expect(page.getByLabel("이메일")).toHaveValue("recover@narnia.local");
  });
});
