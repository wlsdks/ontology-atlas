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
 * Pins the shared a11y contract of the three DOM overlays here in NewDocKindDialog: focus moves to
 * the first focusable on open, ESC closes, Tab does not leak outside the dialog (trap), and focus
 * returns to the trigger on close.
 */
describe("NewDocKindDialog", () => {
  const triggers: HTMLButtonElement[] = [];
  afterEach(() => {
    // ⚠️ Do not clear everything with `document.body.innerHTML = ""` — Dialog mounts a portal on
    // body, and removing that node before React unmounts makes removeChild throw NotFoundError.
    // Only the triggers are cleared.
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
