import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { HEALTHY_VAULT } from "./fixtures/broken-vault";

/**
 * **Renaming and deleting a document are doors on the page, and they open the product's own
 * dialogs** (map-edit QA D9, 2026-09-26).
 *
 * Both actions lived only in the command palette — invisible until a person typed `> ` and a
 * query — and answered through `window.prompt` / `window.confirm`: light, unstyled browser
 * boxes outside the dialog system (no scrim, no focus return), asking for a raw slug path, and a
 * delete confirmation that never named the documents still pointing at the file.
 *
 * This measures the two doors where a person looks for them — beside the file's address, on
 * top at their centre, at least 24px — and that each opens a modal `Dialog` rather than a
 * browser box. The writes themselves are asserted against a real vault in the QA bridge proof;
 * here the fixture folder is an OPFS handle, so nothing is confirmed.
 */

async function openCheckout(page: Page) {
  await stubDirectoryPicker(page, HEALTHY_VAULT);
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });
  await page.goto("/ko/docs/?guides=off&slug=capabilities%2Fcheckout");
  await expect(page.getByTestId("docs-editor-path")).toHaveText("capabilities/checkout.md", {
    timeout: 20_000,
  });
}

test("the file's rename and delete doors stand beside its address and open product dialogs", async ({
  page,
}) => {
  const nativeDialogs: string[] = [];
  page.on("dialog", (dialog) => {
    nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await openCheckout(page);

  const geometry = await page.evaluate(() => {
    const measure = (testId: string) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        onTop: hit === el || el.contains(hit),
      };
    };
    return {
      path: measure("docs-editor-path"),
      rename: measure("docs-file-rename"),
      remove: measure("docs-file-delete"),
    };
  });
  console.log("[docs-file-actions/geometry]", JSON.stringify(geometry));
  expect(geometry.rename, "the rename door is on the page").not.toBeNull();
  expect(geometry.remove, "the delete door is on the page").not.toBeNull();
  for (const door of [geometry.rename!, geometry.remove!]) {
    expect(door.onTop, "the door is what a press at its centre reaches").toBe(true);
    expect(Math.min(door.width, door.height), "WCAG 2.5.8 floor").toBeGreaterThanOrEqual(24);
    // Beside the address: after its right edge, and on its line.
    expect(door.left).toBeGreaterThanOrEqual(geometry.path!.right);
    expect(door.top).toBeLessThan(geometry.path!.bottom);
    expect(door.bottom).toBeGreaterThan(geometry.path!.top);
  }

  await page.getByTestId("docs-file-rename").click();
  const rename = page.getByTestId("docs-rename-dialog");
  await expect(rename).toBeVisible();
  await expect(rename).toHaveAttribute("role", "dialog");
  await expect(rename).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("docs-rename-input")).toHaveValue("checkout");
  // A name, not a path: the address it becomes is shown, the folder stays.
  await page.getByTestId("docs-rename-input").fill("Check out");
  await expect(rename).toContainText("capabilities/check-out.md");
  await page.keyboard.press("Escape");
  await expect(rename).toBeHidden();
  await expect(page.getByTestId("docs-file-rename")).toBeFocused();

  await page.getByTestId("docs-file-delete").click();
  const remove = page.getByTestId("docs-delete-dialog");
  await expect(remove).toBeVisible();
  await expect(remove).toHaveAttribute("role", "alertdialog");
  // `domains/orders` contains `checkout`: the confirmation names it before anything is removed.
  await expect(page.getByTestId("docs-delete-referrers")).toContainText("주문");
  await page.getByTestId("docs-delete-cancel").click();
  await expect(remove).toBeHidden();
  await expect(page.getByTestId("docs-editor-path")).toHaveText("capabilities/checkout.md");

  expect(nativeDialogs, "no browser prompt, confirm or alert box").toEqual([]);
});
