import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveActivityBadge } from "./LiveActivityIndicator";

const labels = { live: "LIVE", changedTitle: "3 changed since baseline" };

describe("LiveActivityBadge", () => {
  it("변경 0 — LIVE 만, 카운트 없음", () => {
    render(<LiveActivityBadge changedCount={0} labels={labels} />);
    expect(screen.getByTestId("live-activity-badge")).toHaveTextContent("LIVE");
    expect(screen.queryByTestId("live-activity-count")).not.toBeInTheDocument();
  });

  it("변경 N>0 — LIVE + 카운트", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);
    expect(screen.getByTestId("live-activity-count")).toHaveTextContent("3");
  });

  it("title 은 변경 있을 때 changedTitle, 없을 때 live", () => {
    const { rerender } = render(<LiveActivityBadge changedCount={0} labels={labels} />);
    expect(screen.getByTestId("live-activity-badge")).toHaveAttribute("title", "LIVE");
    rerender(<LiveActivityBadge changedCount={3} labels={labels} />);
    expect(screen.getByTestId("live-activity-badge")).toHaveAttribute("title", "3 changed since baseline");
  });
});
