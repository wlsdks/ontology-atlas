import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  TopologyTrailChip,
  type TopologyPastWalkRow,
  type TopologyTrailChipLabels,
} from "./TopologyTrailChip";
import type { FootprintTrailEntry, TrailStepCaption } from "../lib/footprint-trail";

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
  clearConfirmLabel: "한 번 더 누르면 지워요",
  clearAriaLabel: "걸어온 길 지우기",
  pastLinkLabel: "지난 길 2",
  pastHeading: "지난 길",
  pastBackAriaLabel: "걸어온 길로 돌아가기",
  pastDeleteAriaLabel: "이 길 지우기",
  pastClearAllLabel: "모두 지우기",
  pastClearAllConfirmLabel: "한 번 더 누르면 지워요",
  pastCapCaption: "최근 10개까지",
  pastEmptyBody: "아직 남은 길이 없어요. 지도를 걷고 나면 여기 모여요.",
  stepUnrelatedLabel: "직접 연결 없음",
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

/** Aligned with ENTRIES: the oldest has no predecessor, then a reason, then a bare type. */
const STEP_CAPTIONS: (TrailStepCaption | null)[] = [
  null,
  { relationLabel: "포함", reason: "Core 는 이 능력을 품는다" },
  { relationLabel: "의존", reason: null },
];

function renderChip(overrides: Partial<React.ComponentProps<typeof TopologyTrailChip>> = {}) {
  const props = {
    label: "걸어온 길 · 3",
    entries: ENTRIES,
    stepCaptions: STEP_CAPTIONS,
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

describe("TopologyTrailChip walked-trail chip", () => {
  it("shows the chip label with the popover closed by default", () => {
    renderChip();
    expect(screen.getByTestId("topology-trail-chip-trigger")).toHaveTextContent("걸어온 길 · 3");
    expect(screen.queryByTestId("topology-trail-chip-popover")).toBeNull();
  });

  it("clicking the trigger draws a mini timeline newest first", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const rows = screen.getAllByTestId("topology-trail-row");
    // The model order (oldest → newest) is reversed in the render only.
    expect(rows.map((r) => r.textContent)).toEqual(["El Y", "Cap X", "Core"]);
  });

  it("each row shows a relative step caption: here now on top, n steps ago below", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const steps = screen.getAllByTestId("topology-trail-step-label");
    expect(steps.map((s) => s.textContent)).toEqual(["지금 여기", "1걸음 전", "2걸음 전"]);
  });

  it("without a current focus the top row reads just now and has no indigo dot", () => {
    renderChip({ currentId: null });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const steps = screen.getAllByTestId("topology-trail-step-label");
    expect(steps.map((s) => s.textContent)).toEqual(["방금 전", "1걸음 전", "2걸음 전"]);
    expect(screen.queryByTestId("topology-trail-current-dot")).toBeNull();
  });

  /**
   * The trail listed names and distances only, which records where the reader went and
   * loses why they could go there — while the reason (`relation_notes`) is the durable
   * thing this vault keeps. Newest-first, so the captions come back in reverse too.
   */
  it("each row says how it connects to the step before it", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const links = screen.getAllByTestId("topology-trail-step-link");
    expect(links.map((l) => l.textContent)).toEqual([
      // El Y — a real edge with no reason recorded: the relation word alone.
      "의존",
      // Cap X — a real edge with a reason.
      "포함 · Core 는 이 능력을 품는다",
      // Core is the oldest step: no predecessor, so the slot stays empty.
      "",
    ]);
  });

  it("says 'not directly related' rather than hiding the gap", () => {
    renderChip({ stepCaptions: [null, null, null] });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const links = screen.getAllByTestId("topology-trail-step-link");
    expect(links.map((l) => l.textContent)).toEqual(["직접 연결 없음", "직접 연결 없음", ""]);
  });

  /** Equal-height rule: a row without a caption keeps the slot, or the list goes ragged. */
  it("keeps one row height whether or not a caption exists", () => {
    renderChip({ stepCaptions: [null, { relationLabel: "포함", reason: "이유" }, null] });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const rows = screen.getAllByTestId("topology-trail-step-link").map((l) => l.closest("li")!);
    expect(new Set(rows.map((r) => r.className)).size).toBe(1);
    expect(rows[0].className).toContain("h-[42px]");
  });

  it("marks the current position with an indigo dot instead of a kind glyph", () => {
    renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    // Of the three visits only the current one gets the indigo dot.
    expect(screen.getAllByTestId("topology-trail-current-dot")).toHaveLength(1);
  });

  it("clicking a row focuses that node", () => {
    const props = renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    // Newest-first, so the top row is the most recent visit.
    fireEvent.click(screen.getAllByTestId("topology-trail-row")[0]);
    expect(props.onFocusEntry).toHaveBeenCalledWith("element:y");
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getAllByTestId("topology-trail-row")[2]);
    expect(props.onFocusEntry).toHaveBeenCalledWith("domain:core");
  });

  it("copy takes one press and clear takes two, so one slip does not lose the walk", () => {
    const props = renderChip();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getByTestId("topology-trail-copy-packet"));
    expect(props.onCopyPacket).toHaveBeenCalledTimes(1);

    const footer = screen.getByTestId("topology-trail-clear-footer");
    fireEvent.click(footer);
    expect(props.onClear, "the first press cleared immediately").not.toHaveBeenCalled();
    expect(footer).toHaveTextContent("한 번 더 누르면 지워요");
    fireEvent.click(footer);
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("the chip close uses the same two steps and both controls share one state", () => {
    const props = renderChip();
    const x = screen.getByTestId("topology-trail-chip-clear");
    fireEvent.click(x);
    expect(props.onClear).not.toHaveBeenCalled();
    // Arming the popover, not the button: the footer says it too.
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    expect(screen.getByTestId("topology-trail-clear-footer")).toHaveTextContent("한 번 더 누르면 지워요");
    fireEvent.click(screen.getByTestId("topology-trail-chip-clear"));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  /*
   * The armed state is a real state of the control, so it has to be visible on the control a
   * reader is looking at. The ✕ changed only its `aria-label`: a sighted person pressed it, saw
   * nothing move — the popover it arms may not even be open — and pressed again, which is the
   * discard the two-press design exists to prevent.
   */
  it("the armed chip close shows it visually, not only in aria-label", () => {
    renderChip();
    const x = screen.getByTestId("topology-trail-chip-clear");
    const resting = x.className;
    const restingGlyph = x.querySelector("svg")?.getAttribute("class");
    fireEvent.click(x);
    expect(x.dataset.armed).toBe("true");
    expect(x.className, "class is unchanged after arming").not.toBe(resting);
    expect(x.querySelector("svg")?.getAttribute("class"), "glyph is unchanged after arming").not.toBe(restingGlyph);
  });

  it("the session trail two-step confirm resets itself after 4 seconds", () => {
    vi.useFakeTimers();
    try {
      const props = renderChip();
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      const footer = screen.getByTestId("topology-trail-clear-footer");
      fireEvent.click(footer);
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(footer).toHaveTextContent("지우기");
      fireEvent.click(footer);
      expect(props.onClear).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("walked-trail lens: an open popover is the lens", () => {
    it("opening turns the lens on and closing turns it off, with no new mode or toggle", () => {
      const onLensChange = vi.fn();
      renderChip({ onLensChange });
      expect(onLensChange).toHaveBeenLastCalledWith(false);
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onLensChange).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onLensChange).toHaveBeenLastCalledWith(false);
    });

    it("closing with Escape turns the lens off", () => {
      const onLensChange = vi.fn();
      renderChip({ onLensChange });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onLensChange).toHaveBeenLastCalledWith(false);
    });

    it("unmounting while open turns the lens off so the map does not stay dimmed", () => {
      const onLensChange = vi.fn();
      const { unmount } = renderChip({ onLensChange });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      expect(onLensChange).toHaveBeenLastCalledWith(true);
      unmount();
      expect(onLensChange).toHaveBeenLastCalledWith(false);
    });

    it("row hover brushes the map node and releases on leave", () => {
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

    it("keyboard focus uses the same brushing channel", () => {
      const onHoverEntry = vi.fn();
      renderChip({ onHoverEntry });
      fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
      fireEvent.focus(screen.getAllByTestId("topology-trail-row")[0]);
      expect(onHoverEntry).toHaveBeenLastCalledWith("element:y");
    });

    it("closing the popover releases the brushing", () => {
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

describe("TopologyTrailChip past trails second layer", () => {
  function openPast() {
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getByTestId("topology-trail-past-link"));
  }

  it("no entry link in the first-layer header without saved trails or notices", () => {
    renderChip({ pastWalks: [] });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    expect(screen.queryByTestId("topology-trail-past-link")).toBeNull();
  });

  it("a read-only vault shows the entry link with a reason even with zero saved trails", () => {
    renderChip({ pastWalks: [], pastNotice: "읽기 전용으로 열어서 길이 남지 않아요." });
    openPast();
    expect(screen.getByTestId("topology-trail-past-notice")).toHaveTextContent(
      "읽기 전용으로 열어서",
    );
    expect(screen.getByTestId("topology-trail-past-empty")).toBeTruthy();
  });

  it("normal saving shows no notice line, silence is the default", () => {
    renderChip();
    openPast();
    expect(screen.queryByTestId("topology-trail-past-notice")).toBeNull();
  });

  it("the header link opens the second-layer list newest first and hides the first-layer timeline", () => {
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

  it("back returns to the first-layer timeline", () => {
    renderChip();
    openPast();
    fireEvent.click(screen.getByTestId("topology-trail-past-back"));
    expect(screen.getAllByTestId("topology-trail-row")).toHaveLength(3);
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
  });

  it("reopening the popover always starts at the first layer", () => {
    renderChip();
    openPast();
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
    expect(screen.getAllByTestId("topology-trail-row")).toHaveLength(3);
  });

  it("a row close deletes only that trail", () => {
    const props = renderChip();
    openPast();
    fireEvent.click(screen.getAllByTestId("topology-trail-past-delete")[1]);
    expect(props.onDeletePastWalk).toHaveBeenCalledWith("w2");
  });

  it("clear all goes through a two-step confirm", () => {
    const props = renderChip();
    openPast();
    const button = screen.getByTestId("topology-trail-past-clear-all");
    fireEvent.click(button);
    expect(props.onClearPastWalks).not.toHaveBeenCalled();
    expect(button).toHaveTextContent("한 번 더 누르면 지워요");
    fireEvent.click(button);
    expect(props.onClearPastWalks).toHaveBeenCalledTimes(1);
  });

  it("the two-step confirm resets itself after 4 seconds", () => {
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

  it("clearing everything in the second layer leaves the empty-state copy and removes clear all", () => {
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

  it("pressing a row reopens that trail and returns to the first layer", () => {
    const props = renderChip();
    openPast();
    fireEvent.click(screen.getAllByTestId("topology-trail-past-replay")[1]);
    expect(props.onReplayPastWalk).toHaveBeenCalledWith("w2");
    // The replayed trail lives on level 1 — staying on level 2 after replaying
    // would hide the result.
    expect(screen.queryByTestId("topology-trail-past-row")).toBeNull();
    expect(screen.getAllByTestId("topology-trail-row")).toHaveLength(3);
  });

  it("row aria states the date and place count of what opens", () => {
    renderChip();
    openPast();
    expect(screen.getAllByTestId("topology-trail-past-replay")[0]).toHaveAttribute(
      "aria-label",
      "이 길 다시 펴기 — 오늘, 12곳",
    );
  });

  it("a trail gone from the map is not a button, only delete remains", () => {
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

  it("moving between layers leaves no brushing and keeps the lens on", () => {
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
