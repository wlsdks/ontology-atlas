import { expect, test, type Page } from "@playwright/test";
import { activeTestId, arrive, capture, drawnNodes, pickDomain, rectOf, type Box } from "./map-canvas-interaction-harness";
import {
  waitForAnimationsDone,
  waitForBoxStill,
  waitForDomeEntered,
  waitForMapStill,
  waitFrames } from "../settle";

/**
 * Judged by rects, computed styles and `document.activeElement`, never by eye.
 * Captures are written only when `MAP_CANVAS_CAPTURE_DIR` names a folder outside the repo.
 */

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (b: Box, p: {
    x: number;
    y: number;
}) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
/** Capability realms expose individual edges; domain realms retain aggregated branches. */
async function enterRelationRealm(page: Page) {
    const label = await page.evaluate(() => window.__atlasMap!.nodes().find((node) => node.id === "capability:ontology-map")!.label);
    await page.getByTestId("topology-concept-search").click();
    const search = page.getByRole("dialog", { name: "이 지도에서 검색" });
    await expect(search).toBeVisible();
    await page.keyboard.type(label);
    await expect(search.locator('[role="option"][aria-selected="true"]')).toContainText(label);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await page.getByTestId("map-detail-panel-more-menu-trigger").click();
    await page.getByTestId("map-detail-panel-action-realm").click();
    await expect(page.getByTestId("topology-realm-chip")).toBeVisible();
    await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
    await waitForMapStill(page);
}
test.describe("map canvas interactions on the dogfood vault", () => {
    test.setTimeout(150000);
    test("MC-04: the edge hover card never lands on INDEX or the utility tiles", async ({ page }) => {
        await arrive(page, { width: 1040, height: 720 });
        await enterRelationRealm(page);
        // In a realm the INDEX column holds the realm's ledger.
        const index = (await rectOf(page, "topology-index-panel")) ?? (await rectOf(page, "topology-realm-ledger"));
        expect(index, "INDEX is open at arrival").not.toBeNull();
        const chrome = (await Promise.all(["topology-index-panel", "topology-realm-ledger", "topology-replay-growth", "topology-shortcuts-help-button", "topology-tour-button"].map((t) => rectOf(page, t)))).filter((r): r is Box => r !== null);
        const midpoints = await page.evaluate(() => {
            const m = (window as unknown as {
                __atlasMap: {
                    edges: () => Array<{
                        sourceId: string;
                        targetId: string;
                        visible: boolean;
                        hidden: boolean;
                        ax: number;
                        ay: number;
                        bx: number;
                        by: number;
                        controlX: number;
                        controlY: number;
                    }>;
                };
            }).__atlasMap;
            const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
            const drawn = new Set(window.__atlasMap!.nodes().filter((node) => !node.hidden && (node.alpha ?? 1) > 0.5).map((node) => node.id));
            return m
                .edges()
                .filter((e) => e.visible && !e.hidden && drawn.has(e.sourceId) && drawn.has(e.targetId))
                .map((e) => ({ x: c.x + 0.25 * e.ax + 0.5 * e.controlX + 0.25 * e.bx, y: c.y + 0.25 * e.ay + 0.5 * e.controlY + 0.25 * e.by }));
        });
        const free = midpoints.filter((p) => !chrome.some((r) => contains(r, p)) && p.x > 0 && p.x < 1040 && p.y > 0 && p.y < 720);
        expect(free.length, "edges to hover").toBeGreaterThan(3);
        let hovered = 0;
        for (const p of free.slice(0, 12)) {
            await page.mouse.move(p.x, p.y);
            const card = page.getByTestId("map-edge-hover-card");
            // The card answers this pointer a frame later and settles once measured.
            await waitFrames(page, 2);
            if (!(await card.isVisible().catch(() => false)))
                continue;
            await waitForBoxStill(card);
            const box = (await rectOf(page, "map-edge-hover-card"))!;
            hovered += 1;
            for (const r of chrome)
                expect(intersects(box, r), `hover card ${JSON.stringify(box)} over chrome ${JSON.stringify(r)} at ${p.x},${p.y}`).toBe(false);
        }
        expect(hovered, "at least one edge answered with its card").toBeGreaterThan(0);
        await capture(page, "mc04-edge-hover-1040");
    });
    test("MC-05: the strata legend holds no drawn node and never breaks a lone syllable", async ({ page }) => {
        await arrive(page, { width: 1040, height: 720 });
        await page.getByTestId("topology-view-3d").click();
        await page.getByTestId("topology-view-3d-choice-strata").click();
        await waitForDomeEntered(page, 60000);
        await waitForMapStill(page).catch(() => { });
        await expect(page.getByTestId("topology-light-legend")).toBeVisible();
        await waitForAnimationsDone(page.getByTestId("topology-light-legend"));
        await waitForBoxStill(page.getByTestId("topology-light-legend"));
        const legend = (await rectOf(page, "topology-light-legend"))!;
        expect(legend).not.toBeNull();
        const nodes = await drawnNodes(page);
        const under = nodes.filter((n) => contains(legend, n));
        expect(under.map((n) => n.label), "drawn nodes under the legend").toEqual([]);
        const note = page.getByTestId("topology-light-legend-note");
        if (await note.count())
            await expect(note).toHaveCSS("word-break", "keep-all");
        await capture(page, "mc05-strata-1040");
    });
    test("MC-07/MC-12/MC-13: one action grammar across the node and edge panels", async ({ page }) => {
        await arrive(page, { width: 1512, height: 949 });
        const domain = await pickDomain(page);
        await page.mouse.click(domain.x, domain.y);
        await expect(page.getByTestId("map-detail-panel")).toBeVisible();
        await waitForAnimationsDone(page.getByTestId("map-detail-panel"));
        await waitForBoxStill(page.getByTestId("map-detail-panel"));
        const row = await page.evaluate(() => {
            const actions = document.querySelector('[data-testid="map-detail-panel-actions"]')!;
            return [...actions.querySelectorAll<HTMLElement>(":scope > button, :scope > div > button")].map((b) => {
                const r = b.getBoundingClientRect();
                const text = b.textContent?.trim() ? getComputedStyle(b).fontSize : null;
                return { h: Math.round(r.height), radius: getComputedStyle(b).borderTopLeftRadius, text };
            });
        });
        expect(row.length).toBeGreaterThanOrEqual(2);
        expect(new Set(row.map((r) => r.h)).size, `heights ${JSON.stringify(row)}`).toBe(1);
        expect(new Set(row.map((r) => r.radius)).size, `radii ${JSON.stringify(row)}`).toBe(1);
        // Labelled controls share one type size; the footer's full-detail control wears the row's radius.
        expect(new Set(row.map((r) => r.text).filter(Boolean)).size, `type sizes ${JSON.stringify(row)}`).toBe(1);
        const fullDetailRadius = await page
            .getByTestId("map-detail-panel-open-full-detail")
            .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
        expect(fullDetailRadius).toBe(row[0]!.radius);
        const more = page.locator('[data-testid^="map-group-more-"]').first();
        if (await more.count()) {
            // The words, not the control box: the control spans the row, its label sits on the text column.
            const m = await more.evaluate((el) => {
                const words = el.querySelector(":scope > span:last-child") ?? el;
                return { family: getComputedStyle(words).fontFamily, x: words.getBoundingClientRect().x };
            });
            expect(m.family.toLowerCase()).not.toContain("mono");
            const rowText = await page.evaluate(() => {
                const span = document.querySelector("[data-datasheet-connection] span.truncate, [data-datasheet-connection] span:last-child")!;
                return span.getBoundingClientRect().x;
            });
            expect(Math.abs(m.x - rowText), "'+N more' starts on the row text column").toBeLessThanOrEqual(1);
        }
        const nodePanelWidth = (await rectOf(page, "map-detail-panel"))!.w;
        await capture(page, "mc07-detail-panel");
        // The same slot for an edge: same width, same primary grammar, read in the domain's realm
        // once the camera rests, not mid-flight.
        await enterRelationRealm(page);
        const edge = await page.evaluate(() => {
            const m = (window as unknown as {
                __atlasMap: {
                    edges: () => Array<{
                        sourceId: string;
                        targetId: string;
                        visible: boolean;
                        hidden: boolean;
                        ax: number;
                        ay: number;
                        bx: number;
                        by: number;
                        controlX: number;
                        controlY: number;
                        kind: string;
                    }>;
                    edgeAt: (x: number, y: number) => unknown;
                };
            }).__atlasMap;
            const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
            const mid = (x: {
                ax: number;
                ay: number;
                bx: number;
                by: number;
                controlX: number;
                controlY: number;
            }) => ({
                x: 0.25 * x.ax + 0.5 * x.controlX + 0.25 * x.bx,
                y: 0.25 * x.ay + 0.5 * x.controlY + 0.25 * x.by,
            });
            const drawn = new Set(window.__atlasMap!.nodes().filter((node) => !node.hidden && (node.alpha ?? 1) > 0.5).map((node) => node.id));
            const e = m.edges().find((x) => x.visible && !x.hidden && drawn.has(x.sourceId) && drawn.has(x.targetId) && Math.hypot(x.bx - x.ax, x.by - x.ay) > 60 && Boolean(m.edgeAt(mid(x).x, mid(x).y)));
            if (!e) return null;
            return { x: c.x + mid(e).x, y: c.y + mid(e).y };
        });
        expect(edge, "an individual relation can be selected in the capability realm").not.toBeNull();
        await page.mouse.click(edge!.x, edge!.y);
        const edgePanel = page.getByTestId("map-edge-panel");
        await expect(edgePanel).toBeVisible();
        expect(Math.round((await rectOf(page, "map-edge-panel"))!.w)).toBe(Math.round(nodePanelWidth));
        const edit = page.getByTestId("map-edge-edit");
        if (await edit.count()) {
            const e = await edit.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), radius: getComputedStyle(el).borderTopLeftRadius }));
            expect(e).toEqual({ h: row[0]!.h, radius: row[0]!.radius });
        }
        await capture(page, "mc13-edge-panel");
    });
    test("MC-14/MC-11/MC-10e: the tour offers no dead back, keeps its subjects in view, and ends on its tile", async ({ page }) => {
        await arrive(page, { width: 1512, height: 949 });
        await page.getByTestId("topology-tour-button").click();
        await expect(page.getByTestId("guided-tour-card")).toBeVisible();
        await expect(page.getByTestId("guided-tour-back")).toHaveCount(0);
        // Where [next] sits inside its card, not on the window: step 1 has no anchor and centres,
        // step 2 stands beside the project node, so the card itself moves by design.
        const nextInset = async () => {
            const card = (await rectOf(page, "guided-tour-card"))!;
            const next = (await rectOf(page, "guided-tour-next"))!;
            return { right: Math.round(card.x + card.w - (next.x + next.w)), bottom: Math.round(card.y + card.h - (next.y + next.h)) };
        };
        const nextBefore = await nextInset();
        for (let i = 0; i < 12; i++) {
            const step = await page.getByTestId("guided-tour-overlay").getAttribute("data-tour-step");
            // Settle on what the step shows, not on a clock: a fixed 700 ms read the card mid-entrance
            // on a slow CI runner and saw the Next button 74 px off.
            const tourCard = page.getByTestId("guided-tour-card");
            await waitForAnimationsDone(tourCard);
            await waitForBoxStill(tourCard);
            await waitForMapStill(page);
            const card = (await rectOf(page, "guided-tour-card"))!;
            if (step === "nodes") {
                // [next] keeps its place in the card when [back] appears beside it on step 2.
                expect(await nextInset(), "[next] holds the card's trailing corner").toEqual(nextBefore);
                // The card stands beside the node the step names, never on it.
                const cutout = (await rectOf(page, "topology-tour-anchor"))!;
                expect(cutout, "the anchor probe is projected onto the project node").not.toBeNull();
                const project = (await drawnNodes(page)).find((n) => n.id.startsWith("project:"))!;
                expect(contains(cutout, project), "the cutout is centred on the project node").toBe(true);
                expect(intersects(card, cutout), "the step 2 card covers the project node").toBe(false);
            }
            if (step === "relations" || step === "datasheet") {
                const labels = await page.evaluate(() => {
                    const m = (window as unknown as {
                        __atlasMap: {
                            labels: () => Array<{
                                nodeId: string;
                                minX: number;
                                minY: number;
                                maxX: number;
                                maxY: number;
                            }>;
                            selection: () => {
                                nodeId: string | null;
                            };
                        };
                    }).__atlasMap;
                    const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
                    return {
                        selected: m.selection().nodeId,
                        boxes: m.labels().map((b) => ({ id: b.nodeId, x: c.x + b.minX, y: c.y + b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY })),
                    };
                });
                const covered = labels.boxes.filter((b) => intersects(card, b));
                if (step === "datasheet") {
                    expect(covered.map((b) => b.id), "the datasheet card covers the node it describes").not.toContain(labels.selected);
                }
                else {
                    const heads = covered.filter((b) => b.id.startsWith("domain:") || b.id.startsWith("project:"));
                    expect(heads.map((b) => b.id), "the relations card covers a domain or the project").toEqual([]);
                }
                await capture(page, `mc11-tour-${step}`);
            }
            const finish = page.getByTestId("guided-tour-finish-tour");
            if (await finish.count()) {
                await finish.click();
                break;
            }
            const next = page.getByTestId("guided-tour-next");
            if (await next.count())
                await next.click();
            else if (await page.getByTestId("guided-tour-activate-target").count())
                await page.getByTestId("guided-tour-activate-target").click();
            else if (await page.getByTestId("guided-tour-finish").count()) {
                await page.getByTestId("guided-tour-finish").click();
                break;
            }
            else
                break;
        }
        await expect(page.getByTestId("guided-tour-overlay")).toHaveCount(0);
        await expect.poll(() => activeTestId(page)).toBe("topology-tour-button");
    });
    test("MC-06: in Strata the selected domain's lit neighbourhood stays clear of its panel", async ({ page }) => {
        await arrive(page, { width: 1040, height: 720 });
        await page.getByTestId("topology-view-3d").click();
        await page.getByTestId("topology-view-3d-choice-strata").click();
        await waitForDomeEntered(page, 60000);
        await waitForMapStill(page).catch(() => { });
        const target = (await drawnNodes(page)).find((n) => n.label === "에이전트 접근");
        expect(target, "the domain is drawn").toBeDefined();
        await page.mouse.click(target!.x, target!.y);
        await expect(page.getByTestId("map-detail-panel")).toBeVisible();
        await waitForBoxStill(page.getByTestId("map-detail-panel"));
        await waitForMapStill(page);
        const panel = (await rectOf(page, "map-detail-panel"))!;
        const under = await page.evaluate(({ id, left }) => {
            const m = (window as unknown as {
                __atlasMap: {
                    nodes: () => Array<{
                        id: string;
                        label: string;
                        x: number;
                        y: number;
                        hidden: boolean;
                    }>;
                    edges: () => Array<{
                        sourceId: string;
                        targetId: string;
                    }>;
                };
            }).__atlasMap;
            const c = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
            const lit = new Set<string>([id]);
            for (const e of m.edges()) {
                if (e.sourceId === id)
                    lit.add(e.targetId);
                if (e.targetId === id)
                    lit.add(e.sourceId);
            }
            return m
                .nodes()
                .filter((n) => lit.has(n.id) && !n.hidden && n.x + c.x > left)
                .map((n) => n.label);
        }, { id: target!.id, left: panel.x });
        expect(under, "lit neighbours under the panel").toEqual([]);
        await capture(page, "mc06-strata-focus-1040");
    });
});
