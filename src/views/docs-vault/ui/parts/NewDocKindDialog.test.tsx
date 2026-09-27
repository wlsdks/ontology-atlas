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

describe("NewDocKindDialog", () => {
  const triggers: HTMLButtonElement[] = [];
  afterEach(() => {
    // Do not clear `document.body`: Dialog's portal lives there and React's unmount would throw
    // NotFoundError. Only the triggers are removed.
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

  it("focuses the first kind button on open", () => {
    renderWithTrigger();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />);

    const firstKindButton = within(screen.getByRole("dialog")).getAllByRole(
      "button",
    )[0];
    expect(document.activeElement).toBe(firstKindButton);
  });

  it("calls onClose on Escape", () => {
    renderWithTrigger();
    const onClose = vi.fn();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect with the chosen kind", () => {
    renderWithTrigger();
    const onSelect = vi.fn();
    render(<NewDocKindDialog open onSelect={onSelect} onClose={() => {}} />);

    fireEvent.click(screen.getByText("Domain"));

    expect(onSelect).toHaveBeenCalledWith("domain");
  });

  it("wraps Tab from the last focusable to the first", () => {
    renderWithTrigger();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />);

    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(buttons[0]);
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    renderWithTrigger();
    render(<NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />);

    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    buttons[0].focus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("returns focus to the trigger on unmount", () => {
    const trigger = renderWithTrigger();
    const { unmount } = render(
      <NewDocKindDialog open onSelect={() => {}} onClose={() => {}} />,
    );

    unmount();

    expect(document.activeElement).toBe(trigger);
  });
});
