import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopologyTrailChip, type TopologyTrailChipLabels } from "./TopologyTrailChip";
import type { FootprintTrailEntry } from "../lib/footprint-trail";

const LABELS: TopologyTrailChipLabels = {
  heading: "걸어온 길",
  triggerAriaLabel: "걸어온 길 열기",
  currentAriaLabel: "지금 여기",
  rowAriaLabel: (title) => `${title}(으)로 이동`,
  copyLabel: "에이전트에게 복사",
  copyAriaLabel: "방문 체인 인계 패킷 복사",
  copyCopiedAriaLabel: "복사됨",
  clearLabel: "지우기",
  clearAriaLabel: "발자국 지우기",
};

const ENTRIES: FootprintTrailEntry[] = [
  { id: "domain:core", title: "Core", kind: "domain" },
  { id: "capability:x", title: "Cap X", kind: "capability" },
  { id: "element:y", title: "El Y", kind: "element" },
];

function renderChip(overrides: Partial<React.ComponentProps<typeof TopologyTrailChip>> = {}) {
  const props = {
    label: "걸은 길 3개",
    entries: ENTRIES,
    currentId: "element:y",
    labels: LABELS,
    onFocusEntry: vi.fn(),
    onCopyPacket: vi.fn(),
    copied: false,
    onClear: vi.fn(),
    ...overrides,
  };
  render(<TopologyTrailChip {...props} />);
  return props;
}

describe("TopologyTrailChip — 걸어온 길 트레일 칩", () => {
  it("칩 라벨을 노출하고 기본은 팝오버가 닫혀 있다", () => {
    renderChip();
    expect(screen.getByTestId("topology-trail-chip-trigger")).toHaveTextContent("걸은 길 3개");
    expect(screen.queryByTestId("topology-trail-chip-popover")).toBeNull();
  });

  it("트리거 클릭 → 미니 타임라인 팝오버가 방문 순서대로 열린다", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const rows = screen.getAllByTestId("topology-trail-row");
    expect(rows.map((r) => r.textContent)).toEqual(["Core", "Cap X", "El Y"]);
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
    fireEvent.click(screen.getAllByTestId("topology-trail-row")[0]);
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
});
