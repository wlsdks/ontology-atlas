import { expect, test } from "@playwright/test";
import { DESKTOP_VAULT_ROOT, installDesktopRailRuntime } from "../desktop-rail-arrival-harness";

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

test("starting from a code project shows where the folder goes, then opens it inside the project", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, writable: true });
  await page.goto("/en/?guides=off", { waitUntil: "domcontentloaded" });

  // The code door leads the first run; the other doors stay beneath it.
  const doors = page.locator("main button[data-testid^='first-run-']");
  await expect(doors.first()).toHaveAttribute("data-testid", "first-run-code-project");

  await page.getByTestId("first-run-code-project").click();
  await expect(page.getByTestId("build-from-code-path")).toHaveText(`${DESKTOP_VAULT_ROOT}/atlas`);
  const foldersCreated = () =>
    page.evaluate(
      () =>
        (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls.filter(
          (call) => call.command === "ensure_vault_directory",
        ).length,
    );
  // Showing the path writes nothing; only the confirm creates the folder.
  expect(await foldersCreated()).toBe(0);

  await page.getByTestId("build-from-code-go").click();
  await expect(page.getByTestId("first-run-code-project")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId("app-nav-rail")).toBeVisible();
  expect(await foldersCreated()).toBe(1);
});
