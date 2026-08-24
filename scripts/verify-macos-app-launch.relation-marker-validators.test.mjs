import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWebviewVerifyPayload,
  selectedRelationRouteRailTextLeak,
  validateSelectedRelationContextSilhouetteMarkers,
  validateSelectedRelationIdentityMarkers,
  validateSelectedRelationEndpointVisibilityMarkers,
  validateSelectedRelationEndpointRouteMarkers,
  validateRelationLabelFrameGeometryMarkers,
  validateTopologyConnectorCacheMarkers,
  validateSelectedRelationLabelCompactMarkers,
  validateWebviewVerifyPayload,
  waitForWebviewVerifyPayload,
} from "./verify-macos-app-launch.mjs";

test("selected relation hidden route rail text leak detector catches collapsed chip text", () => {
  assert.equal(
    selectedRelationRouteRailTextLeak({
      bodyText: "CONTAINS ×5 1 STRONGFACTSRCMCP/CLIEXPLAIN",
    }),
    true,
  );
  assert.equal(
    selectedRelationRouteRailTextLeak({
      bodyText: "CONTAINS 6\ncontains 6\nS1MCP/CLI",
    }),
    true,
  );
  assert.equal(
    selectedRelationRouteRailTextLeak({
      bodyText: "CONTAINS ×5 1\nOntology Hub — Mode-Aware\nMCP/CLI",
    }),
    false,
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
          topologyFixedSurfaceMeasureContract: "single-pass-rect-read",
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

test("WebView verification payload parser skips empty in-flight snapshots", () => {
  const payload = {
    href: "tauri://localhost/ko/topology/?mode=path",
    title: "지형도 · ontology-atlas",
    bodyText: "온톨로지 지형도\n후보 11/21개 표시 중",
    bodyChildren: 19,
    readyState: "complete",
    markers: {
      topologyRelief: true,
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

test("selected relation label compact markers match rendered width and viewport bounds", () => {
  const baseMarkers = {
    topologySelectedRelationLabelHitWidth: 144,
    topologySelectedRelationLabelHitHeight: 32,
    topologySelectedRelationLabelHitLeft: 320,
    topologySelectedRelationLabelHitRight: 464,
    topologySelectedRelationLabelCompact: "false",
    topologySelectedRelationLabelDesiredWidth: 144,
    topologySelectedRelationLabelCenteredAvailableWidth: 144,
    topologySelectedRelationLabelViewportClampContract: "centered-within-viewport",
    topologySelectedRelationLabelViewportClampSide: "none",
    topologySelectedRelationLabelViewportInset: 16,
  };

  assert.equal(validateSelectedRelationLabelCompactMarkers(baseMarkers, 1512), null);
  assert.equal(
    validateSelectedRelationLabelCompactMarkers(
      {
        ...baseMarkers,
        topologySelectedRelationLabelHitWidth: 150,
        topologySelectedRelationLabelHitLeft: 16,
        topologySelectedRelationLabelHitRight: 166,
        topologySelectedRelationLabelCompact: "true",
        topologySelectedRelationLabelDesiredWidth: 314,
        topologySelectedRelationLabelCenteredAvailableWidth: 150,
        topologySelectedRelationLabelViewportClampContract: "compacted-to-viewport-edge",
        topologySelectedRelationLabelViewportClampSide: "left",
      },
      1512,
    ),
    null,
  );
  assert.match(
    validateSelectedRelationLabelCompactMarkers(
      {
        ...baseMarkers,
        topologySelectedRelationLabelHitWidth: 150,
        topologySelectedRelationLabelHitLeft: 16,
        topologySelectedRelationLabelHitRight: 166,
        topologySelectedRelationLabelCompact: "false",
        topologySelectedRelationLabelDesiredWidth: 314,
        topologySelectedRelationLabelCenteredAvailableWidth: 150,
        topologySelectedRelationLabelViewportClampContract: "compacted-to-viewport-edge",
        topologySelectedRelationLabelViewportClampSide: "left",
      },
      1512,
    ),
    /compact marker was inconsistent/,
  );
  assert.match(
    validateSelectedRelationLabelCompactMarkers(
      {
        ...baseMarkers,
        topologySelectedRelationLabelHitLeft: 8,
        topologySelectedRelationLabelHitRight: 322,
      },
      1512,
    ),
    /overflowed the viewport left/,
  );
  assert.match(
    validateSelectedRelationLabelCompactMarkers(
      {
        ...baseMarkers,
        topologySelectedRelationLabelViewportClampContract: "compacted-to-viewport-edge",
        topologySelectedRelationLabelViewportClampSide: "none",
      },
      1512,
    ),
    /edge compaction without a clamp side/,
  );
});

test("relation label frame geometry markers require after-render ready counts", () => {
  const markers = {
    topologyRelationLabelGeometryContract: "frame-positioned-hit-targets",
    topologyRelationLabelGeometrySource: "after-render-layout-pass",
    topologyRelationLabelGeometryExpectedCount: 2,
    topologyRelationLabelGeometryReadyCount: 2,
    topologyRelationLabelGeometryPendingCount: 0,
  };

  assert.equal(validateRelationLabelFrameGeometryMarkers(markers), null);
  assert.match(
    validateRelationLabelFrameGeometryMarkers({
      ...markers,
      topologyRelationLabelGeometrySource: "pending-frame",
    }),
    /frame geometry source/,
  );
  assert.match(
    validateRelationLabelFrameGeometryMarkers({
      ...markers,
      topologyRelationLabelGeometryReadyCount: 1,
    }),
    /ready count/,
  );
  assert.match(
    validateRelationLabelFrameGeometryMarkers({
      ...markers,
      topologyRelationLabelGeometryPendingCount: 1,
    }),
    /pending labels/,
  );
});

test("topology connector cache markers require frame fallback with zero DOM reads", () => {
  const markers = {
    topologyConnectorDomIndexContract: "reuse-card-index",
    topologyConnectorRectCacheContract: "frame-local-card-rect-cache",
    topologyConnectorRectCacheFrameFallbackContract:
      "reuse-card-placement-frame-rects-before-dom-read",
    topologyConnectorRectCacheAccounting: "reads-plus-hits",
    topologyConnectorRectCacheSize: 7,
    topologyConnectorRectCacheReadCount: 0,
    topologyConnectorRectCacheHitCount: 26,
  };

  assert.equal(validateTopologyConnectorCacheMarkers(markers), null);
  assert.match(
    validateTopologyConnectorCacheMarkers({
      ...markers,
      topologyConnectorRectCacheFrameFallbackContract: "direct-dom-read",
    }),
    /frame fallback contract/,
  );
  assert.match(
    validateTopologyConnectorCacheMarkers({
      ...markers,
      topologyConnectorRectCacheReadCount: 1,
    }),
    /connector rect cache proof/,
  );
  assert.match(
    validateTopologyConnectorCacheMarkers({
      ...markers,
      topologyConnectorRectCacheHitCount: 0,
    }),
    /connector rect cache proof/,
  );
});

test("selected relation endpoint route markers prove visible source and target names", () => {
  const baseMarkers = {
    topologySelectedRelationCopyPayloadFrom: "domain:views",
    topologySelectedRelationCopyPayloadTo: "capability:topology-analysis-modes",
    topologySelectedRelationHandleStripSource: "domain:views",
    topologySelectedRelationHandleStripTarget: "capability:topology-analysis-modes",
    topologySelectedRelationEndpointRouteContract: "visible-source-target-names-wrap",
    topologySelectedRelationEndpointRouteSourceName: "Views",
    topologySelectedRelationEndpointRouteTargetName: "Topology Analysis Modes",
    topologySelectedRelationEndpointRouteWrapPolicy:
      "wrap-allowed-no-horizontal-overflow",
    topologySelectedRelationEndpointRouteLineBudget: "2",
    topologySelectedRelationEndpointRouteSourceHandle: "domain:views",
    topologySelectedRelationEndpointRouteTargetHandle: "capability:topology-analysis-modes",
    topologySelectedRelationEndpointRouteHandleSummary:
      "domain:views → capability:topology-analysis-modes",
    topologySelectedRelationEndpointRouteReadableText:
      "Views → Topology Analysis Modes",
    topologySelectedRelationEndpointReadableRoute: "Views → Topology Analysis Modes",
    topologySelectedRelationEndpointRouteText: "Views→Topology Analysis Modes",
    topologySelectedRelationEndpointRouteWidth: 212,
    topologySelectedRelationEndpointRouteHeight: 30,
    topologySelectedRelationEndpointRouteClientWidth: 212,
    topologySelectedRelationEndpointRouteScrollWidth: 212,
  };

  assert.equal(validateSelectedRelationEndpointRouteMarkers(baseMarkers), null);
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteContract: "hidden-handles-only",
    }),
    /endpoint route contract/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteWrapPolicy: "truncate",
    }),
    /endpoint route wrap policy/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteLineBudget: "1",
    }),
    /endpoint route line budget/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteText: "Views",
    }),
    /endpoint names not visible/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteReadableText: "Views",
    }),
    /endpoint readable route/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointReadableRoute: "Views",
    }),
    /endpoint layer readable route/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteTargetHandle: "capability:wrong",
    }),
    /visible endpoint handles/,
  );
  assert.match(
    validateSelectedRelationEndpointRouteMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointRouteClientWidth: 180,
      topologySelectedRelationEndpointRouteScrollWidth: 212,
    }),
    /overflowing Relief selected relation endpoint route/,
  );
});

test("selected relation identity markers expose the root selected edge id", () => {
  const baseMarkers = {
    topologySelectedRelationVerifySelected: true,
    topologyAgentCurrentSurface: "selected-relation",
    topologyAgentCurrentSurfaceRoute: "domain:views>capability:topology-analysis-modes",
    topologySelectedRelationEdgeId: "geid_138_17",
    topologySelectedRelationLabelSource: "domain:views",
    topologySelectedRelationLabelTarget: "capability:topology-analysis-modes",
    topologySelectedRelationLabelRoute: "domain:views>capability:topology-analysis-modes",
  };

  assert.equal(validateSelectedRelationIdentityMarkers(baseMarkers), null);
  assert.match(
    validateSelectedRelationIdentityMarkers({
      ...baseMarkers,
      topologySelectedRelationEdgeId: "",
    }),
    /selected relation edge id/,
  );
  assert.match(
    validateSelectedRelationIdentityMarkers({
      ...baseMarkers,
      topologyAgentCurrentSurfaceRoute: "domain:wrong>capability:topology-analysis-modes",
    }),
    /selected relation route/,
  );
});

test("selected relation endpoint visibility markers prove source and target cards stay readable", () => {
  const baseMarkers = {
    topologyCardsReady: true,
    topologySelectedRelationCardSource: "domain:views",
    topologySelectedRelationCardTarget: "capability:topology-analysis-modes",
    topologySelectedRelationEndpointVisibilityContract:
      "selected-relation-keeps-source-target-readable",
    topologySelectedRelationEndpointExpectedCount: 2,
    topologySelectedRelationEndpointVisibleCount: 2,
    topologySelectedRelationEndpointHiddenCount: 0,
    topologySelectedRelationEndpointCards: [
      {
        slug: "domain:views",
        roleBadgeText: "FROM",
        roleBadgeContract: "visible-source-target-role-badge",
        roleBadgeVisible: true,
        visible: true,
        surfaceHidden: "",
        shift: "safe-shift",
      },
      {
        slug: "capability:topology-analysis-modes",
        roleBadgeText: "TO",
        roleBadgeContract: "visible-source-target-role-badge",
        roleBadgeVisible: true,
        visible: true,
        surfaceHidden: "",
        shift: "safe-shift",
      },
    ],
  };

  assert.equal(validateSelectedRelationEndpointVisibilityMarkers(baseMarkers), null);
  assert.match(
    validateSelectedRelationEndpointVisibilityMarkers({
      ...baseMarkers,
      topologyCardsReady: false,
    }),
    /skeleton card layer was not ready/,
  );
  assert.match(
    validateSelectedRelationEndpointVisibilityMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointVisibilityContract: "best-effort",
    }),
    /endpoint visibility contract/,
  );
  assert.match(
    validateSelectedRelationEndpointVisibilityMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointHiddenCount: 1,
    }),
    /endpoint visibility proof/,
  );
  assert.match(
    validateSelectedRelationEndpointVisibilityMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointCards: [
        {
          slug: "domain:views",
          visible: true,
          surfaceHidden: "",
          shift: "safe-shift",
        },
        {
          slug: "capability:wrong",
          visible: true,
          surfaceHidden: "",
          shift: "safe-shift",
        },
      ],
    }),
    /without source and target/,
  );
  assert.match(
    validateSelectedRelationEndpointVisibilityMarkers({
      ...baseMarkers,
      topologySelectedRelationEndpointCards: [
        {
          slug: "domain:views",
          visible: true,
          surfaceHidden: "",
          shift: "safe-shift",
        },
        {
          slug: "capability:topology-analysis-modes",
          visible: false,
          surfaceHidden: "true",
          shift: "safe-shift",
        },
      ],
    }),
    /hidden Relief selected relation endpoint card/,
  );
});

test("selected relation context silhouette markers suppress lower-priority background cards", () => {
  const baseMarkers = {
    topologySelectedRelationContextSilhouettePolicy:
      "selected-relation-keeps-endpoints-and-orientation-anchors-only",
    topologySelectedRelationContextSilhouetteActive: true,
    topologySelectedRelationContextSilhouetteHiddenCount: 6,
    topologySelectedRelationLowerPriorityVisibleDimmedCount: 0,
    topologySelectedRelationVisibleOrientationAnchorCount: 3,
    topologySelectedRelationHiddenContextInteractionContract:
      "hidden-context-is-not-pointer-focus-or-a11y-target",
    topologySelectedRelationHiddenContextInteractiveCount: 0,
  };

  assert.equal(validateSelectedRelationContextSilhouetteMarkers(baseMarkers), null);
  assert.match(
    validateSelectedRelationContextSilhouetteMarkers({
      ...baseMarkers,
      topologySelectedRelationContextSilhouettePolicy: "all-context-visible",
    }),
    /context silhouette policy/,
  );
  assert.match(
    validateSelectedRelationContextSilhouetteMarkers({
      ...baseMarkers,
      topologySelectedRelationContextSilhouetteActive: false,
    }),
    /did not activate/,
  );
  assert.match(
    validateSelectedRelationContextSilhouetteMarkers({
      ...baseMarkers,
      topologySelectedRelationLowerPriorityVisibleDimmedCount: 2,
    }),
    /noisy Relief selected relation context/,
  );
  assert.match(
    validateSelectedRelationContextSilhouetteMarkers({
      ...baseMarkers,
      topologySelectedRelationHiddenContextInteractionContract:
        "hidden-context-is-only-transparent",
    }),
    /hidden context interaction contract/,
  );
  assert.match(
    validateSelectedRelationContextSilhouetteMarkers({
      ...baseMarkers,
      topologySelectedRelationHiddenContextInteractiveCount: 1,
    }),
    /interactive hidden Relief selected relation context/,
  );
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
          topologyFixedSurfaceMeasureContract: "single-pass-rect-read",
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
      topologyRelationQualityLensText: "Relation quality: strong 1 · supported 1 · weak 0 · review 0",
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
