import { expect, test } from "@playwright/test";

import { openStubbedSkillFolder, stubSkillFolder } from "./skills-folder-stub";
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
  { route: "/ko/projects/", title: "프로젝트", openFolder: false },
  { route: "/ko/ontology/insights/", title: "그래프 인사이트", openFolder: false },
  // 스킬은 **폴더를 연 상태**로 잰다 — 빈 상태에서는 이 화면이 무대가 된다(위 머리말).
  { route: "/ko/skills/", title: "스킬", openFolder: true },
] as const;

async function measureHeader(
  page: import("@playwright/test").Page,
  route: string,
  openFolder = false,
) {
  await page.goto(`${route}?guides=off`);
  if (openFolder) await openStubbedSkillFolder(page);
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
  /**
   * ⚠️ **이 성질은 「목록을 그리는 상태」의 것이다** (2026-08-12 개정).
   *
   * 이 시험이 생긴 계기는 소유자 지적 *"스킬 탭은 왜 혼자 … 다른 탭과 느낌이
   * 다르고"* 였고, 그건 **머리(제목 + 수 + 설명)의 문법**에 대한 말이었다. 그
   * 문법은 그대로다.
   *
   * 그런데 스킬은 **아직 아무 폴더도 열지 않았을 때** 머리 행을 쓰지 않는다 —
   * 그때 이 화면의 일은 하나(「폴더를 고르세요」)이고, 소유자가 조립대 입구를
   * 가리키며 그 전략을 지시했다(*"우측/하단 공백이 너무 심하고 … 이렇게 조립대같은
   * 전략을 쓰던지"*). 실측이 그 지적과 같았다: 잉크 상자 `1368×313`, 아래로 531px
   * (화면의 59%)이 비어 있었다.
   *
   * 그래서 스킬은 이 표에서 **폴더를 연 상태로** 재야 한다. 빈 상태의 정렬은
   * `skills-inventory.spec.ts` 의 「빈 상태는 화면 가운데에 세워진다」가 잠근다 —
   * 성질을 지우는 것이 아니라 **각자 맞는 상태에서 재는 것**이다.
   */
  test("세 목적지의 제목이 같은 y 에 선다 (1280 · 768)", async ({ page }) => {
    // 스킬을 목록 상태로 재려면 스텁이 **첫 이동 전에** 걸려 있어야 한다.
    await stubSkillFolder(page, {
      "packA/skills/report/SKILL.md":
        "---\nname: report\ndescription: Build a quarterly revenue report\n---\n",
    });
    await seedFirstRunSeen(page);
    for (const width of [1280, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const measured: { title: string; titleY: number | null; padLeft: string | null }[] = [];
      for (const member of MEMBERS) {
        const m = await measureHeader(page, member.route, member.openFolder);
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
