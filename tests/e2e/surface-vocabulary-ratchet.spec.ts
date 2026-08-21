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

/**
 * **표면과 컨트롤을 갈라 센다** (2026-08-09 정정).
 *
 * 처음에는 「반경이 있고 보더/배경이 있는 상자」를 전부 세어 **30종**이라고 했다.
 * 그런데 그중 **17종이 버튼·칩**이었다 — 그건 `controlClass` 가 이미 주인인 층이고,
 * 톤 8단 × 모양 8종을 곱하면 조합이 여러 개 나오는 것이 **정상**이다.
 *
 * 30이라는 수는 두 층을 섞은 값이라 무엇이 문제인지 말해 주지 못했다. 주인이 없는
 * 것은 **표면 15종**이고, 이 래칫이 잠글 것은 그 15다.
 *
 * ⚠️ **컨트롤 수도 같이 센다** — 갈라 놓기만 하고 한쪽을 안 보면, 새 조합이 컨트롤
 * 쪽으로 숨는다. 컨트롤은 값 층이 소유하므로 상한이 더 느슨하지만, 무한은 아니다.
 */
/*
 * 2026-08-18 — 관문 리메이크가 14 → **12** 로 줄였다. 판 하나에 쌓여 있던
 * 상자들이 절 단위 서사로 펴지면서 일회성 표면 둘이 사라진 것이다. 래칫의
 * 규율대로 **줄어든 만큼 상한도 내린다** — 안 내리면 줄인 만큼이 다시 여유가
 * 되고, 다음 사람이 그 여유를 새 조합으로 쓴다.
 */
const BASELINE_SURFACE_COMBOS = 12;
const BASELINE_CONTROL_COMBOS = 17;

const ROUTES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/storefront/",
  "/ko/agents/",
  "/ko/git/",
  "/ko/",
  "/ko/download/",
] as const;

test("표면 조합이 늘지 않는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const surfaces = new Set<string>();
  const controls = new Set<string>();
  let painted = 0;

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`);
    await page.waitForTimeout(900);
    const found = await page.evaluate(() => {
      const out: { key: string; interactive: boolean }[] = [];
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

        // 누르는 것인가 — 그렇다면 `controlClass` 가 주인인 층이다.
        const tag = el.tagName.toLowerCase();
        const interactive =
          ["button", "a", "input", "textarea", "select", "summary", "label"].includes(tag) ||
          el.getAttribute("role") === "button" ||
          el.closest("button,a[href]") !== null;

        out.push({
          key: `${radius} | ${hasBorder ? style.borderTopColor : "none"} | ${
            hasBackground ? style.backgroundColor : "none"
          }`,
          interactive,
        });
      }
      return out;
    });

    painted += found.length;
    for (const item of found) (item.interactive ? controls : surfaces).add(item.key);
  }

  // 공회전 차단 — 아무것도 못 재고 「0종」으로 통과하는 것이 이 래칫의 가장 나쁜 실패다.
  expect(painted, "표면을 하나도 못 쟀다 — 이 래칫이 헛돈다").toBeGreaterThan(40);

  expect(
    surfaces.size,
    `표면 조합이 ${BASELINE_SURFACE_COMBOS} → ${surfaces.size} 로 늘었다.\n` +
      `상자의 생김새(반경×보더×배경)를 새로 조립하지 말고 이미 있는 조합을 쓴다.\n` +
      `정말 새 역할이면 「체계」를 소집해 규격을 먼저 세워라. 상한을 올리는 것은 래칫을 푸는 것이다.\n` +
      [...surfaces].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_SURFACE_COMBOS);

  expect(
    surfaces.size,
    `표면 조합이 ${BASELINE_SURFACE_COMBOS} → ${surfaces.size} 로 줄었다. ` +
      `BASELINE_SURFACE_COMBOS 도 ${surfaces.size} 로 내려라. 안 내리면 줄인 만큼이 다시 여유가 된다.`,
  ).toBe(BASELINE_SURFACE_COMBOS);

  // 컨트롤 쪽으로 새 조합이 숨지 않게 같이 잠근다.
  expect(
    controls.size,
    `컨트롤 조합이 ${BASELINE_CONTROL_COMBOS} → ${controls.size} 로 늘었다.\n` +
      `값 층(controlClass · fieldClass)의 톤·모양으로 표현해라.\n` +
      [...controls].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_CONTROL_COMBOS);
});
