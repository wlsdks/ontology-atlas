import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";

import {
  clearArrivalMemory,
  readArrivalMemory,
  useArrivalMemory,
  writeArrivalMemory,
} from "./route-arrival-memory";

/**
 * The contract `AtlasGitPanel`, `AcpRuntimeSettings`, `HomePage` and `DocsVaultViewer` rely
 * on. Each case is one of the ways the flicker could come back.
 */
describe("useArrivalMemory", () => {
  beforeEach(() => {
    clearArrivalMemory();
  });

  /**
   * Resolves a value and waits for the memory write.
   *
   * The write is deferred into a microtask on purpose — `tests/contract/pure-updater.
   * contract.test.ts` forbids a side effect inside a state updater, and this is the deferral
   * that contract prescribes. In the app the next reader is a later mount after a click, so a
   * microtask is early by a wide margin; in a test the unmount happens in the same task, so
   * the flush has to be explicit.
   */
  async function resolveAndFlush(name = "resolve") {
    await act(async () => {
      screen.getByRole("button", { name }).click();
      await Promise.resolve();
    });
  }

  function Probe({ memoryKey }: { memoryKey: string | null }) {
    const [value, set] = useArrivalMemory<string | null>(memoryKey, null);
    return (
      <div>
        <span data-testid="value">{value ?? "none"}</span>
        <button type="button" onClick={() => set("resolved")}>
          resolve
        </button>
      </div>
    );
  }

  it("starts at the fallback when nothing has been remembered", () => {
    render(<Probe memoryKey="probe" />);
    expect(screen.getByTestId("value")).toHaveTextContent("none");
  });

  /**
   * ★ The defect this module exists for. A pane that unmounts on a route change and mounts
   * again must **not** be back at the fallback, because that fallback is what the route
   * crossfade captures.
   */
  it("a remount is already holding what the previous mount resolved", async () => {
    const first = render(<Probe memoryKey="probe" />);
    await resolveAndFlush();
    expect(screen.getByTestId("value")).toHaveTextContent("resolved");
    first.unmount();

    render(<Probe memoryKey="probe" />);
    expect(screen.getByTestId("value")).toHaveTextContent("resolved");
  });

  /**
   * ★ The counterpart guard. `app/providers/AppShell.tsx` carries a whole boundary because a
   * pane once painted one vault's data while another was mounted; memory keyed on the wrong
   * thing would put that defect straight back.
   */
  it("a different key never sees another key's value", async () => {
    const first = render(<Probe memoryKey="vault-a" />);
    await resolveAndFlush();
    first.unmount();

    render(<Probe memoryKey="vault-b" />);
    expect(screen.getByTestId("value")).toHaveTextContent("none");
  });

  /** A key that changes while mounted re-derives in the same render — no extra painted frame. */
  it("re-derives during render when the key changes under a live component", () => {
    function Switcher() {
      const [memoryKey, setKey] = useState("vault-a");
      return (
        <div>
          <Probe memoryKey={memoryKey} />
          <button type="button" onClick={() => setKey("vault-b")}>
            switch
          </button>
        </div>
      );
    }
    writeArrivalMemory("vault-a", "a-value");
    writeArrivalMemory("vault-b", "b-value");
    render(<Switcher />);
    expect(screen.getByTestId("value")).toHaveTextContent("a-value");
    act(() => {
      screen.getByRole("button", { name: "switch" }).click();
    });
    expect(screen.getByTestId("value")).toHaveTextContent("b-value");
  });

  /** `null` means "there is nothing to key this on yet", so nothing is written. */
  it("a null key remembers nothing", async () => {
    render(<Probe memoryKey={null} />);
    await resolveAndFlush();
    expect(screen.getByTestId("value")).toHaveTextContent("resolved");
    expect(readArrivalMemory("null")).toBeUndefined();
  });

  /** Memory is per key and lives in module scope, not in any React tree. */
  it("reads and writes outside React agree with the hook", () => {
    writeArrivalMemory("probe", "seeded");
    render(<Probe memoryKey="probe" />);
    expect(screen.getByTestId("value")).toHaveTextContent("seeded");
    expect(readArrivalMemory<string>("probe")).toBe("seeded");
  });
});
