(() => {
                              try {
                              const bodyText = document.body ? document.body.innerText : "";
                              const links = Array.from(document.querySelectorAll("a")).map((link) => ({
                                href: link.getAttribute("href") || "",
                                text: link.textContent || "",
                              }));
                              const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent || "");
                              const insightsMaintenanceBoard = document.querySelector(
                                '[data-insights-surface="maintenance-board"]'
                              );
                              const insightsQuestionTabs = Array.from(
                                insightsMaintenanceBoard?.querySelectorAll('[role="tab"]') || []
                              );
                              const insightsSelectedTabs = insightsQuestionTabs.filter(
                                (tab) => tab.getAttribute("aria-selected") === "true"
                              );
                              const insightsSelectedPanelId =
                                insightsSelectedTabs[0]?.getAttribute("aria-controls") || "";
                              const insightsSelectedPanel = insightsSelectedPanelId
                                ? document.getElementById(insightsSelectedPanelId)
                                : null;
                              const insightsSelectedPanelRect =
                                insightsSelectedPanel?.getBoundingClientRect();
                              const insightsSelectedPanelStyle = insightsSelectedPanel
                                ? getComputedStyle(insightsSelectedPanel)
                                : null;
                              const insightsSelectedPanelVisible = Boolean(
                                insightsSelectedPanelRect &&
                                insightsSelectedPanelRect.width > 1 &&
                                insightsSelectedPanelRect.height > 1 &&
                                insightsSelectedPanelStyle?.display !== "none" &&
                                insightsSelectedPanelStyle?.visibility !== "hidden" &&
                                Number(insightsSelectedPanelStyle?.opacity || "1") > 0.01
                              );
                              const aiSettingsVerification = window.__ontologyAtlasAiSettingsVerify || null;
                              const appUpdateVerification = window.__ontologyAtlasAppUpdateVerify || null;
                              const acpInstallVerification = window.__ontologyAtlasAcpInstallVerify || null;
                              const aiSettingsVisible = (el) => {
                                if (!el) return false;
                                const style = getComputedStyle(el);
                                const rect = el.getBoundingClientRect();
                                return style.display !== "none" &&
                                  style.visibility !== "hidden" &&
                                  Number(style.opacity || "1") > 0.01 &&
                                  rect.width > 0 &&
                                  rect.height > 0;
                              };
                              const aiSettingsPopover = document.querySelector('[data-testid="app-settings-popover"]');
                              const aiSettingsAiView = document.querySelector('[data-testid="app-settings-pane-ai"]');
                              const aiSettingsUrlInput = document.querySelector('[data-testid="ai-local-url"]');
                              const aiSettingsVerifiedLine = document.querySelector('[data-testid="ai-local-verified"]');
                              const aiSettingsFailureLine = document.querySelector('[data-testid="ai-local-failure"]');
                              const aiSettingsConnectedLine = document.querySelector('[data-testid="ai-local-connected"]');
                              const topologyDragVerification = window.__ontologyAtlasTopologyDragVerify || null;
                              const topologyFrameProfile = window.__ontologyAtlasTopologyFrameProfile || null;
                              const topologyMapEngineEl = document.querySelector("[data-map-engine]");
                              const topologyMapEngine = topologyMapEngineEl?.getAttribute("data-map-engine") || "";
                              const topologyV2CanvasInkPixels = (() => {
                                if (topologyMapEngine !== "v2") return 0;
                                const canvas = topologyMapEngineEl?.querySelector(
                                  'canvas[data-testid="topology-map-v2-canvas"]'
                                );
                                if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 1 || canvas.height < 1) {
                                  return 0;
                                }
                                try {
                                  const context = canvas.getContext("2d", { willReadFrequently: true });
                                  if (!context) return 0;
                                  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                                  let inkPixels = 0;
                                  for (let index = 3; index < pixels.length; index += 4) {
                                    if (pixels[index] > 0) inkPixels += 1;
                                  }
                                  return inkPixels;
                                } catch (_) {
                                  return 0;
                                }
                              })();
                              const topologyV2DetailPanel = document.querySelector(
                                '[data-testid="topology-v2-detail-panel"]'
                              );
                              const topologyV2DetailPanelRect =
                                topologyV2DetailPanel?.getBoundingClientRect();
                              const topologyV2DetailPanelStyle = topologyV2DetailPanel
                                ? getComputedStyle(topologyV2DetailPanel)
                                : null;
                              const topologyV2DetailPanelVisible = Boolean(
                                topologyV2DetailPanelRect &&
                                topologyV2DetailPanelRect.width > 1 &&
                                topologyV2DetailPanelRect.height > 1 &&
                                topologyV2DetailPanelStyle?.display !== "none" &&
                                topologyV2DetailPanelStyle?.visibility !== "hidden" &&
                                Number(topologyV2DetailPanelStyle?.opacity || "1") > 0.01
                              );
                              const topologyV2ProjectSourceReceipt = document.querySelector(
                                '[data-testid="topology-v2-project-source-receipt"]'
                              );
                              const topologyV2ProjectSourceGap = document.querySelector(
                                '[data-testid="topology-v2-project-source-gap"]'
                              );
                              const topologyV2DetailPanelActions = document.querySelector(
                                '[data-testid="topology-v2-detail-panel-actions"]'
                              );
                              const topologyV2DetailPanelFooter = document.querySelector(
                                '[data-testid="topology-v2-detail-panel-footer"]'
                              );
                              const topologyV2ProjectSourceReceiptRect =
                                topologyV2ProjectSourceReceipt?.getBoundingClientRect();
                              const topologyV2DetailPanelActionsRect =
                                topologyV2DetailPanelActions?.getBoundingClientRect();
                              const topologyV2DetailPanelFooterRect =
                                topologyV2DetailPanelFooter?.getBoundingClientRect();
                              const topologyV2RectOverlapArea = (a, b) => {
                                if (!a || !b) return 0;
                                const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                                const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                                return width > 0.5 && height > 0.5 ? width * height : 0;
                              };
                              const topologyV2InlineActionWidths = topologyV2DetailPanelActions
                                ? Array.from(topologyV2DetailPanelActions.children)
                                  .filter(aiSettingsVisible)
                                  .map((action) => action.getBoundingClientRect().width)
                                : [];
                              const topologyV2EdgePanel = document.querySelector(
                                '[data-testid="topology-v2-edge-panel"]'
                              );
                              const topologyV2EdgePanelRect =
                                topologyV2EdgePanel?.getBoundingClientRect();
                              const topologyV2EdgePanelStyle = topologyV2EdgePanel
                                ? getComputedStyle(topologyV2EdgePanel)
                                : null;
                              const topologyV2EdgePanelVisible = Boolean(
                                topologyV2EdgePanelRect &&
                                topologyV2EdgePanelRect.width > 1 &&
                                topologyV2EdgePanelRect.height > 1 &&
                                topologyV2EdgePanelStyle?.display !== "none" &&
                                topologyV2EdgePanelStyle?.visibility !== "hidden" &&
                                Number(topologyV2EdgePanelStyle?.opacity || "1") > 0.01
                              );
                              const guidedTourOverlay = document.querySelector(
                                '[data-testid="guided-tour-overlay"]'
                              );
                              const guidedTourOverlayRect =
                                guidedTourOverlay?.getBoundingClientRect();
                              const guidedTourOverlayStyle = guidedTourOverlay
                                ? getComputedStyle(guidedTourOverlay)
                                : null;
                              const guidedTourOverlayVisible = Boolean(
                                guidedTourOverlayRect &&
                                guidedTourOverlayRect.width > 1 &&
                                guidedTourOverlayRect.height > 1 &&
                                guidedTourOverlayStyle?.display !== "none" &&
                                guidedTourOverlayStyle?.visibility !== "hidden" &&
                                Number(guidedTourOverlayStyle?.opacity || "1") > 0.01
                              );
                              const topologyV2PrefersReducedMotion =
                                window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
                              const topologyMapCanvasCardCount = document.querySelectorAll(
                                '[data-testid="topology-map-canvas"] [data-skeleton-card]'
                              ).length;
                              const topologyZoomVerification = window.__ontologyAtlasTopologyZoomVerify || null;
                              const topologySelectedRelationVerification =
                                window.__ontologyAtlasTopologySelectedRelationVerify || null;
                              const topologyNodePopoverVerification =
                                window.__ontologyAtlasTopologyNodePopoverVerify || null;
                              const topologyFocusNoopVerification =
                                window.__ontologyAtlasTopologyFocusNoopVerify || null;
                              const topologyDragConnector = document.querySelector("[data-drag-cluster-connector]");
                              const topologyDragConnectorCount =
                                document.querySelectorAll("[data-drag-cluster-connector]").length;
                              const topologyDragConnectorD =
                                topologyDragConnector?.getAttribute("d") ||
                                (topologyDragVerification?.connectorDrawable ? "M snapshot" : "");
                              const topologyDragConnectorClearance =
                                Number(topologyDragConnector?.getAttribute("data-connector-clearance") || "0") ||
                                Number(topologyDragVerification?.connectorClearance || 0);
                              const sigmaViewport = document.querySelector('[data-testid="topology-map-v2"]');
                              const sigmaViewportRect = sigmaViewport?.getBoundingClientRect();
                              const sigmaViewportStyle = sigmaViewport ? getComputedStyle(sigmaViewport) : null;
                              const topologyStagePanClickCancelPx = Number(
                                sigmaViewport?.getAttribute("data-stage-pan-click-cancel-px") ||
                                topologyMapEngineEl?.getAttribute("data-stage-pan-click-cancel-px") ||
                                "0"
                              );
                              const sigmaCanvases = sigmaViewport
                                ? Array.from(sigmaViewport.querySelectorAll("canvas")).map((canvas) => {
                                    const rect = canvas.getBoundingClientRect();
                                    return { width: rect.width, height: rect.height };
                                  })
                                : [];
                              const topologyFocusClusterConnectorCount =
                                (false)
                                  ? (
                                    document.querySelectorAll("[data-focus-cluster-connector]").length ||
                                    document.querySelectorAll("[data-drag-cluster-connector]").length
                                  )
                                  : 0;
                              const visibleTopologyConnectorRelationLabelCount =
                                Array.from(document.querySelectorAll('[data-connector-relation-label="true"]'))
                                  .filter((label) => {
                                    const style = getComputedStyle(label);
                                    const opacity = Number(label.getAttribute("opacity") || style.opacity || "1");
                                    return (
                                      label.getAttribute("aria-hidden") !== "true" &&
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      opacity > 0
                                    );
                                  }).length;
                              const visibleTopologyHtmlRelationLabelCount =
                                Array.from(document.querySelectorAll("[data-relation-label-button]"))
                                  .filter((label) => {
                                    const style = getComputedStyle(label);
                                    const rect = label.getBoundingClientRect();
                                    const opacity = Number(style.opacity || "1");
                                    return (
                                      label.getAttribute("data-relation-label-visibility") === "visible-clear" &&
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      opacity > 0 &&
                                      rect.width > 0 &&
                                      rect.height > 0
                                    );
                                  }).length;
                              const topologyFocusRelationLabelHit =
                                document.querySelector('button[data-relation-label-hit="true"]');
                              const topologyFocusRelationLabelVisibleText =
                                topologyFocusRelationLabelHit?.getAttribute("data-relation-label-visible-text") ||
                                "";
                              const topologyFocusRelationLabelTypeLabel =
                                topologyFocusRelationLabelHit?.getAttribute("data-relation-type-label") ||
                                "";
                              const topologyFocusRelationLabelCount =
                                Number(topologyFocusRelationLabelHit?.getAttribute("data-relation-label-count") || "0");
                              const topologyFocusRelationLabelVisibleCountPolicy =
                                topologyFocusRelationLabelHit?.getAttribute("data-relation-label-visible-count-policy") ||
                                "";
                              const topologyFocusClusterConnectorMarkerCount =
                                document.querySelectorAll("[data-focus-cluster-connector]").length;
                              const topologyFocusClusterRelationLabelMarkerCount =
                                document.querySelectorAll("[data-focus-relation-label]").length ||
                                visibleTopologyHtmlRelationLabelCount ||
                                visibleTopologyConnectorRelationLabelCount ||
                                0;
                              const topologySelectedNodePopover = document.querySelector('[data-testid="topology-node-popover"]');
                              const topologySelectedNodeId =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-id") ||
                                "";
                              const topologySelectedNodeKind =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-kind") ||
                                "";
                              const topologySelectedNodeTitle =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-title") ||
                                "";
                              const topologySelectedNodeSource =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-source") ||
                                "";
                              const topologySelectedNodeSummary =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-summary") ||
                                "";
                              const topologyNodePopoverSurfaceRole =
                                topologySelectedNodePopover?.getAttribute("data-surface-role") ||
                                "";
                              const topologyNodePopoverAttentionRole =
                                topologySelectedNodePopover?.getAttribute("data-attention-role") ||
                                "";
                              const topologyNodePopoverFocusPrimary =
                                topologySelectedNodePopover?.getAttribute("data-focus-primary") ||
                                "";
                              const topologyNodePopoverHierarchyContract =
                                topologySelectedNodePopover?.getAttribute("data-hierarchy-contract") ||
                                "";
                              const topologyNodePopoverAgentHandoffContract =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-contract") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-contract") ||
                                "";
                              const topologyNodePopoverAgentHandoffRoute =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-route") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-route") ||
                                "";
                              const topologyNodePopoverAgentHandoffPrimaryAction =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-primary-action") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-primary-action") ||
                                "";
                              const topologyNodePopoverAgentHandoffActionCount =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-action-count") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-action-count") ||
                                "";
                              const topologyNodePopoverRelationFactCount =
                                topologySelectedNodePopover?.getAttribute("data-relation-fact-count") || "";
                              const topologyNodePopoverRelationTypeCount =
                                topologySelectedNodePopover?.getAttribute("data-relation-type-count") || "";
                              const topologyNodePopoverAgentHandoffRelationFactCount =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-relation-fact-count") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-relation-fact-count") ||
                                "";
                              const topologyNodePopoverAgentHandoffRelationTypeCount =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-relation-type-count") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-relation-type-count") ||
                                "";
                              const topologyNodePopoverAgentHandoffSummaryContract =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-summary-contract") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-summary-contract") ||
                                "";
                              const topologyNodePopoverAgentHandoffVisibleSummary =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-visible-summary") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-visible-summary") ||
                                "";
                              const topologyNodePopoverAgentHandoffSelectedNode =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-selected-node") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-selected-node") ||
                                "";
                              const topologyTopWorkspaceButton = Array.from(document.querySelectorAll("button")).find(
                                (button) =>
                                  (button.getAttribute("aria-label") || "").includes("workspace") ||
                                  (button.getAttribute("aria-label") || "").includes("워크스페이스")
                              );
                              const topologyTopRelayoutButton = document.querySelector('[data-testid="topology-auto-arrange"]');
                              const topologyTopSearchButton = document.querySelector('[data-testid="topology-concept-search"]');
                              const topologySearchActionLane =
                                document.querySelector('[data-testid="topology-search-action-lane"]');
                              const topologySearchActionLaneRect =
                                topologySearchActionLane?.getBoundingClientRect();
                              const topologySearchActionLaneStyle = topologySearchActionLane
                                ? getComputedStyle(topologySearchActionLane)
                                : null;
                              const topologyShortcutsHelpButton =
                                document.querySelector('[data-testid="topology-shortcuts-help-button"]');
                              const topologyShortcutsHelpButtonRect =
                                topologyShortcutsHelpButton?.getBoundingClientRect();
                              const topologyShortcutsHelpButtonStyle = topologyShortcutsHelpButton
                                ? getComputedStyle(topologyShortcutsHelpButton)
                                : null;
                              const topologyCommandChrome = document.querySelector('[data-testid="topology-command-chrome"]');
                              const topologyCommandChromeState =
                                topologyCommandChrome?.getAttribute("data-command-chrome-state") || "";
                              const topologyUtilityLaneSuppressionContract =
                                topologyCommandChrome?.getAttribute("data-utility-lane-suppression-contract") || "";
                              const topologyNodePopoverPositioner =
                                document.querySelector('[data-testid="topology-node-popover-positioner"]');
                              const topologyUtilityActionLane =
                                document.querySelector('[data-testid="topology-utility-action-lane"]');
                              const topologyUtilityActionLaneRect =
                                topologyUtilityActionLane?.getBoundingClientRect();
                              const topologyUtilityActionLaneStyle = topologyUtilityActionLane
                                ? getComputedStyle(topologyUtilityActionLane)
                                : null;
                              const topologyTopLeftChromeGroup = document.querySelector('[data-testid="topology-top-left-chrome-group"]');
                              const topologyTopLeftChromeGroupState =
                                topologyTopLeftChromeGroup?.getAttribute("data-workspace-context-state") || "";
                              const topologyTopLeftChromeGroupSupportContract =
                                topologyTopLeftChromeGroup?.getAttribute("data-selected-inspector-support-contract") || "";
                              const topologyTopLeftChromeGroupRect = topologyTopLeftChromeGroup?.getBoundingClientRect();
                              const topologyTopLeftChromeGroupStyle = topologyTopLeftChromeGroup
                                ? getComputedStyle(topologyTopLeftChromeGroup)
                                : null;
                              const topologyMapSurface = document.querySelector('[data-testid="topology-map-surface"]');
                              const topologyMapSurfaceStyle = topologyMapSurface
                                ? getComputedStyle(topologyMapSurface)
                                : null;
                              const topologyCreateNodePanel = document.querySelector('[data-testid="topology-create-node-panel"]');
                              const topologyCreateNodeBackdrop = document.querySelector('[data-testid="topology-create-node-backdrop"]');
                              const topologyCreateNodeTitleInput = topologyCreateNodePanel?.querySelector('[data-testid="create-node-title"]');
                              const topologyCreateNodeDomainInput = topologyCreateNodePanel?.querySelector('[data-testid="create-node-domain"]');
                              const topologyCreateNodeKindSelect = topologyCreateNodePanel?.querySelector('[data-testid="create-node-kind"]');
                              const topologyCreateNodeSubmit = topologyCreateNodePanel?.querySelector('[data-testid="create-node-submit"]');
                              const topologyCreateNodeActiveElement = document.activeElement;
                              const topologyCreateNodeActiveElementTestId =
                                topologyCreateNodeActiveElement?.getAttribute("data-testid") || "";
                              const topologyCreateNodeFocusInside =
                                Boolean(
                                  topologyCreateNodePanel &&
                                  topologyCreateNodeActiveElement &&
                                  topologyCreateNodePanel.contains(topologyCreateNodeActiveElement)
                                );
                              const topologyCreateNodePanelRect = topologyCreateNodePanel?.getBoundingClientRect();
                              const topologyCreateNodePanelStyle = topologyCreateNodePanel ? getComputedStyle(topologyCreateNodePanel) : null;
                              const topologyCreateNodeForm = topologyCreateNodePanel?.querySelector('[data-testid="create-node-form"]');
                              const topologyCreateNodeBackdropRect = topologyCreateNodeBackdrop?.getBoundingClientRect();
                              const topologyCreateNodeBackdropStyle = topologyCreateNodeBackdrop ? getComputedStyle(topologyCreateNodeBackdrop) : null;
                              const topologyCreateNodeBackdropVisible = Boolean(
                                topologyCreateNodeBackdropRect &&
                                topologyCreateNodeBackdropStyle &&
                                topologyCreateNodeBackdropStyle.display !== "none" &&
                                topologyCreateNodeBackdropStyle.visibility !== "hidden" &&
                                Number(topologyCreateNodeBackdropStyle.opacity || "1") > 0.01 &&
                                topologyCreateNodeBackdropRect.width > 0 &&
                                topologyCreateNodeBackdropRect.height > 0
                              );
                              /*
                               * ⚠️ 2026-08-11 — **check that it covers what it declared it would block, not the viewport.**
                               * This backdrop's contract is written in the code:
                               * `data-backdrop-contract="blocks-map-and-clears-create-intent"` — that is, it blocks
                               * the **map** and leaves the rail alive (escaping through the rail clears the create
                               * intent). Yet this verification demanded the full viewport, so it **always failed**
                               * because the measured 1448×900 backdrop fell 64px short of the 1512 viewport.
                               * The rail width is a specification, not a defect.
                               */
                              const topologyCreateNodeBackdropTargetRect = (
                                document.querySelector('[data-surface-role="map-canvas"]') ||
                                document.querySelector('[data-testid="topology-map-v2"]')
                              )?.getBoundingClientRect();
                              const topologyCreateNodeBackdropCoversViewport =
                                topologyCreateNodeBackdropVisible &&
                                (topologyCreateNodeBackdropTargetRect
                                  ? topologyCreateNodeBackdropRect.left <= topologyCreateNodeBackdropTargetRect.left + 1 &&
                                    topologyCreateNodeBackdropRect.top <= topologyCreateNodeBackdropTargetRect.top + 1 &&
                                    topologyCreateNodeBackdropRect.right >= topologyCreateNodeBackdropTargetRect.right - 1 &&
                                    topologyCreateNodeBackdropRect.bottom >= topologyCreateNodeBackdropTargetRect.bottom - 1
                                  : topologyCreateNodeBackdropRect.left <= 1 &&
                                    topologyCreateNodeBackdropRect.top <= 1 &&
                                    topologyCreateNodeBackdropRect.right >= innerWidth - 1 &&
                                    topologyCreateNodeBackdropRect.bottom >= innerHeight - 1);
                              const topologySelectedRelationHalos = Array.from(
                                document.querySelectorAll('[data-selected-relation-halo="true"]')
                              ).map((halo) => ({
                                tag: halo.tagName.toLowerCase(),
                                d: halo.getAttribute("d") || "",
                                opacity: Number(halo.getAttribute("opacity") || "1"),
                                computedOpacity: Number(getComputedStyle(halo).opacity || "1"),
                                quality: halo.getAttribute("data-relation-quality") || "",
                                connector: halo.getAttribute("data-connector") || "",
                                overviewFrom: halo.getAttribute("data-overview-connector-from") || "",
                                overviewTo: halo.getAttribute("data-overview-connector-to") || "",
                                axis: halo.getAttribute("data-connector-axis") || "",
                                clearance: halo.getAttribute("data-connector-clearance") || "",
                                selectedRelation: halo.getAttribute("data-selected-relation") || "",
                                className: halo.getAttribute("class") || "",
                                width: halo.getBoundingClientRect().width || 0,
                                height: halo.getBoundingClientRect().height || 0
                              }));
                              const topologySelectedRelationVisibleHalos = topologySelectedRelationHalos.filter(
                                (halo) =>
                                  (halo.d.length > 0 || (halo.width > 0 && halo.height > 0)) &&
                                  halo.opacity > 0.01 &&
                                  halo.computedOpacity > 0.01
                              );
                              const topologySelectedRelationHalo =
                                topologySelectedRelationVisibleHalos[0] || topologySelectedRelationHalos[0] || null;
                              const topologySelectedRelationLabelHit = document.querySelector('[data-relation-label-hit="true"][data-selected-relation="true"]');
                              const topologySelectedRelationLabelGeometryId =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-button") || "";
                              const topologySelectedRelationLabelQuality =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-quality") || "";
                              const topologySelectedRelationLabelEvidenceState =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-evidence-state") || "";
                              const topologySelectedRelationLabelEvidenceGlyph =
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-evidence-glyph]")?.textContent || "";
                              const topologySelectedRelationLabelQualityChipText =
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-quality-chip]")?.getAttribute("data-relation-quality-chip-text") ||
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-quality-chip]")?.textContent || "";
                              const topologySelectedRelationLabelAgentGateKind =
                                topologySelectedRelationLabelHit?.getAttribute("data-agent-gate-kind") || "";
                              const topologySelectedRelationLabelPrimaryCopyAction =
                                topologySelectedRelationLabelHit?.getAttribute("data-primary-copy-action") || "";
                              const topologySelectedRelationLabelCliFallbackCommand =
                                topologySelectedRelationLabelHit?.getAttribute("data-cli-fallback-command") || "";
                              const topologySelectedRelationLabelAgentGateText =
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-label-agent-gate]")?.getAttribute("data-route-chip-text") ||
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-label-agent-gate]")?.textContent || "";
                              const topologySelectedRelationLabelFactRoute =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route") || "";
                              const topologySelectedRelationLabelFactRouteQuality =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-quality") || "";
                              const topologySelectedRelationLabelFactRouteEvidence =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-evidence") || "";
                              const topologySelectedRelationLabelFactRouteGate =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-gate") || "";
                              const topologySelectedRelationLabelFactRouteAction =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-action") || "";
                              const topologySelectedRelationLabelType =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-type") || "";
                              const topologySelectedRelationLabelSource =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-source") || "";
                              const topologySelectedRelationLabelTarget =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-target") || "";
                              const topologySelectedRelationLabelCount =
                                Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-count") || "0");
                              const topologySelectedRelationLabelRoute =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-route") || "";
                              const topologySelectedRelationLabelTypeLabel =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-type-label") || "";
                              const topologySelectedRelationLabelFactRouteChips = Array.from(
                                topologySelectedRelationLabelHit?.querySelectorAll("[data-relation-fact-route-rail] [data-route-chip]") || []
                              ).map((chip) => ({
                                kind: chip.getAttribute("data-route-chip") || "",
                                text: chip.getAttribute("data-route-chip-text") || chip.textContent || ""
                              }));
                              const topologySelectedRelationLabelGeometry =
                                topologySelectedRelationLabelGeometryId
                                  ? document.querySelector(
                                      `[data-relation-label-bg="${CSS.escape(topologySelectedRelationLabelGeometryId)}"]`
                                    )
                                  : null;
                              const topologySelectedRelationLabelHitRect =
                                topologySelectedRelationLabelHit?.getBoundingClientRect();
                              const topologySelectedRelationLabelGeometryRect =
                                topologySelectedRelationLabelGeometry?.getBoundingClientRect();
                              const topologySelectedRelationLabelHitAligned =
                                Boolean(topologySelectedRelationLabelHitRect && topologySelectedRelationLabelGeometryRect) &&
                                Math.abs(
                                  (topologySelectedRelationLabelHitRect.left + topologySelectedRelationLabelHitRect.right) / 2 -
                                    (topologySelectedRelationLabelGeometryRect.left + topologySelectedRelationLabelGeometryRect.right) / 2
                                ) <= 1 &&
                                Math.abs(
                                  (topologySelectedRelationLabelHitRect.top + topologySelectedRelationLabelHitRect.bottom) / 2 -
                                    (topologySelectedRelationLabelGeometryRect.top + topologySelectedRelationLabelGeometryRect.bottom) / 2
                                ) <= 1 &&
                                topologySelectedRelationLabelHitRect.width >= topologySelectedRelationLabelGeometryRect.width &&
                                topologySelectedRelationLabelHitRect.height >= topologySelectedRelationLabelGeometryRect.height;
                              const topologyCameraMotionState =
                                sigmaViewport?.getAttribute("data-camera-motion-state") || "";
                              const topologySelectedRelationPrimaryCopyAction = document.querySelector('[data-relation-copy-priority="primary"]');
                              const topologySelectedRelationPrimaryCopyActionKind =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-relation-copy-action") ||
                                "";
                              const topologySelectedRelationPrimaryCopyActionCall =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-relation-copy-payload-call") ||
                                "";
                              const topologySelectedRelationPrimaryCopyActionTitle =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("title") ||
                                "";
                              const topologySelectedRelationPrimaryCopyActionRect =
                                topologySelectedRelationPrimaryCopyAction?.getBoundingClientRect();
                              const topologySelectedRelationPrimaryCopyRecommendationLabel =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-copy-recommendation-label") ||
                                "";
                              const topologySelectedRelationCopyActions = Array.from(
                                document.querySelectorAll("[data-relation-copy-action]")
                              ).map((action) => {
                                const rect = action.getBoundingClientRect();
                                return {
                                  kind: action.getAttribute("data-relation-copy-action") || "",
                                  priority: action.getAttribute("data-relation-copy-priority") || "",
                                  recommended: action.getAttribute("data-copy-recommended") === "true",
                                  recommendationLabel:
                                    action.getAttribute("data-copy-recommendation-label") || "",
                                  call: action.getAttribute("data-relation-copy-payload-call") || "",
                                  title: action.getAttribute("title") || "",
                                  text: action.textContent || "",
                                  width: rect.width,
                                  height: rect.height
                                };
                              });
                              const topologySelectedRelationEndpointCards = Array.from(
                                document.querySelectorAll('[data-skeleton-card][data-selected-relation-endpoint="true"]')
                              ).map((card) => {
                                const style = getComputedStyle(card);
                                const rect = card.getBoundingClientRect();
                                const opacity = Number(style.opacity || "1");
                                const surfaceHidden = card.getAttribute("data-surface-hidden") || "";
                                const roleBadge = card.querySelector("[data-selected-relation-endpoint-role-badge]");
                                return {
                                  slug: card.getAttribute("data-slug") || "",
                                  role: card.getAttribute("data-selected-relation-endpoint-role") || "",
                                  roleBadgeText:
                                    roleBadge?.getAttribute("data-selected-relation-endpoint-role-badge-text") ||
                                    roleBadge?.textContent ||
                                    "",
                                  roleBadgeContract:
                                    roleBadge?.getAttribute("data-selected-relation-endpoint-role-badge-contract") || "",
                                  roleBadgeVisible:
                                    roleBadge !== null &&
                                    roleBadge.textContent.trim().length > 0,
                                  surfaceHidden,
                                  display: style.display,
                                  visibility: style.visibility,
                                  opacity,
                                  inlineOpacity: card.style.opacity || "",
                                  className: card.getAttribute("class") || "",
                                  shift: card.getAttribute("data-selected-relation-endpoint-surface-shift") || "",
                                  visible:
                                    surfaceHidden !== "true" &&
                                    style.display !== "none" &&
                                    style.visibility !== "hidden" &&
                                    Number.isFinite(opacity) &&
                                    opacity > 0.01 &&
                                    rect.width > 0 &&
                                    rect.height > 0,
                                  left: rect.left,
                                  top: rect.top,
                                  right: rect.right,
                                  bottom: rect.bottom,
                                  width: rect.width,
                                  height: rect.height
                                };
                              });
                              const topologySelectedRelationEndpointVisibleCount =
                                topologySelectedRelationEndpointCards.filter((card) => card.visible).length;
                              const topologySelectedRelationEndpointHiddenCount =
                                topologySelectedRelationEndpointCards.filter((card) => !card.visible).length;
                              const topologyHealthRepairAuditCard =
                                document.querySelector('[data-health-repair-audit-target="true"]');
                              const topologyNodePopover = document.querySelector('[data-testid="topology-node-popover"]');
                              const topologyNodePopoverStyle = topologyNodePopover
                                ? getComputedStyle(topologyNodePopover)
                                : null;
                              const topologyNodePopoverRect = topologyNodePopover?.getBoundingClientRect();
                              const topologyNodePopoverRelationRow =
                                topologyNodePopover?.querySelector("[data-relation-row]");
                              const topologyNodePopoverRelationRowRect =
                                topologyNodePopoverRelationRow?.getBoundingClientRect();
                              const topologyNodePopoverRelationGate =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-row-agent-gate]");
                              const topologyNodePopoverRelationEvidenceGlyph =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-evidence-glyph]");
                              const topologyNodePopoverRelationTitle =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-title]");
                              const topologyNodePopoverRelationRouteRail =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-route]");
                              const topologyNodePopoverRelationRouteRailRect =
                                topologyNodePopoverRelationRouteRail?.getBoundingClientRect();
                              const topologyNodePopoverRelationPayloadChip =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-route-chip=\"payload\"]");
                              const topologyNodePopoverRelationPayloadChipRect =
                                topologyNodePopoverRelationPayloadChip?.getBoundingClientRect();
                              const topologyNodePopoverRelationFactRouteChips = Array.from(
                                topologyNodePopoverRelationRow?.querySelectorAll("[data-relation-route-chip]") || []
                              ).map((chip) => ({
                                kind: chip.getAttribute("data-relation-route-chip") || "",
                                text: chip.textContent || ""
                              }));
                              const topologyNodePopoverRelationEndpointChips = Array.from(
                                topologyNodePopoverRelationRow?.querySelectorAll("[data-relation-endpoint-chip]") || []
                              ).map((chip) => ({
                                kind: chip.getAttribute("data-relation-endpoint-chip") || "",
                                text: chip.textContent || ""
                              }));
                              const topologyNodePopoverAgentReadinessLens =
                                topologyNodePopover?.querySelector("[data-testid=\"topology-node-agent-readiness-lens\"]");
                              const topologyNodePopoverAgentReadinessText =
                                topologyNodePopoverAgentReadinessLens?.getAttribute("data-agent-readiness-summary") ||
                                topologyNodePopoverAgentReadinessLens?.getAttribute("aria-label") ||
                                topologyNodePopoverAgentReadinessLens?.textContent ||
                                "";
                              const topologyNodePopoverMapContextNote =
                                topologyNodePopover?.querySelector("[data-testid=\"topology-map-context-note\"]");
                              const topologyNodePopoverAgentReadinessChips =
                                topologyNodePopoverAgentReadinessLens
                                  ? Array.from(
                                      topologyNodePopoverAgentReadinessLens.querySelectorAll("[data-agent-readiness-chip]")
                                    ).map((chip) => ({
                                      kind: chip.getAttribute("data-agent-readiness-chip") || "",
                                      count: chip.getAttribute("data-count") || "",
                                      text: chip.textContent || ""
                                    }))
                                  : [];
                              const fixedTopologySurfaces = Array.from(document.querySelectorAll(
                                '[data-testid="topology-node-popover"]'
                              )).map((surface) => {
                                const style = getComputedStyle(surface);
                                const rect = surface.getBoundingClientRect();
                                const name = surface.getAttribute("data-testid") || surface.tagName.toLowerCase();
                                const mountedBlockingSurface =
                                  name === "topology-node-popover";
                                return {
                                  name,
                                  visible:
                                    style.display !== "none" &&
                                    style.visibility !== "hidden" &&
                                    (Number(style.opacity || "1") > 0.01 || mountedBlockingSurface) &&
                                    rect.width > 0 &&
                                    rect.height > 0,
                                  left: rect.left,
                                  top: rect.top,
                                  right: rect.right,
                                  bottom: rect.bottom
                                };
                              }).filter((surface) => surface.visible);
                              const topologyFixedSurfaceNames = fixedTopologySurfaces.map(
                                (surface) => surface.name
                              );
                              const topologyTransientSurfaceNames = fixedTopologySurfaces
                                .map((surface) => surface.name)
                                .filter((name) => name === "topology-node-popover");
                              const topologyTransientSurfaceCount = topologyTransientSurfaceNames.length;
                              const topologyTransientSurfaceContract =
                                topologyCreateNodePanel
                                  ? "blocking-surface-wins"
                                  : topologyTransientSurfaceCount <= 1
                                      ? "single-transient"
                                    : "review-stack";
                              const topologyInteractiveOverlays = Array.from(document.querySelectorAll("[data-interactive-overlay]"))
                                .map((overlay) => {
                                  const style = getComputedStyle(overlay);
                                  const rect = overlay.getBoundingClientRect();
                                  return {
                                    testId: overlay.getAttribute("data-testid") || "",
                                    role: overlay.getAttribute("role") || "",
                                    visible:
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number(style.opacity || "1") > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0
                                  };
                                })
                                .filter((overlay) => overlay.visible);
                              const topologyInteractiveOverlayNames = topologyInteractiveOverlays
                                .map((overlay) => overlay.testId || overlay.role || "interactive-overlay");
                              const topologyBlockingComposerOverlayContract =
                                topologyCreateNodePanel
                                  ? topologyInteractiveOverlayNames.length === 1 &&
                                    topologyInteractiveOverlayNames[0] === "topology-create-node-backdrop"
                                    ? "exclusive-blocking-composer"
                                    : "stacked-interactive-overlays"
                                  : topologyInteractiveOverlayNames.length <= 1
                                    ? "single-interactive-overlay"
                                    : "stacked-interactive-overlays";
                              let topologyFixedSurfaceOverlapCount = 0;
                              const topologyFixedSurfaceOverlapSample = [];
                              for (let i = 0; i < fixedTopologySurfaces.length; i += 1) {
                                const a = fixedTopologySurfaces[i];
                                for (let j = i + 1; j < fixedTopologySurfaces.length; j += 1) {
                                  const b = fixedTopologySurfaces[j];
                                  if (
                                    a.left < b.right + (8) &&
                                    a.right > b.left - (8) &&
                                    a.top < b.bottom + (8) &&
                                    a.bottom > b.top - (8)
                                  ) {
                                    topologyFixedSurfaceOverlapCount += 1;
                                    if (topologyFixedSurfaceOverlapSample.length < 5) {
                                      topologyFixedSurfaceOverlapSample.push([a.name, b.name]);
                                    }
                                  }
                                }
                              }
                              const topologyCards = Array.from(document.querySelectorAll("[data-skeleton-card]"))
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  return {
                                    slug: card.getAttribute("data-slug") || "",
                                    pathRole: card.getAttribute("data-path-role") || "",
                                    pathRoleContract: card.getAttribute("data-path-role-contract") || "",
                                    pathAttentionLayer: card.getAttribute("data-path-attention-layer") || "",
                                    pathNextAction: card.getAttribute("data-path-next-action") || "",
                                    pathAnchor: card.getAttribute("data-path-anchor") || "",
                                    pathBadgeLabel:
                                      card.getAttribute("data-path-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.getAttribute("data-path-card-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.textContent?.trim() ||
                                      "",
                                    pathWorkflow: card.getAttribute("data-path-workflow") || "",
                                    tier: Number(card.getAttribute("data-tier") || "3"),
                                    dimmed: card.getAttribute("data-dimmed") === "true",
                                    dimOpacityRole: card.getAttribute("data-dim-opacity-role") || "",
                                    selectedRelationEndpoint:
                                      card.getAttribute("data-selected-relation-endpoint") === "true",
                                    visible:
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number(style.opacity || "1") > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0,
                                    left: rect.left,
                                    top: rect.top,
                                    right: rect.right,
                                    bottom: rect.bottom,
                                    width: rect.width,
                                    height: rect.height
                                  };
                                })
                                .filter((card) => card.visible);
                              const topologySelectedRelationLowerPriorityVisibleDimmedCount =
                                topologyCards.filter(
                                  (card) =>
                                    card.dimmed &&
                                    !card.selectedRelationEndpoint &&
                                    card.tier > 1
                                ).length;
                              const topologySelectedRelationVisibleOrientationAnchorCount =
                                topologyCards.filter(
                                  (card) =>
                                    card.dimmed &&
                                    !card.selectedRelationEndpoint &&
                                    card.tier <= 1
                                ).length;
                              const topologySelectedRelationHiddenContextCards = Array.from(
                                document.querySelectorAll('[data-skeleton-card][data-dim-opacity-role="suppressed-selected-relation-context"]')
                              ).map((card) => {
                                const style = getComputedStyle(card);
                                return {
                                  contract:
                                    card.getAttribute("data-selected-relation-hidden-interaction-contract") || "",
                                  ariaHidden: card.getAttribute("aria-hidden") || "",
                                  tabIndex: card.getAttribute("tabindex") || "",
                                  pointerEvents: style.pointerEvents,
                                  visibility: style.visibility
                                };
                              });
                              const topologySelectedRelationHiddenContextInteractionContract =
                                topologySelectedRelationHiddenContextCards[0]?.contract || "";
                              const topologySelectedRelationHiddenContextInteractiveCount =
                                topologySelectedRelationHiddenContextCards.filter(
                                  (card) =>
                                    card.contract !== "hidden-context-is-not-pointer-focus-or-a11y-target" ||
                                    card.ariaHidden !== "true" ||
                                    card.tabIndex !== "-1" ||
                                    card.pointerEvents !== "none" ||
                                    card.visibility !== "hidden"
                                ).length;
                              const topologyRawCards = Array.from(document.querySelectorAll("[data-skeleton-card]"))
                                .slice(0, 5)
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  return {
                                    slug: card.getAttribute("data-slug") || "",
                                    opacity: style.opacity,
                                    display: style.display,
                                    visibility: style.visibility,
                                    left: rect.left,
                                    top: rect.top,
                                    width: rect.width,
                                    height: rect.height,
                                    transform: style.transform,
                                    surfaceHidden: card.getAttribute("data-surface-hidden") || "",
                                    pathRole: card.getAttribute("data-path-role") || "",
                                    pathRoleContract: card.getAttribute("data-path-role-contract") || "",
                                    pathAttentionLayer: card.getAttribute("data-path-attention-layer") || "",
                                    pathNextAction: card.getAttribute("data-path-next-action") || "",
                                    pathAnchor: card.getAttribute("data-path-anchor") || "",
                                    pathBadgeLabel:
                                      card.getAttribute("data-path-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.getAttribute("data-path-card-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.textContent?.trim() ||
                                      "",
                                    pathWorkflow: card.getAttribute("data-path-workflow") || "",
                                  };
                                });
                              const topologyDimmedCards = Array.from(
                                document.querySelectorAll('[data-skeleton-card][data-dimmed="true"]')
                              )
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  const opacity = Number(style.opacity || "1");
                                  return {
                                    tier: Number(card.getAttribute("data-tier") || "3"),
                                    opacity,
                                    visible:
                                      card.getAttribute("data-surface-hidden") !== "true" &&
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number.isFinite(opacity) &&
                                      opacity > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0
                                  };
                                })
                                .filter((card) => card.visible);
                              const topologyDimAnchorCards = topologyDimmedCards.filter(
                                (card) => card.tier <= 1
                              );
                              const topologyDimChipCards = topologyDimmedCards.filter(
                                (card) => card.tier > 1
                              );
                              const topologyMinOpacity = (cards) =>
                                cards.length
                                  ? Math.min(...cards.map((card) => card.opacity))
                                  : 0;
                              const topologyPathCandidateCards = topologyCards.filter((card) => card.pathRole === "candidate");
                              const topologyPathSourceCards = topologyCards.filter((card) => card.pathRole === "source");
                              const topologyPathTargetCards = topologyCards.filter((card) => card.pathRole === "target");
                              const topologyPathCandidateCardCount = topologyPathCandidateCards.length;
                              const topologyPathSourceCardCount = topologyPathSourceCards.length;
                              const topologyPathTargetCardCount = topologyPathTargetCards.length;
                              const topologyPathSourceCard = topologyPathSourceCards[0] || null;
                              const topologyPathTargetCard = topologyPathTargetCards[0] || null;
                              let topologyCardOverlapCount = 0;
                              let topologyCardClippedCount = 0;
                              let topologyCardFixedSurfaceOverlapCount = 0;
                              const topologyCardOverlapSample = [];
                              const topologyCardFixedSurfaceOverlapSample = [];
                              for (let i = 0; i < topologyCards.length; i += 1) {
                                const card = topologyCards[i];
                                if (
                                  card.left < 0 ||
                                  card.top < 0 ||
                                  card.right > innerWidth ||
                                  card.bottom > innerHeight
                                ) {
                                  topologyCardClippedCount += 1;
                                }
                                for (const surface of fixedTopologySurfaces) {
                                  if (
                                    card.left < surface.right + (8) &&
                                    card.right > surface.left - (8) &&
                                    card.top < surface.bottom + (8) &&
                                    card.bottom > surface.top - (8)
                                  ) {
                                    topologyCardFixedSurfaceOverlapCount += 1;
                                    if (topologyCardFixedSurfaceOverlapSample.length < 5) {
                                      topologyCardFixedSurfaceOverlapSample.push(card.slug);
                                    }
                                    break;
                                  }
                                }
                                for (let j = i + 1; j < topologyCards.length; j += 1) {
                                  const a = topologyCards[i];
                                  const b = topologyCards[j];
                                  if (
                                    a.left < b.right - (2) &&
                                    a.right > b.left + (2) &&
                                    a.top < b.bottom - (2) &&
                                    a.bottom > b.top + (2)
                                  ) {
                                    topologyCardOverlapCount += 1;
                                    if (topologyCardOverlapSample.length < 5) {
                                      topologyCardOverlapSample.push([a.slug, b.slug]);
                                    }
                                  }
                                }
                              }
                              const topologyAttentionWinner = topologyCreateNodePanel
                                ? "blocking-composer"
                                : new URLSearchParams(location.search).get("mode") === "path"
                                  ? "focus-path-state"
                                  : topologySelectedNodePopover || topologyV2DetailPanel
                                    ? "focus-state"
                                    : "map-layer";
                              return JSON.stringify({
                                href: location.href,
                                title: document.title,
                                bodyText: bodyText.slice(0, 240),
                                bodyChildren: document.body ? document.body.children.length : null,
                                readyState: document.readyState,
                                // A locked display or an occluded window makes WebKit stop
                                // animation frames, and the map mounts after one; without this
                                // the verifier reports "marker missing" for a screen nobody saw.
                                visibilityState: document.visibilityState,
                                bg: getComputedStyle(document.body).backgroundColor,
                                color: getComputedStyle(document.body).color,
                                width: innerWidth,
                                height: innerHeight,
                                markers: {
                                  aiSettingsVerification,
                                  appUpdateVerification,
                                  acpInstallVerification,
                                  appUpdateVerification,
                                  acpInstallVerification,
                                  aiSettingsSheetOpen: aiSettingsVisible(aiSettingsPopover),
                                  aiSettingsAiViewOpen: aiSettingsVisible(aiSettingsAiView),
                                  aiSettingsBaseUrlValue: aiSettingsUrlInput?.value || "",
                                  aiSettingsVerifiedVisible: aiSettingsVisible(aiSettingsVerifiedLine),
                                  aiSettingsFailureText: (aiSettingsFailureLine?.textContent || "").trim(),
                                  aiSettingsConnectedVisible: aiSettingsVisible(aiSettingsConnectedLine),
                                  aiSettingsConnectedText: (aiSettingsConnectedLine?.textContent || "").trim(),
                                  aiSettingsAuditRowCount:
                                    document.querySelectorAll('[data-testid="ai-audit-row"]').length,
                                  verificationFixtureVault:
                                    window.localStorage.getItem("ontology-atlas:verify-fixture-vault") || "",
                                  verificationFixtureVaultError:
                                    window.__ontologyAtlasVerifyFixtureVaultError || "",
                                  ontologyNav: links.some((link) => link.href.includes("/ontology") || /온톨로지|Ontology/.test(link.text)),
                                  sourceVaultNav: links.some((link) => link.href.includes("/docs") || /저장소|문서함|Source Vault|Documents/.test(link.text)),
                                  agentBriefCopy: buttons.some((text) => /브리핑 복사|Copy brief/.test(text)) && /agent_brief/.test(bodyText),
                                  insightsMaintenanceBoard: Boolean(insightsMaintenanceBoard),
                                  insightsQuestionModel:
                                    insightsMaintenanceBoard?.getAttribute("data-insights-question-model") || "",
                                  insightsTabCount: insightsQuestionTabs.length,
                                  insightsSelectedTabCount: insightsSelectedTabs.length,
                                  insightsSelectedPanelVisible,
                                  insightsHandoff: Boolean(
                                    insightsMaintenanceBoard?.querySelector(
                                      '[data-insights-handoff="tab-query"]'
                                    )
                                  ),
                                  topologyRelief:
                                    location.pathname.includes("/topology") &&
                                    /Relief|Ontology relief map|concept cards|온톨로지 지형도|대표 카드|카드 골격|후보 \d+\/\d+개 표시|개념 \d+개 · 관계 \d+개|\d+ 개념 · \d+ 관계|\d+ concepts · \d+ relations|CONCEPTS/.test(bodyText),
                                  topologyAttentionWinner,
                                  topologySigmaViewportVisible: Boolean(
                                    sigmaViewportRect &&
                                    sigmaViewportStyle &&
                                    sigmaViewportStyle.display !== "none" &&
                                    sigmaViewportStyle.visibility !== "hidden" &&
                                    sigmaViewportRect.width > 0 &&
                                    sigmaViewportRect.height > 0
                                  ),
                                  topologySigmaReady:
                                    sigmaViewport?.getAttribute("data-sigma-ready") === "true",
                                  topologySigmaBootError:
                                    sigmaViewport?.getAttribute("data-sigma-boot-error") === "true",
                                  topologySkeletonMode:
                                    sigmaViewport?.getAttribute("data-skeleton-mode") === "true",
                                  topologySkeletonCardsActive:
                                    sigmaViewport?.getAttribute("data-skeleton-cards-active") === "true",
                                  topologySkeletonCardModelCount:
                                    Number(sigmaViewport?.getAttribute("data-skeleton-card-model-count") || "0"),
                                  topologyCameraDepthContract:
                                    sigmaViewport?.getAttribute("data-camera-depth-contract") || "",
                                  topologyCameraMinRatio:
                                    Number(sigmaViewport?.getAttribute("data-camera-min-ratio") || "0"),
                                  topologyCameraMaxRatio:
                                    Number(sigmaViewport?.getAttribute("data-camera-max-ratio") || "0"),
                                  topologyLayoutWorkerFrameStatsContract:
                                    sigmaViewport?.getAttribute("data-layout-worker-frame-stats-contract") || "",
                                  topologyLayoutWorkerPositionFrameReceivedCount:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-received-count") || "0"),
                                  topologyLayoutWorkerPositionFrameAppliedCount:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-applied-count") || "0"),
                                  topologyLayoutWorkerPositionFrameSkippedCount:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-skipped-count") || "0"),
                                  topologyLayoutWorkerPositionFrameEpsilonPx:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-epsilon-px") || "0"),
                                  topologyHealthRepairMapTargetContract:
                                    sigmaViewport?.getAttribute("data-health-repair-map-target-contract") || "",
                                  topologyHealthRepairMapTargetSlug:
                                    sigmaViewport?.getAttribute("data-health-repair-map-target-slug") || "",
                                  topologyHealthRepairMapTargetKind:
                                    sigmaViewport?.getAttribute("data-health-repair-map-target-kind") || "",
                                  topologyHealthRepairAuditTargetContract:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-contract") ||
                                    "",
                                  topologyHealthRepairAuditTargetSlug:
                                    topologyHealthRepairAuditCard?.getAttribute("data-slug") || "",
                                  topologyHealthRepairAuditTargetKind:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-kind") ||
                                    "",
                                  topologyHealthRepairAuditTargetBadge:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-badge") ||
                                    "",
                                  topologyHealthRepairAuditTargetBadgeContract:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-badge-contract") ||
                                    "",
                                  topologyCameraMotionTrigger:
                                    sigmaViewport?.getAttribute("data-camera-motion-trigger") || "",
                                  topologyCameraMotionContract:
                                    sigmaViewport?.getAttribute("data-camera-motion-contract") || "",
                                  topologyCameraMotionDurationMs:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-duration-ms") || "0"),
                                  topologyCameraMotionEasing:
                                    sigmaViewport?.getAttribute("data-camera-motion-easing") || "",
                                  topologyCameraMotionReduced:
                                    sigmaViewport?.getAttribute("data-camera-motion-reduced") === "true",
                                  topologyCameraMotionState:
                                    topologyCameraMotionState,
                                  topologyCameraMotionIntent:
                                    sigmaViewport?.getAttribute("data-camera-motion-intent") || "",
                                  topologyCameraMotionTargetPolicy:
                                    sigmaViewport?.getAttribute("data-camera-motion-target-policy") || "",
                                  topologyCameraMotionDistancePolicy:
                                    sigmaViewport?.getAttribute("data-camera-motion-distance-policy") || "",
                                  topologyCameraMotionMaxDistancePx:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-max-distance-px") || "0"),
                                  topologyCameraMotionSelectedViewportX:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-selected-viewport-x") || "0"),
                                  topologyCameraMotionSelectedViewportY:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-selected-viewport-y") || "0"),
                                  topologyCameraMotionSafeTargetX:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-target-x") || "0"),
                                  topologyCameraMotionSafeTargetY:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-target-y") || "0"),
                                  topologyCameraMotionDistancePx:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-distance-px") || "0"),
                                  topologyCameraMotionTargetInsideSafeRect:
                                    sigmaViewport?.getAttribute("data-camera-motion-target-inside-safe-rect") === "true",
                                  topologyCameraMotionSafeInsetTop:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-top") || "0"),
                                  topologyCameraMotionSafeInsetRight:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-right") || "0"),
                                  topologyCameraMotionSafeInsetBottom:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-bottom") || "0"),
                                  topologyCameraMotionSafeInsetLeft:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-left") || "0"),
                                  topologyCameraMotionRightReserveContract:
                                    sigmaViewport?.getAttribute("data-camera-motion-right-reserve-contract") || "",
                                  topologyCameraMotionSafeTargetRightClearance:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-target-right-clearance") || "0"),
                                  topologyCameraMotionSelectedFanoutRows:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-selected-fanout-rows") || "0"),
                                  topologyInitialRevealMotionContract:
                                    sigmaViewport?.getAttribute("data-initial-reveal-motion-contract") || "",
                                  topologyInitialRevealTransformPolicy:
                                    sigmaViewport?.getAttribute("data-initial-reveal-transform-policy") || "",
                                  topologyInitialRevealDurationMs:
                                    Number(sigmaViewport?.getAttribute("data-initial-reveal-duration-ms") || "0"),
                                  topologyDimAnchorVisibleCount:
                                    topologyDimAnchorCards.length,
                                  topologyDimChipVisibleCount:
                                    topologyDimChipCards.length,
                                  topologyDimAnchorMinOpacity:
                                    topologyMinOpacity(topologyDimAnchorCards),
                                  topologyDimChipMinOpacity:
                                    topologyMinOpacity(topologyDimChipCards),
                                  topologyFocusClusterBreathingRoomContract:
                                    "",
                                  topologyFocusClusterBreathingRoomPx:
                                    0,
                                  topologyFocusClusterRightClearance:
                                    0,
                                  topologyFocusClusterBottomClearance:
                                    0,
                                  topologyFocusClusterWidth:
                                    0,
                                  topologyFocusClusterHeight:
                                    0,
                                  topologyFocusClusterLeft:
                                    0,
                                  topologyFocusClusterTop:
                                    0,
                                  topologyFocusClusterRight:
                                    0,
                                  topologyFocusClusterBottom:
                                    0,
                                  topologyFocusClusterConnectorCount,
                                  topologyFocusClusterConnectorMarkerCount,
                                  topologyFocusClusterRelationLabelMarkerCount,
                                  topologyFocusRelationLabelVisibleText,
                                  topologyFocusRelationLabelTypeLabel,
                                  topologyFocusRelationLabelCount,
                                  topologyFocusRelationLabelVisibleCountPolicy,
                                  topologySigmaCanvasCount: sigmaCanvases.length,
                                  topologySigmaCanvasSizes: sigmaCanvases,
                                  topologyStagePanClickCancelPx,
                                  topologyCardRawCount:
                                    document.querySelectorAll("[data-skeleton-card]").length,
                                  topologyCardRawSample: topologyRawCards,
                                  topologyCardCount: topologyCards.length,
                                  topologyPathCandidateCardCount,
                                  topologyPathSourceCardCount,
                                  topologyPathTargetCardCount,
                                  topologyPathSourceCardSlug: topologyPathSourceCard?.slug || "",
                                  topologyPathSourceCardRoleContract:
                                    topologyPathSourceCard?.pathRoleContract || "",
                                  topologyPathSourceCardAttentionLayer:
                                    topologyPathSourceCard?.pathAttentionLayer || "",
                                  topologyPathSourceCardNextAction:
                                    topologyPathSourceCard?.pathNextAction || "",
                                  topologyPathSourceCardAnchor:
                                    topologyPathSourceCard?.pathAnchor || "",
                                  topologyPathSourceCardBadgeLabel:
                                    topologyPathSourceCard?.pathBadgeLabel || "",
                                  topologyPathTargetCardSlug: topologyPathTargetCard?.slug || "",
                                  topologyPathTargetCardRoleContract:
                                    topologyPathTargetCard?.pathRoleContract || "",
                                  topologyPathTargetCardBadgeLabel:
                                    topologyPathTargetCard?.pathBadgeLabel || "",
                                  topologyCardOverlapCount,
                                  topologyCardOverlapSample,
                                  topologyCardClippedCount,
                                  topologyFixedSurfaceCount: fixedTopologySurfaces.length,
                                  topologyFixedSurfaceNames,
                                  topologyFixedSurfaceOverlapCount,
                                  topologyFixedSurfaceOverlapSample,
                                  topologyTransientSurfaceCount,
                                  topologyTransientSurfaceNames,
                                  topologyTransientSurfaceContract,
                                  topologyCardFixedSurfaceOverlapCount,
                                  topologyCardFixedSurfaceOverlapSample,
                                  topologyKindLegendState:
                                    sigmaViewport?.getAttribute("data-kind-legend-state") || "",
                                  topologyTopWorkspaceLabel:
                                    topologyTopWorkspaceButton?.textContent?.trim() || "",
                                  topologyTopRelayoutLabel:
                                    topologyTopRelayoutButton?.textContent?.trim() || "",
                                  topologyTopSearchLabel:
                                    topologyTopSearchButton?.textContent?.trim() || "",
                                  topologySearchActionLaneVisible:
                                    Boolean(
                                      topologySearchActionLaneRect &&
                                      topologySearchActionLaneStyle &&
                                      topologySearchActionLaneStyle.display !== "none" &&
                                      topologySearchActionLaneStyle.visibility !== "hidden" &&
                                      Number(topologySearchActionLaneStyle.opacity || "1") > 0.01 &&
                                      topologySearchActionLaneRect.width > 0 &&
                                      topologySearchActionLaneRect.height > 0
                                    ),
                                  topologySearchActionLaneDensity:
                                    topologySearchActionLane?.getAttribute("data-search-lane-density") || "",
                                  topologySearchActionLaneContract:
                                    topologySearchActionLane?.getAttribute("data-search-lane-contract") || "",
                                  topologySearchLaneCompactWidthToken:
                                    topologySearchActionLane?.getAttribute("data-search-lane-compact-width-token") || "",
                                  topologySearchActionLaneWidth:
                                    topologySearchActionLaneRect?.width || 0,
                                  topologySearchActionLaneHeight:
                                    topologySearchActionLaneRect?.height || 0,
                                  topologyShortcutsHelpButtonVisible:
                                    Boolean(
                                      topologyShortcutsHelpButtonRect &&
                                      topologyShortcutsHelpButtonStyle &&
                                      topologyShortcutsHelpButtonStyle.display !== "none" &&
                                      topologyShortcutsHelpButtonStyle.visibility !== "hidden" &&
                                      Number(topologyShortcutsHelpButtonStyle.opacity || "1") > 0.01 &&
                                      topologyShortcutsHelpButtonRect.width > 0 &&
                                      topologyShortcutsHelpButtonRect.height > 0
                                    ),
                                  topologyShortcutsHelpButtonDensity:
                                    topologyShortcutsHelpButton?.getAttribute("data-controls-density") || "",
                                  topologyShortcutsHelpButtonContract:
                                    topologyShortcutsHelpButton?.getAttribute("data-controls-contract") || "",
                                  topologyShortcutsHelpButtonWidth:
                                    topologyShortcutsHelpButtonRect?.width || 0,
                                  topologyShortcutsHelpButtonHeight:
                                    topologyShortcutsHelpButtonRect?.height || 0,
                                  topologyCommandChromeState,
                                  topologyUtilityLaneSuppressionContract,
                                  topologyUtilityLaneHeightToken:
                                    topologyCommandChrome?.getAttribute("data-utility-lane-height-token") || "",
                                  topologyUtilityLaneGapToken:
                                    topologyCommandChrome?.getAttribute("data-utility-lane-gap-token") || "",
                                  topologyUtilityLaneCompactWidthToken:
                                    topologyCommandChrome?.getAttribute("data-utility-lane-compact-width-token") || "",
                                  topologyUtilityActionLaneVisible:
                                    Boolean(
                                      topologyUtilityActionLaneRect &&
                                      topologyUtilityActionLaneStyle &&
                                      topologyUtilityActionLaneStyle.display !== "none" &&
                                      topologyUtilityActionLaneStyle.visibility !== "hidden" &&
                                      Number(topologyUtilityActionLaneStyle.opacity || "1") > 0.01 &&
                                      topologyUtilityActionLaneRect.width > 0 &&
                                      topologyUtilityActionLaneRect.height > 0
                                    ),
                                  topologyUtilityActionLaneDensity:
                                    topologyUtilityActionLane?.getAttribute("data-utility-lane-density") || "",
                                  topologyUtilityActionLaneContract:
                                    topologyUtilityActionLane?.getAttribute("data-utility-lane-contract") || "",
                                  topologyUtilityActionLaneWidth:
                                    topologyUtilityActionLaneRect?.width || 0,
                                  topologyUtilityActionLaneHeight:
                                    topologyUtilityActionLaneRect?.height || 0,
                                  topologyTopLeftChromeGroupVisible:
                                    Boolean(
                                      topologyTopLeftChromeGroupRect &&
                                      topologyTopLeftChromeGroupStyle &&
                                      topologyTopLeftChromeGroupStyle.display !== "none" &&
                                      topologyTopLeftChromeGroupStyle.visibility !== "hidden" &&
                                      Number(topologyTopLeftChromeGroupStyle.opacity || "1") > 0.01 &&
                                      topologyTopLeftChromeGroupRect.width > 0 &&
                                      topologyTopLeftChromeGroupRect.height > 0
                                    ),
                                  topologyTopLeftChromeGroupState,
                                  topologyTopLeftChromeGroupLeft:
                                    topologyTopLeftChromeGroupRect?.left || 0,
                                  topologyTopLeftChromeGroupRight:
                                    topologyTopLeftChromeGroupRect?.right || 0,
                                  topologyTopLeftChromeGroupWidth:
                                    topologyTopLeftChromeGroupRect?.width || 0,
                                  topologyCreateNodeOpen:
                                    Boolean(topologyCreateNodePanel),
                                  topologyCreateNodePanelVisible:
                                    Boolean(
                                      topologyCreateNodePanelRect &&
                                      topologyCreateNodePanelStyle &&
                                      topologyCreateNodePanelStyle.display !== "none" &&
                                      topologyCreateNodePanelStyle.visibility !== "hidden" &&
                                      Number(topologyCreateNodePanelStyle.opacity || "1") > 0.01 &&
                                      topologyCreateNodePanelRect.width > 0 &&
                                      topologyCreateNodePanelRect.height > 0
                                    ),
                                  topologyCreateNodePanelAttentionRole:
                                    topologyCreateNodePanel?.getAttribute("data-attention-role") || "",
                                  topologyCreateNodePanelPlacementContract:
                                    topologyCreateNodePanel?.getAttribute("data-placement-contract") || "",
                                  topologyCreateNodeSurfaceRole:
                                    topologyCreateNodePanel?.getAttribute("data-surface-role") || "",
                                  topologyCreateNodeElevationContract:
                                    topologyCreateNodePanel?.getAttribute("data-elevation-contract") || "",
                                  topologyCreateNodeSizeContract:
                                    topologyCreateNodePanel?.getAttribute("data-size-contract") || "",
                                  topologyCreateNodePanelTopToken:
                                    topologyCreateNodePanel?.getAttribute("data-top-token") || "",
                                  topologyCreateNodePanelWidthToken:
                                    topologyCreateNodePanel?.getAttribute("data-width-token") || "",
                                  topologyCreateNodePanelMaxHeightToken:
                                    topologyCreateNodePanel?.getAttribute("data-max-height-token") || "",
                                  topologyCreateNodeFormSurfaceToken:
                                    topologyCreateNodeForm?.getAttribute("data-surface-token") || "",
                                  topologyCreateNodeFormBorderToken:
                                    topologyCreateNodeForm?.getAttribute("data-border-token") || "",
                                  topologyCreateNodeFormShadowToken:
                                    topologyCreateNodeForm?.getAttribute("data-shadow-token") || "",
                                  topologyCreateNodePanelRole:
                                    topologyCreateNodePanel?.getAttribute("role") || "",
                                  topologyCreateNodePanelAriaModal:
                                    topologyCreateNodePanel?.getAttribute("aria-modal") || "",
                                  topologyCreateNodePanelLabelledBy:
                                    topologyCreateNodePanel?.getAttribute("aria-labelledby") || "",
                                  topologyCreateNodeHeadingId:
                                    topologyCreateNodePanel?.querySelector("[id]")?.getAttribute("id") || "",
                                  topologyCreateNodeFocusInside,
                                  topologyCreateNodeActiveElementTestId,
                                  topologyCreateNodePanelTop:
                                    topologyCreateNodePanelRect?.top || 0,
                                  topologyCreateNodePanelBottom:
                                    topologyCreateNodePanelRect?.bottom || 0,
                                  topologyCreateNodePanelLeft:
                                    topologyCreateNodePanelRect?.left || 0,
                                  topologyCreateNodePanelRight:
                                    topologyCreateNodePanelRect?.right || 0,
                                  topologyCreateNodePanelWidth:
                                    topologyCreateNodePanelRect?.width || 0,
                                  topologyCreateNodePanelHeight:
                                    topologyCreateNodePanelRect?.height || 0,
                                  /*
                                   * ⚠️ 2026-08-11 — **the reference for centring is also the map.** Measured
                                   * against the viewport centre, this value was always off by half the rail
                                   * width (measured 31.5 ≈ 64/2), exceeding the 24 tolerance and so always
                                   * failing. The composer stands at the centre of the region it blocks (the
                                   * map), and that region is the same `topologyCreateNodeBackdropTargetRect`
                                   * as above.
                                   */
                                  topologyCreateNodePanelCenterOffset:
                                    topologyCreateNodePanelRect
                                      ? Math.abs(
                                          (topologyCreateNodePanelRect.left + (topologyCreateNodePanelRect.width / 2)) -
                                            (topologyCreateNodeBackdropTargetRect
                                              ? topologyCreateNodeBackdropTargetRect.left +
                                                topologyCreateNodeBackdropTargetRect.width / 2
                                              : innerWidth / 2),
                                        )
                                      : 0,
                                  topologyCreateNodeBackdropVisible,
                                  topologyCreateNodeBackdropCoversViewport,
                                  topologyCreateNodeBackdropPointerEvents:
                                    topologyCreateNodeBackdropStyle?.pointerEvents || "",
                                  topologyCreateNodeBackdropContract:
                                    topologyCreateNodeBackdrop?.getAttribute("data-backdrop-contract") || "",
                                  topologyCreateNodeBackdropSurfaceToken:
                                    topologyCreateNodeBackdrop?.getAttribute("data-backdrop-surface-token") || "",
                                  topologyCreateNodeBackdropBackground:
                                    topologyCreateNodeBackdropStyle?.backgroundColor || "",
                                  topologyCreateNodeBackdropFilter:
                                    topologyCreateNodeBackdropStyle?.backdropFilter || "",
                                  topologyInteractiveOverlayCount:
                                    topologyInteractiveOverlayNames.length,
                                  topologyInteractiveOverlayNames,
                                  topologyBlockingComposerOverlayContract,
                                  topologyMapSurfaceBlockingEdit:
                                    topologyMapSurface?.getAttribute("data-blocking-edit") === "true",
                                  topologyMapSurfaceDemoted:
                                    topologyMapSurface?.getAttribute("data-map-demoted") === "true",
                                  topologyMapSurfaceDimOpacity:
                                    Number(topologyMapSurface?.getAttribute("data-map-dim-opacity") || "1"),
                                  topologyMapSurfaceDimOpacityToken:
                                    topologyMapSurface?.getAttribute("data-map-dim-opacity-token") || "",
                                  topologyMapSurfaceFilterToken:
                                    topologyMapSurface?.getAttribute("data-map-filter-token") || "",
                                  topologyMapSurfaceInteractionContract:
                                    topologyMapSurface?.getAttribute("data-map-interaction-contract") || "",
                                  topologyMapSurfaceOpacity:
                                    Number(topologyMapSurfaceStyle?.opacity || "1"),
                                  topologyMapSurfacePointerEvents:
                                    topologyMapSurfaceStyle?.pointerEvents || "",
                                  topologyCreateNodePanelText:
                                    topologyCreateNodePanel?.textContent?.trim() || "",
                                  topologyCreateNodeTitlePlaceholder:
                                    topologyCreateNodeTitleInput?.getAttribute("placeholder") || "",
                                  topologyCreateNodeDomainPlaceholder:
                                    topologyCreateNodeDomainInput?.getAttribute("placeholder") || "",
                                  topologyCreateNodeKindOptions:
                                    Array.from(topologyCreateNodeKindSelect?.querySelectorAll("option") || []).map((option) => option.textContent?.trim() || ""),
                                  topologyCreateNodeSubmitLabel:
                                    topologyCreateNodeSubmit?.textContent?.trim() || "",
                                  topologyMinimapState:
                                    sigmaViewport?.getAttribute("data-minimap-state") || "",
                                  topologyRelationLegendState:
                                    sigmaViewport?.getAttribute("data-relation-legend-state") || "",
                                  topologySupportChromeZoomLensActive:
                                    sigmaViewport?.getAttribute("data-support-chrome-zoom-lens-active") === "true",
                                  topologySupportChromeZoomLensThresholdRatio:
                                    Number(sigmaViewport?.getAttribute("data-support-chrome-zoom-lens-threshold-ratio") || "0"),
                                  topologySelectedNodePopoverVisible: Boolean(topologySelectedNodePopover),
                                  topologySelectedNodeId,
                                  topologySelectedNodeKind,
                                  topologySelectedNodeTitle,
                                  topologySelectedNodeSource,
                                  topologySelectedNodeSummary,
                                  topologyVerifierTokenContractVersion: "command-spine-v1",
                                  topologyNodePopoverVisible:
                                    Boolean(topologyNodePopoverRect) &&
                                    topologyNodePopoverStyle?.display !== "none" &&
                                    topologyNodePopoverStyle?.visibility !== "hidden" &&
                                    Number(topologyNodePopoverStyle?.opacity || "1") > 0.01,
                                  topologyNodePopoverCollapsed:
                                    topologyNodePopover?.getAttribute("data-collapsed") === "true",
                                  topologyNodePopoverSurfaceRole,
                                  topologyNodePopoverAttentionRole,
                                  topologyNodePopoverFocusPrimary,
                                  topologyNodePopoverHierarchyContract,
                                  topologyNodePopoverPositionContract:
                                    topologyNodePopoverPositioner?.getAttribute("data-position-contract") || "",
                                  topologyNodePopoverGutterContract:
                                    topologyNodePopoverPositioner?.getAttribute("data-selected-inspector-gutter-contract") || "",
                                  topologyNodePopoverRightInsetToken:
                                    topologyNodePopoverPositioner?.getAttribute("data-position-right-inset-token") || "",
                                  topologyTopLeftChromeGroupSupportContract,
                                  topologyNodePopoverSizePolicy:
                                    topologyNodePopover?.getAttribute("data-size-policy") || "",
                                  topologyNodePopoverWidthToken:
                                    topologyNodePopover?.getAttribute("data-width-token") || "",
                                  topologyNodePopoverRailWidthToken:
                                    topologyNodePopover?.getAttribute("data-rail-width-token") || "",
                                  topologyNodePopoverMaxHeightToken:
                                    topologyNodePopover?.getAttribute("data-max-height-token") || "",
                                  topologyNodePopoverScrollContract:
                                    topologyNodePopover?.getAttribute("data-popover-scroll-contract") || "",
                                  topologyNodePopoverOverflowY:
                                    topologyNodePopoverStyle?.overflowY || "",
                                  topologyNodePopoverOverflowX:
                                    topologyNodePopoverStyle?.overflowX || "",
                                  topologyNodePopoverSurfaceToken:
                                    topologyNodePopover?.getAttribute("data-popover-surface-token") || "",
                                  topologyNodePopoverBorderToken:
                                    topologyNodePopover?.getAttribute("data-popover-border-token") || "",
                                  topologyNodePopoverSurfaceComputed:
                                    topologyNodePopoverStyle?.backgroundColor || "",
                                  topologyNodePopoverBorderComputed:
                                    topologyNodePopoverStyle?.borderTopColor || "",
                                  topologyNodePopoverResponsiveWidthContract:
                                    topologyNodePopover?.getAttribute("data-responsive-width-contract") || "",
                                  topologyNodePopoverCompactHandoffContract:
                                    topologyNodePopover?.getAttribute("data-compact-handoff-contract") || "",
                                  topologyNodePopoverAgentHandoffContract,
                                  topologyNodePopoverAgentHandoffRoute,
                                  topologyNodePopoverAgentHandoffPrimaryAction,
                                  topologyNodePopoverAgentHandoffActionCount,
                                  topologyNodePopoverRelationFactCount,
                                  topologyNodePopoverRelationTypeCount,
                                  topologyNodePopoverAgentHandoffRelationFactCount,
                                  topologyNodePopoverAgentHandoffRelationTypeCount,
                                  topologyNodePopoverAgentHandoffSummaryContract,
                                  topologyNodePopoverAgentHandoffVisibleSummary,
                                  topologyNodePopoverAgentHandoffSelectedNode,
                                  topologyNodePopoverWidth:
                                    topologyNodePopoverRect?.width || 0,
                                  topologyNodePopoverHeight:
                                    topologyNodePopoverRect?.height || 0,
                                  topologyNodePopoverClientHeight:
                                    topologyNodePopover?.clientHeight || 0,
                                  topologyNodePopoverScrollHeight:
                                    topologyNodePopover?.scrollHeight || 0,
                                  topologyNodePopoverClientWidth:
                                    topologyNodePopover?.clientWidth || 0,
                                  topologyNodePopoverScrollWidth:
                                    topologyNodePopover?.scrollWidth || 0,
                                  topologyNodePopoverLeft:
                                    topologyNodePopoverRect?.left || 0,
                                  topologyNodePopoverRight:
                                    topologyNodePopoverRect?.right || 0,
                                  topologyNodePopoverTop:
                                    topologyNodePopoverRect?.top || 0,
                                  topologyNodePopoverBottom:
                                    topologyNodePopoverRect?.bottom || 0,
                                  topologyNodePopoverRelationRowVisible:
                                    Boolean(topologyNodePopoverRelationRow),
                                  topologyNodePopoverRelationRowOverflowContract:
                                    topologyNodePopoverRelationRow?.getAttribute("data-overflow-contract") || "",
                                  topologyNodePopoverRelationRowWidth:
                                    topologyNodePopoverRelationRowRect?.width || 0,
                                  topologyNodePopoverRelationRowHeight:
                                    topologyNodePopoverRelationRowRect?.height || 0,
                                  topologyNodePopoverRelationRowClientWidth:
                                    topologyNodePopoverRelationRow?.clientWidth || 0,
                                  topologyNodePopoverRelationRowScrollWidth:
                                    topologyNodePopoverRelationRow?.scrollWidth || 0,
                                  topologyNodePopoverRelationRowDensityContract:
                                    topologyNodePopoverRelationRow?.getAttribute("data-row-density-contract") || "",
                                  topologyNodePopoverRelationRowMinHitHeight:
                                    Number(topologyNodePopoverRelationRow?.getAttribute("data-row-min-hit-height") || "0"),
                                  topologyNodePopoverRelationRowScanOrder:
                                    topologyNodePopoverRelationRow?.getAttribute("data-row-scan-order") || "",
                                  topologyNodePopoverRelationTitlePrimaryScanTarget:
                                    topologyNodePopoverRelationTitle?.getAttribute("data-primary-scan-target") || "",
                                  topologyNodePopoverRelationQuality:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-quality") || "",
                                  topologyNodePopoverRelationType:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-type") || "",
                                  topologyNodePopoverRelationEvidenceState:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-evidence-state") || "",
                                  topologyNodePopoverRelationEvidenceGlyph:
                                    topologyNodePopoverRelationEvidenceGlyph?.textContent || "",
                                  topologyNodePopoverRelationAgentGateKind:
                                    topologyNodePopoverRelationRow?.getAttribute("data-agent-gate-kind") || "",
                                  topologyNodePopoverRelationPrimaryCopyAction:
                                    topologyNodePopoverRelationRow?.getAttribute("data-primary-copy-action") || "",
                                  topologyNodePopoverRelationAgentGateText:
                                    topologyNodePopoverRelationGate?.textContent || "",
                                  topologyNodePopoverRelationFactRoute:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route") || "",
                                  topologyNodePopoverRelationFactRouteQuality:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-quality") || "",
                                  topologyNodePopoverRelationFactRouteEvidence:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-evidence") || "",
                                  topologyNodePopoverRelationFactRouteGate:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-gate") || "",
                                  topologyNodePopoverRelationFactRouteAction:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-action") || "",
                                  topologyNodePopoverRelationHandoffGrammarContract:
                                    topologyNodePopoverRelationRouteRail?.getAttribute("data-handoff-grammar-contract") ||
                                    topologyNodePopoverRelationRow?.getAttribute("data-handoff-grammar-contract") ||
                                    "",
                                  topologyNodePopoverRelationFactRouteChips,
                                  topologyNodePopoverRelationRouteState:
                                    topologyNodePopoverRelationRouteRail?.getAttribute("data-relation-route-state") || "",
                                  topologyNodePopoverRelationHandoffLane:
                                    topologyNodePopoverRelationRouteRail?.getAttribute("data-handoff-lane") || "",
                                  topologyNodePopoverRelationRouteRailWidth:
                                    topologyNodePopoverRelationRouteRailRect?.width || 0,
                                  topologyNodePopoverRelationRouteRailScrollWidth:
                                    topologyNodePopoverRelationRouteRail?.scrollWidth || 0,
                                  topologyNodePopoverRelationPayloadChipWidth:
                                    topologyNodePopoverRelationPayloadChipRect?.width || 0,
                                  topologyNodePopoverRelationPayloadChipText:
                                    topologyNodePopoverRelationPayloadChip?.textContent || "",
                                  topologyNodePopoverRelationPayloadChipTitle:
                                    topologyNodePopoverRelationPayloadChip?.getAttribute("title") || "",
                                  topologyNodePopoverRelationPayloadChipSummary:
                                    topologyNodePopoverRelationPayloadChip?.getAttribute("data-relation-payload-summary") || "",
                                  topologyNodePopoverRelationSourceId:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-source-id") || "",
                                  topologyNodePopoverRelationTargetId:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-target-id") || "",
                                  topologyNodePopoverRelationEndpointRoute:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-endpoint-route") || "",
                                  topologyNodePopoverRelationHandoffSummary:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-summary") || "",
                                  topologyNodePopoverRelationAccessibleName:
                                    topologyNodePopoverRelationRow?.getAttribute("aria-label") || "",
                                  topologyNodePopoverRelationHandoffTool:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-tool") || "",
                                  topologyNodePopoverRelationHandoffOperation:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-operation") || "",
                                  topologyNodePopoverRelationHandoffFrom:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-from") || "",
                                  topologyNodePopoverRelationHandoffTo:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-to") || "",
                                  topologyNodePopoverRelationHandoffType:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-type") || "",
                                  topologyNodePopoverRelationHandoffPayloadSummary:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-payload-summary") || "",
                                  topologyNodePopoverRelationHandoffPayloadJson:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-payload-json") || "",
                                  topologyNodePopoverRelationEndpointChips,
                                  topologyNodePopoverAgentReadinessVisible:
                                    Boolean(topologyNodePopoverAgentReadinessLens),
                                  topologyNodePopoverAgentReadinessText,
                                  topologyNodePopoverAgentReadinessChips,
                                  topologyNodePopoverMapContextVisible:
                                    Boolean(topologyNodePopoverMapContextNote),
                                  topologyNodePopoverMapContextCount:
                                    Number(topologyNodePopoverMapContextNote?.getAttribute("data-map-context-count") || "0"),
                                  topologyNodePopoverMapContextContract:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-contract") || "",
                                  topologyNodePopoverMapContextHandoffContract:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-handoff-contract") || "",
                                  topologyNodePopoverMapContextRelationTypeCount:
                                    Number(topologyNodePopoverMapContextNote?.getAttribute("data-map-context-relation-type-count") || "0"),
                                  topologyNodePopoverMapContextQualitySummary:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-quality-summary") || "",
                                  topologyNodePopoverMapContextAgentReadinessSummary:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-agent-readiness-summary") || "",
                                  topologyNodePopoverMapContextText:
                                    topologyNodePopoverMapContextNote?.textContent || "",
                                  topologySelectedRelationHaloVisible:
                                    topologySelectedRelationVisibleHalos.length > 0,
                                  topologySelectedRelationHaloCount:
                                    topologySelectedRelationHalos.length,
                                  topologySelectedRelationVisibleHaloCount:
                                    topologySelectedRelationVisibleHalos.length,
                                  topologySelectedRelationHaloQuality:
                                    topologySelectedRelationHalo?.quality || "",
                                  topologySelectedRelationHaloSample:
                                    topologySelectedRelationHalos.slice(0, 3),
                                  topologySelectedRelationLabelHitAligned,
                                  topologySelectedRelationLabelHitWidth:
                                    topologySelectedRelationLabelHitRect?.width || 0,
                                  topologySelectedRelationLabelHitHeight:
                                    topologySelectedRelationLabelHitRect?.height || 0,
                                  topologySelectedRelationLabelHitLeft:
                                    topologySelectedRelationLabelHitRect?.left || 0,
                                  topologySelectedRelationLabelHitRight:
                                    topologySelectedRelationLabelHitRect?.right || 0,
                                  topologySelectedRelationLabelCompact:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-compact") || "",
                                  topologySelectedRelationLabelDensity:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-density") || "",
                                  topologySelectedRelationLabelDesiredWidth:
                                    Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-desired-width") || "0"),
                                  topologySelectedRelationLabelCenteredAvailableWidth:
                                    Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-centered-available-width") || "0"),
                                  topologySelectedRelationLabelViewportClampContract:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-viewport-clamp-contract") || "",
                                  topologySelectedRelationLabelViewportClampSide:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-viewport-clamp-side") || "",
                                  topologySelectedRelationLabelViewportInset:
                                    Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-viewport-inset") || "0"),
                                  topologySelectedRelationLabelGeometryId,
                                  topologySelectedRelationLabelQuality,
                                  topologySelectedRelationLabelQualityChipText,
                                  topologySelectedRelationLabelEvidenceState,
                                  topologySelectedRelationLabelEvidenceGlyph,
                                  topologySelectedRelationLabelSource,
                                  topologySelectedRelationLabelTarget,
                                  topologySelectedRelationLabelType,
                                  topologySelectedRelationLabelCount,
                                  topologySelectedRelationLabelRoute,
                                  topologySelectedRelationLabelTypeLabel,
                                  topologySelectedRelationLabelAgentGateKind,
                                  topologySelectedRelationLabelPrimaryCopyAction,
                                  topologySelectedRelationLabelCliFallbackCommand,
                                  topologySelectedRelationLabelAgentGateText,
                                  topologySelectedRelationLabelFactRoute,
                                  topologySelectedRelationLabelFactRouteQuality,
                                  topologySelectedRelationLabelFactRouteEvidence,
                                  topologySelectedRelationLabelFactRouteGate,
                                  topologySelectedRelationLabelFactRouteAction,
                                  topologySelectedRelationLabelFactRouteChips,
                                  topologySelectedRelationPrimaryCopyActionKind,
                                  topologySelectedRelationPrimaryCopyActionText:
                                    topologySelectedRelationPrimaryCopyAction?.textContent || "",
                                  topologySelectedRelationPrimaryCopyActionCall,
                                  topologySelectedRelationPrimaryCopyActionTitle,
                                  topologySelectedRelationPrimaryCopyRecommended:
                                    topologySelectedRelationPrimaryCopyAction?.getAttribute("data-copy-recommended") === "true",
                                  topologySelectedRelationPrimaryCopyBadgeText:
                                    topologySelectedRelationPrimaryCopyRecommendationLabel,
                                  topologySelectedRelationCopyActions,
                                  topologySelectedRelationPrimaryCopyActionWidth:
                                    topologySelectedRelationPrimaryCopyActionRect?.width || 0,
                                  topologySelectedRelationPrimaryCopyActionHeight:
                                    topologySelectedRelationPrimaryCopyActionRect?.height || 0,
                                  topologySelectedRelationEndpointVisibleCount,
                                  topologySelectedRelationEndpointHiddenCount,
                                  topologySelectedRelationEndpointCards,
                                  topologySelectedRelationLowerPriorityVisibleDimmedCount,
                                  topologySelectedRelationVisibleOrientationAnchorCount,
                                  topologySelectedRelationHiddenContextInteractionContract,
                                  topologySelectedRelationHiddenContextInteractiveCount,
                                  topologySelectedRelationVerifyAttempted:
                                    topologySelectedRelationVerification?.attempted === true,
                                  topologySelectedRelationVerifyReason:
                                    topologySelectedRelationVerification?.reason || "",
                                  topologySelectedRelationVerifyClicked:
                                    topologySelectedRelationVerification?.clicked === true,
                                  topologySelectedRelationVerifySelected:
                                    topologySelectedRelationVerification?.selected === true,
                                  topologySelectedRelationVerifyAttempts:
                                    topologySelectedRelationVerification?.attempts || 0,
                                  topologyV2SelectedRelationSource:
                                    topologySelectedRelationVerification?.sourceId || "",
                                  topologyV2SelectedRelationTarget:
                                    topologySelectedRelationVerification?.targetId || "",
                                  topologyV2SelectedRelationType:
                                    topologySelectedRelationVerification?.relationType || "",
                                  topologyDragAttempted: topologyDragVerification?.attempted === true,
                                  topologyDragReason: topologyDragVerification?.reason || "",
                                  topologyFocusNoopAttempted:
                                    topologyFocusNoopVerification?.attempted === true,
                                  topologyFocusNoopReason:
                                    topologyFocusNoopVerification?.reason || "",
                                  topologyFocusNoopBeforeTrigger:
                                    topologyFocusNoopVerification?.beforeTrigger || "",
                                  topologyFocusNoopAfterTrigger:
                                    topologyFocusNoopVerification?.afterTrigger || "",
                                  topologyFocusNoopAfterState:
                                    topologyFocusNoopVerification?.afterState || "",
                                  topologyFocusNoopAfterDistancePx:
                                    Number(topologyFocusNoopVerification?.afterDistancePx || 0),
                                  topologyDragSelectionAttempts: topologyDragVerification?.selectionAttempts || 0,
                                  topologyDragFocusSelected: topologyDragVerification?.focusSelected === true,
                                  topologyDragFocusMoved: topologyDragVerification?.focusMoved === true,
                                  topologyDragFocusDelta: topologyDragVerification?.focusDelta || null,
                                  topologyDragRelationLabelClicked: topologyDragVerification?.relationLabelClicked === true,
                                  topologyDragNodePopoverExpandClicked: topologyDragVerification?.nodePopoverExpandClicked === true,
                                  topologyNodePopoverVerifyAttempted:
                                    topologyNodePopoverVerification?.attempted === true,
                                  topologyNodePopoverVerifyReason:
                                    topologyNodePopoverVerification?.reason || "",
                                  topologyNodePopoverVerifyExpanded:
                                    topologyNodePopoverVerification?.expanded === true,
                                  topologyNodePopoverVerifyCompactFactsVisible:
                                    topologyNodePopoverVerification?.compact?.factsVisible === true,
                                  topologyNodePopoverVerifyCompactFactsContract:
                                    topologyNodePopoverVerification?.compact?.factsContract || "",
                                  topologyNodePopoverVerifyCompactFactsReadableContract:
                                    topologyNodePopoverVerification?.compact?.factsReadableContract || "",
                                  topologyNodePopoverVerifyCompactFactsAccessibleName:
                                    topologyNodePopoverVerification?.compact?.factsAccessibleName || "",
                                  topologyNodePopoverVerifyCompactFactsTitle:
                                    topologyNodePopoverVerification?.compact?.factsTitle || "",
                                  topologyNodePopoverVerifyCompactFactsNoScores:
                                    topologyNodePopoverVerification?.compact?.factsNoScores || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffContract:
                                    topologyNodePopoverVerification?.compact?.factsHandoffContract || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffRoute:
                                    topologyNodePopoverVerification?.compact?.factsHandoffRoute || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffTool:
                                    topologyNodePopoverVerification?.compact?.factsHandoffTool || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffSummary:
                                    topologyNodePopoverVerification?.compact?.factsHandoffSummary || "",
                                  topologyNodePopoverVerifyCompactFactsHiddenRemainderCount:
                                    topologyNodePopoverVerification?.compact?.factsHiddenRemainderCount || 0,
                                  topologyNodePopoverVerifyCompactActionsVisible:
                                    topologyNodePopoverVerification?.compact?.actionsVisible === true,
                                  topologyNodePopoverVerifyCompactActionsContract:
                                    topologyNodePopoverVerification?.compact?.actionsContract || "",
                                  topologyNodePopoverVerifyCompactActionsReadableFlow:
                                    topologyNodePopoverVerification?.compact?.actionsReadableFlow || "",
                                  topologyNodePopoverVerifyCompactBriefVisible:
                                    topologyNodePopoverVerification?.compact?.briefVisible === true,
                                  topologyNodePopoverVerifyCompactBriefAction:
                                    topologyNodePopoverVerification?.compact?.briefAction || "",
                                  topologyNodePopoverVerifyCompactBriefReadableFlow:
                                    topologyNodePopoverVerification?.compact?.briefReadableFlow || "",
                                  topologyNodePopoverVerifyCompactBriefRailLabel:
                                    topologyNodePopoverVerification?.compact?.briefRailLabel || "",
                                  topologyNodePopoverVerifyCompactBriefTitle:
                                    topologyNodePopoverVerification?.compact?.briefTitle || "",
                                  topologyDragCompanionVisible: topologyDragVerification?.companionVisible === true,
                                  topologyDragCompanionAligned: topologyDragVerification?.companionAligned === true,
                                  topologyDragCompanionDelta: topologyDragVerification?.companionDelta || null,
                                  topologyDragCompanionSlug: topologyDragVerification?.companionSlug || "",
                                  topologyDragHandleSlug: topologyDragVerification?.dragHandleSlug || "",
                                  topologyDragCompanionCount: topologyDragVerification?.companionCount || 0,
                                  topologyDragVisibleCompanionCount: topologyDragVerification?.visibleCompanionCount || 0,
                                  topologyDragAlignedCompanionCount: topologyDragVerification?.alignedCompanionCount || 0,
                                  topologyDragClusterSize:
                                    Number(topologyDragVerification?.clusterSize || 0) ||
                                    0,
                                  topologyDragPhysicsSyncContract:
                                    topologyDragVerification?.dragPhysicsSyncContract ||
                                    "",
                                  topologyDragPhysicsReleasePolicy:
                                    topologyDragVerification?.dragPhysicsReleasePolicy ||
                                    "",
                                  topologyDragPhysicsSyncActiveDuring:
                                    topologyDragVerification?.dragPhysicsSyncActiveDuring === true,
                                  topologyDragWorkerAppliedFrameDelta:
                                    Number(topologyDragVerification?.workerAppliedFrameDelta || 0),
                                  topologyDragWorkerAppliedFrameChangeCount:
                                    Number(topologyDragVerification?.workerAppliedFrameChangeCount || 0),
                                  topologyDragRelationLabelVisibilityContract:
                                    topologyDragVerification?.dragRelationLabelVisibilityContract ||
                                    "",
                                  topologyDragRelationLabelExpectedCount:
                                    Number(
                                      topologyDragVerification?.dragRelationLabelExpectedCount ||
                                        "0"
                                    ),
                                  topologyDragRelationLabelVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragRelationLabelVisibleCount ||
                                        "0"
                                    ),
                                  topologyDragRelationLabelVisibleDuringDrag:
                                    topologyDragVerification?.dragRelationLabelVisible === true,
                                  topologyDragRelationLabelCompactContract:
                                    topologyDragVerification?.dragRelationLabelCompactContract ||
                                    "",
                                  topologyDragRelationLabelCompactCount:
                                    Number(
                                      topologyDragVerification?.dragRelationLabelCompactCount ||
                                        "0"
                                    ),
                                  topologyDragRelationLabelPresentation:
                                    topologyDragVerification?.dragRelationLabelPresentation || "",
                                  topologyDragRelationLabelCompact:
                                    topologyDragVerification?.dragRelationLabelCompact === true,
                                  topologyDragRelationLabelCompactItemContract:
                                    topologyDragVerification?.dragRelationLabelCompactItemContract || "",
                                  topologyDragRelationLabelReadableType:
                                    topologyDragVerification?.dragRelationLabelReadableType || "",
                                  topologyDragRelationLabelVisibleText:
                                    topologyDragVerification?.dragRelationLabelVisibleText || "",
                                  topologyDragRelationLabelBadgeWidth:
                                    Number(topologyDragVerification?.dragRelationLabelBadgeWidth || 0),
                                  topologyDragRelationLabelBadgeHeight:
                                    Number(topologyDragVerification?.dragRelationLabelBadgeHeight || 0),
                                  topologyDragRelationLabelBadgeRadius:
                                    Number(topologyDragVerification?.dragRelationLabelBadgeRadius || 0),
                                  topologyDragInteractionCueContract:
                                    topologyDragVerification?.dragInteractionCueContract || "",
                                  topologyDragInteractionCueVisible:
                                    topologyDragVerification?.dragInteractionCueVisible === true,
                                  topologyDragInteractionCueText:
                                    topologyDragVerification?.dragInteractionCueText || "",
                                  topologyDragInteractionCueLinkedCardCount:
                                    Number(topologyDragVerification?.dragInteractionCueLinkedCardCount || 0),
                                  topologyDragInteractionCueRelationLinkCount:
                                    Number(topologyDragVerification?.dragInteractionCueRelationLinkCount || 0),
                                  topologyDragReactiveContextContract:
                                    topologyDragVerification?.dragReactiveContextContract ||
                                    "",
                                  topologyDragReactiveContextPolicy:
                                    topologyDragVerification?.dragReactiveContextPolicy ||
                                    "",
                                  topologyDragReactiveContextOpacity:
                                    topologyDragVerification?.dragReactiveContextOpacity ||
                                    "",
                                  topologyDragReactiveContextOpacityToken:
                                    topologyDragVerification?.dragReactiveContextOpacityToken ||
                                    "",
                                  topologyDragReactiveContextVisualContract:
                                    topologyDragVerification?.dragReactiveContextVisualContract ||
                                    "",
                                  topologyDragReactiveContextVisualToken:
                                    topologyDragVerification?.dragReactiveContextVisualToken ||
                                    "",
                                  topologyDragReactiveContextVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveContextVisibleCount ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionContract:
                                    topologyDragVerification?.dragReactiveMotionContract ||
                                    "",
                                  topologyDragReactiveMotionPolicy:
                                    topologyDragVerification?.dragReactiveMotionPolicy ||
                                    "",
                                  topologyDragReactiveMotionLinkedPolicy:
                                    topologyDragVerification?.dragReactiveMotionLinkedPolicy ||
                                    "",
                                  topologyDragReactiveMotionVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionVisibleCount ||
                                        "0"
                                    ),
                                  topologyDragReactiveAmbientMotionVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveAmbientMotionVisibleCount ||
                                        "0"
                                    ),
                                  topologyDragReactiveLinkedMotionVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveLinkedMotionVisibleCount ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionMaxObservedOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionMaxObservedOffsetPx ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionMaxOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionMaxOffsetPx ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionBaseMaxOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionBaseMaxOffsetPx ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionLinkedMaxOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionLinkedMaxOffsetPx ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionMaxOffsetToken:
                                    topologyDragVerification?.dragReactiveMotionMaxOffsetToken ||
                                    "",
                                  topologyDragTensionConnectorContract:
                                    topologyDragVerification?.dragTensionConnectorContract ||
                                    "",
                                  topologyDragTensionConnectorPolicy:
                                    topologyDragVerification?.dragTensionConnectorPolicy ||
                                    "",
                                  topologyDragTensionConnectorExpectedCount:
                                    Number(
                                      topologyDragVerification?.dragTensionConnectorExpectedCount ||
                                        "0"
                                    ),
                                  topologyDragTensionConnectorVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragTensionConnectorVisibleCount ||
                                        "0"
                                    ),
                                  topologyDragTensionConnectorActiveOpacity:
                                    topologyDragVerification?.dragTensionConnectorActiveOpacity ||
                                    "",
                                  topologyDragTensionConnectorActiveStrokeWidth:
                                    topologyDragVerification?.dragTensionConnectorActiveStrokeWidth ||
                                    "",
                                  topologyDragSettledRoot:
                                    topologyDragVerification?.dragSettledRoot ||
                                    "",
                                  topologyDragSettleFeedbackContract:
                                    topologyDragVerification?.dragSettleFeedbackContract ||
                                    "",
                                  topologyDragSettledClusterSize:
                                    Number(
                                      topologyDragVerification?.dragSettledClusterSize ||
                                        "0"
                                    ),
                                  topologyLayoutWorkerPositionFrameSkipPolicy:
                                    topologyDragVerification?.workerFrameSkipPolicy ||
                                    sigmaViewport?.getAttribute("data-layout-worker-position-frame-skip-policy") ||
                                    "",
                                  topologyFrameProfile,
                                  topologyMapEngine,
                                  topologyV2CanvasInkPixels,
                                  topologyMapCanvasCardCount,
                                  topologyV2DetailPanelVisible,
                                  topologyV2DetailPanelNodeId:
                                    topologyV2DetailPanel?.getAttribute("data-selected-node-id") || "",
                                  topologyV2DetailPanelNodeKind:
                                    topologyV2DetailPanel?.getAttribute("data-selected-node-kind") || "",
                                  topologyV2DetailPanelNodeTitle:
                                    topologyV2DetailPanel?.getAttribute("data-selected-node-title") || "",
                                  topologyV2DetailPanelPresence:
                                    topologyV2DetailPanel?.getAttribute("data-presence") || "",
                                  topologyV2DetailPanelWidth:
                                    topologyV2DetailPanelRect?.width || 0,
                                  topologyV2DetailPanelHeight:
                                    topologyV2DetailPanelRect?.height || 0,
                                  topologyV2ProjectSourceReceiptVisible:
                                    aiSettingsVisible(topologyV2ProjectSourceReceipt),
                                  topologyV2ProjectSourceLayout:
                                    topologyV2ProjectSourceReceipt?.getAttribute("data-source-layout") || "",
                                  topologyV2ProjectSourceTopGap:
                                    topologyV2ProjectSourceReceipt?.getAttribute("data-source-top-gap") || "",
                                  topologyV2ProjectSourceGapVisible:
                                    aiSettingsVisible(topologyV2ProjectSourceGap),
                                  topologyV2ProjectSourceAction:
                                    topologyV2ProjectSourceReceipt?.getAttribute("data-source-action") || "",
                                  topologyV2ProjectSourceInlineActionCount:
                                    Number(topologyV2DetailPanelActions?.getAttribute("data-inline-action-count") || "0"),
                                  topologyV2ProjectSourceRenderedActionCount:
                                    topologyV2InlineActionWidths.length,
                                  topologyV2ProjectSourceInlineActionMinWidth:
                                    topologyV2InlineActionWidths.length > 0
                                      ? Math.min(...topologyV2InlineActionWidths)
                                      : 0,
                                  topologyV2ProjectSourceReceiptActionOverlap:
                                    topologyV2RectOverlapArea(
                                      topologyV2ProjectSourceReceiptRect,
                                      topologyV2DetailPanelActionsRect
                                    ),
                                  topologyV2ProjectSourceReceiptFooterOverlap:
                                    topologyV2RectOverlapArea(
                                      topologyV2ProjectSourceReceiptRect,
                                      topologyV2DetailPanelFooterRect
                                    ),
                                  topologyV2ProjectSourceActionFooterOverlap:
                                    topologyV2RectOverlapArea(
                                      topologyV2DetailPanelActionsRect,
                                      topologyV2DetailPanelFooterRect
                                    ),
                                  topologyV2EdgePanelVisible,
                                  topologyV2EdgePanelRole:
                                    topologyV2EdgePanel?.getAttribute("role") || "",
                                  topologyV2EdgePanelAriaLabel:
                                    topologyV2EdgePanel?.getAttribute("aria-label") || "",
                                  topologyV2EdgePanelSentence:
                                    topologyV2EdgePanel?.querySelector(
                                      '[data-testid="topology-v2-edge-sentence"]'
                                    )?.textContent || "",
                                  topologyV2EdgePanelWidth:
                                    topologyV2EdgePanelRect?.width || 0,
                                  topologyV2EdgePanelHeight:
                                    topologyV2EdgePanelRect?.height || 0,
                                  guidedTourOverlayVisible,
                                  topologyV2PrefersReducedMotion,
                                  topologyZoomVerifyAttempted:
                                    topologyZoomVerification?.attempted === true,
                                  topologyZoomVerifyReason:
                                    topologyZoomVerification?.reason || "",
                                  topologyZoomVerifyHookReason:
                                    topologyZoomVerification?.hookReason || "",
                                  topologyZoomLensPresentationActive:
                                    topologyZoomVerification?.presentationActive === true,
                                  topologyZoomLensPresentationSource:
                                    topologyZoomVerification?.presentationSource || "",
                                  topologyZoomLensCameraRatio:
                                    Number(
                                      topologyZoomVerification?.cameraRatio ||
                                      "0"
                                    ),
                                  topologyZoomLensActive:
                                    topologyZoomVerification?.active === true,
                                  topologyZoomLensCardCompactionActive:
                                    topologyZoomVerification?.cardCompactionActive === true,
                                  topologyZoomLensActiveCardCount:
                                    Number(
                                      topologyZoomVerification?.activeCardCount ||
                                      "0"
                                    ),
                                  topologyZoomLensVisibleActiveCardCount:
                                    Number(
                                      topologyZoomVerification?.visibleActiveCardCount ||
                                      "0"
                                    ),
                                  topologyZoomLensPinProximityContract:
                                    topologyZoomVerification?.proximityPinContract || "",
                                  topologyZoomLensPinProximityActive:
                                    topologyZoomVerification?.proximityPinActive === true,
                                  topologyZoomLensProximityPinCount:
                                    Number(
                                      topologyZoomVerification?.proximityPinCount ||
                                      "0"
                                    ),
                                  topologyZoomLensPinProximityRingToken:
                                    topologyZoomVerification?.proximityPinRingToken || "",
                                  topologyZoomLensPinGlyphContract:
                                    topologyZoomVerification?.pinGlyphContract || "",
                                  topologyZoomLensPinGlyphVisibleCount:
                                    Number(topologyZoomVerification?.pinGlyphVisibleCount || "0"),
                                  topologyDragConnectorCount:
                                    Number(topologyDragVerification?.connectorCount || 0) ||
                                    topologyDragConnectorCount,
                                  topologyDragConnectorDrawable: topologyDragConnectorD.startsWith("M "),
                                  topologyDragConnectorClearance
                                }
                              });
                              } catch (markerError) {
                                // If marker collection throws in a particular mode's DOM, an empty
                                // payload gets logged 12 times and the cause disappears — expose the
                                // error as the payload.
                                return JSON.stringify({
                                  href: location.href,
                                  title: document.title,
                                  bodyText: "",
                                  bodyChildren: document.body ? document.body.children.length : null,
                                  readyState: document.readyState,
                                  visibilityState: document.visibilityState,
                                  bg: "",
                                  color: "",
                                  width: innerWidth,
                                  height: innerHeight,
                                  markers: {
                                    markerScriptError: String(
                                      (markerError && (markerError.message || markerError.stack)) || markerError
                                    )
                                  }
                                });
                              }
                            })()