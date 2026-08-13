import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **이름 변경 뒤 주소가 새 이름을 따라간다** (2026-08-13 걷기에서 발견).
 *
 * 이름 변경 핸들러가 선택(`setSelectedSlug`)만 옮기고 주소(`?slug=`)와 활성
 * 기억은 옛 주소에 남겼다. 볼트 매니페스트가 갱신되어 옛 주소가 사라지는
 * 순간, 「URL 이 요청한 문서가 없다」 판정이 걸려 **방금 자기가 바꾼 이름을
 * 못 찾았다는 경고**가 떴다 — 이름 변경은 성공했는데 화면은 실패를 알렸다.
 *
 * 두 가지를 잰다: ① 이름 변경 뒤 「못 찾았어요」 배너가 (매니페스트 갱신
 * 공백을 포함해) 끝까지 안 뜬다 ② 주소창의 `?slug=` 가 새 이름을 가리킨다 —
 * 그 주소를 복사해 공유하면 받는 사람도 같은 문서로 와야 한다.
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

  // 팔레트 → 이름 변경 명령 (prompt 는 위 dialog 핸들러가 새 주소로 답한다)
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(600);
  await page.keyboard.type("이름 변경");
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");

  // 매니페스트 갱신 공백(웹 폴링 1.5s/5s)을 넘겨 가며 배너가 한 번도 안
  // 뜨는지 본다 — 공백 중 한 프레임만 떠도 거짓 경고다.
  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(500);
    expect(await banner.count(), `이름 변경 ${(i + 1) * 0.5}s 후 거짓 「못 찾았어요」 경고`).toBe(0);
  }

  // 주소가 새 이름을 가리킨다 — 문서도 여전히 열려 있다.
  expect(page.url()).toContain("slug=capabilities%2Fcart-renamed");
  await expect(page.getByText("장바구니").first()).toBeVisible();
});
