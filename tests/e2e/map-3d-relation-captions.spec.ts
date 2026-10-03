import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { waitForDomeEntered, waitForMapSettled, waitForMapStill, waitFrames } from "./settle";

/**
 * **Strata and Neural caption what the flat map would, and no more** (2026-09-26).
 *
 * With the agent dock open, the map names the relations it draws. The flat map drew its
 * spine at rest and named the project's four relations. Strata and Neural draw every
 * concept, so every relation qualified and the placer filled all 24 of its slots:
 * measured on the product's own ontology at 1512×949, twenty-four "↘ contains" chips over
 * the planes. A view that shows more does not ask a person to read more
 * (`render/relation-captions.ts#captionWithinFlatBudget`).
 *
 * **The reference is a focused domain** (2026-10-04). The Flat dial's overview names no
 * relation by design; a focused concept with meanings on hands Flat back to the classic
 * marks, which name its relations. The dial also exempts the flat map from the density
 * gate, and the views that draw every concept read that gate as their budget: with a
 * domain focused, Strata named 12 relations and Neural 5 where Flat named 2.
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

const FOCUS = "domain:agent-access";

test("with the agent dock open, Strata and Neural keep the flat map's caption budget", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, dogfoodVaultFiles(), { fast: [RUNTIME], probed: [RUNTIME] }, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapSettled(page);

  const dock = page.getByTestId("topology-vault-agent-toggle");
  await dock.click();
  await expect(page.locator("main")).toHaveAttribute("data-agent-panel-open", "true");
  await waitForMapStill(page, { what: "camera" });
  await waitFrames(page, 4);

  const chip = await page.evaluate((id) => {
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')?.getBoundingClientRect();
    const node = window.__atlasMap?.nodes().find((n) => n.id === id && !n.hidden);
    return node && box ? { x: box.left + node.x, y: box.top + node.y } : null;
  }, FOCUS);
  expect(chip, `${FOCUS} is not on the flat map`).not.toBeNull();
  await page.mouse.click(chip!.x, chip!.y);
  await expect.poll(() => page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null)).toBe(FOCUS);
  await waitForMapStill(page, { what: "camera" });
  await waitFrames(page, 4);
  await expect.poll(() => captionCount(page), { message: "the flat map named no relation of the focused domain" }).toBeGreaterThan(0);
  const flat = await captionCount(page);

  const counts: Record<string, number> = {};
  for (const view of ["strata", "coupling"]) {
    await chooseView(page, view);
    expect(await page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null), `${view} lost the focus`).toBe(FOCUS);
    counts[view] = await captionCount(page);
  }
  expect(counts.strata, `Strata named ${counts.strata} relations where the flat map named ${flat}`).toBeLessThanOrEqual(flat);
  expect(counts.coupling, `Neural named ${counts.coupling} relations where the flat map named ${flat}`).toBeLessThanOrEqual(flat);
});
