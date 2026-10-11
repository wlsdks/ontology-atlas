import { validateAiSettingsMarkers } from "./ai-settings-contract.mjs";
import { markerNumber } from "./relation-marker-validators.mjs";
import { normalizeTopologySelectedParam, webviewWorkbenchMarkersForPath } from "./webview-env.mjs";

export function validateOntologyMapCanvasEvidence(markers) {
  if (markers?.topologyMapEngine !== "v2") return null;
  if (markerNumber(markers, "ontologyMapCanvasInkPixels") <= 0) {
    return "WebView did not report rendered pixels for the ontology-map canvas";
  }
  return null;
}

export function validateLibrarySurfaceEvidence(markers, { requireOntology = false } = {}) {
  if (markers?.librarySurface !== true || markers?.libraryNav !== true) {
    return "WebView did not report a rendered Library surface and navigation";
  }
  if (!requireOntology) return null;
  if (
    markers.librarySelectedTab !== "ontology" ||
    markers.librarySelectedPanelVisible !== true
  ) {
    return "WebView did not report the selected Ontology tab and its visible Library panel";
  }
  if (markerNumber(markers, "libraryOntologyHeadingCount") !== 1) {
    return "WebView did not report exactly one Ontology page heading in the selected Library panel";
  }
  const contentState = markers.libraryOntologyContentState;
  const renderedDocument =
    contentState === "document-reader" &&
    markers.libraryOntologyReaderVisible === true &&
    markers.libraryOntologyStarterVisible !== true;
  const renderedStarter =
    contentState === "ontology-starter" &&
    markers.libraryOntologyStarterVisible === true &&
    markers.libraryOntologyReaderVisible !== true;
  if (!renderedDocument && !renderedStarter) {
    return "WebView did not report either a rendered ontology document or the real zero-ontology starter";
  }
  return null;
}

// `write_verify_line` in webview_verify tags window-lifecycle facts with this
// prefix. webview-env.mjs owns the JSON payload prefix; this one is declared here
// because the payload contract is its only reader.
const WINDOW_STATE_PLUGIN_MARKER_PREFIX =
  "[ontology-atlas-window-verify] state_plugin=";

/**
 * **The harness's geometry isolation must be observable, not asserted in a comment**
 * (2026-08-24). `tauri-plugin-window-state` restores and saves real window geometry,
 * so a verify launch that keeps it registered fails twice: it inherits the owner's
 * saved size (the size verdict stops being deterministic) and it overwrites that
 * saved size on exit (the harness damages the owner's setup). The Rust side skips
 * registering the plugin under ONTOLOGY_ATLAS_VERIFY_WEBVIEW and prints
 * `state_plugin=disabled` to say so; this check turns that line into evidence.
 *
 * Absence fails too: a silent launch is indistinguishable from a build where the
 * marker — and the guard behind it — was deleted.
 */
export function validateWindowStatePluginIsolation(launchStdout) {
  const states = String(launchStdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(WINDOW_STATE_PLUGIN_MARKER_PREFIX))
    .map((line) => line.slice(WINDOW_STATE_PLUGIN_MARKER_PREFIX.length).trim());
  if (states.length === 0) {
    return "app never reported the window-state plugin marker (state_plugin=…); the verify launch may have inherited or overwritten the owner's saved window geometry, so its window-size verdict is not trustworthy";
  }
  // One launch prints the marker once. Rejecting *any* non-disabled value (instead
  // of picking one line) also catches a capture polluted by a second app instance.
  const active = states.find((state) => state !== "disabled");
  if (active !== undefined) {
    return `app kept the window-state plugin registered under the verify env (state_plugin=${active || "empty"}); the run may have inherited or overwritten the owner's saved window geometry, so its window-size verdict is not trustworthy`;
  }
  return null;
}

export function validateWebviewVerifyPayload(payload, {
  expectedPath = null,
  expectedFixtureVault = null,
  minWebviewSize = null,
  maxWebviewSize = null,
  requireAiSettings = false,
  expectedAiSettingsBaseUrl = null,
  requireWebviewReducedMotion = false,
  launchStdout = null,
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
  if (payload.visibilityState === "hidden") {
    return (
      "WebView document is hidden: the display is locked or the window is occluded, so WebKit " +
      "stops animation frames and the map never mounts. Unlock the display and run again; " +
      "this run proves nothing about the app."
    );
  }
  if (typeof payload.bodyText !== "string" || payload.bodyText.trim().length === 0) {
    return "WebView body text was empty";
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
  if (!webviewWorkbenchMarkersForPath(expectedPath).every((marker) => marker.test(payload.bodyText))) {
    return "WebView body text did not include Ontology Atlas workbench markers";
  }
  if (!payload.markers || typeof payload.markers !== "object") {
    return "WebView did not report structured markers";
  }
  if (expectedFixtureVault) {
    if (payload.markers.verificationFixtureVaultError) {
      return `WebView fixture vault bootstrap failed: ${payload.markers.verificationFixtureVaultError}`;
    }
    if (payload.markers.verificationFixtureVault !== expectedFixtureVault) {
      return `WebView fixture vault was ${payload.markers.verificationFixtureVault || "missing"}, expected ${expectedFixtureVault}`;
    }
  }
  if (
    requireWebviewReducedMotion &&
    payload.markers.ontologyMapPrefersReducedMotion !== true
  ) {
    return "WebView did not report reduced motion from the installed macOS preference";
  }
  // Runs only when the caller hands over the launch stdout: the harness always
  // launches the executable with ONTOLOGY_ATLAS_VERIFY_WEBVIEW set (webviewVerifyEnvPatch
  // has no off switch for it), so possessing that stream is the same fact as "the
  // verify env was set". Placed **before** the size checks: a launch that let the
  // window-state plugin restore geometry taints the very numbers the size checks
  // would otherwise report as evidence, and the cause must be named first.
  if (typeof launchStdout === "string") {
    const windowStatePluginError = validateWindowStatePluginIsolation(launchStdout);
    if (windowStatePluginError) return windowStatePluginError;
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
  const webviewUrl = new URL(payload.href);
  const webviewPath = webviewUrl.pathname;
  // A documents-only folder intentionally has no code map or Docs destination.
  // Its Library route must instead prove both the real surface and its navigation.
  if (/\/library\/?$/.test(webviewPath)) {
    const librarySurfaceError = validateLibrarySurfaceEvidence(payload.markers, {
      requireOntology: webviewUrl.searchParams.get("tab") === "ontology",
    });
    if (librarySurfaceError) return librarySurfaceError;
  } else {
    if (payload.markers.ontologyNav !== true) {
      return "WebView did not report the ontology navigation marker";
    }
    if (payload.markers.libraryNav !== true) {
      return "WebView did not report the Library navigation marker";
    }
  }
  const topologyMapEngine = payload.markers.topologyMapEngine ?? "";
  if (webviewPath.includes("/topology") && topologyMapEngine !== "v2") {
    return `WebView did not report the ontology-map engine (${topologyMapEngine || "missing"})`;
  }
  const ontologyMapCanvasEvidenceError = validateOntologyMapCanvasEvidence(payload.markers);
  if (ontologyMapCanvasEvidenceError) return ontologyMapCanvasEvidenceError;
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
  // Placed **after** the route verdict: if the screen is on the wrong route, that
  // fact must be reported first. Reversed, "could not open the settings sheet"
  // reads as the cause.
  if (requireAiSettings) {
    const aiSettingsError = validateAiSettingsMarkers(payload.markers, {
      expectedBaseUrl: expectedAiSettingsBaseUrl,
    });
    if (aiSettingsError) return aiSettingsError;
  }
  const topologySelectedParam = normalizeTopologySelectedParam(
    webviewUrl.searchParams.get("p"),
  );
  const blockingComposerOpen = payload.markers.topologyCreateNodeOpen === true;
  // One section tab row; the selected analytical question remains inside its section.
  const INSIGHTS_SUBJECT_COUNT = 5;
  if (webviewPath.includes("/ontology/insights")) {
    if (payload.markers.insightsMaintenanceBoard !== true) {
      return "WebView did not report the insights relationship analysis marker";
    }
    if (payload.markers.insightsQuestionModel !== "claim-evidence") {
      return `WebView insights question model was ${payload.markers.insightsQuestionModel || "missing"}`;
    }
    if (payload.markers.insightsSubjectCount !== INSIGHTS_SUBJECT_COUNT) {
      return `WebView insights subject count was ${payload.markers.insightsSubjectCount ?? "missing"}, expected ${INSIGHTS_SUBJECT_COUNT}`;
    }
    const expectedTabCount = INSIGHTS_SUBJECT_COUNT;
    if (payload.markers.insightsTabCount !== expectedTabCount) {
      return `WebView insights question tab count was ${payload.markers.insightsTabCount ?? "missing"}, expected ${expectedTabCount} on ${payload.markers.insightsSelectedSubject || "an unnamed subject"}`;
    }
    if (payload.markers.insightsSelectedTabCount !== 1) {
      return `WebView insights selected tab count was ${payload.markers.insightsSelectedTabCount ?? "missing"} on ${payload.markers.insightsSelectedSubject || "an unnamed subject"}`;
    }
    if (!payload.markers.insightsSelectedPanelKey) {
      return "WebView insights analysis drew no panel for the selected subject";
    }
    if (payload.markers.insightsSelectedPanelVisible !== true) {
      return "WebView insights selected panel was not visible";
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
    /*
     * ⚠️ **Do not pin the token name** (2026-08-11). This used to accept only
     * `--topology-blocking-composer-width`, while the product **deliberately** moved
     * to the canonical dialog width (`--dialog-w-md`) — `HomePage.tsx`: *"Use the canonical --dialog-w-md
     * (560px) directly instead of composer-width"* (use the canonical --dialog-w-md
     * (560px) directly instead of composer-width). So this check was guaranteed to
     * fail from the day the spec improved — exactly the shape `design-gates.md` warns
     * about, and such a gate makes the next person **revert the spec**.
     *
     * The property to lock is not "which name" but **"does the width come from a
     * token"**.
     */
    const widthToken = payload.markers.topologyCreateNodePanelWidthToken || "";
    if (!widthToken.startsWith("--")) {
      return `WebView Add Concept composer width token was ${widthToken || "missing"}`;
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
    const ontologyMapSelectedContextVisible =
      payload.markers.ontologyMapDetailPanelVisible === true;
    if (!ontologyMapSelectedContextVisible && !blockingComposerOpen) {
      return `WebView did not report a visible Relief selected node context for ${topologySelectedParam}`;
    }
    if (ontologyMapSelectedContextVisible) {
      const v2SelectedNodeId = String(
        payload.markers.ontologyMapDetailPanelNodeId || "",
      ).trim();
      const v2SelectedNodeKind = String(
        payload.markers.ontologyMapDetailPanelNodeKind || "",
      ).trim();
      const v2SelectedNodeTitle = String(
        payload.markers.ontologyMapDetailPanelNodeTitle || "",
      ).trim();
      if (v2SelectedNodeId !== topologySelectedParam) {
        return `WebView reported canvas-v2 selected node ${v2SelectedNodeId || "unknown"}, expected ${topologySelectedParam}`;
      }
      if (!v2SelectedNodeKind || !v2SelectedNodeTitle) {
        return `WebView reported incomplete canvas-v2 selected node context (${v2SelectedNodeKind || "missing kind"} / ${v2SelectedNodeTitle || "missing title"})`;
      }
      if (payload.markers.topologyAttentionWinner !== "focus-state") {
        return `WebView canvas-v2 selected node attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
      }
      if (payload.markers.topologyCommandChromeState !== "selected-node-inspector") {
        return `WebView canvas-v2 selected node command chrome state was ${payload.markers.topologyCommandChromeState || "missing"}`;
      }
      if (payload.markers.topologyUtilityActionLaneVisible === true) {
        return "WebView canvas-v2 selected node utility action lane was visible while inspector owns focus";
      }
      if (
        v2SelectedNodeKind === "project" &&
        payload.markers.ontologyMapProjectSourceReceiptVisible !== true
      ) {
        return "WebView selected project did not expose a project source receipt";
      }
      if (payload.markers.ontologyMapProjectSourceReceiptVisible === true) {
        if (v2SelectedNodeKind !== "project") {
          return "WebView project source receipt was visible for a non-project node";
        }
        if (
          payload.markers.ontologyMapProjectSourceLayout !==
          "status-action-separated"
        ) {
          return `WebView project source layout was ${payload.markers.ontologyMapProjectSourceLayout || "missing"}`;
        }
        if (
          payload.markers.ontologyMapProjectSourceTopGap === "none" &&
          payload.markers.ontologyMapProjectSourceGapVisible === true
        ) {
          return "WebView project source receipt rendered a healthy no-gap row";
        }
        const renderedActionCount = Number(
          payload.markers.ontologyMapProjectSourceRenderedActionCount || 0,
        );
        if (
          payload.markers.ontologyMapProjectSourceAction === "use_current_evidence" &&
          renderedActionCount !== 4
        ) {
          return `WebView current project source receipt rendered ${renderedActionCount} inline actions, expected 4`;
        }
        if (
          renderedActionCount > 0 &&
          Number(payload.markers.ontologyMapProjectSourceInlineActionMinWidth || 0) < 56
        ) {
          return `WebView project source inline action minimum width was ${payload.markers.ontologyMapProjectSourceInlineActionMinWidth || "missing"}px`;
        }
        for (const [label, value] of [
          ["receipt/actions", payload.markers.ontologyMapProjectSourceReceiptActionOverlap],
          ["receipt/footer", payload.markers.ontologyMapProjectSourceReceiptFooterOverlap],
          ["actions/footer", payload.markers.ontologyMapProjectSourceActionFooterOverlap],
        ]) {
          if (Number(value || 0) > 0.5) {
            return `WebView project source ${label} overlap was ${value}px²`;
          }
        }
      }
    }
  }
  if (webviewPath.includes("/topology")) {
    // Just under `--map-hysteresis-px` (7px), where a press stops counting as a click.
    const stagePanFloor = 6;
    if (!(Number(payload.markers.topologyStagePanClickCancelPx) >= stagePanFloor)) {
      return `WebView reported an over-sensitive stage pan threshold (${payload.markers.topologyStagePanClickCancelPx ?? "missing"}px, floor ${stagePanFloor}px)`;
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
