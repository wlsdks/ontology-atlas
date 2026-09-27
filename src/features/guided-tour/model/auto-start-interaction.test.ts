import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchGuidedTourAutoStartCancel } from "./auto-start-interaction";

/** The first substantive interaction while the tour waits cancels the firing. */
describe("watchGuidedTourAutoStartCancel", () => {
  beforeEach(() => {
    // jsdom's `document.hasFocus()` defaults to false; imitate a foreground tab.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function openModal() {
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    return modal;
  }

  it("cancels auto start on pointer input over the map", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);

    window.dispatchEvent(new Event("pointerdown"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not count input while a modal is open as cancellation", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);
    const modal = openModal();

    window.dispatchEvent(new Event("pointerdown"));
    expect(onCancel).not.toHaveBeenCalled();

    // The watch stays alive after the sheet closes; the next interaction cancels.
    modal.remove();
    window.dispatchEvent(new Event("pointerdown"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    stop();
  });

  it("does not count a modifier-only key press", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    expect(onCancel).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    stop();
  });

  it("notifies once and detaches itself", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);

    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("pointerdown"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops detecting after dispose", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);
    stop();

    window.dispatchEvent(new Event("pointerdown"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
