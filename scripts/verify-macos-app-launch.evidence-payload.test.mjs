import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import * as verifier from "./verify-macos-app-launch.mjs";

test("WebView evidence summarizes Add Concept composer blocking proof for agent handoff", () => {
  assert.equal(typeof verifier.buildWebviewEvidencePayload, "function");
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/ko/topology/?p=domain%3Aviews&mode=focus",
      width: 1512,
      height: 917,
      markers: {
        topologyCreateNodeOpen: true,
        topologyAttentionWinner: "blocking-composer",
        topologyCreateNodePanelAttentionRole: "blocking-composer",
        topologyCreateNodePanelPlacementContract: "centered-blocking-edit",
        topologyCreateNodeSurfaceRole: "blocking-edit-surface",
        topologyCreateNodeElevationContract: "solid-panel-over-dimmed-map",
        topologyCreateNodeSizeContract: "bounded-centered-composer",
        topologyCreateNodePanelTopToken: "--topology-blocking-composer-top",
        topologyCreateNodePanelWidthToken: "--topology-blocking-composer-width",
        topologyCreateNodePanelMaxHeightToken: "--topology-blocking-composer-max-height",
        topologyCreateNodeFormSurfaceToken: "--topology-blocking-composer-surface",
        topologyCreateNodeFormBorderToken: "--topology-blocking-composer-border",
        topologyCreateNodeFormShadowToken: "--topology-blocking-composer-shadow",
        topologyCreateNodePanelRole: "dialog",
        topologyCreateNodePanelAriaModal: "true",
        topologyCreateNodeFocusInside: true,
        topologyCreateNodeActiveElementTestId: "create-node-title",
        topologyCreateNodeBackdropVisible: true,
        topologyCreateNodeBackdropCoversViewport: true,
        topologyCreateNodeBackdropPointerEvents: "auto",
        topologyCreateNodeBackdropContract: "blocks-map-and-closes-composer",
        topologyCreateNodeBackdropSurfaceToken: "--topology-blocking-backdrop-surface",
        topologyCreateNodeBackdropBackground: "oklab(0 0 0 / 0.68)",
        topologyCreateNodeBackdropFilter: "none",
        topologyBlockingComposerOverlayContract: "exclusive-blocking-composer",
        topologyInteractiveOverlayCount: 1,
        topologyInteractiveOverlayNames: ["topology-create-node-backdrop"],
        topologyMapSurfaceBlockingEdit: true,
        topologyMapSurfaceDemoted: true,
        topologyMapSurfaceDimOpacity: 0.24,
        topologyMapSurfaceDimOpacityToken: "--topology-blocking-map-opacity",
        topologyMapSurfaceFilterToken: "--topology-blocking-map-filter",
        topologyMapSurfaceInteractionContract: "suppressed-while-blocking-composer",
        topologyMapSurfacePointerEvents: "none",
        topologyTransientSurfaceCount: 0,
        topologyTransientSurfaceNames: [],
        topologyTransientSurfaceContract: "blocking-surface-wins",
        topologyCreateNodePanelTop: 142,
        topologyCreateNodePanelBottom: 584,
        topologyCreateNodePanelLeft: 476,
        topologyCreateNodePanelRight: 1036,
        topologyCreateNodePanelWidth: 560,
        topologyCreateNodePanelHeight: 442,
        topologyCreateNodePanelCenterOffset: 0,
      },
    },
    {
      capturedAt: "2026-06-16T12:00:00.000Z",
      visualEvidence: {
        screenshotPath: ".tmp/ontology-atlas-composer-blocking-ko.png",
        screenshotStatus: "saved",
        bytes: 733308,
        method: "window-id",
      },
    },
  );

  assert.equal(evidence.capturedAt, "2026-06-16T12:00:00.000Z");
  assert.deepEqual(evidence.composerBlockingProof, {
    proof: "topology-add-concept-composer-blocking",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aviews&mode=focus",
    attention: {
      winner: "blocking-composer",
      panelRole: "blocking-composer",
      placementContract: "centered-blocking-edit",
      surfaceRole: "blocking-edit-surface",
      elevationContract: "solid-panel-over-dimmed-map",
      sizeContract: "bounded-centered-composer",
      topToken: "--topology-blocking-composer-top",
      widthToken: "--topology-blocking-composer-width",
      maxHeightToken: "--topology-blocking-composer-max-height",
      surfaceToken: "--topology-blocking-composer-surface",
      borderToken: "--topology-blocking-composer-border",
      shadowToken: "--topology-blocking-composer-shadow",
      role: "dialog",
      ariaModal: "true",
      focusInside: true,
      activeElementTestId: "create-node-title",
    },
    backdrop: {
      visible: true,
      coversViewport: true,
      pointerEvents: "auto",
      contract: "blocks-map-and-closes-composer",
      surfaceToken: "--topology-blocking-backdrop-surface",
      background: "oklab(0 0 0 / 0.68)",
      dimAlpha: 0.68,
      filter: "none",
    },
    map: {
      blockingEdit: true,
      demoted: true,
      dimOpacity: 0.24,
      dimOpacityToken: "--topology-blocking-map-opacity",
      filterToken: "--topology-blocking-map-filter",
      interactionContract: "suppressed-while-blocking-composer",
      pointerEvents: "none",
    },
    overlays: {
      contract: "exclusive-blocking-composer",
      count: 1,
      names: ["topology-create-node-backdrop"],
    },
    transients: {
      contract: "blocking-surface-wins",
      count: 0,
      names: [],
      dismissedSurfaceKinds: [
        "context-menu",
        "selected-relation",
        "search-panel",
        "path-prompt",
        "node-popover",
        "support-panel",
      ],
      blockingReason: "composer-open",
    },
    panel: {
      top: 142,
      bottom: 584,
      left: 476,
      right: 1036,
      width: 560,
      height: 442,
      centerOffset: 0,
    },
    visualSeparation: {
      status: "proved",
      attentionLayer: "blocking-composer-over-dimmed-map",
      scrim: "strong-opaque-scrim",
      map: "demoted-context-only",
      panel: "solid-bounded-centered",
      interaction: "background-blocked",
      viewport: "14-inch-fullscreen-safe",
    },
    agentNextAction: "treat-add-concept-composer-as-current-work-surface",
    agentHandoff: {
      currentSurface: "topology-add-concept-composer",
      mapState: "dimmed-and-interaction-blocked",
      blockedUntil: "create-or-cancel",
      visualEvidence: {
        screenshotPath: path.resolve(".tmp/ontology-atlas-composer-blocking-ko.png"),
        screenshotStatus: "saved",
        bytes: 733308,
        method: "window-id",
      },
      nextActions: ["complete-create-node-form", "cancel-composer"],
    },
  });
});

test("WebView evidence summarizes selected relation label handoff proof for agent handoff", () => {
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
      markers: {
        topologyCardsReady: true,
        topologyRelationLabelHandoffContract: "label-level-mcp-cli-fallback",
        topologyRootAttentionWinner: "active-relation-inspector",
        topologyAgentCurrentSurface: "selected-relation",
        topologyAgentCurrentSurfaceRole: "active-relation-inspector",
        topologyAgentCurrentSurfaceRoute:
          "domain:ai-agent-partner>capability:agent-config-onboarding",
        topologySelectedNodeId: "",
        topologySelectedRelationLabelHandoffState: "ready",
        topologySelectedRelationLabelHandoffGate: "handoff-ready",
        topologySelectedRelationLabelHandoffPrimaryAction: "explain_relation",
        topologySelectedRelationLabelHandoffCliFallbackCommand:
          "ontology-atlas explain 'domain:ai-agent-partner' 'capability:agent-config-onboarding' [vault] --type 'contains'",
        topologySelectedRelationLabelHandoffFactRoute: "fact>evidence>gate>action",
        topologySelectedRelationLabelHandoffQuality: "strong",
        topologySelectedRelationLabelHandoffEvidence: "source-backed",
        topologySelectedRelationLabelAgentGateKind: "handoff-ready",
        topologySelectedRelationLabelPrimaryCopyAction: "explain_relation",
        topologySelectedRelationLabelCliFallbackCommand:
          "ontology-atlas explain 'domain:ai-agent-partner' 'capability:agent-config-onboarding' [vault] --type 'contains'",
        topologySelectedRelationLabelFactRoute: "fact>evidence>gate>action",
        topologySelectedRelationLabelQuality: "strong",
        topologySelectedRelationLabelEvidenceState: "source-backed",
        topologySelectedRelationLabelSource: "domain:ai-agent-partner",
        topologySelectedRelationLabelTarget: "capability:agent-config-onboarding",
        topologySelectedRelationLabelType: "contains",
        topologySelectedRelationLabelCount: 4,
        topologyFocusRelationLabelVisibleText: "포함 ×4 · S1",
        topologySelectedRelationLabelRoute:
          "domain:ai-agent-partner>capability:agent-config-onboarding",
        topologySelectedRelationLabelTypeLabel: "포함 ×4",
        topologySelectedRelationCardHandoffContract:
          "selected-relation-card-carries-mcp-cli-fallback",
        topologySelectedRelationCardHandoffAliasContract:
          "selected-relation-card-carries-mcp-cli-fallback",
        topologySelectedRelationCardRoute: "source>target>type>action",
        topologySelectedRelationCardEndpointRoute:
          "domain:ai-agent-partner>capability:agent-config-onboarding",
        topologySelectedRelationCardPrimaryAction: "explain_relation",
        topologySelectedRelationCardCliFallback:
          "ontology-atlas explain 'domain:ai-agent-partner' 'capability:agent-config-onboarding' [vault] --type 'contains'",
        topologySelectedRelationCardSource: "domain:ai-agent-partner",
        topologySelectedRelationCardTarget: "capability:agent-config-onboarding",
        topologySelectedRelationCardType: "contains",
        topologySelectedRelationCardLabelContextContract:
          "selected-card-preserves-aggregate-label-context",
        topologySelectedRelationCardLabelCount: 4,
        topologySelectedRelationCardLabelVisibleText: "포함 ×4 · S1",
        topologySelectedRelationCardLabelReadableText: "포함 ×4 · S1",
        topologySelectedRelationCopyPayloadFrom: "domain:ai-agent-partner",
        topologySelectedRelationCopyPayloadTo: "capability:agent-config-onboarding",
        topologySelectedRelationHandleStripSource: "domain:ai-agent-partner",
        topologySelectedRelationHandleStripTarget: "capability:agent-config-onboarding",
        topologySelectedRelationEndpointRouteContract: "visible-source-target-names-wrap",
        topologySelectedRelationEndpointRouteWrapPolicy:
          "wrap-allowed-no-horizontal-overflow",
        topologySelectedRelationEndpointRouteLineBudget: "2",
        topologySelectedRelationEndpointRouteSourceName: "AI Agent Partner",
        topologySelectedRelationEndpointRouteTargetName: "Agent Config Onboarding",
        topologySelectedRelationEndpointRouteSourceHandle: "domain:ai-agent-partner",
        topologySelectedRelationEndpointRouteTargetHandle:
          "capability:agent-config-onboarding",
        topologySelectedRelationEndpointRouteHandleSummary:
          "domain:ai-agent-partner → capability:agent-config-onboarding",
        topologySelectedRelationEndpointRouteText:
          "AI Agent Partner→Agent Config Onboarding",
        topologySelectedRelationEndpointRouteReadableText:
          "AI Agent Partner → Agent Config Onboarding",
        topologySelectedRelationEndpointReadableRoute:
          "AI Agent Partner → Agent Config Onboarding",
        topologySelectedRelationEndpointRouteWidth: 213,
        topologySelectedRelationEndpointRouteHeight: 30,
        topologySelectedRelationEndpointRouteClientWidth: 213,
        topologySelectedRelationEndpointRouteScrollWidth: 213,
        topologySelectedRelationEndpointVisibilityContract:
          "selected-relation-keeps-source-target-readable",
        topologySelectedRelationEndpointExpectedCount: 2,
        topologySelectedRelationEndpointVisibleCount: 2,
        topologySelectedRelationEndpointHiddenCount: 0,
        topologySelectedRelationEndpointCards: [
          {
            slug: "domain:ai-agent-partner",
            roleBadgeText: "FROM",
            roleBadgeContract: "visible-source-target-role-badge",
            roleBadgeVisible: true,
            visible: true,
            surfaceHidden: "",
            shift: "safe-shift",
          },
          {
            slug: "capability:agent-config-onboarding",
            roleBadgeText: "TO",
            roleBadgeContract: "visible-source-target-role-badge",
            roleBadgeVisible: true,
            visible: true,
            surfaceHidden: "",
            shift: "safe-shift",
          },
        ],
        topologySelectedRelationContextSilhouettePolicy:
          "selected-relation-keeps-endpoints-and-orientation-anchors-only",
        topologySelectedRelationContextSilhouetteActive: true,
        topologySelectedRelationContextSilhouetteHiddenCount: 8,
        topologySelectedRelationLowerPriorityVisibleDimmedCount: 0,
        topologySelectedRelationVisibleOrientationAnchorCount: 3,
        topologySelectedRelationHiddenContextInteractionContract:
          "hidden-context-is-not-pointer-focus-or-a11y-target",
        topologySelectedRelationHiddenContextInteractiveCount: 0,
        topologyRelationLabelGeometryContract: "frame-positioned-hit-targets",
        topologyRelationLabelGeometrySource: "after-render-layout-pass",
        topologyRelationLabelGeometryExpectedCount: 1,
        topologyRelationLabelGeometryReadyCount: 1,
        topologyRelationLabelGeometryPendingCount: 0,
        topologySelectedBlockingSurfaceOverlapActive: true,
        topologyVisibleCardRectReadPolicy: "frame-state-no-computed-style",
        topologyVisibleCardSelectedSurfaceRectPolicy:
          "live-rects-for-postprocess-overlap-safety",
        topologyVisibleCardRectReadCount: 10,
        topologyConnectorDomIndexContract: "reuse-card-index",
        topologyConnectorRectCacheContract: "frame-local-card-rect-cache",
        topologyConnectorRectCacheFrameFallbackContract:
          "reuse-card-placement-frame-rects-before-dom-read",
        topologyConnectorRectCacheAccounting: "reads-plus-hits",
        topologyConnectorRectCacheSize: 7,
        topologyConnectorRectCacheSeedCount: 6,
        topologyConnectorRectCacheReadCount: 0,
        topologyConnectorRectCacheHitCount: 26,
        topologyRepositionPassConnectorLabelMs: 0.18,
        topologyRepositionMaxPassConnectorLabelMs: 0.42,
        topologyRepositionPassSlowest: "card-placement",
        topologyRelief: true,
        topologyCardOverlapCount: 0,
        topologyCardClippedCount: 0,
        topologyFixedSurfaceOverlapCount: 0,
        topologyCardFixedSurfaceOverlapCount: 0,
        topologyResidualOverlapClearContract:
          "visibility-cache-proves-selected-surfaces-clear",
        topologyResidualOverlapReadPolicy: "reuse-visible-card-rect-cache",
        topologyResidualOverlapClear: true,
        topologyResidualVisibleCardOverlapCount: 0,
        topologyResidualFixedSurfaceOverlapCount: 0,
        topologyResidualCardFixedSurfaceOverlapCount: 0,
        topologyZoomLensContract: "zoom-in-uses-kind-pins-for-noncritical-context-cards",
        topologyZoomLensPresentationContract:
          "camera-or-focus-lens-uses-kind-pins-for-noncritical-context",
        topologyZoomLensPresentationActive: true,
        topologyZoomLensPresentationSource: "camera-zoom-in",
        topologyZoomLensThresholdRatio: 0.98,
        topologyZoomLensCardCompactionActive: true,
        topologyZoomLensCameraRatio: 0.74,
        topologyZoomLensActive: true,
        topologyZoomLensEligibleCount: 5,
        topologyZoomLensActiveCardCount: 3,
          topologyZoomLensPinMinOpacity: 0.42,
        topologyVisibleCardCount: 2,
        topologyZoomLensVisibleActiveCardCount: 2,
        topologyZoomLensFocusEgoReadableContract:
          "selected-focus-ego-neighbors-stay-readable-in-lens",
        topologyZoomLensFocusEgoReadableCount: 6,
        topologyZoomLensPinProximityContract:
          "zoomed-context-pins-keep-critical-relation-proximity",
        topologyZoomLensPinProximityActive: true,
        topologyZoomLensProximityPinCount: 2,
        topologyZoomLensPinProximityRingToken: "--topology-zoom-lens-pin-proximity-ring",
          topologyZoomLensPinGlyphContract: "compact-kind-pin-keeps-type-glyph-without-title-card",
          topologyZoomLensPinGlyphVisibleCount: 2,
        topologyZoomLensViewportVisibleContract:
          "visible-lens-pins-match-frame-state",
        topologyZoomLensPinCanvasContract:
          "zoom-lens-pins-stay-inside-readable-canvas-safe-band",
        topologyZoomLensPinCanvasMarginPx: 32,
        topologyZoomLensPinCanvasClampCount: 4,
        topologyZoomLensEmptyViewportFallbackContract:
          "camera-zoom-in-keeps-at-least-one-ontology-mark-visible",
        topologyZoomLensEmptyViewportFallbackActive: true,
        topologyZoomLensRelationChromeContract:
          "camera-zoom-in-demotes-nonselected-relation-chrome",
        topologyZoomLensRelationChromeActive: true,
        topologyZoomLensRelationThreadCount: 4,
        topologyZoomLensRelationLabelSuppressedCount: 2,
        topologyFocusDetailLensContract:
          "selected-focus-uses-kind-pins-for-noncritical-ego-context",
        topologyFocusDetailLensActive: true,
        topologyFocusDetailConnectorExpressionContract:
          "focus-detail-lens-demotes-noncritical-connectors",
        topologyFocusDetailConnectorExpressionActive: true,
        topologyFocusDetailConnectorExpressionCount: 3,
        topologySelectedFocusContextRailVisibleContract:
          "focus-domain-context-rail-reports-visible-and-hidden-cards",
        topologySelectedFocusContextRailCount: 5,
        topologySelectedFocusContextRailVisibleCount: 1,
        topologySelectedFocusContextRailHiddenCount: 4,
        topologySelectedFocusContextRailHiddenReason: "layout-surface-collision",
        topologyOverviewDensityLensContract:
          "zoom-out-overview-uses-kind-pins-for-noncritical-context-cards",
        topologyOverviewDensityLensThresholdRatio: 1.2,
        topologyOverviewDensityLensMinWidth: 1800,
        topologyOverviewDensityLensActive: false,
        topologyOverviewDensityLensActiveCardCount: 0,
        topologyOverviewDensityFixedGeographyContract:
          "overview-density-uses-deterministic-canvas-geography",
        topologyOverviewDensityFixedGeographyActive: true,
        topologyOverviewDensityFixedGeographyDragContract:
          "fixed-overview-geography-disables-card-drag",
        topologyOverviewDensityFixedGeographyDragLocked: true,
        topologyOverviewDensityFixedGeographyDragAttempt: "ignored",
        topologyOverviewDensityFixedGeographySlotCount: 22,
        topologyOverviewDensityFixedGeographyDomainCount: 6,
        topologyOverviewDensityFixedGeographyPinCount: 15,
        topologySupportRailOverlapReadPolicy: "reuse-visible-card-rect-cache",
        topologyDragActiveOverlapPolicy:
          "active-cluster-hides-lower-priority-overlaps",
        topologyDragActiveOverlapReadPolicy: "reuse-visible-card-rect-cache",
        topologyDragActiveOverlapHiddenCount: 0,
        topologyFixedSurfaceLiveSuppressionReadPolicy:
          "reuse-card-placement-frame-rects-before-dom-read",
        topologyFixedSurfaceLiveSuppressionReadCount: 0,
        topologyFixedSurfaceLiveSuppressedCount: 0,
        topologyDragSettleOverlapReadPolicy: "reuse-visible-card-rect-cache",
      },
    },
    { capturedAt: "2026-06-17T12:00:00.000Z" },
  );

  assert.deepEqual(evidence.agentCurrentSurfaceProof, {
    proof: "topology-agent-current-surface",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    attentionWinner: "active-relation-inspector",
    currentSurface: "selected-relation",
    currentSurfaceRole: "active-relation-inspector",
    currentSurfaceRoute: "domain:ai-agent-partner>capability:agent-config-onboarding",
    selectedNodeId: null,
    rootSelectedNodeId: null,
    agentNextAction: "read-selected-relation-surface-before-map-context",
  });
  assert.deepEqual(evidence.relationLabelHandoffProof, {
    proof: "topology-relation-label-handoff",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    contract: "label-level-mcp-cli-fallback",
    label: {
      gate: "handoff-ready",
      primaryAction: "explain_relation",
      cliFallback:
        "ontology-atlas explain 'domain:ai-agent-partner' 'capability:agent-config-onboarding' [vault] --type 'contains'",
      factRoute: "fact>evidence>gate>action",
      quality: "strong",
      evidence: "source-backed",
      source: "domain:ai-agent-partner",
      target: "capability:agent-config-onboarding",
      type: "contains",
      count: 4,
      route: "domain:ai-agent-partner>capability:agent-config-onboarding",
      typeLabel: "포함 ×4",
    },
    card: {
      contract: "selected-relation-card-carries-mcp-cli-fallback",
      handoffAliasContract: "selected-relation-card-carries-mcp-cli-fallback",
      route: "source>target>type>action",
      endpointRoute: "domain:ai-agent-partner>capability:agent-config-onboarding",
      primaryAction: "explain_relation",
      cliFallback:
        "ontology-atlas explain 'domain:ai-agent-partner' 'capability:agent-config-onboarding' [vault] --type 'contains'",
      source: "domain:ai-agent-partner",
      target: "capability:agent-config-onboarding",
      type: "contains",
      labelContextContract: "selected-card-preserves-aggregate-label-context",
      labelCount: 4,
      labelVisibleText: "포함 ×4 · S1",
      labelReadableText: "포함 ×4 · S1",
    },
    root: {
      attentionWinner: "active-relation-inspector",
      currentSurface: "selected-relation",
      currentSurfaceRole: "active-relation-inspector",
      currentSurfaceRoute: "domain:ai-agent-partner>capability:agent-config-onboarding",
    },
    aggregate: {
      gate: "handoff-ready",
      primaryAction: "explain_relation",
      cliFallback:
        "ontology-atlas explain 'domain:ai-agent-partner' 'capability:agent-config-onboarding' [vault] --type 'contains'",
      factRoute: "fact>evidence>gate>action",
      quality: "strong",
      evidence: "source-backed",
    },
    agentNextAction: "run-explain-relation-for-handoff",
  });
  assert.deepEqual(evidence.relationEndpointVisibilityProof, {
    proof: "topology-selected-relation-endpoint-visibility",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    contract: "selected-relation-keeps-source-target-readable",
    expectedCount: 2,
    visibleCount: 2,
    hiddenCount: 0,
    source: "domain:ai-agent-partner",
    target: "capability:agent-config-onboarding",
    readableRoute: "AI Agent Partner → Agent Config Onboarding",
    layerReadableRoute: "AI Agent Partner → Agent Config Onboarding",
    routeProof: {
      contract: "visible-source-target-names-wrap",
      wrapPolicy: "wrap-allowed-no-horizontal-overflow",
      lineBudget: 2,
      clientWidth: 213,
      scrollWidth: 213,
      horizontalOverflow: 0,
    },
    cards: [
      {
        slug: "domain:ai-agent-partner",
        visible: true,
        surfaceHidden: "",
        shift: "safe-shift",
      },
      {
        slug: "capability:agent-config-onboarding",
        visible: true,
        surfaceHidden: "",
        shift: "safe-shift",
      },
    ],
    agentNextAction: "read-selected-relation-with-source-and-target-cards",
  });
  assert.deepEqual(evidence.relationContextSilhouetteProof, {
    proof: "topology-selected-relation-context-silhouette",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    policy: "selected-relation-keeps-endpoints-and-orientation-anchors-only",
    active: true,
    hiddenCount: 8,
    lowerPriorityVisibleDimmedCount: 0,
    visibleOrientationAnchorCount: 3,
    agentNextAction: "read-selected-relation-before-background-context",
  });
  assert.deepEqual(evidence.relationLabelFrameGeometryProof, {
    proof: "topology-relation-label-frame-geometry",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    contract: "frame-positioned-hit-targets",
    source: "after-render-layout-pass",
    expected: 1,
    ready: 1,
    pending: 0,
    agentNextAction: "trust-frame-positioned-relation-label-hit-targets",
  });
  assert.deepEqual(evidence.connectorCacheProof, {
    proof: "topology-connector-cache-frame-fallback",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    domIndexContract: "reuse-card-index",
    cacheContract: "frame-local-card-rect-cache",
    frameFallbackContract: "reuse-card-placement-frame-rects-before-dom-read",
    accounting: "reads-plus-hits",
    size: 7,
    seedCount: 6,
    readCount: 0,
    hitCount: 26,
    visibleCardClippedCount: 0,
    agentNextAction: "trust-frame-local-connector-rect-cache-before-reading-labels",
  });
  assert.deepEqual(evidence.connectorLabelPassProof, {
    proof: "topology-connector-label-pass-budget",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    passMs: 0.18,
    budgetMs: 3,
    maxPassMs: 0.42,
    slowestPass: "card-placement",
    agentNextAction: "read-relation-labels-after-connector-label-pass-budget",
  });
  assert.deepEqual(evidence.visibleCardSelectedSurfaceRectProof, {
    proof: "topology-visible-card-selected-surface-rect-policy",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    selectedBlockingSurfaceOverlapActive: true,
    readPolicy: "frame-state-no-computed-style",
    selectedSurfaceRectPolicy: "live-rects-for-postprocess-overlap-safety",
    readCount: 10,
    agentNextAction: "trust-selected-surface-rect-policy-before-reading-relation",
  });
  assert.deepEqual(evidence.residualOverlapProof, {
    proof: "topology-residual-overlap-clear",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    visibleCardOverlapCount: 0,
    visibleCardClippedCount: 0,
    fixedSurfaceOverlapCount: 0,
    cardFixedSurfaceOverlapCount: 0,
    supportRailOverlapReadPolicy: "reuse-visible-card-rect-cache",
    dragActiveOverlapPolicy: "active-cluster-hides-lower-priority-overlaps",
    dragActiveOverlapReadPolicy: "reuse-visible-card-rect-cache",
    dragActiveOverlapHiddenCount: 0,
    fixedSurfaceLiveSuppressionReadPolicy:
      "reuse-card-placement-frame-rects-before-dom-read",
    fixedSurfaceLiveSuppressionReadCount: 0,
    fixedSurfaceLiveSuppressedCount: 0,
    dragSettleOverlapReadPolicy: "reuse-visible-card-rect-cache",
    domMarker: {
      clearContract: "visibility-cache-proves-selected-surfaces-clear",
      readPolicy: "reuse-visible-card-rect-cache",
      clear: true,
      visibleCardOverlapCount: 0,
      fixedSurfaceOverlapCount: 0,
      cardFixedSurfaceOverlapCount: 0,
    },
    agentNextAction: "read-relation-surfaces-after-residual-overlap-clear",
  });
  assert.deepEqual(evidence.zoomLensProof, {
    proof: "topology-zoom-lens-kind-pins",
    status: "proved",
    route: "/ko/topology/?p=domain%3Aai-agent-partner&mode=focus",
    contract: "zoom-in-uses-kind-pins-for-noncritical-context-cards",
    presentationContract: "camera-or-focus-lens-uses-kind-pins-for-noncritical-context",
    thresholdRatio: 0.98,
    cardCompactionActive: true,
    presentationActive: true,
    presentationSource: "camera-zoom-in",
    cameraRatio: 0.74,
    active: true,
    eligibleCount: 5,
    activeCardCount: 3,
    visibleCardCount: 2,
    visibleActiveCardCount: 2,
    pinMinOpacity: 0.42,
    focusEgoReadable: {
      contract: "selected-focus-ego-neighbors-stay-readable-in-lens",
      count: 6,
    },
    pinGlyph: {
      contract: "compact-kind-pin-keeps-type-glyph-without-title-card",
      visibleCount: 2,
    },
    proximityPins: {
      contract: "zoomed-context-pins-keep-critical-relation-proximity",
      active: true,
      count: 2,
      ringToken: "--topology-zoom-lens-pin-proximity-ring",
    },
    viewportVisibleContract: "visible-lens-pins-match-frame-state",
    pinCanvas: {
      contract: "zoom-lens-pins-stay-inside-readable-canvas-safe-band",
      marginPx: 32,
      clampCount: 4,
    },
    emptyViewportFallback: {
      contract: "camera-zoom-in-keeps-at-least-one-ontology-mark-visible",
      active: true,
    },
    relationChrome: {
      contract: "camera-zoom-in-demotes-nonselected-relation-chrome",
      active: true,
      threadCount: 4,
      labelSuppressedCount: 2,
    },
    focusDetail: {
      contract: "selected-focus-uses-kind-pins-for-noncritical-ego-context",
      active: true,
      connectorExpression: {
        contract: "focus-detail-lens-demotes-noncritical-connectors",
        active: true,
        count: 3,
      },
      contextRail: {
        contract: "focus-domain-context-rail-reports-visible-and-hidden-cards",
        totalCount: 5,
        visibleCount: 1,
        hiddenCount: 4,
        hiddenReason: "layout-surface-collision",
      },
    },
    overviewDensity: {
      contract: "zoom-out-overview-uses-kind-pins-for-noncritical-context-cards",
      thresholdRatio: 1.2,
      minWidth: 1800,
      active: false,
      activeCardCount: 0,
      fixedGeography: {
        contract: "overview-density-uses-deterministic-canvas-geography",
        active: true,
        dragContract: "fixed-overview-geography-disables-card-drag",
        dragLocked: true,
        dragAttempt: "ignored",
        slotCount: 22,
        domainCount: 6,
        pinCount: 15,
      },
    },
    agentNextAction: "trust-kind-pin-lens-before-reading-dense-map-cards",
  });
});

test("WebView evidence summarizes selected relation visible fact route proof for agent handoff", () => {
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/ko/topology/?p=capability%3Aagent-config-onboarding&mode=focus",
      width: 1512,
      height: 917,
      markers: {
        topologyRootAttentionWinner: "active-relation-inspector",
        topologyAgentCurrentSurface: "selected-relation",
        topologyAgentCurrentSurfaceRole: "active-relation-inspector",
        topologyAgentCurrentSurfaceRoute:
          "capability:agent-config-onboarding>element:operations-nav",
        topologySelectedRelationCardHandoffContract:
          "selected-relation-card-carries-mcp-cli-fallback",
        topologySelectedRelationCardRoute: "source>target>type>action",
        topologySelectedRelationCardEndpointRoute:
          "capability:agent-config-onboarding>element:operations-nav",
        topologySelectedRelationCardPrimaryAction: "explain_relation",
        topologySelectedRelationCardCliFallback:
          "ontology-atlas explain 'capability:agent-config-onboarding' 'element:operations-nav' [vault] --type 'contains'",
        topologySelectedRelationCardSource: "capability:agent-config-onboarding",
        topologySelectedRelationCardTarget: "element:operations-nav",
        topologySelectedRelationCardType: "contains",
        topologySelectedRelationCardLabelContextContract:
          "selected-card-preserves-aggregate-label-context",
        topologySelectedRelationCardLabelCount: 6,
        topologySelectedRelationCardLabelVisibleText: "포함 ×6 · S1",
        topologySelectedRelationCardLabelReadableText: "포함 ×6 · S1",
        topologyFocusRelationLabelVisibleText: "포함 ×6 · S1",
        topologySelectedRelationLabelCount: 6,
        topologySelectedRelationClaimLensVisible: true,
        topologySelectedRelationClaimLensText:
          "강한 구조 · 출처 1개 · 타입이 있는 온톨로지 사실",
        topologySelectedRelationClaimLensQuality: "strong",
        topologySelectedRelationContractKind: "typed-fact-not-similarity",
        topologySelectedRelationContractText:
          "추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
        topologySelectedRelationProofBandWidth: 236,
        topologySelectedRelationProofBandHeight: 42,
        topologySelectedRelationAgentDecisionText:
          "타입과 근거가 있어 에이전트 전달에 포함할 수 있습니다.",
        topologySelectedRelationEndpointRouteContract: "visible-source-target-names-wrap",
        topologySelectedRelationEndpointRouteReadableText:
          "Agent Config Onboarding → Operations Nav",
        topologySelectedRelationCopyPayloadTool: "query_ontology",
        topologySelectedRelationCopyPayloadAction: "explain_relation",
        topologySelectedRelationCopyPayloadFrom: "capability:agent-config-onboarding",
        topologySelectedRelationCopyPayloadTo: "element:operations-nav",
        topologySelectedRelationCopyPayloadType: "contains",
        topologySelectedRelationCopyPayloadEvidence: "source-backed",
        topologySelectedRelationCopyPayloadGate: "handoff-ready",
        topologySelectedRelationCopyPayloadCall:
          'query_ontology({"operation":"explain_relation","from":"capability:agent-config-onboarding","to":"element:operations-nav","direction":"undirected","maxHops":5,"limit":10})',
        topologySelectedRelationCopyPayloadSummary:
          "query_ontology · explain_relation · capability:agent-config-onboarding → element:operations-nav · contains · source-backed · handoff-ready",
        topologySelectedRelationCopyPayloadVisibleSummary: "설명 준비",
        topologySelectedRelationCopyPayloadVisibleHandleSummary:
          "agent-config-onboarding → operations-nav",
        topologySelectedRelationCopyPayloadLayoutContract:
          "visible-summary-and-handle-readable",
      },
    },
    { capturedAt: "2026-06-22T12:00:00.000Z" },
  );

  assert.deepEqual(evidence.selectedRelationVisibleFactRouteProof, {
    proof: "topology-selected-relation-visible-fact-route",
    status: "proved",
    route: "/ko/topology/?p=capability%3Aagent-config-onboarding&mode=focus",
    root: {
      attentionWinner: "active-relation-inspector",
      currentSurface: "selected-relation",
      currentSurfaceRole: "active-relation-inspector",
      currentSurfaceRoute: "capability:agent-config-onboarding>element:operations-nav",
    },
    card: {
      contract: "selected-relation-card-carries-mcp-cli-fallback",
      route: "source>target>type>action",
      endpointRoute: "capability:agent-config-onboarding>element:operations-nav",
      primaryAction: "explain_relation",
      cliFallback:
        "ontology-atlas explain 'capability:agent-config-onboarding' 'element:operations-nav' [vault] --type 'contains'",
      source: "capability:agent-config-onboarding",
      target: "element:operations-nav",
      type: "contains",
    },
    visibleFactRoute: {
      claimLensVisible: true,
      claimLensText: "강한 구조 · 출처 1개 · 타입이 있는 온톨로지 사실",
      claimLensQuality: "strong",
      contractKind: "typed-fact-not-similarity",
      contractText: "추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
      proofBandWidth: 236,
      proofBandHeight: 42,
      agentDecisionText: "타입과 근거가 있어 에이전트 전달에 포함할 수 있습니다.",
      agentGateKind: "handoff-ready",
      endpointRouteContract: "visible-source-target-names-wrap",
      readableRoute: "Agent Config Onboarding → Operations Nav",
    },
    copyPayload: {
      tool: "query_ontology",
      action: "explain_relation",
      from: "capability:agent-config-onboarding",
      to: "element:operations-nav",
      type: "contains",
      evidence: "source-backed",
      gate: "handoff-ready",
      call:
        'query_ontology({"operation":"explain_relation","from":"capability:agent-config-onboarding","to":"element:operations-nav","direction":"undirected","maxHops":5,"limit":10})',
      summary:
        "query_ontology · explain_relation · capability:agent-config-onboarding → element:operations-nav · contains · source-backed · handoff-ready",
      visibleSummary: "설명 준비",
      visibleHandleSummary: "agent-config-onboarding → operations-nav",
      layoutContract: "visible-summary-and-handle-readable",
    },
    agentNextAction: "run-selected-relation-copy-payload",
  });
});

test("WebView evidence flags slow connector label pass budget regressions", () => {
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/ko/topology/?p=domain%3Aviews&mode=focus",
      markers: {
        topologyRepositionPassConnectorLabelMs: 3.2,
        topologyRepositionMaxPassConnectorLabelMs: 3.2,
        topologyRepositionPassSlowest: "connector-label",
      },
    },
    { capturedAt: "2026-06-17T12:00:00.000Z" },
  );

  assert.deepEqual(evidence.connectorLabelPassProof, {
    proof: "topology-connector-label-pass-budget",
    status: "incomplete",
    route: "/ko/topology/?p=domain%3Aviews&mode=focus",
    passMs: 3.2,
    budgetMs: 3,
    maxPassMs: 3.2,
    slowestPass: "connector-label",
    agentNextAction: "read-relation-labels-after-connector-label-pass-budget",
  });
});

test("WebView evidence summarizes selected focus dim context proof for agent handoff", () => {
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/en/topology/?p=domain%3Aviews&mode=focus",
      markers: {
        topologyAttentionWinner: "focus-state",
        topologyRootAttentionWinner: "focus-state",
        topologyAgentCurrentSurface: "selected-node",
        topologyAgentCurrentSurfaceRole: "active-node-inspector",
        topologyAgentCurrentSurfaceRoute: "domain:views",
        topologyUiScale: 1,
        topologyUiScaleWritePolicy: "reuse-stable-scale",
        topologyRootSelectedNodeId: "domain:views",
        topologyNodePopoverVisible: true,
        topologyNodePopoverSurfaceRole: "active-node-inspector",
        topologyNodePopoverCollapsed: true,
        topologySelectedNodePopoverVisible: true,
        topologySelectedNodeId: "domain:views",
        topologySelectedNodeTitle: "Views",
        topologyNodePopoverRelationFactCount: "3",
        topologyNodePopoverRelationTypeCount: "2",
        topologyNodePopoverCompactMeaningText: "A core hub — 10 places depend on it",
        topologyNodePopoverCompactMeaningContract: "plain-language-meaning-before-typed-facts",
        topologyNodePopoverCompactMeaningResponsiveContract: "visible-desktop-sr-only-compact",
        topologyNodePopoverCompactCommandRowContract: "facts-and-actions-share-final-scanline",
        topologyNodePopoverCompactCommandRowGapToken:
          "--topology-node-popover-compact-command-row-gap",
        topologyNodePopoverCompactActionsContract: "actions-share-command-row-with-facts",
        topologyNodePopoverCompactActionsReadableFlow:
          "selected-node-facts-to-agent-handoff",
        topologyNodePopoverCompactBriefActionReadableFlow:
          "selected-node-facts-to-agent-brief",
        topologyNodePopoverAgentHandoffContract: "selected-node-actions-visible",
        topologyNodePopoverAgentHandoffRoute: "selected-node>facts>actions",
        topologyNodePopoverAgentHandoffPrimaryAction: "focus-brief",
        topologyNodePopoverAgentHandoffActionCount: "3",
        topologyNodePopoverAgentHandoffRelationFactCount: "3",
        topologyNodePopoverAgentHandoffRelationTypeCount: "2",
        topologyNodePopoverAgentHandoffSummaryContract: "visible-mcp-cli-focus-brief",
        topologyNodePopoverAgentHandoffVisibleSummary: "MCP/CLI · Brief",
        topologyNodePopoverAgentHandoffSelectedNode: "domain:views",
        topologyNodePopoverCompactRelationFactsContract:
          "collapsed-dock-surfaces-typed-facts",
        topologyNodePopoverCompactRelationFactsReadableContract:
          "direct-typed-facts-not-scores",
        topologyNodePopoverCompactRelationFactsNoScores:
          "Typed ontology facts, not inferred similarity scores.",
        topologyNodePopoverCompactRelationFactsAccessibleName:
          "3 direct facts · 2 relation types · Typed ontology facts, not inferred similarity scores.",
        topologyNodePopoverCompactRelationFactsTitle:
          "3 direct facts · 2 relation types · Typed ontology facts, not inferred similarity scores.",
        topologyNodePopoverCompactRelationFactsHandoffContract:
          "compact-counts-route-to-relation-list-handoff",
        topologyNodePopoverCompactRelationFactsHandoffRoute:
          "selected-node>relations>fact>evidence>gate>action>payload",
        topologyNodePopoverCompactRelationFactsHandoffTool: "query_ontology",
        topologyNodePopoverCompactRelationFactsHandoffSummary:
          "query_ontology · 2 rendered · 0 hidden · 3 direct facts",
        topologyNodePopoverCompactRelationFactsHiddenRemainderCount: 0,
        topologyNodePopoverCompactRelationFactsVisible: true,
        topologyNodePopoverCompactActionsVisible: true,
        topologyNodePopoverCompactRelationFactsTop: 212,
        topologyNodePopoverCompactActionsTop: 206,
        topologyNodePopoverCompactHandoffSummaryVisible: true,
        topologyNodePopoverCompactHandoffSummaryContract: "visible-mcp-cli-focus-brief",
        topologyNodePopoverCompactHandoffSummaryVisibleLabel: "MCP/CLI",
        topologyNodePopoverCompactHandoffSummaryText: "MCP/CLI · Brief",
        topologyNodePopoverCompactHandoffSummarySelectedNode: "domain:views",
        topologyNodePopoverCompactHandoffSummaryClientWidth: 98,
        topologyNodePopoverCompactHandoffSummaryScrollWidth: 98,
        topologyNodePopoverCompactHandoffSummaryTop: 212,
        topologyClickFocusRelationshipContext: "durable",
        topologyClickFocusRelationshipContextSource: "selected-dock-companions",
        topologyFocusClusterMode: "none",
        topologyFocusClusterStage: "",
        topologyFocusClusterSize: 6,
        topologyFocusClusterVisible: false,
        topologyDimOpacityContract: "readable-context-geography",
        topologyDimAnchorOpacity: 0.26,
        topologyDimChipOpacity: 0.08,
        topologyDimContextOpacity: 0.08,
        topologyDimAnchorVisibleCount: 3,
        topologyDimChipVisibleCount: 4,
        topologyDimAnchorMinOpacity: 0.26,
        topologyDimChipMinOpacity: 0.08,
      },
    },
    { capturedAt: "2026-06-20T12:00:00.000Z" },
  );

  assert.deepEqual(evidence.agentCurrentSurfaceProof, {
    proof: "topology-agent-current-surface",
    status: "proved",
    route: "/en/topology/?p=domain%3Aviews&mode=focus",
    attentionWinner: "focus-state",
    currentSurface: "selected-node",
    currentSurfaceRole: "active-node-inspector",
    currentSurfaceRoute: "domain:views",
    selectedNodeId: "domain:views",
    rootSelectedNodeId: "domain:views",
    handoff: {
      contract: "selected-node-actions-visible",
      route: "selected-node>facts>actions",
      primaryAction: "focus-brief",
      summaryContract: "visible-mcp-cli-focus-brief",
      visibleSummary: "MCP/CLI · Brief",
      actionCount: 3,
      relationFactCount: 3,
      relationTypeCount: 2,
      agentNextAction: "copy-selected-node-focus-brief-or-expand-detail",
    },
    agentNextAction: "read-selected-node-surface-before-map-context",
  });
  assert.deepEqual(evidence.agentUiScaleStabilityProof, {
    proof: "topology-ui-scale-stability",
    status: "proved",
    route: "/en/topology/?p=domain%3Aviews&mode=focus",
    uiScale: 1,
    writePolicy: "reuse-stable-scale",
    stableScaleReused: true,
    agentNextAction: "trust-stable-ui-scale-before-reading-surface-proof",
  });
  assert.deepEqual(evidence.selectedFocusDimProof, {
    proof: "topology-selected-focus-dim-context",
    status: "proved",
    route: "/en/topology/?p=domain%3Aviews&mode=focus",
    attention: {
      winner: "focus-state",
      selectedNodeId: "domain:views",
      selectedNodeTitle: "Views",
      compactMeaning: "A core hub — 10 places depend on it",
      compactMeaningContract: "plain-language-meaning-before-typed-facts",
      compactMeaningResponsiveContract: "visible-desktop-sr-only-compact",
      positionContract: null,
      gutterContract: null,
      rightInsetToken: null,
      rightInset: null,
      supportContract: null,
      commandRowContract: "facts-and-actions-share-final-scanline",
      commandRowGapToken: "--topology-node-popover-compact-command-row-gap",
      actionsContract: "actions-share-command-row-with-facts",
      actionsReadableFlow: "selected-node-facts-to-agent-handoff",
      relationFactsReadableContract: "direct-typed-facts-not-scores",
      relationFactsAccessibleName:
        "3 direct facts · 2 relation types · Typed ontology facts, not inferred similarity scores.",
      relationFactsHandoff: {
        contract: "compact-counts-route-to-relation-list-handoff",
        route: "selected-node>relations>fact>evidence>gate>action>payload",
        tool: "query_ontology",
        summary: "query_ontology · 2 rendered · 0 hidden · 3 direct facts",
        hiddenRemainderCount: 0,
      },
      briefActionReadableFlow: "selected-node-facts-to-agent-brief",
      factsAndActionsShareScanline: true,
      relationshipContext: "durable",
      relationshipContextSource: "selected-dock-companions",
      focusClusterMode: "none",
      focusClusterStage: "",
      focusClusterSize: 6,
      focusClusterVisible: false,
      hull: "not-rendered",
    },
    dim: {
      contract: "readable-context-geography",
      anchorOpacity: 0.26,
      contextOpacity: 0.08,
      contextOpacityAlias: 0.08,
      anchorVisibleCount: 3,
      contextVisibleCount: 4,
      anchorMinOpacity: 0.26,
      contextMinOpacity: 0.08,
      anchorMinContract: 0.26,
      contextMinContract: 0.08,
      anchorToken: "--topology-map-dim-anchor-opacity",
      contextToken: "--topology-map-dim-context-opacity",
    },
    agentNextAction: "read-selected-node-popover-before-background-map-context",
  });
  assert.deepEqual(evidence.nodePopoverCompactHandoffProof, {
    proof: "topology-node-popover-compact-handoff-root",
    status: "proved",
    route: "/en/topology/?p=domain%3Aviews&mode=focus",
    selectedNode: {
      id: "domain:views",
      title: "Views",
      compactMeaning: "A core hub — 10 places depend on it",
      relationFactCount: 3,
      relationTypeCount: 2,
    },
    root: {
      attentionWinner: "focus-state",
      currentSurface: "selected-node",
      currentSurfaceRole: "active-node-inspector",
      currentSurfaceRoute: "domain:views",
      selectedNodeId: "domain:views",
    },
    handoff: {
      contract: "selected-node-actions-visible",
      route: "selected-node>facts>actions",
      primaryAction: "focus-brief",
      summaryContract: "visible-mcp-cli-focus-brief",
      visibleSummary: "MCP/CLI · Brief",
      actionCount: 3,
      relationFactCount: 3,
      relationTypeCount: 2,
      readableFlow: "selected-node-facts-to-agent-handoff",
      briefActionFlow: "selected-node-facts-to-agent-brief",
      compactSummary: {
        visible: true,
        contract: "visible-mcp-cli-focus-brief",
        visibleLabel: "MCP/CLI",
        text: "MCP/CLI · Brief",
        selectedNode: "domain:views",
        clientWidth: 98,
        scrollWidth: 98,
      },
      relationFacts: {
        contract: "compact-counts-route-to-relation-list-handoff",
        route: "selected-node>relations>fact>evidence>gate>action>payload",
        tool: "query_ontology",
        summary: "query_ontology · 2 rendered · 0 hidden · 3 direct facts",
        hiddenRemainderCount: 0,
      },
    },
    agentNextAction: "copy-selected-node-focus-brief-or-expand-detail",
  });
});

test("WebView evidence summarizes node popover compact verification proof for agent handoff", () => {
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/en/topology/?p=domain%3Aviews&mode=focus",
      markers: {
        topologyNodePopoverVerifyAttempted: true,
        topologyNodePopoverVerifyReason: "done",
        topologyNodePopoverVerifyExpanded: true,
        topologyNodePopoverVerifyCompactFactsVisible: true,
        topologyNodePopoverVerifyCompactFactsContract: "collapsed-dock-surfaces-typed-facts",
        topologyNodePopoverVerifyCompactFactsReadableContract: "direct-typed-facts-not-scores",
        topologyNodePopoverVerifyCompactFactsAccessibleName:
          "3 direct facts · 2 relation types · Typed ontology facts, not inferred similarity scores.",
        topologyNodePopoverVerifyCompactFactsNoScores:
          "Typed ontology facts, not inferred similarity scores.",
        topologyNodePopoverVerifyCompactFactsHandoffContract:
          "compact-counts-route-to-relation-list-handoff",
        topologyNodePopoverVerifyCompactFactsHandoffRoute:
          "selected-node>relations>fact>evidence>gate>action>payload",
        topologyNodePopoverVerifyCompactFactsHandoffTool: "query_ontology",
        topologyNodePopoverVerifyCompactFactsHandoffSummary:
          "query_ontology · 2 rendered · 10 hidden · 15 direct facts",
        topologyNodePopoverVerifyCompactFactsHiddenRemainderCount: 10,
        topologyNodePopoverVerifyCompactActionsVisible: true,
        topologyNodePopoverVerifyCompactActionsContract:
          "actions-share-command-row-with-facts",
        topologyNodePopoverVerifyCompactActionsReadableFlow:
          "selected-node-facts-to-agent-handoff",
        topologyNodePopoverVerifyCompactBriefVisible: true,
        topologyNodePopoverVerifyCompactBriefAction: "copy-focus-brief",
        topologyNodePopoverVerifyCompactBriefReadableFlow:
          "selected-node-facts-to-agent-brief",
        topologyNodePopoverVerifyCompactBriefRailLabel: "Agent handoff",
        topologyNodePopoverVerifyCompactBriefTitle: "Agent handoff: Copy focus brief",
      },
    },
    { capturedAt: "2026-06-20T12:10:00.000Z" },
  );

  assert.deepEqual(evidence.nodePopoverCompactVerificationProof, {
    proof: "topology-node-popover-compact-verification",
    status: "proved",
    route: "/en/topology/?p=domain%3Aviews&mode=focus",
    attempted: true,
    expanded: true,
    reason: "done",
    compactFacts: {
      visible: true,
      contract: "collapsed-dock-surfaces-typed-facts",
      readableContract: "direct-typed-facts-not-scores",
      accessibleName:
        "3 direct facts · 2 relation types · Typed ontology facts, not inferred similarity scores.",
      noScores: "Typed ontology facts, not inferred similarity scores.",
      handoffContract: "compact-counts-route-to-relation-list-handoff",
      handoffRoute: "selected-node>relations>fact>evidence>gate>action>payload",
      handoffTool: "query_ontology",
      handoffSummary: "query_ontology · 2 rendered · 10 hidden · 15 direct facts",
      hiddenRemainderCount: 10,
    },
    compactActions: {
      visible: true,
      contract: "actions-share-command-row-with-facts",
      readableFlow: "selected-node-facts-to-agent-handoff",
      briefVisible: true,
      briefAction: "copy-focus-brief",
      briefReadableFlow: "selected-node-facts-to-agent-brief",
      briefRailLabel: "Agent handoff",
      briefTitle: "Agent handoff: Copy focus brief",
    },
    agentNextAction: "read-compact-node-facts-before-expanded-popover-proof",
  });
});

test("WebView evidence records unavailable visual evidence diagnostics for agent handoff", () => {
  const evidence = verifier.buildWebviewEvidencePayload(
    {
      href: "tauri://localhost/ko/topology/?p=domain%3Aviews&mode=focus",
      markers: {
        topologyCreateNodeOpen: true,
      },
    },
    {
      capturedAt: "2026-06-16T12:05:00.000Z",
      visualEvidence: {
        screenshotPath: ".tmp/ontology-atlas-composer-blocking-ko.png",
        screenshotStatus: "unavailable",
        blocker: "screen-capture-returned-blank-image",
        diagnosticsPath: ".tmp/ontology-atlas-composer-blocking-ko.png.diagnostics.json",
        summary: "screencapture returned a blank or low-contrast image.",
      },
    },
  );

  assert.deepEqual(evidence.composerBlockingProof.agentHandoff.visualEvidence, {
    screenshotPath: path.resolve(".tmp/ontology-atlas-composer-blocking-ko.png"),
    screenshotStatus: "unavailable",
    blocker: "screen-capture-returned-blank-image",
    diagnosticsPath: path.resolve(".tmp/ontology-atlas-composer-blocking-ko.png.diagnostics.json"),
    summary: "screencapture returned a blank or low-contrast image.",
  });
});
