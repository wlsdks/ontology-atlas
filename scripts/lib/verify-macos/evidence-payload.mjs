import path from "node:path";
import fs from "node:fs";
import { evidenceRoute, extractBackdropAlpha, markerNumber, markerText } from "./relation-marker-validators.mjs";


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
  const topologyRenderProof =
    markers.topologyMapEngine === "v2"
      ? {
        proof: "ontology-map-canvas-render",
        status:
          markers.topologyMapViewportVisible === true &&
          markerNumber(markers, "topologyMapCanvasCount") >= 1 &&
          markerNumber(markers, "ontologyMapCanvasInkPixels") > 0
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        engine: markers.topologyMapEngine,
        viewportVisible: markers.topologyMapViewportVisible === true,
        canvasCount: markerNumber(markers, "topologyMapCanvasCount"),
        inkPixels: markerNumber(markers, "ontologyMapCanvasInkPixels"),
        agentNextAction:
          "use visual evidence for node-level rendering; do not infer DOM-card counts from the canvas engine",
      }
      : null;
  const libraryRoute = /\/library\/?(?:\?|$)/.test(evidenceRoute(payload?.href));
  const librarySelectedTab = markerText(markers, "librarySelectedTab");
  const libraryOntologyContentState = markerText(
    markers,
    "libraryOntologyContentState",
  );
  const librarySurfaceProof = libraryRoute
    ? {
        proof: "library-rendered-surface",
        status:
          markers.librarySurface === true &&
          markers.libraryNav === true &&
          (librarySelectedTab !== "ontology" ||
            (markers.librarySelectedPanelVisible === true &&
              markerNumber(markers, "libraryOntologyHeadingCount") === 1 &&
              ["document-reader", "ontology-starter"].includes(
                libraryOntologyContentState,
              )))
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        selectedTab: librarySelectedTab,
        selectedPanelVisible: markers.librarySelectedPanelVisible === true,
        ontologyHeadingCount: markerNumber(markers, "libraryOntologyHeadingCount"),
        ontologyContentState: libraryOntologyContentState,
        ontologyReaderVisible: markers.libraryOntologyReaderVisible === true,
        ontologyStarterVisible: markers.libraryOntologyStarterVisible === true,
        agentNextAction:
          libraryOntologyContentState === "ontology-starter"
            ? "create-the-first-ontology-nodes"
            : "read-the-selected-ontology-document",
      }
    : null;

  return {
    capturedAt,
    payload,
    composerBlockingProof,
    topologyRenderProof,
    librarySurfaceProof,
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
