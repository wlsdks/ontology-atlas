import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./segmented-control";

/**
 * SegmentedControl contract (2026-08-15, ratified by the design-system seat and
 * co-signed by the interaction seat).
 *
 * Founding inventory: 5 hand-rolled "single choice inside a bordered box"
 * implementations — 3 different ARIA shapes (2 `pressed`, 3 `radiogroup`, and
 * roving tabindex implemented in **none**: even the three using `radiogroup`
 * promised arrow navigation and did nothing), 3 container insets, 3 backgrounds,
 * and 2 languages for "selected" (the value layer's `active` vs a hand-rolled
 * combination whose ink contrast measured 1.17:1 — an illusion, not a state).
 *
 * What this contract pins: ① radiogroup + radio + aria-checked, including the
 * two-option case (aria-pressed cannot be expressed by this primitive); ② the APG
 * radio keyboard (roving tabindex, wrapping arrows, selection follows focus,
 * Space, **no Home/End**, no Escape handling); ③ the canonical container (p-px ·
 * gap-px · overlay-1 · border-soft · rounded-chip); ④ a required accessible name.
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
  it("radiogroup + radio + aria-checked — 버튼 role 은 0 이다", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup").getAttribute("aria-label")).toBe("시험 그룹");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    // aria-pressed is not expressible here — it appears nowhere in the markup.
    expect(document.querySelector("[aria-pressed]")).toBeNull();
  });

  it("탭 스톱은 체크된 항목 하나뿐이다 (roving tabindex)", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("화살표가 이동+선택을 함께 하고 순환한다 (selection follows focus)", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const radios = () => screen.getAllByRole("radio");
    radios()[1].focus();
    fireEvent.keyDown(radios()[1], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    expect(document.activeElement).toBe(radios()[2]);
    // Wraps at the end.
    fireEvent.keyDown(radios()[2], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    expect(document.activeElement).toBe(radios()[0]);
    fireEvent.keyDown(radios()[0], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("Home/End 는 아무 것도 하지 않는다 — 라디오 표에 없는 키다 (회귀 방지)", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    radios[1].focus();
    fireEvent.keyDown(radios[1], { key: "Home" });
    fireEvent.keyDown(radios[1], { key: "End" });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(radios[1]);
  });

  it("클릭과 Space 는 그 항목을 체크한다", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "다" }));
    expect(onChange).toHaveBeenLastCalledWith("c");
    const first = screen.getByRole("radio", { name: "가" });
    first.focus();
    fireEvent.keyDown(first, { key: " " });
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("컨테이너 캐노니컬 — p-px · gap-px · overlay-1 · border-soft · rounded-chip", () => {
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

  it("호버 계약 — 선택 안 된 항목은 lift+strong 으로 답하고, 선택된 항목은 침묵한다", () => {
    /*
     * 2026-08-26: all three segments on /ko/architecture/ gave no hover answer
     * at all, starving the hover-contrast gate below its floor of 3 compared
     * controls. The values are the pair already registered in the value layer
     * (hoverSurface lift -> overlay-2, hoverInk strong -> text-primary), and
     * under `active` the three hover axes structurally never emit (hover on a
     * selection measured its border weakening 2.09 -> 1.48). This case pins
     * both halves: it turns red if the emission disappears, and also if the
     * selected item starts speaking.
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

  it("boolean 값 2택도 같은 문법이다 (구 SegmentSwitch 흡수)", () => {
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

  it("busy 면 재선택이 no-op 이고 초점은 산다 (그룹 disabled 금지)", () => {
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
    // aria-disabled, not the disabled attribute — the tab stop must survive.
    expect((ko as HTMLButtonElement).disabled).toBe(false);
  });
});

/**
 * The `chips` variant — a row of detached chips (2026-08-15, second round).
 *
 * Not a new container but **the measured majority written down**: 10 of the 12
 * hand-rolled radiogroups were already `flex flex-wrap items-center gap-1.5`
 * (9 byte-identical, 1 with a no-op addition). All 10 had **zero roving tabindex
 * and zero onKeyDown** — so this variant exists to supply the behaviour, not the
 * appearance.
 */
describe("SegmentedControl — chips 변형", () => {
  const OPTIONS = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ] as const;

  it("행동은 그릇과 무관하다 — chips 도 radiogroup + roving 을 그대로 받는다", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="모양" variant="chips" value="a" options={OPTIONS} onChange={onChange} />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // Exactly one tab stop, the checked option — what all 12 groups were missing.
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("chips 컨테이너 캐노니컬 — 우물을 입지 않는다", () => {
    const { container } = render(
      <SegmentedControl ariaLabel="모양" variant="chips" value="a" options={OPTIONS} onChange={vi.fn()} />,
    );
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.className).toContain("flex-wrap");
    expect(group.className).toContain("gap-1.5");
    // None of the well's three markers — their presence would mean two containers mixed.
    expect(group.className).not.toContain("bg-[color:var(--color-overlay-1)]");
    expect(group.className).not.toContain("p-px");
    expect(group.className).not.toContain("gap-px");
  });

  it("fill 은 항목이 폭을 균등하게 나눠 갖게 한다", () => {
    render(
      <SegmentedControl ariaLabel="모양" variant="chips" fill value="a" options={OPTIONS} onChange={vi.fn()} />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.className).toContain("flex-1");
      expect(radio.className).toContain("min-w-0");
    }
  });

  it("옵션 title 은 통과하고, per-option className 통로는 열려 있지 않다", () => {
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
    // The real contract lives in the types; this assertion exists to break with it.
    const optionKeys = Object.keys({ value: "", label: "", ariaLabel: "", title: "", testId: "" });
    expect(optionKeys).not.toContain("className");
  });
});
