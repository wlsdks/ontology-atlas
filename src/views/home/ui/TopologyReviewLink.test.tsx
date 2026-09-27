import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TopologyReviewLink } from "./TopologyReviewLink";
import type { OntologyChangeset } from "@/entities/knowledge-graph/lib/ontology-tree";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function changeset(over: Partial<OntologyChangeset> = {}): OntologyChangeset {
  const addedNodes = over.addedNodes ?? [];
  const changedNodes = over.changedNodes ?? [];
  const removedNodes = over.removedNodes ?? [];
  return {
    addedNodes,
    changedNodes,
    removedNodes,
    addedEdges: over.addedEdges ?? [],
    removedEdges: over.removedEdges ?? [],
    total: over.total ?? addedNodes.length + changedNodes.length + removedNodes.length,
    touchedNodeIds: over.touchedNodeIds ?? new Set([...addedNodes, ...changedNodes]),
    removedNodeKinds: over.removedNodeKinds ?? new Map(),
  };
}

const label = (n: number) => `변경점 ${n}개`;
const ariaLabel = (n: number) => `기준 이후 변경점 ${n}개 — 온톨로지 변경점 패널에서 리뷰`;

describe("TopologyReviewLink re-entry hook", () => {
  it("renders a review pill to /ontology with a count when nodes changed", () => {
    render(
      <TopologyReviewLink
        changeset={changeset({ addedNodes: ["a"], changedNodes: ["b", "c"] })}
        label={label}
        ariaLabel={ariaLabel}
      />,
    );
    const link = screen.getByTestId("topology-review-link");
    expect(link).toHaveTextContent("변경점 3개"); // a + b,c = 3
    expect(link.getAttribute("href")).toContain("/ontology");
    expect(link).toHaveAccessibleName(/온톨로지 변경점 패널/);
    expect(link).toHaveAttribute(
      "data-utility-action-focus-ring-token",
      "--topology-utility-lane-focus-ring",
    );
  });

  it("counts removed nodes too", () => {
    render(
      <TopologyReviewLink
        changeset={changeset({ addedNodes: ["a"], removedNodes: ["x", "y"] })}
        label={label}
        ariaLabel={ariaLabel}
      />,
    );
    expect(screen.getByTestId("topology-review-link")).toHaveTextContent("3");
  });

  it("renders nothing with zero changes", () => {
    const { container } = render(
      <TopologyReviewLink changeset={changeset()} label={label} ariaLabel={ariaLabel} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("topology-review-link")).not.toBeInTheDocument();
  });

  it("renders nothing when only edges changed, counting like the panel chip", () => {
    // An edge change normally marks its from-node; zero node changes exercise the guard directly.
    render(
      <TopologyReviewLink
        changeset={changeset({ addedEdges: ["abx"], total: 1 })}
        label={label}
        ariaLabel={ariaLabel}
      />,
    );
    expect(screen.queryByTestId("topology-review-link")).not.toBeInTheDocument();
  });
});
