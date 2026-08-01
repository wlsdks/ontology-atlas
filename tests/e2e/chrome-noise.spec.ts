import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **크롬은 자기가 안 그리는 것을 화면에 부르지 않는다** (2026-08-01 신설).
 *
 * 소유자가 시연 영상 촬영 중에 잡았다 — *"마우스 올려서 나오는 이상한 툴팁이랑
 * 각 탭 선택할때마다 … 뭔가 박스가 생김"*. 둘 다 **OS/브라우저가 그리는 것**이라
 * 우리 토큰도 모션도 아니고, 우리 화면 위에 얹힌다.
 *
 * 1. **네이티브 툴팁** — 레일 목적지에 `title` 이 달려 있었다. 그 라벨은 아이콘
 *    바로 아래 이미 보이므로 툴팁은 정보를 하나도 안 더하면서 라벨을 회색
 *    상자로 덮었다. 아이콘만 있는 하단 유틸 타일은 예외다 — 거기서는 `title`
 *    이 유일한 이름이다.
 * 2. **프로그램적 포커스 링** — 라우트가 바뀌면 `RouteFocusManager` 가 목적지
 *    `h1` 에 `tabindex="-1"` 을 붙이고 포커스한다(스크린리더를 위한 정당한
 *    패턴). WebKit 이 거기에 기본 포커스 링을 그려서 제목 둘레에 파란 상자가
 *    남았다. `tabindex="-1"` 은 Tab 으로 도달할 수 없으므로 링을 지워도 키보드
 *    사용자가 잃는 신호가 없다.
 *
 * 값 lint 로는 원리적으로 못 잡는다 — 하나는 **속성의 존재**이고 다른 하나는
 * **브라우저 기본 스타일**이라 우리 코드에 리터럴이 없다.
 */
test.describe("크롬 소음", () => {
  test("레일 목적지에 네이티브 툴팁이 없다 — 라벨이 이미 보인다", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/", { waitUntil: "networkidle" });

    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="app-nav-rail-item-"]')]
        .filter((el) => el.getAttribute("title"))
        .map((el) => `${el.getAttribute("data-testid")} title="${el.getAttribute("title")}"`),
    );
    expect(
      offenders,
      "레일 목적지에 `title` 이 있다 — 네이티브 툴팁이 그 아래 보이는 라벨을 덮는다",
    ).toEqual([]);

    // 탐지기 무장 확인 — 목적지를 하나도 못 찾았으면 위 단언은 공회전이다.
    const count = await page.locator('[data-testid^="app-nav-rail-item-"]').count();
    expect(count, "레일 목적지를 하나도 못 찾았다").toBeGreaterThan(3);
  });

  test("라우트 이동이 제목에 포커스 링을 남기지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/", { waitUntil: "networkidle" });
    await page.getByTestId("app-nav-rail-item-insights").click();
    await page.waitForURL(/insights/);
    await page.waitForTimeout(800);

    const ring = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      if (!h1) return { found: false, focused: false, outline: "" };
      const cs = getComputedStyle(h1);
      return {
        found: true,
        focused: document.activeElement === h1,
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      };
    });

    expect(ring.found, "목적지에 h1 이 없다").toBe(true);
    // 포커스는 **옮겨져 있어야** 한다 — 링만 지운 것이지 접근성을 지운 게 아니다.
    expect(ring.focused, "라우트 이동이 제목으로 포커스를 옮기지 않았다").toBe(true);
    expect(
      ring.outline,
      `제목에 포커스 링이 남았다(${ring.outline}) — 마우스로만 이동한 사람에게 "여기 입력하라"는 거짓 신호다`,
    ).toMatch(/none|0px/);
  });
});
