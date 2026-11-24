import { Channel, invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * Tauri IPC bridge for ACP (`src-tauri/src/acp/`); the Rust code is the source of truth. Outside
 * Tauri, detection and start return null, send and stop are no-ops, path permissions return ask. The
 * path permission policy lives only in Rust; a second copy would drift.
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
  /** So the screen never claims an untested runtime was verified. */
  verified: boolean;
  icon: string | null;
  /**
   * `#RRGGBB`, only for pairs a person confirmed: registry icons are monochrome, and a colour
   * guessed from the name is worse than greyscale (`null`).
   */
  brandInk: string | null;
  launchKind: 'npx' | 'uvx' | 'binary';
  /**
   * `cli-unknown` and `login-unknown` mean not verified; never report them as `ready`. Each state
   * implies a different next action.
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
   * False means no app-owned permission checkpoint: the tool's own configuration applies and a
   * session mode cannot guard MCP writes, so only isolated runtimes open in-app chat.
   */
  isolated: boolean;
}

/** One `claude auth status` launch measured 88 MB; answers are reused this long. */
const LOGIN_CHECK_REUSE_MS = 60_000;
let lastLoginCheck: { startedAt: number; answer: Promise<AcpRuntimeStatus[]> } | null = null;

/**
 * `probeLogin` launches each CLI (claude about 300ms), so it is off by default and the screen
 * corrects later. Login checks share one flight and are reused for `LOGIN_CHECK_REUSE_MS` unless
 * `force`; an answer asking for sign-in is not reused.
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

/** Rust `AdapterReadiness` (serde kebab-case). */
export type AcpAdapterReadiness = 'not-applicable' | 'ready' | 'fetched';

/** The slice of Rust's `AcpInstallProgress` this bridge reads; the doctor owns the full type. */
interface AdapterFetchProgress {
  runtimeId: string;
  job: string;
  stage: string;
  received: number | null;
}

function adapterBytes(progress: AdapterFetchProgress | null | undefined, runtimeId: string): number | null | undefined {
  if (!progress || progress.runtimeId !== runtimeId || progress.job !== 'adapter' || progress.stage !== 'downloading') return undefined;
  return progress.received;
}

/**
 * Fetches the pinned npx adapter in Rust before a session starts and resolves once it is in
 * npx's cache. Rust owns the download: dropping this promise (the panel closed) does not cancel
 * it, and a later call joins the one in flight. `onProgress` gets the bytes received so far, or
 * null before the first measurement, about once a second.
 */
export async function prepareAcpAdapter(
  runtimeId: string,
  onProgress: (bytes: number | null) => void,
): Promise<AcpAdapterReadiness | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  let unlisten: () => void = () => undefined;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    unlisten = await listen<AdapterFetchProgress>('acp-install://progress', (event) => {
      const bytes = adapterBytes(event.payload, runtimeId);
      if (bytes !== undefined) onProgress(bytes);
    });
  } catch {
    // Without the listener only the megabytes go missing; the fetch itself still runs.
  }
  try {
    // A fetch already running (started before the panel reopened) shows at once, not after a second.
    const last = await invoke<AdapterFetchProgress | null>('acp_install_progress', { runtimeId }).catch(() => null);
    const bytes = adapterBytes(last, runtimeId);
    if (bytes !== undefined) onProgress(bytes);
    return await invoke<AcpAdapterReadiness>('acp_prepare_adapter', { runtimeId });
  } finally {
    unlisten();
  }
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

/** `allow-inside-vault-hidden`: inside, but a component below the root starts with `.` once links resolve. */
export type AcpPermissionVerdict = 'allow-inside-vault' | 'allow-inside-vault-hidden' | 'ask';

const KNOWN_VERDICTS: ReadonlySet<string> = new Set<AcpPermissionVerdict>([
  'allow-inside-vault',
  'allow-inside-vault-hidden',
  'ask',
]);

/**
 * Is this path inside the vault. **An unknown path is `ask`** — the less a request can be
 * judged, the less it may pass unchallenged. No bridge (web) and an unknown answer are `ask` too.
 */
export async function acpPermissionVerdict(
  sessionId: string,
  filePath: string | null,
): Promise<AcpPermissionVerdict> {
  const invoke = getInvoke();
  if (!invoke) return 'ask';
  const verdict = await invoke<unknown>('acp_permission_verdict', {
    sessionId,
    filePath,
  });
  return typeof verdict === 'string' && KNOWN_VERDICTS.has(verdict) ? verdict as AcpPermissionVerdict : 'ask';
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
