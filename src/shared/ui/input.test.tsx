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

describe("Input — 행동 계약", () => {
  it("label 이 htmlFor 로 입력과 배선된다 (getByLabelText 가 곧 증명이다)", () => {
    render(<Input label="이름" />);
    const input = screen.getByLabelText("이름");
    const label = screen.getByText("이름") as HTMLLabelElement;
    expect(label.htmlFor).toBe(input.id);
    expect(input.id).not.toBe("");
  });

  it("입력의 className 은 fieldClass 호출 결과와 바이트 동일하다 — 값은 값 층 한 곳에만 산다", () => {
    render(<Input label="이름" size="lg" frame="bare" />);
    expect(screen.getByLabelText("이름").className).toBe(
      fieldClass({ size: "lg", frame: "bare" }),
    );
  });

  it("hint 는 aria-describedby 로 배선된다", () => {
    render(<Input label="슬러그" hint="소문자와 하이픈만" />);
    const input = screen.getByLabelText("슬러그");
    const hint = screen.getByText("소문자와 하이픈만");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("error 는 aria-invalid + describedby + role=alert 로 배선된다", () => {
    render(<Input label="슬러그" error="이미 있는 슬러그예요" />);
    const input = screen.getByLabelText("슬러그");
    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("이미 있는 슬러그예요");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("error 와 hint 가 같이 있으면 둘 다 describedby 에 실리고 error 가 먼저다", () => {
    render(<Input label="슬러그" hint="소문자" error="중복" />);
    const input = screen.getByLabelText("슬러그");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])?.getAttribute("role")).toBe("alert");
  });

  it("aria-label 로도 이름을 줄 수 있다 (시각 라벨이 없는 검색류)", () => {
    render(<Input aria-label="개념 검색" frame="bare" />);
    expect(screen.getByLabelText("개념 검색")).toBeTruthy();
  });

  it("소비자 id 를 존중한다", () => {
    render(<Input label="이름" id="my-field" />);
    expect(screen.getByLabelText("이름").id).toBe("my-field");
  });

  it("onChange 등 네이티브 prop 이 그대로 흐른다", () => {
    const onChange = vi.fn();
    render(<Input label="이름" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("Textarea — 행동 계약", () => {
  it("multiline 값 층과 바이트 동일하고, error 배선이 같다", () => {
    render(<Textarea label="설명" size="lg" error="너무 길어요" />);
    const area = screen.getByLabelText("설명");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.className).toBe(fieldClass({ multiline: true, size: "lg" }));
    expect(area.getAttribute("aria-invalid")).toBe("true");
    expect(area.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });
});
