import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Disclosure } from "./disclosure";

describe("Disclosure", () => {
  it("opens through the measured row, not a native details element", () => {
    const { container } = render(<Disclosure summary="Provenance" summaryTestId="toggle"><p>Body</p></Disclosure>);
    expect(container.querySelector("details")).toBeNull();
    const toggle = screen.getByTestId("toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const box = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(box?.classList.contains("ai-row-disclosure")).toBe(true);
    expect(box?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByText("Body")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(box?.getAttribute("data-state")).toBe("open");
    expect(box?.hasAttribute("inert")).toBe(false);
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("makes closing content inert in the same commit", () => {
    render(<Disclosure summary="Provenance" summaryTestId="toggle" open><p>Body</p></Disclosure>);
    const toggle = screen.getByTestId("toggle");
    act(() => fireEvent.click(toggle));
    const box = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(box?.getAttribute("data-state")).toBe("closed");
    expect(box?.hasAttribute("inert")).toBe(true);
  });

  it("starts open when asked", () => {
    render(<Disclosure summary="Provenance" summaryTestId="toggle" open><p>Body</p></Disclosure>);
    expect(screen.getByTestId("toggle").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Body")).toBeTruthy();
  });
});
