import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * ACP harness — the Tauri IPC bridge (`src-tauri/src/acp.rs` plus the five commands in
 * `lib.rs`).
 *
 * Contract (the Rust code is the source of truth):
 * - `acp_detect_runtimes()` → `AcpRuntimeStatus[]` — what exists on this machine
 * - `acp_start(runtimeId, cwd)` → session name — spawns the process
 * - `acp_send(sessionId, line)` → send one line (Rust appends the newline)
 * - `acp_stop(sessionId)` → ends that session **and everything it spawned**
 * - `acp_permission_verdict(sessionId, filePath)` → `allow-inside-vault` | `ask`
 *
 * Four events come up from the child: `acp://message` (one protocol line),
 * `acp://stderr` (diagnostics), `acp://exit` (finished), `acp://notice` (dropped lines
 * and similar).
 *
 * **Web degradation contract.** A browser cannot spawn a process — not a gap, an
 * impossibility. Outside the Tauri runtime `isAcpBridgeAvailable()` is false and every
 * wrapper returns `null`. Callers must state **why it cannot work and where it can**,
 * never "coming soon" (`.claude/rules/surfaces.md`).
 *
 * **The verdict is not reimplemented here.** The permission policy (allow inside the
 * vault, ask outside it) lives only in Rust. A second copy means one of them drifts
 * looser, and the looser one is the copy the user sees. The verdict also has to resolve
 * symlinks and normalise the ancestors of paths that do not exist yet, which the browser
 * cannot do accurately in the first place.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

export function isAcpBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/** Rust `AcpRuntimeStatus` (serde camelCase). */
export interface AcpRuntimeStatus {
  id: string;
  label: string;
  description: string;
  website: string | null;
  license: string | null;
  /**
   * Have we **actually tested** this runtime. Present so the screen cannot claim
   * something was verified when it never was.
   */
  verified: boolean;
  /** Path to the bundled icon (`/acp-icons/<id>.svg`), or null. */
  icon: string | null;
  /**
   * The vendor's brand colour (`#RRGGBB`). Registry icons are all monochrome by
   * registration rule, so colour is attached separately at build time. Only pairs a
   * **human confirmed** carry a value — auto-matching by name puts the wrong colour on
   * someone else's brand, which is worse than no colour. Null renders greyscale.
   */
  brandInk: string | null;
  launchKind: 'npx' | 'uvx' | 'binary';
  /**
   * `ready` — **found** on this machine; it can be launched.
   * `cli-unknown` — launchable, but **we have no way yet to check whether the tool is
   *   installed** (the executable name that adapter wraps was never recorded). Work left
   *   on our side, not the user's.
   * `login-needed` — the tool is there but **not logged in**; one login in that tool
   *   fixes it. Without this branch the screen says "ready" and then dies with
   *   `Authentication required` only when a conversation opens (owner report,
   *   2026-08-16).
   * `cli-missing` — the tool must be installed.
   * `node-missing` — the tool is there, but there is no Node to run the adapter.
   * `uvx-missing` — likewise, no uv.
   * `binary-missing` — a manually installed executable is absent.
   *
   * These seven are never collapsed into installed/not-installed — each implies a
   * different next action. Merging `ready` with `cli-unknown` in particular makes the
   * screen **report as verified something it never checked** (2026-08-16: 20 of 38 were
   * in that state).
   */
  state:
    | 'ready'
    | 'login-needed'
    | 'cli-unknown'
    | 'cli-missing'
    | 'node-missing'
    | 'uvx-missing'
    | 'binary-missing';
  cliPath: string | null;
  adapterPath: string | null;
  adapterPackage: string | null;
  /**
   * Can the app isolate this runtime's configuration.
   *
   * **False means there is no permission checkpoint.** The tool's own configuration is
   * used as-is, so someone who set it to "never ask" gets no prompt even when launched
   * from the app. The screen must state that on the row — never omit it or leave it
   * implicit.
   */
  isolated: boolean;
}

/**
 * Runtime status on this machine.
 *
 * With `probeLogin` on, each CLI is actually launched to check login state. That is the
 * only slow part of this call (measured: claude 300ms, codex 45ms), so it is off by
 * default — the screen **paints first and corrects later** (owner, 2026-08-16:
 * *"Let it load first and update after."*, let it load first and update after).
 */
export async function detectAcpRuntimes(
  options?: { probeLogin?: boolean },
): Promise<AcpRuntimeStatus[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<AcpRuntimeStatus[]>('acp_detect_runtimes', {
    probeLogin: options?.probeLogin ?? false,
  });
}

export async function startAcpSession(
  runtimeId: string,
  cwd: string,
): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('acp_start', { runtimeId, cwd });
}

export async function sendAcpLine(sessionId: string, line: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke<void>('acp_send', { sessionId, line });
}

export async function stopAcpSession(sessionId: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke<void>('acp_stop', { sessionId });
}

export type AcpPermissionVerdict = 'allow-inside-vault' | 'ask';

/**
 * Is this path inside the vault. **An unknown path is `ask`** — the less a request can be
 * judged, the less it may pass unchallenged. No bridge (web) is `ask` as well.
 */
export async function acpPermissionVerdict(
  sessionId: string,
  filePath: string | null,
): Promise<AcpPermissionVerdict> {
  const invoke = getInvoke();
  if (!invoke) return 'ask';
  return invoke<AcpPermissionVerdict>('acp_permission_verdict', {
    sessionId,
    filePath,
  });
}

export interface AcpLineEvent {
  sessionId: string;
  line: string;
}

export interface AcpExitEvent {
  sessionId: string;
  code: number | null;
}

export interface AcpNoticeEvent {
  sessionId: string;
  message: string;
}

/**
 * Listens to one session's events. Calling the returned function detaches all of them.
 *
 * **Filtering out other sessions' lines happens here.** Leaving each caller to re-write
 * that filter means one of them eventually forgets, and then two conversations receive
 * each other's messages.
 */
export async function listenToAcpSession(
  sessionId: string,
  handlers: {
    onMessage?: (line: string) => void;
    onStderr?: (line: string) => void;
    onNotice?: (message: string) => void;
    onExit?: (code: number | null) => void;
  },
): Promise<() => void> {
  if (!isAcpBridgeAvailable()) return () => {};
  const unlisteners = await Promise.all([
    listen<AcpLineEvent>('acp://message', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onMessage?.(event.payload.line);
    }),
    listen<AcpLineEvent>('acp://stderr', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onStderr?.(event.payload.line);
    }),
    listen<AcpNoticeEvent>('acp://notice', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onNotice?.(event.payload.message);
    }),
    listen<AcpExitEvent>('acp://exit', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onExit?.(event.payload.code);
    }),
  ]);
  return () => {
    for (const off of unlisteners) off();
  };
}
