// The tool-button render order contract — blocking a recurrence of "one list, two truths".
//
// Measured 2026-07-30: this component hardcoded the tool buttons in JSX as Claude Code → Cursor →
// Antigravity → Codex, while the global scope tab in the same sheet used `AGENT_CLIENTS`
// (Claude Code → Codex → Cursor → Antigravity) — one list with two orders inside one sheet. The
// repair is to derive render order from that array, and this test locks that derivation as still
// true: change the array order and the screen order must follow, and a screen that ignores the array
// turns this red.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AgentClientButtons } from "./AgentClientButtons";
import { AGENT_CLIENTS } from "@/entities/vault-session";
import ko from "../../../../messages/ko.json";

const CLIENT_TESTID: Record<string, string> = {
  "claude-code": "agent-client-claude-code",
  codex: "agent-client-codex",
  cursor: "agent-client-cursor",
  antigravity: "agent-client-antigravity",
};

function renderButtons() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AgentClientButtons
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

describe("AgentClientButtons — 렌더 순서는 AGENT_CLIENTS 에서 파생된다", () => {
  it("renders one control per client, in AGENT_CLIENTS order", () => {
    renderButtons();
    const container = screen.getByTestId("agent-client-buttons");
    const controls = [...container.querySelectorAll("[data-testid^='agent-client-']")].filter(
      (el) => el.getAttribute("data-testid") !== "agent-client-app-cta",
    );
    const renderedIds = controls.map((el) => el.getAttribute("data-testid"));
    const expectedIds = AGENT_CLIENTS.map((client) => CLIENT_TESTID[client.id]);
    // Equality including order — the same set in a different order is still a defect.
    expect(renderedIds).toEqual(expectedIds);
  });

  it("probe: the expected order really comes from the array, not a copy", () => {
    // Proves for itself that the expectation follows the array automatically — duplicating the
    // expectation as a literal would make this test a second truth.
    const expectedIds = AGENT_CLIENTS.map((client) => CLIENT_TESTID[client.id]);
    expect(expectedIds).toHaveLength(AGENT_CLIENTS.length);
    expect(new Set(expectedIds).size).toBe(AGENT_CLIENTS.length);
  });
});

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
