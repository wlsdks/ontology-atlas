import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../../messages/en.json";
import { NewDocKindDialog } from "./NewDocKindDialog";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * rank2/18 (설계협의회 batch B1) — DOM 오버레이 3종 공용 a11y 계약을
 * NewDocKindDialog 에서 고정한다: 열릴 때 첫 focusable 로 포커스, ESC 로
 * 닫힘, Tab 이 다이얼로그 밖으로 새지 않음(trap), 닫히면 트리거로 포커스
 * 복귀. rank2 스프링은 발행 게이트(rank18)를 통과해야만 하므로 이 셋을
 * 여기서 같이 고정한다.
 */
describe("NewDocKindDialog", () => {
  const triggers: HTMLButtonElement[] = [];
  afterEach(() => {
    // ⚠️ `document.body.innerHTML = ""` 로 통째로 비우면 안 된다 — Dialog 가
    // body 에 포털을 세우므로, React 언마운트 전에 그 노드를 지우면
    // removeChild 가 NotFoundError 로 터진다. 트리거만 걷는다.
    for (const trigger of triggers.splice(0)) trigger.remove();
  });

  function renderWithTrigger() {
    const trigger = document.createElement("button");
    trigger.textContent = "open trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    triggers.push(trigger);
    return trigger;
  }

  it("열리면 첫 kind 버튼에 포커스한다", () => {
    renderWithTrigger();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />);

    const firstKindButton = within(screen.getByRole("dialog")).getAllByRole(
      "button",
    )[0];
    expect(document.activeElement).toBe(firstKindButton);
  });

  it("ESC 를 누르면 onClose 가 호출된다", () => {
    renderWithTrigger();
    const onClose = vi.fn();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("kind 버튼을 고르면 onSelect 가 해당 kind 로 호출된다", () => {
    renderWithTrigger();
    const onSelect = vi.fn();
    render(<NewDocKindDialog open onSelect={onSelect} onClose={() => {}} />);

    fireEvent.click(screen.getByText("Domain"));

    expect(onSelect).toHaveBeenCalledWith("domain");
  });

  it("Tab 이 다이얼로그 밖으로 새지 않는다 (마지막 → 첫 focusable 순환)", () => {
    renderWithTrigger();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />);

    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(buttons[0]);
  });

  it("Shift+Tab 이 첫 focusable 에서 마지막으로 순환한다", () => {
    renderWithTrigger();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />);

    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    buttons[0].focus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("언마운트되면 트리거로 포커스가 복귀한다", () => {
    const trigger = renderWithTrigger();
    const { unmount } = render(
      <NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />,
    );

    unmount();

    expect(document.activeElement).toBe(trigger);
  });
});
