import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTourOverlay } from "./GuidedTourOverlay";
import { useGuidedTour } from "../model/use-guided-tour";
import { GUIDED_TOUR_STATUS_KEY } from "../model/tour-storage";
import { EXIT_WINDOW_MS } from "@/shared/lib/use-presence";

vi.mock("next-intl", () => ({
  useLocale: () => 'en',
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

    vi.useFakeTimers();
    act(() => screen.getByTestId("guided-tour-skip").click());
    // Focus returns at once; the overlay leaves through an inert exit window.
    expect(document.activeElement).toBe(startBtn);
    const leaving = screen.getByTestId("guided-tour-overlay");
    expect(leaving).toHaveAttribute("data-state", "closed");
    expect(leaving).toHaveAttribute("inert");
    act(() => {
      vi.advanceTimersByTime(EXIT_WINDOW_MS);
    });
    expect(screen.queryByTestId("guided-tour-overlay")).not.toBeInTheDocument();
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

/**
 * **The card must not open on top of the node it lights.**
 *
 * Measured at 1200×863: entering the interactive step painted the card at x 420–780,
 * y 307–555 — the placement function's "no target" case, a card centred on the window — with
 * the lit node inside that rectangle, and it moved aside only on the next animation frame.
 * The rAF tick that follows the node is an effect, so the step's *first* paint had no rect at
 * all; the probe already carried the map's last frame, so there was one to read.
 *
 * Two properties are locked here, and they are the same defect from both ends: the opening
 * paint reads the probe, and the placement it produces clears the node.
 */
describe("GuidedTourOverlay · the interactive card opens clear of the lit node", () => {
  /** The map's probe div, projected onto a node at the centre of a 1200×863 window. */
  const LIT_NODE = { top: 391, left: 560, width: 80, height: 80 };

  function stubProbe() {
    const probe = screen.getByTestId("test-canvas-anchor");
    probe.getBoundingClientRect = () =>
      ({
        top: LIT_NODE.top,
        left: LIT_NODE.left,
        width: LIT_NODE.width,
        height: LIT_NODE.height,
        right: LIT_NODE.left + LIT_NODE.width,
        bottom: LIT_NODE.top + LIT_NODE.height,
        x: LIT_NODE.left,
        y: LIT_NODE.top,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  it("places the opening card off the node instead of centring it on the window", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 863 });
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    // The map writes the probe from the moment the first canvas-node step lights a node, so it
    // is already projected when the interactive step opens. Stub it before walking in.
    stubProbe();
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    expect(screen.getByTestId("guided-tour-overlay")).toHaveAttribute("data-tour-step", "try-click");

    // No frame is advanced: this is the step's opening paint.
    const card = screen.getByTestId("guided-tour-card");
    const left = Number.parseFloat(card.style.left);
    const top = Number.parseFloat(card.style.top);
    const width = 360;
    const height = 250;
    const overlaps =
      left < LIT_NODE.left + LIT_NODE.width &&
      left + width > LIT_NODE.left &&
      top < LIT_NODE.top + LIT_NODE.height &&
      top + height > LIT_NODE.top;
    expect(
      overlaps,
      `첫 프레임 카드(${left},${top})가 켜진 노드(${JSON.stringify(LIT_NODE)})를 덮는다`,
    ).toBe(false);
    // The centred fallback is the exact rectangle that was reported; it must not be what opens.
    expect(left).not.toBeCloseTo((1200 - width) / 2, 0);
  });
});
