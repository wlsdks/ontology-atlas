import { act, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EXIT_TRANSITION, OVERLAY_SPRING, OVERLAY_SPRING_REDUCED } from "@/shared/motion";
import { Dialog } from "./dialog";

// Observes the targets handed to the animation engine; jsdom cannot verify compositor frames.
// The real media-query subscription stays.
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
      div: ({ initial, animate, exit, transition, onAnimationStart: _start, ...props }: ComponentProps<typeof actual.motion.div>) => (
        <div
          {...(props as ComponentProps<"div">)}
          data-motion={JSON.stringify({ initial, animate, exit, transition })}
        />
      ),
    },
  };
});

afterEach(() => vi.restoreAllMocks());

describe("Dialog reduced-motion targets", () => {
  it("tracks a live OS preference change while closed and keeps reduced entry/exit stationary", () => {
    let reduced = false;
    const listeners = new Set<() => void>();
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      media: query,
      get matches() { return reduced; },
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener as () => void),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener as () => void),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    } as MediaQueryList));
    const content = (open: boolean) => <Dialog open={open} onClose={() => {}} aria-label="Motion probe"><button>Close</button></Dialog>;
    const view = render(content(false));
    const setReduced = (next: boolean) => act(() => {
      reduced = next;
      listeners.forEach((listener) => listener());
    });
    const targets = () => JSON.parse(screen.getByRole("dialog").getAttribute("data-motion")!);

    setReduced(true);
    view.rerender(content(true));
    expect(targets()).toEqual({
      initial: { opacity: 0, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 0, transition: EXIT_TRANSITION },
      transition: OVERLAY_SPRING_REDUCED,
    });
    const scrim = JSON.parse(screen.getByRole("dialog").parentElement!.getAttribute("data-motion")!);
    expect(scrim.initial).toEqual({ opacity: 0 });
    expect(scrim.exit).toEqual({ opacity: 0, transition: EXIT_TRANSITION });
    expect(scrim.transition).toEqual(OVERLAY_SPRING_REDUCED);

    setReduced(false);
    expect(targets()).toEqual({
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 8, transition: EXIT_TRANSITION },
      transition: OVERLAY_SPRING,
    });
  });
});
