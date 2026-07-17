import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TopologyMapV2, type TopologyMapV2Props } from "./TopologyMapV2";

/**
 * Smoke test for the P2 scaffold shell — mount/resize/canvas wiring only.
 * This intentionally does NOT test drawing correctness (render/* bodies are
 * TODO stubs) — it verifies the shell renders without crashing and exposes
 * the expected DOM hooks for later E2E/screenshot gates.
 */
const baseProps: TopologyMapV2Props = {
  nodes: [],
  edges: [],
  focus: {
    selectedSlug: null,
    depthLimit: null,
    searchQuery: "",
    activeCategory: null,
    hubsOnly: false,
  },
  overlays: { recentPulse: false, ownerTint: false, backrefHighlight: false },
  livePhysics: false,
  fitViewToken: 0,
  relayoutToken: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TopologyMapV2", () => {
  it("mounts a canvas inside a data-map-engine=v2 container without throwing", () => {
    render(<TopologyMapV2 {...baseProps} />);

    const container = screen.getByTestId("topology-map-v2");
    expect(container).toHaveAttribute("data-map-engine", "v2");
    expect(screen.getByTestId("topology-map-v2-canvas").tagName).toBe("CANVAS");
  });

  it("marks minimal mode via data-minimal", () => {
    render(<TopologyMapV2 {...baseProps} minimal />);
    expect(screen.getByTestId("topology-map-v2")).toHaveAttribute("data-minimal", "true");
    expect(screen.getByTestId("topology-map-v2")).not.toHaveAttribute("data-minimal", "false");
  });

  it("defaults to data-minimal=false when minimal is omitted", () => {
    render(<TopologyMapV2 {...baseProps} />);
    expect(screen.getByTestId("topology-map-v2")).toHaveAttribute("data-minimal", "false");
  });

  // Regression (QA first-light pass — console error sweep): a JSX `onWheel`
  // prop binds React's delegated (passive-by-default) listener — calling
  // `preventDefault()` inside it logged "Unable to preventDefault inside
  // passive event listener invocation" on every wheel tick (reproduced via
  // chrome-devtools: 37 warnings from one zoom gesture) and didn't actually
  // stop the page from scrolling under the canvas. The wheel listener must be
  // attached natively with `{ passive: false }` instead.
  it("attaches the wheel listener natively with { passive: false }, not as a JSX onWheel prop", () => {
    const addEventListenerSpy = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");

    render(<TopologyMapV2 {...baseProps} />);

    const wheelCall = addEventListenerSpy.mock.calls.find(([type]) => type === "wheel");
    expect(wheelCall).toBeDefined();
    expect(wheelCall?.[2]).toMatchObject({ passive: false });

    const canvas = screen.getByTestId("topology-map-v2-canvas");
    expect(canvas.getAttribute("onwheel")).toBeNull();
  });
});
