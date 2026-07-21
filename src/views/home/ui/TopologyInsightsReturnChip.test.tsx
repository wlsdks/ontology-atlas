import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopologyInsightsReturnChip } from "./TopologyInsightsReturnChip";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  href: "/ontology/insights/?tab=structure",
  label: "인사이트로 돌아가기",
  ariaLabel: "보던 인사이트 탭으로 돌아가기",
  dismissAriaLabel: "인사이트 복귀 칩 닫기",
};

describe("TopologyInsightsReturnChip — 인사이트발 딥링크 복귀 칩", () => {
  it("복귀 링크가 원래 보던 인사이트 탭 href 를 가리킨다", () => {
    render(<TopologyInsightsReturnChip {...baseProps} onDismiss={() => {}} />);

    const link = screen.getByTestId("topology-insights-return-chip-link");
    expect(link).toHaveTextContent("인사이트로 돌아가기");
    expect(link.getAttribute("href")).toBe("/ontology/insights/?tab=structure");
    expect(link).toHaveAccessibleName("보던 인사이트 탭으로 돌아가기");
  });

  it("X dismiss 는 onDismiss 만 부른다 (내비게이션 아님)", () => {
    const onDismiss = vi.fn();
    render(<TopologyInsightsReturnChip {...baseProps} onDismiss={onDismiss} />);

    fireEvent.click(
      screen.getByTestId("topology-insights-return-chip-dismiss"),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
