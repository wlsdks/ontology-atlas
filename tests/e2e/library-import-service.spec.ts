import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * The Library's third door: **documents that are not on this computer yet.**
 *
 * Owner, 2026-09-07: *"it has to be really easy to use, or nobody will. Connecting a service is
 * mostly for the Library anyway — people want the things they already wrote somewhere else."*
 * Add files and Find documents both assume the document is already on disk; this is the door for
 * somebody whose notes live in Notion.
 *
 * What this spec locks is the promise, not the plumbing: the door exists beside the other two,
 * the picker names services rather than protocols, and the first step says a window will open and
 * who keeps what comes back. The writes themselves belong to the component tests and, beyond
 * them, to a real service nothing here can reach — which the report says out loud rather than
 * implying with a green run.
 */

test("자료실에 서비스에서 가져오는 문이 있고, 전문 용어를 말하지 않는다", async ({ page }) => {
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

  // Three doors, in the order of how far away the document is: on disk, in the folders you
  // granted, and somewhere else entirely.
  await expect(page.getByTestId("library-add-files")).toBeVisible();
  await expect(page.getByTestId("library-find-documents")).toBeVisible();
  const door = page.getByTestId("library-import-open");
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
   * The sentence that has to be here before anybody presses Connect: a window opens, and the
   * coding agent — not Atlas — opens it and keeps what comes back. Claiming custody Atlas does
   * not have is the failure this line exists to prevent (PO steward, 2026-09-07).
   */
  await expect(dialog).toContainText("코딩 도구가 열고");
  await expect(dialog).toContainText("취소되지는 않아요");
  await expect(page.getByTestId("library-import-connect")).toBeVisible();
});
