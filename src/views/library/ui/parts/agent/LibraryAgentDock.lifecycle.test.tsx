import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../../messages/en.json";

/**
 * The dock with the real conversation panel: closing must not call `stopAcpSession`.
 * `bridge.stopped` is the call that ends the child process.
 */
const bridge = vi.hoisted(() => ({
  sent: [] as Array<Record<string, unknown>>,
  listener: null as ((line: string) => void) | null,
  stopped: [] as string[],
  started: 0,
}));

vi.mock("@/shared/lib/agent-chat/tauri-acp", () => ({
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
  listenToAcpSession: async (
    _id: string,
    handlers: { onMessage?: (line: string) => void },
  ) => {
    bridge.listener = handlers.onMessage ?? null;
    return () => {
      bridge.listener = null;
    };
  },
}));

import { AcpChatPanelKeeper } from "@/widgets/acp-chat-panel";
import { LibraryAgentDock } from "./LibraryAgentDock";

function emit(payload: unknown) {
  bridge.listener?.(JSON.stringify(payload));
}

function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((message) => message.method === method);
  emit({ jsonrpc: "2.0", id: call?.id, result });
}

const RUNTIME = { id: "claude-acp", label: "Claude Agent" };

function dock(open: boolean) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AcpChatPanelKeeper />
      <LibraryAgentDock
        chatWidth={{ width: 420, setWidth: () => {}, commitWidth: () => {} }}
        open={open}
        runtime={RUNTIME}
        runtimes={[RUNTIME]}
        onRuntimeChange={() => {}}
        vaultRoot="/Users/probe/atlas"
        mcpServers={[{ name: "atlas-vault" }]}
        openingRequest={null}
        knownSlugs={new Set()}
        onClose={() => {}}
      />
    </NextIntlClientProvider>
  );
}

/** Every other screen: the keeper above the routes stays, the Library is gone. */
function elsewhere() {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AcpChatPanelKeeper />
    </NextIntlClientProvider>
  );
}

/** Below `xl` the dock has no width transition to wait for, so the session starts on a frame. */
function narrowViewport() {
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
}

/** Opens the dock and takes the session all the way to ready, resuming nothing. */
async function openWithSession() {
  narrowViewport();
  const view = render(dock(true));
  await waitFor(() => expect(bridge.sent.some((m) => m.method === "initialize")).toBe(true));
  replyTo("initialize", { protocolVersion: 1 });
  // The Library dock asks for the folder's latest conversation; this folder has none.
  await waitFor(() => expect(bridge.sent.some((m) => m.method === "session/list")).toBe(true));
  replyTo("session/list", { sessions: [] });
  await waitFor(() => expect(bridge.sent.some((m) => m.method === "session/new")).toBe(true));
  replyTo("session/new", { sessionId: "s-1" });
  await waitFor(() =>
    expect(screen.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "ready"),
  );
  return {
    ...view,
    close: () => view.rerender(dock(false)),
    reopen: () => view.rerender(dock(true)),
  };
}

/**
 * The exit window has closed when the frame says `put-away` — the same fact the screen
 * shows. Sleeping 400 ms instead asserted `EXIT_WINDOW_MS` is under 400, which is a claim
 * about a constant this file does not read and a clock it cannot control.
 */
async function pastTheExitWindow() {
  await waitFor(() =>
    expect(
      screen.getByTestId("library-agent-dock-frame").getAttribute("data-dock-state"),
    ).toBe("put-away"),
  );
}

afterEach(() => {
  /*
   * Unmount **before** the counters are cleared. Testing Library's automatic cleanup runs after
   * this hook, so the previous case's unmount — which really does stop the session — would land
   * its `acp_stop` in the next case's freshly emptied list and read as a close that killed the
   * adapter.
   */
  cleanup();
  bridge.sent = [];
  bridge.listener = null;
  bridge.stopped = [];
  bridge.started = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pressing X on the Library dock", () => {
  it("does not end the adapter process", async () => {
    const view = await openWithSession();
    view.close();
    await pastTheExitWindow();
    expect(bridge.stopped, "closing the dock killed the adapter — the 2026-09-08 report").toEqual(
      [],
    );
    expect(screen.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "ready");
  });

  it("keeps a turn in flight running while the dock is shut", async () => {
    const view = await openWithSession();
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { text: "Reading the sources" } } },
    });
    await screen.findByText("Reading the sources");
    view.close();
    await pastTheExitWindow();
    // The agent answers into a closed dock, and the answer lands in the same conversation.
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { text: " and writing them up." } } },
    });
    await screen.findByText("Reading the sources and writing them up.");
    expect(bridge.stopped).toEqual([]);
  });

  it("shows the same conversation again on reopening, without opening a second one", async () => {
    const view = await openWithSession();
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { text: "Four sources are waiting." } } },
    });
    await screen.findByText("Four sources are waiting.");
    view.close();
    await pastTheExitWindow();
    view.reopen();
    await act(async () => {});
    expect(screen.getByText("Four sources are waiting.")).toBeInTheDocument();
    expect(bridge.started).toBe(1);
    expect(bridge.sent.filter((message) => message.method === "session/new")).toHaveLength(1);
  });

  it("ends the adapter after ten idle minutes put away, and reopening resumes that conversation", async () => {
    const view = await openWithSession();
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { text: "Four sources are waiting." } } },
    });
    await screen.findByText("Four sources are waiting.");
    vi.useFakeTimers();
    view.close();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(bridge.stopped).toEqual(["acp-1"]);
    vi.useRealTimers();
    view.reopen();
    await waitFor(() => expect(bridge.started).toBe(2));
    await waitFor(() => expect(bridge.sent.filter((m) => m.method === "initialize")).toHaveLength(2));
    replyTo("initialize", { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === "session/load")).toBe(true));
    const load = bridge.sent.find((m) => m.method === "session/load");
    expect((load?.params as { sessionId?: string } | undefined)?.sessionId).toBe("s-1");
    replyTo("session/load", { sessionId: "s-1" });
    await waitFor(() =>
      expect(screen.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "ready"),
    );
    expect(screen.getByText("Four sources are waiting.")).toBeInTheDocument();
    expect(bridge.sent.filter((m) => m.method === "session/new")).toHaveLength(1);
  });

  it("ends an idle conversation when the Library itself goes away", async () => {
    const view = await openWithSession();
    view.rerender(elsewhere());
    await waitFor(() => expect(bridge.stopped).toEqual(["acp-1"]));
  });

  it("keeps a turn in flight running when the Library itself goes away, and its answer lands", async () => {
    const view = await openWithSession();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Check the wiki" } });
    fireEvent.click(screen.getByTestId("acp-chat-send"));
    await waitFor(() => expect(bridge.sent.some((m) => m.method === "session/prompt")).toBe(true));
    await waitFor(() => expect(screen.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "thinking"));
    view.rerender(elsewhere());
    await act(async () => {});
    expect(bridge.stopped).toEqual([]);
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { text: "Three findings." } } },
    });
    replyTo("session/prompt", { stopReason: "end_turn" });
    await waitFor(() => expect(document.querySelector("[data-kept-agent-parking]")).toHaveTextContent("Three findings."));
    expect(bridge.stopped).toEqual([]);
  });
});
