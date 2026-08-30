import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildOntologyTree } from "@/entities/knowledge-graph/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TopologyRealmLedger, type RealmBoundaryRow } from "./TopologyRealmLedger";

// The ontology block export action is a self-contained module needing its own vault
// (useLocalVault) and i18n context — its behaviour is unit-verified by
// `RealmBlockExportAction.test.tsx`, so it is stubbed here (the same pattern as the
// FirstRunStarterModule stub in TopologyIndexPanel.test). This file only checks that
// the ledger mounts the action.
const exportActionProps = vi.hoisted(() => ({ current: null as unknown }));
// This widget receives labels as props, but the rows below it read the screen's
// language (the decision that keeps a Latin eyebrow off Hangul,
// `shared/lib/latin-eyebrow`).
vi.mock("next-intl", () => ({
  useLocale: () => "ko",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/features/ontology-blocks", () => ({
  RealmBlockExportAction: (props: unknown) => {
    exportActionProps.current = props;
    return null;
  },
}));

function makeNode(id: string, kind: string, title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}
function makeEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

const nodes = [
  makeNode("P", "project", "Product"),
  makeNode("D1", "domain", "Views"),
  makeNode("C1", "capability", "Render"),
  makeNode("E1", "element", "Canvas"),
];
const edges = [makeEdge("P", "D1"), makeEdge("D1", "C1"), makeEdge("C1", "E1")];
// D1 subtree = project root P → its only child D1 (findRealmSubtree is unit-
// tested separately in views/home; navigating the tree directly here keeps
// this widget test free of a views-layer import).
const subtree = buildOntologyTree(nodes, edges).roots[0].children[0];

const labels = {
  label: "Realm",
  elementsShort: "elements",
  capabilitiesShort: "capabilities",
  depthShort: "depth",
  searchPlaceholder: "Search realm",
  exit: "Exit realm",
  exitAria: "Exit realm",
  emptyHint: "No matches",
  boundaryHeading: "Touches outside · 1",
  boundaryToggleAria: "Toggle boundary list",
  boundaryJump: "Go to this realm",
  boundaryJumpAria: "Go to this realm",
  boundaryEmpty: "Fully self-contained",
  freshTitle: "recent",
  domainCountTitle: "domain count",
};

const boundaryRows: RealmBoundaryRow[] = [
  {
    edgeId: "C1-C9",
    fromTitle: "Render",
    toTitle: "Billing",
    relationLabel: "depends on",
    outsideId: "C9",
    jumpRealmId: "D2",
  },
];

function renderLedger(overrides?: Partial<React.ComponentProps<typeof TopologyRealmLedger>>) {
  const props: React.ComponentProps<typeof TopologyRealmLedger> = {
    rootKind: "domain",
    rootTitle: "Views",
    census: { elementCount: 1, capabilityCount: 1, depth: 2 },
    subtree,
    boundaryRows,
    boundaryTotal: 1,
    selectedId: null,
    changedSlugs: new Set(),
    onSelect: vi.fn(),
    onExit: vi.fn(),
    onJumpRealm: vi.fn(),
    maxDomainDescendantCount: 2,
    domainCensus: null,
    labels,
    ...overrides,
  };
  render(<TopologyRealmLedger {...props} />);
  return props;
}

describe("TopologyRealmLedger", () => {
  it("renders the realm header title + census", () => {
    renderLedger();
    expect(screen.getByTestId("topology-realm-title")).toHaveTextContent("Views");
    expect(screen.getByTestId("topology-realm-census")).toHaveTextContent(
      "elements 1 · capabilities 1 · depth 2",
    );
  });

  it("mounts the realm block export action with the realm root title/census/subtree (Slice A wiring)", () => {
    renderLedger();
    const props = exportActionProps.current as {
      rootTitle: string;
      census: { elementCount: number };
      subtree: { node: { id: string } };
    };
    expect(props.rootTitle).toBe("Views");
    expect(props.census.elementCount).toBe(1);
    expect(props.subtree.node.id).toBe("D1");
  });

  it("renders only the realm subtree rows (root's children), not the root itself", () => {
    renderLedger();
    const rows = screen.getAllByTestId("topology-index-row");
    // C1 (Render) is the top-level child; E1 (Canvas) is its expanded child.
    const labelsSeen = rows.map((r) => r.textContent);
    expect(labelsSeen.some((t) => t?.includes("Render"))).toBe(true);
    // The realm root "Views" is named by the header, never as a tree row.
    expect(labelsSeen.some((t) => t?.includes("Views"))).toBe(false);
  });

  it("fires onExit from the 영역 해제 button", () => {
    const props = renderLedger();
    fireEvent.click(screen.getByTestId("topology-realm-exit"));
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });

  it("fires onSelect when a tree row is clicked", () => {
    const props = renderLedger();
    fireEvent.click(screen.getAllByTestId("topology-index-row")[0]);
    expect(props.onSelect).toHaveBeenCalled();
  });

  it("keeps the boundary list collapsed to a one-line summary by default", () => {
    renderLedger();
    // Summary line present; the row list is hidden until the disclosure opens.
    expect(screen.getByTestId("topology-realm-boundary-toggle")).toHaveTextContent(
      "Touches outside · 1",
    );
    expect(screen.queryByTestId("topology-realm-boundary-row")).toBeNull();
  });

  it("expands the boundary list on demand and jumps to the outside node's realm", () => {
    const props = renderLedger();
    fireEvent.click(screen.getByTestId("topology-realm-boundary-toggle"));
    const row = screen.getByTestId("topology-realm-boundary-row");
    expect(row).toHaveTextContent("Render");
    expect(row).toHaveTextContent("Billing");
    expect(row).toHaveTextContent("(depends on)");
    fireEvent.click(screen.getByTestId("topology-realm-boundary-jump"));
    expect(props.onJumpRealm).toHaveBeenCalledWith("D2");
  });

  it("shows the self-contained hint (no toggle) when there are no boundary edges", () => {
    renderLedger({ boundaryRows: [], boundaryTotal: 0 });
    expect(screen.getByTestId("topology-realm-boundary")).toHaveTextContent(
      "Fully self-contained",
    );
    expect(screen.queryByTestId("topology-realm-boundary-toggle")).toBeNull();
    expect(screen.queryByTestId("topology-realm-boundary-jump")).toBeNull();
  });

  it("filters the realm tree by the scoped search", () => {
    renderLedger();
    fireEvent.change(screen.getByTestId("topology-realm-search"), {
      target: { value: "zzz-no-match" },
    });
    expect(screen.getByTestId("topology-realm-tree")).toHaveTextContent("No matches");
  });
});
