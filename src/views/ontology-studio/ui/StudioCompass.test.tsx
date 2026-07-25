import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { StudioCompass, type CompassBearingView, type StudioCompassLabels } from "./StudioCompass";
import type { CreateCandidate } from "../lib/build-create-node";
import type { StudioRelation } from "../lib/build-studio-item";
import type { PickerDiscovery } from "../lib/build-picker-discovery";
import { buildDeltaPreview, type DeltaPreviewLayout } from "../lib/build-delta-preview";

const labels: StudioCompassLabels = {
  searchPlaceholder: "search",
  exit: "stop",
  moreRelations: "more",
  flowEyebrow: "completeness",
  flowCount: (f, t) => `${f}/${t} filled`,
  domainMembership: (d) => `already in ${d}`,
  framePrompt: (n) => `complete ${n}`,
  guideBadge: "start here",
  bottomProgress: (f, t) => `${f} of ${t} filled`,
  save: "save",
  saveHint: "hint",
  foldMore: () => "more",
  foldTitle: (label, total) => `${label} · ${total}`,
  addMore: (label) => `add more to ${label}`,
  addMoreShort: "add more",
  defMore: "more",
  defLess: "less",
  pickerTitle: (q) => q,
  pickerSub: "sub",
  pickerPlaceholder: "search nodes",
  pickerEmpty: "empty",
  pickerKind: (k) => k,
  pickerCreateNew: "create new",
  suggestHeading: "Suggested",
  browseHeading: "Browse",
  reasonSameDomain: "Same domain",
  reasonTitleSimilar: "Similar name",
  reasonAdjacent: "Neighbor of a neighbor",
  browseBack: "← Domains",
  browseNoDomain: "No domain",
  similarSuggest: (t) => `same as ${t}?`,
  similarAccept: "yes link",
  createName: "kind",
  createNamePlaceholder: "name",
  createDomainNone: "no domain",
  createDefinitionPlaceholder: "def",
  createSimilar: (t, k) => `${t} ${k}`,
  createSlugCollision: (t, k) => `${t} ${k} path exists`,
  createSlugCollisionHint: "rename to save",
  createSimilarOpen: "open",
  createSimilarAnyway: "anyway",
  edit: "edit",
  editTitle: "edit this relation",
  close: "close",
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
  walkTo: "walk to this node",
  walkBackAria: (name) => `back to ${name}`,
  walkConfirmTitle: (count) => `${count} unsaved — discard and go?`,
  walkConfirmSave: "save and go",
  walkConfirmDiscard: "discard and go",
  previewOpen: "preview",
  previewTitle: "how the map changes",
  previewCloseAria: "close preview",
  previewClose: "close",
  previewCenterNew: "new node",
  previewMovedChip: "moved",
  previewRemovedChip: "cut",
  previewOverflow: (count) => `+${count}`,
  previewLegendExisting: "unchanged",
  previewLegendAdded: "new link",
  previewLegendMoved: "moved",
  previewLegendRemoved: "cut",
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
  it("owns a main landmark and focal-node page heading for route arrival", () => {
    renderEnhance();

    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(
      screen.getByRole("heading", { level: 1, name: "MCP Server" }),
    ).toBeInTheDocument();
  });

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
    const picker = screen.getByTestId("studio-picker");
    expect(picker).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "close" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-picker-row-capability:server-interface"));
    expect(onFill).toHaveBeenCalledWith("isA", CANDIDATE);
    // picker closes after a fill.
    expect(screen.queryByTestId("studio-picker")).not.toBeInTheDocument();
  });

  it("C4 — a FILLED lane exposes a '＋ 더 잇기' add chip that opens the same picker", () => {
    const onFill = renderEnhance();
    // The empty (recommended) lane has a socket, not an add chip.
    expect(screen.queryByTestId("studio-add-more-up")).not.toBeInTheDocument();
    // The filled `dependsOn` (right) lane has NO empty socket but DOES have the
    // add chip — the only way to attach another relation on that bearing (C4).
    expect(screen.queryByTestId("studio-socket-right")).not.toBeInTheDocument();
    const addChip = screen.getByTestId("studio-add-more-right");
    expect(addChip).toHaveAccessibleName("add more to lane-dependsOn");

    fireEvent.click(addChip);
    const picker = screen.getByTestId("studio-picker");
    expect(picker).toHaveAttribute("data-relation", "dependsOn");
    // and it fills that bearing in place.
    fireEvent.click(screen.getByTestId("studio-picker-row-capability:server-interface"));
    expect(onFill).toHaveBeenCalledWith("dependsOn", CANDIDATE);
  });

  it("C12② — a domain-member focal shows the quiet '이미 소속' line so 0/4 isn't read as orphan", () => {
    renderEnhance(); // focal domainLabel = "AI"
    const line = screen.getByTestId("studio-domain-membership");
    expect(line).toHaveTextContent("already in AI");
  });

  it("C12② — a focal with NO domain shows no membership line", () => {
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "Orphan", definition: "" }}
        bearings={[
          bearing("isA", "up", { recommended: true }),
          bearing("dependsOn", "right"),
          bearing("contains", "down", { expected: true }),
          bearing("relates", "left"),
        ]}
        filledBearings={0}
        writable
        candidatesFor={() => []}
        similarFor={() => null}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("studio-domain-membership")).not.toBeInTheDocument();
  });

  it("C2 — picker '새로 만들기' carries the socket relation + typed query", () => {
    const onCreateNew = vi.fn();
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "MCP Server", definition: "" }}
        bearings={[
          bearing("isA", "up", { recommended: true }),
          bearing("dependsOn", "right"),
          bearing("contains", "down", { expected: true }),
          bearing("relates", "left"),
        ]}
        filledBearings={0}
        writable
        candidatesFor={() => []}
        similarFor={() => null}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onCreateNew={onCreateNew}
      />,
    );
    fireEvent.click(screen.getByTestId("studio-socket-down")); // contains bearing
    fireEvent.change(screen.getByTestId("studio-picker-input"), {
      target: { value: "결제 취소" },
    });
    fireEvent.click(screen.getByTestId("studio-picker-create-new"));
    expect(onCreateNew).toHaveBeenCalledWith({ relation: "contains", query: "결제 취소" });
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
    expect(within(list).getByRole("button", { name: "close" })).toBeInTheDocument();
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

  it("names the edit-card close control and Escape closes back to its trigger", () => {
    renderEditable();
    const trigger = screen.getByTestId("studio-edit-right");
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "close" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId("studio-edit-card")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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

  it("Slice 6 — a `?edit=` deep-link opens the relation's edit card on mount", () => {
    // no click: the card is seeded open from the deep-link arrival.
    renderEditable({
      initialEdit: { relation: "dependsOn", neighbor: NEIGHBOR },
      arrivedFrom: "el:x",
    });
    expect(screen.getByTestId("studio-edit-card")).toBeInTheDocument();
    // and the target satellite carries the arrival highlight ring.
    expect(screen.getByTestId("studio-arrival-right")).toBeInTheDocument();
  });

  it("Slice 6 — no deep-link leaves the edit card closed (opt-in click only)", () => {
    renderEditable();
    expect(screen.queryByTestId("studio-edit-card")).not.toBeInTheDocument();
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

describe("StudioCompass — 발견 표면 (browse + 추천)", () => {
  const REFUND: CreateCandidate = {
    id: "capability:refund",
    title: "Refund",
    kind: "capability",
    ref: "capabilities/refund",
  };
  const DISCOVERY: PickerDiscovery = {
    suggestions: [
      { candidate: REFUND, reason: "sameDomain" },
      {
        candidate: { id: "element:token", title: "Token", kind: "element", ref: "elements/token" },
        reason: "adjacentOfAdjacent",
      },
    ],
    domains: [
      { domainId: "domain:pay", key: "domain:pay", title: "Payments", count: 2 },
      { domainId: null, key: "__no_domain__", title: null, count: 1 },
    ],
    nodesByDomain: {
      "domain:pay": [
        REFUND,
        { id: "capability:billing", title: "Billing", kind: "capability", ref: "capabilities/billing" },
      ],
      __no_domain__: [{ id: "element:orphan", title: "Orphan", kind: "element", ref: "elements/orphan" }],
    },
  };

  function renderDiscovery(onFill = vi.fn()) {
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
        discoveryFor={() => DISCOVERY}
        onFill={onFill}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    return onFill;
  }

  it("shows 추천 (with reasons) + 둘러보기 domains before the user types", () => {
    renderDiscovery();
    fireEvent.click(screen.getByTestId("studio-socket-up"));
    // discovery zones, not the flat search rows.
    expect(screen.getByTestId("studio-picker-suggest")).toBeInTheDocument();
    expect(screen.getByTestId("studio-picker-browse")).toBeInTheDocument();
    expect(screen.queryByTestId(`studio-picker-row-${CANDIDATE.id}`)).not.toBeInTheDocument();
    // a suggestion carries its muted reason.
    expect(screen.getByTestId("studio-suggest-row-capability:refund")).toHaveTextContent("Same domain");
    expect(screen.getByTestId("studio-suggest-row-element:token")).toHaveTextContent(
      "Neighbor of a neighbor",
    );
    // the browse zone lists a domain with its node count.
    expect(screen.getByTestId("studio-browse-domain-domain:pay")).toHaveTextContent("Payments");
  });

  it("drills into a domain and back", () => {
    renderDiscovery();
    fireEvent.click(screen.getByTestId("studio-socket-up"));
    // nodes are hidden until a domain is opened.
    expect(screen.queryByTestId("studio-browse-node-capability:billing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-browse-domain-domain:pay"));
    expect(screen.getByTestId("studio-browse-node-capability:refund")).toBeInTheDocument();
    expect(screen.getByTestId("studio-browse-node-capability:billing")).toBeInTheDocument();
    // back row returns to the domain list.
    fireEvent.click(screen.getByTestId("studio-browse-back"));
    expect(screen.getByTestId("studio-browse-domain-domain:pay")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-browse-node-capability:billing")).not.toBeInTheDocument();
  });

  it("picking from a suggestion stages the fill (reuses onFill)", () => {
    const onFill = renderDiscovery();
    fireEvent.click(screen.getByTestId("studio-socket-up"));
    fireEvent.click(screen.getByTestId("studio-suggest-row-capability:refund"));
    expect(onFill).toHaveBeenCalledWith("isA", REFUND);
    // picker closes after a pick.
    expect(screen.queryByTestId("studio-picker")).not.toBeInTheDocument();
  });

  it("typing switches to search results, clearing returns to discovery", () => {
    renderDiscovery();
    fireEvent.click(screen.getByTestId("studio-socket-up"));
    const input = screen.getByTestId("studio-picker-input");
    fireEvent.change(input, { target: { value: "server" } });
    // discovery gone, flat search rows shown.
    expect(screen.queryByTestId("studio-picker-suggest")).not.toBeInTheDocument();
    expect(screen.getByTestId(`studio-picker-row-${CANDIDATE.id}`)).toBeInTheDocument();
    // clearing the query returns to discovery.
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("studio-picker-suggest")).toBeInTheDocument();
  });
});

describe("StudioCompass — 나침반 산책 (compass walk)", () => {
  const NEIGHBOR = { id: "el:x", title: "Parser", kind: "element", ref: "elements/parser" };

  function renderWalk(over: Partial<Parameters<typeof StudioCompass>[0]> = {}) {
    const onOpenNode = vi.fn();
    const onSaveAndOpenNode = vi.fn();
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
        onOpenNode={onOpenNode}
        onSaveAndOpenNode={onSaveAndOpenNode}
        {...over}
      />,
    );
    return { onOpenNode, onSaveAndOpenNode };
  }

  it("walks straight to a node when there are no pending changes", () => {
    const { onOpenNode } = renderWalk();
    expect(screen.queryByTestId("studio-walk-confirm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-satellite-right"));
    expect(onOpenNode).toHaveBeenCalledWith("el:x");
    expect(screen.queryByTestId("studio-walk-confirm")).not.toBeInTheDocument();
  });

  it("guards a walk when changes are pending — confirm intercepts the click", () => {
    const { onOpenNode } = renderWalk({ hasPendingChanges: true });
    fireEvent.click(screen.getByTestId("studio-satellite-right"));
    // navigation is deferred behind the confirm, not fired.
    expect(onOpenNode).not.toHaveBeenCalled();
    expect(screen.getByTestId("studio-walk-confirm")).toBeInTheDocument();
  });

  it("'버리고 이동' discards and navigates; '계속 편집' stays put", () => {
    const { onOpenNode } = renderWalk({ hasPendingChanges: true });
    fireEvent.click(screen.getByTestId("studio-satellite-right"));
    fireEvent.click(screen.getByTestId("studio-walk-confirm-keep"));
    expect(onOpenNode).not.toHaveBeenCalled();
    expect(screen.queryByTestId("studio-walk-confirm")).not.toBeInTheDocument();

    // re-open and discard this time.
    fireEvent.click(screen.getByTestId("studio-satellite-right"));
    fireEvent.click(screen.getByTestId("studio-walk-confirm-discard"));
    expect(onOpenNode).toHaveBeenCalledWith("el:x");
    expect(screen.queryByTestId("studio-walk-confirm")).not.toBeInTheDocument();
  });

  it("'저장하고 이동' commits-then-walks via onSaveAndOpenNode (not a raw open)", () => {
    const { onOpenNode, onSaveAndOpenNode } = renderWalk({ hasPendingChanges: true });
    fireEvent.click(screen.getByTestId("studio-satellite-right"));
    fireEvent.click(screen.getByTestId("studio-walk-confirm-save"));
    expect(onSaveAndOpenNode).toHaveBeenCalledWith("el:x");
    expect(onOpenNode).not.toHaveBeenCalled();
  });

  it("omits the 저장하고 이동 option when no save-and-walk handler is wired", () => {
    renderWalk({ hasPendingChanges: true, onSaveAndOpenNode: undefined });
    fireEvent.click(screen.getByTestId("studio-satellite-right"));
    expect(screen.getByTestId("studio-walk-confirm")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-walk-confirm-save")).not.toBeInTheDocument();
    // no dead option — only 버리고 이동 / 계속 편집 remain.
    expect(screen.getByTestId("studio-walk-confirm-discard")).toBeInTheDocument();
    expect(screen.getByTestId("studio-walk-confirm-keep")).toBeInTheDocument();
  });

  it("renders the quiet '← <이전 노드>' back affordance and walks back", () => {
    const { onOpenNode } = renderWalk({ backTo: { id: "cap:prev", label: "Payments" } });
    const back = screen.getByTestId("studio-walk-back");
    expect(back).toHaveTextContent("Payments");
    expect(back).toHaveAttribute("aria-label", "back to Payments");
    fireEvent.click(back);
    expect(onOpenNode).toHaveBeenCalledWith("cap:prev");
  });

  it("the back affordance is also guarded when changes are pending", () => {
    const { onOpenNode } = renderWalk({ backTo: { id: "cap:prev", label: "Payments" }, hasPendingChanges: true });
    fireEvent.click(screen.getByTestId("studio-walk-back"));
    expect(onOpenNode).not.toHaveBeenCalled();
    expect(screen.getByTestId("studio-walk-confirm")).toBeInTheDocument();
  });

  it("highlights the came-from satellite for arrival orientation", () => {
    renderWalk({ arrivedFrom: "el:x" });
    expect(screen.getByTestId("studio-arrival-right")).toBeInTheDocument();
    // an unrelated lane gets no arrival ring.
    expect(screen.queryByTestId("studio-arrival-up")).not.toBeInTheDocument();
  });

  it("gives the walk affordance a discoverable title", () => {
    renderWalk();
    expect(screen.getByTestId("studio-satellite-right")).toHaveAttribute("title", "walk to this node");
  });
});

describe("StudioCompass — 그래프 델타 미니뷰 (save preview)", () => {
  const emptyBase = (): Record<StudioRelation, CreateCandidate[]> => ({
    isA: [],
    dependsOn: [],
    contains: [],
    relates: [],
  });

  function renderPreview(
    deltaPreview: DeltaPreviewLayout | null | undefined,
    onSave = vi.fn(),
  ) {
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "MCP Server", definition: "def" }}
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
        onSave={onSave}
        onExit={vi.fn()}
        deltaPreview={deltaPreview}
        summary={
          deltaPreview?.hasDelta
            ? { count: 1, collapsed: "1", headline: "1 change", lines: ["add 'depends: Parser'"], fileEffect: "1 file." }
            : null
        }
      />,
    );
    return onSave;
  }

  const addDelta = (): DeltaPreviewLayout =>
    buildDeltaPreview({
      center: { title: "MCP Server", kind: "capability", domainLabel: null, isNew: false },
      baseNeighborsByRelation: emptyBase(),
      changes: [
        { op: "add", relation: "dependsOn", target: { id: "el:parser", title: "Parser", kind: "element", ref: "elements/parser" } },
      ],
    });

  it("hides the 미리보기 affordance with no staged delta (no dead click target)", () => {
    renderPreview(null);
    expect(screen.queryByTestId("studio-preview-open")).not.toBeInTheDocument();
    // an all-'existing' layout (hasDelta false) also hides it.
    const base = emptyBase();
    base.dependsOn = [{ id: "el:x", title: "X", kind: "element", ref: "elements/x" }];
    renderPreview(
      buildDeltaPreview({
        center: { title: "MCP Server", kind: "capability", domainLabel: null, isNew: false },
        baseNeighborsByRelation: base,
        changes: [],
      }),
    );
    expect(screen.queryByTestId("studio-preview-open")).not.toBeInTheDocument();
  });

  it("opens the scrim modal from the affordance and marks the added node indigo", () => {
    renderPreview(addDelta());
    expect(screen.queryByTestId("studio-preview-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-preview-open"));
    const modal = screen.getByTestId("studio-preview-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("aria-modal", "true");
    // the new neighbor renders as an 'added' (indigo) satellite.
    const added = screen.getByTestId("studio-preview-sat-added");
    expect(added).toHaveTextContent("Parser");
    // the same plain sentence list is reused inside the preview.
    expect(screen.getByTestId("studio-preview-summary")).toHaveTextContent("add 'depends: Parser'");
  });

  it("commits directly from the preview footer (same one-click save handler)", () => {
    const onSave = renderPreview(addDelta());
    fireEvent.click(screen.getByTestId("studio-preview-open"));
    fireEvent.click(screen.getByTestId("studio-preview-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    // committing closes the preview.
    expect(screen.queryByTestId("studio-preview-modal")).not.toBeInTheDocument();
  });

  it("closes on the scrim, the ✕, and Esc — nothing else moves", () => {
    renderPreview(addDelta());
    // scrim click
    fireEvent.click(screen.getByTestId("studio-preview-open"));
    fireEvent.click(screen.getByTestId("studio-preview-modal"));
    expect(screen.queryByTestId("studio-preview-modal")).not.toBeInTheDocument();
    // ✕ button
    fireEvent.click(screen.getByTestId("studio-preview-open"));
    fireEvent.click(screen.getByTestId("studio-preview-close"));
    expect(screen.queryByTestId("studio-preview-modal")).not.toBeInTheDocument();
    // Esc key
    fireEvent.click(screen.getByTestId("studio-preview-open"));
    expect(screen.getByTestId("studio-preview-modal")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("studio-preview-modal")).not.toBeInTheDocument();
  });

  it("shows the create-mode new node in the center with its 'new' chip", () => {
    render(
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: "Commerce", name: "Refund", definition: "" }}
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
        canSave
        createKinds={[{ value: "capability", label: "capability" }]}
        createKind="capability"
        deltaPreview={buildDeltaPreview({
          center: { title: "Refund", kind: "capability", domainLabel: "Commerce", isNew: true },
          baseNeighborsByRelation: emptyBase(),
          changes: [
            { op: "add", relation: "isA", target: { id: "cap:pay", title: "Payments", kind: "capability", ref: "capabilities/payments" } },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("studio-preview-open"));
    const center = screen.getByTestId("studio-preview-center");
    expect(center).toHaveTextContent("Refund");
    expect(center).toHaveTextContent("new node");
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

  it("C12③ — renders ONE optional secondary-locale name input and echoes typing", () => {
    const onSecondary = vi.fn();
    render(
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "결제 취소", definition: "" }}
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
        canSave
        createKinds={[{ value: "capability", label: "capability" }]}
        createKind="capability"
        createSecondaryName=""
        onCreateSecondaryName={onSecondary}
        createSecondaryNamePlaceholder="English name (optional)"
      />,
    );
    const secondary = screen.getByTestId("studio-create-name-secondary");
    expect(secondary).toHaveAttribute("placeholder", "English name (optional)");
    fireEvent.change(secondary, { target: { value: "Payment cancel" } });
    expect(onSecondary).toHaveBeenCalledWith("Payment cancel");
  });

  it("C2 — a create-from-socket flow shows the quiet origin context note", () => {
    render(
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "결제 취소", definition: "" }}
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
        canSave
        createKinds={[{ value: "capability", label: "capability" }]}
        createKind="capability"
        createOriginNote="will continue 주문 취소 · 담는 것"
      />,
    );
    expect(screen.getByTestId("studio-create-origin-note")).toHaveTextContent(
      "will continue 주문 취소 · 담는 것",
    );
  });

  it("C12③ — omits the secondary name input when no handler is wired", () => {
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
    expect(screen.queryByTestId("studio-create-name-secondary")).not.toBeInTheDocument();
  });

  it("blocks an exact create-path collision and only offers the existing node", () => {
    render(
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: null, name: "주문 취소", definition: "" }}
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
        createSimilarHit={{
          title: "주문 취소",
          kind: "capability",
          slug: "capabilities/order-cancel",
        }}
        createSlugCollision
        summary={{
          count: 1,
          collapsed: "1 new node · 1 relation",
          headline: "create a node",
          lines: ["add relation"],
          fileEffect: "1 file created",
        }}
        deltaPreview={buildDeltaPreview({
          center: {
            title: "주문 취소",
            kind: "capability",
            domainLabel: null,
            isNew: true,
          },
          baseNeighborsByRelation: {
            isA: [],
            dependsOn: [],
            contains: [],
            relates: [],
          },
          changes: [
            {
              op: "add",
              relation: "dependsOn",
              target: {
                id: "element:gateway",
                title: "Gateway",
                kind: "element",
                ref: "elements/gateway",
              },
            },
          ],
        })}
      />,
    );

    const nameInput = screen.getByTestId("studio-create-name");
    const conflict = screen.getByTestId("studio-create-similar");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "studio-create-slug-collision");
    expect(conflict).toHaveAttribute("id", "studio-create-slug-collision");
    expect(conflict).toHaveAttribute("aria-live", "polite");
    expect(conflict).toHaveTextContent(
      "주문 취소 capability path exists",
    );
    expect(screen.getByRole("button", { name: "open" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "anyway" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("studio-summary-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("studio-preview-open")).not.toBeInTheDocument();
    expect(screen.getByText("rename to save")).toBeInTheDocument();
    expect(screen.getByTestId("studio-save")).toBeDisabled();
  });
});

describe("StudioCompass — 연관 강조 (alive pair) effect", () => {
  const aliveBearings = (): CompassBearingView[] => [
    // staged filled lane → its strut should flow (dash-flow marker class).
    bearing("dependsOn", "right", {
      filled: true,
      staged: true,
      neighbors: [{ id: "el:x", title: "Parser", kind: "element", ref: "elements/parser" }],
    }),
    // filled but NOT staged (saved) → solid strut, no flow marker.
    bearing("isA", "up", {
      filled: true,
      neighbors: [{ id: "c:y", title: "Y", kind: "capability", ref: "capabilities/y" }],
    }),
    bearing("contains", "down", { expected: true }),
    bearing("relates", "left"),
  ];

  function renderAlive() {
    return render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: "AI", name: "MCP Server", definition: "def" }}
        bearings={aliveBearings()}
        filledBearings={2}
        writable
        candidatesFor={() => [CANDIDATE]}
        similarFor={() => null}
        onFill={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    );
  }

  it("flows the dash on a staged strut only (comet grammar for 저장 대기)", () => {
    const { container } = renderAlive();
    const flowing = container.querySelectorAll(".studio-strut-flow");
    // Only the staged (dependsOn) lane's strut carries the flow marker.
    expect(flowing.length).toBeGreaterThan(0);
    for (const path of flowing) {
      expect(path.getAttribute("stroke-dasharray")).toBe("5 7");
    }
  });

  it("lights the card's same-side border to indigo-hover when a socket is hovered", () => {
    renderAlive();
    const card = screen.getByTestId("studio-center-card");
    // left is the empty 'relates' socket; hovering it brightens the left border.
    expect(card.style.borderLeft).not.toContain("var(--color-indigo-hover)");
    fireEvent.mouseEnter(screen.getByTestId("studio-socket-left"));
    expect(card.style.borderLeft).toContain("var(--color-indigo-hover)");
    fireEvent.mouseLeave(screen.getByTestId("studio-socket-left"));
    expect(card.style.borderLeft).not.toContain("var(--color-indigo-hover)");
  });
});

// ── #2 공방 모션 카탈로그 (Phase 3) ─────────────────────────────────────────
describe("StudioCompass — motion catalog (#2)", () => {
  function renderMotion(over: Partial<Parameters<typeof StudioCompass>[0]> = {}) {
    const onSave = vi.fn();
    render(
      <StudioCompass
        mode="enhance"
        labels={labels}
        kindLabelFor={(k) => k}
        focal={{ kindLabel: "capability", domainLabel: "AI", name: "MCP Server", definition: "def" }}
        bearings={[
          bearing("isA", "up", { recommended: true }),
          bearing("dependsOn", "right", {
            filled: true,
            neighbors: [{ id: "el:x", title: "Parser", kind: "element", ref: "elements/parser" }],
          }),
          bearing("contains", "down", { expected: true }),
          bearing("relates", "left"),
        ]}
        filledBearings={1}
        writable
        candidatesFor={() => [CANDIDATE]}
        similarFor={() => null}
        onFill={vi.fn()}
        onSave={onSave}
        onExit={vi.fn()}
        {...over}
      />,
    );
    return { onSave };
  }

  it("stage entrance — center card and its lane leaves carry the stagger-in marker", () => {
    renderMotion();
    expect(screen.getByTestId("studio-center-card").className).toContain("studio-stage-in");
    const socket = screen.getByTestId("studio-socket-up");
    expect(socket.className).toContain("studio-stage-in");
    // each lane is offset from the card; the up lane (index 0) is +40ms.
    expect(socket.style.getPropertyValue("--studio-stagger")).toBe("40ms");
  });

  it("picker origin-scale — opening a socket picker pops from its socket anchor", () => {
    renderMotion();
    fireEvent.click(screen.getByTestId("studio-socket-up"));
    const picker = screen.getByTestId("studio-picker");
    expect(picker.className).toContain("studio-picker-pop");
    expect(picker.style.getPropertyValue("--studio-picker-origin")).not.toBe("");
  });

  it("satellite FLIP — filled-lane satellites register a FLIP node for lane moves", () => {
    renderMotion();
    // A satellite exposes the FLIP hook attribute so a retype can animate its move.
    expect(document.querySelector("[data-flip-sat='el:x']")).toBeInTheDocument();
  });

  const summary = {
    count: 1,
    collapsed: "1 change to record",
    headline: "Record 1 change on MCP Server",
    lines: ["add 'broader: X'"],
    fileEffect: "1 file modified.",
  };

  it("commit convergence — save shows a converging chip then commits (motion on)", () => {
    // jsdom has no matchMedia, so usePrefersReducedMotion resolves to false.
    const { onSave } = renderMotion({ hasPendingChanges: true, canSave: true, summary });
    fireEvent.click(screen.getByTestId("studio-save"));
    expect(screen.getByTestId("studio-commit-converge")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("reduced-motion — save skips the converging chip and commits directly", () => {
    // jsdom leaves window.matchMedia undefined; install one that reports reduce.
    const original = window.matchMedia;
    const mql = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    window.matchMedia = vi.fn(() => mql) as typeof window.matchMedia;
    try {
      const { onSave } = renderMotion({ hasPendingChanges: true, canSave: true, summary });
      fireEvent.click(screen.getByTestId("studio-save"));
      expect(screen.queryByTestId("studio-commit-converge")).not.toBeInTheDocument();
      expect(onSave).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = original;
    }
  });
});
