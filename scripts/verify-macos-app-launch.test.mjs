import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildAccessibilityWindowProbeScript,
  buildAccessibilityTextProbeSwift,
  buildForegroundActivationScript,
  bundlePathConflictWarnings,
  classifyVisualEvidenceBlocker,
  createVerifyLock,
  existingProcessPatterns,
  formatWindowDiagnosticsPayload,
  normalizeWebviewRoute,
  parseAccessibilityWindowRows,
  parseMinWindowSize,
  parseOnscreenWindows,
  parseVerifyAppLaunchArgs,
  parseWebviewVerifyPayload,
  validateAccessibilityWindowRows,
  validateAccessibilityText,
  validateCapturableWindowRows,
  validateFrontmostAccessibilityRows,
  validateVisualEvidenceStats,
  validateWindowRequirements,
  validateWebviewVerifyPayload,
  verifyLockPath,
  waitForExistingProcessesToExit,
  waitForWebviewVerifyPayload,
  windowCaptureTargets,
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
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
      minWebviewSize: null,
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
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
      minWebviewSize: null,
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
      "--print-window-diagnostics",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1040x720",
      "--min-webview-size=1400x860",
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
      printWindowDiagnostics: true,
      requireOwnerName: "Ontology Atlas",
      minWindowSize: { width: 1040, height: 720 },
      minWebviewSize: { width: 1400, height: 860 },
      windowScreenshotPath: "/tmp/ontology-atlas-window.png",
      tryWindowScreenshotPath: "/tmp/ontology-atlas-best-effort.png",
      webviewEvidencePath: "/tmp/ontology-atlas-webview.json",
      requireAccessibilityText: ["개념 지도", "AI 에이전트 그래프 검증"],
    },
  );
});

test("verify app launch args normalize direct WebView route checks and allow route inspection", () => {
  assert.equal(normalizeWebviewRoute("/en/topology/"), "/en/topology/");
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
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
      minWebviewSize: null,
      windowScreenshotPath: null,
      tryWindowScreenshotPath: null,
      webviewEvidencePath: null,
      requireAccessibilityText: [],
    },
  );
});

test("verify app launch waits until stale processes disappear after cleanup", async () => {
  const calls = [];
  const slept = [];
  const remaining = await waitForExistingProcessesToExit({
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    timeoutMs: 1000,
    intervalMs: 100,
    readProcessIds: ({ appPath, executablePath }) => {
      calls.push({ appPath, executablePath });
      return calls.length < 3 ? [101, 202] : [];
    },
    sleepFn: async (ms) => {
      slept.push(ms);
    },
  });

  assert.deepEqual(remaining, []);
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [100, 100]);
});

test("verify app launch reports stale processes that survive cleanup polling", async () => {
  const remaining = await waitForExistingProcessesToExit({
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    timeoutMs: 250,
    intervalMs: 100,
    readProcessIds: () => [303],
    sleepFn: async () => undefined,
  });

  assert.deepEqual(remaining, [303]);
});

test("bundle path conflict warnings flag installed copies with the same bundle id", () => {
  assert.deepEqual(
    bundlePathConflictWarnings({
      targetAppPath:
        "/Users/me/ontology-atlas/src-tauri/target/release/bundle/macos/Ontology Atlas.app",
      targetBundleIdentifier: "dev.jinan.ontology-atlas",
      candidates: [
        {
          appPath: "/Applications/Ontology Atlas.app",
          bundleIdentifier: "dev.jinan.ontology-atlas",
        },
        {
          appPath: "/Users/me/Applications/Other.app",
          bundleIdentifier: "com.example.other",
        },
        {
          appPath:
            "/Users/me/ontology-atlas/src-tauri/target/release/bundle/macos/Ontology Atlas.app",
          bundleIdentifier: "dev.jinan.ontology-atlas",
        },
      ],
    }),
    [
      "/Applications/Ontology Atlas.app shares bundle id dev.jinan.ontology-atlas with the verified app; app-name Computer Use may attach to that installed copy unless the Run script refreshed it, so use the full built app path when exact bundle provenance matters.",
    ],
  );
});

test("Accessibility text probe script targets launched pids", () => {
  const script = buildAccessibilityTextProbeSwift([101, 202], ["개념 지도"]);

  assert.match(script, /let requiredPids: Set<pid_t> = \[101,202\]/);
  assert.match(script, /let requiredText = \["개념 지도"\]/);
  assert.match(script, /func isComplete/);
  assert.match(script, /func collectText/);
  assert.match(script, /kAXChildrenAttribute/);
});

test("validateAccessibilityText requires every requested text fragment", () => {
  const payload = "Ontology Atlas\n개념 지도\nAI 에이전트 그래프 검증";

  assert.equal(validateAccessibilityText(payload, []), null);
  assert.equal(
    validateAccessibilityText(payload, ["개념 지도", "AI 에이전트 그래프 검증"]),
    null,
  );
  assert.match(
    validateAccessibilityText(payload, ["Source Vault"]),
    /missing Accessibility text "Source Vault"/,
  );
  assert.match(validateAccessibilityText("", ["개념 지도"]), /empty Accessibility text/);
});

test("verify app launch lock prevents concurrent app checks and releases cleanly", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-lock-test-"));
  const lockDir = path.join(tmp, "verify.lock");
  try {
    const first = createVerifyLock(lockDir, { appPath: "/tmp/Ontology Atlas.app" });
    assert.equal(first.ok, true);

    const second = createVerifyLock(lockDir, { appPath: "/tmp/Ontology Atlas.app" });
    assert.equal(second.ok, false);
    assert.match(second.message, /another desktop app verification is already running/);

    first.release();
    const third = createVerifyLock(lockDir, { appPath: "/tmp/Ontology Atlas.app" });
    assert.equal(third.ok, true);
    third.release();
    assert.equal(fs.existsSync(lockDir), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("verify app launch lock path is stable per app path", () => {
  assert.equal(
    verifyLockPath("/Applications/Ontology Atlas.app"),
    verifyLockPath("/Applications/Ontology Atlas.app"),
  );
  assert.notEqual(
    verifyLockPath("/Applications/Ontology Atlas.app"),
    verifyLockPath("/tmp/Ontology Atlas.app"),
  );
});

test("WebView verification payload parses nested JSON and checks loaded DOM", () => {
  const payload = {
    href: "tauri://localhost/ko/ontology/",
    title: "Ontology Atlas",
    bodyText: "저장소\n온톨로지",
    bodyChildren: 19,
    readyState: "complete",
    bg: "rgb(8, 9, 10)",
    color: "rgb(247, 248, 248)",
    width: 1280,
    height: 789,
    markers: {
      ontologyNav: true,
      sourceVaultNav: true,
      agentBriefCopy: true,
      businessDecisionQuestions: true,
      readerDecisionLens: true,
      topologyRelief: false,
      topologyCardCount: 0,
      topologyCardOverlapCount: 0,
      topologyCardClippedCount: 0,
      topologyFixedSurfaceCount: 0,
      topologyFixedSurfaceOverlapCount: 0,
      topologyFixedSurfaceOverlapSample: [],
      topologyCardFixedSurfaceOverlapCount: 0,
      topologyStagePanClickCancelPx: 12,
      topologyMinimapVisible: false,
      topologyMinimapWidth: 0,
      topologyMinimapHeight: 0,
      topologyMinimapRight: 0,
      topologyMinimapBottom: 0,
      topologyMinimapViewportVisible: false,
      topologyMinimapViewportWidth: 0,
      topologyMinimapViewportHeight: 0,
      topologyMinimapViewportFrameState: "",
      topologyRelationLensVisible: false,
      topologyRelationLensText: "",
      topologyRelationLensPluralMismatch: false,
      topologyRelationQualityLensVisible: true,
      topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
      topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      topologyOverviewAgentReadinessMeterSegments: [
        { kind: "ready", count: "2" },
        { kind: "preflight", count: "0" },
        { kind: "review", count: "0" },
      ],
      topologyDragAttempted: false,
      topologyDragReason: "",
      topologyDragFocusMoved: false,
      topologyDragFocusDelta: null,
      topologyDragCompanionVisible: false,
      topologyDragCompanionAligned: false,
      topologyDragCompanionDelta: null,
      topologyDragCompanionSlug: "",
      topologyDragCompanionCount: 0,
      topologyDragVisibleCompanionCount: 0,
      topologyDragAlignedCompanionCount: 0,
      topologySelectedDockCompanionCount: 3,
      topologySelectedDockVisibleCompanionCount: 1,
      topologySelectedDockCompanionVisible: true,
      topologyDragClusterSize: 2,
      topologyDragConnectorCount: 1,
      topologyUiScale: 1,
      topologySelectedRelationLabelAgentGateKind: "handoff-ready",
      topologySelectedRelationLabelPrimaryCopyAction: "explain_relation",
      topologySelectedRelationLabelAgentGateText: "MCP",
      topologySelectedRelationLabelFactRoute: "fact>evidence>gate>action",
      topologySelectedRelationLabelFactRouteQuality: "supported",
      topologySelectedRelationLabelFactRouteEvidence: "source-backed",
      topologySelectedRelationLabelFactRouteGate: "handoff-ready",
      topologySelectedRelationLabelFactRouteAction: "explain_relation",
      topologySelectedRelationLabelFactRouteChips: [
        { kind: "fact", text: "fact" },
        { kind: "evidence", text: "src" },
        { kind: "action", text: "MCP" },
      ],
      topologySelectedRelationAgentRouteSteps: [
        { kind: "fact", label: "Fact", value: "typed ontology fact" },
        { kind: "gate", label: "Gate", value: "handoff ready" },
        { kind: "action", label: "MCP action", value: "explain_relation" },
      ],
      topologySelectedRelationAgentRouteGateKind: "handoff-ready",
      topologySelectedRelationAgentRoutePrimaryAction: "explain_relation",
      topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
      topologySelectedRelationPrimaryCopyActionText: "Copy explainBest next",
      topologySelectedRelationPrimaryCopyRecommended: true,
      topologySelectedRelationPrimaryCopyBadgeText: "Best next",
      topologySelectedRelationPrimaryCopyActionWidth: 124,
      topologySelectedRelationPrimaryCopyActionHeight: 28,
      topologyDragNodePopoverExpandClicked: true,
      topologyNodePopoverVisible: true,
      topologyNodePopoverCollapsed: false,
      topologyNodePopoverSizePolicy: "inspector-rail",
      topologyNodePopoverWidth: 420,
      topologyNodePopoverHeight: 512,
      topologyNodePopoverLeft: 820,
      topologyNodePopoverRight: 1240,
      topologyNodePopoverTop: 88,
      topologyNodePopoverBottom: 600,
      topologyNodePopoverRelationRowVisible: true,
      topologyNodePopoverRelationQuality: "strong",
      topologyNodePopoverRelationEvidenceState: "source-backed",
      topologyNodePopoverRelationEvidenceGlyph: "1",
      topologyNodePopoverRelationAgentGateKind: "handoff-ready",
      topologyNodePopoverRelationPrimaryCopyAction: "explain_relation",
      topologyNodePopoverRelationAgentGateText: "MCP",
      topologyNodePopoverAgentReadinessVisible: true,
      topologyNodePopoverAgentReadinessText: "handoff-ready1preflight0review0",
      topologyNodePopoverAgentReadinessChips: [
        { kind: "ready", count: "1", text: "handoff-ready1" },
        { kind: "preflight", count: "0", text: "preflight0" },
        { kind: "review", count: "0", text: "review0" },
      ],
      topologyNodePopoverMapContextVisible: true,
      topologyNodePopoverMapContextCount: 3,
      topologyNodePopoverMapContextText:
        "3 direct connections are on the map; use Map view to inspect them without panel overlap.",
    },
  };
  const stdout = `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}\n`;

  assert.deepEqual(parseWebviewVerifyPayload(stdout), payload);
  assert.equal(validateWebviewVerifyPayload(payload), null);
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/",
      bodyText:
        "Workspace\nOntology\nRelief\nWORKSPACE\nConcept map\nOntology workbench\nSelect a concept",
      markers: {
        ...payload.markers,
        agentBriefCopy: false,
        businessDecisionQuestions: false,
        readerDecisionLens: false,
        topologyRelief: false,
        topologyCardCount: 0,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 0,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: false,
        topologyRelationLensText: "",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "2" },
          { kind: "preflight", count: "0" },
          { kind: "review", count: "0" },
        ],
        topologyDragAttempted: false,
        topologyDragReason: "",
        topologyDragFocusMoved: false,
        topologyDragFocusDelta: null,
        topologyDragCompanionVisible: false,
        topologyDragCompanionAligned: false,
        topologyDragCompanionDelta: null,
        topologyDragCompanionSlug: "",
        topologyDragCompanionCount: 0,
        topologyDragVisibleCompanionCount: 0,
        topologyDragAlignedCompanionCount: 0,
      },
    }),
    null,
  );
  assert.match(validateWebviewVerifyPayload({ ...payload, bodyText: "" }), /body text/);
  assert.match(validateWebviewVerifyPayload({ ...payload, title: "Tauri" }), /Ontology Atlas route title/);
  assert.match(
    validateWebviewVerifyPayload(
      { ...payload, width: 1280, height: 789 },
      { minWebviewSize: { width: 1400, height: 860 } },
    ),
    /WebView viewport/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      height: 917,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText:
          "Relation lens · 21 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyUiScale: 1,
      },
    }),
    /Relief UI scale/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      height: 917,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyStagePanClickCancelPx: 6,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText:
          "Relation lens · 21 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyUiScale: 1.12,
      },
    }),
    /over-sensitive Relief stage pan threshold/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologySigmaReady: true,
        topologyEngineLoadingVisible: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText:
          "Relation lens · 21 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyUiScale: 1.12,
      },
    }),
    /engine loading indicator after Sigma was ready/,
  );
  assert.match(
    validateWebviewVerifyPayload({ ...payload, bodyText: "Loading local app shell" }),
    /Ontology Atlas workbench markers/,
  );
  assert.match(validateWebviewVerifyPayload({ ...payload, markers: null }), /structured markers/);
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/ko/ontology/insights/",
      markers: { ...payload.markers, businessDecisionQuestions: false },
    }),
    /business decision questions marker/,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/ko/",
      markers: { ...payload.markers, businessDecisionQuestions: false },
    }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/ko/ontology/insights/",
      markers: { ...payload.markers, readerDecisionLens: false },
    }),
    /reader decision lens marker/,
  );
  assert.match(validateWebviewVerifyPayload({ ...payload, href: "about:blank" }), /tauri/);
  assert.match(
    validateWebviewVerifyPayload(payload, { expectedPath: "/en/topology/" }),
    /expected \/en\/topology\//,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragClusterSize: 6,
        topologyDragConnectorCount: 5,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "Agent gate handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationPrimaryCopyActionText: "Copy explainBest next",
        topologySelectedRelationPrimaryCopyRecommended: true,
        topologySelectedRelationPrimaryCopyBadgeText: "Best next",
        topologySelectedRelationPrimaryCopyActionWidth: 124,
        topologySelectedRelationPrimaryCopyActionHeight: 28,
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentRouteSteps: [
          { kind: "fact", label: "Fact", value: "typed ontology fact" },
          { kind: "gate", label: "Gate", value: "handoff ready" },
          { kind: "action", label: "MCP action", value: "explain_relation" },
        ],
        topologySelectedRelationAgentRouteGateKind: "handoff-ready",
        topologySelectedRelationAgentRoutePrimaryAction: "explain_relation",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      height: 917,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 3,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyUiScale: 1.12,
        topologyMinimapVisible: true,
        topologyMinimapWidth: 220,
        topologyMinimapHeight: 182,
        topologyMinimapRight: 24,
        topologyMinimapBottom: 24,
        topologyMinimapViewportVisible: true,
        topologyMinimapViewportWidth: 44,
        topologyMinimapViewportHeight: 38,
        topologyMinimapViewportFrameState: "readable",
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragClusterSize: 6,
        topologyDragConnectorCount: 5,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationLabelAgentGateKind: "handoff-ready",
        topologySelectedRelationLabelPrimaryCopyAction: "explain_relation",
        topologySelectedRelationLabelAgentGateText: "MCP",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationPrimaryCopyActionText: "Copy explainBest next",
        topologySelectedRelationPrimaryCopyRecommended: true,
        topologySelectedRelationPrimaryCopyBadgeText: "Best next",
        topologySelectedRelationPrimaryCopyActionWidth: 124,
        topologySelectedRelationPrimaryCopyActionHeight: 28,
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentRouteSteps: [
          { kind: "fact", label: "Fact", value: "typed ontology fact" },
          { kind: "action", label: "MCP action", value: "explain_relation" },
          { kind: "gate", label: "Gate", value: "handoff ready" },
        ],
        topologySelectedRelationAgentRouteGateKind: "handoff-ready",
        topologySelectedRelationAgentRoutePrimaryAction: "explain_relation",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /agent route steps/,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n20 concept cards\nRelation quality strong 384 supported 0 weak 114 review 0\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 11,
        topologyCardRawCount: 20,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: false,
        topologyRelationLensText: "",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 384 supported 0 weak 114 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 384 · preflight 114 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "384" },
          { kind: "preflight", count: "114" },
          { kind: "review", count: "0" },
        ],
        topologyAnalysisPanelVisible: true,
        topologyAnalysisPanelMode: "overview",
        topologyAnalysisPanelWidthPolicy: "overview-wide",
        topologyAnalysisPanelWidth: 515,
        topologyAnalysisPanelHeight: 455,
        topologyAnalysisPanelOverflowY: "hidden",
        topologyAnalysisPanelClientHeight: 455,
        topologyAnalysisPanelScrollHeight: 456,
        topologyOverviewPrimaryCopyWidth: 462,
        topologyOverviewPrimaryCopyHeight: 36,
      },
    }, { expectedPath: "/en/topology/" }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n20 concept cards\nRelation quality strong 384 supported 0 weak 114 review 0\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 11,
        topologyCardRawCount: 20,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: false,
        topologyRelationLensText: "",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 384 supported 0 weak 114 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 384 · preflight 114 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "384" },
          { kind: "preflight", count: "114" },
          { kind: "review", count: "0" },
        ],
        topologyAnalysisPanelVisible: true,
        topologyAnalysisPanelMode: "overview",
        topologyAnalysisPanelWidthPolicy: "overview-wide",
        topologyAnalysisPanelWidth: 480,
        topologyAnalysisPanelHeight: 455,
        topologyAnalysisPanelOverflowY: "hidden",
        topologyAnalysisPanelClientHeight: 455,
        topologyAnalysisPanelScrollHeight: 456,
        topologyOverviewPrimaryCopyWidth: 462,
        topologyOverviewPrimaryCopyHeight: 36,
      },
    }, { expectedPath: "/en/topology/" }),
    /cramped Relief overview panel width/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n20 concept cards\nRelation quality strong 384 supported 0 weak 114 review 0\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 11,
        topologyCardRawCount: 20,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: false,
        topologyRelationLensText: "",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 384 supported 0 weak 114 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 384 · preflight 114 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "384" },
          { kind: "preflight", count: "114" },
          { kind: "review", count: "0" },
        ],
        topologyAnalysisPanelVisible: true,
        topologyAnalysisPanelMode: "overview",
        topologyAnalysisPanelWidthPolicy: "overview-wide",
        topologyAnalysisPanelWidth: 515,
        topologyAnalysisPanelHeight: 455,
        topologyAnalysisPanelOverflowY: "hidden",
        topologyAnalysisPanelClientHeight: 455,
        topologyAnalysisPanelScrollHeight: 456,
        topologyOverviewPrimaryCopyWidth: 420,
        topologyOverviewPrimaryCopyHeight: 36,
      },
    }, { expectedPath: "/en/topology/" }),
    /cramped Relief overview copy action/,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/?p=domain%3Aviews",
      title: "Views (Topology · Browse · Builder) · Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\nSelected reveal with linked cards.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: false,
        topologyCardCount: 1,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 3,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 82 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "strong70supported0weak12review0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 70 · preflight 12 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "70" },
          { kind: "preflight", count: "12" },
          { kind: "review", count: "0" },
        ],
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: 190, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: 188, y: 56 },
        topologyDragCompanionSlug: "capability:builder-canvas-polish",
        topologyDragCompanionCount: 18,
        topologyDragVisibleCompanionCount: 4,
        topologyDragAlignedCompanionCount: 12,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloCount: 1,
        topologySelectedRelationVisibleHaloCount: 1,
        topologySelectedRelationHaloQuality: "strong",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "strong · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "strong",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "strong",
        topologySelectedRelationCardAgentGate: "Agent gate handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    null,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 3,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 5,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologySelectedDockCompanionCount: 4,
        topologySelectedDockVisibleCompanionCount: 0,
        topologySelectedDockCompanionVisible: false,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 82 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "strong70supported0weak12review0",
        topologyOverviewAgentReadinessText: "handoff-ready 384 · preflight 114 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -9, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -13, y: 56 },
        topologyDragCompanionSlug: "capability:builder-relation-write-confirm",
        topologyDragCompanionCount: 1,
        topologyDragVisibleCompanionCount: 1,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragClusterSize: 7,
        topologyDragConnectorCount: 6,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "strong",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "strong",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationLabelFactRouteQuality: "strong",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "strong · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "strong",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "strong",
        topologySelectedRelationCardAgentGate: "handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    null,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/?p=domain%3Aviews",
      title: "Views (Topology · Browse · Builder) · Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\nSelected relation label and claim lens are visible.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 8,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 3,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 82 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "strong70supported0weak12review0",
        topologyOverviewAgentReadinessText: "handoff-ready 384 · preflight 114 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "384" },
          { kind: "preflight", count: "114" },
          { kind: "review", count: "0" },
        ],
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -121, y: 34 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -121, y: 34 },
        topologyDragCompanionSlug: "capability:agent-graph-readiness",
        topologyDragCompanionCount: 18,
        topologyDragVisibleCompanionCount: 18,
        topologyDragAlignedCompanionCount: 18,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloCount: 1,
        topologySelectedRelationVisibleHaloCount: 1,
        topologySelectedRelationHaloQuality: "strong",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "strong",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationLabelFactRouteQuality: "strong",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "strong · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "strong",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "strong",
        topologySelectedRelationCardAgentGate: "handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      markers: {
        ...payload.markers,
        topologyRelief: false,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /Relief topology marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: false,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /before the skeleton overlay was ready/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: false,
        topologyRelationQualityLensText: "",
      },
    }, { expectedPath: "/en/topology/" }),
    /relation quality marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "",
      },
    }, { expectedPath: "/en/topology/" }),
    /agent readiness marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [],
      },
    }, { expectedPath: "/en/topology/" }),
    /agent readiness meter marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 2,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
      },
    }, { expectedPath: "/en/topology/" }),
    /overlapping Relief cards/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 2,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /clipped Relief cards/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 1,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /fixed topology surfaces/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 4,
        topologyFixedSurfaceOverlapCount: 1,
        topologyFixedSurfaceOverlapSample: [
          ["sigma-selected-edge-card", "topology-minimap"],
        ],
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /overlapping Relief fixed surfaces/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      height: 917,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyUiScale: 1.12,
        topologyMinimapVisible: false,
        topologyMinimapWidth: 0,
        topologyMinimapHeight: 0,
        topologyMinimapRight: 0,
        topologyMinimapBottom: 0,
        topologyMinimapViewportVisible: false,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /Relief minimap/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      height: 917,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 3,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyUiScale: 1.12,
        topologyMinimapVisible: true,
        topologyMinimapWidth: 220,
        topologyMinimapHeight: 182,
        topologyMinimapRight: 24,
        topologyMinimapBottom: 24,
        topologyMinimapViewportVisible: true,
        topologyMinimapViewportWidth: 12,
        topologyMinimapViewportHeight: 38,
        topologyMinimapViewportFrameState: "thin",
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      },
    }, { expectedPath: "/en/topology/" }),
    /thin Relief minimap viewport frame/,
  );
  assert.equal(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      height: 917,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 3,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyUiScale: 1.12,
        topologyMinimapVisible: true,
        topologyMinimapWidth: 220,
        topologyMinimapHeight: 182,
        topologyMinimapRight: 24,
        topologyMinimapBottom: 24,
        topologyMinimapViewportVisible: true,
        topologyMinimapViewportWidth: 44,
        topologyMinimapViewportHeight: 38,
        topologyMinimapViewportFrameState: "readable",
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyOverviewAgentReadinessMeterSegments: [
          { kind: "ready", count: "2" },
          { kind: "preflight", count: "0" },
          { kind: "review", count: "0" },
        ],
      },
    }, { expectedPath: "/en/topology/" }),
    null,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: false,
        topologyDragReason: "missing selected reveal companion",
        topologyDragCompanionCount: 0,
        topologyDragVisibleCompanionCount: 0,
        topologyDragAlignedCompanionCount: 0,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /did not attempt the Relief card drag verification/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: false,
        topologySelectedRelationHaloVisible: false,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /Relief relation label selection/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragClusterSize: 6,
        topologyDragConnectorCount: 1,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: false,
        topologySelectedRelationHaloCount: 1,
        topologySelectedRelationVisibleHaloCount: 0,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected relation halo/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragClusterSize: 1,
        topologyDragConnectorCount: 1,
        topologyDragConnectorClearance: 12,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /linked card cluster/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: false,
        topologySelectedRelationClaimLensText: "",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected relation claim lens/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationLabelAgentGateKind: "",
        topologySelectedRelationLabelPrimaryCopyAction: "",
        topologySelectedRelationLabelAgentGateText: "",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /relation label did not expose an agent gate marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationLabelAgentGateKind: "preflight-first",
        topologySelectedRelationLabelPrimaryCopyAction: "explain_relation",
        topologySelectedRelationLabelAgentGateText: "check",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /primary action for preflight-first/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologyNodePopoverVisible: true,
        topologyNodePopoverCollapsed: false,
        topologyNodePopoverSizePolicy: "inspector-rail",
        topologyNodePopoverWidth: 319,
        topologyNodePopoverTop: 88,
        topologyNodePopoverBottom: 600,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected node popover was too narrow/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologyNodePopoverVisible: true,
        topologyNodePopoverCollapsed: false,
        topologyNodePopoverSizePolicy: "inspector-rail",
        topologyNodePopoverWidth: 420,
        topologyNodePopoverLeft: -2,
        topologyNodePopoverRight: 418,
        topologyNodePopoverTop: 88,
        topologyNodePopoverBottom: 600,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected node popover overflowed the viewport left/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      width: 1512,
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyUiScale: 1.12,
        topologyMinimapVisible: true,
        topologyMinimapWidth: 220,
        topologyMinimapHeight: 182,
        topologyMinimapRight: 24,
        topologyMinimapBottom: 24,
        topologyMinimapViewportVisible: true,
        topologyMinimapViewportWidth: 44,
        topologyMinimapViewportHeight: 38,
        topologyMinimapViewportFrameState: "readable",
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologyNodePopoverVisible: true,
        topologyNodePopoverCollapsed: false,
        topologyNodePopoverSizePolicy: "inspector-rail",
        topologyNodePopoverWidth: 420,
        topologyNodePopoverLeft: 1040,
        topologyNodePopoverRight: 1460,
        topologyNodePopoverTop: 88,
        topologyNodePopoverBottom: 600,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected node popover overflowed the right control rail/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologyNodePopoverVisible: true,
        topologyNodePopoverCollapsed: false,
        topologyNodePopoverSizePolicy: "inspector-rail",
        topologyNodePopoverWidth: 420,
        topologyNodePopoverTop: 168,
        topologyNodePopoverBottom: 680,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected node popover was placed too low/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologyNodePopoverVisible: true,
        topologyNodePopoverCollapsed: false,
        topologyNodePopoverSizePolicy: "inspector-rail",
        topologyNodePopoverWidth: 420,
        topologyNodePopoverTop: 88,
        topologyNodePopoverBottom: 600,
        topologyNodePopoverRelationRowVisible: true,
        topologyNodePopoverRelationEvidenceState: "source-backed",
        topologyNodePopoverRelationAgentGateKind: "",
        topologyNodePopoverRelationPrimaryCopyAction: "",
        topologyNodePopoverRelationAgentGateText: "",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /relation row did not expose an agent gate marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragNodePopoverExpandClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologyNodePopoverVisible: true,
        topologyNodePopoverCollapsed: false,
        topologyNodePopoverSizePolicy: "inspector-rail",
        topologyNodePopoverWidth: 420,
        topologyNodePopoverTop: 88,
        topologyNodePopoverBottom: 600,
        topologyNodePopoverRelationRowVisible: true,
        topologyNodePopoverRelationEvidenceState: "source-backed",
        topologyNodePopoverRelationAgentGateKind: "handoff-ready",
        topologyNodePopoverRelationPrimaryCopyAction: "explain_relation",
        topologyNodePopoverRelationAgentGateText: "MCP",
        topologyNodePopoverAgentReadinessVisible: true,
        topologyNodePopoverAgentReadinessChips: [
          { kind: "ready", count: "1", text: "handoff-ready1" },
          { kind: "review", count: "0", text: "review0" },
        ],
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /agent readiness lens is missing preflight/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationAgentGateText: "",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected relation agent gate/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "Review first",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /card agent gate marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "weak",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "Agent gate handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /claim lens quality marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "Agent gate handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText: "",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /selected relation agent decision/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "Agent gate handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "review-first",
        topologySelectedRelationPrimaryCopyActionKind: "explain_relation",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /decision gate kind marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: true,
        topologyDragCompanionDelta: { x: -126, y: 60 },
        topologyDragCompanionSlug: "capability:agent-onboarding-brief",
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 3,
        topologyDragAlignedCompanionCount: 1,
        topologyDragRelationLabelClicked: true,
        topologyDragConnectorDrawable: true,
        topologyDragConnectorClearance: 12,
        topologySelectedRelationHaloVisible: true,
        topologySelectedRelationHaloQuality: "supported",
        topologySelectedRelationLabelHitAligned: true,
        topologySelectedRelationLabelQuality: "supported",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelEvidenceGlyph: "1",
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText: "supported · 1 source · typed ontology fact",
        topologySelectedRelationClaimLensQuality: "supported",
        topologySelectedRelationClaimLensDotVisible: true,
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "Relation contract A typed ontology fact, not a similarity score. Quality means handoff confidence.",
        topologySelectedRelationCardQuality: "supported",
        topologySelectedRelationCardAgentGate: "Agent gate handoff ready",
        topologySelectedRelationCardAgentGateKind: "handoff-ready",
        topologySelectedRelationCardAgentDecision:
          "Include this relation in agent handoff; it has typed evidence.",
        topologySelectedRelationAgentGateText: "Agent gate handoff ready",
        topologySelectedRelationAgentDecisionGateKind: "handoff-ready",
        topologySelectedRelationPrimaryCopyActionKind: "relation_check",
        topologySelectedRelationAgentDecisionText:
          "Include this relation in agent handoff; it has typed evidence.",
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /primary copy action marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation type",
        topologyRelationLensPluralMismatch: false,
        topologyRelationQualityLensVisible: true,
        topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
        topologyOverviewAgentReadinessText: "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
        topologyDragAttempted: true,
        topologyDragReason: "done",
        topologyDragFocusMoved: true,
        topologyDragFocusDelta: { x: -128, y: 58 },
        topologyDragCompanionVisible: true,
        topologyDragCompanionAligned: false,
        topologyDragCompanionDelta: { x: 0, y: 0 },
        topologyDragCompanionCount: 6,
        topologyDragVisibleCompanionCount: 2,
        topologyDragAlignedCompanionCount: 0,
      },
    }, { expectedPath: "/en/topology/", requireTopologyDrag: true }),
    /focus \{"x":/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      href: "tauri://localhost/en/topology/",
      title: "Relief · ontology-atlas",
      bodyText:
        "Ontology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
      markers: {
        ...payload.markers,
        topologyRelief: true,
        topologyCardsReady: true,
        topologyCardCount: 21,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceCount: 2,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyRelationLensVisible: true,
        topologyRelationLensText: "Relation lens · 21 direct facts · 1 relation types",
        topologyRelationLensPluralMismatch: true,
      },
    }, { expectedPath: "/en/topology/" }),
    /malformed Relief relation lens copy/,
  );
});

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
      sourceVaultNav: true,
      agentBriefCopy: false,
      businessDecisionQuestions: false,
      readerDecisionLens: false,
      topologyRelief: false,
      topologyCardCount: 0,
      topologyCardOverlapCount: 0,
      topologyCardClippedCount: 0,
      topologyFixedSurfaceCount: 0,
      topologyCardFixedSurfaceOverlapCount: 0,
      topologyDragAttempted: false,
      topologyDragReason: "",
      topologyDragFocusMoved: false,
      topologyDragFocusDelta: null,
      topologyDragCompanionVisible: false,
      topologyDragCompanionAligned: false,
      topologyDragCompanionDelta: null,
      topologyDragCompanionSlug: "",
      topologyDragCompanionCount: 0,
      topologyDragVisibleCompanionCount: 0,
      topologyDragAlignedCompanionCount: 0,
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

test("WebView verification waits for the latest snapshot that passes route gates", async () => {
  const pendingPayload = {
    href: "tauri://localhost/en/topology/",
    title: "Relief · ontology-atlas",
    bodyText:
      "Workspace\nOntology\nRelief\n292 concepts\n21 concept cards\nShowing the readable card skeleton.",
    bodyChildren: 19,
    readyState: "complete",
    markers: {
      ontologyNav: true,
      sourceVaultNav: true,
      agentBriefCopy: false,
      businessDecisionQuestions: false,
      readerDecisionLens: false,
      topologyRelief: true,
      topologyStagePanClickCancelPx: 12,
      topologyCardsReady: false,
      topologyCardCount: 0,
      topologyCardOverlapCount: 0,
      topologyCardClippedCount: 0,
      topologyFixedSurfaceCount: 2,
      topologyFixedSurfaceOverlapCount: 0,
      topologyFixedSurfaceOverlapSample: [],
      topologyCardFixedSurfaceOverlapCount: 0,
      topologyRelationLensVisible: false,
      topologyRelationLensText: "",
      topologyRelationLensPluralMismatch: false,
      topologyRelationQualityLensVisible: false,
      topologyRelationQualityLensText: "",
      topologyOverviewAgentReadinessText: "",
      topologyOverviewAgentReadinessMeterSegments: [],
    },
    width: 1280,
    height: 789,
  };
  const readyPayload = {
    ...pendingPayload,
    markers: {
      ...pendingPayload.markers,
      topologyCardsReady: true,
      topologyCardCount: 21,
      topologyRelationLensVisible: true,
      topologyRelationLensText:
        "Relation lens · 21 direct facts · 1 relation type · Typed ontology facts, not inferred similarity scores.",
      topologyRelationQualityLensVisible: true,
      topologyRelationQualityLensText: "Relation quality strong 1 supported 1 weak 0 review 0",
      topologyOverviewAgentReadinessText:
        "Agent readiness: handoff-ready 2 · preflight 0 · review 0",
      topologyOverviewAgentReadinessMeterSegments: [
        { kind: "ready", count: "2" },
        { kind: "preflight", count: "0" },
        { kind: "review", count: "0" },
      ],
    },
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
  assert.match(String(result.validationError), /skeleton overlay/);

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

test("parseMinWindowSize accepts WIDTHxHEIGHT only", () => {
  assert.deepEqual(parseMinWindowSize("1280x820"), { width: 1280, height: 820 });
  assert.equal(parseMinWindowSize("1280"), null);
  assert.equal(parseMinWindowSize("widextall"), null);
});

test("parseOnscreenWindows keeps visible layer-zero windows for launched process ids", () => {
  const payload = JSON.stringify([
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowOwnerName: "Ontology Atlas",
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 1,
      kCGWindowAlpha: 1,
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
    {
      kCGWindowOwnerPID: 202,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: false,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
  ]);

  assert.deepEqual(parseOnscreenWindows(payload, [101]), [
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowOwnerName: "Ontology Atlas",
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
  ]);
});

test("validateWindowRequirements checks owner name and minimum size", () => {
  const windows = [
    {
      kCGWindowOwnerName: "Ontology Atlas",
      kCGWindowBounds: { Width: 1280, Height: 821 },
    },
  ];

  assert.equal(
    validateWindowRequirements(windows, {
      requireOwnerName: "Ontology Atlas",
      minWindowSize: { width: 1040, height: 720 },
    }),
    null,
  );
  assert.match(
    validateWindowRequirements(windows, { requireOwnerName: "Other App" }),
    /owner name/,
  );
  assert.match(
    validateWindowRequirements(windows, { minWindowSize: { width: 1600, height: 900 } }),
    /at least 1600x900/,
  );
});

test("windowCaptureTargets keeps CoreGraphics window ids for screenshot capture", () => {
  assert.deepEqual(
    windowCaptureTargets([
      {
        kCGWindowNumber: 68525,
        kCGWindowOwnerPID: 101,
        kCGWindowOwnerName: "Ontology Atlas",
        kCGWindowName: "Ontology Atlas",
      },
      {
        kCGWindowOwnerPID: 101,
        kCGWindowOwnerName: "Ontology Atlas",
      },
    ]),
    [
      {
        id: 68525,
        ownerPid: 101,
        ownerName: "Ontology Atlas",
        name: "Ontology Atlas",
        bounds: null,
        alpha: null,
        sharingState: null,
        storeType: null,
        memoryUsage: null,
      },
    ],
  );
});

test("validateCapturableWindowRows requires at least one successful window capture", () => {
  assert.equal(
    validateCapturableWindowRows([
      { id: 1, ownerName: "Ontology Atlas", ok: false, stderr: "could not create image from window" },
      { id: 2, ownerName: "Ontology Atlas", ok: true, method: "bounds-region", stderr: "", bytes: 2048 },
    ]),
    null,
  );
  assert.match(validateCapturableWindowRows([]), /no CoreGraphics window ids/);
  assert.match(
    validateCapturableWindowRows([
      { id: 1, ownerName: "Ontology Atlas", ok: false, stderr: "could not create image from window" },
    ]),
    /could not create image from window/,
  );
});

test("classifyVisualEvidenceBlocker explains foreground and blank-capture failures", () => {
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: { frontmost: false },
      captureRows: [
        { ok: false, stderr: "window-id: could not create image from window", artifactPath: null },
      ],
    }),
    "foreground-activation-unconfirmed",
  );
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: { frontmost: true },
      captureRows: [
        { ok: false, stderr: "full-screen: image appears blank or black (nonDarkRatio 0)", artifactPath: null },
      ],
    }),
    "screen-capture-returned-blank-image",
  );
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: { frontmost: true },
      captureRows: [
        { ok: true, stderr: "", artifactPath: "/tmp/ontology-atlas.png" },
      ],
    }),
    "captured",
  );
});

test("formatWindowDiagnosticsPayload includes capture and Accessibility evidence", () => {
  assert.deepEqual(
    formatWindowDiagnosticsPayload({
      pids: [101],
      windows: [
        {
          kCGWindowNumber: 81157,
          kCGWindowOwnerPID: 101,
          kCGWindowOwnerName: "Ontology Atlas",
          kCGWindowName: "Ontology Atlas",
          kCGWindowBounds: { X: 116, Y: 98, Width: 1280, Height: 821 },
          kCGWindowLayer: 0,
          kCGWindowIsOnscreen: true,
          kCGWindowAlpha: 1,
          kCGWindowSharingState: 1,
          kCGWindowStoreType: 2,
          kCGWindowMemoryUsage: 4096,
        },
      ],
      accessibilityRows: [
        {
          pid: 101,
          processName: "ontology-atlas",
          frontmost: false,
          windowCount: 0,
          uiElementCount: 2,
        },
      ],
      captureRows: [
        {
          id: 81157,
          ownerName: "Ontology Atlas",
          sharingState: 1,
          alpha: 1,
          ok: false,
          method: "bounds-region",
          stderr: "window-id: could not create image from window; bounds-region: could not create image from rect",
          bytes: 0,
        },
      ],
    }),
    {
      pids: [101],
      windows: [
        {
          windowNumber: 81157,
          ownerPid: 101,
          ownerName: "Ontology Atlas",
          name: "Ontology Atlas",
          bounds: { X: 116, Y: 98, Width: 1280, Height: 821 },
          layer: 0,
          onscreen: true,
          alpha: 1,
          sharingState: 1,
          storeType: 2,
          memoryUsage: 4096,
        },
      ],
      accessibilityRows: [
        {
          pid: 101,
          processName: "ontology-atlas",
          frontmost: false,
          windowCount: 0,
          uiElementCount: 2,
        },
      ],
      captureRows: [
        {
          windowNumber: 81157,
          ownerName: "Ontology Atlas",
          sharingState: 1,
          alpha: 1,
          ok: false,
          method: "bounds-region",
          stderr: "window-id: could not create image from window; bounds-region: could not create image from rect",
          bytes: 0,
          artifactPath: null,
        },
      ],
    },
  );
});

test("formatWindowDiagnosticsPayload records full-screen visual evidence fallback rows", () => {
  assert.deepEqual(
    formatWindowDiagnosticsPayload({
      pids: [101],
      windows: [],
      accessibilityRows: [],
      captureRows: [
        {
          id: null,
          ownerName: "desktop",
          sharingState: null,
          alpha: null,
          ok: true,
          method: "full-screen",
          stderr: "",
          bytes: 4096,
          artifactPath: "/tmp/ontology-atlas-full-screen.png",
        },
      ],
    }).captureRows,
    [
      {
        windowNumber: null,
        ownerName: "desktop",
        sharingState: null,
        alpha: null,
        ok: true,
        method: "full-screen",
        stderr: "",
        bytes: 4096,
        artifactPath: "/tmp/ontology-atlas-full-screen.png",
      },
    ],
  );
});

test("validateVisualEvidenceStats rejects blank or low-contrast screenshots", () => {
  assert.equal(
    validateVisualEvidenceStats({
      width: 3024,
      height: 1964,
      sampleCount: 4096,
      nonDarkRatio: 0.02,
      lumaSpread: 32,
    }),
    null,
  );
  assert.match(
    validateVisualEvidenceStats({
      width: 3024,
      height: 1964,
      sampleCount: 4096,
      nonDarkRatio: 0,
      lumaSpread: 0,
    }),
    /blank or black/,
  );
  assert.match(
    validateVisualEvidenceStats({
      width: 3024,
      height: 1964,
      sampleCount: 4096,
      nonDarkRatio: 0.02,
      lumaSpread: 2,
    }),
    /too little visible contrast/,
  );
});

test("Accessibility window probe targets launched process ids", () => {
  const script = buildAccessibilityWindowProbeScript([101, 202]);

  assert.match(script, /procPid = 101 or procPid = 202/);
  assert.match(script, /count of windows of proc/);
});

test("foreground activation targets both bundle id and launched process ids", () => {
  const script = buildForegroundActivationScript({
    bundleIdentifier: "dev.jinan.ontology-atlas",
    pids: [101, 202],
  });

  assert.match(script, /tell application id "dev\.jinan\.ontology-atlas" to activate/);
  assert.match(script, /procPid = 101 or procPid = 202/);
  assert.match(script, /set frontmost of proc to true/);
  assert.match(script, /bundle=/);
  assert.match(script, /pid=/);
});

test("parseAccessibilityWindowRows reads System Events tabular output", () => {
  assert.deepEqual(
    parseAccessibilityWindowRows(
      "101\tOntology Atlas\tfalse\t1\t3\n202\tOther\ttrue\t0\t2\n",
    ),
    [
      {
        pid: 101,
        processName: "Ontology Atlas",
        frontmost: false,
        windowCount: 1,
        uiElementCount: 3,
      },
      {
        pid: 202,
        processName: "Other",
        frontmost: true,
        windowCount: 0,
        uiElementCount: 2,
      },
    ],
  );
});

test("validateAccessibilityWindowRows requires System Events windows", () => {
  assert.equal(
    validateAccessibilityWindowRows([
      {
        pid: 101,
        processName: "Ontology Atlas",
        frontmost: false,
        windowCount: 1,
        uiElementCount: 3,
      },
    ]),
    null,
  );
  assert.match(
    validateAccessibilityWindowRows([
      {
        pid: 101,
        processName: "ontology-atlas",
        frontmost: false,
        windowCount: 0,
        uiElementCount: 2,
      },
    ]),
    /no Accessibility windows/,
  );
  assert.match(validateAccessibilityWindowRows([]), /did not find/);
  assert.match(
    validateAccessibilityWindowRows([
      {
        pid: 101,
        processName: "Ontology Atlas",
        frontmost: false,
        windowCount: 0,
        uiElementCount: 0,
      },
    ]),
    /no Accessibility windows/,
  );
});

test("validateFrontmostAccessibilityRows requires a foreground launched process", () => {
  assert.equal(
    validateFrontmostAccessibilityRows([
      {
        pid: 101,
        processName: "ontology-atlas",
        frontmost: true,
        windowCount: 0,
        uiElementCount: 2,
      },
    ]),
    null,
  );
  assert.match(validateFrontmostAccessibilityRows([]), /did not find/);
  assert.match(
    validateFrontmostAccessibilityRows([
      {
        pid: 101,
        processName: "ontology-atlas",
        frontmost: false,
        windowCount: 0,
        uiElementCount: 2,
      },
    ]),
    /not frontmost/,
  );
});

test("existingProcessPatterns match stale macOS app copies with the same executable", () => {
  assert.deepEqual(
    existingProcessPatterns({
      appPath: "/Users/me/Ontology Atlas.app",
      executablePath: "/Users/me/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    }),
    [
      "/Users/me/Ontology Atlas\\.app/Contents/MacOS/ontology-atlas",
      "\\.app/Contents/MacOS/ontology-atlas$",
    ],
  );
});
