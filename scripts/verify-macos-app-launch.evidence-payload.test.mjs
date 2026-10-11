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

test("WebView evidence records a rendered zero-ontology Library starter", () => {
  const evidence = verifier.buildWebviewEvidencePayload({
    href: "tauri://localhost/ko/library/?tab=ontology",
    markers: {
      libraryNav: true,
      librarySurface: true,
      librarySelectedTab: "ontology",
      librarySelectedPanelVisible: true,
      libraryOntologyHeadingCount: 1,
      libraryOntologyContentState: "ontology-starter",
      libraryOntologyReaderVisible: false,
      libraryOntologyStarterVisible: true,
    },
  });

  assert.deepEqual(evidence.librarySurfaceProof, {
    proof: "library-rendered-surface",
    status: "proved",
    route: "/ko/library/?tab=ontology",
    selectedTab: "ontology",
    selectedPanelVisible: true,
    ontologyHeadingCount: 1,
    ontologyContentState: "ontology-starter",
    ontologyReaderVisible: false,
    ontologyStarterVisible: true,
    agentNextAction: "create-the-first-ontology-nodes",
  });
});
