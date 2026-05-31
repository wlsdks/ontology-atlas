import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TopologyReviewLink } from "./TopologyReviewLink";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";

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

const label = (n: number) => `검토 ${n}`;
const ariaLabel = (n: number) => `기준 이후 ${n}개 변경 — 리뷰`;

describe("TopologyReviewLink — 재진입 훅 (Self-Drawing Diff #5)", () => {
  it("변경(노드)이 있으면 /ontology 로 가는 리뷰 pill 렌더 + 카운트", () => {
    render(
      <TopologyReviewLink
        changeset={changeset({ addedNodes: ["a"], changedNodes: ["b", "c"] })}
        label={label}
        ariaLabel={ariaLabel}
      />,
    );
    const link = screen.getByTestId("topology-review-link");
    expect(link).toHaveTextContent("3"); // a + b,c = 3
    expect(link.getAttribute("href")).toContain("/ontology");
    expect(link).toHaveAccessibleName(/3개 변경/);
  });

  it("removed 노드도 카운트에 포함", () => {
    render(
      <TopologyReviewLink
        changeset={changeset({ addedNodes: ["a"], removedNodes: ["x", "y"] })}
        label={label}
        ariaLabel={ariaLabel}
      />,
    );
    expect(screen.getByTestId("topology-review-link")).toHaveTextContent("3");
  });

  it("변경 0 이면 렌더 안 함 (노이즈 0)", () => {
    const { container } = render(
      <TopologyReviewLink changeset={changeset()} label={label} ariaLabel={ariaLabel} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("topology-review-link")).not.toBeInTheDocument();
  });

  it("엣지만 바뀌어도 노드 변경 0 이면 렌더 안 함 (패널 칩과 같은 셈법)", () => {
    // 실전에선 엣지 변경이 from-노드를 changed 로 만들지만, 노드 변경 0 인 합성
    // changeset 으로 가드를 직접 검증.
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
