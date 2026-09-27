import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fieldClass } from "./control-class";
import { Input, Textarea } from "./input";

/**
 * Input/Textarea — the behaviour contract (ratified by the design-systems seat,
 * 2026-08-15).
 *
 * These components exist for **wiring**, not styling (the value layer has zero
 * drift): ① they require an accessible name, ② they wire error/hint through to
 * `aria-invalid` and `aria-describedby` automatically. So the contract is those
 * two plus one more — byte-identical to the value layer. A value written in two
 * places starts diverging, so every style assertion here is only an **equality**
 * against the result of calling `fieldClass`.
 */

describe("Input behaviour contract", () => {
  it("wires the label to the input through htmlFor", () => {
    render(<Input label="이름" />);
    const input = screen.getByLabelText("이름");
    const label = screen.getByText("이름") as HTMLLabelElement;
    expect(label.htmlFor).toBe(input.id);
    expect(input.id).not.toBe("");
  });

  it("uses a className byte-identical to the fieldClass output", () => {
    render(<Input label="이름" size="lg" frame="bare" />);
    expect(screen.getByLabelText("이름").className).toBe(
      fieldClass({ size: "lg", frame: "bare" }),
    );
  });

  it("wires the hint through aria-describedby", () => {
    render(<Input label="슬러그" hint="소문자와 하이픈만" />);
    const input = screen.getByLabelText("슬러그");
    const hint = screen.getByText("소문자와 하이픈만");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("wires the error through aria-invalid, aria-describedby and role=alert", () => {
    render(<Input label="슬러그" error="이미 있는 슬러그예요" />);
    const input = screen.getByLabelText("슬러그");
    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("이미 있는 슬러그예요");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("lists both error and hint in aria-describedby with the error first", () => {
    render(<Input label="슬러그" hint="소문자" error="중복" />);
    const input = screen.getByLabelText("슬러그");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])?.getAttribute("role")).toBe("alert");
  });

  it("accepts an aria-label instead of a visible label", () => {
    render(<Input aria-label="개념 검색" frame="bare" />);
    expect(screen.getByLabelText("개념 검색")).toBeTruthy();
  });

  it("keeps the id the consumer passes", () => {
    render(<Input label="이름" id="my-field" />);
    expect(screen.getByLabelText("이름").id).toBe("my-field");
  });

  it("passes native props such as onChange through", () => {
    const onChange = vi.fn();
    render(<Input label="이름" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("Textarea behaviour contract", () => {
  it("matches the multiline value layer and wires the error the same way", () => {
    render(<Textarea label="설명" size="lg" error="너무 길어요" />);
    const area = screen.getByLabelText("설명");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.className).toBe(fieldClass({ multiline: true, size: "lg" }));
    expect(area.getAttribute("aria-invalid")).toBe("true");
    expect(area.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });
});
