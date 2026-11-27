import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../../desktop-rail-arrival-harness";

/**
 * The slug must exist only in the fixture:
 * a slug also in another vault cannot show which vault opened it.
 */
const DEEP_SLUG = "capabilities/deeplink-probe";
const DEEP_TITLE = /딥링크 표적 문서/;

test.describe("document box deep link: the URL wins", () => {
  test("?slug= survives a cold load after the local vault is restored", async ({ page }) => {
    test.setTimeout(120_000);

    // ① Open the folder from the first screen — the app remembers it for the cold loads below.
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page, "ko");

    // ② Open the docs surface **without** a slug to create the stored "last
    //    document" — the deep-link-vs-last-document contest needs that value to exist.
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    const restedSlug = new URL(page.url()).searchParams.get("slug");
    expect(restedSlug, "the default selection opened no document, so this test spins idle").not.toBeNull();
    expect(restedSlug).not.toBe(DEEP_SLUG);

    // ③ Cold-load deep link — if the defect is alive, the URL is overwritten here with ②'s slug.
    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    // The URL can wobble until the vault finishes loading — measure the final state.
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .toBe(DEEP_SLUG);
    await expect(
      page.getByTestId("gateway-doc-title").or(page.locator("main")).first(),
    ).toContainText(DEEP_TITLE, { timeout: 20_000 });
  });

  /**
   * The address contradicting the deep link **for even one moment** is a defect. Which race freezes
   * that cleared instant differs per device (on the real device tab restoration froze it and left
   * README), and polling only the final value turns green wherever it self-healed. So every
   * replaceState call is recorded and the assertion is "zero calls lost the slug".
   */
  test("a deep link is never dropped from the address while the folder boots", async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page, "ko");
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    expect(new URL(page.url()).searchParams.get("slug")).not.toBe(DEEP_SLUG);

    await page.addInitScript(() => {
      const w = window as unknown as { __urlTrace?: string[] };
      w.__urlTrace = [];
      const orig = history.replaceState.bind(history);
      history.replaceState = (s, ti, url) => {
        w.__urlTrace?.push(String(url));
        return orig(s, ti, url);
      };
    });
    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .toBe(DEEP_SLUG);
    await expect(
      page.getByTestId("gateway-doc-title").or(page.locator("main")).first(),
    ).toContainText(DEEP_TITLE, { timeout: 20_000 });
    const trace = await page.evaluate(
      () => (window as unknown as { __urlTrace?: string[] }).__urlTrace ?? [],
    );
    expect(trace.length, "replaceState was never called, so the instrumentation spins idle").toBeGreaterThan(0);
    const dropped = trace.filter((url) => !url.includes(`slug=${encodeURIComponent(DEEP_SLUG)}`));
    expect(
      dropped,
      "the address lost the deep link during boot; if tab restore fixes this instant in place, it becomes a real-device incident",
    ).toEqual([]);
  });
});
