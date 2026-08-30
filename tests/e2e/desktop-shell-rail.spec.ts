import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The rail follows a real vault, not merely the installed-app runtime.**
 *
 * The installed app used to paint its bundled sample before restoring local state, and the
 * always-visible rail made those sample destinations look like a usable workspace. The first-run
 * screen now owns `/` until a real vault is mounted, so that state intentionally keeps the
 * persistent rail hidden. `local-vault-route-identity.spec.ts` holds the positive counterpart:
 * once a real local vault is mounted, the installed-shell branch exposes the rail and every
 * transition stays inside that vault.
 *
 * **Why desktop is reproduced in a browser.** The app is a WKWebView and ships the same static
 * export as the web. Injecting the Tauri runtime signal therefore exercises this render boundary;
 * native capabilities remain covered by installed-app verification.
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
  test("볼트 없는 설치 앱의 `/` 는 첫 실행만 보이고 레일을 숨긴다", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    await expect(page.getByTestId("first-run-open")).toBeVisible();
    await expect(page.getByText("Storefront Services")).toHaveCount(0);
    const rail = await railState(page);
    expect(rail.present, "레일이 DOM 에 없다").toBe(true);
    expect(
      rail.width,
      "볼트 없는 첫 실행 화면에 아직 갈 수 없는 워크벤치 목적지가 노출됐다",
    ).toBe(0);
    expect(rail.hidden).toBe("true");
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
