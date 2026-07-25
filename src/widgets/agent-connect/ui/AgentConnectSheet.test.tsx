import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { AgentConnectSheet } from "./AgentConnectSheet";

function renderSheet(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AgentConnectSheet
        open
        onClose={onClose}
        status={{ kind: "none" }}
        snippets={{
          mcpJson: '{"mcpServers":{}}',
          codexCommand: "codex mcp add ontology-atlas",
          needsManualPath: false,
          cursorDeeplink: null,
          vscodeDeeplink: null,
        }}
        domainTitles={["Product"]}
        handoffText="Continue the ontology task."
      />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("AgentConnectSheet focus contract", () => {
  it("moves focus into the dialog and traps Tab in both directions", async () => {
    renderSheet();

    const close = screen.getByTestId("agent-connect-close");
    await waitFor(() => expect(close).toHaveFocus());

    const buttons = screen.getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("closes with Escape while focus is owned by the dialog", async () => {
    const onClose = renderSheet();
    await waitFor(() => expect(screen.getByTestId("agent-connect-close")).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
