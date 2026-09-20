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

test.describe("분석 보드 — 설치 앱의 프로브와 계약이 이 화면과 맞는다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("브리핑으로 열면 주제 4개·질문 0개로 계약을 통과한다", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("insights-core-switch")).toBeVisible({ timeout: 20_000 });

    const markers = await collectMarkers(page);
    // Idling guards — an empty probe would satisfy every assertion that follows.
    expect(markers.insightsMaintenanceBoard, "프로브가 보드를 못 찾았다 — 셀렉터가 낡았다").toBe(true);
    expect(markers.insightsSubjectCount, "주제 행을 못 셌다").toBe(4);
    expect(markers.insightsSelectedSubject).toBe("insights-core-brief");
    expect(markers.insightsTabCount, "브리핑엔 질문 탭이 없다").toBe(0);
    expect(markers.insightsSelectedPanelKey).toBe("brief");

    expect(validateWebviewVerifyPayload(asAppPayload(markers, "/ko/ontology/insights/"))).toBeNull();
  });

  test("개념으로 열면 질문 7개와 핸드오프까지 계약을 통과한다", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off&tab=composition", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("insights-core-switch")).toBeVisible({ timeout: 20_000 });

    const markers = await collectMarkers(page);
    expect(markers.insightsSelectedSubject).toBe("insights-core-ontology");
    expect(markers.insightsTabCount, "개념의 질문 행을 못 셌다").toBe(7);
    expect(markers.insightsSelectedTabCount).toBe(1);
    expect(markers.insightsHandoff, "이 질문은 탭 전체 핸드오프 줄을 가진다").toBe(true);

    expect(
      validateWebviewVerifyPayload(asAppPayload(markers, "/ko/ontology/insights/?tab=composition")),
    ).toBeNull();
  });

  test("주제 하나가 사라지면 계약이 그 사실을 말한다", async ({ page }) => {
    /*
     * The probe and the contract must still be able to fail. Removing one subject from the live
     * DOM is the cheapest deliberate RED: if this passes, the two files have stopped measuring
     * the board and the two green cases above prove nothing.
     */
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("insights-core-harness")).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => document.querySelector('[data-testid="insights-core-harness"]')?.remove());

    const markers = await collectMarkers(page);
    expect(markers.insightsSubjectCount).toBe(3);
    const message = validateWebviewVerifyPayload(asAppPayload(markers, "/ko/ontology/insights/"));
    expect(message, "주제가 하나 사라졌는데 계약이 통과했다").toContain("subject count");
  });
});
