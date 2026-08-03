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

// jsdom 에는 실동작 clipboard 가 없어 케밥 "에이전트에게" 완료 경로가
// 비결정적이 된다 — copyText 를 성공(true)으로 고정한다(CopyAgentTextButton
// 테스트와 같은 관례).
vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

const labels: DoNextTabLabels = {
  agentReadinessTitle: "Agent readiness",
  agentReadinessReady: "ready",
  agentReadinessPreflight: "preflight",
  agentReadinessReview: "review",
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
  openBuilder: "Edit in workshop",
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
  touchUpFlowHint: "Inspect on map → open source → edit in workshop → verify with agent",
  rowMenuTrigger: "More actions",
  reviewChecking: (title) => `Checking ${title ?? "selected signal"}`,
  reviewActive: (title) => `Still detected: ${title ?? "selected signal"}`,
  reviewCleared: (title) => `Not detected in the current vault: ${title ?? "selected signal"}`,
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
  reviewUnverified: (title) => `Could not verify: ${title ?? "selected signal"}`,
  openBuilderReadOnly: "View in workshop",
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
        agentReadiness={{ ready: 82, preflight: 4, review: 2 }}
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
    // ⑨.2 버튼 다이어트 — 행당 주 액션(지도) 1개 + 케밥. 빌더/에이전트에게는
    // 케밥 안으로 접혀 닫힌 상태에선 DOM 에 없다.
    expect(within(rows[0]).getByText("Inspect on map")).toBeInTheDocument();
    expect(screen.getAllByTestId("do-next-row-menu")).toHaveLength(2);
    expect(screen.queryByTestId("do-next-handoff-copy")).toBeNull();
    // 케밥을 열면 빌더 + 에이전트에게가 드러난다.
    fireEvent.click(within(rows[0]).getByTestId("do-next-row-menu"));
    const menu = screen.getByTestId("do-next-row-menu-popover");
    expect(menu.className).not.toContain("animate-");
    expect(within(menu).getByTestId("do-next-row-menu-source")).toHaveAttribute(
      "href",
      "/docs/?slug=capability%3Ahub",
    );
    expect(within(menu).getByTestId("do-next-row-menu-builder")).toBeInTheDocument();
    // 에이전트가 관측되지 않은 세션의 기본값 — "검증" 이 아니라 "인계" 로
    // 번역된다(완결할 수 없는 문을 내밀지 않는다).
    expect(within(menu).getByTestId("do-next-row-menu-handoff")).toHaveTextContent("Copy the command");
    // 잘린 만큼 정직 표기 (+2 more = counts 3 - rows 1)
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("「내 몫 먼저」 — 쓸 수 있는 세션은 의미 작업 묶음이 최상단, 읽기 전용은 뒤집힌다", () => {
    const props = {
      queue,
      cycles: noCycles,
      agentReadiness: { ready: 1, preflight: 0, review: 0 },
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
    // 묶음 규모 = 그 묶음 섹션 총계의 합 (중복 1 + 승격 0 / 방치 3 + 고아 1).
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
    // 읽기 전용에서도 의미 작업은 사라지지 않고, 무엇을 하면 고칠 수 있는지 말한다.
    expect(screen.getByTestId("do-next-group-meaning")).toHaveTextContent(
      "Open your own folder to fix these",
    );
  });

  it("빈 묶음은 머리를 그리지 않는다 — 빈 헤딩은 없는 것을 있는 것처럼 말한다", () => {
    render(
      <DoNextTab
        queue={queue}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/studio/?node=${encodeURIComponent(id)}`}
        abilities={{ canWriteVault: true, agentObserved: true }}
        labels={labels}
        {...cycleProps}
      />,
    );
    // 중복/승격/의미 공백이 모두 0 이라 의미 묶음은 없다.
    expect(screen.queryByTestId("do-next-group-meaning")).toBeNull();
    expect(screen.getByTestId("do-next-group-code")).toBeInTheDocument();
  });

  it("이관된 readiness 계기·수리 큐를 렌더한다 (RelationsTab 에서 이동)", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={noCycles}
        agentReadiness={{ ready: 82, preflight: 4, review: 2 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );

    const gauge = screen.getByTestId("insights-agent-readiness");
    expect(gauge).toHaveTextContent("Agent readiness");
    expect(gauge).toHaveAttribute("aria-label", "Agent readiness: 82 ready · 4 preflight · 2 review");
    expect(screen.getByTestId("insights-repair-queue")).toHaveTextContent("Nothing to repair right now.");
    expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });

  it("수리 대상이 있으면 빌더 딥링크를 노출한다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
    // "A → B → C → A" (닫힘) — 첫 노드가 시작·끝에 두 번 나온다.
    expect(row).toHaveTextContent("A → B → C → A");
    expect(row).toHaveTextContent("3 nodes");
    // 첫 노드 지도 딥링크
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/ontology/?node=capability%3Aa");
    expect(within(row).getByTestId("do-next-handoff-copy")).toBeInTheDocument();
    // 손볼 것 없음 메시지는 사이클이 있으면 안 뜬다
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
        {...cycleProps}
        labels={labels}
      />,
    );

    const row = screen.getByTestId("do-next-cycle-row");
    // 잘린 노드는 "+3 more" (cycleMoreNodes), 총 노드 수는 정직하게 11
    expect(row).toHaveTextContent("+3 more");
    expect(row).toHaveTextContent("11 nodes");
    // 사이클 5개 초과 → "+2 more" (moreCount, 7 - 5 표기)
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });
});

describe("DoNextTab — 근거 계층", () => {
  it("문서 없는 개념 행은 무채색 배지로 첫 걸음이 다르다는 것을 밝힌다", () => {
    // 이 행의 인계문은 이미 「문서부터 만들기」인데 화면은 그 사실을 말하지
    // 않았다 — 사용자는 고칠 문서가 있다고 믿고 눌렀다.
    render(
      <DoNextTab
        queue={{
          ...queue,
          rows: [{ ...queue.rows[1], evidenceOnly: true, title: "Integration Test" }],
        }}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
    // 한 화면에 수십 개가 뜨는 배지라 신호 톤을 쓰지 않는다(헌장).
    expect(badge.className).not.toContain("amber");
  });

  it("문서가 있는 행에는 배지가 붙지 않는다", () => {
    render(
      <DoNextTab
        queue={queue}
        cycles={noCycles}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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

  // P4-② (2026-07-21 리텐션 라운드) — add_relation --why 는 activity.jsonl 에
  // 저장은 됐지만 어떤 화면에도 안 보였다. 다이제스트 행에 why 가 있으면
  // 함께 나와야 한다.
  it("why 가 있는 항목은 요약 아래에 truncate 된 이유 줄을 함께 보여준다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={{ cycles: [], totalCycles: 0, hiddenCycles: 0, activeCycleIds: [], limited: false }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
    // why 없는 두 번째 항목엔 why 줄 자체가 없다.
    expect(within(entries[1]).queryByTestId("do-next-digest-why")).toBeNull();
  });

  it("static 모드(null)에서는 카드를 렌더하지 않는다", () => {
    render(
      <DoNextTab
        queue={{ rows: [], activeRowIds: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        cycles={{ cycles: [], totalCycles: 0, hiddenCycles: 0, activeCycleIds: [], limited: false }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
      "Inspect on map → open source → edit in workshop → verify with agent",
    );
    // 각 행: 지도 링크 1 + 케밥 1
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
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
    // ★ 「닫혔다」는 즉시 언마운트가 아니다 (2026-08-04) — 이 메뉴는 `Surface`
    //   위에 살아서 퇴장 창(≈140ms) 동안 남고, 그동안 `inert` +
    //   `pointer-events-none` 이라 키보드에도 포인터에도 잡히지 않는다.
    //   즉시 소멸을 요구하는 단언은 하드컷을 요구하는 것이다.
    //   포커스 복귀는 퇴장과 무관하게 **닫는 즉시** 일어나야 한다(아래).
    const menu = screen.getByTestId("do-next-row-menu-popover");
    expect(menu).toHaveAttribute("data-surface-state", "exiting");
    expect(menu).toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
  });
});

// #63 — 판정 모델 단일화. opus5 검수 실측 모순: 신호가 '누락된 연결 1건' 뿐인
// 볼트에서 `할 일 0` + "그래프가 건강합니다" + `누락된 연결 1` 이 동시에 떴고,
// 같은 데이터에 MCP health 는 needs_attention 을 반환했다.
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
        agentReadiness={{ ready: 0, preflight: 0, review: 0 }}
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
        agentReadiness={{ ready: 0, preflight: 0, review: 0 }}
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
    // 남길 쪽으로 지도를 연다 — 합치면 백링크가 그쪽으로 모인다.
    expect(within(row).getByText("Inspect on map")).toHaveAttribute(
      "href",
      "/ontology/?node=element%3Anode-drawer",
    );
    // 절단 전 규모는 헤더 숫자가 말한다.
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
   * 2026-07-27 실측 회귀 — 배지는 10건이라 말하는데 3행만 그리고 더 보기도
   * 절단 문구도 없었다. 7건이 이 화면에서 발견될 방법 자체가 없었다.
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

    // 접힌 기본 상태: 상위 행 + 남은 규모를 밝히는 문구.
    expect(screen.getAllByTestId("do-next-duplicate-row")).toHaveLength(1);
    expect(screen.getByTestId("do-next-duplicates")).toHaveTextContent("Top 1 / 6");

    fireEvent.click(screen.getByTestId("do-next-duplicate-rest-toggle"));
    expect(screen.getAllByTestId("do-next-duplicate-row")).toHaveLength(4);
    // 다 펼쳐도 남는 절단은 계속 정직하게 말한다.
    expect(screen.getByTestId("do-next-duplicates")).toHaveTextContent("Top 4 / 6");
  });

  it("나머지가 없으면 펼침도 절단 문구도 만들지 않는다", () => {
    renderWith({ duplicates, duplicateTotal: 1, duplicateHandoff: () => "merge_concepts" });
    expect(screen.queryByTestId("do-next-duplicate-rest-toggle")).toBeNull();
    expect(screen.getByTestId("do-next-duplicates")).not.toHaveTextContent("Top ");
  });
});
