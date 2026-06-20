import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

test("Relief engine loading fallback exposes product hierarchy and graph scale", async ({
  page,
}) => {
  await page.route(/topology-map-sigma|SigmaTopology/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });

  await page.goto("/en/topology/");

  const fallback = page.getByTestId("topology-engine-loading").first();
  await expect(fallback).toBeVisible({ timeout: 10_000 });
  await expect(fallback).toHaveAttribute(
    "data-loading-contract",
    "product-hierarchy-before-engine",
  );
  await expect(fallback).toHaveAttribute(
    "data-loading-flow",
    "product-system>domain>capability>evidence>agent-handoff",
  );
  await expect(fallback).toHaveAttribute("data-loading-motion-policy", "quiet-no-pulse");
  await expect(fallback).toHaveAttribute("data-concept-count", /^[1-9]\d*$/);
  await expect(fallback).toHaveAttribute("data-relation-count", /^[1-9]\d*$/);
  await expect(fallback.getByText(/concepts/i)).toBeVisible();
  await expect(fallback.getByText(/relations/i)).toBeVisible();
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );
});
