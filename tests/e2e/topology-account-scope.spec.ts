import { expect, test, type APIRequestContext } from "@playwright/test";
import { createAccountMemberUser } from "./support/emulator-admin";

const ADMIN_PROXY_ORIGIN = "http://127.0.0.1:3000";
const ADMIN_PROXY_BASE_URL =
  process.env.NEXT_PUBLIC_DEV_ADMIN_PROXY_ORIGIN?.trim() || "http://127.0.0.1:18081";
const SANDBOX_ACCOUNT_ID = "sandbox-lab";
const SANDBOX_CONSOLE_SLUG = "sandbox-console";

interface ProjectRecord {
  slug: string;
  position?: { x: number; y: number };
}

async function listProjects(request: APIRequestContext, accountId?: string) {
  const suffix = accountId ? `?account=${encodeURIComponent(accountId)}` : "";
  const response = await request.get(`${ADMIN_PROXY_BASE_URL}/dev-admin/projects${suffix}`, {
    headers: { Origin: ADMIN_PROXY_ORIGIN },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ProjectRecord[];
}

async function restoreProjectPosition(
  request: APIRequestContext,
  slug: string,
  position: { x: number; y: number },
  accountId?: string,
) {
  const suffix = accountId ? `?account=${encodeURIComponent(accountId)}` : "";
  const response = await request.patch(
    `${ADMIN_PROXY_BASE_URL}/dev-admin/projects/positions${suffix}`,
    {
      headers: {
        Origin: ADMIN_PROXY_ORIGIN,
        "Content-Type": "application/json",
      },
      data: {
        positions: [{ slug, position }],
      },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function loginAsSandboxViewer(page: import("@playwright/test").Page) {
  const suffix = Date.now();
  const email = `account-scope-${suffix}@narnia.local`;
  const password = "narnia-pass-123";

  await createAccountMemberUser({
    email,
    password,
    displayName: `계정 범위 사용자 ${suffix}`,
    accountId: SANDBOX_ACCOUNT_ID,
    role: "viewer",
  });

  await page.goto(`/login/?account=${SANDBOX_ACCOUNT_ID}`);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "이메일로 로그인" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/\\?account=${SANDBOX_ACCOUNT_ID}$`));
}

test.describe("account-scoped topology flows", () => {
  test("샌드박스 계정 화면은 공개 화면과 분리되고 위치 저장도 계정 경로에만 반영된다", async ({
    page,
    request,
  }) => {
    await loginAsSandboxViewer(page);

    const scopedProjects = await listProjects(request, SANDBOX_ACCOUNT_ID);
    const sandboxConsole = scopedProjects.find(
      (project) => project.slug === SANDBOX_CONSOLE_SLUG,
    );
    expect(sandboxConsole?.position).toBeTruthy();
    const originalPosition = sandboxConsole!.position!;

    await page.goto("/");
    await expect(page.getByText("샌드박스 콘솔")).toHaveCount(0);

    await page.goto(`/?account=${SANDBOX_ACCOUNT_ID}`);
    await expect(page.locator('button[aria-label="내 정보 보기"]').first()).toContainText(
      "샌드박스 랩",
    );
    await expect(page.getByText("샌드박스 콘솔")).toBeVisible();

    const temporaryPosition = {
      x: originalPosition.x + 96,
      y: originalPosition.y - 64,
    };
    await restoreProjectPosition(
      request,
      SANDBOX_CONSOLE_SLUG,
      temporaryPosition,
      SANDBOX_ACCOUNT_ID,
    );

    await expect
      .poll(async () => {
        const projects = await listProjects(request, SANDBOX_ACCOUNT_ID);
        const updatedPosition = projects.find(
          (project) => project.slug === SANDBOX_CONSOLE_SLUG,
        )?.position;
        if (!updatedPosition) return false;
        return (
          updatedPosition.x === temporaryPosition.x &&
          updatedPosition.y === temporaryPosition.y
        );
      })
      .toBeTruthy();

    const globalProjects = await listProjects(request);
    expect(
      globalProjects.some((project) => project.slug === SANDBOX_CONSOLE_SLUG),
    ).toBeFalsy();

    await restoreProjectPosition(
      request,
      SANDBOX_CONSOLE_SLUG,
      originalPosition,
      SANDBOX_ACCOUNT_ID,
    );
  });

  test("계정 기반 홈 드로어의 상세와 토폴로지 링크는 같은 계정 공간을 유지한다", async ({ page }) => {
    await loginAsSandboxViewer(page);
    await page.goto(`/?p=sandbox-core&account=${SANDBOX_ACCOUNT_ID}`);

    await expect(page.getByTestId("project-drawer")).toBeVisible();
    await expect(page.getByText("어디와 연결돼 있나")).toBeVisible();
    await expect(page.getByRole("link", { name: /프로젝트 보기/ })).toHaveAttribute(
      "href",
      /\/project\/view\/\?slug=sandbox-core&account=sandbox-lab$/,
    );
    await expect(page.getByRole("link", { name: /토폴로지/ })).toHaveAttribute(
      "href",
      /\/\?p=sandbox-core&account=sandbox-lab$/,
    );
  });
});
