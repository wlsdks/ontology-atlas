import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockingSurfaceOpen, useDestinationShortcuts } from "./use-destination-shortcuts";
import { NAV_LEADER_WINDOW_MS } from "@/shared/config/destinations";

/**
 * With a Korean IME active `key` is a jamo and `code` is the physical position; browser e2e types
 * Latin and cannot catch this.
 */
function pressHangul(jamo: string, code: string) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: jamo, code, bubbles: true, cancelable: true }),
  );
}

function press(key: string, target?: Element, extra: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  (target ?? window).dispatchEvent(event);
  return event;
}

describe("useDestinationShortcuts", () => {
  let navigate: ReturnType<typeof vi.fn<(href: string, id: string) => void>>;

  beforeEach(() => {
    navigate = vi.fn();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("the key after the leader takes you to that destination", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("p");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toBe("/projects/");
    expect(navigate.mock.calls[0]?.[1]).toBe("projects");
  });

  it("navigates even with a Korean input method on, judged by the physical key", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    pressHangul("ㅎ", "KeyG"); // leader
    pressHangul("ㅔ", "KeyP"); // projects
    expect(navigate, "does not work while the Korean input method is active").toHaveBeenCalledWith("/projects/", "projects");
  });

  it("G R (architecture) also works under a Korean input method", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    pressHangul("ㅎ", "KeyG");
    pressHangul("ㄱ", "KeyR");
    expect(navigate).toHaveBeenCalledWith("/architecture/", "architecture");
  });

  it("matches by the typed character even when the layout is not QWERTY", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    // On AZERTY, pressing the key printed `G` can report a different `code`.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", code: "KeyZ", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyX", bubbles: true }));
    expect(navigate).toHaveBeenCalledWith("/projects/", "projects");
  });

  it("pressing a letter without the leader does nothing", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("p");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("the leader then i does nothing, since Analysis is no longer a destination", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("i");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("the leader then r goes to architecture", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("r");
    expect(navigate).toHaveBeenCalledWith("/architecture/", "architecture");
  });

  it("the leader then G twice goes to the preserved Git destination", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("g");
    expect(navigate).toHaveBeenCalledWith("/git/", "git");
  });

  it("does not navigate while an input has focus", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const input = document.createElement("input");
    document.body.append(input);
    press("g", input);
    press("p", input);
    expect(navigate, "changed the screen while typing").not.toHaveBeenCalled();
  });

  it("the same holds for a textarea", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const area = document.createElement("textarea");
    document.body.append(area);
    press("g", area);
    press("p", area);
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ `isContentEditable` **has to be faked** — jsdom does not implement it, so it
   * stays `false` even after `contentEditable = "true"` (confirmed by measurement).
   * Without the fake this spec measures jsdom rather than the hook.
   */
  it("the same holds for contentEditable", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    press("g", editable);
    press("p", editable);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("input with a modifier key held is not ours", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g", undefined, { metaKey: true });
    press("p");
    expect(navigate, "took ⌘G as the leader").not.toHaveBeenCalled();
  });

  it("does not navigate while a visible blocking surface is open", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    // jsdom has no layout, so `getClientRects()` is always empty — fake it into
    // looking rendered. Needing this fake is itself the reason the visibility
    // judgement is measured once more in a browser (e2e owns that half).
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    press("g");
    press("p");
    expect(navigate, "changed the screen behind an open modal").not.toHaveBeenCalled();
  });

  it("does not navigate and says so when a blocking surface is open", () => {
    const onBlockedByOverlay = vi.fn();
    renderHook(() => useDestinationShortcuts({ navigate, onBlockedByOverlay }));
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    press("g");
    press("p");
    expect(navigate, "navigated while a modal was open").not.toHaveBeenCalled();
    expect(onBlockedByOverlay, "was blocked but said nothing").toHaveBeenCalledTimes(1);
  });

  it("says nothing for a key that does not name a destination", () => {
    const onBlockedByOverlay = vi.fn();
    renderHook(() => useDestinationShortcuts({ navigate, onBlockedByOverlay }));
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    // Plain typing inside a modal — a hint for every keystroke would be noise.
    for (const key of ["a", "b", "c", "z"]) press(key);
    expect(onBlockedByOverlay, "spoke although no destination was named").not.toHaveBeenCalled();
  });

  /**
   * **A hidden modal must not block.** Without this assertion, nobody catches the
   * state where one exit-animating surface left in the DOM permanently kills every
   * navigation shortcut — a defect this repo actually shipped (see the hook's own
   * comment).
   */
  it("a hidden blocking surface does not block navigation", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const hidden = document.createElement("div");
    hidden.setAttribute("aria-modal", "true");
    // Not rendered = `getClientRects()` is empty (jsdom's default).
    document.body.append(hidden);
    press("g");
    press("p");
    expect(navigate, "a hidden modal blocked navigation").toHaveBeenCalledTimes(1);
  });

  it("a modal inside an aria-hidden ancestor is not counted either", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const wrapper = document.createElement("div");
    wrapper.setAttribute("aria-hidden", "true");
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    wrapper.append(modal);
    document.body.append(wrapper);
    press("g");
    press("p");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  /** Pinned at `timeStamp` 0: some runtimes (WKWebView) report 0, so 0 must not mean "not pressed". */
  it("navigates even when event.timeStamp is 0, since the clock is not read from the event", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    for (const key of ["g", "p"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, "timeStamp", { value: 0 });
      window.dispatchEvent(event);
    }
    expect(navigate, "is relying on the event timeStamp").toHaveBeenCalledWith("/projects/", "projects");
  });

  it("a letter alone does not navigate once the leader was pressed long ago", () => {
    // The clock is `performance.now()` — fake only that.
    vi.useFakeTimers();
    try {
      renderHook(() => useDestinationShortcuts({ navigate }));
      press("g");
      vi.advanceTimersByTime(NAV_LEADER_WINDOW_MS + 50);
      press("p");
      expect(navigate, "the time limit did not apply").not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("navigates within the time limit, proof that the test above does not always pass", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useDestinationShortcuts({ navigate }));
      press("g");
      vi.advanceTimersByTime(Math.floor(NAV_LEADER_WINDOW_MS / 2));
      press("p");
      expect(navigate).toHaveBeenCalledWith("/projects/", "projects");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing when disabled", () => {
    renderHook(() => useDestinationShortcuts({ navigate, disabled: true }));
    press("g");
    press("p");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("goes to the context address when there is one", () => {
    renderHook(() =>
      useDestinationShortcuts({ navigate, hrefOverrides: { docs: "/project/atlas/docs/" } }),
    );
    press("g");
    press("d");
    expect(navigate).toHaveBeenCalledWith("/project/atlas/docs/", "docs");
  });

  /** An alias shortcut is a door exactly while the tile that hosts it is drawn. */
  it("when a placed tile is visible its alias shortcut is a door too: g c through the agent tile, g d through the library tile", () => {
    renderHook(() =>
      useDestinationShortcuts({ navigate, visible: new Set(["map", "agents", "library"]) }),
    );
    press("g");
    press("c");
    expect(navigate).toHaveBeenCalledWith("/agents/?tab=mcp", "mcp");
    press("g");
    press("d");
    expect(navigate).toHaveBeenLastCalledWith("/docs/", "docs");
  });

  it("when a placed tile hides, its alias shortcut closes too", () => {
    renderHook(() => useDestinationShortcuts({ navigate, visible: new Set(["map", "library"]) }));
    press("g");
    press("c");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps the global keydown listener across re-renders and uses the latest destination", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const firstNavigate = vi.fn();
    const secondNavigate = vi.fn();
    const { rerender } = renderHook(
      ({ currentNavigate, docsHref }) =>
        useDestinationShortcuts({
          navigate: currentNavigate,
          hrefOverrides: { docs: docsHref },
        }),
      {
        initialProps: {
          currentNavigate: firstNavigate,
          docsHref: "/project/first/docs/",
        },
      },
    );

    removeListener.mockClear();
    rerender({
      currentNavigate: secondNavigate,
      docsHref: "/project/second/docs/",
    });

    expect(
      removeListener.mock.calls.filter(([type]) => type === "keydown"),
      "the shortcut listener disappeared between AppShell re-renders",
    ).toHaveLength(0);
    press("g");
    press("d");
    expect(firstNavigate).not.toHaveBeenCalled();
    expect(secondNavigate).toHaveBeenCalledWith("/project/second/docs/", "docs");
  });
});

/**
 * A surface on its way out blocks nothing: the guard must not count a closing dialog while its exit
 * motion plays, but a really open modal beside it still blocks.
 */
describe("blockingSurfaceOpen", () => {
  /** An `aria-modal` surface that jsdom reports as laid out, like the ones the tests above fake. */
  function modal(parent: HTMLElement = document.body): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof el.getClientRects;
    parent.append(el);
    return el;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("blocks while a modal is open", () => {
    modal();
    expect(blockingSurfaceOpen()).toBe(true);
  });

  it("blocks while a Radix dialog is open", () => {
    modal().setAttribute("data-state", "open");
    expect(blockingSurfaceOpen()).toBe(true);
  });

  it("does not block once the modal has closed and left the page", () => {
    modal().remove();
    expect(blockingSurfaceOpen()).toBe(false);
  });

  it("does not block while a framer exit plays (useExitLockout pins pointer-events: none)", () => {
    modal().style.pointerEvents = "none";
    expect(blockingSurfaceOpen()).toBe(false);
  });

  it("does not block while a Radix dialog plays its exit (data-state=closed)", () => {
    modal().setAttribute("data-state", "closed");
    expect(blockingSurfaceOpen()).toBe(false);
  });

  it("does not block while a Surface or the settings sheet leaves (inert wrapper)", () => {
    const leaving = document.createElement("div");
    leaving.setAttribute("inert", "");
    document.body.append(leaving);
    modal(leaving);
    expect(blockingSurfaceOpen()).toBe(false);
  });

  it("still blocks when a leaving modal stands beside one that is really open", () => {
    modal().style.pointerEvents = "none";
    modal().setAttribute("data-state", "closed");
    modal();
    expect(blockingSurfaceOpen()).toBe(true);
  });

  it("lets the destination keys through while the only dialog is leaving", () => {
    const navigate = vi.fn();
    renderHook(() => useDestinationShortcuts({ navigate }));
    modal().style.pointerEvents = "none";
    press("g");
    press("p");
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
