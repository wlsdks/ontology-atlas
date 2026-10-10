import { Channel, invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * ACP harness — the Tauri IPC bridge (`src-tauri/src/acp/` plus the five commands in
 * `acp_session`).
 *
 * Contract (the Rust code is the source of truth):
 * - `acp_detect_runtimes()` → `AcpRuntimeStatus[]` — what exists on this machine
 * - `acp_start(runtimeId, cwd, onEvent)` → session name — spawns the process
 * - `acp_send(sessionId, line)` → send one line (Rust appends the newline)
 * - `acp_stop(sessionId)` → ends that session **and everything it spawned**
 * - `acp_permission_verdict(sessionId, filePath)` → `allow-inside-vault` | `ask`
 *
 * Four kinds of event come up the session's own channel: `message` (one protocol line),
 * `stderr` (diagnostics), `exit` (finished), `notice` (dropped lines and similar).
 *
 * Outside Tauri, detection/start return null, send/stop are no-ops, and path
 * permissions return ask. Callers use the existing desktop-only explanations.
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
   * `login-unknown` — we asked whether it is signed in and **could not get an answer**. Not the
   *   same as `cli-unknown` (never asked) and not the same as `login-needed` (asked, told no).
   *   Under load, right after an in-app session ended, both measured
   *   runtimes wore 「Sign in needed」 while the same commands exited 0 from a shell. The tool is
   *   present and launchable, so this row stays usable — only the claim is withdrawn.
   * `cli-missing` — the tool must be installed.
   * `node-missing` — the tool is there, but there is no Node to run the adapter.
   * `uvx-missing` — likewise, no uv.
   * `binary-missing` — a manually installed executable is absent.
   *
   * These eight are never collapsed into installed/not-installed — each implies a
   * different next action. Merging `ready` with `cli-unknown` in particular makes the
   * screen **report as verified something it never checked** (20 of 38 were
   * in that state).
   */
  state:
    | 'ready'
    | 'login-needed'
    | 'login-unknown'
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
   * **False means there is no app-owned permission checkpoint.** The tool's own configuration is
   * used as-is, and a session mode is not enough to guard MCP writes. The summary before the list
   * must state that only guarded runtimes can open in-app chat.
   */
  isolated: boolean;
}

/** One `claude auth status` launch measured 88 MB; answers are reused this long. */
const LOGIN_CHECK_REUSE_MS = 60_000;
let lastLoginCheck: { startedAt: number; answer: Promise<AcpRuntimeStatus[]> } | null = null;

/**
 * Runtime status on this machine.
 *
 * With `probeLogin` on, each CLI is actually launched to check login state. That is the
 * only slow part of this call (measured: claude 300ms, codex 45ms), so it is off by
 * default — the screen **paints first and corrects later**.
 *
 * Login checks are shared: one in flight, reused for `LOGIN_CHECK_REUSE_MS`; `force` re-asks.
 * An answer asking for a sign-in is not reused.
 */
export async function detectAcpRuntimes(
  options?: { probeLogin?: boolean; force?: boolean },
): Promise<AcpRuntimeStatus[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  if (!options?.probeLogin) return invoke<AcpRuntimeStatus[]>('acp_detect_runtimes', { probeLogin: false });
  const now = Date.now();
  if (!options.force && lastLoginCheck && now - lastLoginCheck.startedAt < LOGIN_CHECK_REUSE_MS) {
    return lastLoginCheck.answer;
  }
  const check = { startedAt: now, answer: invoke<AcpRuntimeStatus[]>('acp_detect_runtimes', { probeLogin: true }) };
  lastLoginCheck = check;
  const forget = () => {
    if (lastLoginCheck === check) lastLoginCheck = null;
  };
  check.answer.then((list) => {
    if (list.some((runtime) => runtime.state === 'login-needed' || runtime.state === 'login-unknown')) forget();
  }, forget);
  return check.answer;
}

export async function startAcpSession(
  runtimeId: string,
  cwd: string,
): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const stream: AcpSessionStream = { early: [], earlyChars: 0, overflowed: false, closed: false, listeners: new Set() };
  const onEvent = new Channel<AcpStreamEvent>((event) => deliver(stream, event));
  let sessionId: string;
  try {
    sessionId = await invoke<string>('acp_start', { runtimeId, cwd, onEvent });
  } catch (error) {
    closeStream(stream);
    throw error;
  }
  if (stream.overflowed) return refuseOverflow(sessionId, stream);
  sessionStreams.set(sessionId, stream);
  return sessionId;
}

export async function sendAcpLine(sessionId: string, line: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke<void>('acp_send', { sessionId, line });
}

export async function stopAcpSession(sessionId: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  const stream = sessionStreams.get(sessionId);
  if (stream) closeStream(stream);
  sessionStreams.delete(sessionId);
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

type AcpStreamEvent =
  | { kind: 'message'; line: string }
  | { kind: 'stderr'; line: string }
  | { kind: 'notice'; message: string }
  | { kind: 'exit'; code: number | null };

interface AcpSessionHandlers {
  onMessage?: (line: string) => void;
  onStderr?: (line: string) => void;
  onNotice?: (message: string) => void;
  onExit?: (code: number | null) => void;
}

/** Events before the first listener wait for it. */
interface AcpSessionStream {
  early: AcpStreamEvent[] | null;
  earlyChars: number;
  overflowed: boolean;
  closed: boolean;
  listeners: Set<AcpSessionHandlers>;
}

const sessionStreams = new Map<string, AcpSessionStream>();
// O(1) per buffered event; retained startup text and event count are capped.
const MAX_EARLY_EVENTS = 256;
const MAX_EARLY_CHARS = 1_048_576;

function closeStream(stream: AcpSessionStream): void {
  stream.closed = true;
  stream.early = null;
  stream.earlyChars = 0;
  stream.listeners.clear();
}

async function refuseOverflow(sessionId: string, stream: AcpSessionStream): Promise<never> {
  closeStream(stream);
  sessionStreams.delete(sessionId);
  try {
    await getInvoke()?.('acp_stop', { sessionId });
  } catch {
    // Refuse a partial replay even if stop fails.
  }
  throw new Error('acp-startup-buffer-overflow');
}

function dispatch(handlers: AcpSessionHandlers, event: AcpStreamEvent): void {
  if (event.kind === 'message') handlers.onMessage?.(event.line);
  else if (event.kind === 'stderr') handlers.onStderr?.(event.line);
  else if (event.kind === 'notice') handlers.onNotice?.(event.message);
  else handlers.onExit?.(event.code);
}

function deliver(stream: AcpSessionStream, event: AcpStreamEvent): void {
  if (stream.closed || stream.overflowed) return;
  if (stream.early) {
    const chars = event.kind === 'notice' ? event.message.length : event.kind === 'exit' ? 0 : event.line.length;
    if (stream.early.length >= MAX_EARLY_EVENTS || chars > MAX_EARLY_CHARS - stream.earlyChars) {
      stream.early = [];
      stream.earlyChars = 0;
      stream.overflowed = true;
      return;
    }
    stream.early.push(event);
    stream.earlyChars += chars;
  } else {
    for (const handlers of stream.listeners) dispatch(handlers, event);
  }
}

/** Listens to one session's own channel. Calling the returned function detaches. */
export async function listenToAcpSession(
  sessionId: string,
  handlers: AcpSessionHandlers,
): Promise<() => void> {
  const stream = sessionStreams.get(sessionId);
  if (!stream) return () => {};
  if (stream.overflowed) return refuseOverflow(sessionId, stream);
  stream.listeners.add(handlers);
  const early = stream.early ?? [];
  stream.early = null;
  stream.earlyChars = 0;
  for (const event of early) {
    if (stream.closed) break;
    dispatch(handlers, event);
  }
  return () => {
    stream.listeners.delete(handlers);
    if (stream.listeners.size === 0) {
      closeStream(stream);
      sessionStreams.delete(sessionId);
    }
  };
}
