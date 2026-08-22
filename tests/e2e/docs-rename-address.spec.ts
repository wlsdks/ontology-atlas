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
  page.on("dialog", (d) => void d.accept("capabilities/cart-renamed"));
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.getByTestId("first-run-starter-open").click();
  await page.waitForTimeout(500);
  const pick = page.getByTestId("vault-guide-pick-existing");
  if (await pick.isVisible().catch(() => false)) await pick.click();
  await page.waitForTimeout(2500);

  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByText("capabilities", { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText("장바구니", { exact: true }).first().click();
  await page.waitForTimeout(1200);

  // Palette → rename command (the dialog handler above answers the prompt with the new address)
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(600);
  await page.keyboard.type("이름 변경");
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");

  // Watches across the manifest-refresh gap (web polling at 1.5s/5s) for the
  // banner never appearing — a single frame during the gap is already a false
  // warning.
  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(500);
    expect(await banner.count(), `이름 변경 ${(i + 1) * 0.5}s 후 거짓 「못 찾았어요」 경고`).toBe(0);
  }

  // The address points at the new name, and the document is still open.
  expect(page.url()).toContain("slug=capabilities%2Fcart-renamed");
  await expect(page.getByText("장바구니").first()).toBeVisible();
});

/**
 * Deletion had the same illness (measured in the 2026-08-13 walkthrough): for a
 * document the user deleted through a confirmation dialog, the app reported "not
 * found — try a different workspace". An address the user just deleted is not a
 * broken link from outside.
 */
test("삭제 뒤 — 경고가 안 뜨고 주소가 지운 문서를 가리키지 않는다", async ({ page }) => {
  test.setTimeout(150_000);
  page.on("dialog", (d) => void d.accept());
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.getByTestId("first-run-starter-open").click();
  await page.waitForTimeout(500);
  const pick = page.getByTestId("vault-guide-pick-existing");
  if (await pick.isVisible().catch(() => false)) await pick.click();
  await page.waitForTimeout(2500);

  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByText("capabilities", { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText("장바구니", { exact: true }).first().click();
  await page.waitForTimeout(1200);

  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(600);
  await page.keyboard.type("삭제");
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");

  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(500);
    expect(await banner.count(), `삭제 ${(i + 1) * 0.5}s 후 거짓 「못 찾았어요」 경고`).toBe(0);
  }
  expect(page.url()).not.toContain("slug=capabilities%2Fcart");
});
