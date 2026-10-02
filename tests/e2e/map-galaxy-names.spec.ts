import { expect, test, type Page } from "@playwright/test";
import "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForMapSettled } from "./settle";

const SOURCES = [
  { name: "sample", query: "", dogfood: false },
  { name: "dogfood", query: "", dogfood: true },
  { name: "synth 500", query: "synth=500&synthDeps=1&", dogfood: false },
] as const;

const SIZES = [
  { width: 1512, height: 982 },
  { width: 1440, height: 900 },
  { width: 1040, height: 720 },
] as const;

async function openGalaxy(page: Page, query: string, dogfood: boolean) {
  await seedFirstRunSeen(page);
  await page.addInitScript((useDogfood) => {
    for (const key of ["galaxy", "view3d", "territories", "hex-board"]) window.localStorage.setItem(`atlas.appearance.${key}`, "off");
    if (useDogfood) window.localStorage.setItem("demo:sample-source:v1", "dogfood");
  }, dogfood);
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId("topology-view-3d-choice-galaxy").click();
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window.__atlasCosmos;
        const stats = probe?.stats();
        return Boolean(stats && stats.pendingBuilds === 0 && !probe!.arrival().active && !probe!.awake());
      }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

for (const source of SOURCES) {
  for (const size of SIZES) {
    test(`${source.name} at ${size.width}x${size.height} names every domain inside the room`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize(size);
      await openGalaxy(page, source.query, source.dogfood);

      const result = await page.evaluate(() => {
        const probe = window.__atlasCosmos!;
        const stats = probe.stats()!;
        const room = probe.room();
        const canvas = document.querySelector('[data-testid="cosmos-map"] canvas');
        const rect = canvas!.getBoundingClientRect();
        const galaxyLabels = stats.labels.filter((l) => l.kind === "galaxy");
        const outside = stats.labels.filter((l) => l.x < room.x || l.y < room.y || l.x + l.width > room.x + room.width || l.y + l.height > room.y + room.height).map((l) => l.text);
        const covered = stats.labels
          .filter((l) => document.elementFromPoint(rect.left + l.x + l.width / 2, rect.top + l.y + l.height / 2) !== canvas)
          .map((l) => l.text);
        return { galaxies: probe.layout()!.galaxies.length, named: new Set(galaxyLabels.map((l) => l.id)).size, outside, covered };
      });

      console.log(`[galaxy-names] ${source.name} ${size.width}x${size.height}: ${result.named}/${result.galaxies} named, ${result.outside.length} outside, ${result.covered.length} covered`);
      expect(result.galaxies).toBeGreaterThan(0);
      expect(result.named).toBe(result.galaxies);
      expect(result.outside).toEqual([]);
      expect(result.covered).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
