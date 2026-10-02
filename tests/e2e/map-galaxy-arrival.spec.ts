import { expect, test, type Page } from "@playwright/test";
import "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForMapSettled } from "./settle";

type ArrivalSample = { mode: string; active: boolean; clockMs: number; frames: number; centres: number[] | null };

declare global {
  interface Window {
    __arrivalLog?: ArrivalSample[];
  }
}

async function prepare(page: Page, { galaxy, withCentres }: { galaxy: boolean; withCentres: boolean }) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript(
    ({ galaxy, withCentres }) => {
      window.localStorage.setItem("atlas.appearance.galaxy", galaxy ? "on" : "off");
      for (const key of ["view3d", "territories", "hex-board"]) window.localStorage.setItem(`atlas.appearance.${key}`, "off");
      const log: ArrivalSample[] = [];
      window.__arrivalLog = log;
      const tick = () => {
        const probe = window.__atlasCosmos;
        if (probe && probe.frames() > 0) {
          const a = probe.arrival();
          const last = log[log.length - 1];
          if (!last || last.active || a.active || last.mode !== a.mode) {
            const centres = withCentres ? (probe.layout()?.galaxies.flatMap((g) => [g.sx, g.sy]) ?? null) : null;
            log.push({ mode: a.mode, active: a.active, clockMs: a.clockMs, frames: probe.frames(), centres });
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { galaxy, withCentres },
  );
}

async function openCold(page: Page, query: string, withCentres = false) {
  await prepare(page, { galaxy: true, withCentres });
  await page.goto(`/en/topology/?${query}view=galaxy&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await settled(page);
}

async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => (window.__atlasCosmos?.frames() ?? 0) > 0 && !window.__atlasCosmos!.arrival().active), { timeout: 30_000 }).toBe(true);
}

const arrivalLog = (page: Page) => page.evaluate(() => window.__arrivalLog ?? []);

test.describe("Galaxy arrival", () => {
  test("a cold open replays the settle and ends whole at 1,120 ms", async ({ page }) => {
    await openCold(page, "");
    const log = await arrivalLog(page);
    expect(log[0]!.mode).toBe("replay");
    const end = log.findIndex((s) => !s.active);
    expect(end).toBeGreaterThan(0);
    expect(log[end - 1]!.active).toBe(true);
    expect(log[end]!.clockMs).toBeGreaterThanOrEqual(1120);
    const frame = await page.evaluate(() => JSON.parse(document.querySelector<HTMLCanvasElement>('[data-testid="cosmos-map"] canvas')!.dataset.frame ?? "{}"));
    expect(frame.arrived).toBe(true);
  });

  for (const query of ["", "synth=500&synthDeps=1&", "synth=10000&synthDeps=1&"]) {
    test(`a cold open throws nothing (${query || "sample"})`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await openCold(page, query);
      expect((await arrivalLog(page))[0]!.mode).toBe("replay");
      expect(errors).toEqual([]);
    });
  }

  test("picking Flat and then Galaxy again does not replay", async ({ page }) => {
    await openCold(page, "");
    await page.getByTestId("topology-view-3d").click();
    await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
    await page.getByTestId("topology-view-3d-choice-flat").click();
    await expect(page.getByTestId("topology-map-view")).toHaveCount(0);
    await waitForMapSettled(page);
    await page.evaluate(() => {
      window.__arrivalLog!.length = 0;
    });
    await page.getByTestId("topology-view-3d").click();
    await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
    await page.getByTestId("topology-view-3d-choice-galaxy").click();
    await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
    await settled(page);
    const log = await arrivalLog(page);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((s) => s.mode === "none" && !s.active)).toBe(true);
  });

  test("a reload with a record condenses in place", async ({ page }) => {
    await openCold(page, "", true);
    await expect.poll(() => page.evaluate(() => Object.keys(window.localStorage).some((k) => k.startsWith("atlas.map.cosmos.v1:")))).toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await settled(page);
    const log = await arrivalLog(page);
    expect(log[0]!.mode).toBe("condense");
    const during = log.filter((s) => s.active && s.centres);
    expect(during.length).toBeGreaterThan(10);
    for (const sample of during) {
      sample.centres!.forEach((v, i) => expect(Math.abs(v - during[0]!.centres![i]!)).toBeLessThanOrEqual(0.01));
    }
  });

  test("reduced motion arrives whole on the first frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openCold(page, "");
    const log = await arrivalLog(page);
    expect(log[0]).toMatchObject({ mode: "none", active: false });
    expect(log[0]!.frames).toBeLessThanOrEqual(2);
    const frame = await page.evaluate(() => JSON.parse(document.querySelector<HTMLCanvasElement>('[data-testid="cosmos-map"] canvas')!.dataset.frame ?? "{}"));
    expect(frame).toMatchObject({ arrived: true, arrivalT: 1 });
  });
});
