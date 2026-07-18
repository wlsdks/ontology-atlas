import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { RelationsTab, type RelationsTabLabels } from "./RelationsTab";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: RelationsTabLabels = {
  relationTypesTitle: "Relation types",
  topDependsOnTitle: "Top depends_on",
  noDependsOn: "No depends_on relations yet",
  hubsTitle: "Hubs",
  noHubs: "No hubs yet",
  connectionsUnit: "connections",
  hubTruncated: (shown, total) => `Showing ${shown} of ${total}`,
  hubThumbnailCaption: "Thumbnails are mini ego maps.",
  agentReadinessTitle: "Agent readiness",
  agentReadinessReady: "ready",
  agentReadinessPreflight: "preflight",
  agentReadinessReview: "review",
  repairQueueTitle: "Repair queue",
  repairQueueStale: "stale evidence",
  repairQueueOrphan: "open question",
  repairQueuePromotion: "hub candidate",
  repairQueueEmpty: "Nothing to repair right now.",
  repairQueueTargetLabel: "Next repair target",
  repairQueueActionKindStale: "Stale evidence",
  repairQueueActionKindOrphan: "Open question",
  repairQueueActionKindPromotion: "Hub candidate",
  repairQueueOpenBuilder: "Edit relations",
  repairQueueOpenOntology: "Concept doc",
};

const emptyHealthQueue = {
  staleCount: 0,
  orphanCount: 0,
  promotionCount: 0,
  actionTarget: null,
  builderHref: (slug: string) => `/ontology/edit/?node=${slug}`,
  ontologyHref: (slug: string) => `/ontology/?node=${slug}`,
};

describe("RelationsTab", () => {
  it("renders the agent readiness gauge with ready/preflight/review counts (W3 분석 보기 이관)", () => {
    render(
      <RelationsTab
        edgeTypeRows={[{ type: "contains", count: 10 }]}
        totalEdges={10}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        agentReadiness={{ ready: 82, preflight: 4, review: 2 }}
        healthQueue={emptyHealthQueue}
        labels={labels}
      />,
    );

    const gauge = screen.getByTestId("insights-agent-readiness");
    expect(gauge).toHaveTextContent("Agent readiness");
    expect(gauge).toHaveTextContent("82");
    expect(gauge).toHaveTextContent("ready");
    expect(gauge).toHaveTextContent("4");
    expect(gauge).toHaveTextContent("preflight");
    expect(gauge).toHaveTextContent("2");
    expect(gauge).toHaveTextContent("review");
    expect(gauge).toHaveAttribute(
      "aria-label",
      "Agent readiness: 82 ready · 4 preflight · 2 review",
    );
  });

  it("does not divide by zero when there are no relations yet", () => {
    render(
      <RelationsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        agentReadiness={{ ready: 0, preflight: 0, review: 0 }}
        healthQueue={emptyHealthQueue}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("insights-agent-readiness-meter")).toBeInTheDocument();
  });

  it("shows the repair queue empty state below the readiness gauge when nothing needs repair (분석 패널 완전 소멸 2단계 §c)", () => {
    render(
      <RelationsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        agentReadiness={{ ready: 0, preflight: 0, review: 0 }}
        healthQueue={emptyHealthQueue}
        labels={labels}
      />,
    );

    const queue = screen.getByTestId("insights-repair-queue");
    expect(queue).toHaveTextContent("Repair queue");
    expect(queue).toHaveTextContent("Nothing to repair right now.");
    expect(screen.queryByTestId("insights-repair-queue-target")).toBeNull();
  });

  it("shows the next repair target with a builder ?node= deep link when the queue has an actionable target", () => {
    render(
      <RelationsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        agentReadiness={{ ready: 0, preflight: 0, review: 0 }}
        healthQueue={{
          staleCount: 2,
          orphanCount: 1,
          promotionCount: 0,
          actionTarget: { slug: "capability:foo", title: "Foo", kind: "stale" },
          builderHref: (slug) => `/ontology/edit/?node=${encodeURIComponent(slug)}`,
          ontologyHref: (slug) => `/ontology/?node=${encodeURIComponent(slug)}`,
        }}
        labels={labels}
      />,
    );

    const target = screen.getByTestId("insights-repair-queue-target");
    expect(target).toHaveTextContent("Stale evidence");
    expect(target).toHaveTextContent("Foo");
    expect(screen.getByTestId("insights-repair-queue-builder-link")).toHaveAttribute(
      "href",
      "/ontology/edit/?node=capability%3Afoo",
    );
  });
});
