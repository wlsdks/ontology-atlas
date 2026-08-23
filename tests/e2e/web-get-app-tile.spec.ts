import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * "Get the app" sits in **the same place on every web destination**.
 *
 * Owner request: *"On the web it would be good to put buttons leading to the app
 * download in various places, clearly visible."* Planting a banner on every surface is
 * noise rather than guidance, and is the kind of thing this repository's design gates
 * call an additive-only pass. So there is one in the chrome — the rail's utility tier
 * is the same place on every destination, so **one element already is "various
 * places"**.
 *
 * What this spec keeps is that claim itself: if destinations grow and the rail does
 * not follow, "the same place everywhere" becomes false.
 *
 * Its **absence** in the app cannot be measured here (a browser has no Tauri runtime).
 * That axis is pinned as a predicate rule by `show-get-app-tile.test.ts` — offering
 * "get the app" to someone who has installed it is misinformation in itself.
 */

const WEB_SURFACES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/git/",
];

test("웹의 모든 목적지에서 앱 받기 타일이 같은 자리에 있다", async ({ page }) => {
  await seedFirstRunSeen(page);
  const positions: number[] = [];

  for (const surface of WEB_SURFACES) {
    await page.goto(`${surface}?guides=off`, { waitUntil: "networkidle" });

    const tile = page.getByTestId("app-nav-rail-get-app");
    await expect(tile, `${surface}: 타일이 없다`).toBeVisible({ timeout: 15_000 });

    // There is one destination, `/download`. The rail does not guess the visitor's OS —
    // that screen already separates the macOS files from "Windows not ready yet"
    // honestly. A rail that judges the OS becomes a dead-end CTA when it guesses wrong.
    await expect(tile).toHaveAttribute("href", /\/download\/$/);

    const box = await tile.boundingBox();
    expect(box, `${surface}: 타일의 rect 를 못 읽었다`).not.toBeNull();
    positions.push(Math.round(box!.y));
  }

  // "The same place" is a coordinate, not an impression.
  expect(new Set(positions).size, `자리가 흔들린다: ${positions.join(", ")}`).toBe(1);
});

test("타일이 실제로 다운로드 화면으로 데려간다 — 죽은 CTA 0", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

  await page.getByTestId("app-nav-rail-get-app").click();
  await page.waitForURL(/\/download\//);

  // Also checks the landing screen does not send a Windows visitor away empty-handed —
  // the site the owner asked for with *"Write that Windows is on the way"* (write that
  // Windows is on the way).
  await expect(page.getByText("Windows").first()).toBeVisible();
});


/**
 * `<lg` — at widths where the rail is hidden, **the bottom tab bar's fifth slot**
 * does the job.
 *
 * The hole exposed by measurement (2026-07-28): with the rail at `lg:flex`, the number
 * of visible `/download` links at 390 and 768 was **0**. Mobile and tablet web visitors
 * had no path to the download at all. By owner decision a tab bar slot was given up.
 *
 * Adding a fifth narrows the other four — so **touch target and overflow are measured
 * together**. Making it small because it is a utility would make it the hardest item
 * to press at that width, violating this repository's touch contract (44px).
 */
const NARROW_WIDTHS = [360, 390, 768];

for (const width of NARROW_WIDTHS) {
  test(`${width}px 웹 — 탭바 다섯 번째 자리가 다운로드로 데려간다`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

    const tab = page.getByTestId("bottom-tab-get-app");
    await expect(tab, "이 폭에서 다운로드로 갈 길이 없다").toBeVisible({ timeout: 15_000 });
    await expect(tab).toHaveAttribute("href", /\/download\/$/);

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('[data-tabbar="primary"]');
      if (!bar) return null;
      const items = [...bar.children].map((el) => el.getBoundingClientRect());
      return {
        count: items.length,
        minWidth: Math.min(...items.map((r) => r.width)),
        minHeight: Math.min(...items.map((r) => r.height)),
        overflows: bar.scrollWidth > bar.clientWidth + 1,
      };
    });

    expect(geometry, "탭바를 못 찾았다").not.toBeNull();
    expect(geometry!.count).toBe(5);
    // On overflow the fifth is pushed off screen — present but unpressable.
    expect(geometry!.overflows, "탭바가 가로로 넘친다").toBe(false);
    // The 44px touch contract — it must hold even after giving up one more slot.
    expect(geometry!.minWidth).toBeGreaterThanOrEqual(44);
    expect(geometry!.minHeight).toBeGreaterThanOrEqual(44);
  });
}
