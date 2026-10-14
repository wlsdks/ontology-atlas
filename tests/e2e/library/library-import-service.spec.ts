import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

/**
 * The third door: documents not on this computer yet. Locks the promise, not the plumbing: the door
 * exists, the picker names services, and the first step says who keeps what comes back.
 */

test("자료실에 서비스에서 가져오는 문이 있고, 전문 용어를 말하지 않으며, 웹에서는 못 누를 버튼 대신 무엇이 되었는지 말한다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/ko/library/");
  await page.waitForLoadState("networkidle");

  // The fixture folder has no sources, so this is the empty stage: three doors, in the order
  // of how far away the document is — on disk, in the folders you granted, and somewhere else
  // entirely. The workbench carries the same three as chips (`library-import-open`).
  await expect(page.getByTestId("library-start-add-files")).toBeVisible();
  await expect(page.getByTestId("library-start-find-documents")).toBeVisible();
  const door = page.getByTestId("library-start-import");
  await expect(door).toBeVisible();

  await door.click();
  const dialog = page.getByTestId("library-import-dialog");
  await expect(dialog).toBeVisible();

  // Services by name, not protocols. The escape hatch to the technical dialog is last.
  const tiles = page.getByTestId("library-import-service");
  await expect(tiles).not.toHaveCount(0);
  await expect(tiles.last()).toHaveAttribute("data-service", "other");
  await expect(
    page.locator('[data-testid="library-import-service"][data-service="notion"]'),
  ).toBeVisible();

  await page.locator('[data-testid="library-import-service"][data-service="notion"]').click();
  await expect(page.getByTestId("library-import-step")).toHaveAttribute("data-step", "connect");

  /*
   * Before Connect is pressed the step must say the token goes to the keychain, not the folder, and
   * that the coding tool, not Atlas, reaches the service with it.
   */
  await expect(dialog).toContainText("키체인");
  await expect(dialog).toContainText("코딩 도구");
  await expect(page.getByTestId("library-import-token")).toBeVisible();
  await expect(page.getByTestId("library-import-token-issue")).toHaveAttribute("href", /notion\.so/);
  // The press waits for the value.
  await expect(page.getByTestId("library-import-connect")).toBeDisabled();

  /*
   * Only the coding-agent route can fetch from a service, so a browser has no Connect press;
   * it says what happened instead of a button that cannot act.
   */
  await page.getByTestId("library-import-token").fill("ntn_e2e_value");
  await page.getByTestId("library-import-connect").click();

  await expect(page.getByTestId("library-import-step")).toHaveAttribute("data-step", "choose");
  await expect(page.getByTestId("library-import-bring")).toHaveCount(0);
  const card = page.getByTestId("library-import-no-agent");
  await expect(card).toBeVisible();
  await expect(card).toContainText("연결은 저장되었고");
  await expect(page.getByTestId("library-import-no-agent-app")).toHaveAttribute("href", /download/);
});
