import { act, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { LibraryAgentDock } from "./LibraryAgentDock";

const sessionEnabledSeen: boolean[] = [];

vi.mock("@/widgets/acp-chat-panel", () => ({
  AcpChatPanel: ({ sessionEnabled }: { sessionEnabled?: boolean }) => {
    sessionEnabledSeen.push(sessionEnabled === true);
    return <div data-testid="chat-panel" data-session-enabled={sessionEnabled ? "true" : "false"} />;
  },
  AcpChatResizeHandle: () => null,
  AcpDockHeader: () => null,
  useChatWidth: () => ({ width: 420, setWidth: () => {}, commitWidth: () => {} }),
}));

const RUNTIME = { id: "claude-acp", label: "Claude Agent" };

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
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LibraryAgentDock
        open
        runtime={RUNTIME}
        runtimes={[RUNTIME]}
        onRuntimeChange={() => {}}
        vaultRoot="/Users/probe/atlas"
        mcpServers={[]}
        openingRequest={{ kind: "lint", text: "Check the wiki", nonce: 1 }}
        knownSlugs={new Set()}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  sessionEnabledSeen.length = 0;
  vi.restoreAllMocks();
});

describe("a dock mounted while already open", () => {
  /*
   * The page remounts the dock when it drops and regains its folder; the frame is born at
   * full width, so no width transition ends. Measured on the installed app 2026-09-06: at
   * xl the session waited on that `transitionend` forever and the panel sat on "Connecting".
   */
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
