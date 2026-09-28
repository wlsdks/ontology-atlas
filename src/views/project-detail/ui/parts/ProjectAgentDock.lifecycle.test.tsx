import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";

const bridge = vi.hoisted(() => ({
  sent: [] as Array<Record<string, unknown>>,
  listener: null as ((line: string) => void) | null,
  stopped: [] as string[],
  started: 0,
}));

vi.mock("@/shared/lib/tauri-acp", () => ({
  isAcpBridgeAvailable: () => true,
  startAcpSession: async () => {
    bridge.started += 1;
    return `acp-${bridge.started}`;
  },
  sendAcpLine: async (_id: string, line: string) => {
    bridge.sent.push(JSON.parse(line));
  },
  stopAcpSession: async (id: string) => {
    bridge.stopped.push(id);
  },
  acpPermissionVerdict: async () => "ask",
  listenToAcpSession: async (_id: string, handlers: { onMessage?: (line: string) => void }) => {
    bridge.listener = handlers.onMessage ?? null;
    return () => {
      bridge.listener = null;
    };
  },
}));

import { ProjectAgentDock } from "./ProjectAgentDock";

const RUNTIME = { id: "claude-acp", label: "Claude Agent" };

function dock(open: boolean) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectAgentDock
        open={open}
        projectName="Atlas"
        runtime={RUNTIME}
        runtimes={[RUNTIME]}
        onRuntimeChange={() => {}}
        vaultRoot="/Users/probe/atlas"
        mcpServers={[{ name: "atlas-vault" }]}
        openingRequest={null}
        knownSlugs={new Set()}
        onClose={() => {}}
        chatWidth={{ width: 420, setWidth: () => {}, commitWidth: () => {} }}
      />
    </NextIntlClientProvider>
  );
}

function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((message) => message.method === method);
  bridge.listener?.(JSON.stringify({ jsonrpc: "2.0", id: call?.id, result }));
}

afterEach(() => {
  cleanup();
  bridge.sent = [];
  bridge.listener = null;
  bridge.stopped = [];
  bridge.started = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the project dock put away", () => {
  it("ends the adapter after ten idle minutes, not at the close", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const view = render(dock(true));
    await waitFor(() => expect(bridge.sent.some((m) => m.method === "initialize")).toBe(true));
    replyTo("initialize", { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === "session/list")).toBe(true));
    replyTo("session/list", { sessions: [] });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === "session/new")).toBe(true));
    replyTo("session/new", { sessionId: "s-1" });
    await waitFor(() =>
      expect(screen.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "ready"),
    );
    vi.useFakeTimers();
    view.rerender(dock(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
    });
    expect(bridge.stopped).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(bridge.stopped).toEqual(["acp-1"]);
  });
});
