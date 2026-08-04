import { expect, test, type Page } from "@playwright/test";

import { AUDITED_ROUTES } from "./audited-routes";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **누를 수 있는 것은 전부 같은 커서를 쓴다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-08-05 감사)
 *
 * 실측(1512, 7개 라우트): 링크 `a` 75개는 `pointer`, 버튼 58개는 `default`.
 * 아무도 정한 적이 없고 **브라우저 기본값이 태그마다 다른 것을 그대로 쓴**
 * 결과였다. 그 위에 손으로 적은 `cursor-pointer` 가 10개 파일 22곳에
 * 흩뿌려져 있었는데, 버튼끼리도 5:56 으로 서로 모순이었다 — 정책이 있어서
 * 갈린 게 아니라 작성자마다 그때그때 적은 것이다.
 *
 * 소유자 확정: **전부 pointer.** 정책은 `app/globals.css` 의 base 레이어
 * 한 곳에 산다.
 *
 * ## 왜 lint 가 아니라 여기인가
 *
 * 위반이 **코드에 아무 값도 남기지 않는다.** 새 컴포넌트가 그냥 `<button>` 을
 * 쓰면 클래스도 인라인 스타일도 없이 브라우저 기본값으로 떨어진다 — 볼
 * 문자열이 없다. `eslint.config.mjs` 의 셀렉터는 «중복해서 적은 것»만 잡을 수
 * 있고, «중앙 규칙이 사라졌거나 안 닿는 것»은 **렌더된 결과를 재야** 안다.
 * (`design.md` "lint 가 못 보는 층은 계약 테스트가 맡는다".)
 *
 * ## 무엇을 재지 않는가
 *
 * - **비활성 컨트롤** — `disabled:cursor-not-allowed`(7곳)·`disabled:cursor-wait`
 *   (5곳)가 «누를 수 없다»를 말한다. 여기에 pointer 를 요구하면 그 신호를 지운다.
 * - **캔버스** — 지도는 `grab`/`grabbing` 이 맞다(끄는 것이지 누르는 것이 아니다).
 * - **스크림** — 누르면 닫히지만 컨트롤이 아니라 표면이다(`cursor-default` 정당).
 */
const VIEWPORT = { width: 1512, height: 900 };

/** 화면에 실제로 그려졌고, 비활성이 아니며, 캔버스 위가 아닌 컨트롤만 잰다. */
async function measure(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, summary, a[href]")]
      .filter((el) => {
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) return false;
        if (r.top >= innerHeight || r.bottom <= 0 || r.left >= innerWidth || r.right <= 0) return false;
        if (el.closest("details:not([open])")) return false;
        if ((el as HTMLButtonElement).disabled) return false;
        if (el.getAttribute("aria-disabled") === "true") return false;
        return true;
      })
      .map((el) => ({
        cursor: getComputedStyle(el).cursor,
        tag: el.tagName.toLowerCase(),
        label: (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 28),
      })),
  );
}

for (const route of AUDITED_ROUTES) {
  test(`커서 어포던스 — ${route} 의 활성 컨트롤은 전부 pointer`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.waitForTimeout(900);

    const controls = await measure(page);

    // 검출기가 빈 집합 위에서 돌지 않는다 — 컨트롤이 0개면 이 단언은 공짜 초록이다.
    expect(controls.length, "이 화면에서 잰 컨트롤이 0개다 — 게이트가 헛돈다").toBeGreaterThan(0);

    const offenders = controls.filter((c) => c.cursor !== "pointer");
    expect(
      offenders.map((c) => `${c.tag}«${c.label}» → ${c.cursor}`),
      "활성 컨트롤인데 pointer 가 아니다 — app/globals.css 의 base 커서 규칙을 확인",
    ).toEqual([]);
  });
}

/**
 * 판정 방식 자체가 «pointer 아님» 을 구별하는지 확인한다(`/gate-probe`).
 *
 * 위 검사는 목록이 비면 통과한다. 필터가 조용히 과하게 걸러지면(예: 모든
 * 컨트롤이 «비활성» 으로 분류되면) 결함이 살아 있어도 초록이 된다. 그래서
 * 같은 페이지에 **일부러 pointer 가 아닌 버튼**을 하나 심어, 그것이 실제로
 * 잡히는지 본다.
 */
test("판정 방식이 pointer 아닌 버튼을 실제로 잡는다 — 헛도는 검사가 아님", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });

  const before = (await measure(page)).filter((c) => c.cursor !== "pointer");
  expect(before, "심기 전부터 위반이 있으면 프로브가 무의미하다").toEqual([]);

  await page.evaluate(() => {
    const b = document.createElement("button");
    b.textContent = "probe";
    b.style.cursor = "default";
    b.style.width = "40px";
    b.style.height = "20px";
    document.body.prepend(b);
  });

  const after = (await measure(page)).filter((c) => c.cursor !== "pointer");
  expect(after.length, "심어 둔 위반을 못 잡는다 — 필터가 과하게 걸러내고 있다").toBe(1);
});
