import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime, mountDesktopVault } from "../../desktop-rail-arrival-harness";

const VAULT = {
  "README.md": "# 걷기 볼트\n",
  "domains/order.md":
    "---\nkind: domain\nslug: domains/order\ntitle: 주문\nuid: 11111111-1111-4111-8111-111111111111\n---\n\n주문 도메인.\n",
  "capabilities/cart.md":
    "---\nkind: capability\nslug: capabilities/cart\ntitle: 장바구니\nuid: 22222222-2222-4222-8222-222222222222\nrelations:\n  - type: belongs_to\n    to: domains/order\n---\n\n장바구니 역량.\n",
};

test("after a rename, no warning appears and the address points at the new name", async ({ page }) => {
  test.setTimeout(150_000);
  // Record native dialogs so their appearance fails the test instead of being answered.
  const nativeDialogs: string[] = [];
  page.on("dialog", (d) => {
    nativeDialogs.push(d.type());
    void d.dismiss();
  });
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, VAULT, undefined, { replaceFixture: true, writable: true });
  await mountDesktopVault(page, "ko");
  /*
   * The folder is open once the first-run door is gone. The map canvas is deliberately
   * **not** the condition: this fixture is three files with no project node, and such a
   * vault opens the Library rather than the map (`AGENTS.md`, routing) — asserting the
   * canvas here failed on every run.
   */
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  // `click()` waits for its own target, so the tree needs nothing in front of it.
  await page.getByText("capabilities", { exact: true }).first().click();
  await page.getByText("장바구니", { exact: true }).first().click();
  // The document is open when the address says so — the state the rename then moves.
  await expect
    .poll(() => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
    .toBe("capabilities/cart");

  // The command answers to its old Korean name through its keywords.
  await page.keyboard.press("Meta+k");
  const palette = page.getByRole("dialog").filter({ has: page.locator('input[type="text"]') }).first();
  await expect(palette, "the palette did not open").toBeVisible();
  await page.keyboard.type("이름 변경");
  // Enter takes the **active** row, so the condition is that the active row is the
  // command we typed for — not that 600 ms of this machine has gone by.
  await expect(palette.locator('[role="option"][aria-selected="true"]')).toContainText("이름 바꾸기");
  await page.keyboard.press("Enter");

  // The rename dialog keeps the folder and edits the name part of the address.
  const nameInput = page.getByTestId("docs-rename-input");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("cart-renamed");
  await page.getByTestId("docs-rename-confirm").click();
  await expect(page.getByTestId("docs-rename-dialog")).toBeHidden({ timeout: 20_000 });

  // A **watch window**, not a wait: the claim is that the banner never appears across
  // the manifest-refresh gap (web polling at 1.5s/5s), and a single frame during that
  // gap is already a false warning. Six seconds of real time is the subject of the
  // claim, so it is spent deliberately.
  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    // measurement window: the banner must stay absent across the whole manifest-refresh gap.
    await page.waitForTimeout(500);
    expect(await banner.count(), `false not-found warning ${(i + 1) * 0.5}s after the rename`).toBe(0);
  }

  // The address points at the new name, and the document is still open.
  expect(page.url()).toContain("slug=capabilities%2Fcart-renamed");
  await expect(page.getByText("장바구니").first()).toBeVisible();
  expect(nativeDialogs, "the rename opened a browser prompt").toEqual([]);
});

test("after a delete, no warning appears and the address does not point at the deleted document", async ({ page }) => {
  test.setTimeout(150_000);
  const nativeDialogs: string[] = [];
  page.on("dialog", (d) => {
    nativeDialogs.push(d.type());
    void d.dismiss();
  });
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, VAULT, undefined, { replaceFixture: true, writable: true });
  await mountDesktopVault(page, "ko");
  /*
   * The folder is open once the first-run door is gone. The map canvas is deliberately
   * **not** the condition: this fixture is three files with no project node, and such a
   * vault opens the Library rather than the map (`AGENTS.md`, routing) — asserting the
   * canvas here failed on every run.
   */
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  // `click()` waits for its own target, so the tree needs nothing in front of it.
  await page.getByText("capabilities", { exact: true }).first().click();
  await page.getByText("장바구니", { exact: true }).first().click();
  // The document is open when the address says so — the state the rename then moves.
  await expect
    .poll(() => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
    .toBe("capabilities/cart");

  await page.keyboard.press("Meta+k");
  const palette = page.getByRole("dialog").filter({ has: page.locator('input[type="text"]') }).first();
  await expect(palette, "the palette did not open").toBeVisible();
  await page.keyboard.type("삭제");
  // Enter takes the **active** row, so the condition is that the active row is the
  // command we typed for — not that 600 ms of this machine has gone by.
  await expect(palette.locator('[role="option"][aria-selected="true"]')).toContainText("삭제");
  await page.keyboard.press("Enter");
  await page.getByTestId("docs-delete-confirm").click();
  await expect(page.getByTestId("docs-delete-confirm")).toBeHidden({ timeout: 20_000 });

  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    // measurement window: the banner must stay absent across the whole manifest-refresh gap.
    await page.waitForTimeout(500);
    expect(await banner.count(), `false not-found warning ${(i + 1) * 0.5}s after the delete`).toBe(0);
  }
  expect(page.url()).not.toContain("slug=capabilities%2Fcart");
  expect(nativeDialogs, "the delete opened a browser confirm dialog").toEqual([]);
});
