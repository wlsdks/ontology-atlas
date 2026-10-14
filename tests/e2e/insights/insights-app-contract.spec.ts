import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { validateWebviewVerifyPayload } from "../../../scripts/lib/verify-macos/payload-contract.mjs";

/**
 * Runs the packaged app's DOM probe over the rendered screen and hands the result to the real
 * contract. Only the insights markers come from the browser; shell fields are the app's, since a
 * browser tab has no `tauri://` address or packaged window size.
 */
const PROBE_SOURCE = readFileSync(
  join(process.cwd(), "src-tauri", "src", "webview_verify", "dom_marker_probe.js"),
  "utf8",
);

/** The current Korean workbench shell, as the app reports it. */
const APP_SHELL_BODY_TEXT = "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX";

type Markers = Record<string, unknown>;

async function collectMarkers(page: import("@playwright/test").Page): Promise<Markers> {
  /* Let the panel finish its crossfade: the probe's visibility test reads opacity 0 as not visible. */
  await page.locator("[data-insights-panel]").first().evaluate(async (node) => {
    await Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)));
  });
  const raw = await page.evaluate(PROBE_SOURCE);
  const payload = JSON.parse(String(raw)) as { markers?: Markers };
  expect(payload.markers?.markerScriptError, "probe threw while collecting markers").toBeUndefined();
  return payload.markers ?? {};
}

function asAppPayload(markers: Markers, path: string) {
  return {
    href: `tauri://localhost${path}`,
    title: "Ontology Atlas",
    bodyText: APP_SHELL_BODY_TEXT,
    bodyChildren: 21,
    readyState: "complete",
    bg: "rgb(8, 9, 10)",
    color: "rgb(247, 248, 248)",
    width: 1512,
    height: 917,
    // Real markers first; the navigation trio is the app's shell, not this screen's business.
    markers: { ...markers, ontologyNav: true, sourceVaultNav: false, libraryNav: true },
  };
}

test.describe("Analysis agrees with the installed app probe", () => {
  test.use({ viewport: { width: 1512, height: 900 } });
  for (const [query, subject, panel] of [["", "ontology", "analysis"], ["?tab=brief", "brief", "brief"], ["?tab=composition", "ontology", "analysis"]]) {
    test(`reads the live ${panel} panel at ${query || 'default'}`, async ({ page }) => {
      await page.goto(`/ko/ontology/insights/${query}`);
      await expect(page.locator('[data-insights-panel]')).toBeVisible();
      const markers = await collectMarkers(page);
      expect(markers.insightsMaintenanceBoard).toBe(true);
      expect(markers.insightsSubjectCount).toBe(5);
      expect(markers.insightsSelectedSubject).toBe(`insights-core-${subject}`);
      expect(markers.insightsTabCount).toBe(5);
      expect(markers.insightsSelectedPanelKey).toBe(panel);
      expect(validateWebviewVerifyPayload(asAppPayload(markers, '/ko/ontology/insights/'))).toBeNull();
    });
  }
  test("removing a real section fails the installed app contract", async ({ page }) => {
    await page.goto('/ko/ontology/insights/');
    await expect(page.getByTestId('insights-core-harness')).toBeVisible();
    await page.getByTestId('insights-core-harness').evaluate(node => node.remove());
    const markers = await collectMarkers(page);
    expect(markers.insightsSubjectCount).toBe(4);
    expect(validateWebviewVerifyPayload(asAppPayload(markers, '/ko/ontology/insights/'))).toContain('subject count');
  });
});
