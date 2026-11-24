import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TopologyTrailChip, type TopologyTrailChipLabels } from "./TopologyTrailChip";
import type { FootprintTrailEntry, TrailStepCaption } from "../../lib/trail/footprint-trail";

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
  stepUnrelatedLabel: "직접 연결 없음",
};

const ENTRIES: FootprintTrailEntry[] = [
  { id: "domain:core", title: "Core", kind: "domain", slug: "domains/core" },
  { id: "capability:x", title: "Cap X", kind: "capability", slug: "capabilities/x" },
  { id: "element:y", title: "El Y", kind: "element", slug: "elements/y" },
];

/** The oldest has no predecessor, then a reason, then a bare type. */
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
    // Model order is reversed in the render only.
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

  /** Each row carries why it followed the last (`relation_notes`); captions come back newest-first. */
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

  it("says 'not directly related' for a real move across no edge rather than hiding the gap", () => {
    renderChip({ stepCaptions: [null, "unrelated", "unrelated"] });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const links = screen.getAllByTestId("topology-trail-step-link");
    expect(links.map((l) => l.textContent)).toEqual(["직접 연결 없음", "직접 연결 없음", ""]);
  });

  /** A row reached from somewhere other than the row below it claims nothing about that move. */
  it("leaves the caption empty when the step did not come from the row below", () => {
    renderChip({ stepCaptions: [null, null, { relationLabel: "의존", reason: null }] });
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    const links = screen.getAllByTestId("topology-trail-step-link");
    expect(links.map((l) => l.textContent)).toEqual(["의존", "", ""]);
  });

  /** A row without a caption keeps the slot, or the list goes ragged. */
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
    // The popover footer arms it too.
    fireEvent.click(screen.getByTestId("topology-trail-chip-trigger"));
    expect(screen.getByTestId("topology-trail-clear-footer")).toHaveTextContent("한 번 더 누르면 지워요");
    fireEvent.click(screen.getByTestId("topology-trail-chip-clear"));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  // The ✕ once changed only its `aria-label`, so a sighted person pressed twice and discarded the
  // trail.
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
