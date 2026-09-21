import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWebviewVerifyPayload,
  validateWebviewVerifyPayload,
} from "./verify-macos-app-launch.mjs";
import {
  WEBVIEW_WORKBENCH_MARKERS,
  webviewWorkbenchMarkersForPath,
} from "./lib/verify-macos/webview-env.mjs";
import {
  validateLibrarySurfaceEvidence,
  validateOntologyMapCanvasEvidence,
  validateWindowStatePluginIsolation,
} from "./lib/verify-macos/payload-contract.mjs";

/**
 * **Installed-app WebView payload contract — measures only what is left**
 * (2026-08-12).
 *
 * ## Why this file shrank from 10,042 lines
 *
 * It used to carry **288 assertions**, **913 distinct marker names**, and **135**
 * mentions of `sigma`/`skeleton` — effectively a test suite for retired topology
 * probes. Those probes were retired in #1034 and #1036: they waited on Sigma-era
 * DOM that no longer exists, used a coordinate system anchored to the viewport
 * while the product anchors to the map, and pinned Korean copy verbatim. **Not one
 * of the eleven verification scripts could go green.**
 *
 * When that requirement disappeared, the two huge tests here that asserted "a
 * message must come back" received `null` and turned red — **the test outlived the
 * product.**
 *
 * So the tests were fitted to the product. What remains is **what actually runs on
 * every deploy today**: payload shape · route · fixture vault · reduced motion ·
 * WebView size. `pnpm desktop:deploy:app` passes those every session, and
 * `tests/contract/desktop-probe-markers.contract.test.ts` stops the retired
 * requirements coming back.
 *
 * ⚠️ **Do not read the shrinkage as a weaker check.** The 288 deleted assertions
 * **aimed at DOM that does not exist** — they were green because nobody ran them
 * (0 references in CI), not because the product was right.
 */

/**
 * The minimal payload that passes the contract — each check is verified by
 * breaking one thing at a time from here.
 *
 * ⚠️ **Uses the docs route.** `/topology` carries further live requirements
 * (Relief markers, Korean chrome labels, stage pan thresholds, …). Filling all of
 * those into the minimal payload would turn this test into **a copy of the map's
 * requirement list rather than a measurement of the general contract**. That the
 * map's requirements are still alive is verified separately by the last test
 * below.
 */
function validPayload({ markers: markerOverrides, ...overrides } = {}) {
  return {
    href: "tauri://localhost/ko/docs/",
    title: "Ontology Atlas",
    bodyText: "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX",
    bodyChildren: 21,
    readyState: "complete",
    bg: "rgb(8, 9, 10)",
    color: "rgb(247, 248, 248)",
    width: 1512,
    height: 917,
    // Markers are **merged** — overwriting drops the shell markers and a different
    // check fails first (this misled the author twice while writing these tests).
    markers: { ontologyNav: true, sourceVaultNav: false, libraryNav: true, ...markerOverrides },
    ...overrides,
  };
}

test("payload contract · 워크벤치 마커가 현행 한국어 셸을 받는다", () => {
  const koreanShell = "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX\n내 프로젝트";
  assert.equal(
    WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(koreanShell)),
    true,
    "현행 셸 문구가 마커를 통과하지 못한다 — 마커가 낡았다",
  );
  // Idling guard: if the markers pass anything, this check does not exist.
  assert.equal(
    WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test("lorem ipsum")),
    false,
  );
});

test("payload contract · Agents 라우트는 지도 문구 없이 자기 본문으로 증명한다", () => {
  const markers = webviewWorkbenchMarkersForPath("/ko/agents/");
  assert.equal(
    markers.every((marker) =>
      marker.test("에이전트\n이 컴퓨터의 도구\nMCP 연결"),
    ),
    true,
  );
  assert.equal(markers.every((marker) => marker.test("Loading local app shell")), false);
});

test("payload contract · topology route accepts the current map shell", () => {
  const markers = webviewWorkbenchMarkersForPath("/en/topology/");
  // Body samples are truncated; the route title already proves app identity.
  const currentMapBody = "Map\nLibrary\nAutomations\nInsights\nProjects\nAgents\nINDEX";
  assert.equal(markers.length, 2);
  assert.equal(markers.every((marker) => marker.test(currentMapBody)), true);
  assert.equal(markers.every((marker) => marker.test("지도\n자료실\n자동화\nINDEX")), true);
  assert.equal(markers.every((marker) => marker.test("Map\nLibrary\nAutomations")), false);
  assert.equal(markers.every((marker) => marker.test("INDEX")), false);
  assert.equal(markers.every((marker) => marker.test("Atlas\nDocs\nWorkshop")), false);
});

test("payload contract · 정상 페이로드는 통과한다", () => {
  assert.equal(validateWebviewVerifyPayload(validPayload()), null);
});

test("payload contract accepts the installed shell's consolidated Library navigation", () => {
  const installedStyle = validPayload({
    markers: { ontologyNav: true, sourceVaultNav: false, libraryNav: true },
  });
  const missingLibrary = validPayload({
    markers: { ontologyNav: true, sourceVaultNav: false, libraryNav: false },
  });
  const navigationCases = [installedStyle, missingLibrary];
  assert.equal(navigationCases.length, 2, "the installed and missing-Library payload inventory must not be empty");
  assert.equal(validateWebviewVerifyPayload(navigationCases[0]), null);
  assert.match(validateWebviewVerifyPayload(navigationCases[1]), /Library navigation marker/);
});

test("payload contract accepts a rendered Library-only workbench without code destinations", () => {
  const payload = validPayload({
    href: "tauri://localhost/ko/library/",
    bodyText: "자료실\n에이전트\nMCP\n기록\n이 폴더 안\n원문 4\n위키 5",
    markers: { ontologyNav: false, sourceVaultNav: false, libraryNav: true, librarySurface: true },
  });
  assert.equal(validateWebviewVerifyPayload(payload, { expectedPath: "/ko/library/" }), null);
  for (const marker of ["libraryNav", "librarySurface"]) {
    assert.match(
      validateWebviewVerifyPayload({ ...payload, markers: { ...payload.markers, [marker]: false } }, { expectedPath: "/ko/library/" }),
      /Library surface and navigation/,
    );
  }
  assert.match(
    validateWebviewVerifyPayload({ ...payload, href: "tauri://localhost/ko/docs/" }, { expectedPath: "/ko/library/" }),
    /ontology navigation marker/,
  );
});

test("payload contract accepts populated and empty Ontology panels only with rendered content", () => {
  const ontologyMarkers = {
    ontologyNav: false,
    sourceVaultNav: false,
    libraryNav: true,
    librarySurface: true,
    librarySelectedTab: "ontology",
    librarySelectedPanelVisible: true,
    libraryOntologyHeadingCount: 1,
  };
  const reader = validPayload({
    href: "tauri://localhost/ko/library/?tab=ontology",
    markers: {
      ...ontologyMarkers,
      libraryOntologyContentState: "document-reader",
      libraryOntologyReaderVisible: true,
      libraryOntologyStarterVisible: false,
    },
  });
  const starter = validPayload({
    href: "tauri://localhost/ko/library/?tab=ontology",
    markers: {
      ...ontologyMarkers,
      libraryOntologyContentState: "ontology-starter",
      libraryOntologyReaderVisible: false,
      libraryOntologyStarterVisible: true,
    },
  });
  assert.equal(validateWebviewVerifyPayload(reader), null);
  assert.equal(validateWebviewVerifyPayload(starter), null);

  const brokenConditions = [
    ["selected tab", { librarySelectedTab: "wiki" }],
    ["visible panel", { librarySelectedPanelVisible: false }],
    ["page heading", { libraryOntologyHeadingCount: 0 }],
    ["rendered content", {
      libraryOntologyContentState: "",
      libraryOntologyReaderVisible: false,
      libraryOntologyStarterVisible: false,
    }],
    ["matching starter state", { libraryOntologyReaderVisible: true }],
  ];
  for (const [name, markerOverrides] of brokenConditions) {
    assert.ok(
      validateLibrarySurfaceEvidence(
        { ...starter.markers, ...markerOverrides },
        { requireOntology: true },
      ),
      `${name} must remain required`,
    );
  }
});

test("payload contract · v2 캔버스 픽셀 증거가 없으면 멈춘다", () => {
  assert.match(
    validateOntologyMapCanvasEvidence({ topologyMapEngine: "v2" }),
    /rendered pixels/,
  );
  assert.match(
    validateOntologyMapCanvasEvidence({ topologyMapEngine: "v2", ontologyMapCanvasInkPixels: 0 }),
    /rendered pixels/,
  );
  assert.equal(
    validateOntologyMapCanvasEvidence({ topologyMapEngine: "v2", ontologyMapCanvasInkPixels: 128 }),
    null,
  );
});

test("payload contract · 모양이 틀린 페이로드를 이유와 함께 막는다", () => {
  assert.match(validateWebviewVerifyPayload(null), /missing WebView verification payload/);
  assert.match(
    validateWebviewVerifyPayload(validPayload({ href: "https://example.com/" })),
    /tauri:\/\//,
  );
  assert.match(
    validateWebviewVerifyPayload(validPayload({ readyState: "loading" })),
    /readyState=loading/,
  );
  // 2026-09-06: a deploy check ran against a locked display; the map mounts after one
  // animation frame, WebKit fires none for a hidden document, and the run failed on
  // "marker missing" for a screen nobody saw. The hidden state is named before any marker.
  assert.match(
    validateWebviewVerifyPayload(validPayload({ visibilityState: "hidden" })),
    /document is hidden.*display is locked/,
  );
  assert.equal(
    validateWebviewVerifyPayload(validPayload({ visibilityState: "visible" })),
    validateWebviewVerifyPayload(validPayload()),
  );
  assert.match(validateWebviewVerifyPayload(validPayload({ bodyText: "   " })), /body text was empty/);
  assert.match(
    validateWebviewVerifyPayload(validPayload({ bodyText: "lorem ipsum dolor" })),
    /workbench markers/,
  );
  // The "no markers at all" case bypasses the merge and is built directly.
  assert.match(
    validateWebviewVerifyPayload({ ...validPayload(), markers: null }),
    /structured markers/,
  );
});

test("payload contract · 라우트를 확인한다", () => {
  assert.equal(validateWebviewVerifyPayload(validPayload(), { expectedPath: "/ko/docs/" }), null);
  assert.match(
    validateWebviewVerifyPayload(validPayload(), { expectedPath: "/en/docs/" }),
    /route/i,
  );
});

test("payload contract · 픽스처 볼트가 그 볼트인지 확인한다", () => {
  const vault = "/tmp/atlas-fixture";
  // Blocks a different vault (or none) when a vault was requested — the accident
  // this guards against is claiming verification after reading the user's real
  // vault.
  assert.match(
    validateWebviewVerifyPayload(validPayload(), { expectedFixtureVault: vault }),
    /fixture vault/,
  );
  assert.match(
    validateWebviewVerifyPayload(
      validPayload({ markers: { verificationFixtureVaultError: "boom" } }),
      { expectedFixtureVault: vault },
    ),
    /fixture vault bootstrap failed/,
  );
  assert.equal(
    validateWebviewVerifyPayload(
      validPayload({ markers: { verificationFixtureVault: vault, verificationFixtureVaultError: "" } }),
      { expectedFixtureVault: vault },
    ),
    null,
  );
});

test("payload contract · WebView 크기 상·하한을 잰다", () => {
  assert.match(
    validateWebviewVerifyPayload(validPayload({ width: 900, height: 600 }), {
      minWebviewSize: { width: 1400, height: 860 },
    }),
    /viewport was 900x600, expected at least 1400x860/,
  );
  assert.equal(
    validateWebviewVerifyPayload(validPayload(), { minWebviewSize: { width: 1400, height: 860 } }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload(validPayload({ width: 2000, height: 1400 }), {
      maxWebviewSize: { width: 1100, height: 800 },
    }),
    /viewport was 2000x1400/,
  );
});

test("payload contract · window-state plugin isolation is observed, not assumed", () => {
  const disabledLine = "[ontology-atlas-window-verify] state_plugin=disabled";
  const enabledLine = "[ontology-atlas-window-verify] state_plugin=enabled";
  // Pass: the app said it dropped the plugin for this verify launch.
  assert.equal(
    validateWindowStatePluginIsolation(`noise\n${disabledLine}\nmore noise`),
    null,
  );
  // Fail: the plugin ran — the run may have consumed and overwritten the owner's
  // saved window geometry, so its size verdict is worthless. The message must say
  // that, not merely "unexpected value".
  const enabledMessage = validateWindowStatePluginIsolation(`noise\n${enabledLine}`);
  assert.match(enabledMessage, /state_plugin=enabled/);
  assert.match(enabledMessage, /window geometry/);
  // Fail: silence. A launch that never reports the marker is indistinguishable
  // from a build where the marker — and the guard behind it — was deleted.
  const absentMessage = validateWindowStatePluginIsolation("noise only\nno marker here");
  assert.match(absentMessage, /state_plugin/);
  assert.match(absentMessage, /window geometry/);
});

test("payload contract · launch stdout wires the isolation verdict into the payload contract", () => {
  // The option is opt-in: callers without a launch stream (browser-side reuse of the
  // contract) keep today's verdicts, which the other tests in this file pin.
  assert.equal(
    validateWebviewVerifyPayload(validPayload(), {
      launchStdout: "[ontology-atlas-window-verify] state_plugin=disabled",
    }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload(validPayload(), {
      launchStdout: "[ontology-atlas-window-verify] state_plugin=enabled",
    }),
    /state_plugin=enabled/,
  );
  // An empty capture counts as launched-with-env but unobserved — it must fail.
  assert.match(
    validateWebviewVerifyPayload(validPayload(), { launchStdout: "" }),
    /never reported the window-state plugin marker/,
  );
});

test("payload contract · 감속 모션을 요구하면 그 사실을 확인한다", () => {
  const message = validateWebviewVerifyPayload(validPayload(), {
    requireWebviewReducedMotion: true,
  });
  assert.equal(typeof message, "string", "감속 요구가 아무것도 확인하지 않는다");
  assert.match(message, /reduced/i);
});

test("payload contract · 중첩 JSON 을 그대로 되읽는다", () => {
  const payload = validPayload({ markers: { ontologyNav: true, nested: { a: [1, 2, { b: "c" }] } } });
  const stdout = `noise\n[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}\nmore noise\n`;
  assert.deepEqual(parseWebviewVerifyPayload(stdout), payload);
});

test("payload contract · 지도 라우트의 요구는 여전히 살아 있다", () => {
  /*
   * What was retired is **the card-era probes**; the map payload's baseline
   * requirements stand. Without this test the file would measure only the general
   * contract, and the map side could go silently inert with nobody noticing.
   */
  const message = validateWebviewVerifyPayload(
    validPayload({ href: "tauri://localhost/ko/topology/" }),
  );
  assert.equal(typeof message, "string", "지도 라우트인데 아무것도 요구하지 않는다");
  assert.match(message, /topology|Relief/i);
});

/**
 * The insights board has **two rows that are not the same kind of control**: the
 * subject row is a radiogroup (brief · concepts · library · harness) and only the
 * concepts subject opens a row of question tabs underneath it.
 *
 * Measured 2026-09-20: the contract pinned one number, `[role="tab"] === 10`, from
 * the era when every entry was a tab. After the split the board opens on the brief,
 * which draws **zero** tabs, so the packaged-app verification could not pass on that
 * route under any correct rendering. These cases hold each landing separately.
 */
function insightsPayload(markerOverrides) {
  return validPayload({
    href: "tauri://localhost/ko/ontology/insights/",
    markers: {
      insightsMaintenanceBoard: true,
      insightsQuestionModel: "one-tab-one-question",
      insightsSubjectCount: 4,
      insightsSelectedSubject: "insights-core-brief",
      insightsSelectedPanelKey: "brief",
      insightsSelectedPanelVisible: true,
      insightsTabCount: 0,
      insightsSelectedTabCount: 0,
      insightsHandoff: false,
      ...markerOverrides,
    },
  });
}

test("payload contract · the insights brief landing passes with no question tabs", () => {
  assert.equal(validateWebviewVerifyPayload(insightsPayload()), null);
});

test("payload contract · the insights concepts landing still owes its question row", () => {
  const onConcepts = {
    insightsSelectedSubject: "insights-core-ontology",
    insightsSelectedPanelKey: "composition",
    insightsTabCount: 7,
    insightsSelectedTabCount: 1,
    insightsHandoff: true,
  };
  assert.equal(validateWebviewVerifyPayload(insightsPayload(onConcepts)), null);
  assert.match(
    validateWebviewVerifyPayload(insightsPayload({ ...onConcepts, insightsTabCount: 6 })),
    /question tab count/,
  );
  assert.match(
    validateWebviewVerifyPayload(insightsPayload({ ...onConcepts, insightsHandoff: false })),
    /handoff/,
  );
  // The to-do question offers the agent per row, so it carries no tab-wide handoff row.
  assert.equal(
    validateWebviewVerifyPayload(
      insightsPayload({ ...onConcepts, insightsSelectedPanelKey: 'do-next', insightsHandoff: false }),
    ),
    null,
  );
});

test("payload contract · a vanished insights subject or panel fails", () => {
  assert.match(
    validateWebviewVerifyPayload(insightsPayload({ insightsSubjectCount: 3 })),
    /subject count/,
  );
  assert.match(
    validateWebviewVerifyPayload(insightsPayload({ insightsSelectedPanelKey: "" })),
    /drew no panel/,
  );
  assert.match(
    validateWebviewVerifyPayload(insightsPayload({ insightsSelectedPanelVisible: false })),
    /not visible/,
  );
  // The pre-split shape: ten tabs on a subject that draws none.
  assert.match(
    validateWebviewVerifyPayload(insightsPayload({ insightsTabCount: 10, insightsSelectedTabCount: 1 })),
    /question tab count/,
  );
});
