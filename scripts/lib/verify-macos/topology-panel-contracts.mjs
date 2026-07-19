export function validateTopologyNodePopoverScrollFooterContract(markers) {
  if (markers.topologyNodePopoverFooterVisible !== true) {
    return "WebView Relief selected node popover footer was not measurable";
  }
  if (markers.topologyNodePopoverFooterContract !== "fixed-outside-scroll-region") {
    return `WebView Relief selected node popover footer contract was ${markers.topologyNodePopoverFooterContract || "missing"}`;
  }
  if (markers.topologyNodePopoverFooterPositionContract !== "anchored-bottom-visible") {
    return `WebView Relief selected node popover footer position contract was ${markers.topologyNodePopoverFooterPositionContract || "missing"}`;
  }
  if (markers.topologyNodePopoverFooterOverflowContract !== "no-horizontal-scroll") {
    return `WebView Relief selected node popover footer overflow contract was ${markers.topologyNodePopoverFooterOverflowContract || "missing"}`;
  }
  const connectionListTop = Number(markers.topologyNodePopoverConnectionListTop || 0);
  const connectionListBottom = Number(markers.topologyNodePopoverConnectionListBottom || 0);
  const footerTop = Number(markers.topologyNodePopoverFooterTop || 0);
  const footerBottom = Number(markers.topologyNodePopoverFooterBottom || 0);
  const popoverBottom = Number(markers.topologyNodePopoverBottom || 0);
  const rowHeight = Number(markers.topologyNodePopoverRelationRowHeight || 0);
  const visibleRowHeight = Number(markers.topologyNodePopoverVisibleRelationRowHeight || 0);
  if (
    !Number.isFinite(connectionListBottom) ||
    !Number.isFinite(footerTop) ||
    connectionListBottom <= 0 ||
    footerTop <= 0 ||
    footerTop < connectionListBottom - 2
  ) {
    return `WebView Relief selected node popover footer overlapped the connection list (${footerTop || "missing"} top / ${connectionListBottom || "missing"} list bottom)`;
  }
  const connectionListHeight = connectionListBottom - connectionListTop;
  const minReadableConnectionListHeight =
    Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight * 2 : 160;
  if (
    !Number.isFinite(connectionListHeight) ||
    connectionListTop <= 0 ||
    connectionListBottom <= 0 ||
    connectionListHeight < minReadableConnectionListHeight
  ) {
    return `WebView Relief selected node popover connection list was too short (${Number.isFinite(connectionListHeight) ? connectionListHeight : "missing"}px / ${Number.isFinite(minReadableConnectionListHeight) ? minReadableConnectionListHeight : "missing"}px minimum)`;
  }
  if (
    !Number.isFinite(rowHeight) ||
    !Number.isFinite(visibleRowHeight) ||
    rowHeight <= 0 ||
    visibleRowHeight < rowHeight - 1 ||
    markers.topologyNodePopoverRelationRowFullyVisible !== true
  ) {
    return `WebView Relief selected node popover first relation row was not fully visible (${visibleRowHeight || "missing"}px visible / ${rowHeight || "missing"}px row)`;
  }
  if (
    !Number.isFinite(footerBottom) ||
    !Number.isFinite(popoverBottom) ||
    footerBottom <= 0 ||
    popoverBottom <= 0 ||
    footerBottom > popoverBottom + 2
  ) {
    return `WebView Relief selected node popover footer overflowed the inspector rail (${footerBottom || "missing"} footer bottom / ${popoverBottom || "missing"} popover bottom)`;
  }
  const footerClientWidth = Number(markers.topologyNodePopoverFooterClientWidth || 0);
  const footerScrollWidth = Number(markers.topologyNodePopoverFooterScrollWidth || 0);
  if (
    !Number.isFinite(footerClientWidth) ||
    !Number.isFinite(footerScrollWidth) ||
    footerClientWidth < 180 ||
    footerScrollWidth - footerClientWidth > 2
  ) {
    return `WebView Relief selected node popover footer overflowed (${footerClientWidth} client / ${footerScrollWidth} scroll)`;
  }
  return null;
}


export function validateTopologyFocusCommandSpineContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologyFocusCommandSpineVisible !== true) {
    return "WebView Relief selected focus command spine was not visible";
  }
  if (
    markers.topologyFocusCommandSpineHierarchy !==
    "brief-primary-review-agent-proof"
  ) {
    return `WebView Relief selected focus command hierarchy was ${markers.topologyFocusCommandSpineHierarchy || "missing"}`;
  }
  if (markers.topologyFocusCommandSpineAttentionLayer !== "support-command-spine") {
    return `WebView Relief selected focus command attention layer was ${markers.topologyFocusCommandSpineAttentionLayer || "missing"}`;
  }
  if (markers.topologyFocusCommandSpineTokenizedSurface !== "topology-command-spine") {
    return `WebView Relief selected focus command surface token was ${markers.topologyFocusCommandSpineTokenizedSurface || "missing"}`;
  }
  if (markers.topologyAnalysisPanelSurfaceToken !== "--topology-panel-support-surface") {
    return `WebView Relief selected focus panel surface token was ${markers.topologyAnalysisPanelSurfaceToken || "missing"}`;
  }
  if (markers.topologyAnalysisPanelCommandSpinePaddingToken !== "--topology-command-spine-padding") {
    return `WebView Relief selected focus panel command padding token was ${markers.topologyAnalysisPanelCommandSpinePaddingToken || "missing"}`;
  }
  if (markers.topologyAnalysisPanelCommandSpineGapToken !== "--topology-command-spine-gap") {
    return `WebView Relief selected focus panel command gap token was ${markers.topologyAnalysisPanelCommandSpineGapToken || "missing"}`;
  }
  if (
    markers.topologyAnalysisPanelCommandPrimaryHeightToken !==
    "--topology-command-primary-min-height"
  ) {
    return `WebView Relief selected focus primary action height token was ${markers.topologyAnalysisPanelCommandPrimaryHeightToken || "missing"}`;
  }
  if (
    markers.topologyAnalysisPanelCommandSpineSurfaceToken !==
      "--topology-command-spine-surface" ||
    markers.topologyFocusCommandSpineSurfaceToken !==
      "--topology-command-spine-surface"
  ) {
    return `WebView Relief selected focus command spine surface token was ${markers.topologyFocusCommandSpineSurfaceToken || markers.topologyAnalysisPanelCommandSpineSurfaceToken || "missing"}`;
  }
  if (
    markers.topologyAnalysisPanelCommandSpineBorderToken !==
      "--topology-command-spine-border" ||
    markers.topologyFocusCommandSpineBorderToken !==
      "--topology-command-spine-border"
  ) {
    return `WebView Relief selected focus command spine border token was ${markers.topologyFocusCommandSpineBorderToken || markers.topologyAnalysisPanelCommandSpineBorderToken || "missing"}`;
  }
  if (
    markers.topologyFocusCommandPrimaryActionSurfaceToken !==
      "--topology-command-primary-surface" ||
    markers.topologyFocusCommandPrimaryActionBorderToken !==
      "--topology-command-primary-border"
  ) {
    return `WebView Relief selected focus primary command token was ${markers.topologyFocusCommandPrimaryActionSurfaceToken || markers.topologyFocusCommandPrimaryActionBorderToken || "missing"}`;
  }
  const commandSpineWidth = Number(markers.topologyFocusCommandSpineWidth || 0);
  const commandSpineHeight = Number(markers.topologyFocusCommandSpineHeight || 0);
  const primaryActionWidth = Number(markers.topologyFocusCommandPrimaryActionWidth || 0);
  const primaryActionHeight = Number(markers.topologyFocusCommandPrimaryActionHeight || 0);
  if (
    !Number.isFinite(commandSpineWidth) ||
    !Number.isFinite(commandSpineHeight) ||
    commandSpineWidth < 200 ||
    commandSpineHeight < 180
  ) {
    return `WebView Relief selected focus command spine was undersized (${commandSpineWidth}x${commandSpineHeight})`;
  }
  if (
    markers.topologyFocusCommandPrimaryActionVisible !== true ||
    !/(Copy focus brief|브리프 복사)/i.test(
      String(markers.topologyFocusCommandPrimaryActionText || ""),
    ) ||
    primaryActionWidth < 180 ||
    primaryActionHeight < 40
  ) {
    return `WebView Relief selected focus primary command was malformed (${markers.topologyFocusCommandPrimaryActionText || "missing"} · ${primaryActionWidth}x${primaryActionHeight})`;
  }
  if (markers.topologyFocusReviewOrderVisible !== true) {
    return "WebView Relief selected focus review order was not visible";
  }
  if (markers.topologyFocusSecondaryActionsVisible !== true) {
    return "WebView Relief selected focus secondary actions were not visible";
  }
  if (
    markers.topologyFocusAgentHandoffVisible !== true ||
    markers.topologyFocusAgentHandoffContract !== "mcp-cli-proof-disclosed"
  ) {
    return `WebView Relief selected focus agent handoff contract was ${markers.topologyFocusAgentHandoffContract || "missing"}`;
  }
  return null;
}


export function validateTopologyNodePopoverTokenContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologyNodePopoverVisible !== true) return null;
  const collapsed = markers.topologyNodePopoverCollapsed === true;
  const expectedWidthToken = "--topology-node-popover-fluid-width";
  const expectedRailToken = "--topology-node-popover-rail-width";
  const expectedWidthContract = collapsed
    ? "fluid-chip-to-rail"
    : "fluid-inspector-to-rail";
  if (markers.topologyNodePopoverWidthToken !== expectedWidthToken) {
    return `WebView Relief selected node popover width token was ${markers.topologyNodePopoverWidthToken || "missing"}`;
  }
  if (markers.topologyNodePopoverRailWidthToken !== expectedRailToken) {
    return `WebView Relief selected node popover rail token was ${markers.topologyNodePopoverRailWidthToken || "missing"}`;
  }
  if (markers.topologyNodePopoverResponsiveWidthContract !== expectedWidthContract) {
    return `WebView Relief selected node popover responsive width contract was ${markers.topologyNodePopoverResponsiveWidthContract || "missing"}`;
  }
  if (markers.topologyNodePopoverCompactHandoffContract !== "selected-node-actions-visible") {
    return `WebView Relief selected node popover compact handoff contract was ${markers.topologyNodePopoverCompactHandoffContract || "missing"}`;
  }
  if (markers.topologyNodePopoverAgentHandoffContract !== "selected-node-actions-visible") {
    return `WebView Relief selected node popover root handoff contract was ${markers.topologyNodePopoverAgentHandoffContract || "missing"}`;
  }
  if (markers.topologyNodePopoverAgentHandoffRoute !== "selected-node>facts>actions") {
    return `WebView Relief selected node popover root handoff route was ${markers.topologyNodePopoverAgentHandoffRoute || "missing"}`;
  }
  if (markers.topologyNodePopoverAgentHandoffPrimaryAction !== "focus-brief") {
    return `WebView Relief selected node popover root handoff primary action was ${markers.topologyNodePopoverAgentHandoffPrimaryAction || "missing"}`;
  }
  if (Number(markers.topologyNodePopoverAgentHandoffActionCount || 0) < 1) {
    return `WebView Relief selected node popover root handoff action count was ${markers.topologyNodePopoverAgentHandoffActionCount || "missing"}`;
  }
  if (Number(markers.topologyNodePopoverAgentHandoffRelationFactCount || 0) < 1) {
    return `WebView Relief selected node popover root handoff relation fact count was ${markers.topologyNodePopoverAgentHandoffRelationFactCount || "missing"}`;
  }
  if (Number(markers.topologyNodePopoverAgentHandoffRelationTypeCount || 0) < 1) {
    return `WebView Relief selected node popover root handoff relation type count was ${markers.topologyNodePopoverAgentHandoffRelationTypeCount || "missing"}`;
  }
  if (markers.topologyNodePopoverAgentHandoffSummaryContract !== "visible-mcp-cli-focus-brief") {
    return `WebView Relief selected node popover root handoff summary contract was ${markers.topologyNodePopoverAgentHandoffSummaryContract || "missing"}`;
  }
  const rootHandoffSummary = String(
    markers.topologyNodePopoverAgentHandoffVisibleSummary || "",
  ).trim();
  if (!rootHandoffSummary.includes("MCP/CLI") || !rootHandoffSummary.length) {
    return `WebView Relief selected node popover root handoff summary was ${rootHandoffSummary || "missing"}`;
  }
  if (
    markers.topologyNodePopoverAgentHandoffSelectedNode !== markers.topologySelectedNodeId
  ) {
    return `WebView Relief selected node popover root handoff selected node was ${markers.topologyNodePopoverAgentHandoffSelectedNode || "missing"}`;
  }
  if (collapsed) {
    if (markers.topologyNodePopoverCompactCommandRowVisible !== true) {
      return "WebView Relief selected node popover compact command row was not visible";
    }
    if (
      markers.topologyNodePopoverCompactCommandRowContract !==
      "facts-and-actions-share-final-scanline"
    ) {
      return `WebView Relief selected node popover compact command row contract was ${markers.topologyNodePopoverCompactCommandRowContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactCommandRowGapToken !==
      "--topology-node-popover-compact-command-row-gap"
    ) {
      return `WebView Relief selected node popover compact command row gap token was ${markers.topologyNodePopoverCompactCommandRowGapToken || "missing"}`;
    }
    if (markers.topologyNodePopoverCompactActionsContract !== "actions-share-command-row-with-facts") {
      return `WebView Relief selected node popover compact actions contract was ${markers.topologyNodePopoverCompactActionsContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactActionsReadableFlow !==
      "selected-node-facts-to-agent-handoff"
    ) {
      return `WebView Relief selected node popover compact actions readable flow was ${markers.topologyNodePopoverCompactActionsReadableFlow || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactRelationFactsContract !==
      "collapsed-dock-surfaces-typed-facts"
    ) {
      return `WebView Relief selected node popover compact relation facts contract was ${markers.topologyNodePopoverCompactRelationFactsContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactRelationFactsReadableContract !==
      "direct-typed-facts-not-scores"
    ) {
      return `WebView Relief selected node popover compact relation facts readable contract was ${markers.topologyNodePopoverCompactRelationFactsReadableContract || "missing"}`;
    }
    const relationFactsNoScores = String(
      markers.topologyNodePopoverCompactRelationFactsNoScores || "",
    ).trim();
    if (!relationFactsNoScores) {
      return "WebView Relief selected node popover compact relation facts no-scores text was missing";
    }
    const relationFactsAccessibleName = String(
      markers.topologyNodePopoverCompactRelationFactsAccessibleName || "",
    ).trim();
    if (!relationFactsAccessibleName.includes(relationFactsNoScores)) {
      return `WebView Relief selected node popover compact relation facts accessible name did not include no-scores text (${relationFactsAccessibleName || "missing"})`;
    }
    if (
      String(markers.topologyNodePopoverCompactRelationFactsTitle || "").trim() !==
      relationFactsAccessibleName
    ) {
      return "WebView Relief selected node popover compact relation facts title did not match accessible name";
    }
    if (
      markers.topologyNodePopoverCompactRelationFactsHandoffContract !==
      "compact-counts-route-to-relation-list-handoff"
    ) {
      return `WebView Relief selected node popover compact relation facts handoff contract was ${markers.topologyNodePopoverCompactRelationFactsHandoffContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactRelationFactsHandoffRoute !==
      "selected-node>relations>fact>evidence>gate>action>payload"
    ) {
      return `WebView Relief selected node popover compact relation facts handoff route was ${markers.topologyNodePopoverCompactRelationFactsHandoffRoute || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactRelationFactsHandoffTool !==
      "query_ontology"
    ) {
      return `WebView Relief selected node popover compact relation facts handoff tool was ${markers.topologyNodePopoverCompactRelationFactsHandoffTool || "missing"}`;
    }
    const relationFactsHandoffSummary = String(
      markers.topologyNodePopoverCompactRelationFactsHandoffSummary || "",
    ).trim();
    if (
      !relationFactsHandoffSummary.includes("query_ontology") ||
      !relationFactsHandoffSummary.includes("direct facts")
    ) {
      return `WebView Relief selected node popover compact relation facts handoff summary was ${relationFactsHandoffSummary || "missing"}`;
    }
    const hiddenRemainderCount = Number(
      markers.topologyNodePopoverCompactRelationFactsHiddenRemainderCount,
    );
    if (!Number.isFinite(hiddenRemainderCount) || hiddenRemainderCount < 0) {
      return `WebView Relief selected node popover compact relation facts hidden remainder count was ${markers.topologyNodePopoverCompactRelationFactsHiddenRemainderCount ?? "missing"}`;
    }
    const factsTop = Number(markers.topologyNodePopoverCompactRelationFactsTop || 0);
    const actionsTop = Number(markers.topologyNodePopoverCompactActionsTop || 0);
    if (
      markers.topologyNodePopoverCompactRelationFactsVisible === true &&
      markers.topologyNodePopoverCompactActionsVisible === true &&
      Math.abs(factsTop - actionsTop) > 8
    ) {
      return `WebView Relief selected node popover compact facts/actions were not on one scanline (${factsTop} vs ${actionsTop})`;
    }
    if (markers.topologyNodePopoverCompactHandoffSummaryVisible !== true) {
      return "WebView Relief selected node popover compact handoff summary was not visible";
    }
    if (
      markers.topologyNodePopoverCompactHandoffSummaryContract !==
      "visible-mcp-cli-focus-brief"
    ) {
      return `WebView Relief selected node popover compact handoff summary contract was ${markers.topologyNodePopoverCompactHandoffSummaryContract || "missing"}`;
    }
    if (String(markers.topologyNodePopoverCompactHandoffSummaryVisibleLabel || "").trim() !== "MCP/CLI") {
      return `WebView Relief selected node popover compact handoff visible label was ${markers.topologyNodePopoverCompactHandoffSummaryVisibleLabel || "missing"}`;
    }
    const compactHandoffSummary = String(
      markers.topologyNodePopoverCompactHandoffSummaryText || "",
    ).trim();
    if (compactHandoffSummary !== rootHandoffSummary) {
      return `WebView Relief selected node popover compact handoff summary was ${compactHandoffSummary || "missing"} vs ${rootHandoffSummary}`;
    }
    if (
      markers.topologyNodePopoverCompactHandoffSummarySelectedNode !==
      markers.topologySelectedNodeId
    ) {
      return `WebView Relief selected node popover compact handoff selected node was ${markers.topologyNodePopoverCompactHandoffSummarySelectedNode || "missing"}`;
    }
    const handoffSummaryClientWidth = Number(
      markers.topologyNodePopoverCompactHandoffSummaryClientWidth || 0,
    );
    const handoffSummaryScrollWidth = Number(
      markers.topologyNodePopoverCompactHandoffSummaryScrollWidth || 0,
    );
    if (
      !Number.isFinite(handoffSummaryClientWidth) ||
      !Number.isFinite(handoffSummaryScrollWidth) ||
      handoffSummaryClientWidth < 72 ||
      handoffSummaryScrollWidth - handoffSummaryClientWidth > 2
    ) {
      return `WebView Relief selected node popover compact handoff summary overflowed (${handoffSummaryClientWidth} client / ${handoffSummaryScrollWidth} scroll)`;
    }
    const handoffSummaryTop = Number(markers.topologyNodePopoverCompactHandoffSummaryTop || 0);
    if (
      markers.topologyNodePopoverCompactRelationFactsVisible === true &&
      Math.abs(factsTop - handoffSummaryTop) > 8
    ) {
      return `WebView Relief selected node popover compact facts/handoff summary were not on one scanline (${factsTop} vs ${handoffSummaryTop})`;
    }
    if (markers.topologyNodePopoverCompactMeaningContract !== "plain-language-meaning-before-typed-facts") {
      return `WebView Relief selected node popover compact meaning contract was ${markers.topologyNodePopoverCompactMeaningContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactMeaningResponsiveContract !==
      "visible-desktop-sr-only-compact"
    ) {
      return `WebView Relief selected node popover compact meaning responsive contract was ${markers.topologyNodePopoverCompactMeaningResponsiveContract || "missing"}`;
    }
    if (!String(markers.topologyNodePopoverCompactMeaningText || "").trim()) {
      return "WebView Relief selected node popover compact meaning text was missing";
    }
    if (!/^(core|support|leaf)$/.test(String(markers.topologyNodePopoverCompactMeaningLevel || ""))) {
      return `WebView Relief selected node popover compact meaning level was ${markers.topologyNodePopoverCompactMeaningLevel || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactMeaningTextToken !==
      "--topology-node-popover-compact-meaning-text"
    ) {
      return `WebView Relief selected node popover compact meaning text token was ${markers.topologyNodePopoverCompactMeaningTextToken || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactMeaningSizeToken !==
      "--topology-node-popover-compact-meaning-size"
    ) {
      return `WebView Relief selected node popover compact meaning size token was ${markers.topologyNodePopoverCompactMeaningSizeToken || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactMeaningLeadingToken !==
      "--topology-node-popover-compact-meaning-leading"
    ) {
      return `WebView Relief selected node popover compact meaning leading token was ${markers.topologyNodePopoverCompactMeaningLeadingToken || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactMeaningGapToken !==
      "--topology-node-popover-compact-meaning-gap"
    ) {
      return `WebView Relief selected node popover compact meaning gap token was ${markers.topologyNodePopoverCompactMeaningGapToken || "missing"}`;
    }
  }
  if (
    markers.topologyNodePopoverScrollContract !==
    (collapsed ? "collapsed-chip-no-scroll" : "expanded-internal-scroll")
  ) {
    return `WebView Relief selected node popover scroll contract was ${markers.topologyNodePopoverScrollContract || "missing"}`;
  }
  if (collapsed && markers.topologyNodePopoverOverflowY !== "hidden") {
    return `WebView Relief selected node popover collapsed overflow-y was ${markers.topologyNodePopoverOverflowY || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverOverflowY !== "hidden") {
    return `WebView Relief selected node popover expanded root overflow-y was ${markers.topologyNodePopoverOverflowY || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverBodyScrollContract !== "content-scrolls-above-fixed-footer") {
    return `WebView Relief selected node popover body scroll contract was ${markers.topologyNodePopoverBodyScrollContract || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverBodyOverflowY !== "auto") {
    return `WebView Relief selected node popover body overflow-y was ${markers.topologyNodePopoverBodyOverflowY || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverBodyOverflowX !== "hidden") {
    return `WebView Relief selected node popover body overflow-x was ${markers.topologyNodePopoverBodyOverflowX || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverOverflowX !== "hidden") {
    return `WebView Relief selected node popover expanded overflow-x was ${markers.topologyNodePopoverOverflowX || "missing"}`;
  }
  if (markers.topologyNodePopoverSurfaceToken !== "--topology-node-popover-surface") {
    return `WebView Relief selected node popover surface token was ${markers.topologyNodePopoverSurfaceToken || "missing"}`;
  }
  if (markers.topologyNodePopoverBorderToken !== "--topology-node-popover-border") {
    return `WebView Relief selected node popover border token was ${markers.topologyNodePopoverBorderToken || "missing"}`;
  }
  if (collapsed) {
    if (markers.topologyNodePopoverCompactBriefActionVisible !== true) {
      return "WebView Relief selected node popover compact brief action was not visible";
    }
    if (markers.topologyNodePopoverCompactBriefActionKind !== "focus-brief") {
      return `WebView Relief selected node popover compact brief action was ${markers.topologyNodePopoverCompactBriefActionKind || "missing"}`;
    }
    if (markers.topologyNodePopoverCompactBriefActionContract !== "copy-focus-brief") {
      return `WebView Relief selected node popover compact brief action contract was ${markers.topologyNodePopoverCompactBriefActionContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactBriefActionReadableFlow !==
      "selected-node-facts-to-agent-brief"
    ) {
      return `WebView Relief selected node popover compact brief action readable flow was ${markers.topologyNodePopoverCompactBriefActionReadableFlow || "missing"}`;
    }
    if (!String(markers.topologyNodePopoverCompactBriefActionRailLabel || "").trim()) {
      return "WebView Relief selected node popover compact brief action rail label was missing";
    }
    if (
      !String(markers.topologyNodePopoverCompactBriefActionTitle || "").includes(
        String(markers.topologyNodePopoverCompactBriefActionRailLabel || ""),
      )
    ) {
      return `WebView Relief selected node popover compact brief action title did not include rail label (${markers.topologyNodePopoverCompactBriefActionTitle || "missing"})`;
    }
    if (
      markers.topologyNodePopoverCompactBriefActionSurfaceToken !==
      "--topology-node-popover-action-icon-surface"
    ) {
      return `WebView Relief selected node popover compact brief action surface token was ${markers.topologyNodePopoverCompactBriefActionSurfaceToken || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactBriefActionBorderToken !==
      "--topology-node-popover-action-icon-border"
    ) {
      return `WebView Relief selected node popover compact brief action border token was ${markers.topologyNodePopoverCompactBriefActionBorderToken || "missing"}`;
    }
    const actionWidth = Number(markers.topologyNodePopoverCompactBriefActionWidth || 0);
    const actionHeight = Number(markers.topologyNodePopoverCompactBriefActionHeight || 0);
    if (
      !Number.isFinite(actionWidth) ||
      !Number.isFinite(actionHeight) ||
      actionWidth < 56 ||
      actionWidth > 88 ||
      actionHeight < 28 ||
      actionHeight > 44
    ) {
      return `WebView Relief selected node popover compact brief action was malformed (${actionWidth}x${actionHeight})`;
    }
  }
  if (!collapsed) {
    if (markers.topologyNodePopoverActionRailVisible !== true) {
      return "WebView Relief selected node popover action rail was not visible";
    }
    if (markers.topologyNodePopoverActionRailContract !== "compact-mcp-cli-handoff") {
      return `WebView Relief selected node popover action rail contract was ${markers.topologyNodePopoverActionRailContract || "missing"}`;
    }
    if (Number(markers.topologyNodePopoverActionRailCount || 0) < 3) {
      return `WebView Relief selected node popover action rail count was ${markers.topologyNodePopoverActionRailCount || "missing"}`;
    }
  }
  if (!collapsed && markers.topologyNodePopoverMaxHeightToken !== "--topology-node-popover-max-height") {
    return `WebView Relief selected node popover max-height token was ${markers.topologyNodePopoverMaxHeightToken || "missing"}`;
  }
  if (!collapsed) {
    const popoverClientWidth = Number(markers.topologyNodePopoverClientWidth || 0);
    const popoverScrollWidth = Number(markers.topologyNodePopoverScrollWidth || 0);
    if (
      !Number.isFinite(popoverClientWidth) ||
      !Number.isFinite(popoverScrollWidth) ||
      popoverClientWidth < 180 ||
      popoverScrollWidth - popoverClientWidth > 2
    ) {
      return `WebView Relief selected node popover horizontally overflowed (${popoverClientWidth} client / ${popoverScrollWidth} scroll)`;
    }
  }
  return null;
}


export function validateTopologySelectedCardRelationSummaryContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologySelectedNodePopoverVisible !== true) return null;
  if (markers.topologySelectedSkeletonCardRelationSummaryVisible !== true) {
    return "WebView Relief selected skeleton card relation summary was not visible";
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummaryContract !==
    "selected-card-direct-facts"
  ) {
    return `WebView Relief selected skeleton card relation summary contract was ${markers.topologySelectedSkeletonCardRelationSummaryContract || "missing"}`;
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummarySurfaceToken !==
    "--topology-relation-summary-surface"
  ) {
    return `WebView Relief selected skeleton card relation summary surface token was ${markers.topologySelectedSkeletonCardRelationSummarySurfaceToken || "missing"}`;
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummaryBorderToken !==
    "--topology-relation-summary-border"
  ) {
    return `WebView Relief selected skeleton card relation summary border token was ${markers.topologySelectedSkeletonCardRelationSummaryBorderToken || "missing"}`;
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummaryTextToken !==
    "--topology-relation-summary-text"
  ) {
    return `WebView Relief selected skeleton card relation summary text token was ${markers.topologySelectedSkeletonCardRelationSummaryTextToken || "missing"}`;
  }
  if (Number(markers.topologySelectedSkeletonCardRelationSummaryCount || 0) < 1) {
    return `WebView Relief selected skeleton card relation summary count was ${markers.topologySelectedSkeletonCardRelationSummaryCount || "missing"}`;
  }
  if (Number(markers.topologySelectedSkeletonCardRelationSummaryTypeCount || 0) < 1) {
    return `WebView Relief selected skeleton card relation summary type count was ${markers.topologySelectedSkeletonCardRelationSummaryTypeCount || "missing"}`;
  }
  return null;
}


export function validateTopologyFocusUtilityLaneContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (
    markers.topologyCommandChromeState !== "compact-focus" &&
    markers.topologyCommandChromeState !== "selected-node-inspector"
  ) {
    return `WebView Relief selected focus command chrome state was ${markers.topologyCommandChromeState || "missing"}`;
  }
  if (markers.topologyUtilityLaneHeightToken !== "--topology-utility-lane-height") {
    return `WebView Relief selected focus utility lane height token was ${markers.topologyUtilityLaneHeightToken || "missing"}`;
  }
  if (markers.topologyUtilityLaneGapToken !== "--topology-utility-lane-gap") {
    return `WebView Relief selected focus utility lane gap token was ${markers.topologyUtilityLaneGapToken || "missing"}`;
  }
  if (
    markers.topologyUtilityLaneCompactWidthToken !==
    "--topology-utility-lane-compact-width"
  ) {
    return `WebView Relief selected focus utility lane compact width token was ${markers.topologyUtilityLaneCompactWidthToken || "missing"}`;
  }
  if (markers.topologyCommandChromeState === "selected-node-inspector") {
    if (markers.topologyUtilityActionLaneVisible !== false) {
      return "WebView Relief selected node inspector utility action lane was not suppressed";
    }
    return null;
  }
  if (markers.topologyUtilityActionLaneVisible !== true) {
    return "WebView Relief selected focus utility action lane was not visible";
  }
  if (markers.topologyUtilityActionLaneDensity !== "compact-focus") {
    return `WebView Relief selected focus utility lane density was ${markers.topologyUtilityActionLaneDensity || "missing"}`;
  }
  if (markers.topologyUtilityActionLaneContract !== "icon-first-focus-utility") {
    return `WebView Relief selected focus utility lane contract was ${markers.topologyUtilityActionLaneContract || "missing"}`;
  }
  const width = Number(markers.topologyUtilityActionLaneWidth || 0);
  const height = Number(markers.topologyUtilityActionLaneHeight || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 36) {
    return `WebView Relief selected focus utility lane was undersized (${width}x${height})`;
  }
  return null;
}


export function validateTopologyFocusSearchLaneContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologySearchActionLaneVisible !== true) {
    return "WebView Relief selected focus search action lane was not visible";
  }
  if (markers.topologySearchActionLaneDensity !== "compact-focus") {
    return `WebView Relief selected focus search lane density was ${markers.topologySearchActionLaneDensity || "missing"}`;
  }
  if (markers.topologySearchActionLaneContract !== "icon-first-focus-search") {
    return `WebView Relief selected focus search lane contract was ${markers.topologySearchActionLaneContract || "missing"}`;
  }
  if (markers.topologySearchLaneCompactWidthToken !== "--topology-search-lane-compact-width") {
    return `WebView Relief selected focus search compact width token was ${markers.topologySearchLaneCompactWidthToken || "missing"}`;
  }
  const width = Number(markers.topologySearchActionLaneWidth || 0);
  const height = Number(markers.topologySearchActionLaneHeight || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 36) {
    return `WebView Relief selected focus search lane was undersized (${width}x${height})`;
  }
  if (width > 150) {
    return `WebView Relief selected focus search lane stayed too wide (${width}px)`;
  }
  return null;
}


export function validateTopologyFocusRightControlsContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologySigmaControlsStackVisible !== true) {
    return "WebView Relief selected focus right controls stack was not visible";
  }
  if (markers.topologySigmaControlsStackDensity !== "compact-focus") {
    return `WebView Relief selected focus right controls stack density was ${markers.topologySigmaControlsStackDensity || "missing"}`;
  }
  if (markers.topologySigmaControlsStackContract !== "focus-support-utility-stack") {
    return `WebView Relief selected focus right controls stack contract was ${markers.topologySigmaControlsStackContract || "missing"}`;
  }
  if (markers.topologySigmaControlsStackSurfaceToken !== "--topology-floating-control-surface") {
    return `WebView Relief selected focus right controls stack surface token was ${markers.topologySigmaControlsStackSurfaceToken || "missing"}`;
  }
  if (markers.topologySigmaControlsStackBorderToken !== "--topology-floating-control-border") {
    return `WebView Relief selected focus right controls stack border token was ${markers.topologySigmaControlsStackBorderToken || "missing"}`;
  }
  const stackWidth = Number(markers.topologySigmaControlsStackWidth || 0);
  const stackHeight = Number(markers.topologySigmaControlsStackHeight || 0);
  if (
    !Number.isFinite(stackWidth) ||
    !Number.isFinite(stackHeight) ||
    stackWidth < 32 ||
    stackWidth > 60 ||
    stackHeight < 32 ||
    stackHeight > 104
  ) {
    return `WebView Relief selected focus right controls stack was malformed (${stackWidth}x${stackHeight})`;
  }
  if (markers.topologyShortcutsHelpButtonVisible !== true) {
    return "WebView Relief selected focus shortcuts help button was not visible";
  }
  if (markers.topologyShortcutsHelpButtonDensity !== "compact-focus") {
    return `WebView Relief selected focus shortcuts help density was ${markers.topologyShortcutsHelpButtonDensity || "missing"}`;
  }
  if (markers.topologyShortcutsHelpButtonContract !== "focus-support-help-entry") {
    return `WebView Relief selected focus shortcuts help contract was ${markers.topologyShortcutsHelpButtonContract || "missing"}`;
  }
  const helpWidth = Number(markers.topologyShortcutsHelpButtonWidth || 0);
  const helpHeight = Number(markers.topologyShortcutsHelpButtonHeight || 0);
  if (
    !Number.isFinite(helpWidth) ||
    !Number.isFinite(helpHeight) ||
    helpWidth < 32 ||
    helpWidth > 60 ||
    helpHeight < 32 ||
    helpHeight > 60
  ) {
    return `WebView Relief selected focus shortcuts help button was malformed (${helpWidth}x${helpHeight})`;
  }
  return null;
}

