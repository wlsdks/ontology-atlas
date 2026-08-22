import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { DoNextTab, type DoNextTabLabels, type DoNextTouchUp } from "./DoNextTab";
import type { DoNextQueue } from "../../lib/do-next-queue";
import type { DependencyCyclesResult } from "../../lib/dependency-cycles";

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
  agentReadinessTitle: "Agent readiness",
  agentReadinessReady: "ready",
  agentReadinessPreflight: "preflight",
  agentReadinessReview: "review",
  agentReadinessBlocked: "blocked",
  agentReadinessBlockedBreakdown: (documents: number, relations: number) =>
    `blocked: ${documents} docs · ${relations} relations`,
  repairQueueTitle: "Repair queue",
  repairQueueStale: "stale",
  repairQueueOrphan: "orphan",
  repairQueuePromotion: "promotion",
  repairQueueIsland: "island",
  repairQueueMissingContainment: "missing link",
  repairQueueEmpty: "Nothing to repair right now.",
  repairQueueActionKindStale: "Stale evidence",
  repairQueueActionKindOrphan: "Orphan",
  repairQueueActionKindPromotion: "Promotion",
  repairQueueActionKindIsland: "Disconnected island",
  repairQueueActionKindContainment: "Missing link",
  repairQueueOpenBuilder: "Builder",
  repairQueueOpenOntology: "Map",
  repairQueueRestShow: (count) => `Show ${count} more repair targets`,
  repairQueueRestHide: "Hide repair targets",
  queueTitle: "Worth doing now",
  sectionNeglectedHub: "Neglected hubs",
  sectionOrphan: "Orphans",
  sectionPromotion: "Promotion candidates",
  sectionCycle: "Dependency cycles",
  sectionDuplicate: "Similar names",
  hintDuplicate: "Merge them if they mean the same thing.",
  duplicateMetric: (percent) => `${percent}% overlap`,
  duplicateRestShow: (count) => `Show ${count} more`,
  duplicateRestHide: "Collapse",
  duplicateTruncated: (shown, total) => `Top ${shown} / ${total}`,
  hintNeglectedHub: "Well-connected but untouched.",
  hintOrphan: "A loner with no relations.",
  hintPromotion: "Several concepts point here.",
  promotionMetric: (count) => `${count} references`,
  cycleMoreNodes: (count) => `+${count} more`,
  neglectedHubMetric: (degree, agoDays) => `${degree} links · ${agoDays}d`,
  cycleMetric: (length) => `${length} nodes`,
  openMap: "Inspect on map",
  openSource: "Open source",
  openBuilder: "Edit on map",
  handoffCopy: "Verify with agent",
  handoffCopied: "Copied",
  handoffCopyFailed: '복사 실패',
  emptyQueue: "Nothing needs attention.",
  moreCount: (count) => `+${count} more`,
  digestTitle: "What the agent did",
  digestToday: (count) => `${count} today`,
  digestApproveHint: "Review via git diff",
  digestWhyPrefix: "Why · ",
  touchUpBandTitle: "Review first today",
  touchUpPriorityCount: (count) => `${count} priorities`,
  touchUpFlowHint: "Inspect on map → open source → edit on map → verify with agent",
  rowMenuTrigger: "More actions",
  reviewChecking: (title) => `Checking ${title ?? "selected signal"}`,
  reviewActive: (title) => `Still detected: ${title ?? "selected signal"}`,
  reviewCleared: (title) => `Not detected in the current vault: ${title ?? "selected signal"}`,
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
  reviewUnverified: (title) => `Could not verify: ${title ?? "selected signal"}`,
  openBuilderReadOnly: "View on map",
  handoffCopyIdle: "Copy the command",
  handoffCopiedHint: "Copied — paste it into your AI tool.",
  groupMeaningTitle: "You can fix these right now",
  groupMeaningTitleReadOnly: "Open your own folder to fix these",
  groupMeaningHint: "No code needed.",
  groupMeaningHintReadOnly: "This is the example folder.",
  groupCodeTitle: "Hand these to a developer or an AI",
  groupCodeHint: "These need a look at the implementation.",
};

const noCycles: DependencyCyclesResult = {
  cycles: [],
  totalCycles: 0,
  hiddenCycles: 0,
  activeCycleIds: [],
  limited: false,
};
const cycleProps = {
  nodeTitle: (id: string) => id.replace(/^capability:/, "").toUpperCase(),
  cycleHandoff: (cycle: { id: string }) => `handoff for ${cycle.id}`,
  sourceHref: (id: string) => `/docs/?slug=${encodeURIComponent(id)}`,
  activityDigest: null,
};

const emptyHealthQueue = {
  staleCount: 0,
  orphanCount: 0,
  promotionCount: 0,
  islandCount: 0,
  missingContainmentCount: 0,
  actionTarget: null,
  actionTargets: [],
  builderHref: (slug: string) => `/ontology/edit/?node=${slug}`,
  ontologyHref: (slug: string) => `/ontology/?node=${slug}`,
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
  activeRowIds: [
    "neglected-hub:capability:hub",
    "orphan:element:alone",
  ],
  counts: { neglectedHub: 3, orphan: 1, promotion: 0 },
};

describe("DoNextTab", () => {
  it("행동 큐 — 방치 허브·고아 행 + 지도/빌더 딥링크 + 행별 핸드오프 복사 버튼", () => {
    render(
      <DoNextTab
        queue={queue}
        cycles={noCycles}
        agentReadiness={{ ready: 82, preflight: 4, review: 2, blocked: 2, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        {...cycleProps}
        labels={labels}
      />,
    );

    const rows = screen.getAllByTestId("do-next-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("MCP Server");
    expect(rows[0]).toHaveTextContent("12 links · 45d");
    // One primary action per row (the map) plus a kebab. Builder and hand-to-agent are folded into
    // the kebab and are absent from the DOM while it is closed.
    expect(within(rows[0]).getByText("Inspect on map")).toBeInTheDocument();
    expect(screen.getAllByTestId("do-next-row-menu")).toHaveLength(2);
    expect(screen.queryByTestId("do-next-handoff-copy")).toBeNull();
    // Opening the kebab reveals builder and hand-to-agent.
    fireEvent.click(within(rows[0]).getByTestId("do-next-row-menu"));
    const menu = screen.getByTestId("do-next-row-menu-popover");
    expect(menu.className).not.toContain("animate-");
    expect(within(menu).getByTestId("do-next-row-menu-source")).toHaveAttribute(
      "href",
      "/docs/?slug=capability%3Ahub",
    );
    expect(within(menu).getByTestId("do-next-row-menu-builder")).toBeInTheDocument();
    // The default for a session where no agent was observed — it reads "hand off" rather than
    // "verify" (no door is offered that cannot be walked through).
    expect(within(menu).getByTestId("do-next-row-menu-handoff")).toHaveTextContent("Copy the command");
    // Truncation stated honestly (+2 more = counts 3 - rows 1)
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("「내 몫 먼저」 — 쓸 수 있는 세션은 의미 작업 묶음이 최상단, 읽기 전용은 뒤집힌다", () => {
    const props = {
      queue,
      cycles: noCycles,
      agentReadiness: { ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 },
      healthQueue: emptyHealthQueue,
      mapHref: (id: string) => `/ontology/?node=${encodeURIComponent(id)}`,
      builderHref: (id: string) => `/ontology/studio/?node=${encodeURIComponent(id)}`,
      duplicates: [
        {
          id: "dup:a",
          keepId: "capability:a",
          keepSlug: "capabilities/a",
          keepTitle: "결제 승인",
          dissolveId: "capability:b",
          dissolveSlug: "capabilities/b",
          dissolveTitle: "결제 승인 처리",
          kind: "capability",
          sharedTokens: ["pay"],
          score: 0.8,
        },
      ],
      duplicateTotal: 1,
      duplicateHandoff: () => "merge_concepts …",
      labels,
      ...cycleProps,
    } as React.ComponentProps<typeof DoNextTab>;

    const writable = render(
      <DoNextTab {...props} abilities={{ canWriteVault: true, agentObserved: false }} />,
    );
    const groups = screen.getByTestId("do-next-groups");
    const headings = [...groups.querySelectorAll("[data-testid^='do-next-group-']")]
      .filter((element) => !element.getAttribute("data-testid")!.endsWith("-count"))
      .map((element) => element.getAttribute("data-testid"));
    expect(headings).toEqual(["do-next-group-meaning", "do-next-group-code"]);
    expect(screen.getByTestId("do-next-group-meaning")).toHaveTextContent(
      "You can fix these right now",
    );
    // Group scale = the sum of that group's section totals (duplicate 1 + promotion 0 / neglected 3 + orphan 1).
    expect(screen.getByTestId("do-next-group-meaning-count")).toHaveTextContent("1");
    expect(screen.getByTestId("do-next-group-code-count")).toHaveTextContent("4");
    writable.unmount();

    render(<DoNextTab {...props} abilities={{ canWriteVault: false, agentObserved: false }} />);
    const readOnlyHeadings = [
      ...screen.getByTestId("do-next-groups").querySelectorAll("[data-testid^='do-next-group-']"),
    ]
      .filter((element) => !element.getAttribute("data-testid")!.endsWith("-count"))
      .map((element) => element.getAttribute("data-testid"));
    expect(readOnlyHeadings).toEqual(["do-next-group-code", "do-next-group-meaning"]);
    // Even read-only, the meaning work does not disappear — it states what would make it fixable.
    expect(screen.getByTestId("do-next-group-meaning")).toHaveTextContent(
      "Open your own folder to fix these",
    );
  });

  it("빈 묶음은 머리를 그리지 않는다 — 빈 헤딩은 없는 것을 있는 것처럼 말한다", () => {
    render(
      <DoNextTab
        queue={queue}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/studio/?node=${encodeURIComponent(id)}`}
        abilities={{ canWriteVault: true, agentObserved: true }}
        labels={labels}
        {...cycleProps}
      />,
    );
    // Duplicates, promotions, and meaning gaps are all zero, so there is no meaning group.
    expect(screen.queryByTestId("do-next-group-meaning")).toBeNull();
    expect(screen.getByTestId("do-next-group-code")).toBeInTheDocument();
  });

  it("이관된 readiness 계기·수리 큐를 렌더한다 (RelationsTab 에서 이동)", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={noCycles}
        agentReadiness={{ ready: 82, preflight: 4, review: 2, blocked: 2, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );

    const gauge = screen.getByTestId("insights-agent-readiness");
    expect(gauge).toHaveTextContent("Agent readiness");
    expect(gauge).toHaveAttribute("aria-label", "Agent readiness: 82 ready · 4 preflight · 2 blocked (blocked: 0 docs · 2 relations)");
    expect(screen.getByTestId("insights-repair-queue")).toHaveTextContent("Nothing to repair right now.");
    expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });

  /**
   * "Non-zero but 0px" — a meter drawing «no risk» and «very little risk» as the same picture is
   * decoration, not an instrument. At the measured ratio (1 error / 200 ready), `flexGrow` alone
   * shrinks that piece below 2px at a 390px width and it disappears. The e2e measures a 5/11
   * ratio and so **structurally cannot catch** this rule — hence the mechanism is measured directly here.
   */
  it("아주 작은 위험 몫도 최소 폭을 갖고, 0 은 0 으로 남는다", () => {
    const { rerender } = render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={noCycles}
        agentReadiness={{ ready: 200, preflight: 0, review: 0, blocked: 1, blockedDocuments: 1 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );
    const segments = () =>
      Array.from(screen.getByTestId("insights-agent-readiness-meter").children) as HTMLElement[];
    expect(segments()[2].style.minWidth).toBe("4px");
    // A zero segment really must be zero — otherwise it becomes permanently red.
    expect(segments()[1].style.minWidth).toBe("0px");

    rerender(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={noCycles}
        agentReadiness={{ ready: 200, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );
    expect(segments()[2].style.minWidth).toBe("0px");
  });

  it("수리 대상이 있으면 빌더 딥링크를 노출한다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={{
          ...emptyHealthQueue,
          staleCount: 1,
          actionTarget: { kind: "stale", slug: "capability:foo", title: "Foo" },
          actionTargets: [{ kind: "stale", slug: "capability:foo", title: "Foo" }],
        }}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        cycles={noCycles}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("insights-repair-queue-target")).toHaveTextContent("Foo");
    expect(screen.getByTestId("insights-repair-queue-builder-link")).toHaveAttribute(
      "href",
      "/ontology/edit/?node=capability:foo",
    );
  });

  it("수리 큐 총계가 가리키는 나머지 대상에도 펼침으로 닿는다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={{
          ...emptyHealthQueue,
          islandCount: 2,
          missingContainmentCount: 1,
          actionTarget: { kind: "containment", slug: "capability:invoice", title: "Invoice" },
          actionTargets: [
            { kind: "containment", slug: "capability:invoice", title: "Invoice" },
            { kind: "island", slug: "domain:billing", title: "Billing" },
            { kind: "island", slug: "capability:reporting", title: "Reporting" },
          ],
        }}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        cycles={noCycles}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("insights-repair-queue-target")).toHaveTextContent("Invoice");
    expect(screen.queryByText("Billing")).toBeNull();
    const disclosure = screen.getByRole("button", { name: "Show 2 more repair targets" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Reporting")).toBeInTheDocument();
    expect(screen.getAllByTestId("insights-repair-queue-builder-link")).toHaveLength(3);
  });

  it("의존 사이클 섹션 — 경로를 닫아 표기하고 첫 노드 지도 딥링크 + 핸드오프 복사", () => {
    const cycles: DependencyCyclesResult = {
      cycles: [
        { id: "capability:a\u0000capability:b\u0000capability:c", length: 3, nodeIds: ["capability:a", "capability:b", "capability:c"], hiddenNodeCount: 0 },
      ],
      totalCycles: 1,
      hiddenCycles: 0,
      activeCycleIds: ["capability:a\u0000capability:b\u0000capability:c"],
      limited: false,
    };
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={cycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );

    const section = screen.getByTestId("do-next-cycles");
    expect(section).toBeInTheDocument();
    const row = screen.getByTestId("do-next-cycle-row");
    // "A → B → C → A" (closed) — the first node appears twice, at the start and the end.
    expect(row).toHaveTextContent("A → B → C → A");
    expect(row).toHaveTextContent("3 nodes");
    // Deeplink to the first node on the map.
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/ontology/?node=capability%3Aa");
    expect(within(row).getByTestId("do-next-handoff-copy")).toBeInTheDocument();
    // The "nothing needs attention" message must not appear while cycles exist.
    expect(screen.queryByText("Nothing needs attention.")).not.toBeInTheDocument();
  });

  it("의존 사이클 — 경로 8 노드 초과는 잘라 '외 N' 표기, 사이클 5개 초과는 hiddenCycles", () => {
    const long = Array.from({ length: 8 }, (_, i) => `capability:n${i}`);
    const cycles: DependencyCyclesResult = {
      cycles: [
        { id: long.join("\u0000"), length: 11, nodeIds: long, hiddenNodeCount: 3 },
      ],
      totalCycles: 7,
      hiddenCycles: 2,
      activeCycleIds: [long.join("\u0000")],
      limited: false,
    };
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={cycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );

    const row = screen.getByTestId("do-next-cycle-row");
    // Truncated nodes read "+3 more" (cycleMoreNodes); the total node count stays an honest 11.
    expect(row).toHaveTextContent("+3 more");
    expect(row).toHaveTextContent("11 nodes");
    // More than five cycles → "+2 more" (moreCount, printing 7 - 5).
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });
});

describe("DoNextTab — 근거 계층", () => {
  it("문서 없는 개념 행은 무채색 배지로 첫 걸음이 다르다는 것을 밝힌다", () => {
    // This row's handoff already reads "create the document first" while the screen did not say so —
    // the user pressed it believing there was a document to fix.
    render(
      <DoNextTab
        queue={{
          ...queue,
          rows: [{ ...queue.rows[1], evidenceOnly: true, title: "Integration Test" }],
        }}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        {...cycleProps}
        labels={labels}
      />,
    );

    const row = screen.getByTestId("do-next-row");
    expect(row).toHaveTextContent("Integration Test");
    const badge = within(row).getByTestId("evidence-only-badge");
    expect(badge).toHaveTextContent("No document");
    // Dozens of these badges appear on one screen, so no signal tone is used (the charter).
    expect(badge.className).not.toContain("amber");
  });

  it("문서가 있는 행에는 배지가 붙지 않는다", () => {
    render(
      <DoNextTab
        queue={queue}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        {...cycleProps}
        labels={labels}
      />,
    );

    expect(screen.queryByTestId("evidence-only-badge")).toBeNull();
  });
});

describe("DoNextTab — 활동 다이제스트 (B3)", () => {
  it("로그가 있으면 오늘 카운트 + 최근 요약 + git diff 힌트를 렌더한다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={{ cycles: [], totalCycles: 0, hiddenCycles: 0, activeCycleIds: [], limited: false }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={{
          staleCount: 0, orphanCount: 0, promotionCount: 0, islandCount: 0, missingContainmentCount: 0, actionTarget: null, actionTargets: [],
          builderHref: (s) => s, ontologyHref: (s) => s,
        }}
        mapHref={(id) => id}
        sourceHref={(id) => `/docs/?slug=${encodeURIComponent(id)}`}
        builderHref={(id) => id}
        nodeTitle={(id) => id}
        cycleHandoff={() => ""}
        activityDigest={{
          todayCount: 2,
          latest: [
            { at: "2026-07-21T10:00:00Z", summary: "a --depends_on--> b", agent: "claude-code" },
            { at: "2026-07-21T09:00:00Z", summary: "patch_concept capabilities/x", agent: null },
          ],
        }}
        labels={labels}
      />,
    );
    const digest = screen.getByTestId("insights-activity-digest");
    expect(digest).toHaveTextContent("What the agent did");
    expect(digest).toHaveTextContent("2 today");
    expect(digest).toHaveTextContent("a --depends_on--> b");
    expect(digest).toHaveTextContent("claude-code");
    expect(digest).toHaveTextContent("Review via git diff");
  });

    // `add_relation --why` was stored in activity.jsonl but appeared on no screen. When a digest
    // row has a `why`, it must appear alongside.
  it("why 가 있는 항목은 요약 아래에 truncate 된 이유 줄을 함께 보여준다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={{ cycles: [], totalCycles: 0, hiddenCycles: 0, activeCycleIds: [], limited: false }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={{
          staleCount: 0, orphanCount: 0, promotionCount: 0, islandCount: 0, missingContainmentCount: 0, actionTarget: null, actionTargets: [],
          builderHref: (s) => s, ontologyHref: (s) => s,
        }}
        mapHref={(id) => id}
        sourceHref={(id) => `/docs/?slug=${encodeURIComponent(id)}`}
        builderHref={(id) => id}
        nodeTitle={(id) => id}
        cycleHandoff={() => ""}
        activityDigest={{
          todayCount: 2,
          latest: [
            {
              at: "2026-07-21T10:00:00Z",
              summary: "a --depends_on--> b",
              agent: "claude-code",
              why: "reminder-worker reads offline-sync's queue directly",
            },
            { at: "2026-07-21T09:00:00Z", summary: "patch_concept capabilities/x", agent: null, why: null },
          ],
        }}
        labels={labels}
      />,
    );
    const entries = screen.getAllByTestId("do-next-digest-entry");
    expect(entries).toHaveLength(2);
    expect(within(entries[0]).getByTestId("do-next-digest-why")).toHaveTextContent(
      "Why · reminder-worker reads offline-sync's queue directly",
    );
    // The second item has no `why`, so it has no why row at all.
    expect(within(entries[1]).queryByTestId("do-next-digest-why")).toBeNull();
  });

  it("static 모드(null)에서는 카드를 렌더하지 않는다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={{ cycles: [], totalCycles: 0, hiddenCycles: 0, activeCycleIds: [], limited: false }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={{
          staleCount: 0, orphanCount: 0, promotionCount: 0, islandCount: 0, missingContainmentCount: 0, actionTarget: null, actionTargets: [],
          builderHref: (s) => s, ontologyHref: (s) => s,
        }}
        mapHref={(id) => id}
        sourceHref={(id) => `/docs/?slug=${encodeURIComponent(id)}`}
        builderHref={(id) => id}
        nodeTitle={(id) => id}
        cycleHandoff={() => ""}
        activityDigest={null}
        labels={labels}
      />,
    );
    expect(screen.queryByTestId("insights-activity-digest")).toBeNull();
  });
});

describe("DoNextTab — 오늘의 손질 밴드 (③)", () => {
  const touchUps: DoNextTouchUp[] = [
    {
      id: "cycle:c1",
      source: "cycle",
      nodeId: "capability:a",
      title: "A",
      nodeKind: "",
      why: "2 nodes waiting on each other",
      handoffPayload: "cycle handoff",
    },
    {
      id: "neglected-hub:capability:hub",
      source: "neglected-hub",
      nodeId: "capability:hub",
      title: "MCP Server",
      nodeKind: "capability",
      why: "12 links · unchanged 45d",
      handoffPayload: "hub handoff",
    },
    {
      id: "promotion:element:x",
      source: "promotion",
      nodeId: "element:x",
      title: "X",
      nodeKind: "element",
      why: "referenced enough to promote",
      handoffPayload: "promo handoff",
    },
  ];

  function renderBand(items: DoNextTouchUp[] = touchUps) {
    return render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        touchUps={items}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        {...cycleProps}
        labels={labels}
      />,
    );
  }

  it("밴드는 3건을 '왜 뽑혔나' 한 줄과 함께, 주 액션(지도)+케밥으로 렌더한다", () => {
    renderBand();
    const band = screen.getByTestId("do-next-touchups");
    const rows = within(band).getAllByTestId("do-next-touchup-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("A");
    expect(rows[0]).toHaveTextContent("Why · 2 nodes waiting on each other");
    expect(within(band).getByTestId("do-next-touchups-priority-count")).toHaveTextContent(
      "3 priorities",
    );
    expect(within(band).getByTestId("do-next-touchups-flow")).toHaveTextContent(
      "Inspect on map → open source → edit on map → verify with agent",
    );
    // Per row: one map link plus one kebab.
    expect(within(rows[0]).getByText("Inspect on map")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("do-next-row-menu")).toBeInTheDocument();
  });

  it("콜드스타트 가드 — touchUps 가 비면 밴드를 렌더하지 않는다", () => {
    renderBand([]);
    expect(screen.queryByTestId("do-next-touchups")).toBeNull();
  });

  it("밴드에 올라온 exact cycle은 아래 사이클 섹션에 중복 렌더하지 않는다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        touchUps={[touchUps[0]]}
        cycles={{
          cycles: [{
            id: "c1",
            length: 2,
            nodeIds: ["capability:a", "capability:b"],
            hiddenNodeCount: 0,
          }],
          totalCycles: 1,
          hiddenCycles: 0,
          activeCycleIds: ["c1"],
          limited: false,
        }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );
    expect(screen.getAllByTestId("do-next-touchup-row")).toHaveLength(1);
    expect(screen.queryByTestId("do-next-cycle-row")).toBeNull();
  });

  it("지도 열기는 검토 시작일 뿐 완료가 아니므로 행과 우선순위 수를 유지한다", () => {
    renderBand();
    const rows = screen.getAllByTestId("do-next-touchup-row");
    fireEvent.click(within(rows[0]).getByText("Inspect on map"));
    expect(within(rows[0]).queryByTestId("do-next-touchup-done")).toBeNull();
    expect(within(rows[0]).getByText("Inspect on map")).toBeInTheDocument();
    expect(screen.getByTestId("do-next-touchups-priority-count")).toHaveTextContent(
      "3 priorities",
    );
  });

  it("exact row id를 모든 액션 href와 검토 시작 콜백에 전달한다", () => {
    const onReviewStart = vi.fn();
    const mapHref = vi.fn((id: string, reviewId?: string) => `/map/${id}?review=${reviewId}`);
    render(
      <DoNextTab
        queue={queue}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={mapHref}
        builderHref={(id, reviewId) => `/studio/${id}?review=${reviewId}`}
        sourceHref={(id, reviewId) => `/docs/${id}?review=${reviewId}`}
        nodeTitle={(id) => id}
        cycleHandoff={() => ""}
        activityDigest={null}
        reviewState={{
          id: "orphan:element:alone",
          phase: "active",
          title: "Alone",
        }}
        onReviewStart={onReviewStart}
        labels={labels}
      />,
    );

    const orphanRow = screen
      .getAllByTestId("do-next-row")
      .find((row) => row.textContent?.includes("Alone"));
    expect(orphanRow).toHaveAttribute("aria-current", "step");
    expect(orphanRow?.className).toContain(
      "focus-visible:ring-[color:var(--color-indigo-a42)]",
    );
    const mapLink = within(orphanRow!).getByText("Inspect on map");
    expect(mapLink).toHaveAttribute(
      "href",
      "/map/element:alone?review=orphan:element:alone",
    );
    fireEvent.click(mapLink);
    expect(onReviewStart).toHaveBeenCalledWith({
      id: "orphan:element:alone",
      title: "Alone",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Still detected: Alone");
  });

  it("cleared 상태는 성공 장식 없이 현재 vault 관측 문장과 polite live region만 보여준다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        reviewState={{
          id: "orphan:element:gone",
          phase: "cleared",
          title: "Gone",
        }}
        labels={labels}
      />,
    );

    const status = screen.getByTestId("do-next-review-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Not detected in the current vault: Gone");
    expect(status.className).not.toMatch(/success|green|animate/);
  });

  it("에이전트 인계 복사는 복사 피드백만 주고 완료를 가장하지 않는다", async () => {
    renderBand();
    const rows = screen.getAllByTestId("do-next-touchup-row");
    fireEvent.click(within(rows[1]).getByTestId("do-next-row-menu"));
    fireEvent.click(screen.getByTestId("do-next-row-menu-handoff"));
    expect(await screen.findByTestId("do-next-row-menu-handoff")).toHaveTextContent(
      "Copied",
    );
    expect(within(rows[1]).queryByTestId("do-next-touchup-done")).toBeNull();
  });

  it("케밥 — Escape 로 닫히고 트리거로 포커스가 돌아온다 (키보드 접근)", () => {
    renderBand();
    const rows = screen.getAllByTestId("do-next-touchup-row");
    const trigger = within(rows[2]).getByTestId("do-next-row-menu");
    fireEvent.click(trigger);
    expect(screen.getByTestId("do-next-row-menu-popover")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    // ★ "Closed" is not an immediate unmount (2026-08-04) — this menu lives on a `Surface` and
    //   stays through the exit window (≈140ms), during which `inert` and `pointer-events-none`
    //   make it unreachable by keyboard and pointer alike.
    //   An assertion demanding instant removal is demanding a hard cut.
    //   Focus return must happen **the moment it closes**, independent of the exit (below).
    const menu = screen.getByTestId("do-next-row-menu-popover");
    expect(menu).toHaveAttribute("data-surface-state", "exiting");
    expect(menu).toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
  });
});

// A single verdict model. The measured contradiction found in review: on a vault whose only signal
// was one missing containment, `to do 0` + "the graph is healthy" + `missing containment 1`
// appeared at once, while MCP health returned needs_attention for the same data.
describe("DoNextTab — 건강 주장은 CLI-parity 신호까지 0일 때만 (#63)", () => {
  const emptyQueue: DoNextQueue = {
    rows: [],
    activeRowIds: [],
    counts: { neglectedHub: 0, orphan: 0, promotion: 0 },
  };

  function renderWith(healthQueue: typeof emptyHealthQueue) {
    render(
      <DoNextTab
        queue={emptyQueue}
        cycles={noCycles}
        agentReadiness={{ ready: 0, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={healthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        {...cycleProps}
        labels={labels}
      />,
    );
  }

  it("모든 신호가 0이면 '손볼 것 없음' 문구가 나온다", () => {
    renderWith(emptyHealthQueue);
    expect(screen.getByText(labels.emptyQueue)).toBeInTheDocument();
  });

  it("누락된 연결이 1건이면 '손볼 것 없음' 이라고 말하지 않는다", () => {
    renderWith({ ...emptyHealthQueue, missingContainmentCount: 1 });
    expect(screen.queryByText(labels.emptyQueue)).not.toBeInTheDocument();
  });

  it("분리된 섬이 있어도 마찬가지", () => {
    renderWith({ ...emptyHealthQueue, islandCount: 2 });
    expect(screen.queryByText(labels.emptyQueue)).not.toBeInTheDocument();
  });
});

describe("DoNextTab — 중복 의심 쌍", () => {
  const duplicates = [
    {
      id: "elements/node-drawer elements/node-drawer-model",
      keepId: "element:node-drawer",
      keepSlug: "elements/node-drawer",
      keepTitle: "Node drawer",
      dissolveId: "element:node-drawer-model",
      dissolveSlug: "elements/node-drawer-model",
      dissolveTitle: "Node drawer model",
      kind: "element",
      score: 0.792,
      sharedTokens: ["drawer", "node"],
    },
  ];

  function renderWith(props: Partial<React.ComponentProps<typeof DoNextTab>> = {}) {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={noCycles}
        agentReadiness={{ ready: 0, preflight: 0, review: 0, blocked: 0, blockedDocuments: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        {...cycleProps}
        labels={labels}
        {...props}
      />,
    );
  }

  it("쌍이 있으면 두 이름·겹침 비율·인계를 한 줄로 보여준다", () => {
    renderWith({
      duplicates,
      duplicateTotal: 3,
      duplicateHandoff: (row) => `merge_concepts for ${row.dissolveSlug}`,
    });

    const row = screen.getByTestId("do-next-duplicate-row");
    expect(row).toHaveTextContent("Node drawer");
    expect(row).toHaveTextContent("Node drawer model");
    expect(row).toHaveTextContent("79% overlap");
    // Open the map on the side being kept — merging gathers the backlinks there.
    expect(within(row).getByText("Inspect on map")).toHaveAttribute(
      "href",
      "/ontology/?node=element%3Anode-drawer",
    );
    // The pre-truncation scale is stated by the header number.
    expect(screen.getByTestId("do-next-duplicates")).toHaveTextContent("3");
    expect(within(row).getByTestId("do-next-handoff-copy")).toBeInTheDocument();
  });

  it("한 쌍도 없으면 섹션 자체를 그리지 않는다 — 빈 성공 카드 금지", () => {
    renderWith({ duplicates: [], duplicateTotal: 0 });
    expect(screen.queryByTestId("do-next-duplicates")).toBeNull();
  });

  it("중복만 남아 있어도 '손볼 것 없음' 이라고 말하지 않는다", () => {
    renderWith({ duplicates, duplicateTotal: 1, duplicateHandoff: () => "merge_concepts" });
    expect(screen.queryByText(labels.emptyQueue)).not.toBeInTheDocument();
  });

  /**
   * Measured regression 2026-07-27 — the badge said 10 while only three rows were drawn, with
   * neither a "show more" nor truncation copy. Seven had no way to be discovered on this screen.
   */
  it("배지가 말한 나머지에 닿을 길이 있다 — 펼침 + 절단 문구", () => {
    const rest = [2, 3, 4].map((n) => ({
      ...duplicates[0],
      id: `pair-${n}`,
      keepId: `element:node-${n}`,
      keepTitle: `Node ${n}`,
      dissolveTitle: `Node ${n} model`,
    }));
    renderWith({
      duplicates,
      duplicateRest: rest,
      duplicateTotal: 6,
      duplicateHandoff: () => "merge_concepts",
    });

    // The default folded state: the top rows plus copy stating the remaining scale.
    expect(screen.getAllByTestId("do-next-duplicate-row")).toHaveLength(1);
    expect(screen.getByTestId("do-next-duplicates")).toHaveTextContent("Top 1 / 6");

    fireEvent.click(screen.getByTestId("do-next-duplicate-rest-toggle"));
    expect(screen.getAllByTestId("do-next-duplicate-row")).toHaveLength(4);
    // Truncation that remains even when fully expanded is still stated honestly.
    expect(screen.getByTestId("do-next-duplicates")).toHaveTextContent("Top 4 / 6");
  });

  it("나머지가 없으면 펼침도 절단 문구도 만들지 않는다", () => {
    renderWith({ duplicates, duplicateTotal: 1, duplicateHandoff: () => "merge_concepts" });
    expect(screen.queryByTestId("do-next-duplicate-rest-toggle")).toBeNull();
    expect(screen.getByTestId("do-next-duplicates")).not.toHaveTextContent("Top ");
  });
});
