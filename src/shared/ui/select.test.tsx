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

/**
 * 2026-08-02 설치 앱 실측 회귀 — 목록이 조상의 `overflow: hidden` 에 잘려
 * 모델 7개 중 1개만 보였고(가시 14.8%), ArrowDown 은 화면을 1px 도 못 움직였다.
 * 자르던 조상(`.ai-row-disclosure`)의 `overflow: hidden` 은 높이 전이용이라
 * 풀 수 없으므로, 목록이 그 밖으로 나가는 것이 유일한 해였다.
 */
describe("Select — 목록은 잘리는 조상 밖에 산다", () => {
  it("목록은 트리거의 DOM 서브트리가 아니라 body 아래로 포털된다", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it("잘리는 조상 안에서 열어도 목록은 그 조상 밖에 그려진다", () => {
    render(
      <div data-testid="clipper" style={{ overflow: "hidden", height: 40 }}>
        <Harness />
      </div>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByTestId("clipper").contains(screen.getByRole("listbox"))).toBe(false);
  });

  it("목록은 뷰포트 좌표로 고정되고 자기 자리를 스스로 판다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("fixed");
    // 아래로 열지 위로 뒤집을지가 DOM 에 남아 있어야 계측/감사가 가능하다.
    expect(listbox).toHaveAttribute("data-placement");
    expect(listbox.style.maxHeight).not.toBe("");
  });

  it("포털된 목록 위의 pointerdown 은 바깥 클릭이 아니다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: /요소/ });
    fireEvent.pointerDown(option);
    // 여기서 닫히면 이어지는 click 이 사라져 **아무것도 고를 수 없다**.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});

/**
 * 퇴장은 **눈에 보여야 하고, 접근성 트리에는 남지 않아야 한다.** 퇴장 창 동안
 * DOM 에 남는 프레임이 role 을 그대로 들고 있으면 닫힌 목록을 스크린 리더가
 * 계속 읽는다 — 모션의 대가를 접근성으로 치르는 것이다.
 */
describe("Select — 퇴장 프레임", () => {
  it("닫는 순간 목록은 접근성 트리에서 빠지고 inert 가 된다", () => {
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
