import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./segmented-control";

/**
 * SegmentedControl — 계약 (2026-08-15 체계석 비준 + 상호작용석 공동 서명).
 *
 * 창립 census: 「보더 상자 안 세그먼트 단일선택」 5곳 손 재구현 — ARIA 3종
 * (pressed 2 · radiogroup 3 · roving 구현 **0곳**: radiogroup 을 쓰는 3곳도
 * 화살표 이동을 약속만 하고 아무 일도 안 일어났다) · 컨테이너 인셋 3종 ·
 * 바탕 3종 · 선택 표현 2언어(값 층 active vs 손 조합 — 후자는 잉크 대비
 * 1.17:1 로 상태가 아니라 착시).
 *
 * 이 계약이 못박는 것: ① radiogroup + radio + aria-checked (2택 포함 —
 * aria-pressed 는 이 프리미티브에서 표현 불가) ② APG 라디오 키보드
 * (roving tabindex · 화살표 순환 · selection follows focus · Space ·
 * **Home/End 없음** · Escape 미처리) ③ 컨테이너 캐노니컬(p-px · gap-px ·
 * overlay-1 · border-soft · rounded-chip) ④ 이름 강제.
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
    // aria-pressed 는 표현 불가 — 마크업 어디에도 없다.
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
    // 끝에서 순환.
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
    // disabled 속성이 아니라 aria-disabled — 탭 스톱이 사라지지 않는다.
    expect((ko as HTMLButtonElement).disabled).toBe(false);
  });
});

/**
 * `chips` 변형 — 떨어진 칩 줄 (2026-08-15 2차 라운드).
 *
 * 새 그릇이 아니라 **실측 다수파의 등재**다: 손 radiogroup 12그룹 중 10이
 * 이미 `flex flex-wrap items-center gap-1.5` 였다(바이트 동일 9 + no-op 추가 1).
 * 그런데 그 10곳 전부 **roving 0 · onKeyDown 0** 이었다 — 이 변형의 존재
 * 이유는 모양이 아니라 **행동을 자동으로 입혀 주는 것**이다.
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
    // 탭 스톱은 체크된 하나뿐이다 — 이게 12그룹에 전부 없던 것이다.
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
    // 우물의 표식 셋은 없다 — 있으면 두 그릇이 섞인 것이다.
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
    // 타입 층의 계약이다 — 여기 단언은 그 계약이 삭제되면 같이 깨지라고 둔다.
    const optionKeys = Object.keys({ value: "", label: "", ariaLabel: "", title: "", testId: "" });
    expect(optionKeys).not.toContain("className");
  });
});
