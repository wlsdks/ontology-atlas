import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StudioCompass, type CompassBearingView, type StudioCompassLabels } from "./StudioCompass";
import type { CreateCandidate } from "../lib/build-create-node";
import type { StudioRelation } from "../lib/build-studio-item";

const labels: StudioCompassLabels = {
  searchPlaceholder: "search",
  exit: "stop",
  moreRelations: "more",
  flowEyebrow: "completeness",
  flowCount: (f, t) => `${f}/${t} filled`,
  framePrompt: (n) => `complete ${n}`,
  guideBadge: "start here",
  bottomProgress: (f, t) => `${f} of ${t} filled`,
  save: "save",
  saveHint: "hint",
  foldMore: () => "more",
  pickerTitle: (q) => q,
  pickerSub: "sub",
  pickerPlaceholder: "search nodes",
  pickerEmpty: "empty",
  pickerKind: (k) => k,
  pickerCreateNew: "create new",
  similarSuggest: (t) => `same as ${t}?`,
  similarAccept: "yes link",
  createName: "kind",
  createNamePlaceholder: "name",
  createDomainNone: "no domain",
  createDefinitionPlaceholder: "def",
  createSimilar: (t, k) => `${t} ${k}`,
  createSimilarOpen: "open",
  createSimilarAnyway: "anyway",
};

const bearing = (
  relation: StudioRelation,
  bearingId: CompassBearingView["bearing"],
  over: Partial<CompassBearingView> = {},
): CompassBearingView => ({
  bearing: bearingId,
  relation,
  question: `q-${relation}`,
  laneLabel: `lane-${relation}`,
  emptyHint: `hint-${relation}`,
  neighbors: [],
  filled: false,
  recommended: false,
  expected: false,
  ...over,
});

const CANDIDATE: CreateCandidate = {
  id: "capability:server-interface",
  title: "Server Interface",
  kind: "capability",
  ref: "capabilities/server-interface",
};

function renderEnhance(onFill = vi.fn()) {
  const bearings: CompassBearingView[] = [
    bearing("isA", "up", { recommended: true }),
    bearing("dependsOn", "right", {
      filled: true,
      neighbors: [{ id: "el:x", title: "Parser", kind: "element", ref: "elements/parser" }],
    }),
    bearing("contains", "down", { expected: true }),
    bearing("relates", "left"),
  ];
  render(
    <StudioCompass
      mode="enhance"
      labels={labels}
      kindLabelFor={(k) => k}
      focal={{ kindLabel: "capability", domainLabel: "AI", name: "MCP Server", definition: "def" }}
      bearings={bearings}
      filledBearings={1}
      writable
      candidatesFor={() => [CANDIDATE]}
      similarFor={() => null}
      onFill={onFill}
      onSave={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  return onFill;
}

describe("StudioCompass — enhance", () => {
  it("renders the focal node as hero + plain-language bearing questions", () => {
    renderEnhance();
    expect(screen.getByTestId("studio-center-card")).toHaveTextContent("MCP Server");
    expect(screen.getByText("q-isA")).toBeInTheDocument();
    expect(screen.getByText("q-contains")).toBeInTheDocument();
    // the single guided socket shows the "start here" badge.
    expect(screen.getByTestId("studio-socket-up")).toHaveTextContent("start here");
  });

  it("opens the inline picker on the recommended socket and fills it in place", () => {
    const onFill = renderEnhance();
    // picker is closed at rest.
    expect(screen.queryByTestId("studio-picker")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-socket-up"));
    expect(screen.getByTestId("studio-picker")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-picker-row-capability:server-interface"));
    expect(onFill).toHaveBeenCalledWith("isA", CANDIDATE);
    // picker closes after a fill.
    expect(screen.queryByTestId("studio-picker")).not.toBeInTheDocument();
  });

  it("shows the near-dup suggestion and links it on accept", () => {
    const onFill = vi.fn();
    const bearings: CompassBearingView[] = [
      bearing("isA", "up", { recommended: true }),
      bearing("dependsOn", "right"),
      bearing("contains", "down", { expected: true }),
      bearing("relates", "left"),
    ];
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "MCP Server", definition: "" }}
        bearings={bearings}
        filledBearings={0}
        writable
        candidatesFor={() => [CANDIDATE]}
        similarFor={() => CANDIDATE}
        onFill={onFill}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("studio-socket-up"));
    fireEvent.click(screen.getByTestId("studio-picker-similar-accept"));
    expect(onFill).toHaveBeenCalledWith("isA", CANDIDATE);
  });
});

describe("StudioCompass — create", () => {
  it("renders an editable draft card with all four bearings empty", () => {
    render(
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "", definition: "" }}
        bearings={[
          bearing("isA", "up", { recommended: true }),
          bearing("dependsOn", "right"),
          bearing("contains", "down", { expected: true }),
          bearing("relates", "left"),
        ]}
        filledBearings={0}
        writable
        candidatesFor={() => []}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        canSave={false}
        createKinds={[{ value: "capability", label: "capability" }]}
        createKind="capability"
      />,
    );
    expect(screen.getByTestId("studio-create-name")).toBeInTheDocument();
    // save is disabled until the node is named.
    expect(screen.getByTestId("studio-save")).toBeDisabled();
  });
});
