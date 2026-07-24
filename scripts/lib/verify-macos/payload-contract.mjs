import { TOPOLOGY_CONNECTOR_LABEL_PASS_BUDGET_MS } from "./evidence-payload.mjs";
import { compactOntologyHandle, shellQuote } from "./process-lock.mjs";
import { markerNumber, selectedRelationRouteRailTextLeak, validateRelationLabelFrameGeometryMarkers, validateSelectedRelationCardAttentionLane, validateSelectedRelationCardDensityContract, validateSelectedRelationContextSilhouetteMarkers, validateSelectedRelationEndpointRouteMarkers, validateSelectedRelationEndpointVisibilityMarkers, validateSelectedRelationIdentityMarkers, validateSelectedRelationLabelCompactMarkers, validateTopologyConnectorCacheMarkers, validateTopologyFocusNoopMarkers, validateTopologyZoomLensMarkers } from "./relation-marker-validators.mjs";
import { validateTopologyFocusCommandSpineContract, validateTopologyFocusRightControlsContract, validateTopologyFocusSearchLaneContract, validateTopologyFocusUtilityLaneContract, validateTopologyNodePopoverScrollFooterContract, validateTopologyNodePopoverTokenContract, validateTopologySelectedCardRelationSummaryContract } from "./topology-panel-contracts.mjs";
import { TOPOLOGY_DIM_ANCHOR_MIN_OPACITY, TOPOLOGY_DIM_CONTEXT_MIN_OPACITY, TOPOLOGY_DIM_OPACITY_CONTRACT, TOPOLOGY_DRAG_FOCUS_MAX_REASONABLE_DELTA_PX, TOPOLOGY_DRAG_FOCUS_MIN_DELTA_PX, WEBVIEW_WORKBENCH_MARKERS, expectedRelationLabelAgentGateText, isSelectedRelationAgentGateText, isSelectedRelationPrimaryCopyActionText, normalizeTopologySelectedParam, topologyDragCompanionVectorTolerance, topologyDragDeltaVector } from "./webview-env.mjs";

export function validateWebviewVerifyPayload(payload, {
  expectedPath = null,
  minWebviewSize = null,
  maxWebviewSize = null,
  requireTopologyDrag = false,
  requireTopologySelectedRelation = false,
  requireTopologyNodePopover = false,
  requireTopologyCreateNode = false,
  requireTopologyFocusNoop = false,
  requireTopologyFocusZoom = false,
  requireTopologyFrameProfile = false,
} = {}) {
  if (!payload || typeof payload !== "object") {
    return "missing WebView verification payload";
  }
  if (typeof payload.href !== "string" || !payload.href.startsWith("tauri://")) {
    return "WebView did not report a tauri:// URL";
  }
  if (payload.readyState !== "complete") {
    return `WebView document was not complete (readyState=${payload.readyState ?? "unknown"})`;
  }
  if (typeof payload.bodyText !== "string" || payload.bodyText.trim().length === 0) {
    return "WebView body text was empty";
  }
  if (requireTopologyFrameProfile) {
    const frameProfile = payload.markers?.topologyFrameProfile;
    if (!frameProfile || frameProfile.done !== true) {
      return "WebView topology frame profile has not completed";
    }
    if (frameProfile.reason !== "done") {
      return `WebView topology frame profile failed: ${frameProfile.reason}`;
    }
  }
  if (
    payload.title !== "Ontology Atlas" &&
    !(
      typeof payload.title === "string" &&
      /\bontology-atlas\b|Ontology Atlas/.test(payload.title)
    )
  ) {
    return `WebView did not report an Ontology Atlas route title (title=${payload.title ?? "unknown"})`;
  }
  if (!WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(payload.bodyText))) {
    return "WebView body text did not include Ontology Atlas workbench markers";
  }
  if (!payload.markers || typeof payload.markers !== "object") {
    return "WebView did not report structured markers";
  }
  if (minWebviewSize) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < minWebviewSize.width ||
      height < minWebviewSize.height
    ) {
      return `WebView viewport was ${width || "unknown"}x${height || "unknown"}, expected at least ${minWebviewSize.width}x${minWebviewSize.height}`;
    }
  }
  if (maxWebviewSize) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width > maxWebviewSize.width ||
      height > maxWebviewSize.height
    ) {
      return `WebView viewport was ${width || "unknown"}x${height || "unknown"}, expected at most ${maxWebviewSize.width}x${maxWebviewSize.height}`;
    }
  }
  if (payload.markers.ontologyNav !== true) {
    return "WebView did not report the ontology navigation marker";
  }
  if (payload.markers.sourceVaultNav !== true) {
    return "WebView did not report the source vault navigation marker";
  }
  const webviewUrl = new URL(payload.href);
  const webviewPath = webviewUrl.pathname;
  // 지도 재구성 엔진 (docs/TOPOLOGY-MAP-REBUILD.md) — Sigma/skeleton 계약
  // 대신 map-canvas 계약을 검증한다. 함수 전역에서 게이트로 쓰인다.
  const topologyMapEngine = payload?.markers?.topologyMapEngine ?? "";
  // "canvas" = 구 map-canvas 엔진, "v2" = topology-map-v2 (현행 기본 지도).
  // 둘 다 Sigma/skeleton 계약 대신 canvas 계약을 탄다.
  const topologyMapCanvasActive =
    topologyMapEngine === "canvas" || topologyMapEngine === "v2";
  const topologyMapV2Active = topologyMapEngine === "v2";
  const topologyAnalysisMode =
    typeof payload.markers.topologyAnalysisPanelMode === "string"
      ? payload.markers.topologyAnalysisPanelMode.trim() || webviewUrl.searchParams.get("mode") || ""
      : webviewUrl.searchParams.get("mode") || "";
  if (expectedPath) {
    const expectedUrl = new URL(expectedPath, payload.href);
    const expectedRoute = expectedUrl.search
      ? `${expectedUrl.pathname}${expectedUrl.search}`
      : expectedUrl.pathname;
    const actualRoute = expectedUrl.search
      ? `${webviewPath}${webviewUrl.search}`
      : webviewPath;
    if (actualRoute !== expectedRoute) {
      return `WebView reported route ${actualRoute}, expected ${expectedRoute}`;
    }
  }
  const topologySelectedParam = normalizeTopologySelectedParam(
    webviewUrl.searchParams.get("p"),
  );
  const selectedNodeId =
    typeof payload.markers.topologySelectedNodeId === "string"
      ? payload.markers.topologySelectedNodeId.trim()
      : "";
  const selectedNodeKind =
    typeof payload.markers.topologySelectedNodeKind === "string"
      ? payload.markers.topologySelectedNodeKind.trim()
      : "";
  const selectedNodeTitle =
    typeof payload.markers.topologySelectedNodeTitle === "string"
      ? payload.markers.topologySelectedNodeTitle.trim()
      : "";
  const selectedNodeSummary =
    typeof payload.markers.topologySelectedNodeSummary === "string"
      ? payload.markers.topologySelectedNodeSummary.trim()
      : "";
  const focusSelectedNodeRoute =
    Boolean(topologySelectedParam) &&
    (topologyAnalysisMode === "focus" ||
      payload.markers.topologyRootSelectedNodeId === topologySelectedParam ||
      payload.markers.topologyAgentCurrentSurfaceRoute === topologySelectedParam);
  const blockingComposerOpen = payload.markers.topologyCreateNodeOpen === true;
  const selectedRelationSource =
    typeof payload.markers.topologySelectedRelationHandleStripSource === "string"
      ? payload.markers.topologySelectedRelationHandleStripSource.trim()
      : "";
  const selectedRelationTarget =
    typeof payload.markers.topologySelectedRelationHandleStripTarget === "string"
      ? payload.markers.topologySelectedRelationHandleStripTarget.trim()
      : "";
  const selectedRelationContextVisible =
    payload.markers.topologySelectedRelationClaimLensVisible === true &&
    Boolean(topologySelectedParam) &&
    (selectedRelationSource === topologySelectedParam ||
      selectedRelationTarget === topologySelectedParam);
  if (requireTopologySelectedRelation) {
    if (payload.markers.topologySelectedRelationVerifyAttempted !== true) {
      return `WebView did not attempt the Relief selected relation verification (${payload.markers.topologySelectedRelationVerifyReason || "missing reason"})`;
    }
    if (payload.markers.topologySelectedRelationVerifyClicked !== true) {
      return `WebView did not click a Relief relation label during selected relation verification (${payload.markers.topologySelectedRelationVerifyReason || "missing reason"})`;
    }
    if (!selectedRelationContextVisible) {
      return "WebView did not expose the Relief selected relation inspector during selected relation verification";
    }
    if (
      payload.markers.topologyUtilityLaneSuppressionContract !==
      "selected-relation-inspector-owns-right-rail"
    ) {
      return `WebView Relief selected relation utility suppression contract was ${payload.markers.topologyUtilityLaneSuppressionContract || "missing"}`;
    }
  }
  const koreanTopologyRoute = webviewPath.startsWith("/ko/topology");
  const rawRelationTypePattern =
    /^(contains|depends_on|depends-on|depends|relates|relates_to|related_to|describes|uses|belongs_to|belongs-to)$/i;
  if (
    webviewPath.includes("/ontology/insights") &&
    payload.markers.businessDecisionQuestions !== true
  ) {
    return "WebView did not report the business decision questions marker";
  }
  if (
    webviewPath.includes("/ontology/insights") &&
    payload.markers.readerDecisionLens !== true
  ) {
    return "WebView did not report the reader decision lens marker";
  }
  if (
    webviewPath.includes("/topology") &&
    !topologyMapCanvasActive &&
    payload.markers.topologyRelief !== true
  ) {
    return "WebView did not report the Relief topology marker";
  }
  const connectorLabelPassMs = markerNumber(
    payload.markers,
    "topologyRepositionPassConnectorLabelMs",
  );
  if (
    webviewPath.includes("/topology") &&
    connectorLabelPassMs !== null &&
    connectorLabelPassMs >= TOPOLOGY_CONNECTOR_LABEL_PASS_BUDGET_MS
  ) {
    return `WebView Relief connector-label pass took ${connectorLabelPassMs}ms, expected < ${TOPOLOGY_CONNECTOR_LABEL_PASS_BUDGET_MS}ms`;
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    !(Number(payload.markers.topologyPathCandidateCardCount || 0) >= 1 ||
      Number(payload.markers.topologyPathSourceCardCount || 0) >= 1)
  ) {
    return "WebView Path mode cards did not expose path selection roles";
  }
  const expectedPathSourceParam = normalizeTopologySelectedParam(
    webviewUrl.searchParams.get("pathFrom") ||
      (webviewUrl.searchParams.get("mode") === "path"
        ? webviewUrl.searchParams.get("p")
        : ""),
  );
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    expectedPathSourceParam &&
    payload.markers.topologySkeletonCardsActive === true
  ) {
    if (Number(payload.markers.topologyPathSourceCardCount || 0) < 1) {
      return "WebView Path mode selected source card was not visible";
    }
    if (payload.markers.topologyPathSourceCardRoleContract !== "source-anchor-visible") {
      return `WebView Path mode source card contract was ${payload.markers.topologyPathSourceCardRoleContract || "missing"}`;
    }
    if (payload.markers.topologyPathSourceCardAttentionLayer !== "focus-path-state") {
      return `WebView Path mode source card attention layer was ${payload.markers.topologyPathSourceCardAttentionLayer || "missing"}`;
    }
    if (payload.markers.topologyPathSourceCardAnchor !== "source") {
      return `WebView Path mode source card anchor was ${payload.markers.topologyPathSourceCardAnchor || "missing"}`;
    }
    if (payload.markers.topologyPathSourceCardBadgeLabel !== "A") {
      return `WebView Path mode source card badge was ${payload.markers.topologyPathSourceCardBadgeLabel || "missing"}`;
    }
    const expectedSourceNextAction = webviewUrl.searchParams.get("pathTo")
      ? "review-path"
      : "pick-target";
    if (payload.markers.topologyPathSourceCardNextAction !== expectedSourceNextAction) {
      return `WebView Path mode source card next action was ${payload.markers.topologyPathSourceCardNextAction || "missing"}`;
    }
    if (webviewUrl.searchParams.get("pathTo")) {
      if (Number(payload.markers.topologyPathTargetCardCount || 0) < 1) {
        return "WebView Path mode selected target card was not visible";
      }
      if (payload.markers.topologyPathTargetCardRoleContract !== "target-anchor-visible") {
        return `WebView Path mode target card contract was ${payload.markers.topologyPathTargetCardRoleContract || "missing"}`;
      }
      if (payload.markers.topologyPathTargetCardBadgeLabel !== "B") {
        return `WebView Path mode target card badge was ${payload.markers.topologyPathTargetCardBadgeLabel || "missing"}`;
      }
    }
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    payload.markers.topologySkeletonCardsActive === true &&
    payload.markers.topologyPathStartPromptVisible === true
  ) {
    return "WebView kept a redundant Path mode prompt over Relief card mode";
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    payload.markers.topologySkeletonCardsActive === true
  ) {
    if (
      payload.markers.topologyAnalysisPanelWidthBand !== "header-aligned" ||
      payload.markers.topologyAnalysisPanelWidthTarget !== "path-14-inch-rail" ||
      payload.markers.topologyAnalysisPanelWidthContract !==
        "path-support-rail-max-360-phone-utility-reserve" ||
      payload.markers.topologyAnalysisPanelWidthToken !==
        "--topology-panel-path-responsive-width" ||
      payload.markers.topologyAnalysisPanelPhoneUtilityReserveToken !==
        "--topology-panel-phone-utility-rail-reserve" ||
      Number(payload.markers.topologyAnalysisPanelWidth || 0) < 320 ||
      Number(payload.markers.topologyAnalysisPanelWidth || 0) > 360 ||
      payload.markers.topologyAnalysisPanelAttentionRole !== "support"
    ) {
      return `WebView Path mode panel did not use the 14-inch support width contract (${payload.markers.topologyAnalysisPanelWidthBand || "missing"} · ${payload.markers.topologyAnalysisPanelWidthTarget || "missing"} · ${payload.markers.topologyAnalysisPanelWidthContract || "missing"} · ${payload.markers.topologyAnalysisPanelWidthToken || "missing"} · ${payload.markers.topologyAnalysisPanelWidth || 0}px)`;
    }
    const visibleCandidates = Number(
      payload.markers.topologyPathCandidateVisibilityVisible || 0,
    );
    const totalCandidates = Number(
      payload.markers.topologyPathCandidateVisibilityTotal || 0,
    );
    const visibilityText = String(
      payload.markers.topologyPathCandidateVisibilityText || "",
    ).trim();
    const visibilityTextReportsCoverage =
      new RegExp(`${visibleCandidates}\\s*/\\s*${totalCandidates}`).test(
        visibilityText,
      ) ||
      (visibilityText.includes(String(visibleCandidates)) &&
        visibilityText.includes(String(totalCandidates)));
    if (
      !(visibleCandidates >= 1) ||
      !(totalCandidates >= visibleCandidates) ||
      !visibilityTextReportsCoverage
    ) {
      return "WebView Path mode did not report visible candidate coverage";
    }
    if (payload.markers.topologyPathAgentHandoffVisible !== true) {
      return "WebView Path mode did not expose the agent handoff marker";
    }
    const pathResultHasBothEndpoints =
      Number(payload.markers.topologyPathSourceCardCount || 0) >= 1 &&
      Number(payload.markers.topologyPathTargetCardCount || 0) >= 1;
    if (pathResultHasBothEndpoints) {
      if (payload.markers.topologyPathVisibleRouteVisible !== true) {
        return "WebView Path mode did not expose the visible source-target route rail";
      }
      if (
        payload.markers.topologyPathVisibleRouteContract !==
        "source-target-visible-before-proof-disclosure"
      ) {
        return `WebView Path mode visible route contract was ${payload.markers.topologyPathVisibleRouteContract || "missing"}`;
      }
      if (payload.markers.topologyPathVisibleRouteAttentionLayer !== "focus-path-state") {
        return `WebView Path mode visible route layer was ${payload.markers.topologyPathVisibleRouteAttentionLayer || "missing"}`;
      }
      if (payload.markers.topologyPathVisibleRouteGuidanceOwner !== "analysis-rail") {
        return `WebView Path mode visible route owner was ${payload.markers.topologyPathVisibleRouteGuidanceOwner || "missing"}`;
      }
      if (payload.markers.topologyPathVisibleRouteOverflowContract !== "no-horizontal-scroll") {
        return `WebView Path mode visible route overflow contract was ${payload.markers.topologyPathVisibleRouteOverflowContract || "missing"}`;
      }
      if (
        payload.markers.topologyPathVisibleRouteSurfaceToken !== "--topology-path-route-surface" ||
        payload.markers.topologyPathVisibleRouteBorderToken !== "--topology-path-route-border" ||
        payload.markers.topologyPathVisibleRouteChipSurfaceToken !==
          "--topology-path-route-chip-surface" ||
        payload.markers.topologyPathVisibleRouteChipBorderToken !==
          "--topology-path-route-chip-border"
      ) {
        return "WebView Path mode visible route token contract was not active";
      }
      if (
        Number(payload.markers.topologyPathVisibleRouteClientWidth || 0) < 180 ||
        Number(payload.markers.topologyPathVisibleRouteScrollWidth || 0) -
          Number(payload.markers.topologyPathVisibleRouteClientWidth || 0) >
          2
      ) {
        return `WebView Path mode visible route overflowed (${payload.markers.topologyPathVisibleRouteClientWidth || 0} client / ${payload.markers.topologyPathVisibleRouteScrollWidth || 0} scroll)`;
      }
    }
    if (payload.markers.topologyPathAgentHandoffLayer !== "focus-path-state") {
      return `WebView Path mode handoff layer was ${payload.markers.topologyPathAgentHandoffLayer || "missing"}`;
    }
    if (payload.markers.topologyPathGuidanceOwner !== "analysis-rail") {
      return `WebView Path mode guidance owner was ${payload.markers.topologyPathGuidanceOwner || "missing"}`;
    }
    if (payload.markers.topologyPathPromptPolicy !== "panel-owned-when-card-mode") {
      return `WebView Path mode prompt policy was ${payload.markers.topologyPathPromptPolicy || "missing"}`;
    }
    if (
      !["agent-next-action-visible", "route-proof-action-visible"].includes(
        payload.markers.topologyPathHandoffContract,
      )
    ) {
      return `WebView Path mode handoff contract was ${payload.markers.topologyPathHandoffContract || "missing"}`;
    }
    if (
      ![
        "compact-proof-strip",
        "evidence-first-agent-handoff-compact",
      ].includes(payload.markers.topologyPathHandoffLayoutContract)
    ) {
      return `WebView Path mode handoff layout contract was ${payload.markers.topologyPathHandoffLayoutContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathHandoffLayoutContract ===
        "evidence-first-agent-handoff-compact" &&
      payload.markers.topologyPathHandoffHierarchy !==
        "primary-evidence-secondary-agent-checks"
    ) {
      return `WebView Path mode handoff hierarchy was ${payload.markers.topologyPathHandoffHierarchy || "missing"}`;
    }
    if (
      payload.markers.topologyPathHandoffSurfaceToken !== "--topology-path-handoff-surface" ||
      payload.markers.topologyPathHandoffBorderToken !== "--topology-path-handoff-border" ||
      payload.markers.topologyPathHandoffActionMinHeightToken !==
        "--topology-path-handoff-action-min-height" ||
      payload.markers.topologyPathHandoffActionRadiusToken !==
        "--topology-path-handoff-action-radius"
    ) {
      return "WebView Path mode handoff token contract was not active";
    }
    if (
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathPromptSuppressionContract",
      ) &&
      payload.markers.topologyPathStartPromptVisible !== true &&
      payload.markers.topologyPathAnchorPromptVisible !== true &&
      payload.markers.topologyPathResultBannerVisible !== true &&
      payload.markers.topologyPathPromptSuppressionContract !==
        "analysis-rail-owns-path-start"
    ) {
      return `WebView Path mode prompt suppression contract was ${payload.markers.topologyPathPromptSuppressionContract || "missing"}`;
    }
    const hasPathHandoffOverflowEvidence =
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathHandoffOverflowContract",
      ) ||
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathAgentHandoffClientWidth",
      ) ||
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathAgentHandoffScrollWidth",
      );
    if (hasPathHandoffOverflowEvidence) {
      if (payload.markers.topologyPathHandoffOverflowContract !== "no-horizontal-scroll") {
        return `WebView Path mode handoff overflow contract was ${payload.markers.topologyPathHandoffOverflowContract || "missing"}`;
      }
      const pathHandoffClientWidth = Number(
        payload.markers.topologyPathAgentHandoffClientWidth || 0,
      );
      const pathHandoffScrollWidth = Number(
        payload.markers.topologyPathAgentHandoffScrollWidth || 0,
      );
      if (
        pathHandoffClientWidth < 160 ||
        pathHandoffScrollWidth - pathHandoffClientWidth > 2
      ) {
        return `WebView Path mode handoff overflowed (${pathHandoffClientWidth} client / ${pathHandoffScrollWidth} scroll)`;
      }
    }
    if (payload.markers.topologyPathAgentHandoffMcpAction !== "find_path") {
      return `WebView Path mode MCP handoff was ${payload.markers.topologyPathAgentHandoffMcpAction || "missing"}`;
    }
    if (
      !String(payload.markers.topologyPathAgentHandoffCliFallback || "")
        .toLowerCase()
        .includes("path")
    ) {
      return `WebView Path mode CLI handoff was ${payload.markers.topologyPathAgentHandoffCliFallback || "missing"}`;
    }
    if (payload.markers.topologyAttentionWinner !== "focus-path-state") {
      return `WebView Path mode attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (payload.markers.topologyMinimapVisible === true) {
      return "WebView Path mode kept the minimap utility chrome visible";
    }
    if (payload.markers.topologyKindLegendVisible === true) {
      return "WebView Path mode kept the kind legend utility chrome visible";
    }
    if (payload.markers.topologyKindLegendState !== "collapsed-support-chrome") {
      return `WebView Path mode kind legend state was ${payload.markers.topologyKindLegendState || "missing"}`;
    }
    if (
      webviewUrl.searchParams.has("p") &&
      payload.markers.topologyNodePopoverVisible === true
    ) {
      return "WebView Path mode kept the selected node popover visible";
    }
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    payload.markers.topologyAnalysisPanelVisible === true
  ) {
    const panelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
    const anchorPromptVisible = payload.markers.topologyPathAnchorPromptVisible === true;
    const startPromptVisible = payload.markers.topologyPathStartPromptVisible === true;
    const promptContract = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptContract || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptContract || "")
        : "";
    const promptLeft = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptLeft || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptLeft || 0)
        : 0;
    const promptTop = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptTop || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptTop || 0)
        : 0;
    const promptRight = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptRight || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptRight || 0)
        : 0;
    const promptWidth = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptWidth || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptWidth || 0)
        : 0;
    const promptLane = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptLane || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptLane || "")
        : "";
    const promptAttentionLayer = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptAttentionLayer || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptAttentionLayer || "")
        : "";
    const promptHandoffContract = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptHandoffContract || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptHandoffContract || "")
        : "";
    const promptOverflowContract = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptOverflowContract || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptOverflowContract || "")
        : "";
    const promptMcpAction = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptMcpAction || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptMcpAction || "")
        : "";
    const promptCliFallback = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptCliFallback || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptCliFallback || "")
        : "";
    const promptClientWidth = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptClientWidth || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptClientWidth || 0)
        : 0;
    const promptScrollWidth = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptScrollWidth || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptScrollWidth || 0)
        : 0;
    if ((anchorPromptVisible || startPromptVisible) && promptContract !== "panel-clear-viewport-contained") {
      return `WebView Path mode prompt contract was ${promptContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptLane !== "chrome-clear-path-lane") {
      return `WebView Path mode prompt lane was ${promptLane || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptAttentionLayer !== "focus-path-state") {
      return `WebView Path mode prompt attention layer was ${promptAttentionLayer || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptHandoffContract !== "agent-next-action-visible") {
      return `WebView Path mode prompt handoff contract was ${promptHandoffContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path mode prompt overflow contract was ${promptOverflowContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptMcpAction !== "find_path") {
      return `WebView Path mode prompt MCP action was ${promptMcpAction || "missing"}`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      !promptCliFallback.toLowerCase().includes("path")
    ) {
      return `WebView Path mode prompt CLI fallback was ${promptCliFallback || "missing"}`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      (promptClientWidth < 240 || promptScrollWidth - promptClientWidth > 2)
    ) {
      return `WebView Path mode prompt overflowed (${promptClientWidth} client / ${promptScrollWidth} scroll)`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      payload.markers.topologyPathPromptClearanceContract !== "analysis-rail-clear-24"
    ) {
      return `WebView Path mode prompt clearance contract was ${payload.markers.topologyPathPromptClearanceContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && Number(payload.width || 0) >= 900 && promptTop < 124) {
      return `WebView Path mode prompt competed with top chrome (${promptTop}px top)`;
    }
    if (promptLeft > 0 && panelRight > 0 && promptLeft < panelRight + 24) {
      return `WebView Path mode prompt overlapped the Relief analysis panel (${promptLeft}px left vs ${panelRight}px panel right)`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      Number(payload.markers.topologyPathPromptPanelClearancePx || 0) < 24
    ) {
      return `WebView Path mode prompt reported insufficient analysis panel clearance (${payload.markers.topologyPathPromptPanelClearancePx ?? "missing"}px)`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      Number(payload.markers.topologyPathPromptViewportRightClearancePx || 0) < 24
    ) {
      return `WebView Path mode prompt reported insufficient viewport right clearance (${payload.markers.topologyPathPromptViewportRightClearancePx ?? "missing"}px)`;
    }
    if (
      promptWidth > 680 ||
      (promptRight > 0 && Number(payload.width || 0) > 0 && promptRight > Number(payload.width) - 24)
    ) {
      return `WebView Path mode prompt exceeded its viewport contract (${promptWidth}px wide, right=${promptRight}px)`;
    }
  }
  if (
    webviewPath.includes("/topology") &&
    payload.markers.topologyPathResultBannerVisible === true
  ) {
    if (
      payload.markers.topologyPathResultBannerContract !==
      "panel-clear-viewport-contained"
    ) {
      return `WebView Path result banner contract was ${payload.markers.topologyPathResultBannerContract || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerLane !== "chrome-clear-path-lane") {
      return `WebView Path result banner lane was ${payload.markers.topologyPathResultBannerLane || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerAttentionLayer !== "focus-path-state") {
      return `WebView Path result banner attention layer was ${payload.markers.topologyPathResultBannerAttentionLayer || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerHandoffContract !== "agent-next-action-visible") {
      return `WebView Path result banner handoff contract was ${payload.markers.topologyPathResultBannerHandoffContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultCandidateSuppressionPolicy !==
      "source-target-result-hides-candidate-affordance"
    ) {
      return `WebView Path result candidate suppression policy was ${payload.markers.topologyPathResultCandidateSuppressionPolicy || "missing"}`;
    }
    if (payload.markers.topologyPathResultCandidateSuppressionActive !== "true") {
      return `WebView Path result candidate suppression was ${payload.markers.topologyPathResultCandidateSuppressionActive || "missing"}`;
    }
    if (Number(payload.markers.topologyPathCandidateCardCount || 0) !== 0) {
      return `WebView Path result left ${Number(payload.markers.topologyPathCandidateCardCount || 0)} candidate cards active`;
    }
    if (payload.markers.topologyPathResultBannerOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path result banner overflow contract was ${payload.markers.topologyPathResultBannerOverflowContract || "missing"}`;
    }
    const fixedSurfaceNames = Array.isArray(payload.markers.topologyFixedSurfaceNames)
      ? payload.markers.topologyFixedSurfaceNames
      : null;
    if (
      fixedSurfaceNames &&
      !fixedSurfaceNames.includes("topology-path-result-banner")
    ) {
      return `WebView did not register the Path result banner as a fixed topology surface (${JSON.stringify(fixedSurfaceNames)})`;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathResultBannerClearanceContract",
      ) &&
      payload.markers.topologyPathResultBannerClearanceContract !==
        "analysis-rail-clear-96"
    ) {
      return `WebView Path result banner clearance contract was ${payload.markers.topologyPathResultBannerClearanceContract || "missing"}`;
    }
    const pathResultBannerClientWidth = Number(
      payload.markers.topologyPathResultBannerClientWidth || 0,
    );
    const pathResultBannerScrollWidth = Number(
      payload.markers.topologyPathResultBannerScrollWidth || 0,
    );
    if (
      pathResultBannerClientWidth < 260 ||
      pathResultBannerScrollWidth - pathResultBannerClientWidth > 2
    ) {
      return `WebView Path result banner overflowed (${pathResultBannerClientWidth} client / ${pathResultBannerScrollWidth} scroll)`;
    }
    const pathResultBannerTop = Number(
      payload.markers.topologyPathResultBannerTop || 0,
    );
    const pathResultBannerLeft = Number(
      payload.markers.topologyPathResultBannerLeft || 0,
    );
    const pathResultBannerRight = Number(
      payload.markers.topologyPathResultBannerRight || 0,
    );
    const analysisPanelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
    if (
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathResultBannerPanelClearancePx",
      ) &&
      Number(payload.markers.topologyPathResultBannerPanelClearancePx || 0) < 96
    ) {
      return `WebView Path result banner reported insufficient analysis rail clearance (${payload.markers.topologyPathResultBannerPanelClearancePx ?? "missing"}px)`;
    }
    if (Number(payload.width || 0) >= 900 && pathResultBannerTop < 124) {
      return `WebView Path result banner competed with top chrome (${pathResultBannerTop}px top)`;
    }
    if (
      analysisPanelRight > 0 &&
      pathResultBannerLeft > 0 &&
      pathResultBannerLeft < analysisPanelRight + 24
    ) {
      return `WebView Path result banner overlapped the Relief analysis panel (${pathResultBannerLeft}px left vs ${analysisPanelRight}px panel right)`;
    }
    if (
      pathResultBannerRight > 0 &&
      Number(payload.width || 0) > 0 &&
      pathResultBannerRight > Number(payload.width) - 24
    ) {
      return `WebView Path result banner exceeded its viewport contract (right=${pathResultBannerRight}px)`;
    }
    if (payload.markers.topologyPathResultRouteChainOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path result route chain overflow contract was ${payload.markers.topologyPathResultRouteChainOverflowContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultRouteChainCompactContract !==
      "endpoint-badges-visible-relation-chips-readable"
    ) {
      return `WebView Path result route chain compact contract was ${payload.markers.topologyPathResultRouteChainCompactContract || "missing"}`;
    }
    const pathResultRouteChainClientWidth = Number(
      payload.markers.topologyPathResultRouteChainClientWidth || 0,
    );
    const pathResultRouteChainScrollWidth = Number(
      payload.markers.topologyPathResultRouteChainScrollWidth || 0,
    );
    if (
      pathResultRouteChainClientWidth < 180 ||
      pathResultRouteChainScrollWidth - pathResultRouteChainClientWidth > 2
    ) {
      return `WebView Path result route chain overflowed (${pathResultRouteChainClientWidth} client / ${pathResultRouteChainScrollWidth} scroll)`;
    }
    if (payload.markers.topologyPathResultActionRailOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path result action rail overflow contract was ${payload.markers.topologyPathResultActionRailOverflowContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultActionRailHierarchy !==
      "primary-visible-secondary-disclosed"
    ) {
      return `WebView Path result action rail hierarchy was ${payload.markers.topologyPathResultActionRailHierarchy || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultSecondaryChecksContract !==
      "secondary-checks-collapsed-by-default"
    ) {
      return `WebView Path result secondary checks contract was ${payload.markers.topologyPathResultSecondaryChecksContract || "missing"}`;
    }
    if (payload.markers.topologyPathResultSecondaryChecksOpen === true) {
      return "WebView Path result secondary checks were open by default";
    }
    const pathResultActionRailClientWidth = Number(
      payload.markers.topologyPathResultActionRailClientWidth || 0,
    );
    const pathResultActionRailScrollWidth = Number(
      payload.markers.topologyPathResultActionRailScrollWidth || 0,
    );
    if (
      pathResultActionRailClientWidth < 260 ||
      pathResultActionRailScrollWidth - pathResultActionRailClientWidth > 2
    ) {
      return `WebView Path result action rail overflowed (${pathResultActionRailClientWidth} client / ${pathResultActionRailScrollWidth} scroll)`;
    }
    const pathResultRestoreHopCount = Number(payload.markers.topologyPathRestoreHopCount || 0);
    const pathResultRelationChips = Array.isArray(payload.markers.topologyPathResultRelationChips)
      ? payload.markers.topologyPathResultRelationChips
      : [];
    if (
      pathResultRestoreHopCount > 0 &&
      pathResultRelationChips.length < pathResultRestoreHopCount
    ) {
      return `WebView Path result route chain rendered ${pathResultRelationChips.length} relation chips for ${pathResultRestoreHopCount} hops`;
    }
    for (const chip of pathResultRelationChips) {
      if (Number(chip?.width || 0) > 96) {
        return `WebView Path result relation chip exceeded compact width (${Number(chip?.width || 0)}px)`;
      }
    }
    const pathResultActions = Array.isArray(payload.markers.topologyPathResultActions)
      ? payload.markers.topologyPathResultActions
      : [];
    const pathResultActionKinds = new Set(pathResultActions.map((action) => action?.kind));
    for (const requiredKind of [
      "evidence",
      "find_path",
      "relation_check",
      "explain_relation",
      "all_paths_plan",
      "all_paths",
      "clear",
    ]) {
      if (!pathResultActionKinds.has(requiredKind)) {
        return `WebView Path result banner omitted ${requiredKind} action`;
      }
    }
    const primaryPathResultActions = pathResultActions.filter(
      (action) => action?.tier === "primary",
    );
    const secondaryPathResultActions = pathResultActions.filter(
      (action) => action?.tier === "secondary",
    );
    const visiblePrimaryActionKinds = new Set(
      primaryPathResultActions.filter((action) => action?.visible === true).map((action) => action?.kind),
    );
    const visibleSecondaryActionKinds = new Set(
      secondaryPathResultActions.filter((action) => action?.visible === true).map((action) => action?.kind),
    );
    for (const requiredKind of ["evidence", "find_path", "clear"]) {
      if (!visiblePrimaryActionKinds.has(requiredKind)) {
        return `WebView Path result primary action ${requiredKind} was not visible`;
      }
    }
    for (const requiredKind of [
      "relation_check",
      "explain_relation",
      "all_paths_plan",
      "all_paths",
    ]) {
      const action = pathResultActions.find((candidate) => candidate?.kind === requiredKind);
      if (action?.tier !== "secondary" || action?.disclosureOwner !== "secondary-checks") {
        return `WebView Path result secondary action ${requiredKind} was not in the compact checks disclosure`;
      }
      if (visibleSecondaryActionKinds.has(requiredKind)) {
        return `WebView Path result secondary action ${requiredKind} was visible by default`;
      }
    }
    const pathResultEndpoints = Array.isArray(payload.markers.topologyPathResultEndpoints)
      ? payload.markers.topologyPathResultEndpoints
      : [];
    const pathResultEndpointKinds = new Set(
      pathResultEndpoints.map((endpoint) => endpoint?.kind),
    );
    for (const requiredKind of ["source", "target"]) {
      if (!pathResultEndpointKinds.has(requiredKind)) {
        return `WebView Path result banner omitted ${requiredKind} endpoint marker`;
      }
    }
  }
  if (
    webviewPath.includes("/topology") &&
    webviewPath.startsWith("/ko/") &&
    payload.markers.topologyCommandChromeState !== "collapsed-active-relation"
  ) {
    if (!String(payload.markers.topologyTopRelayoutLabel || "").trim().includes("자동 정렬")) {
      return `WebView Korean Relief top relayout label was ${payload.markers.topologyTopRelayoutLabel || "missing"}`;
    }
    if (!String(payload.markers.topologyTopSearchLabel || "").trim().includes("검색")) {
      return `WebView Korean Relief top search label was ${payload.markers.topologyTopSearchLabel || "missing"}`;
    }
    const workspaceLabel = String(payload.markers.topologyTopWorkspaceLabel || "").trim();
    if (
      workspaceLabel &&
      !workspaceLabel.includes("작업공간") &&
      payload.markers.topologyCommandChromeState !== "selected-node-inspector"
    ) {
      return `WebView Korean Relief top workspace label was ${payload.markers.topologyTopWorkspaceLabel || "missing"}`;
    }
    const createLabel = String(payload.markers.topologyTopCreateLabel || "").trim();
    if (createLabel && createLabel !== "개념") {
      return `WebView Korean Relief top create label was ${createLabel}`;
    }
  }
  if (webviewPath.includes("/topology") && requireTopologyCreateNode && payload.markers.topologyCreateNodeOpen !== true) {
    return "WebView did not open the Add Concept composer during verification";
  }
  if (webviewPath.includes("/topology") && payload.markers.topologyCreateNodeOpen === true) {
    if (payload.markers.topologyCreateNodePanelVisible !== true) {
      return "WebView Add Concept composer was open without a visible panel";
    }
    if (payload.markers.topologyAttentionWinner !== "blocking-composer") {
      return `WebView Add Concept attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (
      payload.markers.topologyCreateNodePanelAttentionRole !== "blocking-composer" ||
      payload.markers.topologyCreateNodePanelPlacementContract !== "centered-blocking-edit"
    ) {
      return `WebView Add Concept composer attention contract was ${payload.markers.topologyCreateNodePanelAttentionRole || "missing"} / ${payload.markers.topologyCreateNodePanelPlacementContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeSurfaceRole !== "blocking-edit-surface") {
      return `WebView Add Concept surface role was ${payload.markers.topologyCreateNodeSurfaceRole || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeElevationContract !== "solid-panel-over-dimmed-map") {
      return `WebView Add Concept elevation contract was ${payload.markers.topologyCreateNodeElevationContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeSizeContract !== "bounded-centered-composer") {
      return `WebView Add Concept size contract was ${payload.markers.topologyCreateNodeSizeContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelTopToken !== "--topology-blocking-composer-top") {
      return `WebView Add Concept composer top token was ${payload.markers.topologyCreateNodePanelTopToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelWidthToken !== "--topology-blocking-composer-width") {
      return `WebView Add Concept composer width token was ${payload.markers.topologyCreateNodePanelWidthToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelMaxHeightToken !== "--topology-blocking-composer-max-height") {
      return `WebView Add Concept composer max-height token was ${payload.markers.topologyCreateNodePanelMaxHeightToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeFormSurfaceToken !== "--topology-blocking-composer-surface") {
      return `WebView Add Concept composer surface token was ${payload.markers.topologyCreateNodeFormSurfaceToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeFormBorderToken !== "--topology-blocking-composer-border") {
      return `WebView Add Concept composer border token was ${payload.markers.topologyCreateNodeFormBorderToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeFormShadowToken !== "--topology-blocking-composer-shadow") {
      return `WebView Add Concept composer shadow token was ${payload.markers.topologyCreateNodeFormShadowToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelRole !== "dialog") {
      return `WebView Add Concept composer role was ${payload.markers.topologyCreateNodePanelRole || "missing"}`;
    }
    if (String(payload.markers.topologyCreateNodePanelAriaModal || "") !== "true") {
      return `WebView Add Concept composer aria-modal was ${payload.markers.topologyCreateNodePanelAriaModal || "missing"}`;
    }
    if (
      !payload.markers.topologyCreateNodePanelLabelledBy ||
      payload.markers.topologyCreateNodePanelLabelledBy !== payload.markers.topologyCreateNodeHeadingId
    ) {
      return `WebView Add Concept composer was not labelled by its visible heading (${payload.markers.topologyCreateNodePanelLabelledBy || "missing"} / ${payload.markers.topologyCreateNodeHeadingId || "missing"})`;
    }
    if (payload.markers.topologyCreateNodeFocusInside !== true) {
      return `WebView Add Concept composer did not own keyboard focus (${payload.markers.topologyCreateNodeActiveElementTestId || "missing"})`;
    }
    if (payload.markers.topologyCreateNodeBackdropVisible !== true) {
      return "WebView Add Concept backdrop was missing while the composer was open";
    }
    if (payload.markers.topologyCreateNodeBackdropCoversViewport !== true) {
      return "WebView Add Concept backdrop did not cover the viewport";
    }
    if (payload.markers.topologyCreateNodeBackdropPointerEvents !== "auto") {
      return `WebView Add Concept backdrop did not intercept map interaction (${payload.markers.topologyCreateNodeBackdropPointerEvents || "missing"})`;
    }
    if (payload.markers.topologyCreateNodeBackdropContract !== "blocks-map-and-closes-composer") {
      return `WebView Add Concept backdrop contract was ${payload.markers.topologyCreateNodeBackdropContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeBackdropSurfaceToken !== "--topology-blocking-backdrop-surface") {
      return `WebView Add Concept backdrop surface token was ${payload.markers.topologyCreateNodeBackdropSurfaceToken || "missing"}`;
    }
    if (payload.markers.topologyBlockingComposerOverlayContract !== "exclusive-blocking-composer") {
      return `WebView Add Concept composer did not own the only interactive overlay (${payload.markers.topologyBlockingComposerOverlayContract || "missing"} · ${JSON.stringify(payload.markers.topologyInteractiveOverlayNames ?? [])})`;
    }
    const backdropBackground = String(payload.markers.topologyCreateNodeBackdropBackground || "");
    const backdropAlpha = Number(
      backdropBackground.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/)?.[1] ||
      backdropBackground.match(/\/\s*([0-9.]+)\s*\)/)?.[1] ||
      "0",
    );
    if (!(backdropAlpha >= 0.6)) {
      return `WebView Add Concept backdrop dim was too weak (${backdropBackground || "missing"})`;
    }
    const backdropFilter = String(payload.markers.topologyCreateNodeBackdropFilter || "none");
    if (backdropFilter !== "none") {
      return `WebView Add Concept backdrop used a forbidden backdrop filter (${backdropFilter})`;
    }
    if (
      payload.markers.topologyMapSurfaceBlockingEdit !== true ||
      payload.markers.topologyMapSurfaceDemoted !== true
    ) {
      return "WebView Add Concept did not demote the topology map surface";
    }
    if (Number(payload.markers.topologyMapSurfaceDimOpacity || 1) > 0.35) {
      return `WebView Add Concept topology map surface dim was too weak (${payload.markers.topologyMapSurfaceDimOpacity ?? "missing"})`;
    }
    if (payload.markers.topologyMapSurfaceDimOpacityToken !== "--topology-blocking-map-opacity") {
      return `WebView Add Concept topology map opacity token was ${payload.markers.topologyMapSurfaceDimOpacityToken || "missing"}`;
    }
    if (payload.markers.topologyMapSurfaceFilterToken !== "--topology-blocking-map-filter") {
      return `WebView Add Concept topology map filter token was ${payload.markers.topologyMapSurfaceFilterToken || "missing"}`;
    }
    if (payload.markers.topologyMapSurfaceInteractionContract !== "suppressed-while-blocking-composer") {
      return `WebView Add Concept topology map interaction contract was ${payload.markers.topologyMapSurfaceInteractionContract || "missing"}`;
    }
    if (payload.markers.topologyMapSurfacePointerEvents !== "none") {
      return `WebView Add Concept topology map surface still accepted interaction (${payload.markers.topologyMapSurfacePointerEvents || "missing"})`;
    }
    if (Number(payload.markers.topologyTransientSurfaceCount || 0) > 0) {
      return `WebView Add Concept kept transient Relief surfaces open (${JSON.stringify(payload.markers.topologyTransientSurfaceNames ?? [])})`;
    }
    if (payload.markers.topologySelectedRelationClaimLensVisible === true) {
      return "WebView Add Concept kept the selected relation claim lens visible under the blocking composer";
    }
    if (payload.markers.topologySelectedRelationHaloVisible === true) {
      return "WebView Add Concept kept the selected relation halo visible under the blocking composer";
    }
    if (
      payload.markers.topologyNodePopoverVisible === true ||
      payload.markers.topologySelectedNodePopoverVisible === true
    ) {
      return "WebView Add Concept kept the selected node popover visible under the blocking composer";
    }
    if (payload.markers.topologyAnalysisPanelVisible === true) {
      return "WebView Add Concept kept the Relief support panel visible above the blocking composer";
    }
    if (
      Number(payload.markers.topologyCreateNodePanelTop || 0) < 110 ||
      Number(payload.markers.topologyCreateNodePanelBottom || 0) > Number(payload.height || 0) - 24 ||
      Number(payload.markers.topologyCreateNodePanelLeft || 0) < 0 ||
      Number(payload.markers.topologyCreateNodePanelRight || 0) > Number(payload.width || 0)
    ) {
      return `WebView Add Concept panel was out of bounds (${payload.markers.topologyCreateNodePanelLeft ?? "?"}, ${payload.markers.topologyCreateNodePanelTop ?? "?"}, ${payload.markers.topologyCreateNodePanelRight ?? "?"}, ${payload.markers.topologyCreateNodePanelBottom ?? "?"})`;
    }
    const composerWidth = Number(payload.markers.topologyCreateNodePanelWidth || 0);
    if (composerWidth < 320 || composerWidth > Math.min(600, Number(payload.width || 0) - 24)) {
      return `WebView Add Concept panel width was not compact (${composerWidth || "missing"})`;
    }
    if (Number(payload.markers.topologyCreateNodePanelHeight || 0) > Number(payload.height || 0) - 176) {
      return `WebView Add Concept panel height exceeded the blocking edit viewport budget (${payload.markers.topologyCreateNodePanelHeight ?? "missing"})`;
    }
    if (Number(payload.markers.topologyCreateNodePanelCenterOffset || 0) > 24) {
      return `WebView Add Concept panel was not centered (${payload.markers.topologyCreateNodePanelCenterOffset ?? "missing"})`;
    }
    if (webviewPath.startsWith("/ko/")) {
      const panelText = String(payload.markers.topologyCreateNodePanelText || "");
      const titlePlaceholder = String(payload.markers.topologyCreateNodeTitlePlaceholder || "");
      const domainPlaceholder = String(payload.markers.topologyCreateNodeDomainPlaceholder || "");
      const submitLabel = String(payload.markers.topologyCreateNodeSubmitLabel || "");
      const kindOptions = Array.isArray(payload.markers.topologyCreateNodeKindOptions)
        ? payload.markers.topologyCreateNodeKindOptions.map(String)
        : [];
      const localizedComposer =
        panelText.includes("개념 추가") &&
        panelText.includes("종류") &&
        titlePlaceholder === "개념 이름" &&
        domainPlaceholder.includes("도메인 slug") &&
        submitLabel.includes("만들기") &&
        ["도메인", "역량", "요소"].every((option) => kindOptions.includes(option));
      if (!localizedComposer) {
        return "WebView Korean Relief localized Add Concept composer markers were missing";
      }
    }
  }
  if (
    webviewPath.includes("/topology") &&
    topologySelectedParam &&
    webviewUrl.searchParams.get("mode") !== "path"
  ) {
    const selectedFocusNoopContextVisible =
      requireTopologyFocusNoop &&
      payload.markers.topologyCameraMotionTrigger === "selected-focus-already-safe" &&
      payload.markers.topologyCameraMotionState === "already-safe";
    const selectedFocusZoomContextVisible =
      requireTopologyFocusZoom &&
      payload.markers.topologySelectedFocusContextRailZoomActive === true;
    if (
      payload.markers.topologySelectedNodePopoverVisible !== true &&
      !selectedRelationContextVisible &&
      !selectedFocusNoopContextVisible &&
      !selectedFocusZoomContextVisible &&
      !blockingComposerOpen
    ) {
      return `WebView did not report a visible Relief selected node context for ${topologySelectedParam}`;
    }
    if (requireTopologyFocusNoop) {
      const focusNoopError = validateTopologyFocusNoopMarkers(payload);
      if (focusNoopError) return focusNoopError;
    }
    if (requireTopologyFocusZoom) {
      const zoomError = validateTopologyZoomLensMarkers(payload.markers);
      if (zoomError) return zoomError;
      if (
        payload.markers.topologySelectedFocusContextRailZoomContract !==
        "camera-zoom-in-demotes-domain-rail-to-waypoint-pins"
      ) {
        return `WebView Relief focus rail zoom contract was ${payload.markers.topologySelectedFocusContextRailZoomContract || "missing"}`;
      }
      if (payload.markers.topologySelectedFocusContextRailZoomActive !== true) {
        return "WebView Relief focus rail zoom waypoint compaction was not active";
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      selectedNodeId !== topologySelectedParam
    ) {
      return `WebView reported selected node ${selectedNodeId || "unknown"}, expected ${topologySelectedParam}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      (!selectedNodeKind || !selectedNodeTitle || !selectedNodeSummary.includes(selectedNodeId))
    ) {
      return `WebView reported incomplete Relief selected node context (${selectedNodeSummary || "unknown"})`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      !selectedRelationContextVisible &&
      payload.markers.topologyAttentionWinner !== "focus-state"
    ) {
      return `WebView Relief selected node attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyAttentionWinner !== "active-relation-inspector"
    ) {
      return `WebView Relief selected relation attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyFocusClusterVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the focus cluster";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyAnalysisPanelVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the analysis panel";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyMinimapVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the minimap";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyKindLegendVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the kind legend";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyKindLegendState !== "collapsed-support-chrome"
    ) {
      return `WebView Relief selected relation kind legend state was ${payload.markers.topologyKindLegendState || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyCommandChromeState !== "collapsed-active-relation"
    ) {
      return `WebView Relief selected relation command chrome state was ${payload.markers.topologyCommandChromeState || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyTopLeftChromeGroupState !== "compact-active-relation"
    ) {
      return `WebView Relief selected relation workspace context state was ${payload.markers.topologyTopLeftChromeGroupState || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      Number(payload.width || 0) >= 1400 &&
      Number(payload.markers.topologyTopLeftChromeGroupWidth || 0) > 210
    ) {
      return `WebView Relief selected relation workspace context stayed too wide (${payload.markers.topologyTopLeftChromeGroupWidth ?? 0}px)`;
    }
    if (
      selectedRelationContextVisible &&
      Number(payload.width || 0) >= 1400 &&
      Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) > 160
    ) {
      return `WebView Relief selected relation label stayed too wide for the active inspector (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}px)`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologySelectedRelationLabelDensity !== "focus-token"
    ) {
      return `WebView Relief selected relation label density was ${payload.markers.topologySelectedRelationLabelDensity || "missing"}`;
    }
    if (selectedRelationContextVisible && selectedRelationRouteRailTextLeak(payload)) {
      return "WebView Relief selected relation label leaked hidden route rail text into body text";
    }
    if (selectedRelationContextVisible && koreanTopologyRoute) {
      const visibleRelationLabels = [
        payload.markers.topologySelectedRelationCardTypeLabel,
        payload.markers.topologySelectedRelationLabelTypeLabel,
      ]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
      if (visibleRelationLabels.length === 0) {
        return "WebView Relief selected relation did not expose localized relation type labels";
      }
      const rawRelationTypes = [
        payload.markers.topologySelectedRelationCardType,
        payload.markers.topologySelectedRelationLabelType,
        payload.markers.topologySelectedRelationCopyPayloadType,
      ]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!rawRelationTypes.some((value) => rawRelationTypePattern.test(value))) {
        return "WebView Relief selected relation did not preserve the raw relation type for MCP/CLI handoff";
      }
      const rawVisibleRelationLabel = visibleRelationLabels.find((value) =>
        rawRelationTypePattern.test(value),
      );
      if (rawVisibleRelationLabel) {
        return `WebView Relief selected relation exposed raw relation type copy in Korean UI (${rawVisibleRelationLabel})`;
      }
      if (!visibleRelationLabels.some((value) => /포함|의존|연관|설명|사용|소속/.test(value))) {
        return `WebView Relief selected relation visible type labels were not Korean (${visibleRelationLabels.join(", ")})`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverSurfaceRole !== "active-node-inspector"
    ) {
      return `WebView Relief selected node popover surface role was ${payload.markers.topologyNodePopoverSurfaceRole || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverAttentionRole !== "supporting-detail"
    ) {
      return `WebView Relief selected node popover attention role was ${payload.markers.topologyNodePopoverAttentionRole || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverFocusPrimary !== "linked-focus-cluster"
    ) {
      return `WebView Relief selected node popover primary focus was ${payload.markers.topologyNodePopoverFocusPrimary || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverHierarchyContract !== "click-focus-detail-support"
    ) {
      return `WebView Relief selected node popover hierarchy contract was ${payload.markers.topologyNodePopoverHierarchyContract || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed === true
    ) {
      if (payload.markers.topologyNodePopoverSizePolicy !== "context-chip") {
        return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} collapsed size policy during selected-node focus`;
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible === true) {
        return "WebView Relief selected node popover exposed relation rows while collapsed";
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed !== true &&
      payload.markers.topologyNodePopoverSizePolicy !== "inspector-rail"
    ) {
      return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} size policy during selected-node focus`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed !== true &&
      payload.markers.topologyNodePopoverRelationRowVisible !== true
    ) {
      return "WebView Relief selected node popover did not expose a relation row during selected-node focus";
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed !== true
    ) {
      if (
        payload.markers.topologyNodePopoverConnectionsOverflowContract !==
        "single-vertical-scroll-region"
      ) {
        return `WebView Relief selected node popover connections overflow contract was ${payload.markers.topologyNodePopoverConnectionsOverflowContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListOverflowContract !==
        "vertical-scroll-only"
      ) {
        return `WebView Relief selected node popover connection list overflow contract was ${payload.markers.topologyNodePopoverConnectionListOverflowContract || "missing"}`;
      }
      const nodePopoverFooterError = validateTopologyNodePopoverScrollFooterContract(
        payload.markers,
      );
      if (nodePopoverFooterError) {
        return nodePopoverFooterError;
      }
      const connectionListClientWidth = Number(
        payload.markers.topologyNodePopoverConnectionListClientWidth || 0,
      );
      const connectionListScrollWidth = Number(
        payload.markers.topologyNodePopoverConnectionListScrollWidth || 0,
      );
      if (
        !Number.isFinite(connectionListClientWidth) ||
        !Number.isFinite(connectionListScrollWidth) ||
        connectionListClientWidth < 180 ||
        connectionListScrollWidth - connectionListClientWidth > 2
      ) {
        return `WebView Relief selected node popover connection list overflowed (${connectionListClientWidth} client / ${connectionListScrollWidth} scroll)`;
      }
      if (
        payload.markers.topologyNodePopoverRelationRowOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView Relief selected node popover relation row overflow contract was ${payload.markers.topologyNodePopoverRelationRowOverflowContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListRowDensityContract !==
        "agent-handoff-scan-list"
      ) {
        return `WebView Relief selected node popover connection list row density contract was ${payload.markers.topologyNodePopoverConnectionListRowDensityContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListReadableRowContract !==
        "at-least-one-full-relation-row"
      ) {
        return `WebView Relief selected node popover readable row contract was ${payload.markers.topologyNodePopoverConnectionListReadableRowContract || "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverConnectionListRowMinHitHeight || 0) < 72
      ) {
        return `WebView Relief selected node popover connection list row hit height token was ${payload.markers.topologyNodePopoverConnectionListRowMinHitHeight ?? "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListRowRenderContract !==
        "capped-preview-plus-remainder"
      ) {
        return `WebView Relief selected node popover connection list row render contract was ${payload.markers.topologyNodePopoverConnectionListRowRenderContract || "missing"}`;
      }
      const nodePopoverRowRenderBudget = Number(
        payload.markers.topologyNodePopoverConnectionListRowRenderBudget || 0,
      );
      const nodePopoverRenderedRows = Number(
        payload.markers.topologyNodePopoverConnectionListRenderedCount || 0,
      );
      const nodePopoverHiddenRows = Number(
        payload.markers.topologyNodePopoverConnectionListHiddenCount || 0,
      );
      const nodePopoverTotalRows = Number(
        payload.markers.topologyNodePopoverConnectionListTotalCount || 0,
      );
      if (
        !Number.isFinite(nodePopoverRowRenderBudget) ||
        nodePopoverRowRenderBudget < 1 ||
        nodePopoverRowRenderBudget > 2
      ) {
        return `WebView Relief selected node popover connection list row render budget was ${payload.markers.topologyNodePopoverConnectionListRowRenderBudget ?? "missing"}`;
      }
      if (
        !Number.isFinite(nodePopoverRenderedRows) ||
        nodePopoverRenderedRows < 1 ||
        nodePopoverRenderedRows > nodePopoverRowRenderBudget
      ) {
        return `WebView Relief selected node popover rendered too many relation rows (${payload.markers.topologyNodePopoverConnectionListRenderedCount ?? "missing"} rendered / ${payload.markers.topologyNodePopoverConnectionListRowRenderBudget ?? "missing"} budget)`;
      }
      if (
        Number.isFinite(nodePopoverTotalRows) &&
        nodePopoverTotalRows > nodePopoverRenderedRows &&
        !(Number.isFinite(nodePopoverHiddenRows) && nodePopoverHiddenRows > 0)
      ) {
        return `WebView Relief selected node popover hidden relation remainder was ${payload.markers.topologyNodePopoverConnectionListHiddenCount ?? "missing"} for ${nodePopoverTotalRows} total relation(s)`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListHandoffContract !==
        "list-summary-routes-to-row-payload-or-full-detail"
      ) {
        return `WebView Relief selected node popover connection list handoff contract was ${payload.markers.topologyNodePopoverConnectionListHandoffContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListHandoffRoute !==
        "selected-node>relations>fact>evidence>gate>action>payload"
      ) {
        return `WebView Relief selected node popover connection list handoff route was ${payload.markers.topologyNodePopoverConnectionListHandoffRoute || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverConnectionListHandoffTool !== "query_ontology") {
        return `WebView Relief selected node popover connection list handoff tool was ${payload.markers.topologyNodePopoverConnectionListHandoffTool || "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverConnectionListVisibleRowCount || 0) !==
        nodePopoverRenderedRows
      ) {
        return `WebView Relief selected node popover connection list visible row count was ${payload.markers.topologyNodePopoverConnectionListVisibleRowCount ?? "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverConnectionListHiddenRemainderCount || 0) !==
        nodePopoverHiddenRows
      ) {
        return `WebView Relief selected node popover connection list hidden remainder count was ${payload.markers.topologyNodePopoverConnectionListHiddenRemainderCount ?? "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverConnectionListDirectFactCount || 0) !==
        nodePopoverTotalRows
      ) {
        return `WebView Relief selected node popover connection list direct fact count was ${payload.markers.topologyNodePopoverConnectionListDirectFactCount ?? "missing"}`;
      }
      if (
        !String(
          payload.markers.topologyNodePopoverConnectionListHandoffSummary || "",
        ).includes("query_ontology")
      ) {
        return `WebView Relief selected node popover connection list handoff summary was ${payload.markers.topologyNodePopoverConnectionListHandoffSummary || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverRelationRowDensityContract !==
        "agent-handoff-scan-row"
      ) {
        return `WebView Relief selected node popover relation row density contract was ${payload.markers.topologyNodePopoverRelationRowDensityContract || "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverRelationRowMinHitHeight || 0) < 72
      ) {
        return `WebView Relief selected node popover relation row hit height token was ${payload.markers.topologyNodePopoverRelationRowMinHitHeight ?? "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRelationRowScanOrder !== "title>relation>kind") {
        return `WebView Relief selected node popover relation row scan order was ${payload.markers.topologyNodePopoverRelationRowScanOrder || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRelationTitlePrimaryScanTarget !== "true") {
        return `WebView Relief selected node popover relation title primary scan target was ${payload.markers.topologyNodePopoverRelationTitlePrimaryScanTarget || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRelationHandoffLane !== "mcp-cli-next-action") {
        return `WebView Relief selected node popover relation row handoff lane was ${payload.markers.topologyNodePopoverRelationHandoffLane || "missing"}`;
      }
      if (Number(payload.markers.topologyNodePopoverRelationRowHeight || 0) < 68) {
        return `WebView Relief selected node popover relation row hit height was ${payload.markers.topologyNodePopoverRelationRowHeight ?? "missing"}px`;
      }
      const relationRowClientWidth = Number(
        payload.markers.topologyNodePopoverRelationRowClientWidth || 0,
      );
      const relationRowScrollWidth = Number(
        payload.markers.topologyNodePopoverRelationRowScrollWidth || 0,
      );
      if (
        !Number.isFinite(relationRowClientWidth) ||
        !Number.isFinite(relationRowScrollWidth) ||
        relationRowClientWidth < 180 ||
        relationRowScrollWidth - relationRowClientWidth > 2
      ) {
        return `WebView Relief selected node popover relation row overflowed (${relationRowClientWidth} client / ${relationRowScrollWidth} scroll)`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      (payload.markers.topologyAnalysisPanelSelectedContext === true ||
        payload.markers.topologyAnalysisPanelSelectedFocusRail === true)
    ) {
      if (payload.markers.topologyAnalysisPanelSelectedFocusRail !== true) {
        return "WebView Relief selected node panel did not report the selected focus rail marker";
      }
      if (payload.markers.topologyAnalysisPanelAttentionRole !== "support") {
        return `WebView Relief selected node panel attention role was ${payload.markers.topologyAnalysisPanelAttentionRole || "missing"}`;
      }
      if (payload.markers.topologyAnalysisPanelWidthContract !== "selected-focus-rail-max-320") {
        return `WebView Relief selected node panel width contract was ${payload.markers.topologyAnalysisPanelWidthContract || "missing"}`;
      }
      const selectedFocusRailMaxWidth = Number(payload.width || 0) <= 1600 ? 322 : 380;
      if (Number(payload.markers.topologyAnalysisPanelWidth || 0) > selectedFocusRailMaxWidth) {
        return `WebView Relief selected node panel was wider than the focus rail contract (${payload.markers.topologyAnalysisPanelWidth}px)`;
      }
    } else if (payload.markers.topologySelectedNodePopoverVisible === true) {
      if (payload.markers.topologyAttentionWinner !== "focus-state") {
        return `WebView Relief selected node attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
      }
      if (
        payload.markers.topologyAgentCurrentSurface &&
        payload.markers.topologyAgentCurrentSurface !== "selected-node"
      ) {
        return `WebView Relief selected node root current surface was ${payload.markers.topologyAgentCurrentSurface || "missing"}`;
      }
      if (
        payload.markers.topologyAgentCurrentSurfaceRole &&
        payload.markers.topologyAgentCurrentSurfaceRole !== payload.markers.topologyNodePopoverSurfaceRole
      ) {
        return `WebView Relief selected node root current surface role mismatched popover (${payload.markers.topologyAgentCurrentSurfaceRole || "missing"} vs ${payload.markers.topologyNodePopoverSurfaceRole || "missing"})`;
      }
      if (
        payload.markers.topologyAgentCurrentSurfaceRoute &&
        payload.markers.topologyAgentCurrentSurfaceRoute !== payload.markers.topologySelectedNodeId
      ) {
        return `WebView Relief selected node root current surface route mismatched selected node (${payload.markers.topologyAgentCurrentSurfaceRoute || "missing"} vs ${payload.markers.topologySelectedNodeId || "missing"})`;
      }
      if (
        payload.markers.topologyRootSelectedNodeId &&
        payload.markers.topologyRootSelectedNodeId !== payload.markers.topologySelectedNodeId
      ) {
        return `WebView Relief selected node root selected node id mismatched popover (${payload.markers.topologyRootSelectedNodeId || "missing"} vs ${payload.markers.topologySelectedNodeId || "missing"})`;
      }
      if (payload.markers.topologyAnalysisPanelVisible === true) {
        return "WebView Relief selected node support rail was visible without the focus rail marker";
      }
      if (payload.markers.topologyCommandChromeState !== "selected-node-inspector") {
        return `WebView Relief selected node command chrome state was ${payload.markers.topologyCommandChromeState || "missing"}`;
      }
      if (payload.markers.topologyUtilityActionLaneVisible === true) {
        return "WebView Relief selected node utility action lane was visible while inspector owns focus";
      }
      if (payload.markers.topologySigmaControlsStackVisible === true) {
        return "WebView Relief selected node controls stack was visible while inspector owns focus";
      }
      if (payload.markers.topologyShortcutsHelpButtonVisible === true) {
        return "WebView Relief selected node shortcuts help was visible while inspector owns focus";
      }
    }
    if (payload.markers.topologySelectedNodePopoverVisible === true) {
      const viewportWidth = Number(payload.width || 0);
      const popoverLeft = Number(payload.markers.topologyNodePopoverLeft || 0);
      const analysisPanelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
      const measuredInspectorGap = popoverLeft - analysisPanelRight;
      const reportedInspectorGap = Number(
        payload.markers.topologyNodePopoverInspectorGap ?? measuredInspectorGap,
      );
      const canMeasureInspectorGap =
        viewportWidth >= 1400 &&
        payload.markers.topologyAnalysisPanelVisible === true &&
        Number.isFinite(popoverLeft) &&
        popoverLeft > 0 &&
        Number.isFinite(analysisPanelRight) &&
        analysisPanelRight > 0;
      if (
        canMeasureInspectorGap &&
        payload.markers.topologyNodePopoverAttentionLaneContract !==
          "right-inspector-separated-from-support-rail"
      ) {
        return `WebView Relief selected node inspector attention lane contract was ${payload.markers.topologyNodePopoverAttentionLaneContract || "missing"}`;
      }
      if (
        canMeasureInspectorGap &&
        Math.abs(reportedInspectorGap - measuredInspectorGap) > 1
      ) {
        return `WebView Relief selected node inspector attention gap marker mismatched geometry (${reportedInspectorGap}px marker vs ${measuredInspectorGap}px measured)`;
      }
      if (canMeasureInspectorGap && reportedInspectorGap < 96) {
        return `WebView Relief selected node inspector attention gap was ${reportedInspectorGap}px`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologySkeletonMode === true &&
      selectedNodeKind !== "element"
    ) {
      const viewportWidth = Number(payload.width || 0);
      const viewportHeight = Number(payload.height || 0);
      const focusClusterSize = Number(payload.markers.topologyFocusClusterSize || 0);
      const bodyText = String(payload.bodyText || "");
      const durableClickFocus =
        focusClusterSize >= 2 &&
        payload.markers.topologyClickFocusRelationshipContext === "durable";
      const bodyFocusClusterVisible =
        focusClusterSize >= 2 && /linked\s+focus/i.test(bodyText);
      const bodyFocusRelationVisible =
        bodyFocusClusterVisible &&
        /(contains|depends|relates|uses|belongs|describes|CONTAINS|DEPENDS|RELATES|USES|BELONGS|DESCRIBES)/.test(
          bodyText,
        );
      if (
        !durableClickFocus &&
        !bodyFocusClusterVisible
      ) {
        return `WebView Relief selected node click-focus context was ${payload.markers.topologyClickFocusRelationshipContext || "missing"}`;
      }
      const focusClusterStage = String(
        payload.markers.topologyFocusClusterStage || "",
      );
      if (
        payload.markers.topologyFocusClusterMode === "focus" &&
        !/^(click-focus|click-focus-boxless)$/.test(focusClusterStage)
      ) {
        return `WebView Relief selected node focus cluster stage was ${payload.markers.topologyFocusClusterStage || "missing"}`;
      }
      if (payload.markers.topologyClickFocusRelationshipContext !== "durable") {
        return `WebView Relief selected node click focus relationship context was ${payload.markers.topologyClickFocusRelationshipContext || "missing"}`;
      }
      if (
        !/^(selected-dock-companions|focus-cluster)$/.test(
          String(payload.markers.topologyClickFocusRelationshipContextSource || ""),
        )
      ) {
        return `WebView Relief selected node click focus relationship context source was ${payload.markers.topologyClickFocusRelationshipContextSource || "missing"}`;
      }
      const cameraMotionTrigger = String(
        payload.markers.topologyCameraMotionTrigger || "",
      );
      const cameraMotionNoop = cameraMotionTrigger === "selected-focus-already-safe";
      if (
        !["selected-focus-safe-fit", "selected-focus-already-safe"].includes(
          cameraMotionTrigger,
        )
      ) {
        return `WebView Relief selected node camera motion trigger was ${payload.markers.topologyCameraMotionTrigger || "missing"}`;
      }
      if (
        payload.markers.topologyCameraMotionContract !==
        "purposeful-safe-fit-motion"
      ) {
        return `WebView Relief selected node camera motion contract was ${payload.markers.topologyCameraMotionContract || "missing"}`;
      }
      if (payload.markers.topologyCameraMotionEasing !== "ease-out-quart") {
        return `WebView Relief selected node camera motion easing was ${payload.markers.topologyCameraMotionEasing || "missing"}`;
      }
      const cameraMotionDuration = Number(
        payload.markers.topologyCameraMotionDurationMs || 0,
      );
      if (cameraMotionNoop && cameraMotionDuration !== 0) {
        return `WebView Relief selected node no-op camera duration was ${cameraMotionDuration}ms`;
      }
      if (
        !cameraMotionNoop &&
        payload.markers.topologyCameraMotionReduced === true &&
        cameraMotionDuration !== 0
      ) {
        return `WebView Relief selected node reduced-motion camera duration was ${cameraMotionDuration}ms`;
      }
      if (
        !cameraMotionNoop &&
        payload.markers.topologyCameraMotionReduced !== true &&
        cameraMotionDuration !== 420
      ) {
        return `WebView Relief selected node camera motion duration was ${cameraMotionDuration || "missing"}ms`;
      }
      if (
        !["settled", "animating", "reduced-motion", "already-safe"].includes(
          String(payload.markers.topologyCameraMotionState || ""),
        )
      ) {
        return `WebView Relief selected node camera motion state was ${payload.markers.topologyCameraMotionState || "missing"}`;
      }
      if (
        cameraMotionNoop &&
        payload.markers.topologyCameraMotionState !== "already-safe"
      ) {
        return `WebView Relief selected node no-op camera state was ${payload.markers.topologyCameraMotionState || "missing"}`;
      }
      if (payload.markers.topologyCameraMotionIntent !== "selected-focus-safe-rect") {
        return `WebView Relief selected node camera motion intent was ${payload.markers.topologyCameraMotionIntent || "missing"}`;
      }
      const expectedCameraMotionTargetPolicy = cameraMotionNoop
        ? "already-inside-safe-rect"
        : "viewport-center";
      if (payload.markers.topologyCameraMotionTargetPolicy !== expectedCameraMotionTargetPolicy) {
        return `WebView Relief selected node camera motion target policy was ${payload.markers.topologyCameraMotionTargetPolicy || "missing"}`;
      }
      const expectedCameraMotionDistancePolicy = cameraMotionNoop
        ? "already-safe-no-motion"
        : "bounded-safe-fit-distance";
      if (
        payload.markers.topologyCameraMotionDistancePolicy !==
        expectedCameraMotionDistancePolicy
      ) {
        return `WebView Relief selected node camera motion distance policy was ${payload.markers.topologyCameraMotionDistancePolicy || "missing"}`;
      }
      const cameraMotionSelectedViewportX = Number(
        payload.markers.topologyCameraMotionSelectedViewportX || 0,
      );
      const cameraMotionSelectedViewportY = Number(
        payload.markers.topologyCameraMotionSelectedViewportY || 0,
      );
      const cameraMotionSafeTargetX = Number(
        payload.markers.topologyCameraMotionSafeTargetX || 0,
      );
      const cameraMotionSafeTargetY = Number(
        payload.markers.topologyCameraMotionSafeTargetY || 0,
      );
      if (
        [
          cameraMotionSelectedViewportX,
          cameraMotionSelectedViewportY,
          cameraMotionSafeTargetX,
          cameraMotionSafeTargetY,
        ].some((value) => !Number.isFinite(value) || value <= 0)
      ) {
        return "WebView Relief selected node camera motion coordinate proof was incomplete";
      }
      const cameraMotionDistancePx = Number(
        payload.markers.topologyCameraMotionDistancePx || 0,
      );
      if (
        cameraMotionNoop
          ? cameraMotionDistancePx !== 0
          : !Number.isFinite(cameraMotionDistancePx) || cameraMotionDistancePx < 1
      ) {
        return `WebView Relief selected node camera motion distance was ${payload.markers.topologyCameraMotionDistancePx || "missing"}px`;
      }
      const measuredCameraMotionDistance = Math.round(
        Math.hypot(
          cameraMotionSafeTargetX - cameraMotionSelectedViewportX,
          cameraMotionSafeTargetY - cameraMotionSelectedViewportY,
        ),
      );
      if (Math.abs(measuredCameraMotionDistance - cameraMotionDistancePx) > 2) {
        return `WebView Relief selected node camera motion distance mismatched the coordinate proof (${cameraMotionDistancePx}px marker vs ${measuredCameraMotionDistance}px measured)`;
      }
      const selectedFanoutRows = Number(
        payload.markers.topologyCameraMotionSelectedFanoutRows || 0,
      );
      const cameraMotionFanoutMaxDistancePx =
        220 + Math.max(0, selectedFanoutRows - 2) * 48;
      const cameraMotionViewportWidth = Math.max(0, Number(payload.width || 0));
      const cameraMotionViewportMaxDistancePx =
        cameraMotionViewportWidth >= 1800
          ? Math.round(cameraMotionViewportWidth * 0.18)
          : cameraMotionViewportWidth >= 1400
            ? Math.round(cameraMotionViewportWidth * 0.21)
          : 0;
      const cameraMotionMaxDistancePx = Math.max(
        cameraMotionFanoutMaxDistancePx,
        cameraMotionViewportMaxDistancePx,
      );
      if (
        Number(payload.markers.topologyCameraMotionMaxDistancePx || 0) !==
        cameraMotionMaxDistancePx
      ) {
        return `WebView Relief selected node camera motion max distance marker was ${payload.markers.topologyCameraMotionMaxDistancePx || "missing"}px`;
      }
      if (cameraMotionDistancePx > cameraMotionMaxDistancePx) {
        return `WebView Relief selected node camera motion was excessive (${cameraMotionDistancePx}px > ${cameraMotionMaxDistancePx}px)`;
      }
      if (payload.markers.topologyCameraMotionTargetInsideSafeRect !== true) {
        return "WebView Relief selected node camera motion safe target was not confirmed";
      }
      const cameraSafeInsets = [
        payload.markers.topologyCameraMotionSafeInsetTop,
        payload.markers.topologyCameraMotionSafeInsetRight,
        payload.markers.topologyCameraMotionSafeInsetBottom,
        payload.markers.topologyCameraMotionSafeInsetLeft,
      ].map((value) => Number(value || 0));
      if (
        cameraSafeInsets.some((value) => !Number.isFinite(value) || value <= 0) ||
        selectedFanoutRows < 1
      ) {
        return "WebView Relief selected node camera motion safe rect proof was incomplete";
      }
      const [safeInsetTop, safeInsetRight, safeInsetBottom, safeInsetLeft] = cameraSafeInsets;
      const safeRight = viewportWidth - safeInsetRight;
      const safeBottom = viewportHeight - safeInsetBottom;
      if (
        cameraMotionSafeTargetX < safeInsetLeft - 1 ||
        cameraMotionSafeTargetX > safeRight + 1 ||
        cameraMotionSafeTargetY < safeInsetTop - 1 ||
        cameraMotionSafeTargetY > safeBottom + 1
      ) {
        return `WebView Relief selected node camera motion target was outside the computed safe rect (${cameraMotionSafeTargetX}, ${cameraMotionSafeTargetY} vs left ${safeInsetLeft}, top ${safeInsetTop}, right ${safeRight}, bottom ${safeBottom})`;
      }
      const shouldValidateRightReserve =
        requireTopologyNodePopover ||
        String(payload.markers.topologyCameraMotionRightReserveContract || "")
          .length > 0 ||
        payload.markers.topologyCameraMotionSafeTargetRightClearance !== undefined;
      if (shouldValidateRightReserve) {
        if (
          payload.markers.topologyCameraMotionRightReserveContract !==
          "selected-inspector-safe-reserve"
        ) {
          return `WebView Relief selected node camera right reserve contract was ${payload.markers.topologyCameraMotionRightReserveContract || "missing"}`;
        }
        const reportedSafeTargetRightClearance = Number(
          payload.markers.topologyCameraMotionSafeTargetRightClearance ?? 0,
        );
        const measuredSafeTargetRightClearance = Math.round(
          safeRight - cameraMotionSafeTargetX,
        );
        if (
          !Number.isFinite(reportedSafeTargetRightClearance) ||
          reportedSafeTargetRightClearance < 0 ||
          Math.abs(
            reportedSafeTargetRightClearance - measuredSafeTargetRightClearance,
          ) > 2
        ) {
          return `WebView Relief selected node camera safe target right clearance mismatched (${reportedSafeTargetRightClearance || "missing"}px marker vs ${measuredSafeTargetRightClearance}px measured)`;
        }
      }
      if (requireTopologyFocusNoop) {
        const focusNoopError = validateTopologyFocusNoopMarkers(payload);
        if (focusNoopError) return focusNoopError;
      }
      if (!(focusClusterSize >= 2)) {
        return `WebView Relief selected node focus cluster was too small (${payload.markers.topologyFocusClusterSize ?? "missing"})`;
      }
      const hasSelectedDockCompanion =
        Number(payload.markers.topologySelectedDockCompanionCount) >= 1 ||
        Number(payload.markers.topologySelectedDockVisibleCompanionCount) >= 1;
      if (
        !(Number(payload.markers.topologyFocusClusterConnectorCount) >= 1) &&
        !bodyFocusRelationVisible &&
        !hasSelectedDockCompanion
      ) {
        return "WebView Relief selected node focus cluster did not expose linked relation connectors";
      }
      if (
        !(Number(payload.markers.topologyFocusClusterRelationLabelCount) >= 1) &&
        !bodyFocusRelationVisible &&
        !hasSelectedDockCompanion
      ) {
        return "WebView Relief selected node focus cluster did not expose linked relation labels";
      }
      const focusClusterWidth = Number(payload.markers.topologyFocusClusterWidth || 0);
      const focusClusterHeight = Number(payload.markers.topologyFocusClusterHeight || 0);
      const focusClusterLeft = Number(payload.markers.topologyFocusClusterLeft || 0);
      const focusClusterTop = Number(payload.markers.topologyFocusClusterTop || 0);
      const focusClusterRight = Number(payload.markers.topologyFocusClusterRight || 0);
      const focusClusterBottom = Number(payload.markers.topologyFocusClusterBottom || 0);
      const focusHullRendered =
        payload.markers.topologyFocusClusterMode === "focus" &&
        payload.markers.topologyFocusClusterVisible === true;
      const canMeasureFocusGeometry =
        focusHullRendered &&
        viewportWidth >= 1400 &&
        viewportHeight >= 800 &&
        [focusClusterWidth, focusClusterHeight, focusClusterLeft, focusClusterTop, focusClusterRight, focusClusterBottom].every(Number.isFinite);
      if (
        canMeasureFocusGeometry &&
        (
          focusClusterWidth < 320 ||
          focusClusterHeight < 120 ||
          focusClusterLeft < 0 ||
          focusClusterTop < 72 ||
          focusClusterRight > viewportWidth ||
          focusClusterBottom > viewportHeight
        )
      ) {
        return `WebView Relief selected node focus cluster geometry was out of contract (${focusClusterLeft}, ${focusClusterTop}, ${focusClusterRight}, ${focusClusterBottom}; ${focusClusterWidth}x${focusClusterHeight})`;
      }
      const focusClusterCenterY = (focusClusterTop + focusClusterBottom) / 2;
      if (
        canMeasureFocusGeometry &&
        focusClusterCenterY > viewportHeight * 0.6
      ) {
        return `WebView Relief selected node focus cluster was below the click-focus reading band (${focusClusterCenterY}px center vs ${viewportHeight}px viewport)`;
      }
      const panelLeft = Number(payload.markers.topologyAnalysisPanelLeft || 0);
      const panelTop = Number(payload.markers.topologyAnalysisPanelTop || 0);
      const panelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
      const panelBottom = Number(payload.markers.topologyAnalysisPanelBottom || 0);
      const canMeasurePanelCollision =
        canMeasureFocusGeometry &&
        [panelLeft, panelTop, panelRight, panelBottom].every(Number.isFinite) &&
        panelRight > panelLeft &&
        panelBottom > panelTop;
      const collisionPad = 8;
      const overlapsPanel =
        focusClusterLeft < panelRight + collisionPad &&
        focusClusterRight > panelLeft - collisionPad &&
        focusClusterTop < panelBottom + collisionPad &&
        focusClusterBottom > panelTop - collisionPad;
      if (canMeasurePanelCollision && overlapsPanel) {
        return `WebView Relief selected node focus cluster overlapped the analysis panel (${focusClusterLeft}, ${focusClusterTop}, ${focusClusterRight}, ${focusClusterBottom} vs ${panelLeft}, ${panelTop}, ${panelRight}, ${panelBottom})`;
      }
      if (
        focusHullRendered &&
        payload.markers.topologyFocusClusterBreathingRoomContract !==
        "viewport-edge-clearance"
      ) {
        return `WebView Relief selected node focus cluster breathing-room contract was ${payload.markers.topologyFocusClusterBreathingRoomContract || "missing"}`;
      }
      const focusClusterBreathingRoom = Number(
        payload.markers.topologyFocusClusterBreathingRoomPx || 0,
      );
      const focusClusterRightClearance = Number(
        payload.markers.topologyFocusClusterRightClearance || 0,
      );
      const focusClusterBottomClearance = Number(
        payload.markers.topologyFocusClusterBottomClearance || 0,
      );
      if (
        focusHullRendered &&
        (focusClusterBreathingRoom < 12 ||
          focusClusterRightClearance < focusClusterBreathingRoom ||
          focusClusterBottomClearance < focusClusterBreathingRoom)
      ) {
        return `WebView Relief selected node focus cluster hugged the viewport edge (${focusClusterRightClearance || "missing"}px right / ${focusClusterBottomClearance || "missing"}px bottom / ${focusClusterBreathingRoom || "missing"}px required)`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyAnalysisPanelSelectedFocusRail === true
    ) {
      const nodePopoverTokenError =
        validateTopologyNodePopoverTokenContract(payload.markers);
      if (nodePopoverTokenError) return nodePopoverTokenError;
      const selectedCardRelationSummaryError =
        validateTopologySelectedCardRelationSummaryContract(payload.markers);
      if (selectedCardRelationSummaryError) return selectedCardRelationSummaryError;
      const commandSpineError =
        validateTopologyFocusCommandSpineContract(payload.markers);
      if (commandSpineError) return commandSpineError;
      const utilityLaneError =
        validateTopologyFocusUtilityLaneContract(payload.markers);
      if (utilityLaneError) return utilityLaneError;
      const searchLaneError =
        validateTopologyFocusSearchLaneContract(payload.markers);
      if (searchLaneError) return searchLaneError;
      const rightControlsError =
        validateTopologyFocusRightControlsContract(payload.markers);
      if (rightControlsError) return rightControlsError;
    }
    if (requireTopologyNodePopover) {
      if (payload.markers.topologyNodePopoverVerifyAttempted !== true) {
        return "WebView did not attempt selected node popover verification";
      }
      if (payload.markers.topologyNodePopoverVerifyExpanded !== true) {
        return `WebView did not finish selected node popover expansion (${payload.markers.topologyNodePopoverVerifyReason || "unknown reason"})`;
      }
      if (payload.markers.topologyNodePopoverVerifyCompactFactsVisible !== true) {
        return "WebView did not capture compact selected node relation facts before expansion";
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactFactsContract !==
        "collapsed-dock-surfaces-typed-facts"
      ) {
        return `WebView compact selected node relation facts contract was ${payload.markers.topologyNodePopoverVerifyCompactFactsContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactFactsReadableContract !==
        "direct-typed-facts-not-scores"
      ) {
        return `WebView compact selected node relation facts readable contract was ${payload.markers.topologyNodePopoverVerifyCompactFactsReadableContract || "missing"}`;
      }
      const compactVerifyNoScores = String(
        payload.markers.topologyNodePopoverVerifyCompactFactsNoScores || "",
      ).trim();
      if (!compactVerifyNoScores) {
        return "WebView compact selected node relation facts no-scores text was missing";
      }
      if (
        !String(payload.markers.topologyNodePopoverVerifyCompactFactsAccessibleName || "").includes(
          compactVerifyNoScores,
        )
      ) {
        return "WebView compact selected node relation facts accessible name did not include no-scores text";
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactFactsHandoffContract !==
        "compact-counts-route-to-relation-list-handoff"
      ) {
        return `WebView compact selected node relation facts handoff contract was ${payload.markers.topologyNodePopoverVerifyCompactFactsHandoffContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactFactsHandoffRoute !==
        "selected-node>relations>fact>evidence>gate>action>payload"
      ) {
        return `WebView compact selected node relation facts handoff route was ${payload.markers.topologyNodePopoverVerifyCompactFactsHandoffRoute || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactFactsHandoffTool !==
        "query_ontology"
      ) {
        return `WebView compact selected node relation facts handoff tool was ${payload.markers.topologyNodePopoverVerifyCompactFactsHandoffTool || "missing"}`;
      }
      const compactVerifyHandoffSummary = String(
        payload.markers.topologyNodePopoverVerifyCompactFactsHandoffSummary || "",
      );
      if (
        !compactVerifyHandoffSummary.includes("query_ontology") ||
        !compactVerifyHandoffSummary.includes("direct facts")
      ) {
        return `WebView compact selected node relation facts handoff summary was ${compactVerifyHandoffSummary || "missing"}`;
      }
      if (
        !Number.isFinite(
          Number(payload.markers.topologyNodePopoverVerifyCompactFactsHiddenRemainderCount),
        ) ||
        Number(payload.markers.topologyNodePopoverVerifyCompactFactsHiddenRemainderCount) < 0
      ) {
        return `WebView compact selected node relation facts hidden remainder count was ${payload.markers.topologyNodePopoverVerifyCompactFactsHiddenRemainderCount ?? "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactActionsReadableFlow !==
        "selected-node-facts-to-agent-handoff"
      ) {
        return `WebView compact selected node actions readable flow was ${payload.markers.topologyNodePopoverVerifyCompactActionsReadableFlow || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverVerifyCompactBriefReadableFlow !==
        "selected-node-facts-to-agent-brief"
      ) {
        return `WebView compact selected node brief readable flow was ${payload.markers.topologyNodePopoverVerifyCompactBriefReadableFlow || "missing"}`;
      }
      if (payload.markers.topologySelectedNodePopoverVisible !== true) {
        return "WebView did not expose the selected node popover during node popover verification";
      }
      if (payload.markers.topologyNodePopoverVisible !== true) {
        return "WebView did not measure the selected node popover during node popover verification";
      }
      if (payload.markers.topologyNodePopoverCollapsed === true) {
        return "WebView did not expand the selected node popover during node popover verification";
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible !== true) {
        return "WebView selected node popover did not expose a relation row during node popover verification";
      }
      const nodePopoverTokenError =
        validateTopologyNodePopoverTokenContract(payload.markers);
      if (nodePopoverTokenError) return nodePopoverTokenError;
      const nodePopoverFooterError = validateTopologyNodePopoverScrollFooterContract(
        payload.markers,
      );
      if (nodePopoverFooterError) return nodePopoverFooterError;
    }
  }
  if (webviewPath.includes("/topology")) {
    const topologyDragDone =
      requireTopologyDrag &&
      payload.markers.topologyDragAttempted === true &&
      payload.markers.topologyDragReason === "done";
    if (!topologyMapCanvasActive && payload.markers.topologySigmaViewportVisible === false) {
      return "WebView did not report a visible Sigma topology viewport";
    }
    if (payload.markers.topologySigmaBootError === true) {
      return "WebView reported a Sigma topology boot error";
    }
    if (!topologyMapCanvasActive && payload.markers.topologySigmaReady === false) {
      return "WebView reported Relief before the Sigma renderer was ready";
    }
    // v2 캔버스의 클릭-취소 임계는 `--topology-v2-hysteresis-px` = 7 (B2+
    // 프로토타입 승인값) — 구 Relief 의 12px 하한은 v2 에는 사전 부패다.
    const stagePanFloor = topologyMapV2Active ? 6 : 12;
    if (!(Number(payload.markers.topologyStagePanClickCancelPx) >= stagePanFloor)) {
      return `WebView reported an over-sensitive stage pan threshold (${payload.markers.topologyStagePanClickCancelPx ?? "missing"}px, floor ${stagePanFloor}px)`;
    }
    if (
      payload.markers.topologySigmaReady === true &&
      payload.markers.topologyEngineLoadingVisible === true
    ) {
      return "WebView reported a visible Relief engine loading indicator after Sigma was ready";
    }
    if (
      !topologyMapCanvasActive &&
      Number.isFinite(payload.markers.topologySigmaCanvasCount) &&
      payload.markers.topologySigmaCanvasCount < 1
    ) {
      return `WebView reported no Sigma canvas (${payload.markers.topologySigmaCanvasCount ?? "unknown"} canvas element(s))`;
    }
    // mode=graph (옵시디언식 살아있는 그래프) 는 skeleton 없이 그리는 것이
    // 계약 — 골격 카드 검사를 건너뛴다. Sigma 캔버스/뷰포트 검사는 그대로.
    const topologyGraphModeActive =
      webviewUrl.searchParams.get("mode") === "graph";
    if (topologyMapEngine === "canvas") {
      // 카드 수는 구 map-canvas(DOM 카드) 전용 — v2 는 순수 캔버스 드로잉이라
      // DOM 카드가 0 인 것이 정상이다.
      if (!(Number(payload.markers.topologyMapCanvasCardCount) >= 8)) {
        return `WebView map canvas rendered too few cards (${payload.markers.topologyMapCanvasCardCount ?? "unknown"})`;
      }
    }
    if (!topologyGraphModeActive && !topologyMapCanvasActive && payload.markers.topologySkeletonMode === false) {
      return "WebView reported Relief without topology skeleton mode";
    }
    if (!topologyGraphModeActive && !topologyMapCanvasActive && payload.markers.topologySkeletonCardsActive === false) {
      return `WebView reported Relief without active skeleton cards (${payload.markers.topologySkeletonCardModelCount ?? "unknown"} card model(s))`;
    }
    if (!topologyGraphModeActive && !topologyMapCanvasActive && payload.markers.topologySkeletonLayerPresent === false) {
      return `WebView reported active skeleton cards but no skeleton layer (${payload.markers.topologySkeletonCardModelCount ?? "unknown"} card model(s))`;
    }
    if (
      Number.isFinite(payload.markers.topologySkeletonLayerModelCount) &&
      Number.isFinite(payload.markers.topologySkeletonLayerResolvedCount) &&
      payload.markers.topologySkeletonLayerModelCount > 0 &&
      payload.markers.topologySkeletonLayerResolvedCount < 1
    ) {
      return `WebView reported no resolvable Relief cards (${payload.markers.topologySkeletonLayerResolvedCount}/${payload.markers.topologySkeletonLayerModelCount})`;
    }
    if (
      !topologyGraphModeActive && !topologyMapCanvasActive &&
      Number(payload.width) >= 1400 &&
      !(Number(payload.markers.topologyUiScale) >= 1.12)
    ) {
      return `WebView Relief UI scale was ${payload.markers.topologyUiScale ?? "missing"} at ${payload.width}px viewport`;
    }
    const hasResolvedSkeletonOverlay =
      payload.markers.topologySkeletonLayerPresent === true &&
      Number(payload.markers.topologySkeletonLayerResolvedCount || 0) >= 1 &&
      Number(payload.markers.topologySkeletonCardResolvedCount || 0) >= 1;
    if (
      !topologyGraphModeActive && !topologyMapCanvasActive &&
      !topologyDragDone &&
      payload.markers.topologyCardsReady !== true &&
      !hasResolvedSkeletonOverlay
    ) {
      return "WebView reported Relief cards before the skeleton overlay was ready";
    }
    const selectedFocusContext =
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyClickFocusRelationshipContext === "durable" &&
      Number(payload.markers.topologyFocusClusterSize) >= 2;
    const selectedFocusStationaryContextProof =
      requireTopologyDrag &&
      selectedFocusContext &&
      payload.markers.topologyDragAttempted !== true &&
      payload.markers.topologyDragReason === "waiting for selected reveal companion" &&
      payload.markers.topologySelectedDockCompanionVisible === true &&
      Number(payload.markers.topologySelectedDockVisibleCompanionCount) >= 1 &&
      payload.markers.topologyResidualOverlapClear === true &&
      Number(payload.markers.topologyCardFixedSurfaceOverlapCount || 0) === 0;
    const hasDimOpacityProof =
      payload.markers.topologyDimOpacityContract !== undefined ||
      payload.markers.topologyDimAnchorOpacity !== undefined ||
      payload.markers.topologyDimChipOpacity !== undefined ||
      Array.isArray(payload.markers.topologyCardRawSample);
    if (selectedFocusContext && hasDimOpacityProof) {
      const dimAnchorOpacity = Number(payload.markers.topologyDimAnchorOpacity || 0);
      const dimChipOpacity = Number(payload.markers.topologyDimChipOpacity || 0);
      const dimAnchorVisibleCount = Number(payload.markers.topologyDimAnchorVisibleCount || 0);
      const dimChipVisibleCount = Number(payload.markers.topologyDimChipVisibleCount || 0);
      const dimAnchorMinOpacity = Number(payload.markers.topologyDimAnchorMinOpacity || 0);
      const dimChipMinOpacity = Number(payload.markers.topologyDimChipMinOpacity || 0);
      if (payload.markers.topologyDimOpacityContract !== TOPOLOGY_DIM_OPACITY_CONTRACT) {
        return `WebView dimmed Relief context opacity contract was ${payload.markers.topologyDimOpacityContract || "missing"}`;
      }
      if (!(dimAnchorOpacity >= TOPOLOGY_DIM_ANCHOR_MIN_OPACITY)) {
        return `WebView dimmed Relief anchor opacity token was ${payload.markers.topologyDimAnchorOpacity ?? "missing"}`;
      }
      if (!(dimChipOpacity >= TOPOLOGY_DIM_CONTEXT_MIN_OPACITY)) {
        return `WebView dimmed Relief chip opacity token was ${payload.markers.topologyDimChipOpacity ?? "missing"}`;
      }
      if (dimAnchorVisibleCount > 0 && !(dimAnchorMinOpacity >= TOPOLOGY_DIM_ANCHOR_MIN_OPACITY)) {
        return `WebView dimmed Relief anchor opacity was ${payload.markers.topologyDimAnchorMinOpacity ?? "missing"}`;
      }
      if (dimChipVisibleCount > 0 && !(dimChipMinOpacity >= TOPOLOGY_DIM_CONTEXT_MIN_OPACITY)) {
        return `WebView dimmed Relief chip opacity was ${payload.markers.topologyDimChipMinOpacity ?? "missing"}`;
      }
    }
    const overviewCompactWideContext =
      payload.markers.topologyAnalysisPanelMode === "overview" &&
      Number(payload.width) >= 2400 &&
      Number(payload.markers.topologyUiScale || 0) >= 1.3;
    const selectedRelationSilhouetteVisibleCount =
      Number(payload.markers.topologySelectedRelationEndpointVisibleCount || 0) +
      Number(payload.markers.topologySelectedRelationVisibleOrientationAnchorCount || 0);
    const selectedRelationSilhouetteContext =
      payload.markers.topologyAgentCurrentSurface === "selected-relation" &&
      payload.markers.topologySelectedRelationContextSilhouetteActive === true &&
      Number(payload.markers.topologySelectedRelationEndpointVisibleCount || 0) >= 2 &&
      selectedRelationSilhouetteVisibleCount >= 2;
    const minimumTopologyCardCount = topologyDragDone
      ? 1
      : selectedFocusContext
        ? 2
        : selectedRelationSilhouetteContext
          ? selectedRelationSilhouetteVisibleCount
          : overviewCompactWideContext
            ? 7
            : 8;
    if (
      !requireTopologyFrameProfile &&
      !topologyGraphModeActive && !topologyMapCanvasActive &&
      (!Number.isFinite(payload.markers.topologyCardCount) ||
        payload.markers.topologyCardCount < minimumTopologyCardCount)
    ) {
      return `WebView reported too few visible Relief cards (${payload.markers.topologyCardCount ?? "unknown"} visible, ${payload.markers.topologyCardRawCount ?? "unknown"} raw)`;
    }
    if (
      requireTopologyDrag &&
      !topologyDragDone &&
      !selectedFocusStationaryContextProof
    ) {
      return `WebView did not attempt the Relief card drag verification (${payload.markers.topologyDragReason ?? "unknown reason"})`;
    }
    if (
      requireTopologyDrag &&
      !(Number(payload.markers.topologySelectedDockCompanionCount) >= 1)
    ) {
      return `WebView did not report selected Relief fan-out companions (${payload.markers.topologySelectedDockCompanionCount ?? "missing"} companion(s))`;
    }
    const hasVisibleSelectedFanOut =
      Number(payload.markers.topologySelectedDockVisibleCompanionCount) >= 1 ||
      Number(payload.markers.topologyDragVisibleCompanionCount) >= 1;
    if (
      requireTopologyDrag &&
      !hasVisibleSelectedFanOut
    ) {
      return `WebView did not report a visible selected Relief fan-out companion (${payload.markers.topologySelectedDockVisibleCompanionCount ?? "missing"} current, ${payload.markers.topologyDragVisibleCompanionCount ?? "missing"} captured)`;
    }
    if (
      requireTopologyDrag &&
      payload.markers.topologySelectedDockCompanionVisible !== true &&
      payload.markers.topologyDragCompanionVisible !== true
    ) {
      return "WebView reported selected Relief fan-out companions as hidden";
    }
    if (!requireTopologyFrameProfile && !topologyGraphModeActive && !topologyMapCanvasActive && payload.markers.topologyCardOverlapCount !== 0) {
      return `WebView reported overlapping Relief cards (${payload.markers.topologyCardOverlapCount ?? "unknown"} overlap pair(s))`;
    }
    if (!requireTopologyFrameProfile && !topologyGraphModeActive && !topologyMapCanvasActive && payload.markers.topologyCardClippedCount !== 0) {
      return `WebView reported clipped Relief cards (${payload.markers.topologyCardClippedCount ?? "unknown"} clipped card(s))`;
    }
    const residualOverlapProvesClear =
      payload.markers.topologyResidualOverlapClear === true &&
      Number(payload.markers.topologyResidualVisibleCardOverlapCount) === 0 &&
      Number(payload.markers.topologyResidualFixedSurfaceOverlapCount) === 0 &&
      Number(payload.markers.topologyResidualCardFixedSurfaceOverlapCount) === 0;
    if (
      payload.markers.topologyCardFixedSurfaceOverlapCount !== 0 &&
      !residualOverlapProvesClear
    ) {
      return `WebView reported Relief cards overlapping fixed topology surfaces (${payload.markers.topologyCardFixedSurfaceOverlapCount ?? "unknown"} overlap(s))`;
    }
    if (payload.markers.topologyFixedSurfaceOverlapCount !== 0) {
      return `WebView reported overlapping Relief fixed surfaces (${payload.markers.topologyFixedSurfaceOverlapCount ?? "unknown"} overlap(s))`;
    }
    const fixedSurfaceNames = Array.isArray(payload.markers.topologyFixedSurfaceNames)
      ? payload.markers.topologyFixedSurfaceNames
      : null;
    if (
      selectedRelationContextVisible &&
      fixedSurfaceNames &&
      !fixedSurfaceNames.includes("sigma-selected-edge-card")
    ) {
      return `WebView did not register the selected relation card as a fixed topology surface (${JSON.stringify(fixedSurfaceNames)})`;
    }
    const transientContract = String(
      payload.markers.topologyTransientSurfaceContract || "",
    );
    if (
      payload.markers.topologyCreateNodeOpen === true &&
      Number(payload.markers.topologyTransientSurfaceCount || 0) > 0
    ) {
      return `WebView kept transient Relief surfaces open above the blocking composer (${JSON.stringify(payload.markers.topologyTransientSurfaceNames ?? [])})`;
    }
    if (
      transientContract &&
      !["single-transient", "path-prompt-group", "blocking-surface-wins"].includes(
        transientContract,
      )
    ) {
      return `WebView reported a stacked Relief transient surface contract (${transientContract}: ${JSON.stringify(payload.markers.topologyTransientSurfaceNames ?? [])})`;
    }
    if (
      !topologyMapCanvasActive &&
      Number(payload.width) >= 1400 &&
      payload.markers.topologyCreateNodeOpen !== true &&
      !selectedRelationContextVisible &&
      !focusSelectedNodeRoute &&
      webviewUrl.searchParams.get("mode") !== "path"
    ) {
      if (payload.markers.topologyMinimapVisible !== true) {
        return `WebView did not report the Relief minimap at ${payload.width}px viewport`;
      }
      if (
        Number(payload.markers.topologyMinimapWidth) < 220 ||
        Number(payload.markers.topologyMinimapHeight) < 170
      ) {
        return `WebView reported a cramped Relief minimap (${payload.markers.topologyMinimapWidth ?? "unknown"}x${payload.markers.topologyMinimapHeight ?? "unknown"})`;
      }
      if (
        Number(payload.markers.topologyMinimapRight) < 12 ||
        Number(payload.markers.topologyMinimapBottom) < 12
      ) {
        return `WebView reported Relief minimap without viewport-safe inset (right=${payload.markers.topologyMinimapRight ?? "unknown"}, bottom=${payload.markers.topologyMinimapBottom ?? "unknown"})`;
      }
      if (payload.markers.topologyMinimapViewportVisible !== true) {
        return "WebView did not report a visible Relief minimap viewport frame";
      }
      if (
        payload.markers.topologyMinimapViewportFrameState !== "readable" ||
        Number(payload.markers.topologyMinimapViewportWidth) < 24 ||
        Number(payload.markers.topologyMinimapViewportHeight) < 20
      ) {
        return `WebView reported a thin Relief minimap viewport frame (${payload.markers.topologyMinimapViewportFrameState || "unknown"}, ${payload.markers.topologyMinimapViewportWidth ?? "unknown"}x${payload.markers.topologyMinimapViewportHeight ?? "unknown"})`;
      }
    }
    if (
      payload.markers.topologyRelationLensVisible === true &&
      payload.markers.topologyRelationLensPluralMismatch === true
    ) {
      return `WebView reported malformed Relief relation lens copy (${payload.markers.topologyRelationLensText ?? "unknown text"})`;
    }
    const overviewRelationQualityText =
      typeof payload.markers.topologyOverviewRelationQualityText === "string"
        ? payload.markers.topologyOverviewRelationQualityText.trim()
        : "";
    const selectedRelationQualityText =
      typeof payload.markers.topologySelectedRelationQualityLensText === "string"
        ? payload.markers.topologySelectedRelationQualityLensText.trim()
        : "";
    const legacyRelationQualityText =
      typeof payload.markers.topologyRelationQualityLensText === "string"
        ? payload.markers.topologyRelationQualityLensText.trim()
        : "";
    const relationQualityText =
      overviewRelationQualityText || selectedRelationQualityText || legacyRelationQualityText;
    const isReadableRelationQualityText = (text) =>
      /(strong|clear|강한|분명함)[^\d]+\d+/i.test(text) &&
      /(supported|근거)[^\d]+\d+/i.test(text) &&
      /(weak|thin|약한|얇은)[^\d]+\d+/i.test(text) &&
      /(review|check|검토|확인)[^\d]+\d+/i.test(text) &&
      /[·,:]/.test(text);
    const relationQualityTextReadable = isReadableRelationQualityText(relationQualityText);
    const hasOverviewRelationQuality =
      overviewRelationQualityText.length > 0 ||
      (typeof payload.bodyText === "string" &&
        /relation quality|관계 품질/i.test(payload.bodyText) &&
        /(strong|supported|weak|review|강함|지원|약함|검토)/i.test(payload.bodyText));
    if (
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      topologyAnalysisMode !== "focus" &&
      !topologyGraphModeActive && !topologyMapCanvasActive &&
      !focusSelectedNodeRoute &&
      !blockingComposerOpen &&
      payload.markers.topologyRelationQualityLensVisible !== true &&
      !hasOverviewRelationQuality
    ) {
      return "WebView did not report the Relief relation quality marker";
    }
    if (
      payload.markers.topologyRelationQualityLensVisible === true &&
      relationQualityText.length === 0
    ) {
      return "WebView reported empty Relief relation quality lens text";
    }
    if (
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      topologyAnalysisMode !== "focus" &&
      !topologyGraphModeActive && !topologyMapCanvasActive &&
      !focusSelectedNodeRoute &&
      !blockingComposerOpen &&
      Object.hasOwn(payload.markers, "topologyOverviewRelationQualityText") &&
      overviewRelationQualityText.length === 0
    ) {
      return "WebView reported empty Relief overview relation quality text";
    }
    if (
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      topologyAnalysisMode !== "focus" &&
      Object.hasOwn(payload.markers, "topologyOverviewRelationQualityText") &&
      overviewRelationQualityText.length > 0 &&
      !isReadableRelationQualityText(overviewRelationQualityText)
    ) {
      return `WebView reported unparseable Relief overview relation quality text (${overviewRelationQualityText})`;
    }
    if (
      Object.hasOwn(payload.markers, "topologySelectedRelationQualityLensText") &&
      selectedRelationQualityText.length > 0 &&
      !isReadableRelationQualityText(selectedRelationQualityText)
    ) {
      return `WebView reported unparseable Relief selected relation quality lens text (${selectedRelationQualityText})`;
    }
    if (
      payload.markers.topologyRelationQualityLensVisible === true &&
      !relationQualityTextReadable
    ) {
      return `WebView reported unparseable Relief relation quality lens text (${relationQualityText})`;
    }
    const overviewAgentReadinessText =
      typeof payload.markers.topologyOverviewAgentReadinessText === "string"
        ? payload.markers.topologyOverviewAgentReadinessText.trim()
        : "";
    const overviewAgentReadinessReadable =
      /(handoff-ready|ready|handoff 가능|전달 가능|인계 가능)[^\d]+\d+/i.test(
        overviewAgentReadinessText,
      ) &&
      /(preflight|check first|check|사전 점검)[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /(needs review|review|검토)[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /[·,:]/.test(overviewAgentReadinessText);
    const requireOverviewAgentReadiness =
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      topologyAnalysisMode !== "focus" &&
      !topologyGraphModeActive && !topologyMapCanvasActive &&
      !focusSelectedNodeRoute &&
      !blockingComposerOpen;
    if (
      requireOverviewAgentReadiness &&
      (typeof payload.markers.topologyOverviewAgentReadinessText !== "string" ||
        !overviewAgentReadinessReadable)
    ) {
      return `WebView did not report the Relief overview agent readiness marker (${payload.markers.topologyOverviewAgentReadinessText ?? "unknown text"})`;
    }
    const overviewAgentReadinessSegments = Array.isArray(
      payload.markers.topologyOverviewAgentReadinessMeterSegments,
    )
      ? payload.markers.topologyOverviewAgentReadinessMeterSegments
      : [];
    if (
      requireOverviewAgentReadiness &&
      !["ready", "preflight", "review"].every((kind) =>
        overviewAgentReadinessSegments.some(
          (segment) =>
            segment &&
            segment.kind === kind &&
            typeof segment.count === "string" &&
            segment.count.trim().length > 0,
        ),
      )
    ) {
      return `WebView did not report the Relief overview agent readiness meter marker (${JSON.stringify(payload.markers.topologyOverviewAgentReadinessMeterSegments ?? null)})`;
    }
    const selectedNodeInspectorWithoutSupport =
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyAnalysisPanelVisible !== true &&
      payload.markers.topologyCommandChromeState === "selected-node-inspector" &&
      payload.markers.topologyAnalysisPanelSelectedContext !== true &&
      payload.markers.topologyAnalysisPanelSelectedFocusRail !== true;
    if (
      // v2 크롬은 분석 패널(W3)을 INDEX 로 대체했다 — 은퇴 표면 게이트 제외.
      !topologyMapV2Active &&
      Object.hasOwn(payload.markers, "topologyAnalysisPanelVisible") &&
      !selectedRelationContextVisible &&
      payload.markers.topologyCreateNodeOpen !== true &&
      !selectedNodeInspectorWithoutSupport
    ) {
      if (payload.markers.topologyAnalysisPanelVisible !== true) {
        return "WebView did not report a visible Relief analysis panel";
      }
      const usesOverviewWidth =
        payload.markers.topologyAnalysisPanelMode === "overview" ||
        payload.markers.topologyAnalysisPanelWidthPolicy === "overview-support";
      const isOverviewAnalysis =
        payload.markers.topologyAnalysisPanelMode === "overview";
      const usesPathRailWidth =
        topologyAnalysisMode === "path" ||
        payload.markers.topologyAnalysisPanelWidthContract ===
          "path-support-rail-max-360-phone-utility-reserve";
      const usesFocusSupportRail =
        topologyAnalysisMode === "focus" &&
        payload.markers.topologyAnalysisPanelWidthContract ===
          "focus-support-rail-max-300-map-centered";
      const analysisPanelMinWidth = usesPathRailWidth
        ? 320
        : topologyGraphModeActive
          ? 260
        : usesFocusSupportRail || focusSelectedNodeRoute
          ? 240
          : 360;
      if (
        !usesOverviewWidth &&
        !(Number(payload.markers.topologyAnalysisPanelWidth) >= analysisPanelMinWidth)
      ) {
        return `WebView reported a cramped Relief analysis panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
      }
      const analysisPanelMinHeight =
        topologyAnalysisMode === "path"
          ? 120
          : topologyGraphModeActive
            ? 100
          : usesFocusSupportRail
            ? 220
          : focusSelectedNodeRoute
            ? 260
            : 320;
      if (!(Number(payload.markers.topologyAnalysisPanelHeight) >= analysisPanelMinHeight)) {
        return `WebView reported a cramped Relief analysis panel height (${payload.markers.topologyAnalysisPanelHeight ?? "unknown"})`;
      }
      if (topologyAnalysisMode === "health") {
        if (
          payload.markers.topologyHealthRepairLaneContract !==
          "target-to-builder-to-sync"
        ) {
          return `WebView Relief health repair lane contract was ${payload.markers.topologyHealthRepairLaneContract || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairOrderContract !== "inspect-repair-sync"
        ) {
          return `WebView Relief health repair order contract was ${payload.markers.topologyHealthRepairOrderContract || "missing"}`;
        }
        if (
          !String(payload.markers.topologyHealthRepairTargetSlug || "").trim() ||
          !/^(stale|orphan|promotion)$/.test(
            String(payload.markers.topologyHealthRepairTargetKind || ""),
          )
        ) {
          return `WebView Relief health repair target was incomplete (${payload.markers.topologyHealthRepairTargetKind || "missing"} ${payload.markers.topologyHealthRepairTargetSlug || "missing"})`;
        }
        if (
          payload.markers.topologyHealthRepairMapTargetContract !==
          "analysis-panel-target-to-audit-overlay"
        ) {
          return `WebView Relief health map target contract was ${payload.markers.topologyHealthRepairMapTargetContract || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairMapTargetSlug !==
            payload.markers.topologyHealthRepairTargetSlug ||
          payload.markers.topologyHealthRepairMapTargetKind !==
            payload.markers.topologyHealthRepairTargetKind
        ) {
          return `WebView Relief health map target did not match the panel target (${payload.markers.topologyHealthRepairMapTargetKind || "missing"} ${payload.markers.topologyHealthRepairMapTargetSlug || "missing"})`;
        }
        if (
          payload.markers.topologyHealthRepairAuditTargetContract !==
          "panel-target-card-highlight"
        ) {
          return `WebView Relief health audit target card contract was ${payload.markers.topologyHealthRepairAuditTargetContract || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairAuditTargetSlug !==
            payload.markers.topologyHealthRepairTargetSlug ||
          payload.markers.topologyHealthRepairAuditTargetKind !==
            payload.markers.topologyHealthRepairTargetKind
        ) {
          return `WebView Relief health audit card did not match the panel target (${payload.markers.topologyHealthRepairAuditTargetKind || "missing"} ${payload.markers.topologyHealthRepairAuditTargetSlug || "missing"})`;
        }
        if (
          payload.markers.topologyHealthRepairAuditTargetBadgeContract !==
          "inline-card-state-label"
        ) {
          return `WebView Relief health audit target badge contract was ${payload.markers.topologyHealthRepairAuditTargetBadgeContract || "missing"}`;
        }
        if (
          !String(payload.markers.topologyHealthRepairAuditTargetBadge || "").trim()
        ) {
          return "WebView Relief health audit target badge text was missing";
        }
        if (payload.markers.topologyHealthRepairPrimaryAction !== "builder") {
          return `WebView Relief health repair primary action was ${payload.markers.topologyHealthRepairPrimaryAction || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairActionOrder !==
          "builder-mcp-ontology"
        ) {
          return `WebView Relief health repair action order was ${payload.markers.topologyHealthRepairActionOrder || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairVisualContract !==
          "builder-primary-secondary-compact"
        ) {
          return `WebView Relief health repair visual contract was ${payload.markers.topologyHealthRepairVisualContract || "missing"}`;
        }
        if (payload.markers.topologyHealthRepairFirstActionPrimary !== "builder") {
          return `WebView Relief health repair first action was ${payload.markers.topologyHealthRepairFirstActionPrimary || "missing"}`;
        }
        if (payload.markers.topologyHealthRepairFirstActionTier !== "primary") {
          return `WebView Relief health repair first action tier was ${payload.markers.topologyHealthRepairFirstActionTier || "missing"}`;
        }
        if (!(Number(payload.markers.topologyHealthRepairFirstActionWidth) >= 96)) {
          return `WebView Relief health repair first action was too narrow (${payload.markers.topologyHealthRepairFirstActionWidth || "missing"})`;
        }
        if (payload.markers.topologyHealthRepairSyncGate !== "post-change") {
          return `WebView Relief health repair sync gate was ${payload.markers.topologyHealthRepairSyncGate || "missing"}`;
        }
        if (payload.markers.topologyAuditLegendVisible !== true) {
          return "WebView Relief health audit legend was not visible as support chrome";
        }
        if (
          payload.markers.topologyAuditLegendContract !==
          "health-support-bottom-left-clear-of-minimap"
        ) {
          return `WebView Relief health audit legend contract was ${payload.markers.topologyAuditLegendContract || "missing"}`;
        }
        if (payload.markers.topologyAuditLegendAttentionRole !== "support") {
          return `WebView Relief health audit legend attention role was ${payload.markers.topologyAuditLegendAttentionRole || "missing"}`;
        }
        if (payload.markers.topologyAuditLegendDensity !== "compact") {
          return `WebView Relief health audit legend density was ${payload.markers.topologyAuditLegendDensity || "missing"}`;
        }
        if (
          payload.markers.topologyAuditLegendOverlapsAnalysisPanel === true ||
          payload.markers.topologyAuditLegendOverlapsMinimap === true
        ) {
          return "WebView Relief health audit legend overlapped the analysis panel or minimap";
        }
      }
      if (payload.markers.topologyCreateNodeOpen !== true && usesOverviewWidth) {
        if (payload.markers.topologyAnalysisPanelWidthPolicy !== "overview-support") {
          return `WebView reported malformed Relief overview panel width policy (${payload.markers.topologyAnalysisPanelWidthPolicy ?? "unknown"})`;
        }
        if (payload.markers.topologyAnalysisPanelWidthBand !== "header-aligned") {
          return `WebView reported malformed Relief overview panel width band (${payload.markers.topologyAnalysisPanelWidthBand ?? "unknown"})`;
        }
        if (isOverviewAnalysis) {
          if (payload.markers.topologyAnalysisPanelAttentionRole !== "support") {
            return `WebView reported malformed Relief overview panel attention role (${payload.markers.topologyAnalysisPanelAttentionRole ?? "unknown"})`;
          }
          if (payload.markers.topologyAnalysisPanelWidthContract !== "overview-support-max-360-phone-utility-reserve") {
            return `WebView reported malformed Relief overview panel width contract (${payload.markers.topologyAnalysisPanelWidthContract ?? "unknown"})`;
          }
          if (payload.markers.topologyAnalysisPanelWidthTarget !== "overview-14-inch-compact") {
            return `WebView reported malformed Relief overview panel width target (${payload.markers.topologyAnalysisPanelWidthTarget ?? "unknown"})`;
          }
          if (payload.markers.topologyAnalysisPanelWidthToken !== "--topology-panel-overview-responsive-width") {
            return `WebView reported malformed Relief overview panel width token (${payload.markers.topologyAnalysisPanelWidthToken ?? "unknown"})`;
          }
          if (
            payload.markers.topologyAnalysisPanelPhoneUtilityReserveToken !==
            "--topology-panel-phone-utility-rail-reserve"
          ) {
            return `WebView reported malformed Relief overview panel phone utility reserve token (${payload.markers.topologyAnalysisPanelPhoneUtilityReserveToken ?? "unknown"})`;
          }
          if (
            payload.markers.topologyAnalysisPanelLayerContract !==
              "read-surface-above-map-cards" ||
            payload.markers.topologyAnalysisPanelZIndexToken !==
              "--topology-panel-read-layer-z-index" ||
            Number(payload.markers.topologyAnalysisPanelZIndexComputed || 0) < 30
          ) {
            return `WebView reported malformed Relief overview panel layer contract (${payload.markers.topologyAnalysisPanelLayerContract || "missing"} · ${payload.markers.topologyAnalysisPanelZIndexToken || "missing"} · ${payload.markers.topologyAnalysisPanelZIndexComputed || "missing"})`;
          }
          const overviewPanelMinWidth = 320;
          if (!(Number(payload.markers.topologyAnalysisPanelWidth) >= overviewPanelMinWidth)) {
            return `WebView reported a cramped Relief overview panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
          }
          const overviewPanelMaxWidth = Number(payload.width) >= 1400 ? 370 : 560;
          if (!(Number(payload.markers.topologyAnalysisPanelWidth) <= overviewPanelMaxWidth)) {
            return `WebView reported an oversized Relief overview panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
          }
          if (
            Number(payload.width) >= 1400 &&
            Number(payload.width) <= 1600 &&
            payload.markers.topologyTopLeftChromeGroupVisible === true
          ) {
            const chromeRight = Number(payload.markers.topologyTopLeftChromeGroupRight || 0);
            const panelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
            const chromeLeft = Number(payload.markers.topologyTopLeftChromeGroupLeft || 0);
            const panelLeft = Number(payload.markers.topologyAnalysisPanelLeft || 0);
            if (
              [chromeRight, panelRight, chromeLeft, panelLeft].every(Number.isFinite) &&
              chromeRight > chromeLeft &&
              panelRight > panelLeft
            ) {
              const rightDelta = panelRight - chromeRight;
              const leftDelta = Math.abs(panelLeft - chromeLeft);
              if (rightDelta > 32 || leftDelta > 16) {
                return `WebView Relief overview panel drifted from the top-left Relief chrome group (${panelLeft}, ${panelRight} vs ${chromeLeft}, ${chromeRight})`;
              }
            }
          }
        }
      }
      if (payload.markers.topologyCreateNodeOpen !== true && isOverviewAnalysis) {
        if (
          !["scan-facts", "summary-first"].includes(
            payload.markers.topologyOverviewRelationQualityDensity,
          )
        ) {
          return `WebView reported malformed Relief overview relation quality density (${payload.markers.topologyOverviewRelationQualityDensity ?? "unknown"})`;
        }
        if (!(Number(payload.markers.topologyAnalysisPanelHeight) >= 455)) {
          return `WebView reported a cramped Relief overview panel height (${payload.markers.topologyAnalysisPanelHeight ?? "unknown"})`;
        }
        if (payload.markers.topologyAnalysisPanelOverflowY !== "hidden") {
          return `WebView reported a scroll-prone Relief overview panel (${payload.markers.topologyAnalysisPanelOverflowY ?? "unknown"} overflow)`;
        }
        const overflowDelta =
          Number(payload.markers.topologyAnalysisPanelScrollHeight) -
          Number(payload.markers.topologyAnalysisPanelClientHeight);
        if (Number.isFinite(overflowDelta) && overflowDelta > 2) {
          return `WebView reported clipped Relief overview panel content (${overflowDelta}px overflow)`;
        }
        const overviewCopyMinWidth =
          Number(payload.width) >= 2400 ? 312 : Number(payload.width) < 1600 ? 280 : 320;
        if (!(Number(payload.markers.topologyOverviewPrimaryCopyWidth) >= overviewCopyMinWidth)) {
          return `WebView reported a cramped Relief overview copy action (${payload.markers.topologyOverviewPrimaryCopyWidth ?? "unknown"}px)`;
        }
        if (!(Number(payload.markers.topologyOverviewPrimaryCopyHeight) >= 34)) {
          return `WebView reported a cramped Relief overview copy action hit target (${payload.markers.topologyOverviewPrimaryCopyHeight ?? "unknown"}px)`;
        }
      }
    }
    if (requireTopologyDrag) {
      const focusDeltaVector = topologyDragDeltaVector(payload.markers.topologyDragFocusDelta);
      const stationaryFixedGeographyDrag =
        payload.markers.topologyDragFocusMoved !== true &&
        payload.markers.topologyDragReason === "done" &&
        focusDeltaVector !== null &&
        focusDeltaVector.magnitude <= 2 &&
        payload.markers.topologyDragCompanionVisible === true &&
        payload.markers.topologyDragCompanionAligned === true &&
        payload.markers.topologyDragRelationLabelClicked === true;
      if (stationaryFixedGeographyDrag || selectedFocusStationaryContextProof) {
        return null;
      }
      if (payload.markers.topologyDragFocusMoved !== true) {
        return `WebView Relief drag did not move the focus card (${payload.markers.topologyDragFocusDelta ?? "unknown delta"})`;
      }
      if (payload.markers.topologyDragCompanionVisible !== true) {
        return "WebView Relief drag companion card did not remain visible after release";
      }
      if (payload.markers.topologyDragCompanionAligned !== true) {
        const focusDelta = JSON.stringify(payload.markers.topologyDragFocusDelta ?? "unknown focus delta");
        const companionDelta = JSON.stringify(payload.markers.topologyDragCompanionDelta ?? "unknown companion delta");
        return `WebView Relief drag companion did not travel with the focus card (focus ${focusDelta}, companion ${companionDelta})`;
      }
      const companionDeltaVector = topologyDragDeltaVector(
        payload.markers.topologyDragCompanionDelta,
      );
      if (focusDeltaVector && companionDeltaVector) {
        if (
          focusDeltaVector.magnitude < TOPOLOGY_DRAG_FOCUS_MIN_DELTA_PX ||
          focusDeltaVector.magnitude > TOPOLOGY_DRAG_FOCUS_MAX_REASONABLE_DELTA_PX
        ) {
          return `WebView Relief drag moved the focus card by an implausible distance (${Math.round(focusDeltaVector.magnitude)}px)`;
        }
        const dragVectorDelta = Math.hypot(
          focusDeltaVector.x - companionDeltaVector.x,
          focusDeltaVector.y - companionDeltaVector.y,
        );
        const dragVectorTolerance = topologyDragCompanionVectorTolerance(payload.markers);
        if (dragVectorDelta > dragVectorTolerance) {
          return `WebView Relief drag companion vector drifted from the focus card (${Math.round(dragVectorDelta)}px)`;
        }
      }
      if (payload.markers.topologyDragRelationLabelClicked !== true) {
        return "WebView did not perform the Relief relation label selection during drag verification";
      }
      if (payload.markers.topologyDragConnectorDrawable !== true) {
        return "WebView Relief drag did not report a drawable connector during drag verification";
      }
      if (!(Number(payload.markers.topologyDragClusterSize) >= 2)) {
        return `WebView Relief drag did not keep a linked card cluster (${payload.markers.topologyDragClusterSize ?? "missing"} active members)`;
      }
      if (payload.markers.topologyDragCollisionPolicy !== "release-settle") {
        return `WebView Relief drag collision policy was ${payload.markers.topologyDragCollisionPolicy || "missing"}`;
      }
      if (
        payload.markers.topologyDragPhysicsSyncContract !==
        "skeleton-card-drag-pins-worker-layout-group"
      ) {
        return `WebView Relief drag physics sync contract was ${payload.markers.topologyDragPhysicsSyncContract || "missing"}`;
      }
      if (
        payload.markers.topologyDragPhysicsReleasePolicy !==
        "commit-drop-position-no-force-release"
      ) {
        return `WebView Relief drag physics release policy was ${payload.markers.topologyDragPhysicsReleasePolicy || "missing"}`;
      }
      if (payload.markers.topologyDragPhysicsSyncActiveDuring !== true) {
        return "WebView Relief drag physics sync was not active during drag verification";
      }
      if (payload.markers.topologyLayoutWorkerPositionFrameSkipPolicy !== "skip-only-unsynced-skeleton-card-drag") {
        return `WebView Relief worker frame skip policy was ${payload.markers.topologyLayoutWorkerPositionFrameSkipPolicy || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragWorkerAppliedFrameChangeCount || 0) >= 1)) {
        return `WebView Relief drag did not update worker layout frames during drag (${payload.markers.topologyDragWorkerAppliedFrameChangeCount ?? "missing"}, delta ${payload.markers.topologyDragWorkerAppliedFrameDelta ?? "missing"})`;
      }
      if (
        payload.markers.topologyDragRelationLabelVisibilityContract !==
        "active-drag-connector-labels-remain-readable"
      ) {
        return `WebView Relief drag relation label visibility contract was ${payload.markers.topologyDragRelationLabelVisibilityContract || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragRelationLabelExpectedCount || 0) >= 1)) {
        return `WebView Relief drag did not expose relation labels to verify (${payload.markers.topologyDragRelationLabelExpectedCount ?? "missing"} expected)`;
      }
      if (!(Number(payload.markers.topologyDragRelationLabelVisibleCount || 0) >= 1)) {
        return `WebView Relief drag did not keep relation labels visible (${payload.markers.topologyDragRelationLabelVisibleCount ?? "missing"} visible)`;
      }
      if (payload.markers.topologyDragRelationLabelVisibleDuringDrag !== true) {
        return "WebView Relief drag relation label was not visibly attached during drag";
      }
      const dragCompactRequired =
        payload.markers.topologyZoomLensActive === true &&
        payload.markers.topologyZoomLensCardCompactionActive === true;
      if (dragCompactRequired) {
        if (
          payload.markers.topologyDragRelationLabelCompactContract !==
          "zoomed-drag-compacts-repeated-relation-labels"
        ) {
          return `WebView Relief zoomed drag compact relation label contract was ${payload.markers.topologyDragRelationLabelCompactContract || "missing"}`;
        }
        if (!(Number(payload.markers.topologyDragRelationLabelCompactCount || 0) >= 1)) {
          return `WebView Relief zoomed drag did not compact relation labels (${payload.markers.topologyDragRelationLabelCompactCount ?? "missing"} compact)`;
        }
        if (payload.markers.topologyDragRelationLabelPresentation !== "compact-glyph") {
          return `WebView Relief zoomed drag relation label presentation was ${payload.markers.topologyDragRelationLabelPresentation || "missing"}`;
        }
        if (payload.markers.topologyDragRelationLabelCompact !== true) {
          return "WebView Relief zoomed drag relation label did not expose compact=true";
        }
        if (
          payload.markers.topologyDragRelationLabelCompactItemContract !==
          "zoomed-drag-keeps-type-fact-as-compact-glyph"
        ) {
          return `WebView Relief zoomed drag compact label item contract was ${payload.markers.topologyDragRelationLabelCompactItemContract || "missing"}`;
        }
        if (!String(payload.markers.topologyDragRelationLabelReadableType || "").trim()) {
          return "WebView Relief zoomed drag compact label did not preserve a readable relation type";
        }
        const compactBadgeWidth = Number(payload.markers.topologyDragRelationLabelBadgeWidth || 0);
        const compactBadgeHeight = Number(payload.markers.topologyDragRelationLabelBadgeHeight || 0);
        const compactBadgeRadius = Number(payload.markers.topologyDragRelationLabelBadgeRadius || 0);
        if (!(compactBadgeWidth > 0 && compactBadgeWidth <= 44)) {
          return `WebView Relief zoomed drag compact label badge width was ${payload.markers.topologyDragRelationLabelBadgeWidth ?? "missing"}`;
        }
        if (!(compactBadgeHeight > 0 && compactBadgeHeight <= 24)) {
          return `WebView Relief zoomed drag compact label badge height was ${payload.markers.topologyDragRelationLabelBadgeHeight ?? "missing"}`;
        }
        if (!(compactBadgeRadius >= 8)) {
          return `WebView Relief zoomed drag compact label badge radius was ${payload.markers.topologyDragRelationLabelBadgeRadius ?? "missing"}`;
        }
      }
      if (
        payload.markers.topologyDragReactiveContextContract !==
        "active-drag-shows-worker-moving-surrounding-context"
      ) {
        return `WebView Relief drag reactive context contract was ${payload.markers.topologyDragReactiveContextContract || "missing"}`;
      }
      if (
        payload.markers.topologyDragInteractionCueContract !==
        "root-card-shows-linked-count-during-drag"
      ) {
        return `WebView Relief drag interaction cue contract was ${payload.markers.topologyDragInteractionCueContract || "missing"}`;
      }
      if (payload.markers.topologyDragInteractionCueVisible !== true) {
        return "WebView Relief drag interaction cue was not visible";
      }
      if (!(Number(payload.markers.topologyDragInteractionCueLinkedCardCount || 0) >= 1)) {
        return `WebView Relief drag interaction cue linked card count was ${payload.markers.topologyDragInteractionCueLinkedCardCount ?? "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragInteractionCueRelationLinkCount || 0) >= 1)) {
        return `WebView Relief drag interaction cue relation link count was ${payload.markers.topologyDragInteractionCueRelationLinkCount ?? "missing"}`;
      }
      if (!String(payload.markers.topologyDragInteractionCueText || "").trim()) {
        return "WebView Relief drag interaction cue text was missing";
      }
      if (payload.markers.topologyDragReactiveContextPolicy !== "boost-dimmed-worker-response") {
        return `WebView Relief drag reactive context policy was ${payload.markers.topologyDragReactiveContextPolicy || "missing"}`;
      }
      if (payload.markers.topologyDragReactiveContextOpacityToken !== "--topology-card-drag-reactive-context-opacity") {
        return `WebView Relief drag reactive context opacity token was ${payload.markers.topologyDragReactiveContextOpacityToken || "missing"}`;
      }
      if (
        payload.markers.topologyDragReactiveContextVisualContract !==
        "reactive-context-uses-border-ring"
      ) {
        return `WebView Relief drag reactive context visual contract was ${payload.markers.topologyDragReactiveContextVisualContract || "missing"}`;
      }
      if (payload.markers.topologyDragReactiveContextVisualToken !== "--topology-card-border-selected") {
        return `WebView Relief drag reactive context visual token was ${payload.markers.topologyDragReactiveContextVisualToken || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragReactiveContextOpacity || 0) >= 0.4)) {
        return `WebView Relief drag reactive context opacity was ${payload.markers.topologyDragReactiveContextOpacity ?? "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragReactiveContextVisibleCount || 0) >= 1)) {
        return `WebView Relief drag did not keep surrounding context visibly reactive (${payload.markers.topologyDragReactiveContextVisibleCount ?? "missing"} visible)`;
      }
      if (
        payload.markers.topologyDragReactiveMotionContract !==
        "active-drag-gives-surrounding-context-bounded-parallax"
      ) {
        return `WebView Relief drag reactive motion contract was ${payload.markers.topologyDragReactiveMotionContract || "missing"}`;
      }
      if (payload.markers.topologyDragReactiveMotionPolicy !== "bounded-parallax-nudge") {
        return `WebView Relief drag reactive motion policy was ${payload.markers.topologyDragReactiveMotionPolicy || "missing"}`;
      }
      if (
        payload.markers.topologyDragReactiveMotionLinkedPolicy !==
        "direct-neighbor-readable-follow"
      ) {
        return `WebView Relief drag linked reactive motion policy was ${payload.markers.topologyDragReactiveMotionLinkedPolicy || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragReactiveMotionVisibleCount || 0) >= 1)) {
        return `WebView Relief drag did not move surrounding context reactively (${payload.markers.topologyDragReactiveMotionVisibleCount ?? "missing"} moved)`;
      }
      if (!(Number(payload.markers.topologyDragReactiveAmbientMotionVisibleCount || 0) >= 1)) {
        return `WebView Relief drag did not move ambient surrounding context reactively (${payload.markers.topologyDragReactiveAmbientMotionVisibleCount ?? "missing"} moved)`;
      }
      if (!(Number(payload.markers.topologyDragReactiveLinkedMotionVisibleCount || 0) >= 1)) {
        return `WebView Relief drag did not move graph-linked surrounding context reactively (${payload.markers.topologyDragReactiveLinkedMotionVisibleCount ?? "missing"} moved)`;
      }
      if (
        payload.markers.topologyDragTensionConnectorContract !==
        "active-drag-draws-links-to-reactive-neighbors"
      ) {
        return `WebView Relief drag tension connector contract was ${payload.markers.topologyDragTensionConnectorContract || "missing"}`;
      }
      if (payload.markers.topologyDragTensionConnectorPolicy !== "cluster-to-linked-context-only") {
        return `WebView Relief drag tension connector policy was ${payload.markers.topologyDragTensionConnectorPolicy || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragTensionConnectorExpectedCount || 0) >= 1)) {
        return `WebView Relief drag did not expose tension connectors to verify (${payload.markers.topologyDragTensionConnectorExpectedCount ?? "missing"} expected)`;
      }
      if (!(Number(payload.markers.topologyDragTensionConnectorVisibleCount || 0) >= 1)) {
        return `WebView Relief drag did not draw graph-linked tension connectors (${payload.markers.topologyDragTensionConnectorVisibleCount ?? "missing"} visible)`;
      }
      if (!(Number(payload.markers.topologyDragTensionConnectorActiveOpacity || 0) >= 0.85)) {
        return `WebView Relief drag tension connector active opacity was ${payload.markers.topologyDragTensionConnectorActiveOpacity ?? "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragTensionConnectorActiveStrokeWidth || 0) >= 2)) {
        return `WebView Relief drag tension connector active stroke width was ${payload.markers.topologyDragTensionConnectorActiveStrokeWidth ?? "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragReactiveMotionMaxObservedOffsetPx || 0) > 0)) {
        return `WebView Relief drag reactive motion offset was ${payload.markers.topologyDragReactiveMotionMaxObservedOffsetPx ?? "missing"}`;
      }
      const dragReactiveMotionMaxOffsetPx = Number(
        payload.markers.topologyDragReactiveMotionMaxOffsetPx || 0,
      );
      if (!(dragReactiveMotionMaxOffsetPx >= 1)) {
        return `WebView Relief drag reactive motion max offset was ${payload.markers.topologyDragReactiveMotionMaxOffsetPx ?? "missing"}`;
      }
      if (dragReactiveMotionMaxOffsetPx < 36) {
        return `WebView Relief drag reactive motion max offset did not expose readable linked follow (${payload.markers.topologyDragReactiveMotionMaxOffsetPx ?? "missing"})`;
      }
      if (!(Number(payload.markers.topologyDragReactiveMotionBaseMaxOffsetPx || 0) >= 24)) {
        return `WebView Relief drag ambient reactive motion max offset was ${payload.markers.topologyDragReactiveMotionBaseMaxOffsetPx ?? "missing"}`;
      }
      if (
        !(
          Number(payload.markers.topologyDragReactiveMotionMaxObservedOffsetPx || 0) <=
          dragReactiveMotionMaxOffsetPx
        )
      ) {
        return `WebView Relief drag reactive motion exceeded bounded offset (${payload.markers.topologyDragReactiveMotionMaxObservedOffsetPx})`;
      }
      if (payload.markers.topologyDragReactiveMotionMaxOffsetToken !== "--topology-card-drag-reactive-motion-max-offset") {
        return `WebView Relief drag reactive motion max offset token was ${payload.markers.topologyDragReactiveMotionMaxOffsetToken || "missing"}`;
      }
      if (payload.markers.topologyDragFrameCacheContract !== "pointer-move-reuses-drag-indexes") {
        return `WebView Relief drag frame cache contract was ${payload.markers.topologyDragFrameCacheContract || "missing"}`;
      }
      if (payload.markers.topologyDragDomIndexContract !== "drag-release-reuses-card-elements") {
        return `WebView Relief drag DOM index contract was ${payload.markers.topologyDragDomIndexContract || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragDomIndexSize || 0) >= 2)) {
        return `WebView Relief drag DOM index size was ${payload.markers.topologyDragDomIndexSize ?? "missing"}`;
      }
      if (
        payload.markers.topologyDragFrameCacheSnapshotCount === undefined ||
        !(Number(payload.markers.topologyDragFrameCacheSnapshotCount) >= 0)
      ) {
        return `WebView Relief drag frame cache snapshot count was ${payload.markers.topologyDragFrameCacheSnapshotCount ?? "missing"}`;
      }
      if (payload.markers.topologyDockDragSnapshotContract !== "single-pass-card-rect-read") {
        return `WebView Relief dock drag snapshot contract was ${payload.markers.topologyDockDragSnapshotContract || "missing"}`;
      }
      const connectorCacheError = validateTopologyConnectorCacheMarkers(payload.markers);
      if (connectorCacheError) return connectorCacheError;
      if (payload.markers.topologyRelationLabelBlockerContract !== "reuse-visible-card-rects") {
        return `WebView Relief relation label blocker contract was ${payload.markers.topologyRelationLabelBlockerContract || "missing"}`;
      }
      if (
        payload.markers.topologySelectedBlockingSurfaceOverlapActive === true &&
        payload.markers.topologyVisibleCardSelectedSurfaceRectPolicy !==
          "live-rects-for-postprocess-overlap-safety"
      ) {
        return `WebView Relief selected-surface visible-card rect policy was ${payload.markers.topologyVisibleCardSelectedSurfaceRectPolicy || "missing"}`;
      }
      if (
        payload.markers.topologyRelationLabelBlockerSource &&
        !["visibility-pass", "fallback-visibility-pass"].includes(
          payload.markers.topologyRelationLabelBlockerSource,
        )
      ) {
        return `WebView Relief relation label blocker source was ${payload.markers.topologyRelationLabelBlockerSource}`;
      }
      if (payload.markers.topologyRelationLabelPhoneBottomReserveContract) {
        if (
          payload.markers.topologyRelationLabelPhoneBottomReserveContract !==
          "avoid-floating-controls"
        ) {
          return `WebView Relief relation label phone bottom reserve contract was ${payload.markers.topologyRelationLabelPhoneBottomReserveContract}`;
        }
        if (
          Number(payload.markers.topologyRelationLabelPhoneBottomReservePx || 0) < 96
        ) {
          return `WebView Relief relation label phone bottom reserve was too small (${payload.markers.topologyRelationLabelPhoneBottomReservePx || "missing"}px)`;
        }
        if (
          payload.markers.topologyRelationLabelPhoneBottomReserveToken !==
          "--topology-floating-control-phone-bottom"
        ) {
          return `WebView Relief relation label phone bottom reserve token was ${payload.markers.topologyRelationLabelPhoneBottomReserveToken || "missing"}`;
        }
      }
      if (payload.markers.topologyRelationLabelQueryContract !== "indexed-once") {
        return `WebView Relief relation label query contract was ${payload.markers.topologyRelationLabelQueryContract || "missing"}`;
      }
      if (!(Number(payload.markers.topologyRelationLabelQueryIndexCount || 0) >= 1)) {
        return `WebView Relief relation label query index count was ${payload.markers.topologyRelationLabelQueryIndexCount ?? "missing"}`;
      }
      if (payload.markers.topologyVisibilityCountContract !== "single-pass-unless-fallback") {
        return `WebView Relief visibility count contract was ${payload.markers.topologyVisibilityCountContract || "missing"}`;
      }
      if (payload.markers.topologyFixedSurfaceMeasureContract !== "single-pass-rect-read") {
        return `WebView Relief fixed surface measurement contract was ${payload.markers.topologyFixedSurfaceMeasureContract || "missing"}`;
      }
      if (
        payload.markers.topologyVisibilityCountSource &&
        ![
          "single-pass",
          "single-pass-final-recount",
          "fallback-recount",
          "fallback-recount-final-recount",
        ].includes(payload.markers.topologyVisibilityCountSource)
      ) {
        return `WebView Relief visibility count source was ${payload.markers.topologyVisibilityCountSource}`;
      }
      if (payload.markers.topologyDragSettleMotionContract !== "linked-cluster-drag-settle") {
        return `WebView Relief drag settle motion contract was ${payload.markers.topologyDragSettleMotionContract || "missing"}`;
      }
      if (
        payload.markers.topologyDragSettleFeedbackContract !==
        "released-dragged-cluster-keeps-settle-feedback"
      ) {
        return `WebView Relief drag settle feedback contract was ${payload.markers.topologyDragSettleFeedbackContract || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragSettledClusterSize || 0) >= 1)) {
        return `WebView Relief drag settled cluster size was ${payload.markers.topologyDragSettledClusterSize ?? "missing"}`;
      }
      if (!payload.markers.topologyDragSettledRoot) {
        return "WebView Relief drag settled root was missing";
      }
      if (Number(payload.markers.topologyDragSettleMotionDurationMs || 0) !== 720) {
        return `WebView Relief drag settle motion duration was ${payload.markers.topologyDragSettleMotionDurationMs || "missing"}ms`;
      }
      if (payload.markers.topologyDragSettleMotionEasing !== "ease-out") {
        return `WebView Relief drag settle motion easing was ${payload.markers.topologyDragSettleMotionEasing || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragConnectorCount) >= 1)) {
        return `WebView Relief drag did not report linked-cluster connectors (${payload.markers.topologyDragConnectorCount ?? "missing"} connectors)`;
      }
      if (!(Number(payload.markers.topologyDragConnectorClearance) >= 6)) {
        return `WebView Relief drag connector did not report a usable card clearance (${payload.markers.topologyDragConnectorClearance ?? "missing"})`;
      }
      if (blockingComposerOpen) {
        return null;
      }
      const zoomLensError = validateTopologyZoomLensMarkers(payload.markers);
      if (zoomLensError) return zoomLensError;
      const zoomedDragCompactProved =
        payload.markers.topologyZoomLensActive === true &&
        payload.markers.topologyZoomLensCardCompactionActive === true &&
        payload.markers.topologyDragRelationLabelCompactContract ===
          "zoomed-drag-compacts-repeated-relation-labels" &&
        Number(payload.markers.topologyDragRelationLabelCompactCount || 0) >= 1 &&
        payload.markers.topologyDragRelationLabelPresentation === "compact-glyph" &&
        payload.markers.topologyDragRelationLabelCompact === true &&
        payload.markers.topologyDragRelationLabelCompactItemContract ===
          "zoomed-drag-keeps-type-fact-as-compact-glyph" &&
        String(payload.markers.topologyDragRelationLabelReadableType || "").trim();
      if (!zoomedDragCompactProved) {
        if (payload.markers.topologySelectedRelationHaloVisible !== true) {
          return `WebView Relief relation label selection did not reveal a selected relation halo (${payload.markers.topologySelectedRelationVisibleHaloCount ?? 0}/${payload.markers.topologySelectedRelationHaloCount ?? 0} visible)`;
        }
        if (payload.markers.topologySelectedRelationLabelHitAligned !== true) {
          return "WebView Relief selected relation label hit target is not aligned with its visible badge";
        }
        if (
          Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) < 90 ||
          Number(payload.markers.topologySelectedRelationLabelHitHeight || 0) < 32
        ) {
          return `WebView Relief selected relation label hit target is too small (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}x${payload.markers.topologySelectedRelationLabelHitHeight ?? 0})`;
        }
        if (
          Number(payload.width || 0) >= 1400 &&
          Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) > 160
        ) {
          return `WebView Relief selected relation label stayed too wide for the active inspector (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}px)`;
        }
        if (payload.markers.topologySelectedRelationLabelDensity !== "focus-token") {
          return `WebView Relief selected relation label density was ${payload.markers.topologySelectedRelationLabelDensity || "missing"}`;
        }
        if (selectedRelationRouteRailTextLeak(payload)) {
          return "WebView Relief selected relation label leaked hidden route rail text into body text";
        }
        const relationLabelCompactError = validateSelectedRelationLabelCompactMarkers(
          payload.markers,
          payload.width,
        );
        if (relationLabelCompactError) return relationLabelCompactError;
      }
      const relationLabelFrameGeometryError = validateRelationLabelFrameGeometryMarkers(
        payload.markers,
      );
      if (relationLabelFrameGeometryError) return relationLabelFrameGeometryError;
      const selectedRelationIdentityError = validateSelectedRelationIdentityMarkers(
        payload.markers,
      );
      if (selectedRelationIdentityError) return selectedRelationIdentityError;
      if (
        typeof payload.markers.topologySelectedRelationLabelQuality !== "string" ||
        !/^(strong|supported|weak|review)$/.test(payload.markers.topologySelectedRelationLabelQuality)
      ) {
        return "WebView Relief selected relation label did not expose a relation quality marker";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelQualityChipText !== "string" ||
        payload.markers.topologySelectedRelationLabelQualityChipText.trim().length === 0
      ) {
        return "WebView Relief selected relation label did not expose a visible relation quality chip";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(payload.markers.topologySelectedRelationLabelEvidenceState)
      ) {
        return "WebView Relief selected relation label did not expose an evidence state marker";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologySelectedRelationLabelAgentGateKind,
        )
      ) {
        return "WebView Relief selected relation label did not expose an agent gate marker";
      }
      const expectedRelationLabelAction =
        payload.markers.topologySelectedRelationLabelAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (payload.markers.topologySelectedRelationLabelPrimaryCopyAction !== expectedRelationLabelAction) {
        return `WebView Relief selected relation label reported ${
          payload.markers.topologySelectedRelationLabelPrimaryCopyAction || "no"
        } primary action for ${payload.markers.topologySelectedRelationLabelAgentGateKind}`;
      }
      const expectedRelationLabelCliFallbackCommand =
        expectedRelationLabelAction === "relation_check"
          ? `ontology-atlas relation-check ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)} [vault]`
          : `ontology-atlas explain ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} [vault] --type ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)}`;
      const relationLabelCliFallbackCommand =
        typeof payload.markers.topologySelectedRelationLabelCliFallbackCommand === "string"
          ? payload.markers.topologySelectedRelationLabelCliFallbackCommand.trim()
          : "";
      if (relationLabelCliFallbackCommand !== expectedRelationLabelCliFallbackCommand) {
        return `WebView Relief selected relation label CLI fallback was ${relationLabelCliFallbackCommand || "missing"}, expected ${expectedRelationLabelCliFallbackCommand}`;
      }
      if (
        payload.markers.topologySelectedRelationLabelSource !==
          payload.markers.topologySelectedRelationCopyPayloadFrom ||
        payload.markers.topologySelectedRelationLabelTarget !==
          payload.markers.topologySelectedRelationCopyPayloadTo ||
        payload.markers.topologySelectedRelationLabelType !==
          payload.markers.topologySelectedRelationCopyPayloadType
      ) {
        return `WebView Relief selected relation label direct route markers mismatched the copy payload (${payload.markers.topologySelectedRelationLabelSource || "missing"} -> ${payload.markers.topologySelectedRelationLabelTarget || "missing"} / ${payload.markers.topologySelectedRelationLabelType || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelRoute !==
        `${payload.markers.topologySelectedRelationCopyPayloadFrom}>${payload.markers.topologySelectedRelationCopyPayloadTo}`
      ) {
        return `WebView Relief selected relation label route marker was ${payload.markers.topologySelectedRelationLabelRoute || "missing"}`;
      }
      if (!(Number(payload.markers.topologySelectedRelationLabelCount || 0) >= 1)) {
        return `WebView Relief selected relation label count marker was ${payload.markers.topologySelectedRelationLabelCount ?? "missing"}`;
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelAgentGateText !== "string" ||
        payload.markers.topologySelectedRelationLabelAgentGateText.trim().length === 0
      ) {
        return "WebView Relief selected relation label did not expose a visible agent gate chip";
      }
      const expectedRelationLabelGateText = expectedRelationLabelAgentGateText(
        payload.markers.topologySelectedRelationLabelAgentGateKind,
      );
      if (
        String(payload.markers.topologySelectedRelationLabelAgentGateText || "").trim() !==
        expectedRelationLabelGateText
      ) {
        return `WebView Relief selected relation label visible agent gate chip was ${
          payload.markers.topologySelectedRelationLabelAgentGateText || "missing"
        }, expected ${expectedRelationLabelGateText}`;
      }
      if (payload.markers.topologySelectedRelationLabelFactRoute !== "fact>evidence>gate>action") {
        return `WebView Relief selected relation label reported malformed fact route (${payload.markers.topologySelectedRelationLabelFactRoute || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteQuality !==
        payload.markers.topologySelectedRelationLabelQuality
      ) {
        return `WebView Relief selected relation label route quality mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteQuality || "missing"} vs ${payload.markers.topologySelectedRelationLabelQuality || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteEvidence !==
        payload.markers.topologySelectedRelationLabelEvidenceState
      ) {
        return `WebView Relief selected relation label route evidence mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteEvidence || "missing"} vs ${payload.markers.topologySelectedRelationLabelEvidenceState || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteGate !==
        payload.markers.topologySelectedRelationLabelAgentGateKind
      ) {
        return `WebView Relief selected relation label route gate mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteGate || "missing"} vs ${payload.markers.topologySelectedRelationLabelAgentGateKind || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteAction !==
        expectedRelationLabelAction
      ) {
        return `WebView Relief selected relation label route action reported ${payload.markers.topologySelectedRelationLabelFactRouteAction || "missing"} for ${payload.markers.topologySelectedRelationLabelAgentGateKind}`;
      }
      const labelFactRouteChips = Array.isArray(
        payload.markers.topologySelectedRelationLabelFactRouteChips,
      )
        ? payload.markers.topologySelectedRelationLabelFactRouteChips
        : [];
      const labelFactRouteKinds = labelFactRouteChips.map((chip) => chip?.kind).join(">");
      if (labelFactRouteKinds !== "fact>evidence>gate>action") {
        return `WebView Relief selected relation label fact route chips were malformed (${labelFactRouteKinds || "missing"})`;
      }
      const labelFactRouteGate = labelFactRouteChips.find((chip) => chip?.kind === "gate");
      if (
        !labelFactRouteGate ||
        String(labelFactRouteGate.text || "").trim() !==
          String(payload.markers.topologySelectedRelationLabelAgentGateText || "").trim()
      ) {
        return "WebView Relief selected relation label fact route did not expose the agent gate chip";
      }
      if (
        payload.markers.topologyRelationLabelHandoffContract ||
        payload.markers.topologySelectedRelationLabelHandoffState
      ) {
        if (
          payload.markers.topologyRelationLabelHandoffContract !==
          "label-level-mcp-cli-fallback"
        ) {
          return `WebView Relief selected relation label handoff contract was ${payload.markers.topologyRelationLabelHandoffContract || "missing"}`;
        }
        if (payload.markers.topologySelectedRelationLabelHandoffState !== "ready") {
          return `WebView Relief selected relation label handoff state was ${payload.markers.topologySelectedRelationLabelHandoffState || "missing"}`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffGate !==
          payload.markers.topologySelectedRelationLabelAgentGateKind
        ) {
          return `WebView Relief selected relation label handoff gate mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffGate || "missing"} vs ${payload.markers.topologySelectedRelationLabelAgentGateKind || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffPrimaryAction !==
          expectedRelationLabelAction
        ) {
          return `WebView Relief selected relation label handoff action mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffPrimaryAction || "missing"} vs ${expectedRelationLabelAction})`;
        }
        if (
          String(payload.markers.topologySelectedRelationLabelHandoffCliFallbackCommand || "").trim() !==
          relationLabelCliFallbackCommand
        ) {
          return `WebView Relief selected relation label handoff CLI fallback mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffCliFallbackCommand || "missing"} vs ${relationLabelCliFallbackCommand || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffFactRoute !==
          payload.markers.topologySelectedRelationLabelFactRoute
        ) {
          return `WebView Relief selected relation label handoff fact route mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffFactRoute || "missing"} vs ${payload.markers.topologySelectedRelationLabelFactRoute || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffQuality !==
          payload.markers.topologySelectedRelationLabelQuality ||
          payload.markers.topologySelectedRelationLabelHandoffEvidence !==
            payload.markers.topologySelectedRelationLabelEvidenceState
        ) {
          return `WebView Relief selected relation label handoff fact markers mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffQuality || "missing"}/${payload.markers.topologySelectedRelationLabelHandoffEvidence || "missing"})`;
        }
      }
      if (
        payload.markers.topologyNodePopoverVisible === true &&
        payload.markers.topologyCommandChromeState !== "collapsed-active-relation"
      ) {
      if (payload.markers.topologyNodePopoverCollapsed === true) {
        return "WebView Relief selected node popover stayed collapsed after expand verification";
      }
      if (payload.markers.topologyNodePopoverSurfaceRole !== "active-node-inspector") {
        return `WebView Relief selected node popover surface role was ${payload.markers.topologyNodePopoverSurfaceRole || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverAttentionRole !== "supporting-detail") {
        return `WebView Relief selected node popover attention role was ${payload.markers.topologyNodePopoverAttentionRole || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverFocusPrimary !== "linked-focus-cluster") {
        return `WebView Relief selected node popover primary focus was ${payload.markers.topologyNodePopoverFocusPrimary || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverHierarchyContract !== "click-focus-detail-support") {
        return `WebView Relief selected node popover hierarchy contract was ${payload.markers.topologyNodePopoverHierarchyContract || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverPositionContract !== "selected-inspector-aligns-to-right-inset") {
        return `WebView Relief selected node popover position contract was ${payload.markers.topologyNodePopoverPositionContract || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverGutterContract !== "no-phantom-utility-rail") {
        return `WebView Relief selected node popover gutter contract was ${payload.markers.topologyNodePopoverGutterContract || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRightInsetToken !== "--topology-node-popover-right-inset") {
        return `WebView Relief selected node popover right inset token was ${payload.markers.topologyNodePopoverRightInsetToken || "missing"}`;
      }
      if (
        payload.markers.topologyTopLeftChromeGroupSupportContract !==
        "left-panel-collapsed-until-user-expands"
      ) {
        return `WebView Relief selected node support contract was ${payload.markers.topologyTopLeftChromeGroupSupportContract || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverSizePolicy !== "inspector-rail") {
        return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} size policy`;
      }
      const viewportWidth = Number(payload.width || 0);
      const nodePopoverMinWidth = 248;
      if (!(Number(payload.markers.topologyNodePopoverWidth) >= nodePopoverMinWidth)) {
        return `WebView Relief selected node popover was too narrow (${payload.markers.topologyNodePopoverWidth ?? "missing"}px)`;
      }
      const nodePopoverMaxWidth =
        viewportWidth >= 1800 ? 360 : viewportWidth >= 1400 ? 320 : Number.POSITIVE_INFINITY;
      if (Number(payload.markers.topologyNodePopoverWidth) > nodePopoverMaxWidth) {
        return `WebView Relief selected node popover exceeded the focus rail contract (${payload.markers.topologyNodePopoverWidth ?? "missing"}px > ${nodePopoverMaxWidth}px)`;
      }
      if (Number(payload.markers.topologyNodePopoverLeft) < 8) {
        return `WebView Relief selected node popover overflowed the viewport left (${payload.markers.topologyNodePopoverLeft ?? "missing"}px)`;
      }
      if (!(Number(payload.markers.topologyNodePopoverTop) <= 130)) {
        return `WebView Relief selected node popover was placed too low (${payload.markers.topologyNodePopoverTop ?? "missing"}px)`;
      }
      if (
        Number(payload.markers.topologyNodePopoverBottom) >
        Number(payload.height || 0) - 16
      ) {
        return `WebView Relief selected node popover overflowed the viewport bottom (${payload.markers.topologyNodePopoverBottom ?? "missing"}px)`;
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible !== true) {
        return "WebView Relief selected node popover did not expose a relation row";
      }
      const nodePopoverFooterError = validateTopologyNodePopoverScrollFooterContract(
        payload.markers,
      );
      if (nodePopoverFooterError) {
        return nodePopoverFooterError;
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(
          payload.markers.topologyNodePopoverRelationEvidenceState,
        )
      ) {
        return "WebView Relief selected node popover relation row did not expose an evidence state marker";
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologyNodePopoverRelationAgentGateKind,
        )
      ) {
        return "WebView Relief selected node popover relation row did not expose an agent gate marker";
      }
      const expectedNodePopoverRelationAction =
        payload.markers.topologyNodePopoverRelationAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (
        payload.markers.topologyNodePopoverRelationPrimaryCopyAction !==
        expectedNodePopoverRelationAction
      ) {
        return `WebView Relief selected node popover relation row reported ${
          payload.markers.topologyNodePopoverRelationPrimaryCopyAction || "no"
        } primary action for ${payload.markers.topologyNodePopoverRelationAgentGateKind}`;
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationAgentGateText !== "string" ||
        payload.markers.topologyNodePopoverRelationAgentGateText.trim().length === 0
      ) {
        return "WebView Relief selected node popover relation row did not expose a visible agent gate chip";
      }
      const nodePopoverRelationAgentGateText =
        payload.markers.topologyNodePopoverRelationAgentGateText.trim();
      if (
        koreanTopologyRoute &&
        !/^(전달|점검|검토)$/.test(nodePopoverRelationAgentGateText)
      ) {
        return `WebView Relief selected node popover relation row exposed non-localized agent gate chip in Korean UI (${nodePopoverRelationAgentGateText})`;
      }
      if (payload.markers.topologyNodePopoverRelationFactRoute !== "fact>evidence>gate>action") {
        return `WebView Relief selected node popover relation row reported malformed fact route (${payload.markers.topologyNodePopoverRelationFactRoute || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteQuality !==
        payload.markers.topologyNodePopoverRelationQuality
      ) {
        return `WebView Relief selected node popover relation row route quality mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteQuality || "missing"} vs ${payload.markers.topologyNodePopoverRelationQuality || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteEvidence !==
        payload.markers.topologyNodePopoverRelationEvidenceState
      ) {
        return `WebView Relief selected node popover relation row route evidence mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteEvidence || "missing"} vs ${payload.markers.topologyNodePopoverRelationEvidenceState || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteGate !==
        payload.markers.topologyNodePopoverRelationAgentGateKind
      ) {
        return `WebView Relief selected node popover relation row route gate mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteGate || "missing"} vs ${payload.markers.topologyNodePopoverRelationAgentGateKind || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteAction !==
        expectedNodePopoverRelationAction
      ) {
        return `WebView Relief selected node popover relation row route action reported ${payload.markers.topologyNodePopoverRelationFactRouteAction || "missing"} for ${payload.markers.topologyNodePopoverRelationAgentGateKind}`;
      }
      if (
        payload.markers.topologyNodePopoverRelationHandoffGrammarContract !==
        "fact-evidence-gate-action-payload"
      ) {
        return `WebView Relief selected node popover relation row handoff grammar contract was ${payload.markers.topologyNodePopoverRelationHandoffGrammarContract || "missing"}`;
      }
      const nodePopoverRelationFactRouteChips = Array.isArray(
        payload.markers.topologyNodePopoverRelationFactRouteChips,
      )
        ? payload.markers.topologyNodePopoverRelationFactRouteChips
        : [];
      const nodePopoverRelationFactRouteKinds = nodePopoverRelationFactRouteChips
        .map((chip) => chip?.kind)
        .join(">");
      if (nodePopoverRelationFactRouteKinds !== "fact>evidence>gate>action>payload") {
        return `WebView Relief selected node popover relation row fact route chips were malformed (${nodePopoverRelationFactRouteKinds || "missing"})`;
      }
      const nodePopoverRelationGateChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "gate",
      );
      if (
        !nodePopoverRelationGateChip ||
        String(nodePopoverRelationGateChip.text || "").trim().length === 0
      ) {
        return "WebView Relief selected node popover relation row did not expose a visible gate chip";
      }
      const nodePopoverRelationActionChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "action",
      );
      const expectedNodePopoverActionChipText =
        expectedNodePopoverRelationAction === "explain_relation" ? "explain" : "check";
      if (
        String(nodePopoverRelationActionChip?.text || "").trim() !==
        expectedNodePopoverActionChipText
      ) {
        return `WebView Relief selected node popover relation row visible action chip was ${nodePopoverRelationActionChip?.text || "missing"} for ${expectedNodePopoverRelationAction}`;
      }
      const nodePopoverRelationPayloadChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "payload",
      );
      if (nodePopoverRelationPayloadChip?.text?.trim() !== "JSON") {
        return "WebView Relief selected node popover relation row did not expose a visible JSON payload chip";
      }
      if (payload.markers.topologyNodePopoverRelationRouteState !== "compact-json-ready") {
        return `WebView Relief selected node popover relation row route rail reported ${payload.markers.topologyNodePopoverRelationRouteState || "no"} state`;
      }
      const nodePopoverRelationRouteRailWidth = Number(
        payload.markers.topologyNodePopoverRelationRouteRailWidth,
      );
      const nodePopoverRelationRouteRailScrollWidth = Number(
        payload.markers.topologyNodePopoverRelationRouteRailScrollWidth,
      );
      if (
        !(nodePopoverRelationRouteRailWidth > 0) ||
        nodePopoverRelationRouteRailScrollWidth > nodePopoverRelationRouteRailWidth + 1
      ) {
        return `WebView Relief selected node popover relation row route rail overflowed (${nodePopoverRelationRouteRailScrollWidth || "missing"} > ${nodePopoverRelationRouteRailWidth || "missing"})`;
      }
      if (
        !(Number(payload.markers.topologyNodePopoverRelationPayloadChipWidth) > 0) ||
        String(payload.markers.topologyNodePopoverRelationPayloadChipText || "").trim() !==
          "JSON"
      ) {
        return "WebView Relief selected node popover relation row JSON payload chip was not visibly measurable";
      }
      const nodePopoverRelationSourceId =
        typeof payload.markers.topologyNodePopoverRelationSourceId === "string"
          ? payload.markers.topologyNodePopoverRelationSourceId.trim()
          : "";
      const nodePopoverRelationTargetId =
        typeof payload.markers.topologyNodePopoverRelationTargetId === "string"
          ? payload.markers.topologyNodePopoverRelationTargetId.trim()
          : "";
      const nodePopoverRelationEndpointRoute =
        typeof payload.markers.topologyNodePopoverRelationEndpointRoute === "string"
          ? payload.markers.topologyNodePopoverRelationEndpointRoute.trim()
          : "";
      if (!nodePopoverRelationSourceId || !nodePopoverRelationTargetId) {
        return "WebView Relief selected node popover relation row did not expose source and target endpoint markers";
      }
      if (
        nodePopoverRelationEndpointRoute !==
        `${nodePopoverRelationSourceId}>${nodePopoverRelationTargetId}`
      ) {
        return `WebView Relief selected node popover relation row endpoint route mismatched source and target (${nodePopoverRelationEndpointRoute || "missing"})`;
      }
      if (
        selectedNodeId &&
        nodePopoverRelationSourceId !== selectedNodeId &&
        nodePopoverRelationTargetId !== selectedNodeId
      ) {
        return `WebView Relief selected node popover relation row endpoint route did not include selected node ${selectedNodeId}`;
      }
      const nodePopoverRelationEndpointChips = Array.isArray(
        payload.markers.topologyNodePopoverRelationEndpointChips,
      )
        ? payload.markers.topologyNodePopoverRelationEndpointChips
        : [];
      const nodePopoverRelationEndpointKinds = nodePopoverRelationEndpointChips
        .map((chip) => chip?.kind)
        .join(">");
      if (nodePopoverRelationEndpointKinds !== "source>target") {
        return `WebView Relief selected node popover relation row endpoint chips were malformed (${nodePopoverRelationEndpointKinds || "missing"})`;
      }
      const nodePopoverRelationHandoffSummary =
        typeof payload.markers.topologyNodePopoverRelationHandoffSummary === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffSummary.trim()
          : "";
      const nodePopoverRelationAccessibleName =
        typeof payload.markers.topologyNodePopoverRelationAccessibleName === "string"
          ? payload.markers.topologyNodePopoverRelationAccessibleName.trim()
          : "";
      if (
        !nodePopoverRelationHandoffSummary.includes(
          `${nodePopoverRelationSourceId} > ${nodePopoverRelationTargetId}`,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(
          payload.markers.topologyNodePopoverRelationEvidenceState,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(
          payload.markers.topologyNodePopoverRelationAgentGateKind,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(expectedNodePopoverRelationAction)
      ) {
        return `WebView Relief selected node popover relation row handoff summary was incomplete (${nodePopoverRelationHandoffSummary || "missing"})`;
      }
      if (!nodePopoverRelationAccessibleName.includes(nodePopoverRelationHandoffSummary)) {
        return "WebView Relief selected node popover relation row accessible name did not include handoff summary";
      }
      const nodePopoverRelationHandoffTool =
        typeof payload.markers.topologyNodePopoverRelationHandoffTool === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffTool.trim()
          : "";
      const nodePopoverRelationHandoffOperation =
        typeof payload.markers.topologyNodePopoverRelationHandoffOperation === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffOperation.trim()
          : "";
      const nodePopoverRelationHandoffFrom =
        typeof payload.markers.topologyNodePopoverRelationHandoffFrom === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffFrom.trim()
          : "";
      const nodePopoverRelationHandoffTo =
        typeof payload.markers.topologyNodePopoverRelationHandoffTo === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffTo.trim()
          : "";
      const nodePopoverRelationHandoffType =
        typeof payload.markers.topologyNodePopoverRelationHandoffType === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffType.trim()
          : "";
      const nodePopoverRelationHandoffPayloadSummary =
        typeof payload.markers.topologyNodePopoverRelationHandoffPayloadSummary === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffPayloadSummary.trim()
          : "";
      const nodePopoverRelationHandoffPayloadJson =
        typeof payload.markers.topologyNodePopoverRelationHandoffPayloadJson === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffPayloadJson.trim()
          : "";
      if (nodePopoverRelationHandoffTool !== "query_ontology") {
        return `WebView Relief selected node popover relation row reported ${nodePopoverRelationHandoffTool || "no"} MCP handoff tool`;
      }
      if (nodePopoverRelationHandoffOperation !== expectedNodePopoverRelationAction) {
        return `WebView Relief selected node popover relation row reported ${nodePopoverRelationHandoffOperation || "no"} MCP operation`;
      }
      if (
        nodePopoverRelationHandoffFrom !== nodePopoverRelationSourceId ||
        nodePopoverRelationHandoffTo !== nodePopoverRelationTargetId
      ) {
        return "WebView Relief selected node popover relation row MCP payload endpoints did not match source and target";
      }
      if (
        !nodePopoverRelationHandoffType ||
        nodePopoverRelationHandoffType !== payload.markers.topologyNodePopoverRelationType ||
        nodePopoverRelationHandoffPayloadSummary !==
          `query_ontology · ${expectedNodePopoverRelationAction} · ${nodePopoverRelationSourceId} -> ${nodePopoverRelationTargetId} · ${nodePopoverRelationHandoffType}`
      ) {
        return `WebView Relief selected node popover relation row MCP payload summary was malformed (${nodePopoverRelationHandoffPayloadSummary || "missing"})`;
      }
      const nodePopoverRelationPayloadChipTitle =
        typeof payload.markers.topologyNodePopoverRelationPayloadChipTitle === "string"
          ? payload.markers.topologyNodePopoverRelationPayloadChipTitle.trim()
          : "";
      const nodePopoverRelationPayloadChipSummary =
        typeof payload.markers.topologyNodePopoverRelationPayloadChipSummary === "string"
          ? payload.markers.topologyNodePopoverRelationPayloadChipSummary.trim()
          : "";
      if (nodePopoverRelationPayloadChipTitle !== nodePopoverRelationHandoffPayloadSummary) {
        return "WebView Relief selected node popover relation row JSON payload chip title did not match MCP payload summary";
      }
      if (nodePopoverRelationPayloadChipSummary !== nodePopoverRelationHandoffPayloadSummary) {
        return "WebView Relief selected node popover relation row JSON payload chip summary did not match MCP payload summary";
      }
      let parsedNodePopoverRelationHandoffPayload;
      try {
        parsedNodePopoverRelationHandoffPayload = JSON.parse(
          nodePopoverRelationHandoffPayloadJson,
        );
      } catch {
        return "WebView Relief selected node popover relation row MCP payload JSON was not parseable";
      }
      if (
        parsedNodePopoverRelationHandoffPayload?.tool !== "query_ontology" ||
        parsedNodePopoverRelationHandoffPayload?.operation !==
          expectedNodePopoverRelationAction ||
        parsedNodePopoverRelationHandoffPayload?.from !== nodePopoverRelationSourceId ||
        parsedNodePopoverRelationHandoffPayload?.to !== nodePopoverRelationTargetId ||
        parsedNodePopoverRelationHandoffPayload?.type !== nodePopoverRelationHandoffType
      ) {
        return "WebView Relief selected node popover relation row MCP payload JSON mismatched the row markers";
      }
      if (payload.markers.topologyNodePopoverAgentReadinessVisible !== true) {
        return "WebView Relief selected node popover did not expose an agent readiness lens";
      }
      const nodeAgentReadinessText =
        typeof payload.markers.topologyNodePopoverAgentReadinessText === "string"
          ? payload.markers.topologyNodePopoverAgentReadinessText.trim()
          : "";
      const nodeAgentReadinessReadable =
        /(handoff-ready|handoff 가능|전달 가능|인계 가능)[^\d]+\d+/i.test(
          nodeAgentReadinessText,
        ) &&
        /(preflight|사전 점검)[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /(review|검토)[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /[·,:]/.test(nodeAgentReadinessText);
      if (!nodeAgentReadinessReadable) {
        return `WebView Relief selected node popover reported unparseable agent readiness lens (${nodeAgentReadinessText || "unknown"})`;
      }
      const agentReadinessChips = Array.isArray(
        payload.markers.topologyNodePopoverAgentReadinessChips,
      )
        ? payload.markers.topologyNodePopoverAgentReadinessChips
        : [];
      const agentReadinessKinds = new Set(
        agentReadinessChips.map((chip) => chip?.kind).filter(Boolean),
      );
      for (const kind of ["ready", "preflight", "review"]) {
        if (!agentReadinessKinds.has(kind)) {
          return `WebView Relief selected node popover agent readiness lens is missing ${kind}`;
        }
      }
      if (
        requireTopologyDrag &&
        Number(payload.markers.topologySelectedDockCompanionCount) >= 1 &&
        Number(payload.markers.topologySelectedDockVisibleCompanionCount) < 1
      ) {
        const mapContextText =
          typeof payload.markers.topologyNodePopoverMapContextText === "string"
            ? payload.markers.topologyNodePopoverMapContextText.trim()
            : "";
        if (payload.markers.topologyNodePopoverMapContextVisible !== true) {
          return "WebView did not report the selected node map context note";
        }
        if (!(Number(payload.markers.topologyNodePopoverMapContextCount) >= 1)) {
          return `WebView reported an empty selected node map context note (${payload.markers.topologyNodePopoverMapContextCount ?? "missing"} connection(s))`;
        }
        if (
          payload.markers.topologyNodePopoverMapContextContract !==
          "expanded-relations-stay-on-map"
        ) {
          return `WebView reported malformed selected node map context contract (${payload.markers.topologyNodePopoverMapContextContract || "missing"})`;
        }
        if (
          payload.markers.topologyNodePopoverMapContextHandoffContract !==
          "map-visible-relations-summarized"
        ) {
          return `WebView reported malformed selected node map context handoff contract (${payload.markers.topologyNodePopoverMapContextHandoffContract || "missing"})`;
        }
        if (!(Number(payload.markers.topologyNodePopoverMapContextRelationTypeCount) >= 1)) {
          return `WebView reported empty selected node map context relation type count (${payload.markers.topologyNodePopoverMapContextRelationTypeCount ?? "missing"})`;
        }
        if (
          typeof payload.markers.topologyNodePopoverMapContextAgentReadinessSummary !==
            "string" ||
          payload.markers.topologyNodePopoverMapContextAgentReadinessSummary.trim().length === 0
        ) {
          return "WebView reported empty selected node map context agent readiness summary";
        }
        if (
          typeof payload.markers.topologyNodePopoverMapContextQualitySummary !== "string" ||
          payload.markers.topologyNodePopoverMapContextQualitySummary.trim().length === 0
        ) {
          return "WebView reported empty selected node map context quality summary";
        }
        if (!/(map|지도).*(inspect|확인|보기|겹침|overlap)/i.test(mapContextText)) {
          return `WebView reported an unclear selected node map context note (${mapContextText || "empty"})`;
        }
      }
      } else if (!selectedRelationContextVisible) {
        return "WebView Relief selected node popover was not visible after drag verification";
      }
      if (payload.markers.topologySelectedRelationClaimLensVisible !== true) {
        return "WebView did not report the Relief selected relation claim lens marker";
      }
      if (
        payload.markers.topologySelectedRelationHaloVisible === true &&
        (typeof payload.markers.topologySelectedRelationHaloQuality !== "string" ||
          payload.markers.topologySelectedRelationHaloQuality.trim().length === 0)
      ) {
        return "WebView reported empty Relief selected relation halo quality";
      }
      if (
        typeof payload.markers.topologySelectedRelationClaimLensText !== "string" ||
        !/(typed ontology fact|타입이 있는 온톨로지 사실)/i.test(
          payload.markers.topologySelectedRelationClaimLensText,
        )
      ) {
        return `WebView reported malformed Relief selected relation claim lens copy (${payload.markers.topologySelectedRelationClaimLensText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationClaimLensQuality !== "string" ||
        !/^(strong|supported|weak|review)$/i.test(
          payload.markers.topologySelectedRelationClaimLensQuality,
        )
      ) {
        return `WebView reported malformed Relief selected relation claim lens quality marker (${payload.markers.topologySelectedRelationClaimLensQuality ?? "unknown marker"})`;
      }
      if (payload.markers.topologySelectedRelationClaimLensDotVisible !== true) {
        return "WebView did not report the Relief selected relation claim lens quality dot marker";
      }
      if (
        payload.markers.topologySelectedRelationContractKind !==
        "typed-fact-not-similarity"
      ) {
        return `WebView reported malformed Relief selected relation contract marker (${payload.markers.topologySelectedRelationContractKind ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationContractText !== "string" ||
        !/(not a similarity score|유사도 점수가 아니라)/i.test(
          payload.markers.topologySelectedRelationContractText,
        ) ||
        !/(handoff confidence|handoff 신뢰도|전달 신뢰도)/i.test(
          payload.markers.topologySelectedRelationContractText,
        )
      ) {
        return `WebView reported malformed Relief selected relation contract copy (${payload.markers.topologySelectedRelationContractText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationAgentGateText !== "string" ||
        !isSelectedRelationAgentGateText(payload.markers.topologySelectedRelationAgentGateText)
      ) {
        return `WebView reported malformed Relief selected relation agent gate copy (${payload.markers.topologySelectedRelationAgentGateText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardQuality !== "string" ||
        !/^(strong|supported|weak|review)$/i.test(
          payload.markers.topologySelectedRelationCardQuality,
        )
      ) {
        return `WebView reported malformed Relief selected relation card quality marker (${payload.markers.topologySelectedRelationCardQuality ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(
          payload.markers.topologySelectedRelationCardEvidenceState,
        )
      ) {
        return `WebView reported malformed Relief selected relation card evidence marker (${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationClaimLensQuality !==
        payload.markers.topologySelectedRelationCardQuality
      ) {
        return `WebView reported mismatched Relief selected relation claim lens quality marker (${payload.markers.topologySelectedRelationClaimLensQuality ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardQuality ?? "unknown card marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelEvidenceState === "string" &&
        payload.markers.topologySelectedRelationLabelEvidenceState.trim().length > 0 &&
        payload.markers.topologySelectedRelationLabelEvidenceState !==
          payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation label/card evidence marker (${payload.markers.topologySelectedRelationLabelEvidenceState ?? "unknown label marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationCardLabelContextContract !==
        "selected-card-preserves-aggregate-label-context"
      ) {
        return `WebView reported malformed Relief selected relation card label context contract (${payload.markers.topologySelectedRelationCardLabelContextContract || "missing"})`;
      }
      if (
        Number(payload.markers.topologySelectedRelationCardLabelCount || 0) !==
        Number(payload.markers.topologySelectedRelationLabelCount || 0)
      ) {
        return `WebView reported mismatched Relief selected relation card label count (${payload.markers.topologySelectedRelationCardLabelCount ?? "missing"} vs ${payload.markers.topologySelectedRelationLabelCount ?? "missing"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardLabelVisibleText !== "string" ||
        payload.markers.topologySelectedRelationCardLabelVisibleText.trim().length === 0 ||
        payload.markers.topologySelectedRelationCardLabelVisibleText !==
          payload.markers.topologyFocusRelationLabelVisibleText
      ) {
        return `WebView reported mismatched Relief selected relation card visible label text (${payload.markers.topologySelectedRelationCardLabelVisibleText || "missing"} vs ${payload.markers.topologyFocusRelationLabelVisibleText || "missing"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardLabelReadableText !== "string" ||
        !/×\d+ · /.test(payload.markers.topologySelectedRelationCardLabelReadableText)
      ) {
        return `WebView reported malformed Relief selected relation card readable label text (${payload.markers.topologySelectedRelationCardLabelReadableText || "missing"})`;
      }
      const selectedRelationCardRect = {
        left: Number(payload.markers.topologySelectedRelationCardLeft || 0),
        top: Number(payload.markers.topologySelectedRelationCardTop || 0),
        right: Number(payload.markers.topologySelectedRelationCardRight || 0),
        bottom: Number(payload.markers.topologySelectedRelationCardBottom || 0),
        width: Number(payload.markers.topologySelectedRelationCardWidth || 0),
        height: Number(payload.markers.topologySelectedRelationCardHeight || 0),
      };
      const viewportWidth = Number(payload.width || 0);
      const viewportHeight = Number(payload.height || 0);
      const selectedRelationMinCardWidth = viewportWidth >= 1500 ? 236 : 220;
      const selectedRelationMaxCardHeight =
        viewportWidth >= 1500 && viewportHeight > 0
          ? Math.min(340, Math.max(190, viewportHeight - 160))
          : Number.POSITIVE_INFINITY;
      if (
        !Number.isFinite(selectedRelationCardRect.left) ||
        !Number.isFinite(selectedRelationCardRect.top) ||
        !Number.isFinite(selectedRelationCardRect.right) ||
        !Number.isFinite(selectedRelationCardRect.bottom) ||
        selectedRelationCardRect.width < selectedRelationMinCardWidth ||
        selectedRelationCardRect.height < 190
      ) {
        return `WebView reported undersized Relief selected relation card (${selectedRelationCardRect.width}x${selectedRelationCardRect.height})`;
      }
      if (selectedRelationCardRect.height > selectedRelationMaxCardHeight) {
        return `WebView reported oversized Relief selected relation card (${selectedRelationCardRect.width}x${selectedRelationCardRect.height})`;
      }
      if (viewportWidth >= 1500) {
        const selectedRelationMaxCardWidth = viewportWidth >= 1920 ? 360 : 320;
        if (selectedRelationCardRect.width > selectedRelationMaxCardWidth) {
          return `WebView reported oversized Relief selected relation card width (${selectedRelationCardRect.width}px > ${selectedRelationMaxCardWidth}px)`;
        }
        if (payload.markers.topologySelectedRelationCardSurfaceRole !== "active-relation-inspector") {
          return `WebView reported malformed Relief selected relation card surface role (${payload.markers.topologySelectedRelationCardSurfaceRole || "missing"})`;
        }
        if (payload.markers.topologySelectedRelationCardDensity !== "compact") {
          return `WebView reported malformed Relief selected relation card density (${payload.markers.topologySelectedRelationCardDensity || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardSurfaceToken !==
          "--topology-selected-relation-card-surface"
        ) {
          return `WebView reported malformed Relief selected relation card surface token (${payload.markers.topologySelectedRelationCardSurfaceToken || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardBorderToken !==
          "--topology-selected-relation-card-border"
        ) {
          return `WebView reported malformed Relief selected relation card border token (${payload.markers.topologySelectedRelationCardBorderToken || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardShadowToken !==
          "--topology-selected-relation-card-shadow"
        ) {
          return `WebView reported malformed Relief selected relation card shadow token (${payload.markers.topologySelectedRelationCardShadowToken || "missing"})`;
        }
        const selectedRelationCardDensityError =
          validateSelectedRelationCardDensityContract(payload.markers, viewportWidth);
        if (selectedRelationCardDensityError) {
          return selectedRelationCardDensityError;
        }
        if (
          payload.markers.topologySelectedRelationCardOverflowContract !==
          "no-horizontal-scroll"
        ) {
          return `WebView reported malformed Relief selected relation card overflow contract (${payload.markers.topologySelectedRelationCardOverflowContract || "missing"})`;
        }
        const selectedRelationCardClientWidth = Number(
          payload.markers.topologySelectedRelationCardClientWidth || 0,
        );
        const selectedRelationCardScrollWidth = Number(
          payload.markers.topologySelectedRelationCardScrollWidth || 0,
        );
        if (
          !Number.isFinite(selectedRelationCardClientWidth) ||
          !Number.isFinite(selectedRelationCardScrollWidth) ||
          selectedRelationCardClientWidth < selectedRelationMinCardWidth ||
          selectedRelationCardScrollWidth - selectedRelationCardClientWidth > 2
        ) {
          return `WebView reported overflowing Relief selected relation card (${selectedRelationCardClientWidth} client / ${selectedRelationCardScrollWidth} scroll)`;
        }
        const selectedRelationEndpointRouteError =
          validateSelectedRelationEndpointRouteMarkers(payload.markers);
        if (selectedRelationEndpointRouteError) {
          return selectedRelationEndpointRouteError;
        }
        const selectedRelationEndpointVisibilityError =
          validateSelectedRelationEndpointVisibilityMarkers(payload.markers);
        if (selectedRelationEndpointVisibilityError) {
          return selectedRelationEndpointVisibilityError;
        }
        const selectedRelationContextSilhouetteError =
          validateSelectedRelationContextSilhouetteMarkers(payload.markers);
        if (selectedRelationContextSilhouetteError) {
          return selectedRelationContextSilhouetteError;
        }
        if (
          payload.markers.topologySelectedRelationCardElevationContract !==
          "solid-active-inspector-over-map"
        ) {
          return `WebView reported malformed Relief selected relation card elevation contract (${payload.markers.topologySelectedRelationCardElevationContract || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardMotionContract !==
          "active-relation-inspector-entry"
        ) {
          return `WebView reported malformed Relief selected relation inspector motion contract (${payload.markers.topologySelectedRelationCardMotionContract || "missing"})`;
        }
        if (Number(payload.markers.topologySelectedRelationCardMotionDurationMs || 0) !== 180) {
          return `WebView reported malformed Relief selected relation inspector motion duration (${payload.markers.topologySelectedRelationCardMotionDurationMs || "missing"}ms)`;
        }
        if (payload.markers.topologySelectedRelationCardMotionEasing !== "ease-out") {
          return `WebView reported malformed Relief selected relation inspector motion easing (${payload.markers.topologySelectedRelationCardMotionEasing || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardActionMinWidthToken !==
            "--topology-selected-relation-action-min-width" ||
          payload.markers.topologySelectedRelationCopyActionRailMinWidthToken !==
            "--topology-selected-relation-action-min-width"
        ) {
          return "WebView reported malformed Relief selected relation copy action width token";
        }
        if (
          payload.markers.topologySelectedRelationCardCopyPayloadMinHeightToken !==
            "--topology-selected-relation-copy-payload-min-height" ||
          payload.markers.topologySelectedRelationCopyPayloadMinHeightToken !==
            "--topology-selected-relation-copy-payload-min-height"
        ) {
          return "WebView reported malformed Relief selected relation copy payload height token";
        }
        if (
          payload.markers.topologySelectedRelationCardRouteStepMinWidthToken !==
            "--topology-selected-relation-route-step-min-width" ||
          payload.markers.topologySelectedRelationAgentRouteStepMinWidthToken !==
            "--topology-selected-relation-route-step-min-width"
        ) {
          return "WebView reported malformed Relief selected relation route step width token";
        }
        if (
          payload.markers.topologySelectedRelationActionMinWidthTokenValue !== "86px" ||
          payload.markers.topologySelectedRelationCopyPayloadMinHeightTokenValue !== "42px" ||
          payload.markers.topologySelectedRelationRouteStepMinWidthTokenValue !== "48px"
        ) {
          return `WebView reported malformed Relief selected relation density token values (${payload.markers.topologySelectedRelationActionMinWidthTokenValue || "missing"} / ${payload.markers.topologySelectedRelationCopyPayloadMinHeightTokenValue || "missing"} / ${payload.markers.topologySelectedRelationRouteStepMinWidthTokenValue || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardMotionSyncState !==
            "settled-with-camera" &&
          payload.markers.topologySelectedRelationCardMotionSyncState !==
            "reduced-motion-ready"
        ) {
          return `WebView reported malformed Relief selected relation inspector motion sync (${payload.markers.topologySelectedRelationCardMotionSyncState || "missing"})`;
        }
        if (selectedRelationCardRect.top < 96) {
          return `WebView reported insufficient Relief selected relation card top chrome clearance (${selectedRelationCardRect.top}px)`;
        }
        const proofBandWidth = Number(payload.markers.topologySelectedRelationProofBandWidth || 0);
        const proofBandHeight = Number(payload.markers.topologySelectedRelationProofBandHeight || 0);
        const contractRect = {
          top: Number(payload.markers.topologySelectedRelationContractTop || 0),
          width: Number(payload.markers.topologySelectedRelationContractWidth || 0),
          height: Number(payload.markers.topologySelectedRelationContractHeight || 0),
        };
        const decisionRect = {
          top: Number(payload.markers.topologySelectedRelationAgentDecisionTop || 0),
          width: Number(payload.markers.topologySelectedRelationAgentDecisionWidth || 0),
          height: Number(payload.markers.topologySelectedRelationAgentDecisionHeight || 0),
        };
        if (
          proofBandWidth < 226 ||
          proofBandHeight < 34 ||
          proofBandHeight > 95 ||
          contractRect.width < 108 ||
          decisionRect.width < 108 ||
          Math.abs(contractRect.top - decisionRect.top) > 2
        ) {
          return `WebView reported malformed compact Relief selected relation proof band (${proofBandWidth}x${proofBandHeight}, contract=${contractRect.width}x${contractRect.height}, decision=${decisionRect.width}x${decisionRect.height})`;
        }
        if (
          payload.markers.topologySelectedRelationMetricStripContract !==
          "visible-compact-relation-fact-rail"
        ) {
          return `WebView reported malformed Relief selected relation metric strip contract (${payload.markers.topologySelectedRelationMetricStripContract || "missing"})`;
        }
        const metricStripWidth = Number(
          payload.markers.topologySelectedRelationMetricStripWidth || 0,
        );
        const metricStripHeight = Number(
          payload.markers.topologySelectedRelationMetricStripHeight || 0,
        );
        if (metricStripWidth < 220 || metricStripHeight < 20 || metricStripHeight > 34) {
          return `WebView reported malformed compact Relief selected relation metric strip (${metricStripWidth || "missing"}x${metricStripHeight || "missing"})`;
        }
        if (Number(payload.markers.topologySelectedRelationHandleStripHeight || 0) > 12) {
          return `WebView reported visible duplicate Relief selected relation handle strip (${payload.markers.topologySelectedRelationHandleStripWidth ?? 0}x${payload.markers.topologySelectedRelationHandleStripHeight ?? 0})`;
        }
      }
      if (
        viewportWidth > 0 &&
        viewportHeight > 0 &&
        (selectedRelationCardRect.left < 0 ||
          selectedRelationCardRect.top < 0 ||
          selectedRelationCardRect.right > viewportWidth ||
          selectedRelationCardRect.bottom > viewportHeight)
      ) {
        return `WebView reported out-of-bounds Relief selected relation card (${selectedRelationCardRect.left},${selectedRelationCardRect.top} ${selectedRelationCardRect.right}x${selectedRelationCardRect.bottom} within ${viewportWidth}x${viewportHeight})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentGate !== "string" ||
        payload.markers.topologySelectedRelationCardAgentGate.trim().length === 0 ||
        payload.markers.topologySelectedRelationCardAgentGate !==
          payload.markers.topologySelectedRelationAgentGateText
      ) {
        return `WebView reported mismatched Relief selected relation card agent gate marker (${payload.markers.topologySelectedRelationCardAgentGate ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationAgentGateText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologySelectedRelationCardAgentGateKind,
        )
      ) {
        return `WebView reported malformed Relief selected relation card agent gate kind marker (${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentDecision !== "string" ||
        payload.markers.topologySelectedRelationCardAgentDecision.trim().length === 0
      ) {
        return `WebView reported empty Relief selected relation card agent decision marker (${payload.markers.topologySelectedRelationCardAgentDecision ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentDecisionGateKind !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation decision gate kind marker (${payload.markers.topologySelectedRelationAgentDecisionGateKind ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      const expectedPrimaryAction =
        payload.markers.topologySelectedRelationCardAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (
        payload.markers.topologySelectedRelationCardHandoffContract !==
        "selected-relation-card-carries-mcp-cli-fallback"
      ) {
        return `WebView reported malformed Relief selected relation card handoff contract (${payload.markers.topologySelectedRelationCardHandoffContract || "missing"})`;
      }
      if (payload.markers.topologyRootAttentionWinner !== "active-relation-inspector") {
        return `WebView reported malformed Relief root attention winner (${payload.markers.topologyRootAttentionWinner || "missing"})`;
      }
      if (payload.markers.topologyAgentCurrentSurface !== "selected-relation") {
        return `WebView reported malformed Relief root current surface (${payload.markers.topologyAgentCurrentSurface || "missing"})`;
      }
      if (
        payload.markers.topologyAgentCurrentSurfaceRole !==
        payload.markers.topologySelectedRelationCardSurfaceRole
      ) {
        return `WebView reported mismatched Relief root current surface role (${payload.markers.topologyAgentCurrentSurfaceRole || "missing"} vs ${payload.markers.topologySelectedRelationCardSurfaceRole || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationCardHandoffAliasContract !==
        payload.markers.topologySelectedRelationCardHandoffContract
      ) {
        return `WebView reported mismatched Relief selected relation card handoff alias contract (${payload.markers.topologySelectedRelationCardHandoffAliasContract || "missing"} vs ${payload.markers.topologySelectedRelationCardHandoffContract || "missing"})`;
      }
      if (payload.markers.topologySelectedRelationCardRoute !== "source>target>type>action") {
        return `WebView reported malformed Relief selected relation card route (${payload.markers.topologySelectedRelationCardRoute || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationCardEndpointRoute !==
        `${payload.markers.topologySelectedRelationCardSource}>${payload.markers.topologySelectedRelationCardTarget}`
      ) {
        return `WebView reported malformed Relief selected relation card endpoint route (${payload.markers.topologySelectedRelationCardEndpointRoute || "missing"})`;
      }
      if (
        payload.markers.topologyAgentCurrentSurfaceRoute !==
        payload.markers.topologySelectedRelationCardEndpointRoute
      ) {
        return `WebView reported mismatched Relief root current surface route (${payload.markers.topologyAgentCurrentSurfaceRoute || "missing"} vs ${payload.markers.topologySelectedRelationCardEndpointRoute || "missing"})`;
      }
      if (payload.markers.topologySelectedRelationCardPrimaryAction !== expectedPrimaryAction) {
        return `WebView reported mismatched Relief selected relation card primary action (${payload.markers.topologySelectedRelationCardPrimaryAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (
        payload.markers.topologySelectedRelationPrimaryCopyActionKind !==
        expectedPrimaryAction
      ) {
        return `WebView reported mismatched Relief selected relation primary copy action marker (${payload.markers.topologySelectedRelationPrimaryCopyActionKind ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (payload.markers.topologySelectedRelationPrimaryCopyRecommended !== true) {
        return `WebView reported Relief selected relation primary copy action is not marked recommended (${payload.markers.topologySelectedRelationPrimaryCopyRecommended ?? "unknown marker"})`;
      }
      const primaryCopyText =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionText === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionText.trim()
          : "";
      const hrefLocale = payload.href.includes("/ko/") ? "ko" : "en";
      const primaryCopyTextMatches = isSelectedRelationPrimaryCopyActionText({
        text: primaryCopyText,
        action: expectedPrimaryAction,
        locale: hrefLocale,
      });
      if (!primaryCopyTextMatches) {
        return `WebView reported malformed Relief selected relation primary copy action text (${primaryCopyText || "empty"} vs ${expectedPrimaryAction})`;
      }
      const primaryCopyBadgeText =
        typeof payload.markers.topologySelectedRelationPrimaryCopyBadgeText === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyBadgeText.trim()
          : "";
      if (!/^(best next|next step|다음 액션|다음 작업|권장 다음 작업)$/i.test(primaryCopyBadgeText)) {
        return `WebView reported malformed Relief selected relation primary copy badge (${primaryCopyBadgeText || "empty"})`;
      }
      if (
        Number(payload.markers.topologySelectedRelationPrimaryCopyActionWidth || 0) < 90 ||
        Number(payload.markers.topologySelectedRelationPrimaryCopyActionHeight || 0) < 26
      ) {
        return `WebView reported undersized Relief selected relation primary copy action (${payload.markers.topologySelectedRelationPrimaryCopyActionWidth ?? 0}x${payload.markers.topologySelectedRelationPrimaryCopyActionHeight ?? 0})`;
      }
      if (payload.markers.topologySelectedRelationCopyPayloadTool !== "query_ontology") {
        return `WebView reported malformed Relief selected relation copy payload tool (${payload.markers.topologySelectedRelationCopyPayloadTool ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView reported malformed Relief selected relation copy payload overflow contract (${payload.markers.topologySelectedRelationCopyPayloadOverflowContract || "missing"})`;
      }
      if (payload.markers.topologySelectedRelationCopyPayloadAction !== expectedPrimaryAction) {
        return `WebView reported mismatched Relief selected relation copy payload action (${payload.markers.topologySelectedRelationCopyPayloadAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadEvidence !==
        payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation copy payload evidence (${payload.markers.topologySelectedRelationCopyPayloadEvidence ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadGate !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation copy payload gate (${payload.markers.topologySelectedRelationCopyPayloadGate ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCopyPayloadFrom !== "string" ||
        payload.markers.topologySelectedRelationCopyPayloadFrom.trim().length === 0 ||
        typeof payload.markers.topologySelectedRelationCopyPayloadTo !== "string" ||
        payload.markers.topologySelectedRelationCopyPayloadTo.trim().length === 0
      ) {
        return `WebView reported malformed Relief selected relation copy payload endpoints (${payload.markers.topologySelectedRelationCopyPayloadFrom ?? "unknown from"} -> ${payload.markers.topologySelectedRelationCopyPayloadTo ?? "unknown to"})`;
      }
      if (
        payload.markers.topologySelectedRelationCardSource !==
          payload.markers.topologySelectedRelationCopyPayloadFrom ||
        payload.markers.topologySelectedRelationCardTarget !==
          payload.markers.topologySelectedRelationCopyPayloadTo ||
        payload.markers.topologySelectedRelationCardType !==
          payload.markers.topologySelectedRelationCopyPayloadType
      ) {
        return `WebView reported mismatched Relief selected relation card route handles (${payload.markers.topologySelectedRelationCardSource ?? "unknown source"} -> ${payload.markers.topologySelectedRelationCardTarget ?? "unknown target"} · ${payload.markers.topologySelectedRelationCardType ?? "unknown type"})`;
      }
      if (
        payload.markers.topologySelectedRelationHandleStripSource !==
          payload.markers.topologySelectedRelationCopyPayloadFrom ||
        payload.markers.topologySelectedRelationHandleStripTarget !==
          payload.markers.topologySelectedRelationCopyPayloadTo ||
        payload.markers.topologySelectedRelationHandleStripType !==
          payload.markers.topologySelectedRelationCopyPayloadType
      ) {
        return `WebView reported mismatched Relief selected relation ontology handle strip (${payload.markers.topologySelectedRelationHandleStripSource ?? "unknown source"} -> ${payload.markers.topologySelectedRelationHandleStripTarget ?? "unknown target"} · ${payload.markers.topologySelectedRelationHandleStripType ?? "unknown type"})`;
      }
      const handleSummary =
        typeof payload.markers.topologySelectedRelationHandleStripSummary === "string"
          ? payload.markers.topologySelectedRelationHandleStripSummary.trim()
          : "";
      if (
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadFrom) ||
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadTo) ||
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadType) ||
        !handleSummary.includes("→")
      ) {
        return `WebView reported malformed Relief selected relation ontology handle summary (${handleSummary || "empty"})`;
      }
      const copyPayloadSummary =
        typeof payload.markers.topologySelectedRelationCopyPayloadSummary === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadSummary.trim()
          : "";
      if (
        copyPayloadSummary !==
        `query_ontology · ${expectedPrimaryAction} · ${payload.markers.topologySelectedRelationCopyPayloadFrom} → ${payload.markers.topologySelectedRelationCopyPayloadTo} · ${payload.markers.topologySelectedRelationCopyPayloadType} · ${payload.markers.topologySelectedRelationCardEvidenceState} · ${payload.markers.topologySelectedRelationCardAgentGateKind}`
      ) {
        return `WebView reported malformed Relief selected relation copy payload summary (${copyPayloadSummary || "empty"})`;
      }
      const copyPayloadVisibleSummary =
        typeof payload.markers.topologySelectedRelationCopyPayloadVisibleSummary === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadVisibleSummary.trim()
          : "";
      const expectedVisibleCopyPayloadSummary =
        expectedPrimaryAction === "relation_check" ? "Check first" : "Ready to explain";
      const koreanVisibleCopyPayloadSummary =
        expectedPrimaryAction === "relation_check" ? "점검 먼저" : "설명 준비";
      if (
        copyPayloadVisibleSummary !== expectedVisibleCopyPayloadSummary &&
        copyPayloadVisibleSummary !== koreanVisibleCopyPayloadSummary
      ) {
        return `WebView reported malformed Relief selected relation visible copy payload summary (${copyPayloadVisibleSummary || "empty"})`;
      }
      if (
        copyPayloadVisibleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadType) ||
        copyPayloadVisibleSummary.includes(payload.markers.topologySelectedRelationCardEvidenceState) ||
        copyPayloadVisibleSummary.includes(payload.markers.topologySelectedRelationCardAgentGateKind)
      ) {
        return `WebView reported cramped Relief selected relation visible copy payload summary (${copyPayloadVisibleSummary})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadLayoutContract !==
        "visible-summary-and-handle-readable"
      ) {
        return `WebView reported malformed Relief selected relation copy payload layout contract (${payload.markers.topologySelectedRelationCopyPayloadLayoutContract || "missing"})`;
      }
      const copyPayloadVisibleHandleSummary =
        typeof payload.markers.topologySelectedRelationCopyPayloadVisibleHandleSummary === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadVisibleHandleSummary.trim()
          : "";
      const expectedVisibleCopyPayloadHandleSummary = `${compactOntologyHandle(
        payload.markers.topologySelectedRelationCopyPayloadFrom,
      )} → ${compactOntologyHandle(payload.markers.topologySelectedRelationCopyPayloadTo)}`;
      if (copyPayloadVisibleHandleSummary !== expectedVisibleCopyPayloadHandleSummary) {
        return `WebView reported malformed Relief selected relation visible copy payload handle (${copyPayloadVisibleHandleSummary || "empty"} vs ${expectedVisibleCopyPayloadHandleSummary})`;
      }
      if (
        copyPayloadVisibleHandleSummary.includes(
          payload.markers.topologySelectedRelationCopyPayloadFrom,
        ) ||
        copyPayloadVisibleHandleSummary.includes(
          payload.markers.topologySelectedRelationCopyPayloadTo,
        )
      ) {
        return `WebView reported cramped Relief selected relation visible copy payload handle (${copyPayloadVisibleHandleSummary})`;
      }
      const copyPayloadCall =
        typeof payload.markers.topologySelectedRelationCopyPayloadCall === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadCall.trim()
          : "";
      const expectedCopyPayloadCall =
        expectedPrimaryAction === "relation_check"
          ? `query_ontology({"operation":"relation_check","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","type":"${payload.markers.topologySelectedRelationCopyPayloadType}"})`
          : `query_ontology({"operation":"explain_relation","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","direction":"undirected","maxHops":5,"limit":10})`;
      if (copyPayloadCall !== expectedCopyPayloadCall) {
        return `WebView reported malformed Relief selected relation primary copy payload call (${copyPayloadCall || "empty"})`;
      }
      const expectedCliFallbackCommand =
        expectedPrimaryAction === "relation_check"
          ? `ontology-atlas relation-check ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)} [vault]`
          : `ontology-atlas explain ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} [vault] --type ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)}`;
      const cliFallbackCommand =
        typeof payload.markers.topologySelectedRelationCliFallbackCommand === "string"
          ? payload.markers.topologySelectedRelationCliFallbackCommand.trim()
          : "";
      const cliFallbackSummary =
        typeof payload.markers.topologySelectedRelationCliFallbackSummary === "string"
          ? payload.markers.topologySelectedRelationCliFallbackSummary.trim()
          : "";
      if (cliFallbackCommand !== expectedCliFallbackCommand) {
        return `WebView reported malformed Relief selected relation CLI fallback (${cliFallbackCommand || "empty"})`;
      }
      if (cliFallbackSummary !== expectedCliFallbackCommand) {
        return `WebView reported malformed Relief selected relation CLI fallback summary (${cliFallbackSummary || "empty"})`;
      }
      const cardCliFallback =
        typeof payload.markers.topologySelectedRelationCardCliFallback === "string"
          ? payload.markers.topologySelectedRelationCardCliFallback.trim()
          : "";
      if (cardCliFallback !== expectedCliFallbackCommand) {
        return `WebView reported malformed Relief selected relation card CLI fallback (${cardCliFallback || "empty"})`;
      }
      const primaryCopyActionCall =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionCall === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionCall.trim()
          : "";
      const primaryCopyActionTitle =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionTitle === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionTitle.trim()
          : "";
      if (primaryCopyActionCall !== copyPayloadCall) {
        return `WebView reported mismatched Relief selected relation primary button payload call (${primaryCopyActionCall || "empty"} vs ${copyPayloadCall || "empty"})`;
      }
      if (primaryCopyActionTitle !== copyPayloadCall) {
        return `WebView reported mismatched Relief selected relation primary button payload title (${primaryCopyActionTitle || "empty"} vs ${copyPayloadCall || "empty"})`;
      }
      const copyActions = Array.isArray(payload.markers.topologySelectedRelationCopyActions)
        ? payload.markers.topologySelectedRelationCopyActions
        : [];
      if (copyActions.length !== 2) {
        return `WebView reported ${copyActions.length || "no"} Relief selected relation copy actions`;
      }
      const copyActionByKind = new Map(copyActions.map((action) => [action?.kind, action]));
      const expectedRelationCheckCall = `query_ontology({"operation":"relation_check","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","type":"${payload.markers.topologySelectedRelationCopyPayloadType}"})`;
      const expectedExplainRelationCall = `query_ontology({"operation":"explain_relation","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","direction":"undirected","maxHops":5,"limit":10})`;
      for (const [kind, expectedCall] of [
        ["relation_check", expectedRelationCheckCall],
        ["explain_relation", expectedExplainRelationCall],
      ]) {
        const action = copyActionByKind.get(kind);
        if (!action) {
          return `WebView omitted Relief selected relation ${kind} copy action`;
        }
        if (action.call !== expectedCall || action.title !== expectedCall) {
          return `WebView reported malformed Relief selected relation ${kind} copy action payload`;
        }
        if (!(Number(action.width) >= 90) || !(Number(action.height) >= 26)) {
          return `WebView reported undersized Relief selected relation ${kind} copy action (${action.width ?? 0}x${action.height ?? 0})`;
        }
      }
      const recommendedActions = copyActions.filter((action) => action?.recommended);
      if (
        recommendedActions.length !== 1 ||
        recommendedActions[0]?.kind !== expectedPrimaryAction ||
        recommendedActions[0]?.priority !== "primary"
      ) {
        return `WebView reported malformed Relief selected relation recommended copy action (${recommendedActions.map((action) => action?.kind).join(",") || "missing"})`;
      }
      if (
        typeof recommendedActions[0]?.recommendationLabel !== "string" ||
        recommendedActions[0].recommendationLabel.trim().length === 0 ||
        payload.markers.topologySelectedRelationPrimaryCopyBadgeText !==
          recommendedActions[0].recommendationLabel
      ) {
        return `WebView reported malformed Relief selected relation recommended copy marker (${recommendedActions[0]?.recommendationLabel || "missing"})`;
      }
      if (
        typeof recommendedActions[0]?.text === "string" &&
        recommendedActions[0].text.includes(recommendedActions[0].recommendationLabel)
      ) {
        return `WebView reported cramped Relief selected relation recommended copy text (${recommendedActions[0].text})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyActionRailOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView reported malformed Relief selected relation copy action rail overflow contract (${payload.markers.topologySelectedRelationCopyActionRailOverflowContract || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyActionRailDensityContract !==
        "single-row-compact"
      ) {
        return `WebView reported malformed Relief selected relation copy action rail density contract (${payload.markers.topologySelectedRelationCopyActionRailDensityContract || "missing"})`;
      }
      const copyActionRailClientWidth = Number(
        payload.markers.topologySelectedRelationCopyActionRailClientWidth || 0,
      );
      const copyActionRailScrollWidth = Number(
        payload.markers.topologySelectedRelationCopyActionRailScrollWidth || 0,
      );
      const copyActionRailHeight = Number(
        payload.markers.topologySelectedRelationCopyActionRailHeight || 0,
      );
      if (
        !Number.isFinite(copyActionRailClientWidth) ||
        !Number.isFinite(copyActionRailScrollWidth) ||
        !Number.isFinite(copyActionRailHeight) ||
        copyActionRailClientWidth < 180 ||
        copyActionRailScrollWidth - copyActionRailClientWidth > 2 ||
        copyActionRailHeight > 44
      ) {
        return `WebView reported overflowing Relief selected relation copy action rail (${copyActionRailClientWidth} client / ${copyActionRailScrollWidth} scroll / ${copyActionRailHeight} height)`;
      }
      if (
        Number(payload.markers.topologySelectedRelationCopyPayloadWidth || 0) < 180 ||
        Number(payload.markers.topologySelectedRelationCopyPayloadHeight || 0) < 28
      ) {
        return `WebView reported undersized Relief selected relation copy payload strip (${payload.markers.topologySelectedRelationCopyPayloadWidth ?? 0}x${payload.markers.topologySelectedRelationCopyPayloadHeight ?? 0})`;
      }
      if (Number(payload.markers.topologySelectedRelationCopyPayloadHeight || 0) > 48) {
        return `WebView reported oversized Relief selected relation copy payload strip (${payload.markers.topologySelectedRelationCopyPayloadWidth ?? 0}x${payload.markers.topologySelectedRelationCopyPayloadHeight ?? 0})`;
      }
      const copyPayloadClientWidth = Number(
        payload.markers.topologySelectedRelationCopyPayloadClientWidth || 0,
      );
      const copyPayloadScrollWidth = Number(
        payload.markers.topologySelectedRelationCopyPayloadScrollWidth || 0,
      );
      if (
        !Number.isFinite(copyPayloadClientWidth) ||
        !Number.isFinite(copyPayloadScrollWidth) ||
        copyPayloadClientWidth < 180 ||
        copyPayloadScrollWidth - copyPayloadClientWidth > 2
      ) {
        return `WebView reported overflowing Relief selected relation copy payload strip (${copyPayloadClientWidth} client / ${copyPayloadScrollWidth} scroll)`;
      }
      const agentRouteSteps = Array.isArray(
        payload.markers.topologySelectedRelationAgentRouteSteps,
      )
        ? payload.markers.topologySelectedRelationAgentRouteSteps
        : [];
      const agentRouteKinds = agentRouteSteps.map((step) => step?.kind).join(">");
      if (agentRouteKinds !== "fact>evidence>gate>action") {
        return `WebView reported malformed Relief selected relation agent route steps (${agentRouteKinds || "missing"})`;
      }
      if (payload.markers.topologySelectedRelationAgentRouteDensity !== "micro-rail") {
        return `WebView reported malformed Relief selected relation agent route density (${payload.markers.topologySelectedRelationAgentRouteDensity || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView reported malformed Relief selected relation agent route overflow contract (${payload.markers.topologySelectedRelationAgentRouteOverflowContract || "missing"})`;
      }
      const agentRouteClientWidth = Number(
        payload.markers.topologySelectedRelationAgentRouteClientWidth || 0,
      );
      const agentRouteScrollWidth = Number(
        payload.markers.topologySelectedRelationAgentRouteScrollWidth || 0,
      );
      if (
        !Number.isFinite(agentRouteClientWidth) ||
        !Number.isFinite(agentRouteScrollWidth) ||
        agentRouteClientWidth < 180 ||
        agentRouteScrollWidth - agentRouteClientWidth > 2
      ) {
        return `WebView reported overflowing Relief selected relation agent route (${agentRouteClientWidth} client / ${agentRouteScrollWidth} scroll)`;
      }
      const agentRouteEvidenceStep = agentRouteSteps.find((step) => step?.kind === "evidence");
      if (
        typeof agentRouteEvidenceStep?.value !== "string" ||
        agentRouteEvidenceStep.value.trim().length === 0 ||
        !/(source|authored|review|출처|작성자|검토)/i.test(agentRouteEvidenceStep.value)
      ) {
        return `WebView reported malformed Relief selected relation agent route evidence step (${agentRouteEvidenceStep?.value ?? "missing"})`;
      }
      const narrowRouteStep = agentRouteSteps.find((step) => {
        if (step?.visibility === "metadata-only" || step?.kind === "action") {
          return false;
        }
        return Number(step?.width || 0) < 48;
      });
      if (narrowRouteStep) {
        return `WebView reported cramped Relief selected relation agent route step (${narrowRouteStep.kind || "unknown"} ${narrowRouteStep.width ?? 0}x${narrowRouteStep.height ?? 0})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteGateKind !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation route gate marker (${payload.markers.topologySelectedRelationAgentRouteGateKind ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteEvidenceState !==
        payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation route evidence marker (${payload.markers.topologySelectedRelationAgentRouteEvidenceState ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRoutePrimaryAction !==
        expectedPrimaryAction
      ) {
        return `WebView reported mismatched Relief selected relation route action marker (${payload.markers.topologySelectedRelationAgentRoutePrimaryAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      const routeActionStep = agentRouteSteps.find((step) => step?.kind === "action");
      if (
        typeof routeActionStep?.value !== "string" ||
        routeActionStep.value.trim() !== expectedPrimaryAction
      ) {
        return `WebView reported malformed Relief selected relation route action copy (${routeActionStep?.value ?? "unknown"})`;
      }
      const selectedRelationCardAttentionLaneError =
        validateSelectedRelationCardAttentionLane(payload.markers, viewportWidth);
      if (selectedRelationCardAttentionLaneError) {
        return selectedRelationCardAttentionLaneError;
      }
      if (
        typeof payload.markers.topologySelectedRelationAgentDecisionText !== "string" ||
        !/(agent handoff|에이전트 전달|relation_check|agent-ready|관계 근거|handoff|전달)/i.test(
          payload.markers.topologySelectedRelationAgentDecisionText,
        )
      ) {
        return `WebView reported malformed Relief selected relation agent decision copy (${payload.markers.topologySelectedRelationAgentDecisionText ?? "unknown text"})`;
      }
    }
  }
  if (
    !Number.isFinite(payload.width) ||
    !Number.isFinite(payload.height) ||
    payload.width <= 0 ||
    payload.height <= 0
  ) {
    return "WebView viewport dimensions were empty";
  }
  return null;
}
