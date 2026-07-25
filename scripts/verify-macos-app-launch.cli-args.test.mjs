import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWebviewRoute,
  parseMinWindowSize,
  parseVerifyAppLaunchArgs,
} from "./verify-macos-app-launch.mjs";

test("verify app launch args keep executable launch defaults", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([], {
      defaultAppPath: "/tmp/Ontology Atlas.app",
      defaultHoldMs: 5000,
    }),
    {
      appPath: "/tmp/Ontology Atlas.app",
      holdMs: 5000,
      killExisting: false,
      leaveRunning: false,
      openApp: false,
      requireWindow: false,
      requireCapturableWindow: false,
      requireAccessibilityWindow: false,
      requireFrontmost: false,
      requireWebviewContent: true,
      requireWebviewRoute: null,
      verifyTopologyDrag: false,
      verifyTopologySelectedRelation: false,
      verifyTopologyNodePopover: false,
      verifyTopologyCreateNode: false,
      verifyTopologyFocusNoop: false,
      verifyTopologyFocusZoom: false,
      verifyTopologyFrameProfile: false,
      requireWebviewReducedMotion: false,
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
      minWebviewSize: null,
      maxWebviewSize: null,
      webviewWindowSize: null,
      windowScreenshotPath: null,
      tryWindowScreenshotPath: null,
      webviewEvidencePath: null,
      requireAccessibilityText: [],
    },
  );
});

test("verify app launch args keep LaunchServices dogfood compatible with window checks", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([
      "/tmp/Custom.app",
      "--open-app",
      "--require-window",
      "--require-capturable-window",
      "--require-accessibility-window",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 5000,
      killExisting: false,
      leaveRunning: false,
      openApp: true,
      requireWindow: true,
      requireCapturableWindow: true,
      requireAccessibilityWindow: true,
      requireFrontmost: false,
      requireWebviewContent: false,
      requireWebviewRoute: null,
      verifyTopologyDrag: false,
      verifyTopologySelectedRelation: false,
      verifyTopologyNodePopover: false,
      verifyTopologyCreateNode: false,
      verifyTopologyFocusNoop: false,
      verifyTopologyFocusZoom: false,
      verifyTopologyFrameProfile: false,
      requireWebviewReducedMotion: false,
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
      minWebviewSize: null,
      maxWebviewSize: null,
      webviewWindowSize: null,
      windowScreenshotPath: null,
      tryWindowScreenshotPath: null,
      webviewEvidencePath: null,
      requireAccessibilityText: [],
    },
  );
});

test("verify app launch args support stale-process cleanup, LaunchServices, and window checks", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([
      "/tmp/Custom.app",
      "--hold-ms=7000",
      "--kill-existing",
      "--leave-running",
      "--open-app",
      "--require-window",
      "--require-capturable-window",
      "--require-accessibility-window",
      "--require-frontmost",
      "--require-webview-content",
      "--require-webview-route=/en/topology/",
      "--verify-topology-drag",
      "--verify-topology-create-node",
      "--verify-topology-focus-noop",
      "--require-webview-reduced-motion",
      "--print-window-diagnostics",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1040x720",
      "--min-webview-size=1400x860",
      "--max-webview-size=1600x1000",
      "--webview-window-size=1500x940",
      "--window-screenshot=/tmp/ontology-atlas-window.png",
      "--try-window-screenshot=/tmp/ontology-atlas-best-effort.png",
      "--webview-evidence=/tmp/ontology-atlas-webview.json",
      "--require-accessibility-text=개념 지도",
      "--require-accessibility-text=AI 에이전트 그래프 검증",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 7000,
      killExisting: true,
      leaveRunning: true,
      openApp: true,
      requireWindow: true,
      requireCapturableWindow: true,
      requireAccessibilityWindow: true,
      requireFrontmost: true,
      requireWebviewContent: true,
      requireWebviewRoute: "/en/topology/",
      verifyTopologyDrag: true,
      verifyTopologySelectedRelation: false,
      verifyTopologyNodePopover: false,
      verifyTopologyCreateNode: true,
      verifyTopologyFocusNoop: true,
      verifyTopologyFocusZoom: false,
      verifyTopologyFrameProfile: false,
      requireWebviewReducedMotion: true,
      printWindowDiagnostics: true,
      requireOwnerName: "Ontology Atlas",
      minWindowSize: { width: 1040, height: 720 },
      minWebviewSize: { width: 1400, height: 860 },
      maxWebviewSize: { width: 1600, height: 1000 },
      webviewWindowSize: { width: 1500, height: 940 },
      windowScreenshotPath: "/tmp/ontology-atlas-window.png",
      tryWindowScreenshotPath: "/tmp/ontology-atlas-best-effort.png",
      webviewEvidencePath: "/tmp/ontology-atlas-webview.json",
      requireAccessibilityText: ["개념 지도", "AI 에이전트 그래프 검증"],
    },
  );
});

test("verify app launch args normalize direct WebView route checks and allow route inspection", () => {
  assert.equal(normalizeWebviewRoute("/en/topology/"), "/en/topology/");
  assert.equal(normalizeWebviewRoute("/en/topology/?mode=path"), "/en/topology/?mode=path");
  assert.equal(normalizeWebviewRoute(" /ko/ontology/ "), "/ko/ontology/");
  assert.equal(normalizeWebviewRoute("en/topology/"), null);
  assert.equal(normalizeWebviewRoute("//evil.test"), null);
  assert.equal(normalizeWebviewRoute("https://evil.test/en/topology/"), null);
  assert.equal(normalizeWebviewRoute("/en/topology/ bad"), null);
  assert.deepEqual(
    parseVerifyAppLaunchArgs([
      "/tmp/Custom.app",
      "--leave-running",
      "--require-window",
      "--require-webview-route=/en/topology/",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 5000,
      killExisting: false,
      leaveRunning: true,
      openApp: false,
      requireWindow: true,
      requireCapturableWindow: false,
      requireAccessibilityWindow: false,
      requireFrontmost: false,
      requireWebviewContent: true,
      requireWebviewRoute: "/en/topology/",
      verifyTopologyDrag: false,
      verifyTopologySelectedRelation: false,
      verifyTopologyNodePopover: false,
      verifyTopologyCreateNode: false,
      verifyTopologyFocusNoop: false,
      verifyTopologyFocusZoom: false,
      verifyTopologyFrameProfile: false,
      requireWebviewReducedMotion: false,
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
      minWebviewSize: null,
      maxWebviewSize: null,
      webviewWindowSize: null,
      windowScreenshotPath: null,
      tryWindowScreenshotPath: null,
      webviewEvidencePath: null,
      requireAccessibilityText: [],
    },
  );
});

test("parseMinWindowSize accepts WIDTHxHEIGHT only", () => {
  assert.deepEqual(parseMinWindowSize("1280x820"), { width: 1280, height: 820 });
  assert.equal(parseMinWindowSize("1280"), null);
  assert.equal(parseMinWindowSize("widextall"), null);
});
