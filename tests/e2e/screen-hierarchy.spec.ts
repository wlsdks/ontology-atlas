import { test, expect } from "@playwright/test";

/**
 * 화면 위계 — **눈이 먼저 닿아야 하는 것이 실제로 가장 큰가**.
 *
 * ## 왜 이 층이어야 하나
 *
 * 2026-08-06 「위계」석이 `/project/new` 에서 둘을 지적했고 둘 다 **실측으로
 * 확인됐다**:
 *
 * | 결함 | 실측 |
 * |---|---|
 * | 보조 패널의 「0%」가 페이지 제목과 **동률** | 둘 다 30px |
 * | amber 배너가 *"폴더를 열어야 한다"* 는데 **여는 길이 없다** | 폴더 여는 컨트롤 **0개** |
 *
 * 둘 다 **코드에 아무 값도 안 남기는 결함**이다 — 「0%」는 램프 안의 정당한 칸
 * (`text-hero`)을 쓰고 있었고, 배너는 문구가 멀쩡했다. 값을 보는 lint 도 소스를
 * 훑는 계약도 볼 수 없다. **그려진 화면에서만 보인다.**
 *
 * ## 왜 소스가 아니라 렌더를 재나
 *
 * 「제목보다 큰 것이 없다」는 **두 원소의 관계**이고, 그 둘은 서로 다른 파일에
 * 산다(제목은 페이지, 통계는 폼 위젯). 한 파일의 구문 트리를 보는 검사로는
 * 원리적으로 표현할 수 없다.
 */

test.describe("화면 위계 — /project/new", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("페이지 제목보다 큰 글자가 없다 — 보조 패널이 제목 급을 못 가진다", async ({ page }) => {
    await page.goto("/ko/project/new/?guides=off");
    await page.waitForLoadState("networkidle");

    const { titlePx, offenders, scanned } = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const titlePx = h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0;
      const offenders: { text: string; px: number }[] = [];
      let scanned = 0;
      for (const el of document.querySelectorAll("*")) {
        if (el.childElementCount > 0) continue;
        const text = (el.textContent || "").trim();
        if (!text) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (el.closest(".sr-only")) continue;
        scanned += 1;
        if (el === h1 || h1?.contains(el)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px >= titlePx) offenders.push({ text: text.slice(0, 20), px });
      }
      return { titlePx, offenders, scanned };
    });

    // 공회전 방지 — 잰 것이 없으면 아래 0 은 「깨끗해서」가 아니라 「안 봐서」다.
    expect(titlePx, "h1 을 못 찾았다 — 이 검사가 기준을 잃었다").toBeGreaterThan(0);
    expect(scanned, "글자 원소를 거의 못 훑었다 — 스캐너가 죽었다").toBeGreaterThan(20);

    expect(
      offenders,
      `제목(${titlePx}px)과 같거나 큰 글자: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  /**
   * **막다른 CTA 금지.** 헌장의 강등 문법은 «왜 안 되는지 **+ 어디로 가면
   * 되는지**» 다(`.claude/rules/surfaces.md`). 문서함이 같은 문제를 이미 그렇게
   * 풀었다 — *"누르면 그것을 가능하게 하는 곳으로 간다."*
   */
  test("쓰기 잠금 배너가 갈 곳을 함께 준다 — 막다른 경고가 아니다", async ({ page }) => {
    await page.goto("/ko/project/new/?guides=off");
    await page.waitForLoadState("networkidle");

    const banner = page.getByTestId("project-write-disabled-banner");
    await expect(banner, "쓰기 잠금 배너가 안 뜬다 — 이 검사가 헛돈다").toBeVisible();

    const cta = page.getByTestId("project-write-disabled-open-folder");
    await expect(cta, "배너가 이유만 말하고 갈 곳을 안 준다 — 막다른 CTA 다").toBeVisible();

    const href = await cta.getAttribute("href");
    expect(href, "갈 곳이 비었다").toBeTruthy();

    // 그 갈 곳이 **실제로 열려야** 한다 — 눌러도 아무 데도 안 가는 버튼 0개.
    await cta.click();
    await page.waitForLoadState("networkidle");
    expect(page.url(), `배너의 갈 곳(${href})이 열리지 않았다`).toContain("/ko/");
    await expect(page.getByTestId("project-write-disabled-banner")).toHaveCount(0);
  });
});
