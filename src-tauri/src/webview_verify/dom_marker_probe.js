(() => {
                              try {
                              const bodyText = document.body ? document.body.innerText : "";
                              const links = Array.from(document.querySelectorAll("a")).map((link) => ({
                                href: link.getAttribute("href") || "",
                                text: link.textContent || "",
                              }));
                              const insightsMaintenanceBoard = document.querySelector(
                                '[data-insights-surface="relationship-analysis"]'
                              );
                              const insightsQuestionTabs = Array.from(
                                insightsMaintenanceBoard?.querySelectorAll('[role="tab"]') || []
                              );
                              const insightsSelectedTabs = insightsQuestionTabs.filter(
                                (tab) => tab.getAttribute("aria-selected") === "true"
                              );
                              // Keep historical marker names; only the section tabs count here.
                              const insightsSubjectRadios = Array.from(
                                insightsMaintenanceBoard?.querySelectorAll('[data-testid="insights-core-switch"] [role="tab"]') || []
                              );
                              const insightsSelectedSubject =
                                insightsSubjectRadios
                                  .find((radio) => radio.getAttribute("aria-selected") === "true")
                                  ?.getAttribute("data-testid") || "";
                              const insightsSelectedPanel =
                                insightsMaintenanceBoard?.querySelector("[data-insights-panel]") || null;
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
                              const libraryWorkspace = document.querySelector('[data-testid="library-workspace"]');
                              const librarySelectedTab = libraryWorkspace?.querySelector('[role="tab"][aria-selected="true"]');
                              const librarySelectedPanelId = librarySelectedTab?.getAttribute("aria-controls") || "";
                              const librarySelectedPanel = librarySelectedPanelId
                                ? document.getElementById(librarySelectedPanelId)
                                : null;
                              const librarySelectedPanelVisible = aiSettingsVisible(librarySelectedPanel);
                              const librarySelectedTabKey = (librarySelectedTab?.id || "")
                                .replace("library-workspace-tab-", "");
                              const libraryOntologyHeadingCount = librarySelectedPanel
                                ? librarySelectedPanel.querySelectorAll("h1").length
                                : 0;
                              const libraryOntologyReader = librarySelectedPanel?.querySelector('[data-docs-viewer]');
                              const libraryOntologyStarter = librarySelectedPanel
                                ? Array.from(librarySelectedPanel.querySelectorAll('main section[aria-label]')).find(
                                    (section) => section.querySelector("h2") && section.querySelectorAll("button").length >= 4
                                  ) || null
                                : null;
                              const libraryOntologyReaderVisible = aiSettingsVisible(libraryOntologyReader);
                              const libraryOntologyStarterVisible = aiSettingsVisible(libraryOntologyStarter);
                              const libraryOntologyContentState = libraryOntologyReaderVisible
                                ? "document-reader"
                                : libraryOntologyStarterVisible
                                  ? "ontology-starter"
                                  : "";
                              // Model connections live on the Agents page; marker names stay for the payload contract.
                              const aiSettingsPopover = document.querySelector('[data-testid="agents-page"]');
                              const aiSettingsAiView = document.querySelector('[data-testid="ai-connection-view"]');
                              const aiSettingsUrlInput = document.querySelector('[data-testid="ai-local-url"]');
                              const aiSettingsVerifiedLine = document.querySelector('[data-testid="ai-local-verified"]');
                              const aiSettingsFailureLine = document.querySelector('[data-testid="ai-local-failure"]');
                              const aiSettingsConnectedLine = document.querySelector('[data-testid="ai-local-connected"]');
                              const topologyMapEngineEl = document.querySelector("[data-map-engine]");
                              const topologyMapEngine = topologyMapEngineEl?.getAttribute("data-map-engine") || "";
                              const ontologyMapCanvasInkPixels = (() => {
                                if (topologyMapEngine !== "v2") return 0;
                                const canvas = topologyMapEngineEl?.querySelector(
                                  'canvas[data-testid="ontology-map-canvas"]'
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
                              const ontologyMapDetailPanel = document.querySelector(
                                '[data-testid="map-detail-panel"]'
                              );
                              const ontologyMapDetailPanelRect =
                                ontologyMapDetailPanel?.getBoundingClientRect();
                              const ontologyMapDetailPanelStyle = ontologyMapDetailPanel
                                ? getComputedStyle(ontologyMapDetailPanel)
                                : null;
                              const ontologyMapDetailPanelVisible = Boolean(
                                ontologyMapDetailPanelRect &&
                                ontologyMapDetailPanelRect.width > 1 &&
                                ontologyMapDetailPanelRect.height > 1 &&
                                ontologyMapDetailPanelStyle?.display !== "none" &&
                                ontologyMapDetailPanelStyle?.visibility !== "hidden" &&
                                Number(ontologyMapDetailPanelStyle?.opacity || "1") > 0.01
                              );
                              const ontologyMapProjectSourceReceipt = document.querySelector(
                                '[data-testid="map-project-source-receipt"]'
                              );
                              const ontologyMapProjectSourceGap = document.querySelector(
                                '[data-testid="map-project-source-gap"]'
                              );
                              const ontologyMapDetailPanelActions = document.querySelector(
                                '[data-testid="map-detail-panel-actions"]'
                              );
                              const ontologyMapDetailPanelFooter = document.querySelector(
                                '[data-testid="map-detail-panel-footer"]'
                              );
                              const ontologyMapProjectSourceReceiptRect =
                                ontologyMapProjectSourceReceipt?.getBoundingClientRect();
                              const ontologyMapDetailPanelActionsRect =
                                ontologyMapDetailPanelActions?.getBoundingClientRect();
                              const ontologyMapDetailPanelFooterRect =
                                ontologyMapDetailPanelFooter?.getBoundingClientRect();
                              const ontologyMapRectOverlapArea = (a, b) => {
                                if (!a || !b) return 0;
                                const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                                const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                                return width > 0.5 && height > 0.5 ? width * height : 0;
                              };
                              const ontologyMapInlineActionWidths = ontologyMapDetailPanelActions
                                ? Array.from(ontologyMapDetailPanelActions.children)
                                  .filter(aiSettingsVisible)
                                  .map((action) => action.getBoundingClientRect().width)
                                : [];
                              const ontologyMapEdgePanel = document.querySelector(
                                '[data-testid="map-edge-panel"]'
                              );
                              const ontologyMapEdgePanelRect =
                                ontologyMapEdgePanel?.getBoundingClientRect();
                              const ontologyMapEdgePanelStyle = ontologyMapEdgePanel
                                ? getComputedStyle(ontologyMapEdgePanel)
                                : null;
                              const ontologyMapEdgePanelVisible = Boolean(
                                ontologyMapEdgePanelRect &&
                                ontologyMapEdgePanelRect.width > 1 &&
                                ontologyMapEdgePanelRect.height > 1 &&
                                ontologyMapEdgePanelStyle?.display !== "none" &&
                                ontologyMapEdgePanelStyle?.visibility !== "hidden" &&
                                Number(ontologyMapEdgePanelStyle?.opacity || "1") > 0.01
                              );
                              const guidedTourOverlayVisible = false;
                              const ontologyMapPrefersReducedMotion =
                                window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
                              const mapViewport = document.querySelector('[data-testid="ontology-map"]');
                              const mapViewportRect = mapViewport?.getBoundingClientRect();
                              const mapViewportStyle = mapViewport ? getComputedStyle(mapViewport) : null;
                              const topologyStagePanClickCancelPx = Number(
                                mapViewport?.getAttribute("data-stage-pan-click-cancel-px") ||
                                topologyMapEngineEl?.getAttribute("data-stage-pan-click-cancel-px") ||
                                "0"
                              );
                              const mapCanvases = mapViewport
                                ? Array.from(mapViewport.querySelectorAll("canvas")).map((canvas) => {
                                    const rect = canvas.getBoundingClientRect();
                                    return { width: rect.width, height: rect.height };
                                  })
                                : [];
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
                              // The backdrop blocks the map and leaves the rail alive
                              // (`data-backdrop-contract`), so compare against the map rect, not the viewport.
                              const topologyCreateNodeBackdropTargetRect = (
                                document.querySelector('[data-surface-role="map-canvas"]') ||
                                document.querySelector('[data-testid="ontology-map"]')
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
                              const topologyAttentionWinner = topologyCreateNodePanel
                                ? "blocking-composer"
                                : new URLSearchParams(location.search).get("mode") === "path"
                                  ? "focus-path-state"
                                  : ontologyMapDetailPanel
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
                                  libraryNav: Boolean(document.querySelector('nav a[href*="/library"]')),
                                  librarySurface: Boolean(
                                    aiSettingsVisible(libraryWorkspace) &&
                                    librarySelectedTab &&
                                    librarySelectedPanelVisible &&
                                    librarySelectedTab.getAttribute("aria-controls") === librarySelectedPanel?.id &&
                                    librarySelectedPanel?.getAttribute("aria-labelledby") === librarySelectedTab.id
                                  ),
                                  librarySelectedTab: librarySelectedTabKey,
                                  librarySelectedPanelVisible,
                                  libraryOntologyHeadingCount,
                                  libraryOntologyReaderVisible,
                                  libraryOntologyStarterVisible,
                                  libraryOntologyContentState,
                                  insightsMaintenanceBoard: Boolean(insightsMaintenanceBoard),
                                  insightsQuestionModel:
                                    insightsMaintenanceBoard?.getAttribute("data-insights-question-model") || "",
                                  insightsSubjectCount: insightsSubjectRadios.length,
                                  insightsSelectedSubject,
                                  insightsSelectedPanelKey:
                                    insightsSelectedPanel?.getAttribute("data-insights-panel") || "",
                                  insightsTabCount: insightsQuestionTabs.length,
                                  insightsSelectedTabCount: insightsSelectedTabs.length,
                                  insightsSelectedPanelVisible,
                                  topologyAttentionWinner,
                                  topologyMapViewportVisible: Boolean(
                                    mapViewportRect &&
                                    mapViewportStyle &&
                                    mapViewportStyle.display !== "none" &&
                                    mapViewportStyle.visibility !== "hidden" &&
                                    mapViewportRect.width > 0 &&
                                    mapViewportRect.height > 0
                                  ),
                                  topologyMapCanvasCount: mapCanvases.length,
                                  topologyMapCanvasSizes: mapCanvases,
                                  topologyStagePanClickCancelPx,
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
                                  // The composer centres on the map region it blocks, not the viewport.
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
                                  topologyNodePopoverPositionContract:
                                    topologyNodePopoverPositioner?.getAttribute("data-position-contract") || "",
                                  topologyNodePopoverGutterContract:
                                    topologyNodePopoverPositioner?.getAttribute("data-selected-inspector-gutter-contract") || "",
                                  topologyNodePopoverRightInsetToken:
                                    topologyNodePopoverPositioner?.getAttribute("data-position-right-inset-token") || "",
                                  topologyMapEngine,
                                  ontologyMapCanvasInkPixels,
                                  ontologyMapDetailPanelVisible,
                                  ontologyMapDetailPanelNodeId:
                                    ontologyMapDetailPanel?.getAttribute("data-selected-node-id") || "",
                                  ontologyMapDetailPanelNodeKind:
                                    ontologyMapDetailPanel?.getAttribute("data-selected-node-kind") || "",
                                  ontologyMapDetailPanelNodeTitle:
                                    ontologyMapDetailPanel?.getAttribute("data-selected-node-title") || "",
                                  ontologyMapDetailPanelWidth:
                                    ontologyMapDetailPanelRect?.width || 0,
                                  ontologyMapDetailPanelHeight:
                                    ontologyMapDetailPanelRect?.height || 0,
                                  ontologyMapProjectSourceReceiptVisible:
                                    aiSettingsVisible(ontologyMapProjectSourceReceipt),
                                  ontologyMapProjectSourceLayout:
                                    ontologyMapProjectSourceReceipt?.getAttribute("data-source-layout") || "",
                                  ontologyMapProjectSourceTopGap:
                                    ontologyMapProjectSourceReceipt?.getAttribute("data-source-top-gap") || "",
                                  ontologyMapProjectSourceGapVisible:
                                    aiSettingsVisible(ontologyMapProjectSourceGap),
                                  ontologyMapProjectSourceAction:
                                    ontologyMapProjectSourceReceipt?.getAttribute("data-source-action") || "",
                                  ontologyMapProjectSourceRenderedActionCount:
                                    ontologyMapInlineActionWidths.length,
                                  ontologyMapProjectSourceInlineActionMinWidth:
                                    ontologyMapInlineActionWidths.length > 0
                                      ? Math.min(...ontologyMapInlineActionWidths)
                                      : 0,
                                  ontologyMapProjectSourceReceiptActionOverlap:
                                    ontologyMapRectOverlapArea(
                                      ontologyMapProjectSourceReceiptRect,
                                      ontologyMapDetailPanelActionsRect
                                    ),
                                  ontologyMapProjectSourceReceiptFooterOverlap:
                                    ontologyMapRectOverlapArea(
                                      ontologyMapProjectSourceReceiptRect,
                                      ontologyMapDetailPanelFooterRect
                                    ),
                                  ontologyMapProjectSourceActionFooterOverlap:
                                    ontologyMapRectOverlapArea(
                                      ontologyMapDetailPanelActionsRect,
                                      ontologyMapDetailPanelFooterRect
                                    ),
                                  ontologyMapEdgePanelVisible,
                                  ontologyMapEdgePanelRole:
                                    ontologyMapEdgePanel?.getAttribute("role") || "",
                                  ontologyMapEdgePanelAriaLabel:
                                    ontologyMapEdgePanel?.getAttribute("aria-label") || "",
                                  ontologyMapEdgePanelSentence:
                                    ontologyMapEdgePanel?.querySelector(
                                      '[data-testid="map-edge-sentence"]'
                                    )?.textContent || "",
                                  ontologyMapEdgePanelWidth:
                                    ontologyMapEdgePanelRect?.width || 0,
                                  ontologyMapEdgePanelHeight:
                                    ontologyMapEdgePanelRect?.height || 0,
                                  guidedTourOverlayVisible,
                                  ontologyMapPrefersReducedMotion,
                                }
                              });
                              } catch (markerError) {
                                // Return the error as the payload so a throwing mode does not log empty payloads.
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
