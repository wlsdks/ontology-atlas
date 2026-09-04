import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTourOverlay } from "./GuidedTourOverlay";
import { useGuidedTour } from "../model/use-guided-tour";
import { GUIDED_TOUR_STATUS_KEY } from "../model/tour-storage";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

function Harness({
  hasSelection = false,
  onActivateAnchor,
}: {
  hasSelection?: boolean;
  onActivateAnchor?: () => void;
}) {
  const ref = createRef<HTMLDivElement>();
  const tour = useGuidedTour({ hasSelection, canResolveAnchor: () => true });
  return (
    <div>
      <button type="button" data-testid="test-start" onClick={tour.start}>
        start
      </button>
      <div ref={ref} data-testid="test-canvas-anchor" />
      <GuidedTourOverlay
        tour={tour}
        canvasAnchorRef={ref}
        onActivateAnchor={onActivateAnchor}
      />
    </div>
  );
}

afterEach(() => {
  window.localStorage.removeItem(GUIDED_TOUR_STATUS_KEY);
  vi.useRealTimers();
});

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 900 });
});

describe("GuidedTourOverlay", () => {
  it("renders nothing before start()", () => {
    render(<Harness />);
    expect(screen.queryByTestId("guided-tour-overlay")).not.toBeInTheDocument();
  });

  it("renders the welcome step with a full scrim (no cutout) and a blocking blocker", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());

    const overlay = screen.getByTestId("guided-tour-overlay");
    expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    expect(screen.getByTestId("guided-tour-scrim")).toBeInTheDocument();
    expect(screen.queryByTestId("guided-tour-cutout")).not.toBeInTheDocument();
    expect(screen.getByTestId("guided-tour-blocker")).toHaveAttribute("data-blocking", "true");
  });

  it("moves focus into the dialog card on open and restores it to the trigger on skip", () => {
    render(<Harness />);
    const startBtn = screen.getByTestId("test-start");
    act(() => {
      startBtn.focus();
      startBtn.click();
    });
    expect(document.activeElement).toBe(screen.getByTestId("guided-tour-card"));

    act(() => screen.getByTestId("guided-tour-skip").click());
    expect(screen.queryByTestId("guided-tour-overlay")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(startBtn);
  });

  it("traps Tab and Shift+Tab inside the current tour card", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());

    const skip = screen.getByTestId("guided-tour-skip");
    const next = screen.getByTestId("guided-tour-next");
    next.focus();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(skip);

    act(() => {
      skip.focus();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(next);
  });

  it("shows progress dots matching visibleSteps.length, one active", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());

    const dots = screen.getAllByTestId("guided-tour-dot");
    expect(dots.length).toBeGreaterThan(0);
    const active = dots.filter((d) => d.getAttribute("data-active") === "true");
    expect(active).toHaveLength(1);
  });

  it("keeps a FULL blocking blocker on the interactive step while the canvas anchor hole is unresolved", () => {
    // jsdom's anchor probe is zero-size → the hole cannot resolve → the full-block
    // fallback stays (2026-07-23 correction — the old contract's blanket
    // `pointer-events-none` allowed other transient surfaces to stack over the tour).
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    // advance welcome -> nodes -> relations -> try-click
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());

    const overlay = screen.getByTestId("guided-tour-overlay");
    expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    expect(screen.getByTestId("guided-tour-blocker")).toHaveAttribute("data-blocking", "true");
    expect(screen.queryAllByTestId("guided-tour-blocker-strip")).toHaveLength(0);
    expect(screen.getByTestId("guided-tour-waiting")).toBeInTheDocument();
  });

  it("offers a keyboard-operable equivalent for the interactive canvas-node step", () => {
    const onActivateAnchor = vi.fn();
    render(<Harness onActivateAnchor={onActivateAnchor} />);
    act(() => screen.getByTestId("test-start").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());

    const action = screen.getByTestId("guided-tour-activate-target");
    expect(action.tagName).toBe("BUTTON");
    act(() => action.click());
    expect(onActivateAnchor).toHaveBeenCalledTimes(1);
  });

  it("swaps to a 4-strip funnel blocker + circular cutout once the canvas anchor hole resolves", () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    expect(screen.getByTestId("guided-tour-overlay")).toHaveAttribute("data-tour-step", "try-click");

    // Stub the anchor probe with a real circle rect → the next frame's tick reads it.
    const probe = screen.getByTestId("test-canvas-anchor");
    probe.getBoundingClientRect = () =>
      ({ top: 400, left: 700, width: 48, height: 48, right: 748, bottom: 448, x: 700, y: 400, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });

    const strips = screen.getAllByTestId("guided-tour-blocker-strip");
    expect(strips).toHaveLength(4);
    expect(screen.queryByTestId("guided-tour-blocker")).not.toBeInTheDocument();
    const cutout = screen.getByTestId("guided-tour-cutout");
    expect(cutout).toHaveAttribute("data-cutout-shape", "circle");
    // The strip height above the hole = cutout top − 16px padding (hardening
    // 2026-07-24 — the funnel hole is opened 16px wider on every side than the probe
    // rect to absorb momentary error against the visual node during the camera spring).
    expect(strips[0].style.height).toBe("384px");
  });

  it("keeps the full scrim and the button fallback when the canvas anchor projects outside the viewport", () => {
    // Round 4, 2026-09-04. The probe has a real size but the domain it tracks is
    // panned off-screen, so a cutout drawn at that rect is invisible and the copy
    // ("one dot keeps a ring around it and stays lit") describes nothing on screen.
    // An off-viewport anchor must read as unresolved, exactly as the testid path
    // already reads it, so the full-block fallback and the card button stay.
    vi.useFakeTimers();
    const onActivateAnchor = vi.fn();
    render(<Harness onActivateAnchor={onActivateAnchor} />);
    act(() => screen.getByTestId("test-start").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    expect(screen.getByTestId("guided-tour-overlay")).toHaveAttribute("data-tour-step", "try-click");

    const probe = screen.getByTestId("test-canvas-anchor");
    probe.getBoundingClientRect = () =>
      ({ top: 400, left: 1600, width: 48, height: 48, right: 1648, bottom: 448, x: 1600, y: 400, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });

    expect(screen.queryAllByTestId("guided-tour-blocker-strip")).toHaveLength(0);
    expect(screen.getByTestId("guided-tour-blocker")).toHaveAttribute("data-blocking", "true");
    expect(screen.queryByTestId("guided-tour-cutout")).not.toBeInTheDocument();
    expect(screen.getByTestId("guided-tour-scrim")).toBeInTheDocument();
    expect(screen.getByTestId("guided-tour-activate-target")).toBeInTheDocument();
  });

  it("applies the reduced-motion utility class to the scrim and cutout so transitions are removed for those users", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    expect(screen.getByTestId("guided-tour-scrim").className).toContain("motion-reduce:transition-none");
  });

  /**
   * The **return** axis of modality — "traps Tab" above measures the wrap inside the
   * card, while this measures whether focus that is already **outside** comes back.
   *
   * Why it is needed separately: the scrim blocks the pointer but cannot block a
   * programmatic `focus()` (no trap can, and none needs to). So focus can end up
   * outside the tour through a route change, an autofocus, or browser restoration,
   * and if Tab then kept walking outside, a control unreachable by pointer could be
   * activated by keyboard alone. Checking only the wrap lets that route pass.
   */
  it("포커스가 이미 투어 밖에 있어도 Tab 이 투어 안으로 되돌린다", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());

    const outside = screen.getByTestId("test-start");
    act(() => outside.focus());
    expect(document.activeElement).toBe(outside);

    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      ),
    );

    // The trap's scope is **the overlay**, not the card (GuidedTourOverlay owns it).
    expect(
      screen.getByTestId("guided-tour-overlay").contains(document.activeElement),
    ).toBe(true);
  });
  /**
   * **[back] does not disappear per step** (regression guard from dogfooding 2026-07-29).
   *
   * The draft wrapped the whole back/next row in `!isInteractive`, so "Previous" —
   * present at the bottom left for five steps — **vanished silently** on 4/7 ("try
   * pressing it yourself"), and the user had to relearn on the spot whether this
   * tour can go back. How to go forward may differ per step (next, try it, choose a
   * branch), but **there is no reason for how to go back to differ.**
   *
   * This check walks into steps that cannot be passed with `next`, so if the
   * interactive step's forward path (activating the anchor) dies, it breaks here too.
   */
  it("모든 단계에서 「이전」이 자리를 지킨다 — 대화형 단계 포함", () => {
    const onActivateAnchor = vi.fn();
    const { rerender } = render(<Harness onActivateAnchor={onActivateAnchor} />);
    act(() => screen.getByTestId("test-start").click());

    let guard = 0;
    const seen: string[] = [];
    for (;;) {
      if (guard++ > 20) throw new Error("투어가 끝나지 않는다 — 무한 루프 가드");
      const overlay = screen.queryByTestId("guided-tour-overlay");
      if (!overlay) break;
      const stepId = overlay.getAttribute("data-tour-step") ?? "?";
      seen.push(stepId);

    // Only the first step is disabled; after that it must exist on every step.
      const back = screen.queryByTestId("guided-tour-back");
      expect(back, `단계 "${stepId}" 에 「이전」이 없다`).toBeInTheDocument();

      const next = screen.queryByTestId("guided-tour-next");
      if (next) {
        act(() => next.click());
        continue;
      }
      const action = screen.queryByTestId("guided-tour-activate-target");
      if (action) {
    // Redraw with a selection created by pressing the anchor — the real user's path.
        rerender(<Harness hasSelection onActivateAnchor={onActivateAnchor} />);
        const advanced = screen.queryByTestId("guided-tour-next");
        if (advanced) {
          act(() => advanced.click());
          rerender(<Harness onActivateAnchor={onActivateAnchor} />);
          continue;
        }
      }
      break;
    }

    // A probe against the detector being silently defeated — confirms it really walked
    // into the interactive step. Had it stopped at the first step, the assertion above
    // would have run once and passed.
    expect(seen.length, `걸은 단계: ${seen.join(" → ")}`).toBeGreaterThanOrEqual(4);
  });
});
