import { expect, test } from "@playwright/test";

/**
 * 인사이트 「할 일」 — **한 화면이 같은 일을 두 수로 세지 않는다.**
 *
 * ## 무엇이 있었나 (2026-08-07 실측 · 샘플 볼트)
 *
 * 탭 배지가 「할 일 **7**」이고 **바로 아래** 묶음 머리가 「**8**」이었다. 차이는
 * 중복 쌍 1건 — 두 수가 각자 **손으로 관리하는 섹션 목록**에서 나왔고, 중복이
 * 판정 쪽에만 빠져 있었다.
 *
 * 이 화면의 판정 모듈은 자기 머리말에 이미 같은 사고를 적어 두고 있었다(#63:
 * 「할 일 0」 + "그래프가 건강합니다" + 「누락된 연결 1」이 동시에 떴다). 그때
 * `meaningGaps` 를 끼워 넣어 값을 맞췄지만 **목록이 둘이라는 구조는 그대로**
 * 였고, 다음 섹션(중복)에서 같은 병이 다시 났다.
 *
 * ## 무엇이 이 검사를 대신할 수 없나
 *
 * 값은 이제 `Record<QueueSectionKey, number>` 하나에서 갈라져 나가므로
 * **섹션을 더하면 타입 검사가 먼저 막는다.** 그게 1차 방어다. 이 검사가 맡는
 * 것은 그다음 — **화면에 실제로 같은 수가 찍히는가**. 배지가 어느 값을 읽는지,
 * 어느 조건에서 0으로 덮이는지는 렌더에서만 드러난다(실제로 「개념이 0이면
 * 배지도 0」 같은 분기가 이 화면에 있다).
 */

test.describe("인사이트 할 일 — 탭 배지와 묶음 배지가 같은 수를 말한다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("탭 배지 = 묶음 배지 합 + 수리 큐의 차단 신호", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);

    const seen = await page.evaluate(() => {
      const text = (el: Element | null) => (el?.textContent ?? "").trim();
      const num = (s: string) => {
        const m = /(\d+)/.exec(s);
        return m ? Number(m[1]) : null;
      };

      const tab = [...document.querySelectorAll("button")].find((b) => /^할\s*일/.test(text(b)));
      const groups = [...document.querySelectorAll('[data-testid^="do-next-group-"]')]
        .filter((el) => (el.getAttribute("data-testid") ?? "").endsWith("-count"))
        .map((el) => num(text(el)) ?? 0);

      // 수리 큐의 차단 신호(분리된 섬 · 누락된 연결)는 큐 섹션이 아니라 별도
      // 신호라, 탭 배지에는 들어가고 묶음 배지에는 안 들어간다. 화면에서 그
      // 둘을 읽어 식의 양변을 맞춘다.
      //
      // ⚠️ **`num(부모 텍스트)` 로 읽으면 안 된다** — 첫 시도가 그랬고, 더 위
      // 컨테이너를 잡아 개념 수 **112** 를 차단 신호로 읽었다. 칩 하나의 모양
      // (`"0 분리된 섬"`)을 통째로 맞춰서, 못 맞추면 **조용히 0** 이 아니라
      // 아래 개수 단언에서 빨개지게 한다.
      const CHIP = /^(\d+)\s*(분리된 섬|누락된 연결)$/;
      const repair = [...document.querySelectorAll("*")]
        .filter((el) => el.childElementCount === 0 && /분리된 섬|누락된 연결/.test(text(el)))
        .map((el) => CHIP.exec((el.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim()))
        .filter(Boolean)
        .map((m) => Number(m![1]));

      return { tab: num(text(tab ?? null)), groups, repair };
    });

    // 공회전 차단 — 배지를 못 읽었으면 아래 등식은 「맞아서」가 아니라 「안 봐서」다.
    expect(seen.tab, "탭 배지를 못 읽었다 — 셀렉터가 낡았다").not.toBeNull();
    expect(seen.groups.length, "묶음 배지를 하나도 못 찾았다").toBeGreaterThan(0);
    expect(seen.tab, "샘플 볼트인데 할 일이 0이다 — 이 검사가 헛돈다").toBeGreaterThan(0);
    // 차단 신호 칩 둘을 못 읽으면 아래 등식의 오른변이 조용히 작아진다.
    expect(seen.repair.length, "수리 큐의 차단 칩(분리된 섬 · 누락된 연결)을 못 읽었다").toBe(2);

    const groupSum = seen.groups.reduce((a, b) => a + b, 0);
    const blocking = seen.repair.reduce((a, b) => a + b, 0);

    expect(
      seen.tab,
      `탭 배지(${seen.tab}) ≠ 묶음 배지 합(${groupSum}) + 차단 신호(${blocking}). ` +
        "같은 일을 두 수로 세고 있다 — 섹션 총계는 " +
        "`queueSectionTotals` 한 곳에서만 갈라져 나가야 한다",
    ).toBe(groupSum + blocking);
  });
});
