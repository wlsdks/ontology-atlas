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
    const rust = read("src-tauri/src/lib.rs");
    expect(rust, "start_vault_watch 커맨드가 사라졌다").toContain("start_vault_watch");
    expect(rust, "vault-changed 이벤트 이름이 바뀌었다 — 프런트 리스너와 짝이 깨진다").toContain(
      "vault-changed",
    );
    expect(
      rust,
      "디바운서가 사라졌다. 에디터의 다중 write 가 그대로 새어 나와 매 저장마다 " +
        "전체 refresh 가 돈다 — 영상이 파는 '즉시'가 '깜빡임'이 된다.",
    ).toContain("new_debouncer");
  });

  it("프런트 쪽: 그 이벤트를 실제로 듣는 다리가 있다", () => {
    const bridge = read("src/entities/vault-session/model/TauriVaultWatchBridge.tsx");
    expect(bridge).toContain("start_vault_watch");
    expect(
      bridge,
      "리스너가 없으면 Rust 가 이벤트를 쏴도 화면은 아무 일도 하지 않는다 — " +
        "가장 조용한 종류의 고장이다.",
    ).toContain("vault-changed");
  });

  it("웹 쪽: 폴링 폴백이 살아 있다 — 웹이 '못 하는' 게 아니라 '늦는' 것이다", () => {
    const cadence = read("src/entities/vault-session/model/poll-cadence.test.ts");
    expect(
      cadence,
      "폴링 케이던스가 사라지면 웹은 파일 변화를 정말로 못 보게 된다. 그러면 " +
        "이 능력은 강등 축으로 넘어가고 DEGRADED_SURFACES 등재가 필요해진다.",
    ).toMatch(/burstMs|idleMs/);
  });
});
