import { sleep } from "./cli-args.mjs";
import { RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX, VALID_ZOOM_LENS_PRESENTATION_SOURCES, WEBVIEW_VERIFY_PREFIX, WEBVIEW_VERIFY_TIMEOUT_MS } from "./webview-env.mjs";

export function parseWebviewVerifyPayload(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .reverse()
    .filter((entry) => entry.startsWith(WEBVIEW_VERIFY_PREFIX));
  for (const line of lines) {
    const raw = line.slice(WEBVIEW_VERIFY_PREFIX.length).trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "string") return parsed;
      if (!parsed.trim()) continue;
      return JSON.parse(parsed);
    } catch {
      continue;
    }
  }
  return null;
}


export function validateSelectedRelationLabelCompactMarkers(markers, width) {
  const relationLabelViewportInset = Math.max(
    0,
    Number(markers?.topologySelectedRelationLabelViewportInset || 0),
  );
  if (
    Number(markers?.topologySelectedRelationLabelHitLeft || 0) <
    relationLabelViewportInset - 0.5
  ) {
    return `WebView Relief selected relation label overflowed the viewport left (${markers?.topologySelectedRelationLabelHitLeft ?? "missing"}px)`;
  }
  const relationLabelRightInset =
    Number(width || 0) - Number(markers?.topologySelectedRelationLabelHitRight || 0);
  if (relationLabelRightInset < relationLabelViewportInset - 0.5) {
    return `WebView Relief selected relation label overflowed the viewport right (right inset ${Number.isFinite(relationLabelRightInset) ? relationLabelRightInset : "missing"}px)`;
  }
  if (!/^(true|false)$/.test(String(markers?.topologySelectedRelationLabelCompact || ""))) {
    return "WebView Relief selected relation label did not expose a compact-mode marker";
  }
  const relationLabelCompact =
    String(markers?.topologySelectedRelationLabelCompact) === "true";
  const relationLabelHitWidth = Number(markers?.topologySelectedRelationLabelHitWidth || 0);
  const relationLabelDesiredWidth = Number(
    markers?.topologySelectedRelationLabelDesiredWidth || 0,
  );
  const relationLabelCenteredAvailableWidth = Number(
    markers?.topologySelectedRelationLabelCenteredAvailableWidth || 0,
  );
  if (!(relationLabelDesiredWidth >= relationLabelHitWidth)) {
    return `WebView Relief selected relation label desired width was smaller than its rendered width (${relationLabelDesiredWidth || "missing"} < ${relationLabelHitWidth || "missing"})`;
  }
  if (!(relationLabelCenteredAvailableWidth >= relationLabelHitWidth)) {
    return `WebView Relief selected relation label available width was smaller than its rendered width (${relationLabelCenteredAvailableWidth || "missing"} < ${relationLabelHitWidth || "missing"})`;
  }
  const relationLabelCompactBasis = relationLabelCenteredAvailableWidth || relationLabelHitWidth;
  const relationLabelRequiresCompact =
    relationLabelCompactBasis + RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX <
    relationLabelDesiredWidth;
  if (relationLabelRequiresCompact !== relationLabelCompact) {
    return `WebView Relief selected relation label compact marker was inconsistent with its available width (${relationLabelCompactBasis} of ${relationLabelDesiredWidth})`;
  }
  const relationLabelClampContract = String(
    markers?.topologySelectedRelationLabelViewportClampContract || "",
  );
  const relationLabelClampSide = String(
    markers?.topologySelectedRelationLabelViewportClampSide || "",
  );
  if (
    !/^(centered-within-viewport|compacted-to-viewport-edge)$/.test(
      relationLabelClampContract,
    )
  ) {
    return `WebView Relief selected relation label viewport clamp contract was ${relationLabelClampContract || "missing"}`;
  }
  if (!/^(left|right|none)$/.test(relationLabelClampSide)) {
    return `WebView Relief selected relation label viewport clamp side was ${relationLabelClampSide || "missing"}`;
  }
  if (relationLabelClampContract === "centered-within-viewport" && relationLabelClampSide !== "none") {
    return `WebView Relief selected relation label clamp side ${relationLabelClampSide} contradicted centered geometry`;
  }
  if (
    relationLabelClampContract === "compacted-to-viewport-edge" &&
    relationLabelClampSide === "none"
  ) {
    return "WebView Relief selected relation label reported edge compaction without a clamp side";
  }
  return null;
}


export function validateRelationLabelFrameGeometryMarkers(markers) {
  const contract = String(markers?.topologyRelationLabelGeometryContract || "");
  if (contract !== "frame-positioned-hit-targets") {
    return `WebView Relief relation label frame geometry contract was ${contract || "missing"}`;
  }
  const source = String(markers?.topologyRelationLabelGeometrySource || "");
  if (source !== "after-render-layout-pass") {
    return `WebView Relief relation label frame geometry source was ${source || "missing"}`;
  }
  const expected = Number(markers?.topologyRelationLabelGeometryExpectedCount || 0);
  const ready = Number(markers?.topologyRelationLabelGeometryReadyCount || 0);
  const pending = Number(markers?.topologyRelationLabelGeometryPendingCount || 0);
  if (!Number.isFinite(expected) || expected < 1) {
    return `WebView Relief relation label frame geometry expected count was ${markers?.topologyRelationLabelGeometryExpectedCount ?? "missing"}`;
  }
  if (!Number.isFinite(ready) || ready < expected) {
    return `WebView Relief relation label frame geometry ready count (${ready || "missing"}) was below expected (${expected || "missing"})`;
  }
  if (!Number.isFinite(pending) || pending !== 0) {
    return `WebView Relief relation label frame geometry still had ${Number.isFinite(pending) ? pending : "missing"} pending labels`;
  }
  return null;
}


export function validateTopologyConnectorCacheMarkers(markers) {
  if (markers?.topologyConnectorDomIndexContract !== "reuse-card-index") {
    return `WebView Relief connector DOM index contract was ${markers?.topologyConnectorDomIndexContract || "missing"}`;
  }
  if (markers?.topologyConnectorRectCacheContract !== "frame-local-card-rect-cache") {
    return `WebView Relief connector rect cache contract was ${markers?.topologyConnectorRectCacheContract || "missing"}`;
  }
  if (
    markers?.topologyConnectorRectCacheFrameFallbackContract !==
    "reuse-card-placement-frame-rects-before-dom-read"
  ) {
    return `WebView Relief connector rect cache frame fallback contract was ${markers?.topologyConnectorRectCacheFrameFallbackContract || "missing"}`;
  }
  if (markers?.topologyConnectorRectCacheAccounting !== "reads-plus-hits") {
    return `WebView Relief connector rect cache accounting was ${markers?.topologyConnectorRectCacheAccounting || "missing"}`;
  }
  const connectorRectCacheSize = Number(markers?.topologyConnectorRectCacheSize || 0);
  const connectorRectCacheReadCount = Number(
    markers?.topologyConnectorRectCacheReadCount || 0,
  );
  const connectorRectCacheHitCount = Number(
    markers?.topologyConnectorRectCacheHitCount || 0,
  );
  if (
    !Number.isFinite(connectorRectCacheSize) ||
    !Number.isFinite(connectorRectCacheReadCount) ||
    !Number.isFinite(connectorRectCacheHitCount) ||
    connectorRectCacheSize < 2 ||
    connectorRectCacheReadCount !== 0 ||
    connectorRectCacheHitCount < 1
  ) {
    return `WebView Relief connector rect cache proof was incomplete (${connectorRectCacheSize} size / ${connectorRectCacheReadCount} reads / ${connectorRectCacheHitCount} hits)`;
  }
  return null;
}


export function validateTopologyZoomLensMarkers(markers) {
  if (
    markers?.topologyZoomVerifyAttempted !== true &&
    !markers?.topologyZoomLensContract
  ) {
    return null;
  }
  if (
    markers?.topologyZoomLensContract !==
    "zoom-in-uses-kind-pins-for-noncritical-context-cards"
  ) {
    return `WebView Relief zoom lens contract was ${markers?.topologyZoomLensContract || "missing"}`;
  }
  if (
    markers?.topologyZoomLensPresentationContract !==
    "camera-or-focus-lens-uses-kind-pins-for-noncritical-context"
  ) {
    return `WebView Relief zoom lens presentation contract was ${markers?.topologyZoomLensPresentationContract || "missing"}`;
  }
  if (markers?.topologyZoomVerifyAttempted === true && markers?.topologyZoomVerifyReason !== "done") {
    return `WebView Relief zoom probe did not activate the camera zoom lens (${markers?.topologyZoomVerifyReason || "missing reason"})`;
  }
  if (!(Number(markers?.topologyZoomLensThresholdRatio || 0) > 0)) {
    return `WebView Relief zoom lens threshold ratio was ${markers?.topologyZoomLensThresholdRatio ?? "missing"}`;
  }
  if (!(Number(markers?.topologyZoomLensCameraRatio || 0) > 0)) {
    return `WebView Relief zoom lens camera ratio was ${markers?.topologyZoomLensCameraRatio ?? "missing"}`;
  }
  if (
    markers?.topologyCameraDepthContract !== undefined &&
    markers.topologyCameraDepthContract !==
      "wheel-zoom-clamps-before-map-loses-readable-structure"
  ) {
    return `WebView Relief camera depth contract was ${markers.topologyCameraDepthContract || "missing"}`;
  }
  if (
    markers?.topologyCameraMinRatio !== undefined &&
    Number(markers.topologyCameraMinRatio) < 0.4
  ) {
    return `WebView Relief camera min ratio was ${markers.topologyCameraMinRatio}`;
  }
  if (markers?.topologyZoomLensActive !== true) {
    return "WebView Relief zoom lens did not become active after camera zoom-in";
  }
  if (markers?.topologyZoomLensPresentationActive !== true) {
    return "WebView Relief zoom lens did not report an active presentation after camera zoom-in";
  }
  if (!VALID_ZOOM_LENS_PRESENTATION_SOURCES.has(markers?.topologyZoomLensPresentationSource)) {
    return `WebView Relief zoom lens presentation source was ${markers?.topologyZoomLensPresentationSource || "missing"}`;
  }
  if (markers?.topologyZoomLensCardCompactionActive !== true) {
    return "WebView Relief zoom lens did not compact text cards into kind pins";
  }
  if (!(Number(markers?.topologyZoomLensEligibleCount || 0) >= 1)) {
    return `WebView Relief zoom lens had no eligible cards (${markers?.topologyZoomLensEligibleCount ?? "missing"})`;
  }
  if (!(Number(markers?.topologyZoomLensActiveCardCount || 0) >= 1)) {
    return `WebView Relief zoom lens had no active compact cards (${markers?.topologyZoomLensActiveCardCount ?? "missing"})`;
  }
  if (!(Number(markers?.topologyZoomLensVisibleActiveCardCount || 0) >= 1)) {
    return `WebView Relief zoom lens had no visible compact cards (${markers?.topologyZoomLensVisibleActiveCardCount ?? "missing"})`;
  }
  if (
    markers?.topologyZoomLensPinProximityContract !== undefined &&
    markers?.topologyZoomLensPinProximityContract !==
      "zoomed-context-pins-keep-critical-relation-proximity"
  ) {
    return `WebView Relief zoom lens proximity pin contract was ${markers?.topologyZoomLensPinProximityContract || "missing"}`;
  }
  if (
    markers?.topologyZoomLensPinProximityActive !== undefined &&
    markers?.topologyZoomLensPinProximityActive !== true
  ) {
    return "WebView Relief zoom lens did not mark critical-neighbor context pins";
  }
  if (
    markers?.topologyZoomLensProximityPinCount !== undefined &&
    !(Number(markers?.topologyZoomLensProximityPinCount || 0) >= 1)
  ) {
    return `WebView Relief zoom lens proximity pin count was ${markers?.topologyZoomLensProximityPinCount ?? "missing"}`;
  }
  if (
    markers?.topologyZoomLensPinProximityRingToken !== undefined &&
    markers?.topologyZoomLensPinProximityRingToken !==
      "--topology-zoom-lens-pin-proximity-ring"
  ) {
    return `WebView Relief zoom lens proximity ring token was ${markers?.topologyZoomLensPinProximityRingToken || "missing"}`;
  }
  if (
    markers?.topologyZoomLensPinGlyphContract &&
    markers.topologyZoomLensPinGlyphContract !==
    "compact-kind-pin-keeps-type-glyph-without-title-card"
  ) {
    return `WebView Relief zoom lens pin glyph contract was ${markers?.topologyZoomLensPinGlyphContract || "missing"}`;
  }
  if (markers?.topologyZoomLensActive === true && !(Number(markers?.topologyZoomLensPinMinOpacity) >= 0.42)) {
    return `WebView Relief zoom lens pin min opacity was ${markers.topologyZoomLensPinMinOpacity || "missing"}`;
  }
  if (
    markers?.topologyZoomLensViewportVisibleContract !== undefined &&
    markers?.topologyZoomLensViewportVisibleContract !== "" &&
    markers?.topologyZoomLensViewportVisibleContract !==
      "visible-lens-pins-match-frame-state"
  ) {
    return `WebView Relief zoom lens viewport-visible contract was ${markers?.topologyZoomLensViewportVisibleContract}`;
  }
  if (
    markers?.topologyZoomLensPinCanvasContract !== undefined &&
    markers?.topologyZoomLensPinCanvasContract !== "" &&
    markers?.topologyZoomLensPinCanvasContract !==
      "zoom-lens-pins-stay-inside-readable-canvas-safe-band"
  ) {
    return `WebView Relief zoom lens pin canvas contract was ${markers?.topologyZoomLensPinCanvasContract}`;
  }
  if (
    markers?.topologyZoomLensPinCanvasMarginPx !== undefined &&
    Number(markers.topologyZoomLensPinCanvasMarginPx) < 32
  ) {
    return `WebView Relief zoom lens pin canvas margin was ${markers.topologyZoomLensPinCanvasMarginPx}`;
  }
  if (
    markers?.topologyZoomLensEmptyViewportFallbackContract !== undefined &&
    markers?.topologyZoomLensEmptyViewportFallbackContract !==
      "camera-zoom-in-keeps-at-least-one-ontology-mark-visible"
  ) {
    return `WebView Relief zoom lens empty viewport fallback contract was ${markers?.topologyZoomLensEmptyViewportFallbackContract || "missing"}`;
  }
  return null;
}


export function validateSelectedRelationCardAttentionLane(markers, width) {
  if (markers?.topologySelectedRelationCardDockContract !== "right-compact-relation-rail") {
    return `WebView Relief selected relation card dock contract was ${markers?.topologySelectedRelationCardDockContract || "missing"}`;
  }
  if (markers?.topologySelectedRelationCardAttentionLane !== "right-inspector-rail") {
    return `WebView Relief selected relation card attention lane was ${markers?.topologySelectedRelationCardAttentionLane || "missing"}`;
  }
  if (
    markers?.topologySelectedRelationCardMapClearanceContract !==
    "selected-label-keeps-map-lane"
  ) {
    return `WebView Relief selected relation card map clearance contract was ${markers?.topologySelectedRelationCardMapClearanceContract || "missing"}`;
  }
  const viewportWidth = Number(width || 0);
  const cardLeft = Number(markers?.topologySelectedRelationCardLeft || 0);
  const cardRight = Number(markers?.topologySelectedRelationCardRight || 0);
  const labelRight = Number(markers?.topologySelectedRelationLabelHitRight || 0);
  if (viewportWidth >= 1400) {
    const rightInset = viewportWidth - cardRight;
    if (!Number.isFinite(rightInset) || rightInset < 24 || rightInset > 96) {
      return `WebView Relief selected relation card left the right inspector lane (right inset ${Number.isFinite(rightInset) ? rightInset : "missing"}px)`;
    }
    const labelGap = cardLeft - labelRight;
    if (
      Number.isFinite(labelRight) &&
      labelRight > 0 &&
      (!Number.isFinite(labelGap) || labelGap < 32)
    ) {
      return `WebView Relief selected relation card crowded the selected relation label (${Number.isFinite(labelGap) ? labelGap : "missing"}px gap)`;
    }
    const panelRight = Number(markers?.topologyAnalysisPanelRight || 0);
    const panelVisible = markers?.topologyAnalysisPanelVisible === true;
    if (panelVisible) {
      const panelGap = cardLeft - panelRight;
      if (!Number.isFinite(panelGap) || panelGap < 32) {
        return `WebView Relief selected relation card crowded the support panel (${Number.isFinite(panelGap) ? panelGap : "missing"}px gap)`;
      }
    }
  }
  return null;
}


export function validateSelectedRelationCardDensityContract(markers, width) {
  const viewportWidth = Number(width || 0);
  if (viewportWidth < 1400) return null;

  if (markers?.topologySelectedRelationCardDensity !== "compact") {
    return `WebView reported malformed Relief selected relation card density (${markers?.topologySelectedRelationCardDensity || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationCardDensityContract !==
    "mini-relation-inspector"
  ) {
    return `WebView reported malformed Relief selected relation card density contract (${markers?.topologySelectedRelationCardDensityContract || "missing"})`;
  }
  if (
    viewportWidth >= 1920 &&
    markers?.topologySelectedRelationCardScaleContract !== "density-fixed-no-ui-zoom"
  ) {
    return `WebView reported malformed Relief selected relation card scale contract (${markers?.topologySelectedRelationCardScaleContract || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationCardTypographyContract !==
    "legible-compact-relation-inspector"
  ) {
    return `WebView reported malformed Relief selected relation typography contract (${markers?.topologySelectedRelationCardTypographyContract || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationCardMaxHeightToken !==
    "--topology-selected-relation-card-max-height"
  ) {
    return `WebView reported malformed Relief selected relation card max-height token (${markers?.topologySelectedRelationCardMaxHeightToken || "missing"})`;
  }
  const expectedTypographyTokens = {
    topologySelectedRelationCardKickerFontSizeToken:
      "--topology-selected-relation-kicker-font-size",
    topologySelectedRelationCardChipFontSizeToken:
      "--topology-selected-relation-chip-font-size",
    topologySelectedRelationCardRouteLabelFontSizeToken:
      "--topology-selected-relation-route-label-font-size",
    topologySelectedRelationCardRouteValueFontSizeToken:
      "--topology-selected-relation-route-value-font-size",
    topologySelectedRelationCardPayloadFontSizeToken:
      "--topology-selected-relation-payload-font-size",
  };
  for (const [marker, token] of Object.entries(expectedTypographyTokens)) {
    if (markers?.[marker] !== token) {
      return `WebView reported malformed Relief selected relation typography token ${marker} (${markers?.[marker] || "missing"})`;
    }
  }
  const routeSteps = Array.isArray(markers?.topologySelectedRelationAgentRouteSteps)
    ? markers.topologySelectedRelationAgentRouteSteps
    : [];
  const routeFontTooSmall = routeSteps.find((step) => {
    if (step?.visibility === "metadata-only" || step?.kind === "action") {
      return false;
    }
    const labelSize = Number.parseFloat(String(step?.labelFontSize || "0"));
    const valueSize = Number.parseFloat(String(step?.valueFontSize || "0"));
    return labelSize < 8 || valueSize < 10;
  });
  if (routeFontTooSmall) {
    return `WebView reported too-small Relief selected relation route typography (${routeFontTooSmall.labelFontSize || "missing"}/${routeFontTooSmall.valueFontSize || "missing"})`;
  }

  const cardWidth = Number(markers?.topologySelectedRelationCardWidth || 0);
  const cardHeight = Number(markers?.topologySelectedRelationCardHeight || 0);
  const selectedRelationCardMaxWidth =
    Number(width || 0) >= 2400 ? 384 : Number(width || 0) >= 1920 ? 360 : 288;
  if (cardWidth > selectedRelationCardMaxWidth || cardHeight > 328) {
    return `WebView reported oversized compact Relief selected relation card (${cardWidth || "missing"}x${cardHeight || "missing"})`;
  }
  if (Number(width || 0) >= 2400 && cardWidth < 336) {
    return `WebView reported cramped wide Relief selected relation card (${cardWidth || "missing"}px)`;
  }

  const proofBandHeight = Number(markers?.topologySelectedRelationProofBandHeight || 0);
  if (proofBandHeight > 44) {
    return `WebView reported oversized Relief selected relation proof band (${proofBandHeight || "missing"}px)`;
  }

  const copyActionRailHeight = Number(
    markers?.topologySelectedRelationCopyActionRailHeight || 0,
  );
  if (copyActionRailHeight > 36) {
    return `WebView reported oversized Relief selected relation copy action rail (${copyActionRailHeight || "missing"}px)`;
  }

  const copyPayloadHeight = Number(markers?.topologySelectedRelationCopyPayloadHeight || 0);
  if (copyPayloadHeight > 48) {
    return `WebView reported oversized Relief selected relation copy payload strip (${copyPayloadHeight || "missing"}px)`;
  }

  const agentRouteHeight = Number(markers?.topologySelectedRelationAgentRouteHeight || 0);
  if (agentRouteHeight > 38) {
    return `WebView reported oversized Relief selected relation agent route rail (${agentRouteHeight || "missing"}px)`;
  }

  if (
    markers?.topologySelectedRelationCommandCueContract !==
    "visible-compact-primary-command-cue"
  ) {
    return `WebView reported malformed Relief selected relation command cue contract (${markers?.topologySelectedRelationCommandCueContract || "missing"})`;
  }
  const commandCueText = String(
    markers?.topologySelectedRelationCommandCueVisibleText || "",
  ).trim();
  if (!commandCueText || !/next step|다음 작업/i.test(commandCueText)) {
    return `WebView reported malformed Relief selected relation command cue text (${commandCueText || "missing"})`;
  }
  const expectedCommandCueAction =
    markers?.topologySelectedRelationPrimaryCopyActionKind || "";
  if (
    expectedCommandCueAction &&
    markers?.topologySelectedRelationCommandCueAction !== expectedCommandCueAction
  ) {
    return `WebView reported mismatched Relief selected relation command cue action (${markers?.topologySelectedRelationCommandCueAction || "missing"})`;
  }

  return null;
}


export function selectedRelationRouteRailTextLeak(payload) {
  const compactBodyText = String(payload?.bodyText || "").replace(/\s+/g, "");
  return /(?:STRONG|SUPPORTED|WEAK|REVIEW)FACT(?:SRC|AUTH|REVIEW)(?:MCP\/CLI|CHECK|REVIEW)(?:EXPLAIN|CHECK)/i.test(
    compactBodyText,
  ) || /S\d+(?:MCP\/CLI|CHECK|REVIEW)/i.test(compactBodyText);
}


export function validateTopologyFocusNoopMarkers(payload) {
  if (payload.markers.topologyFocusNoopAttempted !== true) {
    return `WebView did not attempt selected focus no-op verification (${payload.markers.topologyFocusNoopReason || "unknown reason"})`;
  }
  if (payload.markers.topologyFocusNoopReason !== "done") {
    return `WebView selected focus no-op verification did not finish (${payload.markers.topologyFocusNoopReason || "missing"})`;
  }
  if (payload.markers.topologyFocusNoopAfterTrigger !== "selected-focus-already-safe") {
    return `WebView selected focus no-op trigger was ${payload.markers.topologyFocusNoopAfterTrigger || "missing"}`;
  }
  if (payload.markers.topologyFocusNoopAfterState !== "already-safe") {
    return `WebView selected focus no-op state was ${payload.markers.topologyFocusNoopAfterState || "missing"}`;
  }
  if (Number(payload.markers.topologyFocusNoopAfterDistancePx ?? -1) !== 0) {
    return `WebView selected focus no-op distance was ${payload.markers.topologyFocusNoopAfterDistancePx ?? "missing"}px`;
  }
  return null;
}


export function validateSelectedRelationEndpointRouteMarkers(markers) {
  if (
    markers?.topologySelectedRelationEndpointRouteContract !==
    "visible-source-target-names-wrap"
  ) {
    return `WebView reported malformed Relief selected relation endpoint route contract (${markers?.topologySelectedRelationEndpointRouteContract || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationEndpointRouteWrapPolicy !==
    "wrap-allowed-no-horizontal-overflow"
  ) {
    return `WebView reported malformed Relief selected relation endpoint route wrap policy (${markers?.topologySelectedRelationEndpointRouteWrapPolicy || "missing"})`;
  }
  const routeLineBudget = Number(
    markers?.topologySelectedRelationEndpointRouteLineBudget || 0,
  );
  if (!Number.isFinite(routeLineBudget) || routeLineBudget < 2) {
    return `WebView reported malformed Relief selected relation endpoint route line budget (${markers?.topologySelectedRelationEndpointRouteLineBudget || "missing"})`;
  }
  const sourceName =
    typeof markers?.topologySelectedRelationEndpointRouteSourceName === "string"
      ? markers.topologySelectedRelationEndpointRouteSourceName.trim()
      : "";
  const targetName =
    typeof markers?.topologySelectedRelationEndpointRouteTargetName === "string"
      ? markers.topologySelectedRelationEndpointRouteTargetName.trim()
      : "";
  const sourceHandle =
    typeof markers?.topologySelectedRelationEndpointRouteSourceHandle === "string"
      ? markers.topologySelectedRelationEndpointRouteSourceHandle.trim()
      : "";
  const targetHandle =
    typeof markers?.topologySelectedRelationEndpointRouteTargetHandle === "string"
      ? markers.topologySelectedRelationEndpointRouteTargetHandle.trim()
      : "";
  if (!sourceName || !targetName) {
    return `WebView reported empty Relief selected relation endpoint names (${sourceName || "missing"} -> ${targetName || "missing"})`;
  }
  if (
    sourceHandle !== markers?.topologySelectedRelationCopyPayloadFrom ||
    targetHandle !== markers?.topologySelectedRelationCopyPayloadTo ||
    sourceHandle !== markers?.topologySelectedRelationHandleStripSource ||
    targetHandle !== markers?.topologySelectedRelationHandleStripTarget
  ) {
    return `WebView reported mismatched Relief selected relation visible endpoint handles (${sourceHandle || "missing source"} -> ${targetHandle || "missing target"})`;
  }
  const handleSummary =
    typeof markers?.topologySelectedRelationEndpointRouteHandleSummary === "string"
      ? markers.topologySelectedRelationEndpointRouteHandleSummary.trim()
      : "";
  if (handleSummary !== `${sourceHandle} → ${targetHandle}`) {
    return `WebView reported malformed Relief selected relation visible endpoint handle summary (${handleSummary || "empty"})`;
  }
  const routeText =
    typeof markers?.topologySelectedRelationEndpointRouteText === "string"
      ? markers.topologySelectedRelationEndpointRouteText.trim()
      : "";
  if (!routeText.includes(sourceName) || !routeText.includes(targetName)) {
    return `WebView reported Relief selected relation endpoint names not visible in route (${routeText || "empty"})`;
  }
  const readableRouteText =
    typeof markers?.topologySelectedRelationEndpointRouteReadableText === "string"
      ? markers.topologySelectedRelationEndpointRouteReadableText.trim()
      : "";
  if (readableRouteText !== `${sourceName} → ${targetName}`) {
    return `WebView reported malformed Relief selected relation endpoint readable route (${readableRouteText || "empty"})`;
  }
  const layerReadableRoute =
    typeof markers?.topologySelectedRelationEndpointReadableRoute === "string"
      ? markers.topologySelectedRelationEndpointReadableRoute.trim()
      : "";
  if (layerReadableRoute !== `${sourceName} → ${targetName}`) {
    return `WebView reported malformed Relief selected relation endpoint layer readable route (${layerReadableRoute || "empty"})`;
  }
  const routeWidth = Number(markers?.topologySelectedRelationEndpointRouteWidth || 0);
  const routeHeight = Number(markers?.topologySelectedRelationEndpointRouteHeight || 0);
  const routeClientWidth = Number(
    markers?.topologySelectedRelationEndpointRouteClientWidth || 0,
  );
  const routeScrollWidth = Number(
    markers?.topologySelectedRelationEndpointRouteScrollWidth || 0,
  );
  if (
    !Number.isFinite(routeWidth) ||
    !Number.isFinite(routeHeight) ||
    !Number.isFinite(routeClientWidth) ||
    !Number.isFinite(routeScrollWidth) ||
    routeWidth < 120 ||
    routeHeight < 12 ||
    routeScrollWidth - routeClientWidth > 2
  ) {
    return `WebView reported overflowing Relief selected relation endpoint route (${routeClientWidth} client / ${routeScrollWidth} scroll, ${routeWidth}x${routeHeight})`;
  }
  return null;
}


export function validateSelectedRelationIdentityMarkers(markers) {
  if (markers?.topologySelectedRelationVerifySelected !== true) {
    return null;
  }
  if (
    markers?.topologyAgentCurrentSurface &&
    markers.topologyAgentCurrentSurface !== "selected-relation"
  ) {
    return `WebView reported selected relation while current surface was ${markers.topologyAgentCurrentSurface}`;
  }
  const edgeId =
    typeof markers?.topologySelectedRelationEdgeId === "string"
      ? markers.topologySelectedRelationEdgeId.trim()
      : "";
  if (!edgeId) {
    return "WebView did not expose the Relief selected relation edge id";
  }
  const route =
    typeof markers?.topologyAgentCurrentSurfaceRoute === "string"
      ? markers.topologyAgentCurrentSurfaceRoute.trim()
      : "";
  const labelRoute =
    typeof markers?.topologySelectedRelationLabelRoute === "string"
      ? markers.topologySelectedRelationLabelRoute.trim()
      : "";
  const source =
    typeof markers?.topologySelectedRelationLabelSource === "string"
      ? markers.topologySelectedRelationLabelSource.trim()
      : "";
  const target =
    typeof markers?.topologySelectedRelationLabelTarget === "string"
      ? markers.topologySelectedRelationLabelTarget.trim()
      : "";
  const expectedRoute = source && target ? `${source}>${target}` : labelRoute;
  if (route && expectedRoute && route !== expectedRoute) {
    return `WebView reported mismatched Relief selected relation route (${route} vs ${expectedRoute})`;
  }
  return null;
}


export function validateSelectedRelationEndpointVisibilityMarkers(markers) {
  if (markers?.topologyCardsReady !== true) {
    return "WebView Relief selected relation endpoint proof ran while the skeleton card layer was not ready";
  }
  if (
    markers?.topologySelectedRelationEndpointVisibilityContract !==
    "selected-relation-keeps-source-target-readable"
  ) {
    return `WebView reported malformed Relief selected relation endpoint visibility contract (${markers?.topologySelectedRelationEndpointVisibilityContract || "missing"})`;
  }
  const expectedCount = Number(
    markers?.topologySelectedRelationEndpointExpectedCount || 0,
  );
  const visibleCount = Number(markers?.topologySelectedRelationEndpointVisibleCount || 0);
  const hiddenCount = Number(markers?.topologySelectedRelationEndpointHiddenCount || 0);
  const endpointCards = Array.isArray(markers?.topologySelectedRelationEndpointCards)
    ? markers.topologySelectedRelationEndpointCards
    : [];
  const source =
    typeof markers?.topologySelectedRelationCardSource === "string"
      ? markers.topologySelectedRelationCardSource.trim()
      : "";
  const target =
    typeof markers?.topologySelectedRelationCardTarget === "string"
      ? markers.topologySelectedRelationCardTarget.trim()
      : "";
  const endpointSlugs = new Set(
    endpointCards.map((card) => card?.slug).filter((slug) => typeof slug === "string"),
  );
  if (
    !Number.isFinite(expectedCount) ||
    !Number.isFinite(visibleCount) ||
    !Number.isFinite(hiddenCount) ||
    expectedCount < 2 ||
    visibleCount < 2 ||
    hiddenCount !== 0 ||
    endpointCards.length < 2
  ) {
    return `WebView reported incomplete Relief selected relation endpoint visibility proof (${visibleCount}/${expectedCount} visible, ${hiddenCount} hidden)`;
  }
  if (!source || !target || !endpointSlugs.has(source) || !endpointSlugs.has(target)) {
    return `WebView reported Relief selected relation endpoint cards without source and target (${source || "missing source"} -> ${target || "missing target"})`;
  }
  const hiddenEndpoint = endpointCards.find(
    (card) => card?.surfaceHidden === "true" || card?.visible === false,
  );
  if (hiddenEndpoint) {
    return `WebView reported hidden Relief selected relation endpoint card (${hiddenEndpoint.slug || "unknown endpoint"})`;
  }
  const sourceEndpoint = endpointCards.find((card) => card?.slug === source);
  const targetEndpoint = endpointCards.find((card) => card?.slug === target);
  if (
    sourceEndpoint?.roleBadgeContract !== "visible-source-target-role-badge" ||
    sourceEndpoint?.roleBadgeText !== "FROM" ||
    sourceEndpoint?.roleBadgeVisible !== true
  ) {
    return `WebView reported malformed Relief selected relation source role badge (${sourceEndpoint?.roleBadgeText || "missing"})`;
  }
  if (
    targetEndpoint?.roleBadgeContract !== "visible-source-target-role-badge" ||
    targetEndpoint?.roleBadgeText !== "TO" ||
    targetEndpoint?.roleBadgeVisible !== true
  ) {
    return `WebView reported malformed Relief selected relation target role badge (${targetEndpoint?.roleBadgeText || "missing"})`;
  }
  return null;
}


export function validateSelectedRelationContextSilhouetteMarkers(markers) {
  if (
    markers?.topologySelectedRelationContextSilhouettePolicy !==
    "selected-relation-keeps-endpoints-and-orientation-anchors-only"
  ) {
    return `WebView reported malformed Relief selected relation context silhouette policy (${markers?.topologySelectedRelationContextSilhouettePolicy || "missing"})`;
  }
  if (markers?.topologySelectedRelationContextSilhouetteActive !== true) {
    return "WebView did not activate Relief selected relation context silhouette suppression";
  }
  const hiddenCount = Number(
    markers?.topologySelectedRelationContextSilhouetteHiddenCount || 0,
  );
  const lowerPriorityVisibleDimmedCount = Number(
    markers?.topologySelectedRelationLowerPriorityVisibleDimmedCount || 0,
  );
  const visibleOrientationAnchorCount = Number(
    markers?.topologySelectedRelationVisibleOrientationAnchorCount || 0,
  );
  if (
    !Number.isFinite(hiddenCount) ||
    !Number.isFinite(lowerPriorityVisibleDimmedCount) ||
    !Number.isFinite(visibleOrientationAnchorCount) ||
    hiddenCount < 1 ||
    lowerPriorityVisibleDimmedCount !== 0
  ) {
    return `WebView reported noisy Relief selected relation context (${hiddenCount} hidden / ${lowerPriorityVisibleDimmedCount} lower-priority visible / ${visibleOrientationAnchorCount} anchors)`;
  }
  if (
    markers?.topologySelectedRelationHiddenContextInteractionContract !==
    "hidden-context-is-not-pointer-focus-or-a11y-target"
  ) {
    return `WebView reported malformed Relief selected relation hidden context interaction contract (${markers?.topologySelectedRelationHiddenContextInteractionContract || "missing"})`;
  }
  const hiddenContextInteractiveCount = Number(
    markers?.topologySelectedRelationHiddenContextInteractiveCount || 0,
  );
  if (
    !Number.isFinite(hiddenContextInteractiveCount) ||
    hiddenContextInteractiveCount !== 0
  ) {
    return `WebView reported interactive hidden Relief selected relation context (${hiddenContextInteractiveCount || "missing"})`;
  }
  return null;
}


export async function waitForWebviewVerifyPayload(readStdout, {
  timeoutMs = WEBVIEW_VERIFY_TIMEOUT_MS,
  intervalMs = 100,
  validatePayload = () => null,
} = {}) {
  const started = Date.now();
  let payload = parseWebviewVerifyPayload(readStdout());
  let validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  while ((!payload || validationError) && Date.now() - started < timeoutMs) {
    await sleep(intervalMs);
    payload = parseWebviewVerifyPayload(readStdout());
    validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  }
  return { payload, validationError };
}


export function markerNumber(markers, key) {
  const value = Number(markers?.[key]);
  return Number.isFinite(value) ? value : null;
}


export function markerText(markers, key) {
  const value = markers?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}


export function extractBackdropAlpha(background) {
  const value = String(background || "");
  const alpha = Number(
    value.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/)?.[1] ||
    value.match(/\/\s*([0-9.]+)\s*\)/)?.[1] ||
    "0",
  );
  return Number.isFinite(alpha) ? alpha : null;
}


export function evidenceRoute(href) {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

