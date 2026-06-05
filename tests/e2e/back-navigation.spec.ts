import { expect, test } from "@playwright/test";

/**
 * T-08. 지침서 §1.6 "뒤로가기 반드시 동작". 사용자가 주요 여정 중 브라우저
 * 뒤로가기를 눌렀을 때 이전 상태로 복귀하는지 회귀 방지.
 *
 * 비로그인 공개 경로만 검증한다. 로그인 필요한 여정은 emulator 전제.
 */

test("공개 상세 → 홈 뒤로가기", async ({ page }) => {
  await page.goto("/en/");
  await page.waitForLoadState("domcontentloaded");
  const landingPath = new URL(page.url()).pathname;

  await page.goto("/en/project/ontology-atlas/");
  await page.waitForURL(/\/en\/project\/ontology-atlas\/?/);

  await Promise.all([
    page.waitForURL((url) => new URL(url.toString()).pathname === landingPath, {
      timeout: 10_000,
    }),
    page.goBack(),
  ]);
  expect(new URL(page.url()).pathname).toBe(landingPath);
});

test("404에서 '홈으로' CTA가 history 보존 없이 홈 이동", async ({ page }) => {
  await page.goto("/en/");
  await page.goto("/en/this-route-really-does-not-exist/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Looks like you're lost.",
  );

  // "홈으로" 링크 클릭(Link 컴포넌트 → push). 이후 뒤로가기 시 404로 돌아가지
  // 말고 홈 이전(홈)으로. Link push 이기 때문에 history에 404 → 홈 두 단계가
  // 남음은 허용. 핵심은 404에서 홈으로 갈 수 있는가.
  await Promise.all([
    page.waitForURL((url) => new URL(url.toString()).pathname === "/en/", {
      timeout: 10_000,
    }),
    page.getByRole("link", { name: "Home" }).click(),
  ]);
  expect(new URL(page.url()).pathname).toBe("/en/");
});

test("404 '이전 화면으로' 버튼이 history 있을 때 goBack", async ({ page }) => {
  await page.goto("/en/");
  const firstPath = new URL(page.url()).pathname;
  await page.goto("/en/another-missing-route/");

  // 버튼은 window.history.length > 1에서만 goBack 호출.
  await Promise.all([
    page.waitForURL((url) => new URL(url.toString()).pathname === firstPath, {
      timeout: 10_000,
    }),
    page.getByRole("button", { name: "Previous screen" }).click(),
  ]);
  expect(new URL(page.url()).pathname).toBe(firstPath);
});
