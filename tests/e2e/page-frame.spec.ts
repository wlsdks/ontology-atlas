import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **목록형 목적지 셋의 제목이 같은 자리에 선다.**
 *
 * ## 무엇이 났나 (2026-08-09, 소유자 지적)
 *
 * > *"인사이트, 프로젝트, 스킬 모두 상단 공백이 동일해야하는데 … 디자인 시스템
 * > 있는거 아녔나? 왜 다 다르지?"*
 *
 * 재 보니 제목까지의 거리가 **32 / 48 / 20px** 이었다. 그리고 어긋난 축이 상단만이
 * 아니었다 — 좌우 인셋(40/40/32)과 최대 폭(1600/1600/1400)까지 셋이 다 달랐고,
 * 같은 1600 이 CSS 토큰과 JS 상수 **두 곳에** 적혀 있었다.
 *
 * ## 왜 클래스가 아니라 실측인가
 *
 * 48px 은 여백 하나가 아니라 **합**이다: 상단 패딩 40 + (헤더 행 36 − 제목 행간 28).
 * 그래서 `PAGE_FRAME` 문자열만 확인하면 헤더 행 높이가 빠져도 통과한다 — 그 +8 은
 * 그려 봐야 보인다.
 *
 * ⚠️ 값을 못박지 않고 **셋이 서로 같은지**만 본다. 기준값을 리터럴로 적으면 램프를
 * 정당하게 옮길 때 이 시험이 먼저 터지고, 그러면 다음 사람이 규격 쪽을 되돌린다
 * (`design-gates.md` 가 이미 적어 둔 실패 2건과 같은 모양).
 */

const MEMBERS = [
  { route: "/ko/projects/", title: "프로젝트" },
  { route: "/ko/ontology/insights/", title: "그래프 인사이트" },
  { route: "/ko/skills/", title: "스킬" },
] as const;

async function measureHeader(page: import("@playwright/test").Page, route: string) {
  await page.goto(`${route}?guides=off`);
  const heading = page.locator("main h1").first();
  await expect(heading).toBeVisible({ timeout: 15_000 });
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const h1 = main.querySelector("h1")!;
    // **틀 요소를 구조로 찾지 않는다.** 화면마다 감싼 깊이가 달라서
    // `main > div` 같은 셀렉터는 한 화면에서만 맞는다(실측: 인사이트에서 null).
    // 틀의 정의는 「최대 폭을 가진 조상」이므로 그걸로 찾는다.
    // ⚠️ `main` 자신이 틀인 화면도 있다(인사이트) — 멈추는 지점을 `main` 으로
    // 잡으면 그 화면만 `null` 이 나오고, 그건 결함이 아니라 **못 잰 것**이다.
    let column: HTMLElement | null = null;
    for (let node: HTMLElement | null = h1.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).maxWidth !== "none") {
        column = node;
        break;
      }
      if (node === main) break;
    }
    const cs = column ? getComputedStyle(column) : null;
    // **틀이 소유한 것만 잰다** — `main` 위쪽부터 재면 틀 밖의 것이 섞인다.
    // 실측(768): 프로젝트 96 / 인사이트 40 / 스킬 48 로 갈렸는데, 원인은 틀이
    // 아니라 **모바일 설정 줄의 위치**였다(프로젝트는 `main` 안, 인사이트는 밖,
    // 스킬은 아예 없음). 그건 이 규격이 답하는 질문이 아니다 — 섞어서 재면
    // 이 게이트가 엉뚱한 것을 잡고, 다음 사람은 틀 쪽을 되돌린다.
    return {
      titleY: column
        ? Math.round(h1.getBoundingClientRect().top - column.getBoundingClientRect().top)
        : null,
      padTop: cs?.paddingTop ?? null,
      padLeft: cs?.paddingLeft ?? null,
    };
  });
}

test.describe("페이지 틀", () => {
  test("세 목적지의 제목이 같은 y 에 선다 (1280 · 768)", async ({ page }) => {
    await seedFirstRunSeen(page);
    for (const width of [1280, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const measured: { title: string; titleY: number | null; padLeft: string | null }[] = [];
      for (const member of MEMBERS) {
        const m = await measureHeader(page, member.route);
        measured.push({ title: member.title, titleY: m.titleY, padLeft: m.padLeft });
      }
      expect(measured.length, "라우트를 하나도 못 재면 이 시험이 헛돈다").toBe(3);
      expect(
        measured.filter((m) => m.titleY === null).map((m) => m.title),
        "틀 요소를 못 찾은 라우트가 있다 — 「못 쟀다」를 「통과」로 세지 않는다",
      ).toEqual([]);

      const ys = new Set(measured.map((m) => m.titleY));
      expect(
        ys.size,
        `${width}px 에서 제목 y 가 갈렸다: ` +
          measured.map((m) => `${m.title} ${m.titleY}`).join(" / "),
      ).toBe(1);

      const lefts = new Set(measured.map((m) => m.padLeft));
      expect(
        lefts.size,
        `${width}px 에서 좌우 인셋이 갈렸다: ` +
          measured.map((m) => `${m.title} ${m.padLeft}`).join(" / "),
      ).toBe(1);
    }
  });
});
