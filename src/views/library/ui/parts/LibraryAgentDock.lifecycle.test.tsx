import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";

/**
 * **The dock with the real conversation panel inside it.**
 *
 * The sibling file mocks the panel to measure the frame; this one keeps the panel, because the
 * defect the owner reported is not in either piece — it is in the seam between them. Closing the
 * dock unmounted `AcpChatPanel`, `useAcpSession`'s cleanup ran `stop()`, and `stopAcpSession`
 * ended the adapter process mid-turn. Nothing in either file alone can see that.
 *
 * So this measures the two facts a person actually reported: **the process is not killed** when
 * they press X, and **the conversation they were having is still there** when they come back.
 * `bridge.stopped` is the proof for the first — it is the exact call that ends the child.
 */
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
      params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "Reading the sources" } } },
    });
    await screen.findByText("Reading the sources");
    view.close();
    await pastTheExitWindow();
    // The agent answers into a closed dock, and the answer lands in the same conversation.
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { text: " and writing them up." } } },
    });
    await screen.findByText("Reading the sources and writing them up.");
    expect(bridge.stopped).toEqual([]);
  });

  it("shows the same conversation again on reopening, without opening a second one", async () => {
    const view = await openWithSession();
    emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "Four sources are waiting." } } },
    });
    await screen.findByText("Four sources are waiting.");
    view.close();
    await pastTheExitWindow();
    view.reopen();
    await act(async () => {});
    expect(screen.getByText("Four sources are waiting.")).toBeInTheDocument();
    // One process, one conversation. A second `session/new` is the blank screen the owner met.
    expect(bridge.started).toBe(1);
    expect(bridge.sent.filter((message) => message.method === "session/new")).toHaveLength(1);
  });

  it("ends the conversation when the Library itself goes away", async () => {
    const view = await openWithSession();
    view.unmount();
    await act(async () => {});
    // Background work belongs to this screen. Leaving it is not putting the dock away.
    await waitFor(() => expect(bridge.stopped).toEqual(["acp-1"]));
  });
});
