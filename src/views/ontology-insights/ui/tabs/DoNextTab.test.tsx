import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { DoNextTab, type DoNextTabLabels, type DoNextTabProps, type DoNextTouchUp } from "./DoNextTab";
import type { DoNextQueue } from "../../lib/do-next-queue";
import type { DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DuplicatePairRow } from "../../lib/duplicate-pairs";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// jsdom has no working clipboard, which makes the kebab's "hand to an agent" completion path
// non-deterministic — `copyText` is pinned to success (true), the same convention as the
// CopyAgentTextButton tests.
vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

const labels: DoNextTabLabels = {
  listTitle: (count) => `${count} things to fix`,
  moreCount: (count) => `+${count} more`,
  emptyQueue: "Nothing needs attention.",
  readOnlyHint: "This is the example folder.",
  openDocument: "Open in documents",
  fixHere: "Fix it myself",
  viewOnMap: "View on map",
  whyNeglectedHub: (degree, agoDays) => `${degree} places use it, unchanged for ${agoDays} days`,
  whyOrphan: "Nothing links to it yet.",
  whyPromotion: (count) => `Referenced from ${count} places.`,
  whyCycle: (length) => `${length} concepts point at each other.`,
  whyDuplicate: (percent) => `The names overlap ${percent}%.`,
  whyMissingDefinition: "Nothing says what this means.",
  whyMissingDomain: "No domain is written down.",
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

const touchUps: DoNextTouchUp[] = [
  {
    id: "neglected-hub:capability:hub",
    source: "neglected-hub",
    nodeId: "capability:hub",
    title: "MCP Server",
    nodeKind: "capability",
    why: "12 places use it, unchanged for 45 days",
    handoffPayload: "handoff hub",
  },
];

/**
 * **One list, and only one.** The tab used to show the same work three ways (a readiness meter, a
 * counter band and a grouped queue). The owner could not say why the tab existed, and the decision
 * on 2026-08-31 was one flat list. These first checks are the barrier against any of the three
 * coming back: not "the meter looks right" but "there is no second place counting this work".
 */
describe("DoNextTab — 한 목록", () => {
  it("제목 하나가 규모를 말하고, 계기·수치 띠·묶음 머리는 없다", () => {
    renderTab({ touchUps });
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
    ]) {
      expect(screen.queryByTestId(gone), `${gone} 이 남아 있다`).toBeNull();
    }
  });

  it("모든 행이 같은 모양이다 — 이름 한 줄, 관찰한 사실 한 문장", () => {
    renderTab({ duplicates: [duplicate], duplicateHandoff: () => "merge …" });
    const rows = screen.getAllByTestId("do-next-item");
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      expect(within(row).getByTestId("do-next-item-why").textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("잘린 만큼은 목록 아래 한 줄로만 밝힌다 — 구획마다 세지 않는다", () => {
    renderTab({ totalCount: 9 });
    expect(screen.getByTestId("do-next-list-truncated")).toHaveTextContent("+7 more");
  });

  it("전부 보이면 절단 문구를 만들지 않는다", () => {
    renderTab({ totalCount: 2 });
    expect(screen.queryByTestId("do-next-list-truncated")).toBeNull();
  });

  it("할 일이 없으면 목록 대신 한 문장", () => {
    renderTab({ totalCount: 0, queue: emptyQueue });
    expect(screen.queryByTestId("do-next-item")).toBeNull();
    expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });
});

describe("DoNextTab — 행의 행동", () => {
  it("세 행동이 늘 같은 순서다 — 맡기기 · 직접 고치기 · 보기", () => {
    renderTab({ askAgentHref: () => null });
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

  it("케밥은 원문과 복사할 명령만 남긴다 — 「직접 고치기」를 두 번 주지 않는다", () => {
    renderTab();
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

  it("문서 없는 개념 행은 무채색 배지로 첫 걸음이 다르다는 것을 밝힌다", () => {
    renderTab({
      queue: {
        ...queue,
        rows: [{ ...queue.rows[0], evidenceOnly: true }],
      },
    });
    const row = screen.getAllByTestId("do-next-item")[0];
    expect(within(row).getByTestId("evidence-only-badge")).toHaveTextContent("No document");
  });
});

describe("DoNextTab — 종류마다 관찰한 사실 한 문장", () => {
  const kindOf = (kind: string) =>
    screen.getAllByTestId("do-next-item").find((el) => el.getAttribute("data-fix-kind") === kind);

  it("방치 허브·고아·중복·사이클", () => {
    renderTab({
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
   * The readiness meter said "5 blocked" and named none of them. These rows name the document and
   * say which check failed, and they link to the file rather than the map: a document that fails
   * validation is not a node, so the map has nothing to show.
   */
  it("검사에 막힌 문서는 스스로를 밝히고 문서함으로 간다", () => {
    renderTab({
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

  it("끊어진 섬과 빠진 소속은 수치가 아니라 행이 된다", () => {
    renderTab({
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

describe("DoNextTab — 순서와 중복", () => {
  it("먼저 볼 일이 목록 맨 위에 오고, 같은 항목이 아래에 또 나오지 않는다", () => {
    renderTab({ touchUps });
    const rows = screen.getAllByTestId("do-next-item");
    expect(rows[0]).toHaveTextContent("MCP Server");
    expect(rows[0].getAttribute("data-fix-kind")).toBe("touch-up-neglected-hub");
    expect(rows.filter((row) => row.textContent?.includes("MCP Server"))).toHaveLength(1);
  });

  it("밴드에 올라온 사이클은 아래에 다시 그리지 않는다", () => {
    renderTab({
      touchUps: [
        {
          id: "cycle:c1",
          source: "cycle",
          nodeId: "capability:a",
          title: "A",
          nodeKind: "capability",
          why: "2 concepts point at each other.",
          handoffPayload: "handoff cycle",
        },
      ],
      cycles: {
        ...noCycles,
        cycles: [
          { id: "c1", nodeIds: ["capability:a", "capability:b"], length: 2, hiddenNodeCount: 0 },
        ],
        totalCycles: 1,
      },
    });
    expect(
      screen.getAllByTestId("do-next-item").filter((row) => row.getAttribute("data-fix-kind") === "cycle"),
    ).toHaveLength(0);
  });

  it("읽기 전용이면 넘길 일이 먼저 오고, 폴더 여는 길이 같은 상자 안에 있다", () => {
    renderTab({
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

describe("DoNextTab — 검토 루프", () => {
  it("cleared 상태는 성공 장식 없이 현재 폴더 관측 문장과 polite live region만 보여준다", () => {
    renderTab({
      reviewState: { phase: "cleared", id: "orphan:element:alone", title: "Alone" },
    });
    const status = screen.getByTestId("do-next-review-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Not detected in the current vault: Alone");
  });

  it("active 상태는 그 행을 현재 단계로 표시한다 — 지도에서 돌아오면 여기로 돌아온다", () => {
    renderTab({
      reviewState: { phase: "active", id: "orphan:element:alone", title: "Alone" },
    });
    const active = screen
      .getAllByTestId("do-next-item")
      .find((row) => row.getAttribute("aria-current") === "step");
    expect(active).toHaveTextContent("Alone");
  });
});
