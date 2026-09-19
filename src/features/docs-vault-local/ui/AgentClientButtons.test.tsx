// The per-client control state machine — write, copy, deeplink, ready, and a refused write.
//
// Until 2026-09-19 this file also rendered the tool buttons as a column and locked their order
// to `AGENT_CLIENTS` ("one list, two truths", measured 2026-07-30). The column left with the
// three-step accordion: the Agents destination's MCP tab lays the same controls out as rows, so
// the order contract now lives beside those rows (`VaultAgentSetupPanel.test.tsx`), and this
// file measures the hook through the smallest harness that draws every control it returns.
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

/**
 * The four are **equal options** (2026-08-02, design council).
 *
 * Only the `claudeCode` render function used to hardcode `primary` to true, and the other three had
 * no path to receive that value at all. Measured: all four were `750×38, x=407` with zero
 * dimensional variance, and one alone was filled `rgba(94,106,210,0.24)` — reading as **"one right
 * answer and three rejects"** rather than four options. They write to different files, so this is not
 * an exclusive single choice and there cannot be a "right answer".
 */
describe("AgentClientButtons — 넷은 같은 무게다", () => {
  it("gives no client a filled treatment the others cannot get", () => {
    renderButtons();
    const classNames = AGENT_CLIENTS.map(
      (client) => screen.getByTestId(CLIENT_TESTID[client.id]).className,
    );
    // A set meant to read as one unit must have **one** surface class.
    expect(new Set(classNames).size).toBe(1);
    // And that one class carries no indigo fill wash.
    for (const className of classNames) {
      expect(className).not.toContain("--color-indigo-a24");
    }
  });

  /**
   * The four `>_` terminal glyphs were removed. The same slot draws Check (done), Copy (copied), and
   * Loader (in progress) depending on state, while Terminal carried no state at all — ink is spent on
   * data (Tufte).
   */
  it("draws no glyph on the connect action — only state carries one", () => {
    renderButtons();
    for (const client of AGENT_CLIENTS) {
      const control = screen.getByTestId(CLIENT_TESTID[client.id]);
      expect(
        control.querySelectorAll("svg").length,
        `${client.id} 연결 버튼에 상태 없는 글리프가 있다`,
      ).toBe(0);
    }
  });
});

/*
 * ⚠️ Census state 5e, 2026-08-31. `writeAndConfirm` caught with **no binding** and `failed` had no
 * render branch, so a refused write left the button in its resting label with nothing said
 * anywhere. What a person saw was indistinguishable from never having pressed it.
 */
describe("AgentClientButtons — 쓰지 못한 write 는 성공처럼 보이지 않는다", () => {
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
    expect(button).toBeDisabled();
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

  it("실패한 write 는 실패라고 말한다", async () => {
    const onWriteConfigs = vi.fn(() => Promise.reject(new Error("Permission denied")));
    renderWithWriter(onWriteConfigs);

    fireEvent.click(screen.getByTestId("agent-client-claude-code"));

    await waitFor(() =>
      expect(screen.getByTestId("agent-client-claude-code")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(screen.getByTestId("agent-client-claude-code")).toHaveTextContent(
      "안 됐어요. 다시 눌러 주세요.",
    );
  });

  it("성공한 write 만 완료 표시를 받는다", async () => {
    const onWriteConfigs = vi.fn(() => Promise.resolve());
    renderWithWriter(onWriteConfigs);

    fireEvent.click(screen.getByTestId("agent-client-claude-code"));

    // A finished write flips the control to the ready status, which is the opposite outcome from
    // the failed branch above — the point is that the two cannot look the same any more.
    await waitFor(() =>
      expect(screen.getByTestId("agent-client-claude-code")).toHaveAttribute("data-state", "ready"),
    );
    expect(screen.getByTestId("agent-client-claude-code")).not.toHaveTextContent(
      "안 됐어요. 다시 눌러 주세요.",
    );
  });
});
