import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **After a rename, the address follows the new name** (found in a walkthrough,
 * 2026-08-13).
 *
 * The rename handler moved only the selection (`setSelectedSlug`), leaving the
 * address (`?slug=`) and the active memory on the old one. The moment the vault
 * manifest refreshed and the old address disappeared, the "the URL asked for a
 * document that does not exist" verdict fired and **warned that the name the user
 * had just changed could not be found** — the rename succeeded while the screen
 * reported failure.
 *
 * Two things are measured: ① after a rename the "not found" banner never appears,
 * including across the manifest-refresh gap, and ② the address bar's `?slug=`
 * points at the new name — copying and sharing that address must bring the
 * recipient to the same document.
 */
const VAULT = {
  "README.md": "# 걷기 볼트\n",
  "domains/order.md":
    "---\nkind: domain\nslug: domains/order\ntitle: 주문\nuid: 11111111-1111-4111-8111-111111111111\n---\n\n주문 도메인.\n",
  "capabilities/cart.md":
    "---\nkind: capability\nslug: capabilities/cart\ntitle: 장바구니\nuid: 22222222-2222-4222-8222-222222222222\nrelations:\n  - type: belongs_to\n    to: domains/order\n---\n\n장바구니 역량.\n",
};

test("이름 변경 뒤 — 경고가 안 뜨고 주소가 새 이름을 가리킨다", async ({ page }) => {
  test.setTimeout(150_000);
  // Rename is the in-app dialog now (2026-09-26), never a browser prompt: record any
  // native dialog so its return fails the test instead of being answered for it.
  const nativeDialogs: string[] = [];
  page.on("dialog", (d) => {
    nativeDialogs.push(d.type());
    void d.dismiss();
  });
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("first-run-starter-open")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
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

  // Palette → rename command. People still type the command's old Korean name; the
  // command answers to it through its keywords although its label changed on 2026-09-26.
  await page.keyboard.press("Meta+k");
  const palette = page.getByRole("dialog").filter({ has: page.locator('input[type="text"]') }).first();
  await expect(palette, "팔레트가 안 열렸다").toBeVisible();
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
    await page.waitForTimeout(500);
    expect(await banner.count(), `이름 변경 ${(i + 1) * 0.5}s 후 거짓 「못 찾았어요」 경고`).toBe(0);
  }

  // The address points at the new name, and the document is still open.
  expect(page.url()).toContain("slug=capabilities%2Fcart-renamed");
  await expect(page.getByText("장바구니").first()).toBeVisible();
  expect(nativeDialogs, "이름 변경이 브라우저 입력창을 띄웠다").toEqual([]);
});

/**
 * Deletion had the same illness (measured in the 2026-08-13 walkthrough): for a
 * document the user deleted through a confirmation dialog, the app reported "not
 * found — try a different workspace". An address the user just deleted is not a
 * broken link from outside.
 */
test("삭제 뒤 — 경고가 안 뜨고 주소가 지운 문서를 가리키지 않는다", async ({ page }) => {
  test.setTimeout(150_000);
  // Delete confirms in the app's own dialog now (2026-09-26), never a browser confirm.
  const nativeDialogs: string[] = [];
  page.on("dialog", (d) => {
    nativeDialogs.push(d.type());
    void d.dismiss();
  });
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("first-run-starter-open")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
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
  await expect(palette, "팔레트가 안 열렸다").toBeVisible();
  await page.keyboard.type("삭제");
  // Enter takes the **active** row, so the condition is that the active row is the
  // command we typed for — not that 600 ms of this machine has gone by.
  await expect(palette.locator('[role="option"][aria-selected="true"]')).toContainText("삭제");
  await page.keyboard.press("Enter");
  await page.getByTestId("docs-delete-confirm").click();
  await expect(page.getByTestId("docs-delete-confirm")).toBeHidden({ timeout: 20_000 });

  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(500);
    expect(await banner.count(), `삭제 ${(i + 1) * 0.5}s 후 거짓 「못 찾았어요」 경고`).toBe(0);
  }
  expect(page.url()).not.toContain("slug=capabilities%2Fcart");
  expect(nativeDialogs, "삭제가 브라우저 확인창을 띄웠다").toEqual([]);
});
