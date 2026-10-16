import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import { HEALTHY_VAULT } from "../../fixtures/broken-vault";

const UNTITLED_BODY = "capabilities/refund.md";
const VAULT = {
  ...HEALTHY_VAULT,
  [UNTITLED_BODY]: [
    "---",
    "kind: capability",
    "slug: refund",
    "title: Refund",
    "display_ko: 환불하기",
    "domain: orders",
    "uid: 77777777-7777-4777-8777-777777777777",
    "---",
    "",
    "Money goes back to the card the order was paid with.",
    "",
  ].join("\n"),
};

async function openCheckout(page: Page) {
  await stubDirectoryPicker(page, VAULT);
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

test("the file's rename and delete doors stand beside its name and open product dialogs", async ({
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
      title: measure("docs-reading-title"),
      rename: measure("docs-file-rename"),
      remove: measure("docs-file-delete"),
    };
  });
  console.log("[docs-file-actions/geometry]", JSON.stringify(geometry));
  expect(geometry.rename, "the rename door is on the page").not.toBeNull();
  expect(geometry.remove, "the delete door is on the page").not.toBeNull();
  // `checkout` opens with its own `#` heading, so the doors stand on the address line.
  expect(geometry.title).toBeNull();
  const name = geometry.path!;
  for (const door of [geometry.rename!, geometry.remove!]) {
    expect(door.onTop, "the door is what a press at its centre reaches").toBe(true);
    expect(Math.min(door.width, door.height), "the chrome icon tile").toBe(36);
    expect(door.left).toBeGreaterThanOrEqual(name.right);
    expect(door.top).toBeLessThan(name.bottom);
    expect(door.bottom).toBeGreaterThan(name.top);
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

test("a body without its own heading is named by the column's one h1; a body with one keeps the page's", async ({ page }) => {
  await openCheckout(page);
  const pageHeading = page.getByRole("heading", { level: 1 });
  await expect(page.getByTestId("docs-reading-title")).toHaveCount(0);
  await expect(pageHeading).toHaveCount(1);
  await expect(pageHeading).toHaveText("온톨로지");
  await expect(page.locator("[data-docs-viewer]")).toContainText("결제하기");

  await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent("capabilities/refund")}`);
  const title = page.getByTestId("docs-reading-title");
  await expect(title).toHaveText("환불하기", { timeout: 20_000 });
  await expect(pageHeading).toHaveCount(1);
  await expect(pageHeading).toHaveText("환불하기");
  await expect(page.locator("h1.sr-only")).toHaveCount(0);
  expect(await page.title()).toMatch(/^환불하기/);

  const doors = await page.evaluate(() => {
    const box = (testId: string) => {
      const r = document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    return { title: box("docs-reading-title"), rename: box("docs-file-rename"), remove: box("docs-file-delete") };
  });
  for (const door of [doors.rename, doors.remove]) {
    expect(door.width).toBe(36);
    expect(door.left).toBeGreaterThanOrEqual(doors.title.right);
    expect(door.top).toBeLessThan(doors.title.bottom);
    expect(door.bottom).toBeGreaterThan(doors.title.top);
  }
});
