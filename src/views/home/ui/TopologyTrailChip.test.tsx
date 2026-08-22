import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  TopologyTrailChip,
  type TopologyPastWalkRow,
  type TopologyTrailChipLabels,
} from "./TopologyTrailChip";
import type { FootprintTrailEntry } from "../lib/footprint-trail";

const LABELS: TopologyTrailChipLabels = {
  heading: "걸어온 길",
  triggerAriaLabel: "걸어온 길 열기",
  currentLabel: "지금 여기",
  justNowLabel: "방금 전",
  stepsAgoLabel: (count) => `${count}걸음 전`,
  rowAriaLabel: (title) => `${title}(으)로 이동`,
  copyLabel: "AI에게 이어서 맡기기",
  copyAriaLabel: "걸어온 길을 복사해 AI에게 이어서 맡기기",
  copyCopiedAriaLabel: "복사했어요",
  clearLabel: "지우기",
  clearAriaLabel: "걸어온 길 지우기",
  pastLinkLabel: "지난 길 2",
  pastHeading: "지난 길",
  pastBackAriaLabel: "걸어온 길로 돌아가기",
  pastDeleteAriaLabel: "이 길 지우기",
  pastClearAllLabel: "모두 지우기",
  pastClearAllConfirmLabel: "한 번 더 누르면 지워요",
  pastCapCaption: "최근 10개까지",
  pastEmptyBody: "아직 남은 길이 없어요. 지도를 걷고 나면 여기 모여요.",
};

const PAST_WALKS: TopologyPastWalkRow[] = [
  {
    id: "w1",
    routeLabel: "AI 에이전트 파트너 → 화면(뷰)",
    metaLabel: "오늘 · 12곳",
    replayable: true,
    ariaLabel: "이 길 다시 펴기 — 오늘, 12곳",
  },
  {
    id: "w2",
    routeLabel: "Core → El Y",
    metaLabel: "어제 · 4곳",
    replayable: true,
    ariaLabel: "이 길 다시 펴기 — 어제, 4곳",
  },
];

const ENTRIES: FootprintTrailEntry[] = [
  { id: "domain:core", title: "Core", kind: "domain" },
  { id: "capability:x", title: "Cap X", kind: "capability" },
  { id: "element:y", title: "El Y", kind: "element" },
];

function renderChip(overrides: Partial<React.ComponentProps<typeof TopologyTrailChip>> = {}) {
  const props = {
    label: "걸어온 길 · 3",
    entries: ENTRIES,
    currentId: "element:y",
    labels: LABELS,
    onFocusEntry: vi.fn(),
    onCopyPacket: vi.fn(),
    copied: false,
    onClear: vi.fn(),
    pastWalks: PAST_WALKS,
    pastNotice: null,
    onReplayPastWalk: vi.fn(),
    onDeletePastWalk: vi.fn(),
    onClearPastWalks: vi.fn(),
    ...overrides,
  };
  const view = render(<TopologyTrailChip {...props} />);
  return {
    ...props,
    unmount: view.unmount,
    rerenderWith: (next: Partial<React.ComponentProps<typeof TopologyTrailChip>>) =>
      view.rerender(<TopologyTrailChip {...props} {...next} />),
  };
}

describe("TopologyTrailChip — 걸어온 길 트레일 칩", () => {
  it("칩 라벨을 노출하고 기본은 팝오버가 닫혀 있다", () => {
    renderChip();
    expect(screen.getByTestId("topology-trail-chip-trigger")).toHaveTextContent("걸어온 길 · 3");
    expect(screen.queryByTestId("topology-trail-chip-popover")).toBeNull();
  });

  it("트리거 클릭 → 미니 타임라인이 최근 방문을 맨 위로 그린다", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const rows = screen.getAllByTestId("topology-trail-row");
    // The model order (oldest → newest) is reversed in the render only.
    expect(rows.map((r) => r.textContent)).toEqual(["El Y", "Cap X", "Core"]);
  });

  it("행마다 상대 걸음 캡션이 보인다 — 첫 행 '지금 여기', 아래로 n걸음 전", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const steps = screen.getAllByTestId("topology-trail-step-label");
    expect(steps.map((s) => s.textContent)).toEqual(["지금 여기", "1걸음 전", "2걸음 전"]);
  });

  it("현재 포커스가 없으면 최상단은 '방금 전'이고 인디고 점도 없다", () => {
    renderChip({ currentId: null });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const steps = screen.getAllByTestId("topology-trail-step-label");
    expect(steps.map((s) => s.textContent)).toEqual(["방금 전", "1걸음 전", "2걸음 전"]);
    expect(screen.queryByTestId("topology-trail-current-dot")).toBeNull();
  });

  it("현재 위치는 인디고 점으로 표시(kind 글리프 아님)", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    // Of the three visits only the current one gets the indigo dot.
    expect(screen.getAllByTestId("topology-trail-current-dot")).toHaveLength(1);
  });

  it("행 클릭 → 그 노드 포커스", () => {
    const props = renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    // Newest-first, so the top row is the most recent visit.
    fireEvent.click(screen.getAllByTestId("topology-trail-row")[0]);
    expect(props.onFocusEntry).toHaveBeenCalledWith("element:y");
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getAllByTestId("topology-trail-row")[2]);
    expect(props.onFocusEntry).toHaveBeenCalledWith("domain:core");
  });

  it("복사 · 지우기 액션이 콜백을 부른다", () => {
    const props = renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getByTestId("topology-trail-copy-packet"));
    expect(props.onCopyPacket).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("topology-trail-clear-footer"));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("칩 ✕ 도 세션 트레일을 소거한다", () => {
    const props = renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-clear"));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  describe("걸어온 길 렌즈 — 팝오버 열림이 곧 렌즈", () => {
    it("열면 렌즈 on, 닫으면 off (새 모드·토글 없음)", () => {
      const onLensChange = vi.fn();
      renderChip({ onLensChange });
      expect(onLensChange).toHaveBeenLastCalledWith(false);
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onLensChange).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onLensChange).toHaveBeenLastCalledWith(false);
    });

    it("Escape 로 닫아도 렌즈가 꺼진다", () => {
      const onLensChange = vi.fn();
      renderChip({ onLensChange });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onLensChange).toHaveBeenLastCalledWith(false);
    });

    it("열린 채 언마운트돼도 렌즈를 끈다 — 지도가 dim 인 채로 굳지 않게", () => {
      const onLensChange = vi.fn();
      const { unmount } = renderChip({ onLensChange });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onLensChange).toHaveBeenLastCalledWith(true);
      unmount();
      expect(onLensChange).toHaveBeenLastCalledWith(false);
    });

    it("행 hover ↔ 지도 노드 브러싱 — 떼면 해제", () => {
      const onHoverEntry = vi.fn();
      renderChip({ onHoverEntry });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      const rows = screen.getAllByTestId("topology-trail-row");
      // Newest-first, so the second row is one step back.
      fireEvent.mouseEnter(rows[1].parentElement as HTMLElement);
      expect(onHoverEntry).toHaveBeenLastCalledWith("capability:x");
      fireEvent.mouseLeave(rows[1].parentElement as HTMLElement);
      expect(onHoverEntry).toHaveBeenLastCalledWith(null);
    });

    it("키보드 포커스도 같은 브러싱 채널을 쓴다", () => {
      const onHoverEntry = vi.fn();
      renderChip({ onHoverEntry });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      fireEvent.focus(screen.getAllByTestId("topology-trail-row")[0]);
      expect(onHoverEntry).toHaveBeenLastCalledWith("element:y");
    });

    it("팝오버가 닫히면 브러싱도 해제된다", () => {
      const onHoverEntry = vi.fn();
      renderChip({ onHoverEntry });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      fireEvent.mouseEnter(
        screen.getAllByTestId("topology-trail-row")[0].parentElement as HTMLElement,
      );
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onHoverEntry).toHaveBeenLastCalledWith(null);
    });
  });
});

describe("TopologyTrailChip — 지난 길 2층", () => {
  function openPast() {
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getByTestId("topology-trail-past-link"));
  }

  it("보관도 없고 알릴 것도 없으면 1층 헤더에 진입 링크가 없다", () => {
    renderChip({ pastWalks: [] });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    expect(screen.queryByTestId("topology-trail-past-link")).toBeNull();
  });

  it("읽기 전용 볼트면 보관이 0이어도 진입 링크가 있고 이유를 말한다", () => {
    renderChip({ pastWalks: [], pastNotice: "읽기 전용으로 열어서 길이 남지 않아요." });
    openPast();
    expect(screen.getByTestId("topology-trail-past-notice")).toHaveTextContent(
      "읽기 전용으로 열어서",
    );
    expect(screen.getByTestId("topology-trail-past-empty")).toBeTruthy();
  });

  it("정상 보관 중에는 안내 줄이 없다 — 무소음이 기본", () => {
    renderChip();
    openPast();
    expect(screen.queryByTestId("topology-trail-past-notice")).toBeNull();
  });

  it("헤더 링크 → 2층 목록(최근이 앞), 1층 타임라인은 사라진다", () => {
    renderChip();
    openPast();
    const rows = screen.getAllByTestId("topology-trail-past-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("AI 에이전트 파트너 → 화면(뷰)");
    expect(rows[0].textContent).toContain("오늘 · 12곳");
    expect(screen.queryByTestId("topology-trail-row")).toBeNull();
    expect(screen.getByTestId("topology-trail-past-clear-all")).toHaveTextContent("모두 지우기");
    expect(screen.getByTestId("topology-trail-chip-popover")).toHaveTextContent("최근 10개까지");
  });

  it("‹ 뒤로 → 1층 타임라인 복귀", () => {
    renderChip();
    openPast();
    fireEvent.click(screen.getByTestId("topology-trail-past-back"));
    expect(screen.getAllByTestId("topology-trail-row")).toHaveLength(3);
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
  });

  it("팝오버를 닫았다 열면 항상 1층부터", () => {
    renderChip();
    openPast();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
    expect(screen.getAllByTestId("topology-trail-row")).toHaveLength(3);
  });

  it("행 ✕ → 그 길만 삭제 콜백", () => {
    const props = renderChip();
    openPast();
    fireEvent.click(screen.getAllByTestId("topology-trail-past-delete")[1]);
    expect(props.onDeletePastWalk).toHaveBeenCalledWith("w2");
  });

  it("모두 지우기는 2단 확인을 거친다", () => {
    const props = renderChip();
    openPast();
    const button = screen.getByTestId("topology-trail-past-clear-all");
    fireEvent.click(button);
    expect(props.onClearPastWalks).not.toHaveBeenCalled();
    expect(button).toHaveTextContent("한 번 더 누르면 지워요");
    fireEvent.click(button);
    expect(props.onClearPastWalks).toHaveBeenCalledTimes(1);
  });

  it("2단 확인은 4초 뒤 스스로 풀린다", () => {
    vi.useFakeTimers();
    try {
      const props = renderChip();
      openPast();
      const button = screen.getByTestId("topology-trail-past-clear-all");
      fireEvent.click(button);
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(button).toHaveTextContent("모두 지우기");
      fireEvent.click(button);
      expect(props.onClearPastWalks).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("2층에서 다 지우면 빈 상태 문구가 남고 모두 지우기 버튼은 사라진다", () => {
    const props = renderChip();
    openPast();
    props.rerenderWith({ pastWalks: [] });
    expect(screen.getByTestId("topology-trail-past-empty")).toHaveTextContent(
      "아직 남은 길이 없어요",
    );
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
    expect(screen.queryByTestId("topology-trail-past-clear-all")).toBeNull();
    // The cap notice holds its contract even in the empty state.
    expect(screen.getByTestId("topology-trail-chip-popover")).toHaveTextContent("최근 10개까지");
  });

  it("행을 누르면 그 길을 다시 펴고 1층으로 돌아온다", () => {
    const props = renderChip();
    openPast();
    fireEvent.click(screen.getAllByTestId("topology-trail-past-replay")[1]);
    expect(props.onReplayPastWalk).toHaveBeenCalledWith("w2");
    // The replayed trail lives on level 1 — staying on level 2 after replaying
    // would hide the result.
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
    expect(screen.getAllByTestId("topology-trail-row")).toHaveLength(3);
  });

  it("행 aria 는 날짜와 곳 수로 무엇이 열리는지 말한다", () => {
    renderChip();
    openPast();
    expect(screen.getAllByTestId("topology-trail-past-replay")[0]).toHaveAttribute(
      "aria-label",
      "이 길 다시 펴기 — 오늘, 12곳",
    );
  });

  it("지도에서 사라진 길은 버튼이 아니다 — 지우기만 남는다", () => {
    const props = renderChip({
      pastWalks: [
        {
          id: "dead",
          routeLabel: "지워진 곳 → 지워진 곳",
          metaLabel: "지금 지도에 없어요",
          replayable: false,
          ariaLabel: null,
        },
      ],
    });
    openPast();
    const row = screen.getByTestId("topology-trail-past-row");
    expect(row).toHaveAttribute("data-replayable", "false");
    expect(screen.queryByTestId("topology-trail-past-replay")).toBeNull();
    // Only the ✕ is left.
    expect(row.querySelectorAll("button")).toHaveLength(1);
    expect(props.onReplayPastWalk).not.toHaveBeenCalled();
  });

  it("2층을 오갈 때 브러싱이 남지 않는다 — 렌즈는 켜진 채로", () => {
    const onHoverEntry = vi.fn();
    const onLensChange = vi.fn();
    renderChip({ onHoverEntry, onLensChange });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.mouseEnter(
      screen.getAllByTestId("topology-trail-row")[0].parentElement as HTMLElement,
    );
    expect(onHoverEntry).toHaveBeenLastCalledWith("element:y");
    fireEvent.click(screen.getByTestId("topology-trail-past-link"));
    expect(onHoverEntry).toHaveBeenLastCalledWith(null);
    // Switching levels keeps the popover open, so the lens stays on.
    expect(onLensChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByTestId("topology-trail-past-back"));
    expect(onHoverEntry).toHaveBeenLastCalledWith(null);
    expect(onLensChange).toHaveBeenLastCalledWith(true);
  });
});
