import { describe, expect, it } from "vitest";

import {
  resolveTopologyV2Tokens,
  TOPOLOGY_V2_TOKEN_COUNT,
  TopologyV2TokenError,
} from "./read-topology-v2-tokens";

/**
 * §2 값 전부를 프로토타입 상수와 1:1 대조하는 fixture. app/globals.css 의
 * `--topology-v2-*` 선언과 정확히 같은 이름/값 집합이어야 한다 — 여기 목록이
 * 곧 토큰 계약이다.
 */
const FIXTURE_VALUES: Record<string, string> = {
  "--topology-v2-node-fill-project": "#1c1c22",
  "--topology-v2-node-fill-domain": "#191920",
  "--topology-v2-node-fill-capability": "#17171d",
  "--topology-v2-node-fill-element": "#15151a",
  "--topology-v2-node-stroke-project": "#57575f",
  "--topology-v2-node-stroke-domain": "#48484f",
  "--topology-v2-node-stroke-capability": "#3c3c44",
  "--topology-v2-node-stroke-element": "#34343b",
  "--topology-v2-node-fill-dim": "#1a1a1e",
  "--topology-v2-node-stroke-dim": "#2b2b2f",
  "--topology-v2-node-fill-stale": "#141418",
  "--topology-v2-node-stroke-stale": "#454549",
  "--topology-v2-node-hole-fill": "#0c0c10",
  "--topology-v2-indigo": "#5e6ad2",
  "--topology-v2-indigo-bright": "#8890e0",
  "--topology-v2-amber-hub": "#d4b478",
  "--topology-v2-numeral-shadow": "#08080a",
  "--topology-v2-numeral-face": "#8c8c94",
  "--topology-v2-node-sheen-tint": "#232329",
  "--topology-v2-node-sheen-blend": "0.6",
  "--topology-v2-project-hairline-inner": "rgba(212, 180, 120, .35)",
  "--topology-v2-project-pin-tick": "rgba(212, 180, 120, .5)",
  "--topology-v2-selection-ring-indigo": "#8890e0",
  "--topology-v2-selection-ring-hairline": "rgba(94, 106, 210, .45)",
  "--topology-v2-hover-ring": "rgba(94, 106, 210, .55)",
  "--topology-v2-hover-shimmer-seg": "0.16",
  "--topology-v2-hover-shimmer-period-ms": "2400",

  "--topology-v2-edge-contains": "#28282e",
  "--topology-v2-edge-depends": "#39394a",
  "--topology-v2-edge-dim": "#1e1e22",
  "--topology-v2-edge-selected": "rgba(200, 210, 255, 0.66)",
  "--topology-v2-hull-stroke": "#3a3a42",
  "--topology-v2-label-project": "#d4b478",
  "--topology-v2-label-domain": "#b8b8c1",
  "--topology-v2-label-capability": "#84848c",
  "--topology-v2-label-element": "#6a6a73",
  "--topology-v2-label-max-width": "168",
  "--topology-v2-canvas-bg-near": "#0a0a0d",
  "--topology-v2-canvas-bg-far": "#050507",
  "--topology-v2-grid-minor": "#0e0e13",
  "--topology-v2-grid-major": "#121218",
  "--topology-v2-vignette-base-alpha": "0.32",
  "--topology-v2-vignette-far-alpha": "0.18",

  "--topology-v2-radius-project": "30",
  "--topology-v2-radius-domain": "17",
  "--topology-v2-radius-capability": "11",
  "--topology-v2-radius-element": "7",
  "--topology-v2-layout-ring-domain": "250",
  "--topology-v2-layout-ring-capability": "145",
  "--topology-v2-layout-ring-element": "90",
  "--topology-v2-edge-bow-contains": "70",
  "--topology-v2-edge-bow-depends": "92",
  "--topology-v2-edge-blend-contains": "0.46",
  "--topology-v2-edge-blend-depends": "0.62",
  "--topology-v2-star-count": "4",
  "--topology-v2-dust-area-per-point": "5200",

  "--topology-v2-camera-spring-angfreq-interactive": "12",
  "--topology-v2-camera-spring-angfreq-transition": "4.7",
  "--topology-v2-camera-damping-default": "1.0",
  "--topology-v2-camera-damping-flick": "0.82",
  "--topology-v2-camera-momentum-decay": "0.998",
  "--topology-v2-camera-release-velocity-window-ms": "80",
  "--topology-v2-camera-flick-min-speed": "0.05",
  "--topology-v2-camera-scale-min": "0.24",
  "--topology-v2-camera-scale-max": "2.6",
  "--topology-v2-camera-max-zoom-ratio": "3.2",
  "--topology-v2-camera-min-zoom-ratio": "0.5",
  "--topology-v2-camera-focus-pan-margin": "180",
  "--topology-v2-altitude-far-high-ratio": "0.92",
  "--topology-v2-altitude-far-low-ratio": "0.62",
  "--topology-v2-overview-entry-ratio": "0.95",
  "--topology-v2-focus-fit-max-scale": "1.9",
  "--topology-v2-focus-bbox-margin": "70",
  "--topology-v2-hysteresis-px": "7",
  "--topology-v2-emphasis-rise-tau": "0.09",
  "--topology-v2-emphasis-decay-tau": "0.15",
  "--topology-v2-ripple-stagger-ms": "55",
  "--topology-v2-breathe-amplitude": "0.04",
  "--topology-v2-breathe-freq-rad": "1.15",
  "--topology-v2-pulse-duration-ms": "420",
  "--topology-v2-select-pulse-duration-ms": "180",
  "--topology-v2-tip-fade-ms": "120",
  "--topology-v2-edge-pulse-speed": "0.075",
  "--topology-v2-edge-pulse-speed-ego": "0.2",
  "--topology-v2-drag-tug-1hop": "0.45",
  "--topology-v2-drag-tug-2hop": "0.15",
  "--topology-v2-drag-tug-radius": "600",
  "--topology-v2-select-pulse-scale-delta": "0.28",
  "--topology-v2-node-release-settle-ms": "900",
  "--topology-v2-node-home-spring-angfreq": "7.5",
  "--topology-v2-ego-reveal-rise-tau": "0.22",
  "--topology-v2-ego-reveal-decay-tau": "0.12",
  "--topology-v2-ripple-stagger-max-ms": "180",
  "--topology-v2-edge-contains-l0": "#45454e",
  "--topology-v2-edge-contains-l2": "#333339",
  "--topology-v2-edge-passthrough-alpha": "0.3",
  "--topology-v2-node-min-separation-ratio": "1.35",
  "--topology-v2-radius-magnitude-k": "0.45",
  "--topology-v2-dust-parallax-min": "0.15",
  "--topology-v2-dust-parallax-max": "0.45",

  "--topology-v2-safe-inset-left": "344",
  "--topology-v2-safe-inset-right": "120",
  "--topology-v2-safe-inset-top": "96",
  "--topology-v2-safe-inset-bottom": "96",
};

function fixtureReader(overrides: Record<string, string> = {}) {
  const values = { ...FIXTURE_VALUES, ...overrides };
  return (name: string) => values[name] ?? "";
}

describe("resolveTopologyV2Tokens", () => {
  it("TOKEN_SPECS count contract — the fixture covers every spec exactly (Guardian 2026-07-20: the old '88 tokens' header comment had silently drifted from reality with no assert)", () => {
    expect(Object.keys(FIXTURE_VALUES).length).toBe(TOPOLOGY_V2_TOKEN_COUNT);
  });

  it("resolves all §2 tokens to the exact prototype-sourced values", () => {
    const tokens = resolveTopologyV2Tokens(fixtureReader());

    expect(tokens.nodeFillProject).toBe("#1c1c22");
    expect(tokens.cameraMaxZoomRatio).toBeCloseTo(3.2, 3);
    expect(tokens.cameraMinZoomRatio).toBeCloseTo(0.5, 3);
    expect(tokens.dragTug1Hop).toBeCloseTo(0.45, 3);
    expect(tokens.dragTug2Hop).toBeCloseTo(0.15, 3);
    expect(tokens.dragTugRadius).toBeCloseTo(600, 3);
    expect(tokens.selectPulseScaleDelta).toBeCloseTo(0.28, 3);
    expect(tokens.nodeReleaseSettleMs).toBeCloseTo(900, 3);
    expect(tokens.nodeHomeSpringAngFreq).toBeCloseTo(7.5, 3);
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
    const tokens = resolveTopologyV2Tokens(fixtureReader());
    expect(typeof tokens.vignetteBaseAlpha).toBe("number");
    expect(typeof tokens.dustAreaPerPoint).toBe("number");
    expect(typeof tokens.nodeFillProject).toBe("string");
  });

  it("throws TopologyV2TokenError when any token resolves empty (drift guard)", () => {
    const reader = fixtureReader({ "--topology-v2-indigo": "" });
    expect(() => resolveTopologyV2Tokens(reader)).toThrow(TopologyV2TokenError);
  });

  it("lists every missing token name on the thrown error", () => {
    const reader = fixtureReader({
      "--topology-v2-indigo": "",
      "--topology-v2-radius-project": "",
    });
    try {
      resolveTopologyV2Tokens(reader);
      throw new Error("expected resolveTopologyV2Tokens to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TopologyV2TokenError);
      const tokenErr = err as TopologyV2TokenError;
      expect(tokenErr.missing).toContain("--topology-v2-indigo");
      expect(tokenErr.missing).toContain("--topology-v2-radius-project");
    }
  });

  it("throws when a numeric token is present but non-numeric (drift guard)", () => {
    const reader = fixtureReader({ "--topology-v2-radius-project": "not-a-number" });
    expect(() => resolveTopologyV2Tokens(reader)).toThrow(TopologyV2TokenError);
  });
});
