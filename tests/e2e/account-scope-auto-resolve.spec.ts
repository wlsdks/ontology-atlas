import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT_ID } from "@/shared/config/demo-space";

/**
 * 진안 PR #190 (`useAutoResolveAccountId` 4 surface + /docs/ /ontology/
 * 돌아가기 동선) 의 회귀 차단 e2e (UX-19, Track B5).
 *
 * 시나리오:
 * 1. 데모 로그인 후 / · /projects/ · /project/[slug]/ · /docs/ 4 surface
 *    진입 시 URL 에 `?account=` 가 자동 추가되는지 (legacy 전역 collection
 *    로 새지 않음).
 * 2. /docs/ 의 "돌아가기" 버튼이 / (워크스페이스 지도) 로 가는지 — 이전엔
 *    /projects/ 로 가서 사용자가 출발점 잃었음.
 * 3. /ontology/ 의 "워크스페이스 복귀" 버튼이 visible 한지 — 이전엔 없어
 *    빠져나갈 길이 없었음.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 (로컬 dev) 또는
 * https://aslan-project-map.web.app (운영) 둘 다 가정.
 */

async function loginAsDemo(page: import("@playwright/test").Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login/");
  await page.getByRole("button", { name: "데모 로그인" }).click();
  // login 완료 후 / (홈 워크스페이스 지도, getDemoHomeHref) 로 라우팅됨.
  // ?account=DEMO 만 보장하면 됨 (path 는 / 또는 /projects/ 둘 다 OK 였던
  // 과거 history 호환).
  await expect(page).toHaveURL(
    new RegExp(`account=${DEMO_ACCOUNT_ID}`),
    { timeout: 20_000 },
  );
}

test.describe("PR #190 회귀 — useAutoResolveAccountId 4 surface", () => {
  test("/ 진입 시 URL 에 ?account= 자동 추가", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/");
    // useAutoResolveAccountId 가 ?account=DEMO 를 추가해야 함.
    await page.waitForURL(
      new RegExp(`account=${DEMO_ACCOUNT_ID}`),
      { timeout: 10_000 },
    );
    expect(page.url()).toContain(`account=${DEMO_ACCOUNT_ID}`);
  });

  test("/projects/ 진입 시 URL 에 ?account= 자동 추가", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/projects/");
    await page.waitForURL(
      new RegExp(`account=${DEMO_ACCOUNT_ID}`),
      { timeout: 10_000 },
    );
    expect(page.url()).toContain(`account=${DEMO_ACCOUNT_ID}`);
  });

  test("/docs/ 진입 시 URL 에 ?account= 자동 추가 + 돌아가기 → /", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/docs/");
    await page.waitForURL(
      new RegExp(`account=${DEMO_ACCOUNT_ID}`),
      { timeout: 10_000 },
    );

    // 돌아가기 버튼 — aria-label "워크스페이스 지도로 돌아가기" 또는
    // 텍스트 "돌아가기".
    const backLink = page
      .getByRole("link", { name: /돌아가기|워크스페이스 지도/ })
      .first();
    await expect(backLink).toBeVisible({ timeout: 10_000 });
    const href = await backLink.getAttribute("href");
    // href 가 / (또는 /?account=…) — /projects/ 가 아니어야 함 (PR #190 fix).
    expect(href).toBeTruthy();
    expect(href!).toMatch(/^\/(\?|$)/);
  });
});

test.describe("PR #190 회귀 — /ontology 워크스페이스 복귀", () => {
  test("/ontology/ 진입 시 워크스페이스 복귀 link visible", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/ontology/");
    const backLink = page.getByRole("link", {
      name: /워크스페이스 지도로 돌아가기/,
    });
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    const href = await backLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href!).toMatch(/^\/(\?|$)/);
  });
});

/**
 * Fire 1 — useAutoResolveAccountId 7 surface 확장.
 *
 * PR #190 의 4 surface (/, /projects/, /project/[slug]/, /docs/) 에 누락된
 * 운영 surface 3 개 추가:
 *   - /knowledge/ (대시보드)
 *   - /review/knowledge/ (검수 큐)
 *   - /diagnostics/insights/ (운영 인사이트)
 *
 * 회귀 시나리오: 진안 본인 계정으로 OperationsNav 의 탭 클릭 시 ?account=
 * 가 다음 페이지에도 흘러야 한다. 이전엔 위 3 surface 가 hook 미적용이라
 * legacy 전역 collection 으로 새었다.
 */
test.describe("Fire 1 회귀 — useAutoResolveAccountId 7 surface 확장", () => {
  test("/knowledge/ 진입 시 URL 에 ?account= 자동 추가", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/knowledge/");
    await page.waitForURL(
      new RegExp(`account=${DEMO_ACCOUNT_ID}`),
      { timeout: 10_000 },
    );
    expect(page.url()).toContain(`account=${DEMO_ACCOUNT_ID}`);
  });

  test("/review/knowledge/ 진입 시 URL 에 ?account= 자동 추가", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/review/knowledge/");
    await page.waitForURL(
      new RegExp(`account=${DEMO_ACCOUNT_ID}`),
      { timeout: 10_000 },
    );
    expect(page.url()).toContain(`account=${DEMO_ACCOUNT_ID}`);
  });

  test("/diagnostics/insights/ 진입 시 URL 에 ?account= 자동 추가", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto("/diagnostics/insights/");
    await page.waitForURL(
      new RegExp(`account=${DEMO_ACCOUNT_ID}`),
      { timeout: 10_000 },
    );
    expect(page.url()).toContain(`account=${DEMO_ACCOUNT_ID}`);
  });
});
