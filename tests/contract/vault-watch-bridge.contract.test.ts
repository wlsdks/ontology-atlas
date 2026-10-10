import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate keeping **the folder-watch bridge alive on both surfaces.**
 *
 * ## Why it exists
 *
 * Measured while judging the demo video's scenario on 2026-07-29: the *immediacy* in
 * "edit a file and the map follows instantly" **is itself a desktop-only
 * capability** (the app uses an OS watcher with a 500ms debounce; the web uses
 * adaptive polling). The video sells that capability, and it was **not registered**
 * in the capability bridge table (`.claude/rules/surfaces.md`) — that table had five
 * rows and this was the sixth.
 *
 * An unregistered capability is protected by nobody. If the watcher silently breaks,
 * the app **does nothing at all** (unlike the web it has no polling fallback), while
 * the video keeps selling the capability.
 *
 * ## Why not `DEGRADED_SURFACES`
 *
 * Every row in that registry claims *"a browser cannot do this in principle → the
 * only destination is `/download/`"*. For folder watching that claim is **false**:
 * the web catches up eventually, and what differs is *when*. Adding it there makes
 * the next auditor read "the web cannot see file changes". This is **latency, not
 * degradation** — a different axis, and a different axis means a different gate.
 */

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("폴더 감시 브리지", () => {
  it("앱 쪽: Rust 워처가 디바운스와 함께 vault-changed 를 emit 한다", () => {
    const rust = read("src-tauri/src/vault/watch.rs");
    expect(rust, "start_vault_watch 커맨드가 사라졌다").toContain("start_vault_watch");
    expect(rust, "vault-changed 이벤트 이름이 바뀌었다 — 프런트 리스너와 짝이 깨진다").toContain(
      "vault-changed",
    );
    expect(
      rust,
      "The debouncer is gone. An editor's burst of writes leaks straight through and every save " +
        "runs a full refresh: the 'instant' the video sells becomes a 'flicker'.",
    ).toContain("new_debouncer");
  });

  it("프런트 쪽: 그 이벤트를 실제로 듣는 다리가 있다", () => {
    const bridge = read("src/entities/vault-session/model/TauriVaultWatchBridge.tsx");
    expect(bridge).toContain("start_vault_watch");
    expect(
      bridge,
      "Without a listener the screen does nothing when Rust emits the event, " +
        "which is the quietest kind of failure.",
    ).toContain("vault-changed");
  });

  it("웹 쪽: 폴링 폴백이 살아 있다 — 웹이 '못 하는' 게 아니라 '늦는' 것이다", () => {
    const cadence = read("src/entities/vault-session/model/poll-cadence.test.ts");
    expect(
      cadence,
      "Without the polling cadence the web build really cannot see file changes. Then " +
        "this capability moves to the degraded axis and needs a DEGRADED_SURFACES entry.",
    ).toMatch(/burstMs|idleMs/);
  });
});
