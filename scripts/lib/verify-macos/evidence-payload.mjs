import path from "node:path";
import fs from "node:fs";
import { evidenceRoute, extractBackdropAlpha, markerNumber, markerText, validateSelectedRelationContextSilhouetteMarkers, validateSelectedRelationEndpointRouteMarkers, validateSelectedRelationEndpointVisibilityMarkers, validateTopologyConnectorCacheMarkers } from "./relation-marker-validators.mjs";
import { TOPOLOGY_DIM_ANCHOR_MIN_OPACITY, TOPOLOGY_DIM_CONTEXT_MIN_OPACITY, TOPOLOGY_DIM_OPACITY_CONTRACT, VALID_ZOOM_LENS_PRESENTATION_SOURCES } from "./webview-env.mjs";

export const TOPOLOGY_CONNECTOR_LABEL_PASS_BUDGET_MS = 3;


export function normalizeVisualEvidenceReference(visualEvidence, visualEvidencePath = null) {
  if (visualEvidence && typeof visualEvidence === "object") {
    const screenshotPath = visualEvidence.screenshotPath ?? visualEvidence.artifactPath;
    if (typeof screenshotPath !== "string" || screenshotPath.trim() === "") return null;
    const screenshotStatus = ["saved", "unavailable", "requested"].includes(
      visualEvidence.screenshotStatus,
    )
      ? visualEvidence.screenshotStatus
      : "requested";
    const reference = {
      screenshotPath: path.resolve(screenshotPath),
      screenshotStatus,
    };
    if (Number.isFinite(visualEvidence.bytes)) {
      reference.bytes = visualEvidence.bytes;
    }
    if (typeof visualEvidence.method === "string" && visualEvidence.method.trim()) {
      reference.method = visualEvidence.method.trim();
    }
    if (typeof visualEvidence.blocker === "string" && visualEvidence.blocker.trim()) {
      reference.blocker = visualEvidence.blocker.trim();
    }
    if (typeof visualEvidence.diagnosticsPath === "string" && visualEvidence.diagnosticsPath.trim()) {
      reference.diagnosticsPath = path.resolve(visualEvidence.diagnosticsPath);
    }
    if (typeof visualEvidence.summary === "string" && visualEvidence.summary.trim()) {
      reference.summary = visualEvidence.summary.trim();
    }
    if (Array.isArray(visualEvidence.nextActions) && visualEvidence.nextActions.length > 0) {
      reference.nextActions = visualEvidence.nextActions
        .filter((action) => typeof action === "string" && action.trim())
        .map((action) => action.trim());
    }
    return reference;
  }
  if (visualEvidencePath) {
    return {
      screenshotPath: path.resolve(visualEvidencePath),
      screenshotStatus: "requested",
    };
  }
  return null;
}


export const COMPOSER_DISMISSED_SURFACE_KINDS = [
  "context-menu",
  "selected-relation",
  "search-panel",
  "path-prompt",
  "node-popover",
  "support-panel",
];


export function buildWebviewEvidencePayload(
  payload,
  {
    capturedAt = new Date().toISOString(),
    visualEvidence = null,
    visualEvidencePath = null,
  } = {},
) {
  const markers = payload?.markers ?? {};
  const visualEvidenceReference = normalizeVisualEvidenceReference(visualEvidence, visualEvidencePath);
  const currentSurface = markerText(markers, "topologyAgentCurrentSurface");
  const currentSurfaceAttentionWinner =
    markerText(markers, "topologyAttentionWinner") ??
    markerText(markers, "topologyRootAttentionWinner");
  const currentSurfaceHandoff =
    currentSurface === "selected-node" &&
    markerText(markers, "topologyNodePopoverAgentHandoffRoute")
      ? {
        contract: markerText(markers, "topologyNodePopoverAgentHandoffContract"),
        route: markerText(markers, "topologyNodePopoverAgentHandoffRoute"),
        primaryAction: markerText(markers, "topologyNodePopoverAgentHandoffPrimaryAction"),
        summaryContract: markerText(
          markers,
          "topologyNodePopoverAgentHandoffSummaryContract",
        ),
        visibleSummary: markerText(markers, "topologyNodePopoverAgentHandoffVisibleSummary"),
        actionCount: markerNumber(markers, "topologyNodePopoverAgentHandoffActionCount"),
        relationFactCount: markerNumber(
          markers,
          "topologyNodePopoverAgentHandoffRelationFactCount",
        ),
        relationTypeCount: markerNumber(
          markers,
          "topologyNodePopoverAgentHandoffRelationTypeCount",
        ),
        agentNextAction: "copy-selected-node-focus-brief-or-expand-detail",
      }
      : null;
  const uiScale = markerNumber(markers, "topologyUiScale");
  const uiScaleWritePolicy = markerText(markers, "topologyUiScaleWritePolicy");
  const agentCurrentSurfaceProof = currentSurface
    ? {
      proof: "topology-agent-current-surface",
      status:
        currentSurfaceAttentionWinner && markerText(markers, "topologyAgentCurrentSurfaceRole")
          ? "proved"
          : "incomplete",
      route: evidenceRoute(payload?.href),
      attentionWinner: currentSurfaceAttentionWinner,
      currentSurface,
      currentSurfaceRole: markerText(markers, "topologyAgentCurrentSurfaceRole"),
      currentSurfaceRoute: markerText(markers, "topologyAgentCurrentSurfaceRoute"),
      selectedNodeId: markerText(markers, "topologySelectedNodeId"),
      rootSelectedNodeId: markerText(markers, "topologyRootSelectedNodeId"),
      ...(currentSurfaceHandoff ? { handoff: currentSurfaceHandoff } : {}),
      agentNextAction:
        currentSurface === "selected-relation"
          ? "read-selected-relation-surface-before-map-context"
          : currentSurface === "selected-node"
            ? "read-selected-node-surface-before-map-context"
            : "read-agent-current-surface-before-map-context",
    }
    : null;
  const agentUiScaleStabilityProof = uiScaleWritePolicy
    ? {
      proof: "topology-ui-scale-stability",
      status:
        uiScale !== null && uiScaleWritePolicy === "reuse-stable-scale"
          ? "proved"
          : "incomplete",
      route: evidenceRoute(payload?.href),
      uiScale,
      writePolicy: uiScaleWritePolicy,
      stableScaleReused: uiScaleWritePolicy === "reuse-stable-scale",
      agentNextAction: "trust-stable-ui-scale-before-reading-surface-proof",
    }
    : null;
  const composerBlockingProof = markers.topologyCreateNodeOpen === true
    ? {
      proof: "topology-add-concept-composer-blocking",
      status: "proved",
      route: evidenceRoute(payload?.href),
      attention: {
        winner: markers.topologyAttentionWinner ?? null,
        panelRole: markers.topologyCreateNodePanelAttentionRole ?? null,
        placementContract: markers.topologyCreateNodePanelPlacementContract ?? null,
        surfaceRole: markers.topologyCreateNodeSurfaceRole ?? null,
        elevationContract: markers.topologyCreateNodeElevationContract ?? null,
        sizeContract: markers.topologyCreateNodeSizeContract ?? null,
        topToken: markers.topologyCreateNodePanelTopToken ?? null,
        widthToken: markers.topologyCreateNodePanelWidthToken ?? null,
        maxHeightToken: markers.topologyCreateNodePanelMaxHeightToken ?? null,
        surfaceToken: markers.topologyCreateNodeFormSurfaceToken ?? null,
        borderToken: markers.topologyCreateNodeFormBorderToken ?? null,
        shadowToken: markers.topologyCreateNodeFormShadowToken ?? null,
        role: markers.topologyCreateNodePanelRole ?? null,
        ariaModal: markers.topologyCreateNodePanelAriaModal ?? null,
        focusInside: markers.topologyCreateNodeFocusInside === true,
        activeElementTestId: markers.topologyCreateNodeActiveElementTestId ?? null,
      },
      backdrop: {
        visible: markers.topologyCreateNodeBackdropVisible === true,
        coversViewport: markers.topologyCreateNodeBackdropCoversViewport === true,
        pointerEvents: markers.topologyCreateNodeBackdropPointerEvents ?? null,
        contract: markers.topologyCreateNodeBackdropContract ?? null,
        surfaceToken: markers.topologyCreateNodeBackdropSurfaceToken ?? null,
        background: markers.topologyCreateNodeBackdropBackground ?? null,
        dimAlpha: extractBackdropAlpha(markers.topologyCreateNodeBackdropBackground),
        filter: markers.topologyCreateNodeBackdropFilter ?? null,
      },
      map: {
        blockingEdit: markers.topologyMapSurfaceBlockingEdit === true,
        demoted: markers.topologyMapSurfaceDemoted === true,
        dimOpacity: markerNumber(markers, "topologyMapSurfaceDimOpacity"),
        dimOpacityToken: markers.topologyMapSurfaceDimOpacityToken ?? null,
        filterToken: markers.topologyMapSurfaceFilterToken ?? null,
        interactionContract: markers.topologyMapSurfaceInteractionContract ?? null,
        pointerEvents: markers.topologyMapSurfacePointerEvents ?? null,
      },
      overlays: {
        contract: markers.topologyBlockingComposerOverlayContract ?? null,
        count: markerNumber(markers, "topologyInteractiveOverlayCount"),
        names: Array.isArray(markers.topologyInteractiveOverlayNames)
          ? markers.topologyInteractiveOverlayNames
          : [],
      },
      transients: {
        contract: markers.topologyTransientSurfaceContract ?? null,
        count: markerNumber(markers, "topologyTransientSurfaceCount"),
        names: Array.isArray(markers.topologyTransientSurfaceNames)
          ? markers.topologyTransientSurfaceNames
          : [],
        dismissedSurfaceKinds: COMPOSER_DISMISSED_SURFACE_KINDS,
        blockingReason: "composer-open",
      },
      panel: {
        top: markerNumber(markers, "topologyCreateNodePanelTop"),
        bottom: markerNumber(markers, "topologyCreateNodePanelBottom"),
        left: markerNumber(markers, "topologyCreateNodePanelLeft"),
        right: markerNumber(markers, "topologyCreateNodePanelRight"),
        width: markerNumber(markers, "topologyCreateNodePanelWidth"),
        height: markerNumber(markers, "topologyCreateNodePanelHeight"),
        centerOffset: markerNumber(markers, "topologyCreateNodePanelCenterOffset"),
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
        ...(visualEvidenceReference ? { visualEvidence: visualEvidenceReference } : {}),
        nextActions: ["complete-create-node-form", "cancel-composer"],
      },
    }
    : null;
  const relationLabelHandoffProof =
    markers.topologySelectedRelationLabelHandoffState === "ready"
      ? {
        proof: "topology-relation-label-handoff",
        status: "proved",
        route: evidenceRoute(payload?.href),
        contract: markers.topologyRelationLabelHandoffContract ?? null,
        label: {
          gate: markers.topologySelectedRelationLabelAgentGateKind ?? null,
          primaryAction: markers.topologySelectedRelationLabelPrimaryCopyAction ?? null,
          cliFallback: markers.topologySelectedRelationLabelCliFallbackCommand ?? null,
          factRoute: markers.topologySelectedRelationLabelFactRoute ?? null,
          quality: markers.topologySelectedRelationLabelQuality ?? null,
          evidence: markers.topologySelectedRelationLabelEvidenceState ?? null,
          source: markers.topologySelectedRelationLabelSource ?? null,
          target: markers.topologySelectedRelationLabelTarget ?? null,
          type: markers.topologySelectedRelationLabelType ?? null,
          count: markerNumber(markers, "topologySelectedRelationLabelCount"),
          route: markers.topologySelectedRelationLabelRoute ?? null,
          typeLabel: markers.topologySelectedRelationLabelTypeLabel ?? null,
        },
        card: {
          contract: markers.topologySelectedRelationCardHandoffContract ?? null,
          handoffAliasContract:
            markers.topologySelectedRelationCardHandoffAliasContract ?? null,
          route: markers.topologySelectedRelationCardRoute ?? null,
          endpointRoute: markers.topologySelectedRelationCardEndpointRoute ?? null,
          primaryAction: markers.topologySelectedRelationCardPrimaryAction ?? null,
          cliFallback: markers.topologySelectedRelationCardCliFallback ?? null,
          source: markers.topologySelectedRelationCardSource ?? null,
          target: markers.topologySelectedRelationCardTarget ?? null,
          type: markers.topologySelectedRelationCardType ?? null,
          labelContextContract:
            markers.topologySelectedRelationCardLabelContextContract ?? null,
          labelCount: markerNumber(markers, "topologySelectedRelationCardLabelCount"),
          labelVisibleText: markers.topologySelectedRelationCardLabelVisibleText ?? null,
          labelReadableText: markers.topologySelectedRelationCardLabelReadableText ?? null,
        },
        root: {
          attentionWinner: markers.topologyRootAttentionWinner ?? null,
          currentSurface: markers.topologyAgentCurrentSurface ?? null,
          currentSurfaceRole: markers.topologyAgentCurrentSurfaceRole ?? null,
          currentSurfaceRoute: markers.topologyAgentCurrentSurfaceRoute ?? null,
        },
        aggregate: {
          gate: markers.topologySelectedRelationLabelHandoffGate ?? null,
          primaryAction: markers.topologySelectedRelationLabelHandoffPrimaryAction ?? null,
          cliFallback: markers.topologySelectedRelationLabelHandoffCliFallbackCommand ?? null,
          factRoute: markers.topologySelectedRelationLabelHandoffFactRoute ?? null,
          quality: markers.topologySelectedRelationLabelHandoffQuality ?? null,
          evidence: markers.topologySelectedRelationLabelHandoffEvidence ?? null,
        },
        agentNextAction:
          markers.topologySelectedRelationLabelHandoffPrimaryAction === "relation_check"
            ? "run-relation-check-before-handoff"
            : "run-explain-relation-for-handoff",
      }
      : null;
  const selectedRelationVisibleFactRouteProof =
    markers.topologyAgentCurrentSurface === "selected-relation" &&
    markers.topologySelectedRelationCardHandoffContract ===
      "selected-relation-card-carries-mcp-cli-fallback"
      ? {
        proof: "topology-selected-relation-visible-fact-route",
        status:
          markers.topologySelectedRelationCardRoute === "source>target>type>action" &&
          markers.topologySelectedRelationClaimLensVisible === true &&
          markers.topologySelectedRelationContractKind === "typed-fact-not-similarity" &&
          markerNumber(markers, "topologySelectedRelationProofBandWidth") > 0 &&
          markerNumber(markers, "topologySelectedRelationProofBandHeight") > 0 &&
          markers.topologySelectedRelationEndpointRouteContract ===
            "visible-source-target-names-wrap" &&
          markers.topologySelectedRelationCopyPayloadTool === "query_ontology" &&
          markers.topologySelectedRelationCopyPayloadLayoutContract ===
            "visible-summary-and-handle-readable"
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        root: {
          attentionWinner: markers.topologyRootAttentionWinner ?? null,
          currentSurface: markers.topologyAgentCurrentSurface ?? null,
          currentSurfaceRole: markers.topologyAgentCurrentSurfaceRole ?? null,
          currentSurfaceRoute: markers.topologyAgentCurrentSurfaceRoute ?? null,
        },
        card: {
          contract: markers.topologySelectedRelationCardHandoffContract ?? null,
          route: markers.topologySelectedRelationCardRoute ?? null,
          endpointRoute: markers.topologySelectedRelationCardEndpointRoute ?? null,
          primaryAction: markers.topologySelectedRelationCardPrimaryAction ?? null,
          cliFallback: markers.topologySelectedRelationCardCliFallback ?? null,
          source: markers.topologySelectedRelationCardSource ?? null,
          target: markers.topologySelectedRelationCardTarget ?? null,
          type: markers.topologySelectedRelationCardType ?? null,
        },
        visibleFactRoute: {
          claimLensVisible: markers.topologySelectedRelationClaimLensVisible === true,
          claimLensText: markerText(markers, "topologySelectedRelationClaimLensText"),
          claimLensQuality: markerText(markers, "topologySelectedRelationClaimLensQuality"),
          contractKind: markerText(markers, "topologySelectedRelationContractKind"),
          contractText: markerText(markers, "topologySelectedRelationContractText"),
          proofBandWidth: markerNumber(markers, "topologySelectedRelationProofBandWidth"),
          proofBandHeight: markerNumber(markers, "topologySelectedRelationProofBandHeight"),
          agentDecisionText: markerText(markers, "topologySelectedRelationAgentDecisionText"),
          agentGateKind:
            markerText(markers, "topologySelectedRelationAgentGateKind") ??
            markerText(markers, "topologySelectedRelationCopyPayloadGate"),
          endpointRouteContract: markerText(
            markers,
            "topologySelectedRelationEndpointRouteContract",
          ),
          readableRoute: markerText(
            markers,
            "topologySelectedRelationEndpointRouteReadableText",
          ),
        },
        copyPayload: {
          tool: markerText(markers, "topologySelectedRelationCopyPayloadTool"),
          action: markerText(markers, "topologySelectedRelationCopyPayloadAction"),
          from: markerText(markers, "topologySelectedRelationCopyPayloadFrom"),
          to: markerText(markers, "topologySelectedRelationCopyPayloadTo"),
          type: markerText(markers, "topologySelectedRelationCopyPayloadType"),
          evidence: markerText(markers, "topologySelectedRelationCopyPayloadEvidence"),
          gate: markerText(markers, "topologySelectedRelationCopyPayloadGate"),
          call: markerText(markers, "topologySelectedRelationCopyPayloadCall"),
          summary: markerText(markers, "topologySelectedRelationCopyPayloadSummary"),
          visibleSummary: markerText(
            markers,
            "topologySelectedRelationCopyPayloadVisibleSummary",
          ),
          visibleHandleSummary: markerText(
            markers,
            "topologySelectedRelationCopyPayloadVisibleHandleSummary",
          ),
          layoutContract: markerText(
            markers,
            "topologySelectedRelationCopyPayloadLayoutContract",
          ),
        },
        agentNextAction: "run-selected-relation-copy-payload",
      }
      : null;
  const relationEndpointVisibilityProof =
    markers.topologySelectedRelationEndpointVisibilityContract ===
    "selected-relation-keeps-source-target-readable"
      ? {
        proof: "topology-selected-relation-endpoint-visibility",
        status:
          validateSelectedRelationEndpointVisibilityMarkers(markers) === null &&
          validateSelectedRelationEndpointRouteMarkers(markers) === null
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        contract: markers.topologySelectedRelationEndpointVisibilityContract ?? null,
        expectedCount: markerNumber(
          markers,
          "topologySelectedRelationEndpointExpectedCount",
        ),
        visibleCount: markerNumber(
          markers,
          "topologySelectedRelationEndpointVisibleCount",
        ),
        hiddenCount: markerNumber(
          markers,
          "topologySelectedRelationEndpointHiddenCount",
        ),
        source: markers.topologySelectedRelationCardSource ?? null,
        target: markers.topologySelectedRelationCardTarget ?? null,
        readableRoute:
          markers.topologySelectedRelationEndpointRouteReadableText ?? null,
        layerReadableRoute:
          markers.topologySelectedRelationEndpointReadableRoute ?? null,
        routeProof: {
          contract:
            markers.topologySelectedRelationEndpointRouteContract ?? null,
          wrapPolicy:
            markers.topologySelectedRelationEndpointRouteWrapPolicy ?? null,
          lineBudget: markerNumber(
            markers,
            "topologySelectedRelationEndpointRouteLineBudget",
          ),
          clientWidth: markerNumber(
            markers,
            "topologySelectedRelationEndpointRouteClientWidth",
          ),
          scrollWidth: markerNumber(
            markers,
            "topologySelectedRelationEndpointRouteScrollWidth",
          ),
          horizontalOverflow:
            markerNumber(
              markers,
              "topologySelectedRelationEndpointRouteScrollWidth",
            ) -
            markerNumber(
              markers,
              "topologySelectedRelationEndpointRouteClientWidth",
            ),
        },
        cards: Array.isArray(markers.topologySelectedRelationEndpointCards)
          ? markers.topologySelectedRelationEndpointCards.map((card) => ({
            slug: card?.slug ?? null,
            visible: card?.visible === true,
            surfaceHidden: card?.surfaceHidden ?? null,
            shift: card?.shift ?? null,
          }))
          : [],
        agentNextAction: "read-selected-relation-with-source-and-target-cards",
      }
      : null;
  const relationContextSilhouetteProof =
    markers.topologySelectedRelationContextSilhouettePolicy ===
    "selected-relation-keeps-endpoints-and-orientation-anchors-only"
      ? {
        proof: "topology-selected-relation-context-silhouette",
        status:
          validateSelectedRelationContextSilhouetteMarkers(markers) === null
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        policy: markers.topologySelectedRelationContextSilhouettePolicy ?? null,
        active: markers.topologySelectedRelationContextSilhouetteActive === true,
        hiddenCount: markerNumber(
          markers,
          "topologySelectedRelationContextSilhouetteHiddenCount",
        ),
        lowerPriorityVisibleDimmedCount: markerNumber(
          markers,
          "topologySelectedRelationLowerPriorityVisibleDimmedCount",
        ),
        visibleOrientationAnchorCount: markerNumber(
          markers,
          "topologySelectedRelationVisibleOrientationAnchorCount",
        ),
        agentNextAction: "read-selected-relation-before-background-context",
      }
      : null;
  const relationLabelFrameGeometryProof =
    markers.topologyRelationLabelGeometryContract === "frame-positioned-hit-targets"
      ? {
        proof: "topology-relation-label-frame-geometry",
        status:
          markerNumber(markers, "topologyRelationLabelGeometryExpectedCount") >= 1 &&
          markerNumber(markers, "topologyRelationLabelGeometryReadyCount") >=
            markerNumber(markers, "topologyRelationLabelGeometryExpectedCount") &&
          markerNumber(markers, "topologyRelationLabelGeometryPendingCount") === 0
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        contract: markers.topologyRelationLabelGeometryContract ?? null,
        source: markers.topologyRelationLabelGeometrySource ?? null,
        expected: markerNumber(markers, "topologyRelationLabelGeometryExpectedCount"),
        ready: markerNumber(markers, "topologyRelationLabelGeometryReadyCount"),
        pending: markerNumber(markers, "topologyRelationLabelGeometryPendingCount"),
        agentNextAction: "trust-frame-positioned-relation-label-hit-targets",
      }
      : null;
  const connectorCacheProof =
    markers.topologyConnectorRectCacheContract === "frame-local-card-rect-cache"
      ? {
        proof: "topology-connector-cache-frame-fallback",
        status: validateTopologyConnectorCacheMarkers(markers) === null ? "proved" : "incomplete",
        route: evidenceRoute(payload?.href),
        domIndexContract: markers.topologyConnectorDomIndexContract ?? null,
        cacheContract: markers.topologyConnectorRectCacheContract ?? null,
        frameFallbackContract:
          markers.topologyConnectorRectCacheFrameFallbackContract ?? null,
        accounting: markers.topologyConnectorRectCacheAccounting ?? null,
        size: markerNumber(markers, "topologyConnectorRectCacheSize"),
        seedCount: markerNumber(markers, "topologyConnectorRectCacheSeedCount"),
        readCount: markerNumber(markers, "topologyConnectorRectCacheReadCount"),
        hitCount: markerNumber(markers, "topologyConnectorRectCacheHitCount"),
        visibleCardClippedCount: markerNumber(markers, "topologyCardClippedCount"),
        agentNextAction: "trust-frame-local-connector-rect-cache-before-reading-labels",
      }
      : null;
  const dragRelationLabelCompactProof =
    markers.topologyDragRelationLabelCompactContract ===
    "zoomed-drag-compacts-repeated-relation-labels"
      ? {
        proof: "topology-drag-relation-label-compact-glyph",
        status:
          markers.topologyZoomLensActive === true &&
          markers.topologyZoomLensCardCompactionActive === true &&
          markerNumber(markers, "topologyDragRelationLabelCompactCount") >= 1 &&
          markers.topologyDragRelationLabelPresentation === "compact-glyph" &&
          markers.topologyDragRelationLabelCompact === true &&
          markers.topologyDragRelationLabelCompactItemContract ===
            "zoomed-drag-keeps-type-fact-as-compact-glyph" &&
          markerText(markers, "topologyDragRelationLabelReadableType") &&
          markerNumber(markers, "topologyDragRelationLabelBadgeWidth") > 0 &&
          markerNumber(markers, "topologyDragRelationLabelBadgeWidth") <= 44
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        contract: markers.topologyDragRelationLabelCompactContract ?? null,
        compactCount: markerNumber(markers, "topologyDragRelationLabelCompactCount"),
        visibleCount: markerNumber(markers, "topologyDragRelationLabelVisibleCount"),
        presentation: markers.topologyDragRelationLabelPresentation ?? null,
        compact: markers.topologyDragRelationLabelCompact === true,
        itemContract: markers.topologyDragRelationLabelCompactItemContract ?? null,
        readableType: markers.topologyDragRelationLabelReadableType ?? null,
        visibleText: markers.topologyDragRelationLabelVisibleText ?? null,
        badge: {
          width: markerNumber(markers, "topologyDragRelationLabelBadgeWidth"),
          height: markerNumber(markers, "topologyDragRelationLabelBadgeHeight"),
          radius: markerNumber(markers, "topologyDragRelationLabelBadgeRadius"),
        },
        agentNextAction: "treat-zoomed-drag-relation-glyphs-as-compact-typed-facts",
      }
      : null;
  const connectorLabelPassProof =
    markerNumber(markers, "topologyRepositionPassConnectorLabelMs") !== null
      ? {
        proof: "topology-connector-label-pass-budget",
        status:
          markerNumber(markers, "topologyRepositionPassConnectorLabelMs") <
          TOPOLOGY_CONNECTOR_LABEL_PASS_BUDGET_MS
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        passMs: markerNumber(markers, "topologyRepositionPassConnectorLabelMs"),
        budgetMs: TOPOLOGY_CONNECTOR_LABEL_PASS_BUDGET_MS,
        maxPassMs: markerNumber(markers, "topologyRepositionMaxPassConnectorLabelMs"),
        slowestPass: markers.topologyRepositionPassSlowest ?? null,
        agentNextAction: "read-relation-labels-after-connector-label-pass-budget",
      }
      : null;
  const visibleCardSelectedSurfaceRectProof =
    markers.topologyVisibleCardSelectedSurfaceRectPolicy
      ? {
        proof: "topology-visible-card-selected-surface-rect-policy",
        status:
          markers.topologySelectedBlockingSurfaceOverlapActive === true
            ? markers.topologyVisibleCardSelectedSurfaceRectPolicy ===
              "live-rects-for-postprocess-overlap-safety"
              ? "proved"
              : "incomplete"
            : markers.topologyVisibleCardSelectedSurfaceRectPolicy ===
                "reuse-card-placement-frame-rects-before-dom-read"
              ? "proved"
              : "incomplete",
        route: evidenceRoute(payload?.href),
        selectedBlockingSurfaceOverlapActive:
          markers.topologySelectedBlockingSurfaceOverlapActive ?? null,
        readPolicy: markers.topologyVisibleCardRectReadPolicy ?? null,
        selectedSurfaceRectPolicy:
          markers.topologyVisibleCardSelectedSurfaceRectPolicy ?? null,
        readCount: markerNumber(markers, "topologyVisibleCardRectReadCount"),
        agentNextAction: "trust-selected-surface-rect-policy-before-reading-relation",
      }
      : null;
  const residualOverlapProof =
    markers.topologyRelief === true || markers.topologySkeletonCardsActive === true
      ? {
        proof: "topology-residual-overlap-clear",
        status:
          markerNumber(markers, "topologyCardOverlapCount") === 0 &&
          markerNumber(markers, "topologyCardClippedCount") === 0 &&
          markerNumber(markers, "topologyFixedSurfaceOverlapCount") === 0 &&
          (
            markerNumber(markers, "topologyCardFixedSurfaceOverlapCount") === 0 ||
            (
              markers.topologyResidualOverlapClear === true &&
              markerNumber(markers, "topologyResidualVisibleCardOverlapCount") === 0 &&
              markerNumber(markers, "topologyResidualFixedSurfaceOverlapCount") === 0 &&
              markerNumber(markers, "topologyResidualCardFixedSurfaceOverlapCount") === 0
            )
          ) &&
          markers.topologyFixedSurfaceLiveSuppressionReadPolicy ===
            "reuse-card-placement-frame-rects-before-dom-read" &&
          markerNumber(markers, "topologyFixedSurfaceLiveSuppressionReadCount") === 0
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        visibleCardOverlapCount: markerNumber(markers, "topologyCardOverlapCount"),
        visibleCardClippedCount: markerNumber(markers, "topologyCardClippedCount"),
        fixedSurfaceOverlapCount: markerNumber(markers, "topologyFixedSurfaceOverlapCount"),
        cardFixedSurfaceOverlapCount: markerNumber(
          markers,
          "topologyCardFixedSurfaceOverlapCount",
        ),
        supportRailOverlapReadPolicy:
          markers.topologySupportRailOverlapReadPolicy ?? null,
        dragActiveOverlapPolicy:
          markers.topologyDragActiveOverlapPolicy ?? null,
        dragActiveOverlapReadPolicy:
          markers.topologyDragActiveOverlapReadPolicy ?? null,
        dragActiveOverlapHiddenCount: markerNumber(
          markers,
          "topologyDragActiveOverlapHiddenCount",
        ),
        fixedSurfaceLiveSuppressionReadPolicy:
          markers.topologyFixedSurfaceLiveSuppressionReadPolicy ?? null,
        fixedSurfaceLiveSuppressionReadCount: markerNumber(
          markers,
          "topologyFixedSurfaceLiveSuppressionReadCount",
        ),
        fixedSurfaceLiveSuppressedCount: markerNumber(
          markers,
          "topologyFixedSurfaceLiveSuppressedCount",
        ),
        dragSettleOverlapReadPolicy:
          markers.topologyDragSettleOverlapReadPolicy ?? null,
        domMarker: {
          clearContract: markers.topologyResidualOverlapClearContract ?? null,
          readPolicy: markers.topologyResidualOverlapReadPolicy ?? null,
          clear: markers.topologyResidualOverlapClear ?? null,
          visibleCardOverlapCount: markerNumber(
            markers,
            "topologyResidualVisibleCardOverlapCount",
          ),
          fixedSurfaceOverlapCount: markerNumber(
            markers,
            "topologyResidualFixedSurfaceOverlapCount",
          ),
          cardFixedSurfaceOverlapCount: markerNumber(
            markers,
            "topologyResidualCardFixedSurfaceOverlapCount",
          ),
        },
        agentNextAction: "read-relation-surfaces-after-residual-overlap-clear",
      }
      : null;
  const topologyRenderProof =
    markers.topologyMapEngine === "v2"
      ? {
        proof: "topology-map-v2-canvas-render",
        status:
          markers.topologySigmaViewportVisible === true &&
          markerNumber(markers, "topologySigmaCanvasCount") >= 1 &&
          markers.topologySigmaBootError !== true &&
          markerNumber(markers, "topologyV2CanvasInkPixels") > 0
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        engine: markers.topologyMapEngine,
        viewportVisible: markers.topologySigmaViewportVisible === true,
        canvasCount: markerNumber(markers, "topologySigmaCanvasCount"),
        inkPixels: markerNumber(markers, "topologyV2CanvasInkPixels"),
        agentNextAction:
          "use visual evidence for node-level rendering; do not infer DOM-card counts from the canvas engine",
      }
      : null;
  const zoomLensProof =
    markers.topologyZoomLensContract ===
    "zoom-in-uses-kind-pins-for-noncritical-context-cards"
      ? (() => {
        const cameraZoomProved =
          markerNumber(markers, "topologyZoomLensThresholdRatio") > 0 &&
          markerNumber(markers, "topologyZoomLensCameraRatio") > 0 &&
          markers.topologyZoomLensActive === true &&
          markers.topologyZoomLensCardCompactionActive === true &&
          markers.topologyZoomLensPresentationActive === true &&
          VALID_ZOOM_LENS_PRESENTATION_SOURCES.has(
            markers.topologyZoomLensPresentationSource,
          ) &&
          markerNumber(markers, "topologyZoomLensActiveCardCount") >= 1 &&
          markerNumber(markers, "topologyZoomLensVisibleActiveCardCount") >= 1;
        const selectedFocusDetailProved =
          markers.topologyZoomLensPresentationSource === "selected-focus-detail" &&
          markers.topologyZoomLensPresentationActive === true &&
          markers.topologyFocusDetailLensActive === true &&
          markerNumber(markers, "topologyZoomLensFocusEgoReadableCount") >= 1;
        return {
        proof: "topology-zoom-lens-kind-pins",
        status: cameraZoomProved || selectedFocusDetailProved ? "proved" : "incomplete",
        route: evidenceRoute(payload?.href),
        contract: markers.topologyZoomLensContract ?? null,
        presentationContract: markers.topologyZoomLensPresentationContract ?? null,
        ...(markers.topologyCameraDepthContract !== undefined
          ? {
            cameraDepthContract: markers.topologyCameraDepthContract ?? null,
            cameraMinRatio: markerNumber(markers, "topologyCameraMinRatio"),
          }
          : {}),
        thresholdRatio: markerNumber(markers, "topologyZoomLensThresholdRatio"),
        cardCompactionActive: markers.topologyZoomLensCardCompactionActive === true,
        presentationActive: markers.topologyZoomLensPresentationActive === true,
        presentationSource: markers.topologyZoomLensPresentationSource ?? null,
        cameraRatio: markerNumber(markers, "topologyZoomLensCameraRatio"),
        active: markers.topologyZoomLensActive === true,
        eligibleCount: markerNumber(markers, "topologyZoomLensEligibleCount"),
        activeCardCount: markerNumber(markers, "topologyZoomLensActiveCardCount"),
        visibleCardCount: markerNumber(markers, "topologyVisibleCardCount"),
        visibleActiveCardCount: markerNumber(
          markers,
          "topologyZoomLensVisibleActiveCardCount",
        ),
        pinMinOpacity: markerNumber(markers, "topologyZoomLensPinMinOpacity"),
        focusEgoReadable: {
          contract:
            markers.topologyZoomLensFocusEgoReadableContract ?? null,
          count: markerNumber(
            markers,
            "topologyZoomLensFocusEgoReadableCount",
          ),
        },
        pinGlyph: {
          contract: markers.topologyZoomLensPinGlyphContract ?? null,
          visibleCount: markerNumber(
            markers,
            "topologyZoomLensPinGlyphVisibleCount",
          ),
        },
        proximityPins: {
          contract: markers.topologyZoomLensPinProximityContract ?? null,
          active: markers.topologyZoomLensPinProximityActive === true,
          count: markerNumber(markers, "topologyZoomLensProximityPinCount"),
          ringToken: markers.topologyZoomLensPinProximityRingToken ?? null,
        },
        viewportVisibleContract:
          markers.topologyZoomLensViewportVisibleContract ?? null,
        pinCanvas: {
          contract: markers.topologyZoomLensPinCanvasContract ?? null,
          marginPx: markerNumber(markers, "topologyZoomLensPinCanvasMarginPx"),
          clampCount: markerNumber(markers, "topologyZoomLensPinCanvasClampCount"),
        },
        emptyViewportFallback: {
          contract:
            markers.topologyZoomLensEmptyViewportFallbackContract ?? null,
          active:
            markers.topologyZoomLensEmptyViewportFallbackActive === true,
        },
        relationChrome: {
          contract: markers.topologyZoomLensRelationChromeContract ?? null,
          active: markers.topologyZoomLensRelationChromeActive === true,
          threadCount: markerNumber(
            markers,
            "topologyZoomLensRelationThreadCount",
          ),
          labelSuppressedCount: markerNumber(
            markers,
            "topologyZoomLensRelationLabelSuppressedCount",
          ),
        },
        focusDetail: {
          contract: markers.topologyFocusDetailLensContract ?? null,
          active: markers.topologyFocusDetailLensActive === true,
          connectorExpression: {
            contract:
              markers.topologyFocusDetailConnectorExpressionContract ?? null,
            active:
              markers.topologyFocusDetailConnectorExpressionActive === true,
            count: markerNumber(
              markers,
              "topologyFocusDetailConnectorExpressionCount",
            ),
          },
          contextRail: {
            contract:
              markers.topologySelectedFocusContextRailVisibleContract ?? null,
            totalCount: markerNumber(
              markers,
              "topologySelectedFocusContextRailCount",
            ),
            visibleCount: markerNumber(
              markers,
              "topologySelectedFocusContextRailVisibleCount",
            ),
            hiddenCount: markerNumber(
              markers,
              "topologySelectedFocusContextRailHiddenCount",
            ),
            hiddenReason:
              markers.topologySelectedFocusContextRailHiddenReason ?? null,
          },
        },
        overviewDensity: {
          contract: markers.topologyOverviewDensityLensContract ?? null,
          thresholdRatio: markerNumber(
            markers,
            "topologyOverviewDensityLensThresholdRatio",
          ),
          minWidth: markerNumber(markers, "topologyOverviewDensityLensMinWidth"),
          active: markers.topologyOverviewDensityLensActive === true,
          activeCardCount: markerNumber(
            markers,
            "topologyOverviewDensityLensActiveCardCount",
          ),
          fixedGeography: {
            contract:
              markers.topologyOverviewDensityFixedGeographyContract ?? null,
            active:
              markers.topologyOverviewDensityFixedGeographyActive === true,
            dragContract:
              markers.topologyOverviewDensityFixedGeographyDragContract ?? null,
            dragLocked:
              markers.topologyOverviewDensityFixedGeographyDragLocked === true,
            dragAttempt:
              markers.topologyOverviewDensityFixedGeographyDragAttempt ?? null,
            slotCount: markerNumber(
              markers,
              "topologyOverviewDensityFixedGeographySlotCount",
            ),
            domainCount: markerNumber(
              markers,
              "topologyOverviewDensityFixedGeographyDomainCount",
            ),
            pinCount: markerNumber(
              markers,
              "topologyOverviewDensityFixedGeographyPinCount",
            ),
          },
        },
        agentNextAction: "trust-kind-pin-lens-before-reading-dense-map-cards",
      };
      })()
      : null;
  const nodePopoverCompactHandoffProof =
    markers.topologyNodePopoverVisible === true &&
    markers.topologyNodePopoverCollapsed === true &&
    markers.topologyNodePopoverAgentHandoffRoute === "selected-node>facts>actions"
      ? {
        proof: "topology-node-popover-compact-handoff-root",
        status:
          markers.topologyNodePopoverAgentHandoffContract ===
            "selected-node-actions-visible" &&
          markers.topologyNodePopoverAgentHandoffPrimaryAction === "focus-brief" &&
          markers.topologyNodePopoverAgentHandoffSummaryContract ===
            "visible-mcp-cli-focus-brief" &&
          String(markers.topologyNodePopoverAgentHandoffVisibleSummary || "").includes(
            "MCP/CLI",
          ) &&
          markers.topologyNodePopoverCompactHandoffSummaryContract ===
            "visible-mcp-cli-focus-brief" &&
          markers.topologyNodePopoverCompactHandoffSummaryVisibleLabel === "MCP/CLI" &&
          markers.topologyNodePopoverCompactHandoffSummaryText ===
            markers.topologyNodePopoverAgentHandoffVisibleSummary &&
          markerNumber(markers, "topologyNodePopoverAgentHandoffActionCount") >= 1 &&
          markerNumber(markers, "topologyNodePopoverAgentHandoffRelationFactCount") >= 1 &&
          markerNumber(markers, "topologyNodePopoverAgentHandoffRelationTypeCount") >= 1
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        selectedNode: {
          id: markers.topologySelectedNodeId ?? null,
          title: markers.topologySelectedNodeTitle ?? null,
          compactMeaning:
            typeof markers.topologyNodePopoverCompactMeaningText === "string"
              ? markers.topologyNodePopoverCompactMeaningText.trim()
              : null,
          relationFactCount: markerNumber(markers, "topologyNodePopoverRelationFactCount"),
          relationTypeCount: markerNumber(markers, "topologyNodePopoverRelationTypeCount"),
        },
        root: {
          attentionWinner: markers.topologyRootAttentionWinner ?? null,
          currentSurface: markers.topologyAgentCurrentSurface ?? null,
          currentSurfaceRole: markers.topologyAgentCurrentSurfaceRole ?? null,
          currentSurfaceRoute: markers.topologyAgentCurrentSurfaceRoute ?? null,
          selectedNodeId: markers.topologyRootSelectedNodeId ?? null,
        },
        handoff: {
          contract: markers.topologyNodePopoverAgentHandoffContract ?? null,
          route: markers.topologyNodePopoverAgentHandoffRoute ?? null,
          primaryAction: markers.topologyNodePopoverAgentHandoffPrimaryAction ?? null,
          summaryContract: markers.topologyNodePopoverAgentHandoffSummaryContract ?? null,
          visibleSummary: markers.topologyNodePopoverAgentHandoffVisibleSummary ?? null,
          actionCount: markerNumber(markers, "topologyNodePopoverAgentHandoffActionCount"),
          relationFactCount: markerNumber(
            markers,
            "topologyNodePopoverAgentHandoffRelationFactCount",
          ),
          relationTypeCount: markerNumber(
            markers,
            "topologyNodePopoverAgentHandoffRelationTypeCount",
          ),
          readableFlow: markers.topologyNodePopoverCompactActionsReadableFlow ?? null,
          briefActionFlow: markers.topologyNodePopoverCompactBriefActionReadableFlow ?? null,
          compactSummary: {
            visible: markers.topologyNodePopoverCompactHandoffSummaryVisible ?? null,
            contract: markers.topologyNodePopoverCompactHandoffSummaryContract ?? null,
            visibleLabel: markers.topologyNodePopoverCompactHandoffSummaryVisibleLabel ?? null,
            text: markers.topologyNodePopoverCompactHandoffSummaryText ?? null,
            selectedNode: markers.topologyNodePopoverCompactHandoffSummarySelectedNode ?? null,
            clientWidth: markerNumber(
              markers,
              "topologyNodePopoverCompactHandoffSummaryClientWidth",
            ),
            scrollWidth: markerNumber(
              markers,
              "topologyNodePopoverCompactHandoffSummaryScrollWidth",
            ),
          },
          relationFacts: {
            contract:
              markers.topologyNodePopoverCompactRelationFactsHandoffContract ?? null,
            route: markers.topologyNodePopoverCompactRelationFactsHandoffRoute ?? null,
            tool: markers.topologyNodePopoverCompactRelationFactsHandoffTool ?? null,
            summary:
              markers.topologyNodePopoverCompactRelationFactsHandoffSummary ?? null,
            hiddenRemainderCount: markerNumber(
              markers,
              "topologyNodePopoverCompactRelationFactsHiddenRemainderCount",
            ),
          },
        },
        agentNextAction: "copy-selected-node-focus-brief-or-expand-detail",
      }
      : null;
  const nodePopoverCompactVerificationProof =
    markers.topologyNodePopoverVerifyAttempted === true
      ? {
        proof: "topology-node-popover-compact-verification",
        status:
          markers.topologyNodePopoverVerifyCompactFactsVisible === true &&
          markers.topologyNodePopoverVerifyCompactFactsContract ===
            "collapsed-dock-surfaces-typed-facts" &&
          markers.topologyNodePopoverVerifyCompactFactsReadableContract ===
            "direct-typed-facts-not-scores" &&
          markers.topologyNodePopoverVerifyCompactFactsHandoffContract ===
            "compact-counts-route-to-relation-list-handoff" &&
          markers.topologyNodePopoverVerifyCompactFactsHandoffRoute ===
            "selected-node>relations>fact>evidence>gate>action>payload" &&
          markers.topologyNodePopoverVerifyCompactFactsHandoffTool === "query_ontology" &&
          markerText(markers, "topologyNodePopoverVerifyCompactBriefAction") ===
            "copy-focus-brief"
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        attempted: true,
        expanded: markers.topologyNodePopoverVerifyExpanded === true,
        reason: markerText(markers, "topologyNodePopoverVerifyReason"),
        compactFacts: {
          visible: markers.topologyNodePopoverVerifyCompactFactsVisible === true,
          contract: markerText(markers, "topologyNodePopoverVerifyCompactFactsContract"),
          readableContract: markerText(
            markers,
            "topologyNodePopoverVerifyCompactFactsReadableContract",
          ),
          accessibleName: markerText(
            markers,
            "topologyNodePopoverVerifyCompactFactsAccessibleName",
          ),
          noScores: markerText(markers, "topologyNodePopoverVerifyCompactFactsNoScores"),
          handoffContract: markerText(
            markers,
            "topologyNodePopoverVerifyCompactFactsHandoffContract",
          ),
          handoffRoute: markerText(
            markers,
            "topologyNodePopoverVerifyCompactFactsHandoffRoute",
          ),
          handoffTool: markerText(
            markers,
            "topologyNodePopoverVerifyCompactFactsHandoffTool",
          ),
          handoffSummary: markerText(
            markers,
            "topologyNodePopoverVerifyCompactFactsHandoffSummary",
          ),
          hiddenRemainderCount: markerNumber(
            markers,
            "topologyNodePopoverVerifyCompactFactsHiddenRemainderCount",
          ),
        },
        compactActions: {
          visible: markers.topologyNodePopoverVerifyCompactActionsVisible === true,
          contract: markerText(
            markers,
            "topologyNodePopoverVerifyCompactActionsContract",
          ),
          readableFlow: markerText(
            markers,
            "topologyNodePopoverVerifyCompactActionsReadableFlow",
          ),
          briefVisible: markers.topologyNodePopoverVerifyCompactBriefVisible === true,
          briefAction: markerText(markers, "topologyNodePopoverVerifyCompactBriefAction"),
          briefReadableFlow: markerText(
            markers,
            "topologyNodePopoverVerifyCompactBriefReadableFlow",
          ),
          briefRailLabel: markerText(
            markers,
            "topologyNodePopoverVerifyCompactBriefRailLabel",
          ),
          briefTitle: markerText(markers, "topologyNodePopoverVerifyCompactBriefTitle"),
        },
        agentNextAction: "read-compact-node-facts-before-expanded-popover-proof",
      }
      : null;
  const nodePopoverExpandedProof =
    markers.topologyNodePopoverVisible === true &&
    markers.topologyNodePopoverCollapsed === false &&
    markers.topologyNodePopoverFooterPositionContract === "anchored-bottom-visible"
      ? {
        proof: "topology-node-popover-expanded-readability",
        status:
          markers.topologyNodePopoverRelationRowFullyVisible === true &&
          markers.topologyNodePopoverActionRailVisible === true
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        scroll: {
          popover: markers.topologyNodePopoverScrollContract ?? null,
          rootOverflowY: markers.topologyNodePopoverOverflowY ?? null,
          bodyContract: markers.topologyNodePopoverBodyScrollContract ?? null,
        },
        footer: {
          contract: markers.topologyNodePopoverFooterContract ?? null,
          position: markers.topologyNodePopoverFooterPositionContract ?? null,
          overflow: markers.topologyNodePopoverFooterOverflowContract ?? null,
          top: markerNumber(markers, "topologyNodePopoverFooterTop"),
          bottom: markerNumber(markers, "topologyNodePopoverFooterBottom"),
        },
        relationRow: {
          visible: markers.topologyNodePopoverRelationRowVisible === true,
          fullRowVisible: markers.topologyNodePopoverRelationRowFullyVisible === true,
          rowHeight: markerNumber(markers, "topologyNodePopoverRelationRowHeight"),
          readableRowContract: markers.topologyNodePopoverConnectionListReadableRowContract ?? null,
          listHandoffContract:
            markers.topologyNodePopoverConnectionListHandoffContract ?? null,
          listHandoffRoute: markers.topologyNodePopoverConnectionListHandoffRoute ?? null,
          listHandoffTool: markers.topologyNodePopoverConnectionListHandoffTool ?? null,
          listHandoffSummary:
            markers.topologyNodePopoverConnectionListHandoffSummary ?? null,
          visibleRowCount: markerNumber(
            markers,
            "topologyNodePopoverConnectionListVisibleRowCount",
          ),
          hiddenRemainderCount: markerNumber(
            markers,
            "topologyNodePopoverConnectionListHiddenRemainderCount",
          ),
          directFactCount: markerNumber(
            markers,
            "topologyNodePopoverConnectionListDirectFactCount",
          ),
          evidence: markers.topologyNodePopoverRelationEvidenceState ?? null,
          gate: markers.topologyNodePopoverRelationAgentGateKind ?? null,
          primaryAction: markers.topologyNodePopoverRelationPrimaryCopyAction ?? null,
        },
        actionRail: {
          visible: markers.topologyNodePopoverActionRailVisible === true,
          contract: markers.topologyNodePopoverActionRailContract ?? null,
          count: markerNumber(markers, "topologyNodePopoverActionRailCount"),
        },
        agentNextAction: "use-selected-node-expanded-popover-handoff",
      }
      : null;
  const selectedFocusDimProof =
    markers.topologySelectedNodePopoverVisible === true &&
    markers.topologyClickFocusRelationshipContext === "durable" &&
    markerNumber(markers, "topologyFocusClusterSize") >= 2
      ? {
        proof: "topology-selected-focus-dim-context",
        status:
          markers.topologyDimOpacityContract === TOPOLOGY_DIM_OPACITY_CONTRACT &&
          markerNumber(markers, "topologyDimAnchorOpacity") >= TOPOLOGY_DIM_ANCHOR_MIN_OPACITY &&
          markerNumber(markers, "topologyDimChipOpacity") >= TOPOLOGY_DIM_CONTEXT_MIN_OPACITY &&
          markerNumber(markers, "topologyDimContextOpacity") >= TOPOLOGY_DIM_CONTEXT_MIN_OPACITY &&
          (
            markerNumber(markers, "topologyDimAnchorVisibleCount") === 0 ||
            markerNumber(markers, "topologyDimAnchorMinOpacity") >= TOPOLOGY_DIM_ANCHOR_MIN_OPACITY
          ) &&
          (
            markerNumber(markers, "topologyDimChipVisibleCount") === 0 ||
            markerNumber(markers, "topologyDimChipMinOpacity") >= TOPOLOGY_DIM_CONTEXT_MIN_OPACITY
          )
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        attention: {
          winner: markers.topologyAttentionWinner ?? null,
          selectedNodeId: markers.topologySelectedNodeId ?? null,
          selectedNodeTitle: markers.topologySelectedNodeTitle ?? null,
          compactMeaning:
            typeof markers.topologyNodePopoverCompactMeaningText === "string"
              ? markers.topologyNodePopoverCompactMeaningText.trim()
              : null,
          compactMeaningContract:
            markers.topologyNodePopoverCompactMeaningContract ?? null,
          compactMeaningResponsiveContract:
            markers.topologyNodePopoverCompactMeaningResponsiveContract ?? null,
          positionContract:
            markers.topologyNodePopoverPositionContract ?? null,
          gutterContract:
            markers.topologyNodePopoverGutterContract ?? null,
          rightInsetToken:
            markers.topologyNodePopoverRightInsetToken ?? null,
          rightInset:
            markerNumber(markers, "topologyNodePopoverRight") > 0
              ? Number(payload?.width || 0) -
                markerNumber(markers, "topologyNodePopoverRight")
              : null,
          supportContract:
            markers.topologyTopLeftChromeGroupSupportContract ?? null,
          commandRowContract:
            markers.topologyNodePopoverCompactCommandRowContract ?? null,
          commandRowGapToken:
            markers.topologyNodePopoverCompactCommandRowGapToken ?? null,
          actionsContract:
            markers.topologyNodePopoverCompactActionsContract ?? null,
          actionsReadableFlow:
            markers.topologyNodePopoverCompactActionsReadableFlow ?? null,
          relationFactsReadableContract:
            markers.topologyNodePopoverCompactRelationFactsReadableContract ?? null,
          relationFactsAccessibleName:
            markers.topologyNodePopoverCompactRelationFactsAccessibleName ?? null,
          relationFactsHandoff: {
            contract:
              markers.topologyNodePopoverCompactRelationFactsHandoffContract ?? null,
            route: markers.topologyNodePopoverCompactRelationFactsHandoffRoute ?? null,
            tool: markers.topologyNodePopoverCompactRelationFactsHandoffTool ?? null,
            summary:
              markers.topologyNodePopoverCompactRelationFactsHandoffSummary ?? null,
            hiddenRemainderCount: markerNumber(
              markers,
              "topologyNodePopoverCompactRelationFactsHiddenRemainderCount",
            ),
          },
          briefActionReadableFlow:
            markers.topologyNodePopoverCompactBriefActionReadableFlow ?? null,
          factsAndActionsShareScanline:
            markers.topologyNodePopoverCompactRelationFactsVisible === true &&
            markers.topologyNodePopoverCompactActionsVisible === true
              ? Math.abs(
                markerNumber(markers, "topologyNodePopoverCompactRelationFactsTop") -
                  markerNumber(markers, "topologyNodePopoverCompactActionsTop"),
              ) <= 8
              : null,
          relationshipContext: markers.topologyClickFocusRelationshipContext ?? null,
          relationshipContextSource:
            markers.topologyClickFocusRelationshipContextSource ?? null,
          focusClusterMode: markers.topologyFocusClusterMode ?? null,
          focusClusterStage: markers.topologyFocusClusterStage ?? null,
          focusClusterSize: markerNumber(markers, "topologyFocusClusterSize"),
          focusClusterVisible: markers.topologyFocusClusterVisible === true,
          hull: markers.topologyFocusClusterVisible === true ? "rendered" : "not-rendered",
        },
        dim: {
          contract: markers.topologyDimOpacityContract ?? null,
          anchorOpacity: markerNumber(markers, "topologyDimAnchorOpacity"),
          contextOpacity: markerNumber(markers, "topologyDimChipOpacity"),
          contextOpacityAlias: markerNumber(markers, "topologyDimContextOpacity"),
          anchorVisibleCount: markerNumber(markers, "topologyDimAnchorVisibleCount"),
          contextVisibleCount: markerNumber(markers, "topologyDimChipVisibleCount"),
          anchorMinOpacity: markerNumber(markers, "topologyDimAnchorMinOpacity"),
          contextMinOpacity: markerNumber(markers, "topologyDimChipMinOpacity"),
          anchorMinContract: TOPOLOGY_DIM_ANCHOR_MIN_OPACITY,
          contextMinContract: TOPOLOGY_DIM_CONTEXT_MIN_OPACITY,
          anchorToken: "--topology-map-dim-anchor-opacity",
          contextToken: "--topology-map-dim-context-opacity",
        },
        agentNextAction: "read-selected-node-popover-before-background-map-context",
      }
      : null;

  return {
    capturedAt,
    payload,
    agentCurrentSurfaceProof,
    agentUiScaleStabilityProof,
    composerBlockingProof,
    relationLabelHandoffProof,
    selectedRelationVisibleFactRouteProof,
    relationEndpointVisibilityProof,
    relationContextSilhouetteProof,
    relationLabelFrameGeometryProof,
    connectorCacheProof,
    dragRelationLabelCompactProof,
    connectorLabelPassProof,
    visibleCardSelectedSurfaceRectProof,
    residualOverlapProof,
    topologyRenderProof,
    zoomLensProof,
    nodePopoverCompactHandoffProof,
    nodePopoverCompactVerificationProof,
    nodePopoverExpandedProof,
    selectedFocusDimProof,
  };
}


export function writeWebviewEvidence(payload, outPath, options = {}) {
  if (!outPath) return;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(buildWebviewEvidencePayload(payload, options), null, 2)}\n`,
  );
  console.log(`[desktop-app-verify:webview-evidence] saved ${path.resolve(outPath)}`);
}
