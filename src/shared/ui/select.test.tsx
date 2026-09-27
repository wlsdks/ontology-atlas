import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Select, type SelectOption } from "./select";

const OPTIONS: SelectOption[] = [
  { value: "capability", label: "역량", description: "coherent behavior" },
  { value: "element", label: "요소" },
  { value: "domain", label: "도메인" },
];

function Harness({ initial = "", onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={OPTIONS}
      placeholder="종류 선택"
      ariaLabel="종류"
      data-testid="kind"
    />
  );
}

describe("Select — trigger + roles", () => {
  it("renders a combobox trigger with placeholder when unselected", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "종류" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveTextContent("종류 선택");
  });

  it("shows the selected option label on the trigger", () => {
    render(<Harness initial="element" />);
    expect(screen.getByRole("combobox", { name: "종류" })).toHaveTextContent("요소");
  });

  it("has no listbox in the DOM until opened", () => {
    render(<Harness />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Select — open / close", () => {
  it("opens on click and renders one option per item with roles", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  });

  it("marks the selected option aria-selected", () => {
    render(<Harness initial="domain" />);
    fireEvent.click(screen.getByRole("combobox"));
    const selected = screen.getByRole("option", { name: /도메인/ });
    expect(selected).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on outside pointer down", () => {
    render(
      <div>
        <Harness />
        <button type="button">밖</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "밖" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Select — selection", () => {
  it("selects an option on click and fires onChange", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /요소/ }));
    expect(onChange).toHaveBeenCalledWith("element");
    expect(screen.getByRole("combobox")).toHaveTextContent("요소");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Select — keyboard navigation", () => {
  it("opens with ArrowDown and sets aria-activedescendant", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-activedescendant");
  });

  it("ArrowDown then Enter commits the next option", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" }); // open, active 0
    fireEvent.keyDown(trigger, { key: "ArrowDown" }); // active 1
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("element");
  });

  it("Home / End jump to first / last active option", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" }); // open
    fireEvent.keyDown(trigger, { key: "End" });
    const last = screen.getByRole("option", { name: /도메인/ });
    expect(last).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(trigger, { key: "Home" });
    const first = screen.getByRole("option", { name: /역량/ });
    expect(first).toHaveAttribute("data-active", "true");
  });

  it("type-ahead highlights the matching option when open", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" }); // open
    fireEvent.keyDown(trigger, { key: "도" });
    expect(screen.getByRole("option", { name: /도메인/ })).toHaveAttribute("data-active", "true");
  });
});

describe("Select — disabled", () => {
  it("does not open when disabled", () => {
    render(
      <Select value="" onChange={() => {}} options={OPTIONS} ariaLabel="종류" disabled />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

/**
 * An `overflow: hidden` ancestor (`.ai-row-disclosure`, which needs it for its height
 * transition) clipped the list, so the list must render outside it.
 */
describe("Select listbox lives outside clipping ancestors", () => {
  it("portals the listbox under body rather than the trigger subtree", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it("draws the listbox outside a clipping ancestor it opens in", () => {
    render(
      <div data-testid="clipper" style={{ overflow: "hidden", height: 40 }}>
        <Harness />
      </div>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByTestId("clipper").contains(screen.getByRole("listbox"))).toBe(false);
  });

  it("fixes the listbox in viewport coordinates and places it itself", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("fixed");
    // The direction must be in the DOM to be measured or audited.
    expect(listbox).toHaveAttribute("data-placement");
    expect(listbox.style.maxHeight).not.toBe("");
  });

  it("slides a wide listbox from a right-edge trigger back inside the window", () => {
    // jsdom has no layout, so the rects are stated: a trigger at 620 in a 1000px window and a
    // 400px list, which runs 28px past the 8px viewport pad.
    const rect = (left: number, width: number) =>
      ({ left, right: left + width, width, top: 300, bottom: 336, height: 36, x: left, y: 300 }) as DOMRect;
    const spy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this.getAttribute("role") === "combobox") return rect(620, 200);
        if (this.getAttribute("role") === "listbox") return rect(620, 400);
        return rect(0, 0);
      });
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    try {
      render(<Harness />);
      fireEvent.click(screen.getByRole("combobox"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.style.left).toBe("592px");
      expect(listbox.style.minWidth).toBe("200px");
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    }
  });

  it("does not treat a pointerdown on the portalled listbox as an outside click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: /요소/ });
    fireEvent.pointerDown(option);
    // Closing here would swallow the following click and make nothing selectable.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});

/**
 * The exiting frame stays visible but leaves the accessibility tree, or a screen reader keeps
 * announcing a closed list.
 */
describe("Select exit frame", () => {
  it("removes the listbox from the accessibility tree and makes it inert on close", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(listbox).toHaveAttribute("aria-hidden", "true");
    expect(listbox).toHaveAttribute("inert");
    expect(listbox).toHaveAttribute("data-state", "closed");
  });
});
