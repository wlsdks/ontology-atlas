import { expect, test } from "@playwright/test";

import en from "../../messages/en.json";
import ko from "../../messages/ko.json";
import { seedFirstRunSeen } from "./first-run-seed";

for (const [locale, title] of [
  ["ko", ko.notFound.title],
  ["en", en.notFound.title],
] as const) {
  test(`/${locale}/skills is an honest 404`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto(`/${locale}/skills/?guides=off`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByTestId("agent-skills-page")).toHaveCount(0);
    await expect(page.getByTestId("agents-page")).toHaveCount(0);
  });
}

test("the surviving Agents destination still owns its route", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto("/ko/agents/?guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("agents-page")).toBeVisible();
  await expect(page.getByTestId("app-nav-rail-item-agents")).toHaveAttribute("aria-current", "page");
});
