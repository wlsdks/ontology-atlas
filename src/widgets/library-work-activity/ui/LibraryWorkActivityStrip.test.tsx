import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { LibraryWorkActivityStrip } from "./LibraryWorkActivityStrip";

describe("Library work receipts", () => {
  it("keeps a compact failed receipt actionable without inventing a file target", () => {
    const onOpenConversation = vi.fn();
    render(<IntlProvider locale="en" messages={messages}>
      <LibraryWorkActivityStrip compact onOpenConversation={onOpenConversation} onSelect={vi.fn()}
        activity={{ isActive: false, current: null,
          recent: [{ id: "e", kind: "error", phase: "complete", target: null, at: 0 }],
        }} />
    </IntlProvider>);
    expect(screen.getByTestId("library-work-activity")).toHaveTextContent("Failed");
    expect(screen.getByTestId("library-work-current")).not.toHaveTextContent("No confirmed file target");
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(onOpenConversation).toHaveBeenCalledOnce();
  });

  it("keeps a pending proposal distinct from a persisted change and opens the exact target", () => {
    const onSelect = vi.fn();
    render(<IntlProvider locale="en" messages={messages}>
      <LibraryWorkActivityStrip onSelect={onSelect} activity={{ isActive: true,
        current: { id: "p", kind: "waiting", phase: "active", target: { kind: "wiki", ref: "wiki/research" }, at: 1 },
        recent: [{ id: "w", kind: "write", phase: "complete", target: { kind: "wiki", ref: "wiki/roadmap" }, at: 0 }],
      }} />
    </IntlProvider>);
    expect(screen.getByTestId("library-work-current")).toHaveTextContent("Waiting for permission");
    expect(screen.getByTestId("library-work-current")).not.toHaveTextContent("Wiki page changed");
    expect(screen.getByTestId("library-work-history-toggle")).toHaveTextContent(/Recent\s*1/);
    expect(screen.getByTestId("library-work-history-toggle")).not.toHaveTextContent("wiki/roadmap");
    fireEvent.click(screen.getByTestId("library-work-history-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Wiki page changed.*wiki\/roadmap/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "wiki", ref: "wiki/roadmap" });
  });

  it("does not invent a selectable file for an unbound event", () => {
    render(<IntlProvider locale="en" messages={messages}>
      <LibraryWorkActivityStrip onSelect={vi.fn()} activity={{ isActive: false, current: null,
        recent: [{ id: "e", kind: "error", phase: "complete", target: null, at: 0 }],
      }} />
    </IntlProvider>);
    expect(screen.queryByRole("button", { name: /Failed/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("library-work-activity")).toHaveTextContent("Failed");
  });

  it("owns Escape when focus stays on the reader, closes history, and returns focus to its trigger", () => {
    const underlyingEscape = vi.fn();
    window.addEventListener("keydown", underlyingEscape);
    render(
      <div data-testid="library-reader" tabIndex={-1} onKeyDown={underlyingEscape}>
        <IntlProvider locale="en" messages={messages}>
          <LibraryWorkActivityStrip onSelect={vi.fn()} activity={{ isActive: false, current: null,
            recent: [{ id: "w", kind: "write", phase: "complete", target: { kind: "wiki", ref: "wiki/roadmap" }, at: 0 }],
          }} />
        </IntlProvider>
      </div>,
    );
    const trigger = screen.getByTestId("library-work-history-toggle");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const reader = screen.getByTestId("library-reader");
    reader.focus();
    expect(reader).toHaveFocus();
    const propagated = fireEvent.keyDown(reader, { key: "Escape" });

    expect(propagated).toBe(false);
    expect(underlyingEscape).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    window.removeEventListener("keydown", underlyingEscape);
  });
});
