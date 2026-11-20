import { afterEach, describe, expect, it, vi } from "vitest";

import { insideView, landAtLine, landingTop } from "./reader-landing";

function rect(top: number, height: number, left = 0, width = 600): DOMRect {
  return { top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** A scroller 500px tall at y=100 holding a page; the claim block sits at `claimTop` in the viewport. */
function stage(claimTop: number) {
  const scroller = document.createElement("div");
  const layer = document.createElement("div");
  const article = document.createElement("article");
  article.setAttribute("data-docs-viewer", "");
  const claim = document.createElement("li");
  claim.dataset.line = "12";
  article.append(claim);
  layer.append(article);
  scroller.append(layer);
  document.body.append(scroller);
  Object.defineProperties(scroller, {
    scrollHeight: { value: 4000 },
    clientHeight: { value: 500 },
  });
  scroller.getBoundingClientRect = () => rect(100, 500);
  layer.getBoundingClientRect = () => rect(100, 4000);
  claim.getBoundingClientRect = () => rect(claimTop, 28, 40, 520);
  scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
  /* jsdom has no Web Animations; a fade that never finishes is enough here. */
  HTMLElement.prototype.animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel: () => {} })) as unknown as HTMLElement["animate"];
  return { scroller, layer };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("landing a page at a claim", () => {
  it("needs no scroll for a claim wholly inside the reader", () => {
    expect(insideView({ top: 120, bottom: 150 }, { top: 100, bottom: 600 })).toBe(true);
    expect(insideView({ top: 590, bottom: 618 }, { top: 100, bottom: 600 })).toBe(false);
  });

  it("puts the claim three tenths down the reader, within what can scroll", () => {
    expect(landingTop({ top: 1100 }, { top: 100, height: 500 }, 0, 3500)).toBe(850);
    expect(landingTop({ top: 150 }, { top: 100, height: 500 }, 0, 3500)).toBe(0);
    expect(landingTop({ top: 9000 }, { top: 100, height: 500 }, 0, 3500)).toBe(3500);
  });

  it("scrolls once to a claim below the fold and lays a mark behind it", () => {
    const { scroller, layer } = stage(1100);
    landAtLine(scroller, layer, 12, false);
    expect(scroller.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 850, behavior: "smooth" });
    const mark = layer.querySelector<HTMLElement>("[data-reader-claim-mark]");
    expect(mark?.style.top).toBe("996px");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    // The tint alone: no coloured edge on the row.
    expect(mark?.style.background).toBe("var(--color-indigo-line-a22)");
    expect(mark?.style.boxShadow).toBe("");
    expect(mark?.style.borderLeft).toBe("");
  });

  it("does not scroll for a claim on the first screen", () => {
    const { scroller, layer } = stage(200);
    landAtLine(scroller, layer, 12, false);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
    expect(layer.querySelector("[data-reader-claim-mark]")).not.toBeNull();
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion jumps, shows the mark at once and removes it without a fade", () => {
    vi.useFakeTimers();
    const { scroller, layer } = stage(1100);
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
    landAtLine(scroller, layer, 12, true);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 850, behavior: "auto" });
    expect(layer.querySelector("[data-reader-claim-mark]")).not.toBeNull();
    vi.runAllTimers();
    expect(animate).not.toHaveBeenCalled();
    expect(layer.querySelector("[data-reader-claim-mark]")).toBeNull();
  });

  it("does nothing when the line names no block", () => {
    const { scroller, layer } = stage(200);
    expect(landAtLine(scroller, layer, 99, false)).toBeNull();
    expect(layer.querySelector("[data-reader-claim-mark]")).toBeNull();
  });
});
