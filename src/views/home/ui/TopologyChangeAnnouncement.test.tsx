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

/**
 * The toast sits **below** the top chrome row (owner report, 2026-08-02).
 *
 * The former `top-4` overlapped the chrome pills (y 32–68) by 20px vertically,
 * and since both are centred, completely horizontally. **jsdom has no layout, so
 * no rect can catch this.** What is locked here is therefore not a pixel but the
 * **derivation**: the position must come from the chrome tile height, and must
 * not reuse the chrome row's own constant.
 */
describe("토스트 자리 — 상단 크롬과 겹치지 않는다", () => {
  it("크롬 띠 아래로 파생된 top 을 쓴다 — 고정 top-4 가 아니다", () => {
    const { rerender } = render(
      <TopologyChangeAnnouncement touchedCount={0} message={(n) => `${n}개`} />,
    );
    rerender(<TopologyChangeAnnouncement touchedCount={2} message={(n) => `${n}개`} />);

    const node = screen.getByTestId("topology-change-announcement");
    expect(node.className, "크롬 띠와 같은 자리(top-4)로 되돌아갔다").not.toMatch(
      /(^|\s)top-4(\s|$)/,
    );
    expect(node.className, "top 이 크롬 타일 높이에서 파생되지 않았다").toContain(
      "--chrome-tile-size",
    );
  });
});
