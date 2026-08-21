import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 목적지 이동 단축키 — **키보드만으로 여섯 목적지를 다 간다.**
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
  { key: "i", path: "/ontology/insights" },
  { key: "p", path: "/projects" },
  { key: "a", path: "/agents" },
  { key: "g", path: "/git" },
] as const;

async function go(page: import("@playwright/test").Page, key: string) {
  await page.keyboard.press("g");
  await page.keyboard.press(key);
}

/** 도착 직후 나타난 막는 표면은 실제 사용자처럼 Escape로 닫고 계속 순회한다. */
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

  test("G + 글자로 여섯 목적지를 전부 간다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");

    for (const { key, path } of DESTINATIONS) {
      const expected = new RegExp(`/ko${path.replace(/\//g, "\\/")}/?($|\\?)`);
      /*
       * **한 번 더 시도한다.** 막는 표면은 도착 직후 마운트되면서 뜨는 것이 있어
       * 닫기를 «누르기 전에» 확인해도 그 사이에 뜰 수 있다.
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
    /*
     * ⚠️ **화면이 서기 전에 키를 누르면 안 된다** (2026-08-17 검사 전수조사).
     *
     * 이 시험만 바로 위 순회 시험이 이미 갖고 있던 둘을 안 갖고 있었다 —
     * 막는 표면 걷기와 재시도. 그래서 도착 직후 마운트되는 표면과 경합해
     * CI 에서 간헐적으로 실패했다(2026-08-17 06:54Z 실행). 옆 시험의 주석이
     * 이미 그 이유를 적어 두었다: *"재시도는 결함을 감추는 것이 아니라
     * 경합을 없애는 것"*. 같은 처방을 쓴다.
     */
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    const before = page.url();
    const expected = /\/ko\/projects\/?($|\?)/;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dismissBlockingSurface(page);
      await go(page, "p");
      try {
        await expect(page).toHaveURL(expected, { timeout: 3_000 });
        break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    await expect(page).toHaveURL(expected);
    expect(page.url(), "주소가 안 바뀌었다").not.toBe(before);
  });

  test("G A 는 살아 있고, 은퇴한 G K · G S 는 어디에도 가지 않는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);

    await go(page, "a");
    await expect(page, "살아 있는 단축키가 먼저 성공해야 G K 무동작 판정이 유효하다").toHaveURL(
      /\/ko\/agents\/?($|\?)/,
      { timeout: 5_000 },
    );

    const before = page.url();
    for (const retired of ["k", "s"]) {
      await go(page, retired);
      await page.waitForTimeout(600);
      expect(page.url(), `은퇴한 G ${retired.toUpperCase()} 가 다른 화면으로 이동했다`).toBe(before);
    }
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
    /*
     * ⚠️ **「안 간다」를 재려면 먼저 「간다」를 증명해야 한다** (2026-08-17
     * 검사 전수조사).
     *
     * 이 시험이 재는 것은 「주소가 안 바뀐다」인데, 단축키가 **아예 안 붙은**
     * 상태에서도 주소는 안 바뀐다. 즉 기능이 통째로 죽어도 초록이었다 —
     * 부정을 재는 검사의 전형적인 구멍이다. 같은 세션에서 먼저 실제로 옮겨
     * 가 보고, 그다음 시간 제한을 잰다.
     */
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    await go(page, "p");
    await expect(page, "단축키 자체가 안 먹는다 — 아래 판정이 무의미해진다").toHaveURL(
      /\/ko\/projects\/?($|\?)/,
      { timeout: 5_000 },
    );

    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    const before = page.url();
    await page.keyboard.press("g");
    await page.waitForTimeout(2_000); // NAV_LEADER_WINDOW_MS 보다 길게 — 이 대기가 곧 시험 대상이다
    await page.keyboard.press("p");
    await page.waitForTimeout(600);
    expect(page.url(), "시간 제한이 안 걸렸다").toBe(before);
  });

  test("단축키 시트가 여섯 목적지를 전부 안내한다", async ({ page }) => {
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
