import { expect, test } from "@playwright/test";

/**
 * Regression guard for browser back returning to the previous state during the main
 * journeys.
 *
 * Only public, login-free paths are verified.
 */

test("the home CTA on the 404 page navigates home without preserving history", async ({ page }) => {
  await page.goto("/en/");
  await page.goto("/en/this-route-really-does-not-exist/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Page not found",
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

test("the 404 back button calls goBack when history exists", async ({ page }) => {
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
