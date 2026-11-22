import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the folder-watch bridge alive on both surfaces. The app uses an OS watcher with a 500ms
 * debounce and has no polling fallback; the web polls adaptively. This is latency, not degradation,
 * so it is a different gate from `DEGRADED_SURFACES`.
 */

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("folder watch bridge", () => {
  it("app side: the Rust watcher emits vault-changed with a debounce", () => {
    const rust = read("src-tauri/src/vault/watch.rs");
    expect(rust, "the start_vault_watch command disappeared").toContain("start_vault_watch");
    expect(rust, "the vault-changed event name changed — it breaks the pairing with the frontend listener").toContain(
      "vault-changed",
    );
    expect(
      rust,
      "The debouncer is gone. An editor's burst of writes leaks straight through and every save " +
        "runs a full refresh: the 'instant' the video sells becomes a 'flicker'.",
    ).toContain("new_debouncer");
  });

  it("front-end side: there is a bridge that really listens for that event", () => {
    const bridge = read("src/entities/vault-session/model/vault-provider/TauriVaultWatchBridge.tsx");
    expect(bridge).toContain("start_vault_watch");
    expect(
      bridge,
      "Without a listener the screen does nothing when Rust emits the event, " +
        "which is the quietest kind of failure.",
    ).toContain("vault-changed");
  });

  it("web side: the polling fallback is alive — the web is not 'unable' but 'late'", () => {
    const cadence = read("src/entities/vault-session/model/local-vault/poll-cadence.test.ts");
    expect(
      cadence,
      "Without the polling cadence the web build really cannot see file changes. Then " +
        "this capability moves to the degraded axis and needs a DEGRADED_SURFACES entry.",
    ).toMatch(/burstMs|idleMs/);
  });
});
