import { test, expect } from "@playwright/test";

/**
 * 터치 타깃 계약 — `--touch-target-min`(44px) 이 **실제로 렌더에 닿는가**.
 *
 * ## 왜 이 층이어야 하나
 *
 * 계약은 `design.md` 가 이미 명문화했고 토큰도 있었다(`--touch-target-min: 44px`).
 * 그런데 2026-07-28 실측에서 coarse 포인터의 44px 미만 컨트롤이 19개 나왔다.
 * 원인은 값이 아니라 **사정거리**였다:
 *
 * - `@media (pointer: coarse)` 블록이 `--topology-chrome-control-height` 를
 *   44px 로 올렸는데, 상단 크롬을 그리는 공유 프리미티브 두 개(`ChromeTile`
 *   `ChromeChip`)는 그 토큰을 안 읽고 `--chrome-tile-size`(36px, src 사용처
 *   17곳)를 읽었다. **승격이 빈 방에 떨어지고 있었다.**
 * - 같은 블록이 `--topology-chrome-control-height-compact` 도 승격했는데
 *   그 토큰은 참조가 0곳인 죽은 토큰이었다.
 * - 첫 실행 패널의 텍스트형 버튼 넷은 높이 토큰이 아예 없어 16~18px 였다.
 *
 * lint 도 vitest 도 이걸 못 본다. lint 는 한 파일의 AST 만 보므로 "이 토큰이
 * 저 media 블록에서 승격되는가" 를 판정할 수 없고, jsdom 은 레이아웃이 없어
 * 높이가 늘 0이다. **포인터 종류가 독립 변수인 실제 브라우저**만 잴 수 있다.
 *
 * ## 히트 영역은 박스가 아니다
 *
 * 인라인 텍스트 컨트롤은 박스를 키우면 그 줄의 레이아웃이 통째로 바뀐다.
 * 그래서 `.touch-hit-expand` 가 의사요소로 히트만 넓힌다 — 이 검사는 보이는
 * rect 가 아니라 **유효 히트 박스**(자기 rect ∪ ::after rect)를 잰다.
 */

const MIN = 44;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 } });

test.describe("터치 타깃 계약 (pointer: coarse)", () => {
  test("첫 실행 패널의 모든 컨트롤이 44px 히트 영역을 갖는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();

    // 카드가 접혀 있으면 되돌아오기 1행으로 다시 연다.
    const reopen = page.getByTestId("first-run-starter-reopen");
    if (await reopen.isVisible().catch(() => false)) await reopen.click();
    await expect(page.getByTestId("first-run-starter")).toBeVisible();

    const short = await page.evaluate((min) => {
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        if (a.content && a.content !== "none" && a.position === "absolute") {
          return {
            w: Math.max(r.width, parseFloat(a.width) || 0),
            h: Math.max(r.height, parseFloat(a.height) || 0),
          };
        }
        return { w: r.width, h: r.height };
      };
      const panel = document.querySelector('[data-testid="first-run-starter"]');
      if (!panel) return [{ id: "panel-missing", w: 0, h: 0 }];
      return Array.from(panel.querySelectorAll("button:not([disabled]), a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
        })
        .map((el) => ({
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          ...hit(el),
        }))
        .filter((b) => b.w < min || b.h < min);
    }, MIN);

    expect(short, `44px 미만 히트 영역: ${JSON.stringify(short)}`).toEqual([]);
  });

  test("공유 크롬 프리미티브가 coarse 에서 44px 로 승격된다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("topology-command-chrome")).toBeVisible();

    // 토큰 자체 — 승격이 도달했는가.
    const tile = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--chrome-tile-size").trim(),
    );
    expect(tile).not.toBe("36px");

    // 렌더된 높이 — 토큰이 실제로 컨트롤에 닿았는가. 토큰만 검사하면
    // "승격했지만 아무도 안 읽는" 상태(이 결함의 원형)를 그대로 통과시킨다.
    for (const id of ["topology-auto-arrange", "topology-concept-search"]) {
      const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${id} 높이`).toBeGreaterThanOrEqual(MIN);
    }
  });

  /**
   * 관문 표면도 같은 계약을 진다 (2026-07-28).
   *
   * `/download` GNB 는 **이 감사 중에 태어난 표면**인데 터치 계약 없이 태어났다
   * (실측: EN/KO 32×32 · 로고 116×24 · 링크 20/28/16px). 새 표면 체크리스트에
   * coarse 승격이 빠져 있다는 신호라, 등록부를 여기까지 넓힌다.
   */
  test("관문(/download)의 모든 컨트롤이 44px 히트 영역을 갖는다", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await expect(page.getByTestId("download-gnb")).toBeVisible();

    const short = await page.evaluate((min) => {
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        if (a.content && a.content !== "none" && a.position === "absolute") {
          return {
            w: Math.max(r.width, parseFloat(a.width) || 0),
            h: Math.max(r.height, parseFloat(a.height) || 0),
          };
        }
        return { w: r.width, h: r.height };
      };
      return Array.from(document.querySelectorAll("button:not([disabled]), a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            cs.visibility !== "hidden" &&
            !el.closest(".sr-only")
          );
        })
        .map((el) => ({
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          ...hit(el),
        }))
        .filter((b) => b.w < min || b.h < min);
    }, MIN);

    expect(short, `44px 미만 히트 영역: ${JSON.stringify(short)}`).toEqual([]);
  });
});
