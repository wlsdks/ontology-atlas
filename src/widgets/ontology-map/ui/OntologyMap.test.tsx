import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OntologyMap, type OntologyMapProps } from "./OntologyMap";

/**
 * Smoke test for the P2 scaffold shell — mount/resize/canvas wiring only.
 * This intentionally does NOT test drawing correctness (render/* bodies are
 * TODO stubs) — it verifies the shell renders without crashing and exposes
 * the expected DOM hooks for later E2E/screenshot gates.
 */
const baseProps: OntologyMapProps = {
  nodes: [],
  edges: [],
  focus: {
    selectedSlug: null,
  },
  fitViewToken: 0,
  relayoutToken: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OntologyMap", () => {
  it("mounts a canvas inside a data-map-engine=v2 container without throwing", () => {
    render(<OntologyMap {...baseProps} />);

    const container = screen.getByTestId("ontology-map");
    expect(container).toHaveAttribute("data-map-engine", "v2");
    expect(screen.getByTestId("ontology-map-canvas").tagName).toBe("CANVAS");
  });

  it("marks minimal mode via data-minimal", () => {
    render(<OntologyMap {...baseProps} minimal />);
    expect(screen.getByTestId("ontology-map")).toHaveAttribute("data-minimal", "true");
    expect(screen.getByTestId("ontology-map")).not.toHaveAttribute("data-minimal", "false");
  });

  it("defaults to data-minimal=false when minimal is omitted", () => {
    render(<OntologyMap {...baseProps} />);
    expect(screen.getByTestId("ontology-map")).toHaveAttribute("data-minimal", "false");
  });

  it("exposes an exact path lens without treating every edge between route nodes as selected", () => {
    render(
      <OntologyMap
        {...baseProps}
        spotlightIds={new Set(["a", "b", "c"])}
        mapLensKind="path"
        pathEdgeIds={new Set(["edge-a-b", "edge-b-c"])}
      />,
    );

    const map = screen.getByTestId("ontology-map");
    expect(map).toHaveAttribute("data-map-lens", "path");
    expect(map).toHaveAttribute("data-path-node-count", "3");
    expect(map).toHaveAttribute("data-path-edge-count", "2");
  });

  it("selects an incident canvas edge through the installed-app verifier event", () => {
    const onSelectEdge = vi.fn();
    const onVerified = vi.fn();
    window.addEventListener("ontology-atlas:verify-edge-selected", onVerified);

    render(
      <OntologyMap
        {...baseProps}
        focus={{ selectedSlug: "domain:views" }}
        nodes={[
          {
            id: "domain:views",
            label: "Views",
            kind: "domain",
            size: 1,
            x: 0,
            y: 0,
            isHub: false,
            ownerKey: null,
            recentlyUpdated: false,
            fullDegree: 1,
            descendantCount: 1,
          },
          {
            id: "capability:topology",
            label: "Topology",
            kind: "capability",
            size: 0,
            x: 0,
            y: 0,
            isHub: false,
            ownerKey: null,
            recentlyUpdated: false,
            fullDegree: 1,
            descendantCount: 0,
          },
        ]}
        edges={[
          {
            source: "domain:views",
            target: "capability:topology",
            relationType: "contains",
            relationQuality: "strong",
            evidenceCount: 1,
            kind: "contains",
            declaredBySlug: "domains/views",
          },
        ]}
        onSelectEdge={onSelectEdge}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("ontology-atlas:verify-select-edge", {
          detail: { preferredNodeId: "domain:views" },
        }),
      );
    });

    expect(onSelectEdge).toHaveBeenCalledWith({
      sourceId: "domain:views",
      targetId: "capability:topology",
      relationType: "contains",
      declaredBySlug: "domains/views",
    });
    expect(onVerified).toHaveBeenCalled();
    expect((onVerified.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      sourceId: "domain:views",
      targetId: "capability:topology",
      relationType: "contains",
    });

    window.removeEventListener("ontology-atlas:verify-edge-selected", onVerified);
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

    render(<OntologyMap {...baseProps} />);

    const wheelCall = addEventListenerSpy.mock.calls.find(([type]) => type === "wheel");
    expect(wheelCall).toBeDefined();
    expect(wheelCall?.[2]).toMatchObject({ passive: false });

    const canvas = screen.getByTestId("ontology-map-canvas");
    expect(canvas.getAttribute("onwheel")).toBeNull();
  });

  const realmProps: OntologyMapProps = {
    ...baseProps,
    onEnterRealm: () => {},
    realmEnterLabel: "이것만 보기",
    realmEnterTooltip: "이 노드 안쪽만 봐요",
  };

  it("in 2D the orbit button carries a micro tooltip", () => {
    render(<OntologyMap {...realmProps} />);

    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("이 노드 안쪽만 봐요");
  });

  it("in 3D the same button renders without a tooltip, keeping the button and its accessible name", () => {
    render(<OntologyMap {...realmProps} view3d />);

    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
    const button = screen.getByTestId("topology-realm-enter-button");
    expect(button).toHaveAttribute("aria-label", "이것만 보기");
  });
});
