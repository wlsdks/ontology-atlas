import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { DoNextTab, type DoNextTabLabels, type DoNextTabProps } from "./DoNextTab";
import type { DoNextGroupCounts, DoNextGroupKey } from "../../lib/do-next-groups";
import type { DoNextQueue } from "../../lib/do-next-queue";
import type { DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DuplicatePairRow } from "../../lib/duplicate-pairs";
import type { MeaningFindingRows } from "../../lib/meaning-gap-rows";
import type { MeaningFindingGapKind } from "@/entities/knowledge-graph";
import type { MeaningGapLabels } from "./MeaningGapSection";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// jsdom has no working clipboard, so `copyText` is pinned to success, as in the CopyAgentTextButton tests.
vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

const GROUP_NAMES: Record<DoNextGroupKey, string> = {
  "blocked-document": "Documents the check stops",
  island: "Disconnected groups",
  containment: "Domains that do not point back",
  "missing-definition": "Concepts with no meaning written",
  "missing-boundary": "Concepts with no boundary written",
  "missing-uncertainty": "Concepts that record no unknown",
  "epistemic-exclusion": "Exclusions that are really reading limits",
  "slug-outside-kind-folder": "Documents outside their kind folder",
  "missing-domain": "Concepts with no domain",
  duplicate: "Pairs whose names overlap",
  promotion: "Broader-concept candidates",
  "neglected-hub": "Hubs unchanged for a long time",
  orphan: "Concepts nothing links to",
  cycle: "Tangled loops",
};

const NO_COUNTS: DoNextGroupCounts = {
  "blocked-document": 0,
  island: 0,
  containment: 0,
  "missing-definition": 0,
  "missing-boundary": 0,
  "missing-uncertainty": 0,
  "epistemic-exclusion": 0,
  "slug-outside-kind-folder": 0,
  "missing-domain": 0,
  duplicate: 0,
  promotion: 0,
  "neglected-hub": 0,
  orphan: 0,
  cycle: 0,
};

const labels: DoNextTabLabels = {
  listTitle: (count) => `${count} things to fix`,
  moreCount: (count) => `+${count} more`,
  showAll: 'Show all',
  groupName: (group) => GROUP_NAMES[group],
  groupToggle: (name, count) => `${name}, ${count} items`,
  emptyQueue: "Nothing needs attention.",
  readOnlyHint: "This is the example folder.",
  openDocument: "Open in documents",
  fixHere: "Fix it myself",
  viewOnMap: "View on map",
  whyNeglectedHub: (degree, agoDays) => `${degree} places use it, unchanged for ${agoDays} days`,
  whyOrphan: "Nothing links to it yet.",
  whyPromotion: (count) => `Referenced from ${count} places.`,
  whyPromotionNamed: (names: string) => `Pointed at by ${names}.`,
  whyPromotionNamedMore: (names: string, count: number) => `Pointed at by ${names} and others, ${count} in all.`,
  whyCycle: (length) => `${length} concepts point at each other.`,
  whyDuplicate: (percent) => `The names overlap ${percent}%.`,
  whyMissingDefinition: "Nothing says what this means.",
  whyMissingDomain: "No domain is written down.",
  whyMeaningFinding: (group) => `finding:${group}`,
  whyIsland: "It sits in a group that links to nothing else.",
  whyContainment: "Its domain does not point back at it.",
  whyBlockedDocument: (reason) => `${reason} Your AI cannot read this document yet.`,
  blockedReason: (code) => (code === "duplicate-uid" ? "Another document claims the same uid." : "Something is wrong."),
  cycleMoreNodes: (count) => `+${count} more`,
  openSource: "Open source",
  openBuilder: "Edit on map",
  handoffCopy: "Verify with agent",
  handoffCopied: "Copied",
  handoffCopyFailed: "Copy failed",
  handoffCopyIdle: "Copy the command",
  handoffCopiedHint: "Copied. Paste it into your AI tool.",
  openBuilderReadOnly: "View on map",
  rowMenuTrigger: "More actions",
  askAgent: "Ask the agent",
  reviewChecking: (title) => `Checking ${title ?? "selected signal"}`,
  reviewActive: (title) => `Still detected: ${title ?? "selected signal"}`,
  reviewCleared: (title) => `Not detected in the current vault: ${title ?? "selected signal"}`,
  reviewUnverified: (title) => `Could not verify: ${title ?? "selected signal"}`,
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
};

const noCycles: DependencyCyclesResult = {
  cycles: [],
  totalCycles: 0,
  hiddenCycles: 0,
  activeCycleIds: [],
  limited: false,
};

const queue: DoNextQueue = {
  rows: [
    {
      id: "neglected-hub:capability:hub",
      rowKind: "neglected-hub",
      nodeId: "capability:hub",
      title: "MCP Server",
      nodeKind: "capability",
      degree: 12,
      agoDays: 45,
      evidenceOnly: false,
      handoffPayload: 'query_ontology({operation:"blast_radius", slug:"capabilities/mcp-server"})',
    },
    {
      id: "orphan:element:alone",
      rowKind: "orphan",
      nodeId: "element:alone",
      title: "Alone",
      nodeKind: "element",
      evidenceOnly: false,
      handoffPayload: "find_neighbors …",
    },
  ],
  activeRowIds: ["neglected-hub:capability:hub", "orphan:element:alone"],
  counts: { neglectedHub: 3, orphan: 1, promotion: 0 },
};

const emptyQueue: DoNextQueue = {
  rows: [],
  activeRowIds: [],
  counts: { neglectedHub: 0, orphan: 0, promotion: 0 },
};

const base: DoNextTabProps = {
  totalCount: 4,
  groupCounts: { ...NO_COUNTS, "neglected-hub": 3, orphan: 1 },
  queue,
  cycles: noCycles,
  docHref: (slug) => `/docs/?slug=${encodeURIComponent(slug)}`,
  mapHref: (id, reviewId) => `/topology/?p=${id}${reviewId ? `&review=${reviewId}` : ""}`,
  sourceHref: (id) => `/docs/?slug=${encodeURIComponent(id)}`,
  builderHref: (id, reviewId) => `/ontology/edit/?node=${id}${reviewId ? `&review=${reviewId}` : ""}`,
  nodeTitle: (id) => id.replace(/^capability:/, "").toUpperCase(),
  cycleHandoff: (cycle) => `handoff for ${cycle.id}`,
  abilities: { canWriteVault: true, agentObserved: true },
  labels,
};

const renderTab = (overrides: Partial<DoNextTabProps> = {}) =>
  render(<DoNextTab {...base} {...overrides} />);

/**
 * Renders and opens every group: the named rows live behind a disclosure, so a row check must open its group,
 * which also checks the disclosure reveals what it counts.
 */
const renderExpanded = (overrides: Partial<DoNextTabProps> = {}) => {
  const result = renderTab(overrides);
  // The first group starts open; clicking it again would close it.
  for (const toggle of screen.queryAllByTestId("do-next-group-toggle")) {
    if (toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
  }
  return result;
};

const duplicate: DuplicatePairRow = {
  id: "dup:1",
  keepId: "capability:invoice",
  keepSlug: "capabilities/invoice",
  keepTitle: "Invoice",
  dissolveId: "capability:invoicing",
  dissolveSlug: "capabilities/invoicing",
  dissolveTitle: "Invoicing",
  kind: "capability",
  score: 0.79,
  sharedTokens: ["invoice"],
};

/** One list, one title count, and group counts that add up to it: the barrier against a second census. */
describe("DoNextTab one list with one total", () => {
  it("states the size in one title without gauges, a figure strip or old group heads", () => {
    renderTab();
    expect(screen.getByTestId("do-next-list-title")).toHaveTextContent("4 things to fix");
    for (const gone of [
      "insights-agent-readiness",
      "insights-agent-readiness-meter",
      "insights-repair-queue",
      "insights-activity-digest",
      "do-next-groups",
      "do-next-group-meaning",
      "do-next-group-code",
      "do-next-touchups",
      // Each group states its own remainder, so a list-wide line would count one thing twice.
      "do-next-list-truncated",
    ]) {
      expect(screen.queryByTestId(gone), `${gone} is still rendered`).toBeNull();
    }
  });

  it("sums group counts to the title count", () => {
    renderTab();
    const counts = screen
      .getAllByTestId("do-next-group-count")
      .map((el) => Number(el.textContent));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("makes no group for a kind with zero items", () => {
    renderTab();
    const kinds = screen
      .getAllByTestId("do-next-group")
      .map((el) => el.getAttribute("data-group-kind"));
    expect(kinds).toEqual(["neglected-hub", "orphan"]);
  });

  it("opens only the first group and renders a closed group rows when expanded", () => {
    renderTab();
    const groups = screen.getAllByTestId("do-next-group");
    expect(groups[0]).toHaveAttribute("data-group-open", "true");
    const firstRows = within(groups[0]).getAllByTestId("do-next-item").length;
    expect(firstRows).toBeGreaterThan(0);
    // Every other group is closed and has drawn nothing.
    for (const group of groups.slice(1)) {
      expect(group).toHaveAttribute("data-group-open", "false");
      expect(within(group).queryByTestId("do-next-item")).toBeNull();
    }
    fireEvent.click(screen.getAllByTestId("do-next-group-toggle")[1]);
    expect(within(groups[1]).getAllByTestId("do-next-item").length).toBeGreaterThan(0);
  });

  it("includes the count in the expand button name", () => {
    renderTab();
    const toggle = screen.getAllByTestId("do-next-group-toggle")[0];
    expect(toggle).toHaveAccessibleName("Hubs unchanged for a long time, 3 items");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders every row as one name line and one observed fact", () => {
    renderExpanded({
      groupCounts: { ...NO_COUNTS, "neglected-hub": 3, orphan: 1, duplicate: 1 },
      totalCount: 5,
      duplicates: [duplicate],
      duplicateHandoff: () => "merge …",
    });
    const rows = screen.getAllByTestId("do-next-item");
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      expect(within(row).getByTestId("do-next-item-why").textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("states the remainder inside a group that renders fewer rows than it counts", () => {
    renderExpanded({
      totalCount: 9,
      groupCounts: { ...NO_COUNTS, "neglected-hub": 8, orphan: 1 },
    });
    expect(screen.getAllByTestId("do-next-group-truncated")[0]).toHaveTextContent("+7 more");
  });

  it("omits the truncation line when everything is shown", () => {
    renderExpanded({ totalCount: 2, groupCounts: { ...NO_COUNTS, "neglected-hub": 1, orphan: 1 } });
    expect(screen.queryByTestId("do-next-group-truncated")).toBeNull();
  });

  it("shows one sentence instead of a list when nothing is due", () => {
    renderTab({ totalCount: 0, groupCounts: NO_COUNTS, queue: emptyQueue });
    expect(screen.queryByTestId("do-next-group")).toBeNull();
    expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });
});

describe("DoNextTab row actions", () => {
  it("orders the three actions as delegate, fix yourself, view", () => {
    renderExpanded({ askAgentHref: () => null });
    const row = screen.getAllByTestId("do-next-item")[0];
    expect(within(row).getByTestId("do-next-item-fix")).toHaveAttribute(
      "href",
      "/ontology/edit/?node=capability:hub&review=neglected-hub:capability:hub",
    );
    expect(within(row).getByTestId("do-next-item-view")).toHaveAttribute(
      "href",
      "/topology/?p=capability:hub&review=neglected-hub:capability:hub",
    );
  });

  it("keeps only the raw text and copy command in the kebab menu", () => {
    renderExpanded();
    const row = screen.getAllByTestId("do-next-item")[0];
    fireEvent.click(within(row).getByTestId("do-next-row-menu"));
    const menu = screen.getByTestId("do-next-row-menu-popover");
    expect(within(menu).queryByTestId("do-next-row-menu-builder")).toBeNull();
    expect(within(menu).getByTestId("do-next-row-menu-source")).toHaveAttribute(
      "href",
      "/docs/?slug=capability%3Ahub",
    );
    expect(within(menu).getByTestId("do-next-row-menu-handoff")).toHaveTextContent("Verify with agent");
  });

  it("marks a concept row without a document with a neutral badge", () => {
    renderExpanded({
      queue: {
        ...queue,
        rows: [{ ...queue.rows[0], evidenceOnly: true }],
      },
    });
    const row = screen.getAllByTestId("do-next-item")[0];
    expect(within(row).getByTestId("evidence-only-badge")).toHaveTextContent("No document");
  });
});

describe("DoNextTab one observed fact per kind", () => {
  const kindOf = (kind: string) =>
    screen.getAllByTestId("do-next-item").find((el) => el.getAttribute("data-fix-kind") === kind);

  it("states one observed fact each for stale hubs, orphans, duplicates and cycles", () => {
    renderExpanded({
      totalCount: 6,
      groupCounts: { ...NO_COUNTS, "neglected-hub": 3, orphan: 1, duplicate: 1, cycle: 1 },
      duplicates: [duplicate],
      duplicateHandoff: () => "merge …",
      cycles: {
        ...noCycles,
        cycles: [
          { id: "c1", nodeIds: ["capability:a", "capability:b"], length: 2, hiddenNodeCount: 0 },
        ],
        totalCycles: 1,
      },
    });
    expect(within(kindOf("neglected-hub")!).getByTestId("do-next-item-why")).toHaveTextContent(
      "12 places use it, unchanged for 45 days",
    );
    expect(within(kindOf("orphan")!).getByTestId("do-next-item-why")).toHaveTextContent(
      "Nothing links to it yet.",
    );
    expect(within(kindOf("duplicate")!).getByTestId("do-next-item-why")).toHaveTextContent(
      "The names overlap 79%.",
    );
    const cycle = kindOf("cycle")!;
    expect(cycle).toHaveTextContent("A → B → A");
    expect(within(cycle).getByTestId("do-next-item-why")).toHaveTextContent(
      "2 concepts point at each other.",
    );
  });

  /**
   * Blocked rows name the document and the failed check and link to the file: a document failing validation is not
   * a node, so the map has nothing to show.
   */
  it("names a document blocked by the check and links to the library", () => {
    renderExpanded({
      totalCount: 5,
      groupCounts: { ...NO_COUNTS, "blocked-document": 1, "neglected-hub": 3, orphan: 1 },
      blockedDocuments: [{ slug: "domains/billing", code: "duplicate-uid" }],
    });
    const row = screen.getAllByTestId("do-next-item")[0];
    expect(row).toHaveAttribute("data-fix-kind", "blocked-document");
    expect(row).toHaveTextContent("domains/billing");
    expect(within(row).getByTestId("do-next-item-why")).toHaveTextContent(
      "Another document claims the same uid. Your AI cannot read this document yet.",
    );
    const view = within(row).getByTestId("do-next-item-view");
    expect(view).toHaveTextContent("Open in documents");
    expect(view).toHaveAttribute("href", "/docs/?slug=domains%2Fbilling");
  });

  it("puts disconnected islands and missing domains in their own groups", () => {
    renderExpanded({
      totalCount: 6,
      groupCounts: { ...NO_COUNTS, island: 1, containment: 1, "neglected-hub": 3, orphan: 1 },
      repairTargets: [
        { slug: "capability:lonely", title: "Lonely", kind: "island" },
        { slug: "capability:homeless", title: "Homeless", kind: "containment" },
      ],
    });
    expect(within(kindOf("island")!).getByTestId("do-next-item-why")).toHaveTextContent(
      "It sits in a group that links to nothing else.",
    );
    expect(within(kindOf("containment")!).getByTestId("do-next-item-why")).toHaveTextContent(
      "Its domain does not point back at it.",
    );
  });
});

describe("DoNextTab order", () => {
  it("puts blocking work first: unreadable documents, broken clusters, then domains without backlinks", () => {
    renderTab({
      totalCount: 7,
      groupCounts: {
        ...NO_COUNTS,
        "blocked-document": 1,
        island: 1,
        containment: 1,
        "neglected-hub": 3,
        orphan: 1,
      },
      repairTargets: [
        { slug: "capability:lonely", title: "Lonely", kind: "island" },
        { slug: "capability:homeless", title: "Homeless", kind: "containment" },
      ],
      blockedDocuments: [{ slug: "domains/billing", code: "duplicate-uid" }],
    });
    expect(
      screen.getAllByTestId("do-next-group").map((el) => el.getAttribute("data-group-kind")),
    ).toEqual(["blocked-document", "island", "containment", "neglected-hub", "orphan"]);
  });

  it("never places one item in two groups", () => {
    renderExpanded();
    const rows = screen.getAllByTestId("do-next-item");
    expect(rows.filter((row) => row.textContent?.includes("MCP Server"))).toHaveLength(1);
  });

  it("puts handoff work first when read-only with the open-folder action in the same box", () => {
    renderExpanded({
      abilities: { canWriteVault: false, agentObserved: false },
      openVaultAction: <button data-testid="do-next-open-vault">Open a folder</button>,
    });
    expect(screen.getByText("This is the example folder.")).toBeInTheDocument();
    expect(screen.getByTestId("do-next-open-vault")).toBeInTheDocument();
    expect(screen.getAllByTestId("do-next-item")[0].getAttribute("data-fix-kind")).toBe(
      "neglected-hub",
    );
  });
});

describe("DoNextTab review loop", () => {
  it("shows the cleared state as a folder observation in a polite live region without success decoration", () => {
    renderTab({
      reviewState: { phase: "cleared", id: "orphan:element:alone", title: "Alone" },
    });
    const status = screen.getByTestId("do-next-review-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Not detected in the current vault: Alone");
  });

  /** Returning from the map lands on the opened row, so the group holding it opens by itself. */
  it("expands the group holding an active row and marks it as the current step", () => {
    renderTab({
      reviewState: { phase: "active", id: "orphan:element:alone", title: "Alone" },
    });
    const group = screen
      .getAllByTestId("do-next-group")
      .find((el) => el.getAttribute("data-group-kind") === "orphan");
    expect(group).toHaveAttribute("data-group-open", "true");
    const active = screen
      .getAllByTestId("do-next-item")
      .find((row) => row.getAttribute("aria-current") === "step");
    expect(active).toHaveTextContent("Alone");
  });
});

/**
 * The four advisory findings: one row per node with a sentence and a way in, no write form. The group count and
 * its rows must be about the same finding, since rows are built inside the open branch of `rowsOfGroup`.
 */
describe("DoNextTab check finding groups", () => {
  const findingRow = (gap: MeaningFindingGapKind, slug: string, title: string) => ({
    id: `${gap}:${slug}`,
    gap,
    nodeId: `capability:${title.toLowerCase()}`,
    ownSlug: slug,
    title,
    nodeKind: "capability",
  });

  const findingRows: MeaningFindingRows = {
    "missing-boundary": [findingRow("missing-boundary", "capabilities/pay", "Pay")],
    "missing-uncertainty": [
      findingRow("missing-uncertainty", "capabilities/refund", "Refund"),
    ],
    "epistemic-exclusion": [
      findingRow("epistemic-exclusion", "capabilities/ship", "Ship"),
    ],
    "slug-outside-kind-folder": [findingRow("slug-outside-kind-folder", "loose", "Loose")],
  };

  const meaningGaps = {
    definitionRows: [],
    domainRows: [],
    findingRows,
    domainChoices: [],
    onWrite: async () => {},
    // These sections draw `FixRow`s, not the write form, so no label of that set is read.
    definitionLabels: {} as MeaningGapLabels,
    domainLabels: {} as MeaningGapLabels,
  };

  const sections: Array<[MeaningFindingGapKind, string]> = [
    ["missing-boundary", "Pay"],
    ["missing-uncertainty", "Refund"],
    ["epistemic-exclusion", "Ship"],
    ["slug-outside-kind-folder", "Loose"],
  ];

  it("names the concept, gives a reason line and an open action in all four slots", () => {
    renderExpanded({
      totalCount: 4,
      groupCounts: {
        ...NO_COUNTS,
        "missing-boundary": 1,
        "missing-uncertainty": 1,
        "epistemic-exclusion": 1,
        "slug-outside-kind-folder": 1,
      },
      queue: emptyQueue,
      meaningGaps,
    });
    for (const [kind, title] of sections) {
      const rows = screen
        .getAllByTestId("do-next-item")
        .filter((row) => row.getAttribute("data-fix-kind") === kind);
      expect(rows, kind).toHaveLength(1);
      expect(rows[0]).toHaveTextContent(title);
      expect(rows[0]).toHaveTextContent(`finding:${kind}`);
      // A way into the node and no write form: these rows are answered in prose.
      const view = rows[0].querySelector('a[href*="/topology/"]');
      expect(view, kind).not.toBeNull();
      expect(rows[0].querySelector("input"), kind).toBeNull();
      // Leaving claims the row: the chip carries the review id like an orphan's, and the row menu exists.
      expect(view?.getAttribute("href"), kind).toContain(`review=${kind}:`);
      expect(rows[0].querySelector('[data-testid="do-next-row-menu"]'), kind).not.toBeNull();
    }
  });

  /** Finding rows leave through the same chips as orphans, so Back must reopen their group and mark the row. */
  it("opens the group and marks the row current when returning with a finding review", () => {
    renderTab({
      totalCount: 4,
      groupCounts: {
        ...NO_COUNTS,
        "missing-boundary": 1,
        "missing-uncertainty": 1,
        "epistemic-exclusion": 1,
        "slug-outside-kind-folder": 1,
      },
      queue: emptyQueue,
      meaningGaps,
      reviewState: { phase: "active", id: "missing-uncertainty:capabilities/refund", title: "Refund" },
    });
    const group = screen
      .getAllByTestId("do-next-group")
      .find((el) => el.getAttribute("data-group-kind") === "missing-uncertainty");
    expect(group).toHaveAttribute("data-group-open", "true");
    const active = screen
      .getAllByTestId("do-next-item")
      .find((row) => row.getAttribute("aria-current") === "step");
    expect(active).toHaveTextContent("Refund");
  });

  it("renders no group for a slot without findings", () => {
    renderExpanded({ totalCount: 4, queue, meaningGaps: null });
    for (const [kind] of sections) {
      expect(
        screen
          .getAllByTestId("do-next-item")
          .filter((row) => row.getAttribute("data-fix-kind") === kind),
        kind,
      ).toHaveLength(0);
    }
  });
});
