import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { DoNextTab, type DoNextTabLabels } from "./DoNextTab";
import type { DoNextQueue } from "../../lib/do-next-queue";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: DoNextTabLabels = {
  agentReadinessTitle: "Agent readiness",
  agentReadinessReady: "ready",
  agentReadinessPreflight: "preflight",
  agentReadinessReview: "review",
  repairQueueTitle: "Repair queue",
  repairQueueStale: "stale",
  repairQueueOrphan: "orphan",
  repairQueuePromotion: "promotion",
  repairQueueEmpty: "Nothing to repair right now.",
  repairQueueActionKindStale: "Stale evidence",
  repairQueueActionKindOrphan: "Orphan",
  repairQueueActionKindPromotion: "Promotion",
  repairQueueOpenBuilder: "Builder",
  repairQueueOpenOntology: "Map",
  queueTitle: "Worth doing now",
  sectionNeglectedHub: "Neglected hubs",
  sectionOrphan: "Orphans",
  sectionPromotion: "Promotion candidates",
  neglectedHubMetric: (degree, agoDays) => `${degree} links · ${agoDays}d`,
  openMap: "Map",
  openBuilder: "Builder",
  handoffCopy: "To agent",
  handoffCopied: "Copied",
  emptyQueue: "Nothing needs attention.",
  moreCount: (count) => `+${count} more`,
};

const emptyHealthQueue = {
  staleCount: 0,
  orphanCount: 0,
  promotionCount: 0,
  actionTarget: null,
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
      handoffPayload: 'query_ontology({operation:"blast_radius", slug:"capabilities/mcp-server"})',
    },
    {
      id: "orphan:element:alone",
      rowKind: "orphan",
      nodeId: "element:alone",
      title: "Alone",
      nodeKind: "element",
      handoffPayload: "find_neighbors …",
    },
  ],
  counts: { neglectedHub: 3, orphan: 1, promotion: 0 },
};

describe("DoNextTab", () => {
  it("행동 큐 — 방치 허브·고아 행 + 지도/빌더 딥링크 + 행별 핸드오프 복사 버튼", () => {
    render(
      <DoNextTab
        queue={queue}
        agentReadiness={{ ready: 82, preflight: 4, review: 2 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => `/ontology/?node=${encodeURIComponent(id)}`}
        builderHref={(id) => `/ontology/edit/?node=${encodeURIComponent(id)}`}
        labels={labels}
      />,
    );

    const rows = screen.getAllByTestId("do-next-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("MCP Server");
    expect(rows[0]).toHaveTextContent("12 links · 45d");
    expect(screen.getAllByTestId("do-next-handoff-copy")).toHaveLength(2);
    // 잘린 만큼 정직 표기 (+2 more = counts 3 - rows 1)
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("이관된 readiness 계기·수리 큐를 렌더한다 (RelationsTab 에서 이동)", () => {
    render(
      <DoNextTab
        queue={{ rows: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        agentReadiness={{ ready: 82, preflight: 4, review: 2 }}
        healthQueue={emptyHealthQueue}
        mapHref={(id) => id}
        builderHref={(id) => id}
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
        queue={{ rows: [], counts: { neglectedHub: 0, orphan: 0, promotion: 0 } }}
        agentReadiness={{ ready: 1, preflight: 0, review: 0 }}
        healthQueue={{
          ...emptyHealthQueue,
          staleCount: 1,
          actionTarget: { kind: "stale", slug: "capability:foo", title: "Foo" },
        }}
        mapHref={(id) => id}
        builderHref={(id) => id}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("insights-repair-queue-target")).toHaveTextContent("Foo");
    expect(screen.getByTestId("insights-repair-queue-builder-link")).toHaveAttribute(
      "href",
      "/ontology/edit/?node=capability:foo",
    );
  });
});
