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
 * 토스트는 상단 크롬 **아래**에 선다 (2026-08-02, 소유자 실보고).
 *
 * 종전 `top-4` 는 크롬 필(y 32–68)과 세로 20px 겹쳤고 둘 다 가운데 정렬이라
 * 가로로는 완전히 포개졌다. **이건 jsdom 에서 rect 로 못 잡는다** — 레이아웃이
 * 없기 때문이다. 그래서 잠그는 것은 픽셀이 아니라 **파생 관계**다: 이 자리가
 * 크롬 타일 높이에서 파생돼야 하고, 크롬 띠와 같은 상수를 쓰면 안 된다.
 */
describe("토스트 자리 — 상단 크롬과 겹치지 않는다", () => {
  /**
   * 종전 `top-4` 는 크롬 필(y 32–68)과 세로 20px 겹쳤고, 둘 다 `left-1/2`
   * 가운데 정렬이라 가로로는 완전히 포개졌다(2026-08-02 소유자 실보고).
   *
   * **jsdom 은 레이아웃이 없어 rect 로 못 잡는다.** 그래서 잠그는 것은 픽셀이
   * 아니라 **파생 관계**다: 이 자리는 크롬 타일 높이에서 나와야 하고, 크롬 띠와
   * 같은 고정 상수를 쓰면 안 된다.
   */
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
