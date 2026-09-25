import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import koMessages from "../../../../../messages/ko.json";
import { VaultConflictError } from "@/entities/vault-session";
import { RenameDocDialog, type RenameDocTarget } from "./RenameDocDialog";

/*
 * Map-edit QA D9 (2026-09-26): renaming was a `window.prompt` asking for a raw slug path. The
 * dialog asks for a name, shows the address it becomes, and refuses in words.
 */
const target: RenameDocTarget = {
  slug: "capabilities/mcp-tool-server",
  title: "MCP 도구 서버",
  referrerCount: 4,
};
const ko = koMessages.docsVault.renameDialog;

function renderDialog(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const taken = new Set(["capabilities/agent-connector-setup"]);
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <RenameDocDialog
        target={target}
        isTaken={(slug) => taken.has(slug)}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    </NextIntlClientProvider>,
  );
  return { onConfirm, input: screen.getByTestId("docs-rename-input") as HTMLInputElement };
}

describe("RenameDocDialog", () => {
  it("starts from the current name and says how many referrers move with it", () => {
    const { input } = renderDialog();
    expect(input.value).toBe("mcp-tool-server");
    expect(screen.getByTestId("docs-rename-referrers")).toHaveTextContent("4개");
    // Nothing to do yet: the unchanged name cannot be confirmed.
    expect(screen.getByTestId("docs-rename-confirm")).toBeDisabled();
  });

  it("turns a typed name into the address, keeping the folder", async () => {
    const { input, onConfirm } = renderDialog();
    fireEvent.change(input, { target: { value: "MCP tool host" } });
    expect(screen.getByTestId("docs-rename-dialog")).toHaveTextContent(
      "capabilities/mcp-tool-host.md",
    );
    fireEvent.click(screen.getByTestId("docs-rename-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("capabilities/mcp-tool-host"));
  });

  it("refuses a taken address and a case-only change in place, before anything is sent", () => {
    const { input, onConfirm } = renderDialog();
    fireEvent.change(input, { target: { value: "agent-connector-setup" } });
    expect(screen.getByRole("alert")).toHaveTextContent("capabilities/agent-connector-setup.md");
    expect(screen.getByTestId("docs-rename-confirm")).toBeDisabled();

    fireEvent.change(input, { target: { value: "!!!" } });
    expect(screen.getByRole("alert")).toHaveTextContent(ko.errorNoLetters);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("says a refused move in the reader's language and stays open", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue(new VaultConflictError("capabilities/mcp-tool-server", 1, 2));
    const { input } = renderDialog(onConfirm);
    fireEvent.change(input, { target: { value: "mcp-tool-host" } });
    fireEvent.click(screen.getByTestId("docs-rename-confirm"));
    const failure = await screen.findByTestId("docs-rename-failure");
    expect(failure).toHaveTextContent(ko.errorConflict);
    expect(failure.textContent).not.toMatch(/Vault conflict/);
    expect(screen.getByTestId("docs-rename-dialog")).toBeInTheDocument();
  });
});
