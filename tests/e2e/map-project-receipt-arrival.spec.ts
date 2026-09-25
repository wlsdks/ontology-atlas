import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";
import { waitForAnimationsDone, waitForBoxStill } from "./settle";

/**
 * **The project inspector is the project's from its first frame** (2026-09-25 sweep).
 *
 * Measured before the fix against the real bridge: the panel was on screen at 1895 ms in the
 * plain layout — "changed today", a footer slug, no code evidence — and at 2605 ms rebuilt
 * itself: a code-evidence block inserted above the buttons, the meta line rewritten to "Concept
 * document · changed today", the relations folded, and every button pushed down in one frame.
 * The receipt comes from a native read that always lands after the panel, so the panel must hold
 * its place rather than draw another layout first.
 *
 * The read of `.ontology-atlas/project-sources.json` is **held until the test releases it**, so the
 * order "panel on screen, then receipt" is a condition, not a race: nothing here depends on how fast
 * this machine is.
 *
 * The folder is bound with no receipt yet (`needs_evidence` / `measure_source`), the state the
 * sweep found: a gap line and a remedy box arrive with the receipt.
 */
const SIDECAR = ".ontology-atlas/project-sources.json";
const BINDING = `${JSON.stringify(
  {
    contractVersion: 1,
    bindings: [
      {
        projectSlug: "storefront",
        sourceId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        rootPath: "/Users/probe/storefront",
        kind: "git",
        boundAt: "2026-09-25T00:00:00.000Z",
      },
    ],
  },
  null,
  2,
)}\n`;

/** Holds every read of the sidecar until `window.__releaseProjectSources()` is called. */
async function holdProjectSourcesRead(page: Page): Promise<void> {
  await page.addInitScript((sidecar: string) => {
    const w = window as unknown as {
      __releaseProjectSources: () => void;
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
    };
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    w.__releaseProjectSources = release;
    const internals = w.__TAURI_INTERNALS__;
    const invoke = internals.invoke.bind(internals);
    internals.invoke = (command, args = {}) => {
      const path = String(args.relativePath ?? "").replace(/^\/+/, "");
      if ((command === "read_vault_binary_file" || command === "read_vault_text_file") && path === sidecar) {
        return gate.then(() => invoke(command, args));
      }
      return invoke(command, args);
    };
  }, SIDECAR);
}

async function readInspector(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="map-detail-panel"]');
    const actions = panel?.querySelector<HTMLElement>('[data-testid="map-detail-panel-actions"]');
    return {
      pending: Boolean(panel?.querySelector('[data-testid="map-project-source-pending"]')),
      receipt: Boolean(panel?.querySelector('[data-testid="map-project-source-receipt"]')),
      meta: panel?.querySelector<HTMLElement>('[data-testid="map-datasheet-updated-at"]')?.innerText.trim() ?? null,
      footerSlug: Boolean(panel?.querySelector('[data-testid="map-detail-panel-slug"]')),
      actionsTop: actions ? actions.getBoundingClientRect().top : null,
    };
  });
}

for (const viewport of [
  { width: 1512, height: 949 },
  { width: 1280, height: 800 },
] as const) {
  test(`the project inspector holds its receipt's place and nothing jumps when it lands at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await installDesktopRailRuntime(page, { [SIDECAR]: BINDING });
    await holdProjectSourcesRead(page);
    await mountDesktopVault(page);
    await page.goto("/en/topology/?e2e=1&guides=off&p=project%3Astorefront", { waitUntil: "domcontentloaded" });

    const panel = page.getByTestId("map-detail-panel");
    await expect(panel).toHaveAttribute("data-selected-node-id", "project:storefront", { timeout: 30_000 });
    await waitForAnimationsDone(panel);

    // Before the receipt: already the project's layout, with the receipt's place held.
    const before = await readInspector(page);
    console.log(`[receipt-arrival] ${viewport.width} before ${JSON.stringify(before)}`);
    expect(before.pending, "the receipt's place is not held while it is read").toBe(true);
    expect(before.receipt).toBe(false);
    expect(before.meta, "the meta line is not the project's yet").toMatch(/^Concept document · /);
    expect(before.footerSlug, "the footer is drawn in another kind's layout").toBe(false);
    await expect(page.getByTestId("map-project-source-pending-line")).toHaveAttribute("data-pending-announced", "true");
    await expect(page.getByTestId("map-project-source-pending-line")).toContainText("Reading the analysis receipt");

    // Record every frame of the arrival, then let the read answer.
    await page.evaluate(() => {
      const w = window as unknown as { __arrival: { receipt: boolean; actionsTop: number }[]; __arrivalStop: boolean };
      w.__arrival = [];
      w.__arrivalStop = false;
      const tick = () => {
        const actions = document.querySelector<HTMLElement>('[data-testid="map-detail-panel-actions"]');
        w.__arrival.push({
          receipt: Boolean(document.querySelector('[data-testid="map-project-source-receipt"]')),
          actionsTop: actions ? actions.getBoundingClientRect().top : Number.NaN,
        });
        if (!w.__arrivalStop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as unknown as { __releaseProjectSources: () => void }).__releaseProjectSources();
    });
    await expect(page.getByTestId("map-project-source-receipt")).toHaveAttribute("data-source-action", "measure_source");
    await expect(page.getByTestId("map-project-source-remedy")).toBeVisible();
    await waitForBoxStill(page.getByTestId("map-detail-panel-actions"));
    const frames = await page.evaluate(() => {
      const w = window as unknown as { __arrival: { receipt: boolean; actionsTop: number }[]; __arrivalStop: boolean };
      w.__arrivalStop = true;
      return w.__arrival;
    });

    const arrival = frames.findIndex((frame) => frame.receipt);
    expect(arrival, "the receipt never arrived in a recorded frame").toBeGreaterThan(0);
    const start = before.actionsTop ?? Number.NaN;
    const end = frames.at(-1)!.actionsTop;
    const steps = frames.slice(1).map((frame, index) => frame.actionsTop - frames[index]!.actionsTop);
    console.log(
      `[receipt-arrival] ${viewport.width} actions ${start} → ${end} over ${frames.length} frames, arrival frame ${frames[arrival]!.actionsTop}, largest step ${Math.max(...steps)}`,
    );
    // The frame the receipt lands in moves nothing: the rows it fills were already there.
    expect(Math.abs(frames[arrival]!.actionsTop - start), "the receipt's arrival pushed the actions in one frame").toBeLessThanOrEqual(1);
    // What still arrives (the gap line and the remedy) eases in: no single frame carries most of it.
    expect(end - start, "the gap and remedy never arrived").toBeGreaterThan(40);
    expect(Math.max(...steps), "the rest of the arrival moved the actions in one jump").toBeLessThan((end - start) * 0.6);

    const after = await readInspector(page);
    expect(after.meta).toBe(before.meta);
    expect(after.footerSlug).toBe(false);
  });
}

/**
 * **From the project page to the control that connects its code folder** (2026-09-25 sweep).
 *
 * The page's "View topology" sent a bare slug, which opens the project drawer: no code evidence,
 * no connect control, and only a chip labelled like the button just pressed leading on. It now
 * lands on the project's own node, whose inspector carries the connect control.
 */
test("the project page's map door lands where the code folder is connected", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.goto("/en/project/fallback/?slug=storefront&guides=off", { waitUntil: "domcontentloaded" });

  const door = page.getByTestId("project-detail-topology-link");
  await expect(door).toHaveAttribute("href", /\?p=project%3Astorefront$/, { timeout: 30_000 });
  await door.click();

  await expect(page).toHaveURL(/\/en\/topology\/\?p=project%3Astorefront/);
  await expect(page.getByTestId("map-detail-panel")).toHaveAttribute("data-selected-node-id", "project:storefront", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("project-drawer")).toHaveCount(0);
  await expect(page.getByTestId("map-project-source-receipt")).toHaveAttribute("data-source-action", "connect_source");
  await expect(page.getByTestId("map-project-source-action")).toHaveText("Connect code folder");
});
