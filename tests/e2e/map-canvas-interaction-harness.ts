import { mkdirSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { waitForMapStill } from "./settle";

const CAPTURE_DIR = process.env.MAP_CANVAS_CAPTURE_DIR;
if (CAPTURE_DIR) mkdirSync(CAPTURE_DIR, { recursive: true });
export const capture = async (page: Page, name: string) => {
  if (CAPTURE_DIR) await page.screenshot({ path: `${CAPTURE_DIR}/${name}.png` });
};
export type Box = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export async function arrive(page: Page, viewport: {
    width: number;
    height: number;
}, extraFiles: Record<string, string> = {}) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installDesktopRailRuntime(page, { ...dogfoodVaultFiles(), ...extraFiles }, undefined, { replaceFixture: true });
    await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();
    await page.waitForFunction(() => ((window as unknown as {
        __atlasMap?: {
            nodes: () => unknown[];
        };
    }).__atlasMap?.nodes().length ?? 0) > 20, undefined, { timeout: 60000 });
    await waitForMapStill(page).catch(() => { });
}
export type DrawnNode = {
    id: string;
    label: string;
    kind: string;
    x: number;
    y: number;
    hidden: boolean;
};
/** Drawn nodes in page coordinates. */
export async function drawnNodes(page: Page): Promise<DrawnNode[]> {
    return page.evaluate(() => {
        const m = (window as unknown as {
            __atlasMap: {
                nodes: () => DrawnNode[];
            };
        }).__atlasMap;
        const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
        return m.nodes().filter((n) => !n.hidden).map((n) => ({ ...n, x: n.x + c.x, y: n.y + c.y }));
    });
}
export async function rectOf(page: Page, testid: string): Promise<Box | null> {
    return page.evaluate((t) => {
        const el = document.querySelector(`[data-testid="${t}"]`);
        if (!el)
            return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0)
            return null;
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, testid);
}
export const activeTestId = (page: Page) => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body)
        return "BODY";
    return a.dataset.testid ?? a.getAttribute("role") ?? a.tagName;
});
/** A domain drawn well inside the canvas, away from INDEX and the right-hand tiles. */
export async function pickDomain(page: Page) {
    const nodes = await drawnNodes(page);
    const vw = page.viewportSize()!.width;
    const pick = nodes.find((n) => n.kind === "domain" && n.x > 420 && n.x < vw - 420);
    expect(pick, "no domain drawn in the middle of the canvas").toBeDefined();
    return pick!;
}
