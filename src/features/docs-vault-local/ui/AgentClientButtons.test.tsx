// The per-client control state machine: write, copy, deeplink, ready, and a refused write.
// The row order contract lives beside the Agents rows (`VaultAgentSetupPanel.test.tsx`).
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useAgentClientControls, type AgentClientControlsProps } from "./AgentClientButtons";
import { AGENT_CLIENTS } from "@/entities/vault-session";
import ko from "../../../../messages/ko.json";

const CLIENT_TESTID: Record<string, string> = {
  "claude-code": "agent-client-claude-code",
  codex: "agent-client-codex",
  cursor: "agent-client-cursor",
  antigravity: "agent-client-antigravity",
};

function Harness(props: AgentClientControlsProps) {
  const { serverUnavailable, controls, manualPathNote } = useAgentClientControls(props);
  return (
    <div data-testid="agent-client-buttons">
      {serverUnavailable}
      {controls
        ? AGENT_CLIENTS.map((client) => <span key={client.id}>{controls[client.id]}</span>)
        : null}
      {manualPathNote}
    </div>
  );
}

function renderButtons() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <Harness
        serverAvailability={{
          kind: "app-bundled",
          launch: { kind: "app-bundled", command: "/bundle/ontology-atlas-mcp", args: [] },
          binaryPath: "/bundle/ontology-atlas-mcp",
          reason: null,
        }}
        onWriteConfigs={() => undefined}
        cursorDeeplink={null}
        mcpJsonSnippet="{}"
        codexCommand="codex mcp add"
        needsManualPath={false}
      />
    </NextIntlClientProvider>,
  );
}

/** The four clients write different files, so none is styled as the right answer. */
describe("AgentClientButtons gives the four clients equal weight", () => {
  it("gives no client a filled treatment the others cannot get", () => {
    renderButtons();
    const classNames = AGENT_CLIENTS.map(
      (client) => screen.getByTestId(CLIENT_TESTID[client.id]).className,
    );
    expect(new Set(classNames).size).toBe(1);
    for (const className of classNames) {
      expect(className).not.toContain("--color-indigo-a24");
    }
  });

  /** One glyph per control; a state glyph replaces the resting one rather than joining it. */
  it("draws exactly one glyph on each connect action", () => {
    renderButtons();
    for (const client of AGENT_CLIENTS) {
      const control = screen.getByTestId(CLIENT_TESTID[client.id]);
      expect(
        control.querySelectorAll("svg").length,
        `${client.id} connect button glyph count`,
      ).toBe(1);
    }
  });
});

describe("AgentClientButtons does not show a failed write as success", () => {
  function renderWithWriter(onWriteConfigs: () => Promise<void>) {
    return render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <Harness
          serverAvailability={{
            kind: "app-bundled",
            launch: { kind: "app-bundled", command: "/bundle/ontology-atlas-mcp", args: [] },
            binaryPath: "/bundle/ontology-atlas-mcp",
            reason: null,
          }}
          onWriteConfigs={onWriteConfigs}
          cursorDeeplink={null}
          mcpJsonSnippet="{}"
          codexCommand="codex mcp add"
          needsManualPath={false}
        />
      </NextIntlClientProvider>,
    );
  }

  it('keeps the busy glyph native and static until the config write actually completes', async () => {
    let finish!: () => void;
    const pendingWrite = new Promise<void>((resolve) => { finish = resolve; });
    renderWithWriter(() => pendingWrite);
    const button = screen.getByTestId('agent-client-claude-code');
    expect(button.querySelector('[data-brand-detail]')).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute('data-state', 'busy');
    // Busy is announced, not `disabled`: a disabled button drops keyboard focus to <body>.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
    const mark = button.querySelector('[data-brand-detail="micro"]');
    expect(mark).toHaveAttribute('width', '16');
    expect(mark).toHaveAttribute('height', '16');
    expect(mark).toHaveClass('atlas-inline-waiting-mark');
    expect(mark?.parentElement).toHaveClass('size-3.5');
    expect(button.querySelector('.animate-spin')).toBeNull();
    await act(async () => finish());
    const ready = screen.getByTestId('agent-client-claude-code');
    expect(ready).toHaveAttribute('data-state', 'ready');
    expect(ready.querySelector('[data-brand-detail]')).toBeNull();
  });

  it("reports a failed write as failed", async () => {
    const onWriteConfigs = vi.fn(() => Promise.reject(new Error("Permission denied")));
    renderWithWriter(onWriteConfigs);

    fireEvent.click(screen.getByTestId("agent-client-claude-code"));

    await waitFor(() =>
      expect(screen.getByTestId("agent-client-claude-code")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(screen.getByTestId("agent-client-claude-code")).toHaveTextContent("안 됐어요");
    expect(screen.getByTestId("agent-client-claude-code")).toHaveAttribute(
      "aria-label",
      "안 됐어요. 다시 눌러 주세요.",
    );
  });

  it("marks only a successful write as done", async () => {
    const onWriteConfigs = vi.fn(() => Promise.resolve());
    renderWithWriter(onWriteConfigs);

    fireEvent.click(screen.getByTestId("agent-client-claude-code"));

    await waitFor(() =>
      expect(screen.getByTestId("agent-client-claude-code")).toHaveAttribute("data-state", "ready"),
    );
    expect(screen.getByTestId("agent-client-claude-code")).not.toHaveTextContent(
      "안 됐어요. 다시 눌러 주세요.",
    );
  });
});
