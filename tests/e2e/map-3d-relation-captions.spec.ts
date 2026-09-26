import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { waitForDomeEntered, waitForMapSettled, waitForMapStill, waitFrames } from "./settle";

/**
 * **Strata and Neural caption what the flat map would, and no more** (2026-09-26).
 *
 * With the agent dock open over the whole ontology, the map names the relations it
 * draws. The flat map draws its spine at rest and named the project's four relations.
 * Strata and Neural draw every concept, so every relation qualified and the placer
 * filled all 24 of its slots: measured on the product's own ontology at 1512×949,
 * twenty-four "↘ contains" chips over the planes. A view that shows more does not ask
 * a person to read more (`render/relation-captions.ts#captionWithinFlatBudget`).
 */

const RUNTIME = {
  id: "claude-code",
  label: "Claude Agent",
  description: "",
  website: null,
  license: null,
  verified: true,
  icon: null,
  brandInk: null,
  launchKind: "npx",
  state: "ready",
  cliPath: "/opt/homebrew/bin/claude",
  adapterPath: null,
  adapterPackage: "@agentclientprotocol/claude-agent-acp",
  isolated: true,
};

const captionCount = (page: Page) => page.evaluate(() => window.__atlasMap?.relationCaptions?.().length ?? -1);

async function chooseView(page: Page, view: string) {
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId(`topology-view-3d-choice-${view}`).click();
  await expect(page.getByTestId(`topology-view-3d-choice-${view}`)).toHaveCount(0);
  if (view === "strata" || view === "coupling") await waitForDomeEntered(page, 60_000);
  await waitForMapStill(page);
  // The captions are placed in the frame after the view settles.
  await waitFrames(page, 4);
}

test("with the agent dock open, Strata and Neural keep the flat map's caption budget", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, dogfoodVaultFiles(), { fast: [RUNTIME], probed: [RUNTIME] }, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);

  // The conversation dock, scoped to the whole ontology: nothing is selected.
  const dock = page.getByTestId("topology-vault-agent-toggle");
  await dock.click();
  await expect(page.locator("main")).toHaveAttribute("data-agent-panel-open", "true");
  await waitForMapStill(page, { what: "camera" });
  await waitFrames(page, 4);
  await expect.poll(() => captionCount(page), { message: "the flat map named no relation" }).toBeGreaterThan(0);
  const flat = await captionCount(page);

  const counts: Record<string, number> = {};
  for (const view of ["strata", "coupling"]) {
    await chooseView(page, view);
    counts[view] = await captionCount(page);
  }
  expect(counts.strata, `Strata named ${counts.strata} relations where the flat map named ${flat}`).toBeLessThanOrEqual(flat);
  expect(counts.coupling, `Neural named ${counts.coupling} relations where the flat map named ${flat}`).toBeLessThanOrEqual(flat);
});
