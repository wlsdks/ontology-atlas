import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Textarea } from "./input";

describe("Textarea autoGrow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sets its height from the text and stops at maxRows", () => {
    // jsdom has no layout, so scrollHeight is played back; lineHeight comes from the stub.
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      lineHeight: "20px", paddingTop: "8px", paddingBottom: "8px", borderTopWidth: "1px", borderBottomWidth: "1px",
    } as CSSStyleDeclaration);
    let scroll = 60;
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => scroll });
    const { getByLabelText, rerender } = render(<Textarea label="Why" autoGrow maxRows={4} rows={3} value="one line" onChange={() => {}} />);
    const el = getByLabelText("Why") as HTMLTextAreaElement;
    expect(el.style.height).toBe("60px");
    expect(el.style.overflowY).toBe("hidden");
    scroll = 400;
    rerender(<Textarea label="Why" autoGrow maxRows={4} rows={3} value="one line\ntwo\nthree\nfour\nfive\nsix" onChange={() => {}} />);
    // ceiling = 4 rows * 20 + 18 of padding and border
    expect(el.style.height).toBe("98px");
    expect(el.style.overflowY).toBe("auto");
  });

  it("leaves the height alone without autoGrow", () => {
    const { getByLabelText } = render(<Textarea label="Plain" rows={3} value="x" onChange={() => {}} />);
    expect((getByLabelText("Plain") as HTMLTextAreaElement).style.height).toBe("");
  });
});
