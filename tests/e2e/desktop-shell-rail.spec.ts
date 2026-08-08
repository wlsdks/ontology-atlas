import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **설치된 앱의 `/` 에는 좌측 레일이 있다** (2026-08-01 실측 수리).
 *
 * ## 이 스펙이 막는 회귀
 *
 * 소유자가 설치 앱에서 잡았다 — *"앱에서 왜 LNB가 없지?"*. 원인은 레일 로직이
 * 아니라 **정적 프리렌더와 하이드레이션의 경계**였다:
 *
 * 1. 셸은 `isGatewaySurface(pathname, { desktop: isDesktopShell(), … })` 로
 *    레일을 감춘다.
 * 2. 프리렌더에는 `window` 가 없으므로 `isDesktopShell()` 이 **항상 false** 다.
 *    그래서 `/` 가 「관문」으로 판정되고 `lg:hidden` 이 HTML 에 구워진다.
 * 3. **React 의 하이드레이션은 속성 불일치를 고쳐 주지 않는다.** 클라이언트
 *    첫 렌더가 옳은 값을 내도 서버가 쓴 클래스가 DOM 에 남는다.
 * 4. 설치 앱은 언제나 `/` 를 그 HTML 로 열기 때문에 레일이 **영구히** 사라졌다.
 *
 * 웹에서는 같은 판정이 마침 옳아서(볼트 없는 방문자 = 관문) 아무도 못 봤고,
 * 같은 주소도 **클라이언트 내비게이션으로 들어가면 정상**이었다 — 그때는 진짜
 * 리렌더가 돈다. 그 비대칭이 이 결함의 지문이다.
 *
 * ## 왜 브라우저에서 데스크톱을 재현하나
 *
 * 앱은 WKWebView 라 DOM 을 밖에서 잴 수 없고, 웹과 **같은 정적 export** 를 싣는다
 * (`surfaces.md` — 코드베이스는 가르지 않는다). 그래서 판정을 가르는 유일한
 * 신호(`globalThis.isTauri`)만 주입하면 같은 분기를 밟는다. 데스크톱 능력 자체는
 * 여전히 설치 앱 실측으로만 증명하지만, **이 결함은 능력이 아니라 렌더 경계**다.
 */
const DESKTOP_INIT = () => {
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
    invoke: () => Promise.reject(new Error("stub")),
    transformCallback: (cb: unknown) => cb,
  };
  (window as unknown as { isTauri?: boolean }).isTauri = true;
};

async function railState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-testid="app-nav-rail"]');
    if (!rail) return { present: false, width: 0, hidden: null as string | null };
    return {
      present: true,
      width: Math.round(rail.getBoundingClientRect().width),
      hidden: rail.getAttribute("data-hidden"),
    };
  });
}

test.describe("데스크톱 셸의 좌측 레일", () => {
  test("설치 앱의 `/` 는 SSR 진입에서도 레일을 갖는다", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    // **SSR 진입이 요점이다** — 클라이언트 내비로 들어가면 리렌더가 돌아서
    // 결함이 숨는다. 앱이 실제로 밟는 경로만 이 회귀를 드러낸다.
    await page.goto("/ko/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const rail = await railState(page);
    expect(rail.present, "레일이 DOM 에 없다").toBe(true);
    expect(
      rail.width,
      `설치 앱의 첫 화면에 좌측 레일이 없다(폭 ${rail.width}px, data-hidden=${rail.hidden}). `
        + "프리렌더 값이 하이드레이션 뒤에도 안 고쳐졌는지 확인해라 — `useHydrated()`.",
    ).toBeGreaterThan(0);
    expect(rail.hidden).toBe("false");
  });

  test("웹 관문의 `/` 는 여전히 레일을 감춘다 — 고치면서 반대편을 깨지 않았다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const rail = await railState(page);
    expect(rail.present, "레일은 DOM 에 상주해야 한다(언마운트가 아니라 숨김)").toBe(true);
    expect(
      rail.width,
      "볼트 없는 웹 방문자의 관문에 워크벤치 레일이 떴다 — 아직 아무 데도 못 가는 6개의 문이다",
    ).toBe(0);
  });

  test("지도 주소는 두 표면 모두에서 레일을 갖는다", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    expect((await railState(page)).width).toBeGreaterThan(0);
  });

  /**
   * **레일 타일은 테두리 없이 면과 잉크로만 말한다.**
   *
   * #961(손 컨트롤 → 값 층 일괄 이관)이 목적지 타일의 바깥 `<a>` 에
   * `shape:"card"` 를 입히면서, 그 모양이 싣고 다니는 1px 헤어라인이 여섯
   * 타일 전부에 얹혔다 — 이관 전 손 클래스에는 테두리가 없었고, 그 커밋의
   * 전제가 「픽셀을 안 바꾸는 정확한 변환」이었다. 소유자가 실물에서 잡았다
   * (2026-08-08). 값 층 이관은 코드에 정당한 토큰 값만 남기므로 어떤 값
   * lint 도 이 부류를 못 본다 — 그려진 테두리 폭을 재는 수밖에 없다.
   */
  test("레일 목적지 타일에 그려진 테두리가 없다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("app-nav-rail-item-map")).toBeVisible();

    const tiles = await page.evaluate(() => {
      return [...document.querySelectorAll('[data-testid^="app-nav-rail-item-"]')].map((el) => {
        const c = getComputedStyle(el);
        return {
          id: el.getAttribute("data-testid"),
          borderWidth: c.borderTopWidth,
          borderStyle: c.borderTopStyle,
        };
      });
    });

    // 공회전 차단 — 타일을 못 찾으면 아래 0 위반은 「깨끗해서」가 아니다.
    expect(tiles.length, "레일 타일을 못 찾았다 — 셀렉터가 낡았다").toBeGreaterThan(4);

    const bordered = tiles.filter((t) => t.borderWidth !== "0px" && t.borderStyle !== "none");
    expect(
      bordered,
      "레일 타일에 테두리가 그려졌다 — 값 층 모양이 싣고 온 헤어라인이다. " +
        "이 타일은 초점 링 기하만 card 에서 빌린다(border-0)",
    ).toEqual([]);
  });
});
