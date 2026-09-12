import { act, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { LibraryAgentDock } from "./LibraryAgentDock";

const sessionEnabledSeen: boolean[] = [];
const terminalToolCallbacks: unknown[] = [];

vi.mock("@/widgets/acp-chat-panel", () => ({
  AcpChatPanel: ({
    sessionEnabled,
    resumeLatest,
    onTerminalToolObservation,
  }: {
    sessionEnabled?: boolean;
    resumeLatest?: boolean;
    onTerminalToolObservation?: unknown;
  }) => {
    sessionEnabledSeen.push(sessionEnabled === true);
    terminalToolCallbacks.push(onTerminalToolObservation);
    return (
      <div
        data-testid="chat-panel"
        data-session-enabled={sessionEnabled ? "true" : "false"}
        data-resume-latest={resumeLatest ? "true" : "false"}
      />
    );
  },
  AcpChatResizeHandle: () => null,
  AcpDockHeader: () => null,
  useChatWidth: () => ({ width: 420, setWidth: () => {}, commitWidth: () => {} }),
}));

const RUNTIME = { id: "claude-acp", label: "Claude Agent" };

function dock(open: boolean, onTerminalToolObservation?: () => void) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LibraryAgentDock
        chatWidth={{ width: 420, setWidth: () => {}, commitWidth: () => {} }}
        open={open}
        runtime={RUNTIME}
        runtimes={[RUNTIME]}
        onRuntimeChange={() => {}}
        vaultRoot="/Users/probe/atlas"
        mcpServers={[]}
        openingRequest={{ kind: "lint", text: "Check the wiki", nonce: 1 }}
        knownSlugs={new Set()}
        onClose={() => {}}
        onTerminalToolObservation={onTerminalToolObservation}
      />
    </NextIntlClientProvider>
  );
}

function mount(width: "wide" | "narrow") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: width === "wide" && query.includes("1280"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
  const view = render(dock(true));
  return { ...view, close: () => view.rerender(dock(false)), reopen: () => view.rerender(dock(true)) };
}

afterEach(() => {
  sessionEnabledSeen.length = 0;
  terminalToolCallbacks.length = 0;
  vi.restoreAllMocks();
});

describe("a dock mounted while already open", () => {
  /*
   * The page remounts the dock when it drops and regains its folder; the frame is born at
   * full width, so no width transition ends. Measured on the installed app 2026-09-06: at
   * xl the session waited on that `transitionend` forever and the panel sat on "Connecting".
   */
  it("enables the session when opened with no request at all — the Conversation chip", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const { getByTestId } = mount("wide");
    await act(async () => {});
    expect(getByTestId("chat-panel").getAttribute("data-session-enabled")).toBe("true");
  });
  it("enables the session at xl without waiting for a width transition", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const { getByTestId } = mount("wide");
    await act(async () => {});
    expect(getByTestId("chat-panel").getAttribute("data-session-enabled")).toBe("true");
  });

  it("still enables below xl, where the overlay never reflows", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const { getByTestId } = mount("narrow");
    await act(async () => {});
    expect(getByTestId("chat-panel").getAttribute("data-session-enabled")).toBe("true");
  });
});

describe("terminal tool observations", () => {
  it("forwards the Library receipt bridge to its chat panel", () => {
    const callback = () => {};
    render(dock(true, callback));
    expect(terminalToolCallbacks).toContain(callback);
  });
});

/**
 * Owner, installed app, 2026-09-08: *"if I press X while it is working, the work seems to just
 * stop."* It did. `Surface` unmounts its children when its exit window closes, and the panel's ACP
 * session stops itself on unmount — so the press killed the adapter process and the transcript.
 * These cases measure the mount, which is what the session's life hangs on.
 */
describe("closing the dock puts the conversation away", () => {
  function settleFrames() {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  }

  /**
   * The exit window has closed when the frame says `put-away` — the same fact the screen
   * shows. Sleeping 400 ms instead asserted `EXIT_WINDOW_MS` is under 400, which is a
   * claim about a constant the test does not read and a clock it cannot control.
   */
  async function pastTheExitWindow(view: ReturnType<typeof mount>) {
    await waitFor(() =>
      expect(
        view.getByTestId("library-agent-dock-frame").getAttribute("data-dock-state"),
      ).toBe("put-away"),
    );
  }

  it("keeps the panel mounted after the exit window has closed", async () => {
    settleFrames();
    const view = mount("narrow");
    await act(async () => {});
    view.close();
    await pastTheExitWindow(view);
    expect(view.queryByTestId("chat-panel")).not.toBeNull();
  });

  it("puts the shut frame out of reach — hidden is not the same as unreachable", async () => {
    settleFrames();
    const view = mount("narrow");
    await act(async () => {});
    const frame = view.getByTestId("library-agent-dock-frame");
    expect(frame.hasAttribute("inert")).toBe(false);
    expect(frame.getAttribute("aria-hidden")).toBeNull();
    view.close();
    await pastTheExitWindow(view);
    expect(frame.hasAttribute("inert")).toBe(true);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
  });

  it("hands the session back on reopening rather than building a second one", async () => {
    settleFrames();
    const view = mount("narrow");
    await act(async () => {});
    const panel = view.getByTestId("chat-panel");
    view.close();
    await pastTheExitWindow(view);
    view.reopen();
    await act(async () => {});
    // The same DOM node, so React never unmounted it — the ACP session behind it is the one
    // the person left running.
    expect(view.getByTestId("chat-panel")).toBe(panel);
    expect(view.getByTestId("library-agent-dock-frame").getAttribute("data-dock-state")).toBe(
      "open",
    );
    expect(view.getByTestId("chat-panel").getAttribute("data-session-enabled")).toBe("true");
  });

  it("draws nothing at all before the first opening", () => {
    settleFrames();
    const view = render(dock(false));
    expect(view.queryByTestId("chat-panel")).toBeNull();
    expect(view.getByTestId("library-agent-dock-frame").getAttribute("data-dock-state")).toBe(
      "empty",
    );
  });

  it("asks the panel to reopen on the folder's latest conversation", async () => {
    settleFrames();
    const view = mount("narrow");
    await act(async () => {});
    expect(view.getByTestId("chat-panel").getAttribute("data-resume-latest")).toBe("true");
  });
});
