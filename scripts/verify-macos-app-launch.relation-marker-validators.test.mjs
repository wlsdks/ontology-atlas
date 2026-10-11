import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWebviewVerifyPayload,
  validateWebviewVerifyPayload,
  waitForWebviewVerifyPayload,
} from "./verify-macos-app-launch.mjs";

test("WebView verification payload parser uses the latest reported DOM snapshot", () => {
  const loadingPayload = {
    href: "tauri://localhost/en/",
    title: "Ontology Atlas",
    bodyText: "Loading local app shell",
    bodyChildren: 1,
    readyState: "loading",
    markers: {},
    width: 1,
    height: 1,
  };
  const loadedPayload = {
    ...loadingPayload,
    bodyText: "Workspace\nOntology\nRelief\nConcept map",
    bodyChildren: 19,
    readyState: "complete",
    markers: {
      ontologyNav: true,
      sourceVaultNav: false,
      libraryNav: true,
    },
    width: 1280,
    height: 789,
  };
  const stdout = [
    `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(loadingPayload))}`,
    `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(loadedPayload))}`,
  ].join("\n");

  assert.deepEqual(parseWebviewVerifyPayload(stdout), loadedPayload);
  assert.equal(validateWebviewVerifyPayload(parseWebviewVerifyPayload(stdout)), null);
});

test("WebView verification payload parser skips empty in-flight snapshots", () => {
  const payload = {
    href: "tauri://localhost/ko/topology/?mode=path",
    title: "지형도 · ontology-atlas",
    bodyText: "온톨로지 지형도\n후보 11/21개 표시 중",
    bodyChildren: 19,
    readyState: "complete",
    markers: {
      topologyMapEngine: "v2",
    },
    width: 1100,
    height: 768,
  };
  const stdout = [
    `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}`,
    "[ontology-atlas-webview-verify] ",
  ].join("\n");

  assert.deepEqual(parseWebviewVerifyPayload(stdout), payload);
});

test("WebView verification waits for the latest snapshot that passes route gates", async () => {
  // The map reports its engine before the first frame is drawn; ink arrives later.
  const pendingPayload = {
    href: "tauri://localhost/en/topology/",
    title: "Map · ontology-atlas",
    bodyText: "Workspace\nOntology\nMap\nConcept map",
    bodyChildren: 19,
    readyState: "complete",
    markers: {
      ontologyNav: true,
      sourceVaultNav: false,
      libraryNav: true,
      topologyMapEngine: "v2",
      ontologyMapCanvasInkPixels: 0,
      topologyStagePanClickCancelPx: 7,
    },
    width: 1280,
    height: 789,
  };
  const readyPayload = {
    ...pendingPayload,
    markers: { ...pendingPayload.markers, ontologyMapCanvasInkPixels: 4096 },
  };
  let stdout = `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(pendingPayload))}\n`;
  const result = await waitForWebviewVerifyPayload(
    () => stdout,
    {
      timeoutMs: 500,
      intervalMs: 10,
      validatePayload: (candidate) =>
        validateWebviewVerifyPayload(candidate, { expectedPath: "/en/topology/" }),
    },
  );
  assert.deepEqual(result.payload, pendingPayload);
  assert.equal(typeof result.validationError, "string");

  stdout += `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(readyPayload))}\n`;
  const readyResult = await waitForWebviewVerifyPayload(
    () => stdout,
    {
      timeoutMs: 500,
      intervalMs: 10,
      validatePayload: (candidate) =>
        validateWebviewVerifyPayload(candidate, { expectedPath: "/en/topology/" }),
    },
  );
  assert.deepEqual(readyResult, { payload: readyPayload, validationError: null });
});
