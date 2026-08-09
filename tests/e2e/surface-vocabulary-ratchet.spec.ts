import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **표면 어휘 래칫 — 상자의 생김새가 더 늘지 못하게 막는다.**
 *
 * ## 무엇을 쟀나 (2026-08-09)
 *
 * 이 저장소에는 누르는 것(`controlClass`) · 입력(`fieldClass`) · 페이지 칸
 * (`page-frame`)의 규격이 있다. 그런데 **그 사이의 상자들** — 카드 · 패널 · 절 ·
 * 안내 — 에는 주인이 없다. `surface.tsx` 는 이름과 달리 **모션만** 소유한다
 * (등장·퇴장 클래스).
 *
 * 그래서 10개 화면에서 그려진 상자 76개를 재니 **서로 다른 조합이 30종**이었다.
 * 값은 전부 램프 안이다(반경 6/9/12px, 색은 전부 토큰) — 어긋난 것은 **조합**이다.
 * 같은 9px 카드가 `border-soft + panel` 이기도 하고 `border-soft + overlay-1`
 * 이기도 하고 `border-soft + rgba(16,17,24,.96)` 이기도 하다.
 *
 * ## 왜 지금 30을 4로 줄이지 않나
 *
 * 어느 조합이 어느 역할로 접히는지는 자리마다 **디자인 판정**이고, 파일 수십 개를
 * 건드린다. 이 저장소가 그럴 때 쓰는 방법이 래칫이다 — 오늘 값을 상한으로 박아
 * **더 늘지 못하게** 하고, 줄이는 것은 언제든 환영한다.
 *
 ## ⚠️ 이 래칫을 프로브할 때 (2026-08-09 에 두 번 헛발질했다)
 *
 * **조합을 바꿔치기하면 안 잡힌다 — 더해야 잡힌다.** 어떤 조합이 한 화면에만
 * 있으면, 그것을 새 조합으로 바꾸는 순간 −1 +1 이라 총수가 그대로다. 실제로
 * 그렇게 두 번 「통과」를 보고 게이트를 의심했는데 게이트가 옳았다.
 *
 * 그리고 **바꾼 뒤 빌드가 실제로 됐는지 확인한다** — `pnpm build` 출력을 죽여
 * 놓으면 실패한 빌드의 옛 결과를 재고 「안 잡힌다」고 결론 내린다.
 *
 * ⚠️ **줄었으면 상한도 같이 내린다.** 안 내리면 래칫이 다시 느슨해져서, 애써 줄인
 * 만큼의 여유가 다음 사람에게 그대로 반납된다.
 */

/** 오늘 실측(1440×900, 10개 화면). 줄이는 것은 자유, 늘리려면 규격을 세워라. */
const BASELINE_SURFACE_COMBOS = 30;

const ROUTES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/storefront/",
  "/ko/skills/",
  "/ko/git/",
  "/ko/",
  "/ko/download/",
] as const;

test("표면 조합이 늘지 않는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const combos = new Set<string>();
  let painted = 0;

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`);
    await page.waitForTimeout(900);
    // 스킬은 예시를 켜야 채워진 화면이 된다 — 빈 화면만 재면 그 목적지를 안 본 셈이다.
    if (route === "/ko/skills/") {
      await page
        .getByTestId("skills-open-sample")
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(500);
    }

    const found = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        // 작은 조각·안 보이는 것은 표면이 아니다.
        if (box.width < 40 || box.height < 24) continue;
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (Number(style.opacity) < 0.05) continue;
        if (box.top >= innerHeight || box.bottom <= 0) continue;

        const hasBorder = style.borderTopWidth !== "0px" && style.borderTopStyle !== "none";
        const hasBackground = style.backgroundColor !== "rgba(0, 0, 0, 0)";
        const radius = style.borderTopLeftRadius;
        if (radius === "0px" || (!hasBorder && !hasBackground)) continue;

        out.push(
          `${radius} | ${hasBorder ? style.borderTopColor : "none"} | ${
            hasBackground ? style.backgroundColor : "none"
          }`,
        );
      }
      return out;
    });

    painted += found.length;
    for (const combo of found) combos.add(combo);
  }

  // 공회전 차단 — 아무것도 못 재고 「0종」으로 통과하는 것이 이 래칫의 가장 나쁜 실패다.
  expect(painted, "표면을 하나도 못 쟀다 — 이 래칫이 헛돈다").toBeGreaterThan(40);

  expect(
    combos.size,
    `표면 조합이 ${BASELINE_SURFACE_COMBOS} → ${combos.size} 로 늘었다.\n` +
      `상자의 생김새(반경×보더×배경)를 새로 조립하지 말고 이미 있는 조합을 쓴다.\n` +
      `정말 새 역할이면 「체계」를 소집해 규격을 먼저 세워라 — 상한을 올리는 것은 래칫을 푸는 것이다.\n` +
      [...combos].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_SURFACE_COMBOS);

  expect(
    combos.size,
    `표면 조합이 ${BASELINE_SURFACE_COMBOS} → ${combos.size} 로 줄었다. ` +
      `BASELINE_SURFACE_COMBOS 도 ${combos.size} 로 내려라 — 안 내리면 줄인 만큼이 다시 여유가 된다.`,
  ).toBe(BASELINE_SURFACE_COMBOS);
});
