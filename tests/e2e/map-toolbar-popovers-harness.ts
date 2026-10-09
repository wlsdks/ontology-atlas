import { expect, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

const HEIGHT = 949;
const ACTIVITY_LINE = JSON.stringify({
    v: 1,
    at: new Date(Date.now() - 20 * 60000).toISOString(),
  tool: "add_concept",
  target: "capabilities/checkout",
  summary: "add_concept capability:capabilities/checkout",
  agent: "codex-acp",
  why: null,
});

/** The owner's state: a desktop folder, a path from checkout to invoice, one visit on the trail. */
export async function openOwnerState(page: Page, width = 1512) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, { ".ontology-atlas/activity.jsonl": `${ACTIVITY_LINE}\n` });
    await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();
    await waitForMapStill(page).catch(() => { });
    await page.goto("/ko/topology/?guides=off&e2e=1&mode=path&pathFrom=capabilities/checkout&p=capabilities/checkout", {
        waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("topology-trail-chip")).toBeVisible({ timeout: 30000 });
    await waitForMapStill(page).catch(() => { });
    const canvasBox = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    const target = await page.evaluate(() => {
        const map = (window as unknown as {
            __atlasMap?: {
                nodes(): Array<{
                    id: string;
                    x: number;
                    y: number;
                }>;
            };
        }).__atlasMap;
        return map?.nodes().find((node) => node.id === "capability:invoice") ?? null;
    });
    expect(target, "the path target is not on the map").not.toBeNull();
    await page.mouse.click(canvasBox.x + target!.x, canvasBox.y + target!.y);
    await expect(page.getByTestId("topology-path-chip-copy-packet")).toBeVisible();
    await expect(page.getByTestId("agent-activity-bell")).toHaveCount(1, { timeout: 30000 });
}
