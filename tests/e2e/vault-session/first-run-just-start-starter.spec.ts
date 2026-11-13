import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";

test("just start writes the chosen starter into the new folder and says where", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, {}, undefined, {
    replaceFixture: true,
    writable: true,
    defaultVaultParent: "/Users/probe/Ontology Atlas",
  });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });

  await page.getByTestId("first-run-just-start").click();
  await page.getByTestId("first-run-shape-both").click();
  await expect(page.getByTestId("app-nav-rail")).toBeVisible({ timeout: 60_000 });

  const files = await page.evaluate(() =>
    Object.keys((window as unknown as { __stubFiles: Record<string, string> }).__stubFiles).sort(),
  );
  expect(files).toEqual(
    expect.arrayContaining([
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      "capabilities/example-capability.md",
      "domains/example-domain.md",
      "elements/example-element.md",
      "project.md",
      "wiki/_template.md",
    ]),
  );

  // The screen lists what the disk holds, and the door says where the folder is.
  const index = page.getByTestId("topology-index-panel");
  await expect(index).toContainText("My project");
  await expect(index).toContainText("Example domain");
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("~/Ontology Atlas/my-ontology");
});
