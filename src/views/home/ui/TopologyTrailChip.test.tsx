import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopologyTrailChip, type TopologyTrailChipLabels } from "./TopologyTrailChip";
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
};

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
    ...overrides,
  };
  const view = render(<TopologyTrailChip {...props} />);
  return { ...props, unmount: view.unmount };
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
    // 모델 순서(오래된 → 최근)를 렌더에서만 뒤집는다.
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
    // 방문 3개 중 현재(element:y) 하나만 인디고 점.
    expect(screen.getAllByTestId("topology-trail-current-dot")).toHaveLength(1);
  });

  it("행 클릭 → 그 노드 포커스", () => {
    const props = renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    // 최신순이므로 첫 행 = 가장 최근 방문.
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
      // 최신순이라 2번째 행 = "1걸음 전".
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
