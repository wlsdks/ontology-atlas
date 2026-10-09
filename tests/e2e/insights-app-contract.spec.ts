import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { validateWebviewVerifyPayload } from "../../scripts/lib/verify-macos/payload-contract.mjs";

/**
 * **The packaged app's own probe, run against the rendered screen.**
 *
 * The installed app collects DOM markers with `src-tauri/src/webview_verify/dom_marker_probe.js`
 * and `scripts/lib/verify-macos/payload-contract.mjs` judges them. Those two files and this
 * screen can drift apart in complete silence: nothing in a unit run executes the probe against
 * real HTML, so the first sign is a failed verification eight minutes into a bundle build — or,
 * worse, a verification that quietly stopped measuring anything.
 *
 * Measured 2026-09-20: the contract pinned `[role="tab"] === 10` from the era when every entry
 * on this board was a tab. After the row was split in two the board opens on the brief, whose
 * first row is a radiogroup and which draws no question tabs at all, so `/ontology/insights`
 * could not pass under any correct rendering. This spec runs the real probe over the real screen
 * and hands the result to the real contract, in seconds.
 *
 * ⚠️ **Only the insights markers come from the browser.** The shell fields below are the app's,
 * because a browser tab is not a WebView: it has no `tauri://` address and no packaged window
 * size. Forcing them keeps a failure here meaning "the board and its contract disagree" rather
 * than "this is not the desktop app".
 */
const PROBE_SOURCE = readFileSync(
  join(process.cwd(), "src-tauri", "src", "webview_verify", "dom_marker_probe.js"),
  "utf8",
);

/** The current Korean workbench shell, as the app reports it. */
const APP_SHELL_BODY_TEXT = "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX";

type Markers = Record<string, unknown>;

async function collectMarkers(page: import("@playwright/test").Page): Promise<Markers> {
  /*
   * ⚠️ **Let the panel finish arriving.** The panel crossfades in, so it starts at opacity 0 and
   * the probe's own visibility test — which the packaged app applies after a nine-second hold —
   * reads it as not visible. Locally the fade is over before the probe runs and this passed; on a
   * CI runner it did not, three times (2026-09-20). Measure settled, or measure nothing.
   */
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
