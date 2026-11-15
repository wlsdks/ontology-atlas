import { beforeEach, describe, expect, it, vi } from "vitest";

const signal = vi.hoisted(() => ({ travelling: false }));
vi.mock("../frame-draw/neural-spread", () => ({ isNeuralSignalTravelling: () => signal.travelling }));
vi.mock("../../tokens/topology-read-tokens", () => ({
  readOntologyMapTokensOrNull: () => ({ edgePulseSpeed: 1, selectPulseDurationMs: 0 }),
}));
vi.mock("../../dial/frame/frame", () => ({ lastDialFrame: () => null }));

import { createFrameGate, FRAME_ASLEEP } from "./topology-frame-gate";

const NOW_MS = 100_000;

/** A map with nothing moving: every ref the gate reads, at rest, past the grace window. */
function restingGate(neuralRamp: number) {
  const refs: Record<string, unknown> = {
    pointerMachineRef: { phase: "idle" },
    nodeDragRef: null,
    pendingViewportRef: null,
    appliedDprScaleRef: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    viewportRef: { width: 800, height: 600, dpr: 1 },
    commitViewportSizeRef: null,
    viewportSettleFramesRef: 0,
    lastActiveMsRef: 0,
    viewportRebuildPendingRef: false,
    rebuildViewportLayersRef: null,
    worldRef: { nodes: [], edges: [] },
    lastFrameTimeRef: 0,
    previewEdgePropRef: null,
    previewSignatureRef: "none",
    previewEdgeHeldRef: null,
    previewTransitionRef: null,
    previewAlphaRef: 0,
    previewCommitRef: 0,
    reducedMotionRef: false,
    navYieldUntilRef: 0,
    cameraRef: { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } },
    cameraTargetRef: { tx: 0, ty: 0, tscale: 1 },
    prevCameraSampleRef: { x: 0, y: 0, s: 1 },
    // A recent input keeps the comets out of ambient sleep, so only Neural can silence them.
    lastInputMsRef: NOW_MS - 10,
    ambientSleepDelayRef: undefined,
    domeRuntimeRef: null,
    view3dRef: false,
    realmTransitionRef: { phase: "idle" },
    domeFocusPendingRef: null,
    bgPointerRef: null,
    growthReplayRef: null,
    growthReplayAppearRef: new Map(),
    heatRef: 0,
    homingActiveRef: false,
    selectionPulseRef: null,
    hasDependsEdgesRef: true,
    focusedSlugRef: "c1",
    hasContainsEdgesRef: true,
    pulsesRef: [],
    hoveredNodeIdRef: null,
    panelEmphasisNodeIdRef: null,
    hoveredClusterIdRef: null,
    trailLensPropRef: null,
    trailBrushPropRef: null,
    panelHoverPropRef: null,
    neuralRampRef: neuralRamp,
    mapArrangementRef: "coupling",
    drawnTrailLensRef: false,
    trailLensRampRef: 0,
    visitedTrailRef: [],
    colorFocusRef: null,
    selectedEdgeRef: null,
    spotlightRampRef: 0,
    spotlightIdsRef: null,
    idleDebugEnabledRef: false,
    lastActiveCausesRef: null,
    lightActiveRef: false,
    domeLodRef: { settling: false, pointerSlot: -1 },
  };
  const deps = Object.fromEntries(Object.entries(refs).map(([key, value]) => [key, { current: value }]));
  return createFrameGate({ ...deps, endGrowthReplay: () => {} } as unknown as Parameters<typeof createFrameGate>[0]);
}

describe("the frame gate with Neural on screen", () => {
  beforeEach(() => {
    signal.travelling = false;
  });

  it("keeps the flat map's dependency comets awake for a selection", () => {
    expect(restingGate(0)(NOW_MS)).not.toBe(FRAME_ASLEEP);
  });

  it("lets a selection rest once Neural paints alone, since Neural draws no comets", () => {
    expect(restingGate(1)(NOW_MS)).toBe(FRAME_ASLEEP);
  });

  it("stays awake while Neural's signal travels a lit axon", () => {
    signal.travelling = true;
    expect(restingGate(1)(NOW_MS)).not.toBe(FRAME_ASLEEP);
  });
});
