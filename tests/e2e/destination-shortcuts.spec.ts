import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 목적지 이동 단축키 — **키보드만으로 일곱 목적지를 다 간다.**
 *
 * 이 spec 이 곧 그 기능의 값어치다. 소유자가 요구한 것이 *"단축키만으로도 다
 * 이동하면서 테스트 가능"* 이었고, 그 문장을 증명하는 자리가 여기다. 통과하면
 * 사람도 에이전트도 좌표를 찍지 않고 이 앱을 돌아다닐 수 있다는 뜻이다.
 *
 * ⚠️ **좌표로 클릭해 확인하지 않는다.** 그렇게 하면 이 spec 이 증명하려는 것과
 * 반대되는 방식으로 자기를 증명하는 셈이다.
 */

/** 표와 같은 순서 — 표가 바뀌면 여기도 바뀌어야 하고, 계약 시험이 그것을 잡는다. */
const DESTINATIONS = [
  { key: "m", path: "/topology" },
  { key: "d", path: "/docs" },
  { key: "s", path: "/ontology/studio" },
  { key: "i", path: "/ontology/insights" },
  { key: "p", path: "/projects" },
  { key: "k", path: "/skills" },
  { key: "g", path: "/git" },
] as const;

async function go(page: import("@playwright/test").Page, key: string) {
  await page.keyboard.press("g");
  await page.keyboard.press(key);
}

/**
 * ⚠️ **공방은 도착하면 막는 선택 창을 띄운다** (2026-08-09, 이 spec 이 찾아냈다).
 *
 * `aria-label="공방을 어떻게 시작할지 고르기"` 가 `aria-modal="true"` 로 떠서,
 * 이동 단축키가 **규칙대로** 거부된다(막는 표면이 있으면 뒤 화면을 바꾸지 않는다).
 * 즉 키보드만 쓰는 사람은 공방에 도착한 순간 **다른 곳으로 못 나간다** — 먼저
 * Esc 를 눌러야 한다.
 *
 * 훅을 고쳐서 우회하지 않는다. 모달이 안 막으면 그건 모달이 아니고, 그 금지는
 * 헌장에 있다. **이건 공방 첫 화면의 설계 질문**이라 소유자 몫으로 넘긴다 —
 * 여기서는 사실을 그대로 적고, 순회가 실제 사람이 하는 것과 같은 순서를 밟게 한다.
 */
async function dismissBlockingSurface(page: import("@playwright/test").Page) {
  const visibleModal = page.locator('[aria-modal="true"]:visible').first();
  if (await visibleModal.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(visibleModal).toBeHidden({ timeout: 3_000 });
  }
}

test.describe("목적지 이동 단축키", () => {
  // 폭을 고정한다. 기본 폭(1280×720)에서는 레일과 하단 탭바가 **둘 다** 설정
  // 트리거를 갖고 있고, 지도 INDEX 의 검색칸은 아예 그려지지 않는다(실측:
  // `input` 0개). 폭이 흔들리면 이 spec 이 기능이 아니라 폭을 재게 된다.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
  });

  test("G + 글자로 일곱 목적지를 전부 간다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");

    for (const { key, path } of DESTINATIONS) {
      const expected = new RegExp(`/ko${path.replace(/\//g, "\\/")}/?($|\\?)`);
      /*
       * **한 번 더 시도한다.** 막는 표면은 도착 직후 마운트되면서 뜨는 것이 있어
       * (공방의 시작 선택), 닫기를 «누르기 전에» 확인해도 그 사이에 뜰 수 있다.
       * 그러면 첫 시도가 규칙대로 거절되고 순회가 간헐적으로 깨진다 — 실제로 그
       * 흔들림을 봤다. 재시도는 결함을 감추는 것이 아니라 **경합을 없애는 것**이고,
       * 두 번째 시도도 안 가면 그때는 진짜로 실패한다.
       */
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await dismissBlockingSurface(page);
        await go(page, key);
        try {
          await expect(page).toHaveURL(expected, { timeout: 3_000 });
          break;
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }
      await expect(page, `G ${key.toUpperCase()} 가 ${path} 로 가지 않았다`).toHaveURL(expected);
    }
  });

  /**
   * 공회전 차단 — 위 시험이 «어차피 그 주소에 있어서» 통과할 수 있다. 한 목적지에서
   * **다른** 목적지로 실제로 옮겨 갔는지 한 번 못박는다.
   */
  test("이동 전후의 주소가 실제로 다르다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    const before = page.url();
    await go(page, "p");
    await expect(page).toHaveURL(/\/ko\/projects\/?($|\?)/);
    expect(page.url(), "주소가 안 바뀌었다").not.toBe(before);
  });

  /*
   * 「입력 중에는 이동하지 않는다」는 **여기서 재지 않는다** — 볼트를 안 고른 이
   * 앱에는 화면에 입력칸이 없고(네 라우트 실측 0개), ⌘K 팔레트로 얻은 입력칸은
   * 그 팔레트가 `aria-modal` 이라 모달 판정이 먼저 걸려 **입력 판정을 지워도
   * 초록이었다**. 조건이 서로를 가리면 게이트가 아니다.
   * 그 조건은 `src/shared/lib/use-destination-shortcuts.test.ts` 가 잰다.
   */

  /**
   * 잠그는 성질은 **「모달이 떠 있는 동안 뒤 화면이 안 바뀐다」** 하나다.
   * 「모달이 계속 떠 있나」는 그 표면 자신의 키 동작이라 여기서 재지 않는다 —
   * 남의 성질을 끼워 넣으면 그쪽이 바뀔 때 이 spec 이 엉뚱하게 터진다.
   *
   * 모달은 **키보드로 여는 것**을 고른다(단축키 시트). 설정 시트를 클릭으로 열면
   * 트리거가 폭에 따라 둘이라 간헐 실패했다 — 그리고 이 spec 의 취지가 「키보드만
   * 으로 된다」이므로 마우스로 상태를 만드는 것 자체가 어울리지 않는다.
   */
  test("막는 표면이 열려 있으면 이동하지 않는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await dismissBlockingSurface(page);
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("?");
    const modal = page.locator('[aria-modal="true"]:visible').first();
    await expect(modal, "단축키 시트가 안 열렸다").toBeVisible({ timeout: 5_000 });

    const before = page.url();
    await go(page, "p");
    await page.waitForTimeout(600);
    expect(page.url(), "모달이 떠 있는데 뒤 화면이 바뀌었다").toBe(before);
  });

  test("리더를 누른 지 오래되면 글자만으로는 이동하지 않는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    const before = page.url();
    await page.keyboard.press("g");
    await page.waitForTimeout(2_000); // NAV_LEADER_WINDOW_MS 보다 길게
    await page.keyboard.press("p");
    await page.waitForTimeout(600);
    expect(page.url(), "시간 제한이 안 걸렸다").toBe(before);
  });

  test("단축키 시트가 일곱 목적지를 전부 안내한다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await dismissBlockingSurface(page);
    // `?` 는 지도(HomePage)가 `useTypingShortcuts` 로 잇는다. 입력칸에 초점이
    // 있으면 안 먹으므로 본문을 한 번 눌러 초점을 옮긴다.
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("?");
    const sheet = page.getByTestId("shortcut-sheet-scroll");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const text = await sheet.innerText();
    for (const { key } of DESTINATIONS) {
      expect(
        text.toUpperCase(),
        `시트에 G ${key.toUpperCase()} 안내가 없다 — 발견할 수 없는 단축키는 기능이 아니다`,
      ).toContain(key.toUpperCase());
    }
  });
});
