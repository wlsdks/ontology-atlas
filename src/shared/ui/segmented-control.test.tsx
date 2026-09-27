import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./segmented-control";

/**
 * Pins the radiogroup semantics (including two options), the APG radio keyboard (roving
 * tabindex, wrapping arrows, selection follows focus, Space, no Home/End), the well container
 * and a required accessible name.
 */

function Harness({ initial = "b", onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedControl
      ariaLabel="시험 그룹"
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
      options={[
        { value: "a", label: "가" },
        { value: "b", label: "나" },
        { value: "c", label: "다" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("renders a radiogroup of aria-checked radios and no buttons", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup").getAttribute("aria-label")).toBe("시험 그룹");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(document.querySelector("[aria-pressed]")).toBeNull();
  });

  it("keeps the checked option as the only tab stop", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("moves and selects together on arrow keys and wraps", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const radios = () => screen.getAllByRole("radio");
    radios()[1].focus();
    fireEvent.keyDown(radios()[1], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    expect(document.activeElement).toBe(radios()[2]);
    fireEvent.keyDown(radios()[2], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    expect(document.activeElement).toBe(radios()[0]);
    fireEvent.keyDown(radios()[0], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("ignores Home and End", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    radios[1].focus();
    fireEvent.keyDown(radios[1], { key: "Home" });
    fireEvent.keyDown(radios[1], { key: "End" });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(radios[1]);
  });

  it("checks the option on click and on Space", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "다" }));
    expect(onChange).toHaveBeenLastCalledWith("c");
    const first = screen.getByRole("radio", { name: "가" });
    first.focus();
    fireEvent.keyDown(first, { key: " " });
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("uses the canonical well container classes", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup");
    for (const cls of [
      "p-px",
      "gap-px",
      "bg-[color:var(--color-overlay-1)]",
      "border-[color:var(--color-border-soft)]",
      "rounded-chip",
      "inline-flex",
    ]) {
      expect(group.className, cls).toContain(cls);
    }
  });

  it("answers hover on unselected options only", () => {
    /*
     * Unselected segments answer hover with the value layer's lift and strong ink; the selected
     * one stays silent. Red if either half changes.
     */
    render(<Harness />);
    const unselected = screen.getByRole("radio", { name: "가" });
    const selected = screen.getByRole("radio", { name: "나" });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    for (const cls of [
      "hover:bg-[color:var(--color-overlay-2)]",
      "hover:text-[color:var(--color-text-primary)]",
    ]) {
      expect(unselected.className, cls).toContain(cls);
      expect(selected.className, cls).not.toContain(cls);
    }
  });

  it("handles a two-option boolean choice with the same grammar", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="켬끔"
        value={false}
        onChange={onChange}
        options={[
          { value: true, label: "켬" },
          { value: false, label: "끔" },
        ]}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    fireEvent.click(radios[0]);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("ignores selection while busy and keeps focus reachable", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="로케일"
        value="en"
        busy
        onChange={onChange}
        options={[
          { value: "en", label: "EN" },
          { value: "ko", label: "KO" },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-busy")).toBe("true");
    const ko = screen.getByRole("radio", { name: "KO" });
    fireEvent.click(ko);
    fireEvent.keyDown(screen.getByRole("radio", { name: "EN" }), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    // aria-disabled, not the disabled attribute, so the tab stop survives.
    expect((ko as HTMLButtonElement).disabled).toBe(false);
  });
});

/** The `chips` container supplies the same radio behaviour in a wrapping row. */
describe("SegmentedControl chips variant", () => {
  const OPTIONS = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ] as const;

  it("keeps the radiogroup and roving tabindex behaviour", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="모양" variant="chips" value="a" options={OPTIONS} onChange={onChange} />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // Exactly one tab stop: the checked option.
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("uses the wrapping chip row without the well classes", () => {
    const { container } = render(
      <SegmentedControl ariaLabel="모양" variant="chips" value="a" options={OPTIONS} onChange={vi.fn()} />,
    );
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.className).toContain("flex-wrap");
    expect(group.className).toContain("gap-1.5");
    // None of the well markers, or two containers are mixed.
    expect(group.className).not.toContain("bg-[color:var(--color-overlay-1)]");
    expect(group.className).not.toContain("p-px");
    expect(group.className).not.toContain("gap-px");
  });

  it("splits the width evenly between options when fill is set", () => {
    render(
      <SegmentedControl ariaLabel="모양" variant="chips" fill value="a" options={OPTIONS} onChange={vi.fn()} />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.className).toContain("flex-1");
      expect(radio.className).toContain("min-w-0");
    }
  });

  it("passes an option title through", () => {
    render(
      <SegmentedControl
        ariaLabel="모양"
        variant="chips"
        value="a"
        options={[{ value: "a", label: "A", title: "가나다" }, { value: "b", label: "B" }]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("radio")[0]).toHaveAttribute("title", "가나다");
  });
});
