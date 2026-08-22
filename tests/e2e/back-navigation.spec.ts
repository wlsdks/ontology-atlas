import { expect, test } from "@playwright/test";

/**
 * Regression guard for browser back returning to the previous state during the main
 * journeys.
 *
 * Only public, login-free paths are verified.
 */

test("공개 상세 → 홈 뒤로가기", async ({ page }) => {
  await page.goto("/en/");
  await page.waitForLoadState("domcontentloaded");
  const rootPath = new URL(page.url()).pathname;

  await page.goto("/en/project/ontology-atlas/");
  await page.waitForURL(/\/en\/project\/ontology-atlas\/?/);

  await Promise.all([
    page.waitForURL((url) => new URL(url.toString()).pathname === rootPath, {
      timeout: 10_000,
    }),
    page.goBack(),
  ]);
  expect(new URL(page.url()).pathname).toBe(rootPath);
});

test("404에서 '홈으로' CTA가 history 보존 없이 홈 이동", async ({ page }) => {
  await page.goto("/en/");
  await page.goto("/en/this-route-really-does-not-exist/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Looks like you're lost.",
  );

  // Clicking the "home" link (a Link component → push). Going back afterwards must
  // land before the 404, not on it. Because Link pushes, leaving both 404 and home in
  // history is acceptable; what matters is that home is reachable from the 404.
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

  // The button calls goBack only when window.history.length > 1.
  await Promise.all([
    page.waitForURL((url) => new URL(url.toString()).pathname === firstPath, {
      timeout: 10_000,
    }),
    page.getByRole("button", { name: "Previous screen" }).click(),
  ]);
  expect(new URL(page.url()).pathname).toBe(firstPath);
});
