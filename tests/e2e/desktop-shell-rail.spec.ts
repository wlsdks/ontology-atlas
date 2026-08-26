import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The installed app's `/` has the left rail** (measured and repaired 2026-08-01).
 *
 * **The regression this spec blocks.** The owner caught it in the installed app —
 * *"Why is there no left nav in the app?"* (why is there no left nav in the app?). The cause was not
 * the rail logic but **the boundary between static prerender and hydration**:
 *
 * 1. The shell hides the rail via
 *    `isGatewaySurface(pathname, { desktop: isDesktopShell(), … })`.
 * 2. Prerender has no `window`, so `isDesktopShell()` is **always false**. `/` is
 *    therefore judged a gateway and `lg:hidden` is baked into the HTML.
 * 3. **React hydration does not repair attribute mismatches.** Even when the client's
 *    first render produces the right value, the class the server wrote stays in the DOM.
 * 4. The installed app always opens `/` with that HTML, so the rail disappeared
 *    **permanently**.
 *
 * On the web the same judgement happened to be correct (a visitor with no vault is on
 * the gateway), so nobody saw it, and the same address **was fine when entered by
 * client navigation** — a real re-render runs then. That asymmetry is the defect's fingerprint.
 *
 * **Why the desktop is reproduced in a browser.** The app is a WKWebView so its DOM
 * cannot be measured from outside, and it ships **the same static export** as the web
 * (.claude/rules/surfaces.md — the codebase is not forked). So injecting the single
 * signal that changes the judgement (`globalThis.isTauri`) walks the same branch.
 * Desktop capabilities themselves are still proven only by measuring the installed app,
 * but **this defect is a render boundary, not a capability**.
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
    // **Entering via SSR is the point** — entering by client navigation runs a re-render
    // and hides the defect. Only the path the app actually takes exposes this regression.
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
      "볼트 없는 웹 방문자의 관문에 워크벤치 레일이 떴다 — 아직 아무 데도 못 가는 7개의 문이다",
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
   * **Rail tiles speak through surface and ink only, with no border.**
   *
   * #961 (bulk migration of hand controls into the value layer) applied `shape:"card"`
   * to the outer `<a>` of the destination tiles, which put the 1px hairline that shape
   * carries onto all seven tiles — the pre-migration hand classes had no border, and that
   * commit's premise was an exact conversion that changes no pixels. The owner caught it
   * on the real thing (2026-08-08). A value-layer migration leaves only legitimate token
   * values in the code, so no value lint can see this class of defect — the only way is
   * to measure the rendered border width.
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

    // Idling guard — if no tiles are found, the 0 violations below are not "because it is
    // clean".
    expect(tiles.length, "레일 타일을 못 찾았다 — 셀렉터가 낡았다").toBeGreaterThan(4);

    const bordered = tiles.filter((t) => t.borderWidth !== "0px" && t.borderStyle !== "none");
    expect(
      bordered,
      "레일 타일에 테두리가 그려졌다 — 값 층 모양이 싣고 온 헤어라인이다. " +
        "이 타일은 초점 링 기하만 card 에서 빌린다(border-0)",
    ).toEqual([]);
  });
});
