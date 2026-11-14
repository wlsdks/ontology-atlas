import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

import {
  parseWebviewVerifyPayload,
  validateWebviewVerifyPayload,
} from "./verify-macos-app-launch.mjs";
import {
  WEBVIEW_WORKBENCH_MARKERS,
  webviewWorkbenchMarkersForPath,
} from "../lib/verify-macos/webview-env.mjs";
import {
  validateLibrarySurfaceEvidence,
  validateOntologyMapCanvasEvidence,
  validateWindowStatePluginIsolation,
} from "../lib/verify-macos/payload-contract.mjs";

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
 * `tests/contract/desktop/desktop-probe-markers.contract.test.ts` stops the retired
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
 * (the ontology-map engine, Korean chrome labels, stage pan thresholds, …). Filling all of
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

test("payload contract · the workbench markers accept the current Korean shell", () => {
  const koreanShell = "Atlas\n지도\n문서함\n공방\n인사이트\n프로젝트\n지형도\nINDEX\n내 프로젝트";
  assert.equal(
    WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(koreanShell)),
    true,
    "the current shell copy does not pass the markers, so the markers are stale",
  );
  // Idling guard: if the markers pass anything, this check does not exist.
  assert.equal(
    WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test("lorem ipsum")),
    false,
  );
});

test("payload contract · the Agents route proves itself by its own body without map copy", () => {
  const markers = webviewWorkbenchMarkersForPath("/ko/agents/");
  assert.equal(
    markers.every((marker) =>
      marker.test("에이전트\n이 컴퓨터의 에이전트\nMCP 연결"),
    ),
    true,
  );
  assert.equal(markers.every((marker) => marker.test("Loading local app shell")), false);
});

test("payload contract · briefing requires its rendered surface, including source-only sessions", () => {
  const payload = validPayload({
    href: "tauri://localhost/ko/changes/",
    bodyText: "Visible briefing content",
    markers: { ontologyNav: false, libraryNav: false, briefingSurface: true, briefingRepositoryControl: true },
  });
  assert.equal(validateWebviewVerifyPayload(payload, { expectedPath: "/ko/changes/" }), null);
  assert.match(validateWebviewVerifyPayload({ ...payload, markers: { ...payload.markers, briefingSurface: false } }, { expectedPath: "/ko/changes/" }), /briefing surface/);
  assert.match(validateWebviewVerifyPayload({ ...payload, bodyText: "Git·PR briefing", markers: { ...payload.markers, briefingRepositoryControl: false } }, { expectedPath: "/ko/changes/" }), /briefing.*control/);
  assert.match(validateWebviewVerifyPayload({ ...payload, bodyText: " " }, { expectedPath: "/ko/changes/" }), /body text was empty/);
  assert.match(validateWebviewVerifyPayload({ ...payload, href: "tauri://localhost/ko/agents/" }, { expectedPath: "/ko/changes/" }), /ontology navigation marker|expected/);
});

test("briefing probe requires the visible repository action in either repository state", () => {
  const probe = readFileSync(new URL("../../src-tauri/src/webview_verify/dom_marker_probe.js", import.meta.url), "utf8");
  for (const repository of ["Choose repository", "ontology-atlas"]) {
    const dom = new JSDOM(`<main data-briefing-surface><header><h1>Briefing</h1><span>Prototype</span><button>${repository}</button><button data-testid="briefing-settings">Settings</button></header></main>`, { url: "https://localhost/ko/changes/", runScripts: "outside-only" });
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 100, height: 30 });
    Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    const markers = () => JSON.parse(dom.window.eval(probe)).markers;
    assert.equal(markers().briefingRepositoryControl, true, repository);
    const button = dom.window.document.querySelector("main header button");
    button.disabled = true;
    assert.equal(markers().briefingRepositoryControl, false, repository);
    button.disabled = false;
    button.style.display = "none";
    assert.equal(markers().briefingRepositoryControl, false, repository);
    button.remove();
    assert.equal(markers().briefingRepositoryControl, false, repository);
    dom.window.close();
  }
});

test("payload contract · Planning checks the destination and folder action in every locale", () => {
  for (const locale of ["en", "ja", "ko", "zh"]) {
    const messages = JSON.parse(readFileSync(new URL(`../../messages/${locale}/planning.json`, import.meta.url), "utf8"));
    const markers = webviewWorkbenchMarkersForPath(`/${locale}/planning/`);
    assert.equal(markers.length, 2, locale);
    const accepts = (text) => markers.every((marker) => marker.test(text));
    assert.equal(accepts(`${messages.title}\n${messages.chooseFolder}`), true, locale);
    assert.equal(accepts(messages.chooseFolder), false, `${locale}: missing destination`);
    assert.equal(accepts(messages.title), false, `${locale}: missing folder action`);
  }
});

test("payload contract · Planning requires its rendered surface and enabled folder action without a vault", () => {
  const payload = validPayload({
    href: "tauri://localhost/ko/planning/",
    bodyText: "기획 문서\n폴더 선택",
    markers: { ontologyNav: false, libraryNav: false, planningSurface: true, planningHeading: "기획 문서", planningFolderControl: true },
  });
  assert.equal(validateWebviewVerifyPayload(payload, { expectedPath: "/ko/planning/" }), null);
  assert.match(validateWebviewVerifyPayload({ ...payload, markers: { ...payload.markers, planningSurface: false } }, { expectedPath: "/ko/planning/" }), /planning surface/i);
  assert.match(validateWebviewVerifyPayload({ ...payload, markers: { ...payload.markers, planningHeading: "Other" } }, { expectedPath: "/ko/planning/" }), /planning heading/i);
  assert.match(validateWebviewVerifyPayload({ ...payload, markers: { ...payload.markers, planningFolderControl: false } }, { expectedPath: "/ko/planning/" }), /planning.*folder/i);
});

test("Planning probe requires a visible heading and an enabled folder action", () => {
  const probe = readFileSync(new URL("../../src-tauri/src/webview_verify/dom_marker_probe.js", import.meta.url), "utf8");
  const dom = new JSDOM('<main data-planning-surface><h1>Planning</h1><button data-planning-choose>Choose folder</button></main>', { url: "https://localhost/ko/planning/", runScripts: "outside-only" });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 100, height: 30 });
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
  const markers = () => JSON.parse(dom.window.eval(probe)).markers;
  assert.equal(markers().planningSurface, true);
  assert.equal(markers().planningFolderControl, true);
  const button = dom.window.document.querySelector("button");
  button.disabled = true;
  assert.equal(markers().planningFolderControl, false);
  button.disabled = false;
  button.setAttribute("aria-disabled", "true");
  assert.equal(markers().planningFolderControl, false);
  button.removeAttribute("aria-disabled");
  button.style.display = "none";
  assert.equal(markers().planningFolderControl, false);
  button.style.display = "";
  const main = dom.window.document.querySelector("main");
  main.setAttribute("inert", "");
  assert.equal(markers().planningFolderControl, false);
  main.removeAttribute("inert");
  main.setAttribute("hidden", "");
  assert.equal(markers().planningFolderControl, false);
  main.removeAttribute("hidden");
  main.setAttribute("aria-hidden", "true");
  assert.equal(markers().planningFolderControl, false);
  main.removeAttribute("aria-hidden");
  main.style.opacity = "0";
  assert.equal(markers().planningFolderControl, false);
  main.style.opacity = "";
  const heading = main.querySelector("h1");
  heading.textContent = "";
  assert.equal(markers().planningSurface, false);
  button.remove();
  assert.equal(markers().planningFolderControl, false);
  heading.remove();
  assert.equal(markers().planningSurface, false);
  dom.window.close();
});

test("payload contract · topology route accepts the current map shell", () => {
  const markers = webviewWorkbenchMarkersForPath("/en/topology/");
  // Body samples are truncated; the route title already proves app identity.
  const currentMapBody = "Map\nLibrary\nAutomations\nProjects\nAgents\nINDEX";
  assert.equal(markers.length, 2);
  assert.equal(markers.every((marker) => marker.test(currentMapBody)), true);
  assert.equal(markers.every((marker) => marker.test("지도\n자료실\n자동화\nINDEX")), true);
  assert.equal(markers.every((marker) => marker.test("Map\nLibrary\nAutomations")), false);
  assert.equal(markers.every((marker) => marker.test("INDEX")), false);
  assert.equal(markers.every((marker) => marker.test("Atlas\nDocs\nWorkshop")), false);
});

test("payload contract · a valid payload passes", () => {
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

test("payload contract · stops without v2 canvas pixel evidence", () => {
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

test("payload contract · rejects a malformed payload with a reason", () => {
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

test("payload contract · checks the route", () => {
  assert.equal(validateWebviewVerifyPayload(validPayload(), { expectedPath: "/ko/docs/" }), null);
  assert.match(
    validateWebviewVerifyPayload(validPayload(), { expectedPath: "/en/docs/" }),
    /route/i,
  );
});

test("payload contract · checks that the fixture vault is that vault", () => {
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

test("payload contract · measures the WebView size bounds", () => {
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

test("payload contract · confirms reduced motion when it is required", () => {
  const message = validateWebviewVerifyPayload(validPayload(), {
    requireWebviewReducedMotion: true,
  });
  assert.equal(typeof message, "string", "the reduced-motion requirement checks nothing");
  assert.match(message, /reduced/i);
});

test("payload contract · reads nested JSON back unchanged", () => {
  const payload = validPayload({ markers: { ontologyNav: true, nested: { a: [1, 2, { b: "c" }] } } });
  const stdout = `noise\n[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}\nmore noise\n`;
  assert.deepEqual(parseWebviewVerifyPayload(stdout), payload);
});

test("payload contract · topology routes require the ontology-map engine", () => {
  // Differential: the same map payload passes with the v2 engine and fails with any
  // other or none, so the failure belongs to the engine requirement alone.
  const mapPayload = (engine) =>
    validPayload({
      href: "tauri://localhost/en/topology/",
      markers: {
        ...(engine === undefined ? {} : { topologyMapEngine: engine }),
        ontologyMapCanvasInkPixels: 128,
        topologyStagePanClickCancelPx: 7,
      },
    });
  assert.equal(validateWebviewVerifyPayload(mapPayload("v2")), null);
  for (const engine of [undefined, "", "canvas", "sigma"]) {
    assert.equal(typeof validateWebviewVerifyPayload(mapPayload(engine)), "string", String(engine));
  }
  // The map's own requirements stay alive behind the engine gate.
  assert.equal(
    typeof validateWebviewVerifyPayload(
      validPayload({ href: "tauri://localhost/en/topology/", markers: { topologyMapEngine: "v2" } }),
    ),
    "string",
  );
});

test("workbench markers follow an injected four-locale list", () => {
  const locales = ["en", "ja", "ko", "zh"];
  for (const locale of locales) {
    const markers = webviewWorkbenchMarkersForPath(`/${locale}/library/`, locales);
    assert.notEqual(markers, WEBVIEW_WORKBENCH_MARKERS, locale);
    const briefingMarkers = webviewWorkbenchMarkersForPath(`/${locale}/changes/`, locales);
    assert.ok(briefingMarkers.length > 0, locale);
    assert.notEqual(briefingMarkers, WEBVIEW_WORKBENCH_MARKERS, locale);
    assert.equal(briefingMarkers.every((marker) => marker.test(" ")), false, locale);
  }
  assert.equal(webviewWorkbenchMarkersForPath("/ja/library/", ["en", "ko"]), WEBVIEW_WORKBENCH_MARKERS);
});
