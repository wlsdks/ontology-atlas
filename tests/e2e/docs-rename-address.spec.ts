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

/**
 * 볼트를 열고 문서함에서 「장바구니」 문서를 여는 데까지.
 *
 * ⚠️ **고정 대기를 값 판정으로 바꿨다** (2026-08-17 검사 전수조사). 종전에는
 * 이 구간이 `waitForTimeout` 만으로 10.9초씩(두 시험 합쳐 21.8초, 저장소 최대)
 * 자고 나서 키를 눌렀다. 그 시간은 **빠른 기계의 값**이고, 느린 기계에서는
 * 아직 안 뜬 것을 누르게 된다. 기다릴 것이 있으면 그것을 기다린다.
 */
async function openCartDoc(page: import("@playwright/test").Page) {
  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  const starter = page.getByTestId("first-run-starter-open");
  await expect(starter).toBeVisible({ timeout: 30_000 });
  // dev 오버레이가 클릭을 가로채는 것만 걷는다(제품 코드가 아니다).
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await starter.click();
  const pick = page.getByTestId("vault-guide-pick-existing");
  await expect(pick).toBeVisible({ timeout: 30_000 });
  await pick.click();

  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  // 볼트가 실제로 읽혔나 — 폴더가 보이면 트리가 섰다는 뜻이다.
  const folder = page.getByText("capabilities", { exact: true }).first();
  await expect(folder, "문서함이 볼트를 읽지 못했다").toBeVisible({ timeout: 30_000 });
  await folder.click();
  const doc = page.getByText("장바구니", { exact: true }).first();
  await expect(doc).toBeVisible({ timeout: 30_000 });
  await doc.click();
  // 문서가 실제로 열렸나 — 주소가 그 문서를 가리켜야 한다.
  await expect(page, "문서를 눌렀는데 주소가 그 문서를 가리키지 않는다").toHaveURL(
    /slug=capabilities%2Fcart(&|$)/,
    { timeout: 30_000 },
  );
}

test("이름 변경 뒤 — 경고가 안 뜨고 주소가 새 이름을 가리킨다", async ({ page }) => {
  test.setTimeout(150_000);
  page.on("dialog", (d) => void d.accept("capabilities/cart-renamed"));
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await openCartDoc(page);

  // 팔레트 → 이름 변경 명령 (prompt 는 위 dialog 핸들러가 새 주소로 답한다)
  await page.keyboard.press("Meta+k");
  const palette = page.locator('[aria-modal="true"]:visible').first();
  await expect(palette, "팔레트가 안 열렸다").toBeVisible({ timeout: 15_000 });
  await page.keyboard.type("이름 변경");
  await page.waitForTimeout(400); // 검색 결과가 좁혀질 틈 — 첫 항목이 바뀔 수 있다
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

/**
 * 삭제도 같은 병이었다 (2026-08-13 걷기 실측): 사용자가 확인 대화상자까지
 * 거쳐 지운 문서를, 앱이 「못 찾았어요 — 문서함을 바꿔 보라」고 알렸다.
 * 자기가 방금 지운 주소는 밖에서 온 깨진 링크가 아니다.
 */
test("삭제 뒤 — 경고가 안 뜨고 주소가 지운 문서를 가리키지 않는다", async ({ page }) => {
  test.setTimeout(150_000);
  page.on("dialog", (d) => void d.accept());
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await openCartDoc(page);

  await page.keyboard.press("Meta+k");
  const palette = page.locator('[aria-modal="true"]:visible').first();
  await expect(palette, "팔레트가 안 열렸다").toBeVisible({ timeout: 15_000 });
  await page.keyboard.type("삭제");
  await page.waitForTimeout(400); // 검색 결과가 좁혀질 틈
  await page.keyboard.press("Enter");

  const banner = page.getByText(/못 찾았어요/);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(500);
    expect(await banner.count(), `삭제 ${(i + 1) * 0.5}s 후 거짓 「못 찾았어요」 경고`).toBe(0);
  }
  /*
   * ⚠️ **「안 가리킨다」만으로는 부족하다** (2026-08-17 검사 전수조사).
   * 종전에는 이 한 줄이 끝이었는데, 팔레트가 안 열려서 **아무 일도 안 일어나도**
   * `?slug=` 가 애초에 안 붙으니 통과했다. 위 `openCartDoc` 이 「눌렀을 때
   * 주소가 그 문서를 가리킨다」를 이미 단언하므로, 여기서는 그 상태에서
   * **실제로 벗어났는지**를 본다.
   */
  await expect(page, "삭제했는데 주소가 여전히 그 문서를 가리킨다").not.toHaveURL(
    /slug=capabilities%2Fcart(&|$)/,
    { timeout: 15_000 },
  );
  await expect(page.getByText("장바구니"), "지운 문서가 아직 화면에 있다").toHaveCount(0);
});
