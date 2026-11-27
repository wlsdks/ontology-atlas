import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the folder-watch bridge alive: the app uses an OS watcher with a 500ms debounce, and the
 * front end listens for the event it emits.
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
});
