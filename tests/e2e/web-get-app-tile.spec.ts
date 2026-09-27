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
  "/ko/architecture/",
];

test("웹의 모든 목적지에서 앱 받기 타일이 같은 자리에 있다", async ({ page }) => {
  await seedFirstRunSeen(page);
  const positions: number[] = [];

  for (const surface of WEB_SURFACES) {
    const destination = surface === "/ko/docs/" ? "/ko/library/?tab=ontology" : surface;
    await page.goto(`${destination}${destination.includes("?") ? "&" : "?"}guides=off`, {
      waitUntil: "networkidle",
    });
    if (surface === "/ko/docs/") {
      await expect(page).toHaveURL(
        (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
      );
      await expect(
        page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
      ).toBeVisible();
    }

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
