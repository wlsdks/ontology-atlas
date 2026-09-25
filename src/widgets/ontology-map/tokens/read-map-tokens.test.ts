import { describe, expect, it } from "vitest";

import {
  clearOntologyMapTokensCache,
  getOntologyMapTokens,
  refreshIndexDependentTokens,
  resolveOntologyMapTokens,
  ONTOLOGY_MAP_TOKEN_COUNT,
  OntologyMapTokenError,
} from "./read-map-tokens";

/**
 * A fixture matching every §2 value 1:1 against the prototype's constants. It has to
 * be exactly the same set of names and values as the `--map-*` declarations
 * in app/globals.css — this list *is* the token contract.
 */
const FIXTURE_VALUES: Record<string, string> = {
  "--map-node-fill-project": "#1c1c22",
  "--map-node-fill-domain": "#191920",
  "--map-node-fill-capability": "#17171d",
  "--map-node-fill-element": "#15151a",
  "--map-node-stroke-project": "#57575f",
  "--map-node-stroke-domain": "#48484f",
  "--map-node-stroke-capability": "#3c3c44",
  "--map-node-stroke-element": "#34343b",
  "--map-node-fill-dim": "#1a1a1e",
  "--map-node-stroke-dim": "#2b2b2f",
  "--map-ego-rest-alpha": "0.42",
  "--map-node-fill-stale": "#141418",
  "--map-node-stroke-stale": "#454549",
  "--map-node-hole-fill": "#0c0c10",
  "--map-indigo": "#5e6ad2",
  "--map-indigo-bright": "#8890e0",
  "--map-amber-hub": "#d4b478",
  "--map-recent-change": "#3fbfae",
  "--color-kind-project-rgb": "126 134 216",
  "--color-kind-domain-rgb": "74 177 196",
  "--color-kind-capability-rgb": "211 159 73",
  "--color-kind-element-rgb": "124 166 141",
  "--color-status-warning": "#f4b731",
  "--map-numeral-shadow": "#08080a",
  "--map-numeral-face": "#8c8c94",
  "--map-cluster-chip-border-rest": "#5c5c65",
  "--map-cluster-chip-ink-rest": "#5f5f65",
  "--map-node-sheen-tint": "#232329",
  "--map-node-sheen-blend": "0.6",
  "--map-project-hairline-inner": "rgba(212, 180, 120, .35)",
  "--map-project-pin-tick": "rgba(212, 180, 120, .5)",
  "--map-galaxy-project": "#f0d5a4",
  "--map-galaxy-domain": "#f2e6d2",
  "--map-galaxy-capability": "#e5eaf3",
  "--map-galaxy-element": "#cdd6f0",
  "--map-selection-ring-indigo": "#8890e0",
  "--map-selection-ring-hairline": "rgba(94, 106, 210, .45)",
  "--map-hover-ring": "rgba(94, 106, 210, .55)",
  "--map-hover-shimmer-seg": "0.16",
  "--map-hover-shimmer-period-ms": "2400",

  "--map-edge-contains": "#28282e",
  "--map-edge-depends": "#39394a",
  "--map-edge-dim": "#1e1e22",
  "--map-edge-selected": "rgba(200, 210, 255, 0.66)",
  "--map-expanded-cohort": "rgba(146, 156, 194, 0.72)",
  "--map-hull-stroke": "#3a3a42",
  "--map-label-project": "#d4b478",
  "--map-label-domain": "#b8b8c1",
  "--map-label-capability": "#84848c",
  "--map-label-element": "#7e7e87",
  "--map-label-max-width": "168",
  "--map-canvas-bg-near": "#0a0a0d",
  "--map-canvas-bg-far": "#050507",
  "--map-grid-minor": "#0e0e13",
  "--map-grid-major": "#121218",
  "--map-dome-ring": "#43434f",
  // Not a `--map-*` name: the raised plane ring borrows the application's
  // own tertiary text step rather than adding a colour for one hover state.
  "--color-text-tertiary": "#8a8f98",
  "--map-vignette-base-alpha": "0.32",
  "--map-vignette-far-alpha": "0.18",

  "--map-radius-project": "30",
  "--map-radius-domain": "17",
  "--map-radius-capability": "11",
  "--map-radius-element": "7",
  "--map-layout-ring-domain": "250",
  "--map-layout-ring-capability": "145",
  "--map-layout-ring-element": "90",
  "--map-realm-fill-radius-1": "130",
  "--map-realm-fill-radius-2": "190",
  "--map-realm-fill-radius-3": "250",
  "--map-edge-bow-contains": "70",
  "--map-edge-bow-depends": "92",
  "--map-edge-blend-contains": "0.46",
  "--map-edge-blend-depends": "0.62",
  "--map-star-count": "4",
  "--map-dust-area-per-point": "5200",
  "--map-mass-heavy-degree": "12",
  "--map-mass-angfreq": "16",
  "--map-mass-heavy-zeta": "0.55",
  "--map-mass-drop-max-px": "14",
  "--map-ego-glow-blur-px": "22",
  "--map-ego-glow-alpha": "0.55",
  "--map-trail-glow-alpha": "0.85",
  "--map-trail-glow-blur-px": "26",
  "--map-node-bloom-blur-px": "31",
  "--map-node-bloom-alpha": "0.35",
  "--map-press-angfreq": "16",
  "--map-press-zeta": "0.35",

  "--map-camera-spring-angfreq-interactive": "12",
  "--map-camera-spring-angfreq-transition": "4.7",
  "--map-camera-damping-default": "1.0",
  "--map-camera-damping-flick": "0.82",
  "--map-camera-momentum-decay": "0.998",
  "--map-camera-release-velocity-window-ms": "80",
  "--map-camera-flick-min-speed": "0.05",
  "--map-camera-scale-min": "0.24",
  "--map-camera-scale-max": "2.6",
  "--map-camera-small-graph-scale-max": "1.3",
  "--map-camera-max-zoom-ratio": "3.2",
  "--map-camera-min-zoom-ratio": "0.5",
  "--map-camera-focus-pan-margin": "180",
  // The leash defaults to **0 (off)** — this one line is the contract that the
  // workbench's pan envelope is unchanged. The only place it is switched on is the
  // gateway scope (`html[data-gateway-stage]`).
  "--map-camera-pan-leash": "0",
  "--map-altitude-far-high-ratio": "0.92",
  "--map-altitude-far-low-ratio": "0.62",
  "--map-overview-entry-ratio": "0.95",
  "--map-dome-fit-fill": "0.98",
  "--map-dome-fit-inset-top": "104",
  "--map-dome-fit-inset-bottom": "32",
  "--map-focus-fit-max-scale": "1.9",
  "--map-focus-bbox-margin": "70",
  "--map-focus-max-zoom-ratio": "1.8",
  "--map-hysteresis-px": "7",
  "--map-emphasis-rise-tau": "0.09",
  "--map-emphasis-decay-tau": "0.15",
  "--map-focus-dim-tau": "0.16",
  "--map-trail-reduced-fade-ms": "240",
  "--map-cluster-reveal-tau": "0.17",
  "--map-spotlight-rest-alpha": "0.35",
  "--map-path-rest-alpha": "0.2",
  "--map-spotlight-ring-speed": "0.012",
  "--map-ripple-stagger-ms": "55",
  "--map-breathe-amplitude": "0.04",
  "--map-breathe-freq-rad": "1.15",
  "--map-pulse-duration-ms": "420",
  "--map-select-pulse-duration-ms": "180",
  "--map-tip-fade-ms": "120",
  "--map-edge-pulse-speed": "0.075",
  "--map-edge-pulse-speed-ego": "0.2",
  "--map-drag-tug-1hop": "0.45",
  "--map-drag-tug-2hop": "0.15",
  "--map-drag-tug-radius": "600",
  "--map-select-pulse-scale-delta": "0.28",
  "--map-node-release-settle-ms": "900",
  "--map-node-home-spring-angfreq": "7.5",
  "--map-ego-reveal-rise-tau": "0.22",
  "--map-ego-reveal-decay-tau": "0.12",
  "--map-ripple-stagger-max-ms": "180",
  "--map-edge-contains-l0": "#45454e",
  "--map-edge-contains-l2": "#333339",
  "--map-edge-passthrough-alpha": "0.3",
  "--map-node-min-separation-ratio": "1.35",
  "--map-radius-magnitude-k": "0.45",
  "--map-dust-parallax-min": "0.15",
  "--map-dust-parallax-max": "0.45",
  "--map-canvas-bg-parallax": "0.82",

  "--map-safe-inset-left": "344",
  "--map-safe-inset-right": "120",
  "--map-safe-inset-top": "96",
  "--map-safe-inset-bottom": "96",
};

function fixtureReader(overrides: Record<string, string> = {}) {
  const values = { ...FIXTURE_VALUES, ...overrides };
  return (name: string) => values[name] ?? "";
}

describe("resolveOntologyMapTokens", () => {
  it("TOKEN_SPECS count contract — the fixture covers every spec exactly (Guardian 2026-07-20: the old '88 tokens' header comment had silently drifted from reality with no assert)", () => {
    expect(Object.keys(FIXTURE_VALUES).length).toBe(ONTOLOGY_MAP_TOKEN_COUNT);
  });

  it("resolves all §2 tokens to the exact prototype-sourced values", () => {
    const tokens = resolveOntologyMapTokens(fixtureReader());

    expect(tokens.nodeFillProject).toBe("#1c1c22");
    expect(tokens.cameraMaxZoomRatio).toBeCloseTo(3.2, 3);
    expect(tokens.cameraMinZoomRatio).toBeCloseTo(0.5, 3);
    expect(tokens.dragTug1Hop).toBeCloseTo(0.45, 3);
    expect(tokens.dragTug2Hop).toBeCloseTo(0.15, 3);
    expect(tokens.dragTugRadius).toBeCloseTo(600, 3);
    expect(tokens.selectPulseScaleDelta).toBeCloseTo(0.28, 3);
    expect(tokens.nodeReleaseSettleMs).toBeCloseTo(900, 3);
    expect(tokens.nodeHomeSpringAngFreq).toBeCloseTo(7.5, 3);
    expect(tokens.focusDimTau).toBeCloseTo(0.16, 3);
    expect(tokens.spotlightRestAlpha).toBeCloseTo(0.35, 3);
    expect(tokens.spotlightRingSpeed).toBeCloseTo(0.012, 4);
    expect(tokens.egoRevealRiseTau).toBeCloseTo(0.22, 3);
    expect(tokens.egoRevealDecayTau).toBeCloseTo(0.12, 3);
    expect(tokens.rippleStaggerMaxMs).toBeCloseTo(180, 3);
    expect(tokens.indigo).toBe("#5e6ad2");
    expect(tokens.labelProject).toBe("#d4b478");
    expect(tokens.labelMaxWidth).toBe(168);
    expect(tokens.safeInsetLeft).toBe(344);
    expect(tokens.safeInsetBottom).toBe(96);
    expect(tokens.nodeSheenTint).toBe("#232329");
    expect(tokens.nodeSheenBlend).toBeCloseTo(0.6, 3);
    expect(tokens.radiusProject).toBe(30);
    expect(tokens.radiusElement).toBe(7);
    expect(tokens.realmFillRadius1).toBe(130);
    expect(tokens.realmFillRadius2).toBe(190);
    expect(tokens.realmFillRadius3).toBe(250);
    expect(tokens.cameraSpringAngFreqInteractive).toBeCloseTo(12, 3);
    expect(tokens.cameraSpringAngFreqTransition).toBeCloseTo(4.7, 3);
    expect(tokens.cameraMomentumDecay).toBe(0.998);
    expect(tokens.hysteresisPx).toBe(7);
    expect(tokens.starCount).toBe(4);
    expect(tokens.overviewEntryRatio).toBeCloseTo(0.95, 3);
    expect(tokens.tipFadeMs).toBe(120);
    expect(tokens.edgePulseSpeed).toBeCloseTo(0.075, 4);
    expect(tokens.edgePulseSpeedEgo).toBeCloseTo(0.2, 4);
    expect(tokens.projectHairlineInner).toBe("rgba(212, 180, 120, .35)");
    expect(tokens.projectPinTick).toBe("rgba(212, 180, 120, .5)");
    expect(tokens.selectionRingIndigo).toBe("#8890e0");
    expect(tokens.selectionRingHairline).toBe("rgba(94, 106, 210, .45)");
    expect(tokens.hoverRing).toBe("rgba(94, 106, 210, .55)");
    expect(tokens.hoverShimmerSeg).toBeCloseTo(0.16, 3);
    expect(tokens.hoverShimmerPeriodMs).toBe(2400);
    expect(tokens.selectPulseDurationMs).toBe(180);
  });

  it("parses declared numeric tokens as numbers, not strings", () => {
    const tokens = resolveOntologyMapTokens(fixtureReader());
    expect(typeof tokens.vignetteBaseAlpha).toBe("number");
    expect(typeof tokens.dustAreaPerPoint).toBe("number");
    expect(typeof tokens.nodeFillProject).toBe("string");
  });

  it("throws OntologyMapTokenError when any token resolves empty (drift guard)", () => {
    const reader = fixtureReader({ "--map-indigo": "" });
    expect(() => resolveOntologyMapTokens(reader)).toThrow(OntologyMapTokenError);
  });

  it("lists every missing token name on the thrown error", () => {
    const reader = fixtureReader({
      "--map-indigo": "",
      "--map-radius-project": "",
    });
    try {
      resolveOntologyMapTokens(reader);
      throw new Error("expected resolveOntologyMapTokens to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OntologyMapTokenError);
      const tokenErr = err as OntologyMapTokenError;
      expect(tokenErr.missing).toContain("--map-indigo");
      expect(tokenErr.missing).toContain("--map-radius-project");
    }
  });

  it("throws when a numeric token is present but non-numeric (drift guard)", () => {
    const reader = fixtureReader({ "--map-radius-project": "not-a-number" });
    expect(() => resolveOntologyMapTokens(reader)).toThrow(OntologyMapTokenError);
  });
});

describe("refreshIndexDependentTokens — 표적 갱신", () => {
  /**
   * Why this function exists (performance trace, 2026-07-28): `HomePage` threw away
   * **the whole** cache on every INDEX state transition, and selecting a node changes
   * that state. So every single click made the next frame run `getPropertyValue` 115
   * times and force a style recalculation (the top ForcedReflow entry, 58ms). Exactly
   * one token actually depends on `data-topology-index`.
   */
  it("캐시가 없으면 아무것도 하지 않는다 (다음 읽기가 최신을 가져간다)", () => {
    clearOntologyMapTokensCache();
    expect(() => refreshIndexDependentTokens(document.documentElement)).not.toThrow();
  });

  it("갱신 대상 토큰만 다시 읽고 나머지 캐시는 보존한다", () => {
    clearOntologyMapTokensCache();
    const root = document.documentElement;
    for (const [name, value] of Object.entries(FIXTURE_VALUES)) {
      root.style.setProperty(name, value);
    }
    const before = getOntologyMapTokens(root);
    expect(before.safeInsetLeft).toBe(344);

    // Collapsing INDEX changes only this token (the
    // `html[data-topology-index="collapsed"]` block in globals.css).
    root.style.setProperty("--map-safe-inset-left", "78");
    // Change another token too and confirm it does **not** follow — this is a targeted refresh.
    root.style.setProperty("--map-label-max-width", "999");

    refreshIndexDependentTokens(root);
    const after = getOntologyMapTokens(root);

    expect(after.safeInsetLeft).toBe(78);
    expect(after.labelMaxWidth).toBe(168);

    for (const name of Object.keys(FIXTURE_VALUES)) root.style.removeProperty(name);
    clearOntologyMapTokensCache();
  });

  it("re-reads the right lane, which the agent dock moves (2026-09-25)", () => {
    // The dock pulls the utility rail to half an inset from the map's edge, and
    // `--map-safe-inset-right` follows it (`app/globals.css`). The dock narrows the
    // canvas, so the viewport commit is the moment to read it again; a cached 112
    // held the drawing 6 px left of the free map's centre.
    clearOntologyMapTokensCache();
    const root = document.documentElement;
    for (const [name, value] of Object.entries(FIXTURE_VALUES)) {
      root.style.setProperty(name, value);
    }
    expect(getOntologyMapTokens(root).safeInsetRight).toBe(120);

    root.style.setProperty("--map-safe-inset-right", "100");
    refreshIndexDependentTokens(root);
    expect(getOntologyMapTokens(root).safeInsetRight).toBe(100);

    for (const name of Object.keys(FIXTURE_VALUES)) root.style.removeProperty(name);
    clearOntologyMapTokensCache();
  });
});
