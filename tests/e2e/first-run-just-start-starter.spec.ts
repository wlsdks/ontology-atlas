import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";

/**
 * **"Just start" leaves a starter in the folder it makes** (inspection 2026-09-25, D1).
 *
 * The door created and opened a new folder that stayed empty, with no error and no toast, three
 * runs out of three. The starter was written by an effect waiting for the first-run screen's next
 * render, and in the installed app that screen never renders again: the shell swaps it for the
 * opening pane as soon as the open begins, and the root entry swaps that for the map. A unit test
 * can only imitate those swaps; this runs the real shell and root entry over the native stub, and
 * reads the stub's files — the disk — before it believes the screen.
 */
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

  // The screen agrees with the disk, and the door says where the folder is.
  const documents = files.filter((file) => file.endsWith(".md") && !file.startsWith(".")).length;
  await expect(page.getByTestId("topology-index-panel")).toContainText(`${documents} documents`);
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("~/Ontology Atlas/my-ontology");
});
