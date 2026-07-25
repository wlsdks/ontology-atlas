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
    // closes after selection
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
    // open with selection at index 0 (unselected -> starts 0)
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
