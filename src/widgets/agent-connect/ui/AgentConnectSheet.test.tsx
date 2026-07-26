import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import type { AgentPackageDistribution } from "@/shared/config";
import { AgentConnectSheet } from "./AgentConnectSheet";

const publishedPackages: AgentPackageDistribution = {
  status: "published",
  checkedAt: "2026-07-27",
  evidence: "npm-registry-published",
  cliPackage: "ontology-atlas",
  mcpPackage: "ontology-atlas-mcp",
};

const unpublishedPackages: AgentPackageDistribution = {
  ...publishedPackages,
  status: "unpublished",
  evidence: "npm-registry-e404",
};

function renderSheet(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AgentConnectSheet
        open
        onClose={onClose}
        status={{ kind: "none" }}
        snippets={{
          mcpJson: '{"mcpServers":{}}',
          replacementMcpJson: '{"mcpServers":{"ontology-atlas":{"env":{"OATLAS_VAULT":"."}}}}',
          codexCommand: "codex mcp add ontology-atlas",
          codexConfig: '[mcp_servers.ontology-atlas]',
          needsManualPath: false,
          cursorDeeplink: null,
          vscodeDeeplink: null,
        }}
        domainTitles={["Product"]}
        handoffText="Continue the ontology task."
        packageDistribution={publishedPackages}
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

  it("forwards invalid vault config states as replacement-copy actions", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AgentConnectSheet
          open
          onClose={vi.fn()}
          status={{ kind: "none" }}
          snippets={{
            mcpJson: '{"env":{"OATLAS_VAULT":"/private/tmp/vault"}}',
            replacementMcpJson: '{"env":{"OATLAS_VAULT":"."}}',
            codexCommand: "codex mcp add ontology-atlas",
            codexConfig: '[mcp_servers.ontology-atlas]\nOATLAS_VAULT = "."',
            needsManualPath: false,
            cursorDeeplink: null,
            vscodeDeeplink: null,
          }}
          domainTitles={[]}
          handoffText=""
          onWriteConfigs={vi.fn()}
          mcpJsonState="invalid"
          codexConfigState="invalid"
          packageDistribution={publishedPackages}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Copy correct .mcp.json" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy correct Codex config" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Created .mcp.json in this folder"),
    ).not.toBeInTheDocument();
  });

  it("fails closed instead of offering install actions for unpublished packages", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AgentConnectSheet
          open
          onClose={vi.fn()}
          status={{ kind: "none" }}
          snippets={{
            mcpJson: '{"command":"npx"}',
            replacementMcpJson: '{"command":"npx"}',
            codexCommand: "codex mcp add ontology-atlas -- npx -y ontology-atlas-mcp",
            codexConfig: 'command = "npx"',
            needsManualPath: false,
            cursorDeeplink: "cursor://broken-npx-config",
            vscodeDeeplink: "vscode:mcp/install?broken-npx-config",
          }}
          domainTitles={[]}
          handoffText=""
          onWriteConfigs={vi.fn()}
          packageDistribution={unpublishedPackages}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("agent-package-unavailable")).toHaveTextContent(
      "not published",
    );
    expect(screen.queryByTestId("agent-connect-step-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-connect-step-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-client-cursor")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect to Claude Code" }),
    ).not.toBeInTheDocument();
  });
});
