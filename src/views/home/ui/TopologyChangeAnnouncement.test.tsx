import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { TopologyChangeAnnouncement } from "./TopologyChangeAnnouncement";

const message = (count: number) => `개념 ${count}개 갱신됨 — 반영됨`;

describe("TopologyChangeAnnouncement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing on first mount (baseline capture, no false 'just updated')", () => {
    const { container } = render(
      <TopologyChangeAnnouncement touchedCount={3} message={message} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("announces the delta once the touched count grows on a later render", () => {
    const { rerender } = render(
      <TopologyChangeAnnouncement touchedCount={2} message={message} />,
    );
    rerender(<TopologyChangeAnnouncement touchedCount={5} message={message} />);

    expect(screen.getByTestId("topology-change-announcement")).toHaveTextContent(
      "개념 3개 갱신됨 — 반영됨",
    );
  });

  it("auto-dismisses after 4 seconds", () => {
    const { rerender } = render(
      <TopologyChangeAnnouncement touchedCount={0} message={message} />,
    );
    rerender(<TopologyChangeAnnouncement touchedCount={1} message={message} />);
    expect(screen.getByTestId("topology-change-announcement")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByTestId("topology-change-announcement")).not.toBeInTheDocument();
  });

  it("stays silent when the count does not grow", () => {
    const { rerender } = render(
      <TopologyChangeAnnouncement touchedCount={4} message={message} />,
    );
    rerender(<TopologyChangeAnnouncement touchedCount={4} message={message} />);
    expect(screen.queryByTestId("topology-change-announcement")).not.toBeInTheDocument();
  });
});
