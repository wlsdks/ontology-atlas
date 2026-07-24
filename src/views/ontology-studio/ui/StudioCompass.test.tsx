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
  foldTitle: (label, total) => `${label} · ${total}`,
  defMore: "more",
  defLess: "less",
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
  edit: "edit",
  editTitle: "edit this relation",
  editRetypeHeading: "move to",
  editMoveTo: (b) => `move to ${b}`,
  editDelete: "cut relation",
  editDeleteConfirm: "cut it?",
  editDeleteYes: "cut",
  editDeleteCancel: "keep",
  editElsewhere: (o) => `recorded on ${o}`,
  editElsewhereGo: "go to node",
  pendingBadge: "unsaved",
  summaryUndo: "undo",
  exitConfirmTitle: "discard?",
  exitConfirmDiscard: "discard",
  exitConfirmKeep: "keep editing",
  commitEmptyHint: "fills collect here",
};

const REL_LABEL: Record<StudioRelation, string> = {
  isA: "broader",
  dependsOn: "depends",
  contains: "contains",
  relates: "related",
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

describe("StudioCompass — navigation affordances", () => {
  const bearings = (): CompassBearingView[] => [
    bearing("isA", "up", { recommended: true }),
    bearing("dependsOn", "right", {
      filled: true,
      neighbors: Array.from({ length: 5 }, (_, i) => ({
        id: `el:${i}`,
        title: `Dep ${i}`,
        kind: "element",
        ref: `elements/dep-${i}`,
      })),
    }),
    bearing("contains", "down", { expected: true }),
    bearing("relates", "left"),
  ];

  function renderWithNav(onOpenNode = vi.fn()) {
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "MCP Server", definition: "def" }}
        bearings={bearings()}
        filledBearings={1}
        writable
        candidatesFor={() => [CANDIDATE]}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        searchNodes={[CANDIDATE]}
        onOpenNode={onOpenNode}
      />,
    );
    return onOpenNode;
  }

  it("top-bar search is a real input that navigates to a picked node", () => {
    const onOpenNode = renderWithNav();
    const input = screen.getByTestId("studio-node-search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "server" } });
    fireEvent.click(screen.getByTestId(`studio-node-search-row-${CANDIDATE.id}`));
    expect(onOpenNode).toHaveBeenCalledWith(CANDIDATE.id);
  });

  it("clicking a satellite loads that node onto the stage", () => {
    const onOpenNode = renderWithNav();
    fireEvent.click(screen.getAllByTestId("studio-satellite-right")[0]);
    expect(onOpenNode).toHaveBeenCalledWith("el:0");
  });

  it("the '+N 더 보기' fold expands a scrollable list of all lane neighbors", () => {
    const onOpenNode = renderWithNav();
    expect(screen.queryByTestId("studio-lane-list-right")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-lane-more-right"));
    const list = screen.getByTestId("studio-lane-list-right");
    expect(list).toBeInTheDocument();
    // all five neighbors are listed, including the folded ones.
    fireEvent.click(screen.getByTestId("studio-lane-row-el:4"));
    expect(onOpenNode).toHaveBeenCalledWith("el:4");
  });
});

describe("StudioCompass — 지지대 편집 (edit existing relations)", () => {
  const NEIGHBOR = { id: "el:x", title: "Parser", kind: "element", ref: "elements/parser" };

  function renderEditable(over: Partial<Parameters<typeof StudioCompass>[0]> = {}) {
    const onRetype = vi.fn();
    const onRemove = vi.fn();
    const bearings: CompassBearingView[] = [
      bearing("isA", "up", { recommended: true }),
      bearing("dependsOn", "right", { filled: true, neighbors: [NEIGHBOR] }),
      bearing("contains", "down", { expected: true }),
      bearing("relates", "left"),
    ];
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "MCP Server", definition: "def" }}
        bearings={bearings}
        filledBearings={1}
        writable
        candidatesFor={() => []}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onOpenNode={vi.fn()}
        onRetype={onRetype}
        onRemove={onRemove}
        bearingLabelFor={(r) => REL_LABEL[r]}
        editabilityOf={() => true}
        {...over}
      />,
    );
    return { onRetype, onRemove };
  }

  it("opens the inline edit card from the satellite '···' and retypes", () => {
    const { onRetype } = renderEditable();
    expect(screen.queryByTestId("studio-edit-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-edit-right"));
    expect(screen.getByTestId("studio-edit-card")).toBeInTheDocument();
    // retype option shows the plain bearing label, not the current bearing.
    fireEvent.click(screen.getByTestId("studio-edit-retype-contains"));
    expect(onRetype).toHaveBeenCalledWith("dependsOn", "contains", NEIGHBOR);
  });

  it("cut takes a 1-step confirm before firing onRemove", () => {
    const { onRemove } = renderEditable();
    fireEvent.click(screen.getByTestId("studio-edit-right"));
    fireEvent.click(screen.getByTestId("studio-edit-delete"));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("studio-edit-delete-confirm"));
    expect(onRemove).toHaveBeenCalledWith("dependsOn", NEIGHBOR);
  });

  it("a non-editable edge shows the honest note + re-center instead of retype", () => {
    const onOpenNode = vi.fn();
    renderEditable({ editabilityOf: () => false, onOpenNode });
    fireEvent.click(screen.getByTestId("studio-edit-right"));
    expect(screen.queryByTestId("studio-edit-retype-contains")).not.toBeInTheDocument();
    expect(screen.getByText("recorded on Parser")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-edit-open-other"));
    expect(onOpenNode).toHaveBeenCalledWith("el:x");
  });

  it("a staged neighbor shows the '저장 대기' cue in place of its kind", () => {
    renderEditable({ pendingNeighborIds: new Set(["el:x"]) });
    expect(screen.getByTestId("studio-satellite-right")).toHaveTextContent("unsaved");
  });
});

describe("StudioCompass — 평문 기록 요약 (record summary)", () => {
  function renderWithSummary(onUndoChange = vi.fn(), onExit = vi.fn()) {
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "MCP Server", definition: "def" }}
        bearings={[
          bearing("isA", "up", { filled: true, neighbors: [{ id: "c:x", title: "X", kind: "capability", ref: "capabilities/x" }] }),
          bearing("dependsOn", "right"),
          bearing("contains", "down", { expected: true }),
          bearing("relates", "left"),
        ]}
        filledBearings={1}
        writable
        candidatesFor={() => []}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={onExit}
        hasPendingChanges
        onUndoChange={onUndoChange}
        summary={{
          count: 1,
          collapsed: "1 change to record",
          headline: "Record 1 change on MCP Server",
          lines: ["add 'broader: X'"],
          fileEffect: "1 file modified.",
        }}
      />,
    );
    return { onUndoChange, onExit };
  }

  it("expands the summary from a collapsed count and lists the plain sentence", () => {
    renderWithSummary();
    expect(screen.queryByTestId("studio-summary-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-summary-toggle"));
    const panel = screen.getByTestId("studio-summary-panel");
    expect(panel).toHaveTextContent("Record 1 change on MCP Server");
    expect(screen.getByTestId("studio-summary-line-0")).toHaveTextContent("add 'broader: X'");
  });

  it("each pending row can be undone before save", () => {
    const { onUndoChange } = renderWithSummary();
    fireEvent.click(screen.getByTestId("studio-summary-toggle"));
    fireEvent.click(screen.getByTestId("studio-summary-undo-0"));
    expect(onUndoChange).toHaveBeenCalledWith(0);
  });

  it("exit with pending changes confirms before leaving", () => {
    const { onExit } = renderWithSummary();
    fireEvent.click(screen.getByTestId("studio-exit"));
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId("studio-exit-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-exit-confirm-discard"));
    expect(onExit).toHaveBeenCalled();
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
