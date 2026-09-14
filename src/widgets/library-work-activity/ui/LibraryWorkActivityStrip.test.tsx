import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { LibraryWorkActivityStrip } from "./LibraryWorkActivityStrip";

describe("Library work receipts", () => {
  it("keeps a pending proposal distinct from a persisted change and opens the exact target", () => {
    const onSelect = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <LibraryWorkActivityStrip onSelect={onSelect} activity={{ isActive: true,
        current: { id: "p", kind: "waiting", phase: "active", target: { kind: "wiki", ref: "wiki/research" }, at: 1 },
        recent: [{ id: "w", kind: "write", phase: "complete", target: { kind: "wiki", ref: "wiki/roadmap" }, at: 0 }],
      }} />
    </NextIntlClientProvider>);
    expect(screen.getByTestId("library-work-current")).toHaveTextContent("Waiting for permission");
    expect(screen.getByTestId("library-work-current")).not.toHaveTextContent("File changed");
    expect(screen.getByTestId("library-work-history-toggle")).toHaveTextContent(/Recent\s*1/);
    expect(screen.getByTestId("library-work-history-toggle")).not.toHaveTextContent("wiki/roadmap");
    fireEvent.click(screen.getByTestId("library-work-history-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /File changed.*wiki\/roadmap/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "wiki", ref: "wiki/roadmap" });
  });

  it("does not invent a selectable file for an unbound event", () => {
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <LibraryWorkActivityStrip onSelect={vi.fn()} activity={{ isActive: false, current: null,
        recent: [{ id: "e", kind: "error", phase: "complete", target: null, at: 0 }],
      }} />
    </NextIntlClientProvider>);
    expect(screen.queryByRole("button", { name: /Failed/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("library-work-activity")).toHaveTextContent("Failed");
  });

  it("owns Escape while history is open, closes it, and returns focus to its trigger", () => {
    const underlyingEscape = vi.fn();
    window.addEventListener("keydown", underlyingEscape);
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <LibraryWorkActivityStrip onSelect={vi.fn()} activity={{ isActive: false, current: null,
        recent: [{ id: "w", kind: "write", phase: "complete", target: { kind: "wiki", ref: "wiki/roadmap" }, at: 0 }],
      }} />
    </NextIntlClientProvider>);
    const trigger = screen.getByTestId("library-work-history-toggle");
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(screen.getByTestId("library-work-recent"), { key: "Escape" });

    expect(underlyingEscape).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    window.removeEventListener("keydown", underlyingEscape);
  });
});
