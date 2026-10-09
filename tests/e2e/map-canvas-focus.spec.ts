import { expect, test } from "@playwright/test";
import { activeTestId, arrive, capture, pickDomain, rectOf } from "./map-canvas-interaction-harness";
import { waitForAnimationsDone, waitFrames } from "./settle";

test.describe("map canvas focus on the dogfood vault", () => {
    test.setTimeout(150000);
    test("MC-01: the context menu takes focus, walks with the arrows, and gives focus back to the canvas", async ({ page }) => {
        await arrive(page, { width: 1512, height: 949 });
        const domain = await pickDomain(page);
        await page.mouse.click(domain.x, domain.y, { button: "right" });
        const menu = page.getByTestId("map-context-menu");
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute("aria-label", /.+/);
        // Focus lands on the first item, inside the menu.
        await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
        const focusedItem = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="map-context-menu"] [role="menuitem"]')].indexOf(document.activeElement!));
        const firstItem = await focusedItem();
        await page.keyboard.press("ArrowDown");
        // The arrow is handled once focus has moved to another item; a map walk would open its panel on the same key.
        await expect.poll(focusedItem).not.toBe(firstItem);
        await waitFrames(page, 2);
        // The arrow moved inside the menu; the map did not walk and open a panel behind it.
        expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="map-context-menu"]') !== null)).toBe(true);
        await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
        await capture(page, "mc01-ctx-arrowdown");
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect.poll(() => activeTestId(page)).toBe("ontology-map-canvas");
    });
    test("MC-10: full detail, INDEX fold and INDEX search hand focus back", async ({ page }) => {
        await arrive(page, { width: 1512, height: 949 });
        // (f) Esc in a non-empty INDEX search clears it and keeps the caret there.
        const search = page.getByTestId("topology-index-search");
        await search.fill("지도");
        await search.press("Escape");
        await expect(search).toHaveValue("");
        expect(await activeTestId(page)).toBe("topology-index-search");
        // (c) folding INDEX lands on the tab; unfolding lands on the fold button.
        await page.getByTestId("topology-index-fold").click();
        await expect.poll(() => activeTestId(page)).toBe("topology-index-tab");
        await page.getByTestId("topology-index-tab").click();
        await expect.poll(() => activeTestId(page)).toBe("topology-index-fold");
        // (d) full detail closes back to its own button.
        const domain = await pickDomain(page);
        await page.mouse.click(domain.x, domain.y);
        await expect(page.getByTestId("map-detail-panel")).toBeVisible();
        await page.getByTestId("map-detail-panel-open-full-detail").click();
        const fullDetail = page.getByTestId("topology-full-detail-a1-positioner");
        await expect(fullDetail).toBeVisible();
        await waitForAnimationsDone(fullDetail);
        await page.keyboard.press("Escape");
        await expect.poll(() => activeTestId(page)).toBe("map-detail-panel-open-full-detail");
    });
    test("MC-09/MC-10a: adding to an existing map says so, matches its sibling dialog, and returns focus", async ({ page }) => {
        await arrive(page, { width: 1512, height: 949 }, { "notes/loose-note.md": "# A loose note\n\nNo frontmatter yet.\n" });
        const row = page.getByTestId("topology-index-uncataloged-docs");
        await expect(row).toBeVisible({ timeout: 30000 });
        await row.click();
        const panel = page.getByTestId("ontology-bootstrap-panel");
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute("aria-label", "지도에 추가");
        await expect(page.getByTestId("ontology-bootstrap-title")).toHaveCount(0);
        // Round 2: with the name field gone, focus still opens inside the dialog, on the first
        // folder choice, never on <body> with the backdrop as the first Tab stop.
        await expect
            .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="ontology-bootstrap-panel"]')))
            .toBe(true);
        expect(await activeTestId(page)).toMatch(/^ontology-bootstrap-domain-/);
        const confirm = page.getByTestId("ontology-bootstrap-confirm");
        await expect(confirm).toContainText("지도에 추가");
        expect(Math.round((await rectOf(page, "ontology-bootstrap-confirm"))!.h)).toBe(40);
        await capture(page, "mc09-add-to-map");
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect.poll(() => activeTestId(page)).toBe("topology-index-uncataloged-docs");
    });
    test("MC-17: every picker view is kept in the address", async ({ page }) => {
        await arrive(page, { width: 1512, height: 949 });
        for (const view of ["strata", "coupling", "hex", "territories"] as const) {
            await page.getByTestId("topology-view-3d").click();
            await page.getByTestId(`topology-view-3d-choice-${view}`).click();
            await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe(view);
        }
        await page.getByTestId("topology-view-3d").click();
        await page.getByTestId("topology-view-3d-choice-flat").click();
        await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBeNull();
    });
});
