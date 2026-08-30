import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * The connection-check bridge — the two commands in `src-tauri/src/acp_doctor.rs`.
 *
 * The contract (Rust is the source of truth):
 * - `acp_diagnose(runtimeId)` → the list of checks. **It fixes nothing.**
 * - `acp_repair(runtimeId, checkId)` → the list of checks **re-measured** after fixing.
 *
 * No copy lives here. Rust returns ids and machine-measured facts, and the human-readable sentence
 * is built by the screen through i18n — hardcoding Korean into Rust makes the English screen lie.
 *
 * **It does not exist on the web.** A browser can neither spawn another process nor read the
 * keychain, so this feature is app-only and the caller simply does not draw it on the web — not
 * "coming soon", but absent from the start (`.claude/rules/surfaces.md`).
 */

/** 1:1 with Rust's `AcpCheck`. A new field turns the contract test red first. */
export interface AcpCheck {
  /** The check's name, 1:1 with the i18n key. */
  id: string;
  /** `ok` · `problem` · `unknown` — **unknown is not ok.** */
  state: 'ok' | 'problem' | 'unknown';
  /** Can the app fix it itself? Meaningful only when `problem`. */
  fixable: boolean;
  /**
   * An earlier step is blocked, so touching this one is pointless.
   *
   * Stops recommending "fix the app's config" to someone who has no tool at all (walkthrough
   * 2026-08-20). The state is still shown, but **no action is recommended.**
   */
  blocked: boolean;
  /** One machine-measured fact (a path, a reason). Never invented, so it may be absent. */
  detail?: string | null;
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  try {
    return isTauri() ? (tauriInvoke as TauriInvoke) : null;
  } catch {
    return null;
  }
}

/** The check is possible only in the app. Callers decide whether to draw from this. */
export function isAgentDoctorAvailable(): boolean {
  return getInvoke() !== null;
}

export async function diagnoseAgent(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_diagnose', { runtimeId });
}

export async function repairAgentCheck(runtimeId: string, checkId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_repair', { runtimeId, checkId });
}

/**
 * Rebuilds the connection from scratch — deleting and recreating only what the app created.
 *
 * Why not "log out": this app has no login of its own. It links the login the user uses in their
 * terminal and uses that as-is, so offering a logout here would either erase someone else's login or
 * do nothing while pretending to. The full rationale is in the Rust-side doc-block.
 */
export async function resetAgentConnection(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_reset_connection', { runtimeId });
}

/**
 * Can the app install this tool for the user — and if so, **with what command.**
 *
 * The screen takes this and **shows the command text before anything is pressed.** That is
 * condition ② of ledger entry 2026-08-20 (88): show what will be run, first.
 */
export async function agentInstallPlan(runtimeId: string): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>('acp_install_plan', { runtimeId });
}

/**
 * Installs the tool into an app-only location, returning **the re-measured values** afterwards.
 *
 * It touches neither global npm nor the system PATH (condition ③). The version is pinned (condition ④).
 */
export async function installAgentCli(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_install_cli', { runtimeId });
}

/**
 * Can the app fetch Node — and if so, **from where and what.**
 *
 * The returned string carries the download address and the hash prefix. The screen shows it before
 * anything is pressed — the screen itself supplies the evidence that "we verify it" is not just words.
 */
export async function nodeInstallPlan(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>('acp_node_plan');
}

/** Fetches Node into an app-only location and checks the hash. Returns the re-measured values. */
export async function installManagedNode(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_install_node', { runtimeId });
}

/**
 * How far the install has got — 1:1 with Rust's `AcpInstallProgress`.
 *
 * Why an event (owner report, 2026-08-20): *"does pressing the buttons show the install progress and check off completion?"* (does pressing the buttons show the install progress and check off completion?) — it did not. `acp_install_cli` / `acp_install_node` return only **when finished**, so
 * while 52MB downloaded and npm ran, all the screen could do was leave the chip disabled. Exactly
 * the pattern this repository's walkthrough named **"the silent wait"**.
 */
export interface AcpInstallProgress {
  runtimeId: string;
  /** `node` · `cli` — which job. */
  job: 'node' | 'cli';
  /** Which stage. **No copy here** — the screen builds it through i18n. */
  stage:
    | 'downloading'
    | 'verifying'
    | 'extracting'
    | 'installing'
    | 'verifying-install'
    | 'done'
    | 'failed';
  /** Only as much as is known. Unknown is `null`, and the screen draws no percentage. */
  received: number | null;
  total: number | null;
  /** The line that tool actually emitted. Not a sentence we invented. */
  note: string | null;
  /** When this state arose (epoch ms). Used to avoid drawing something stale. */
  at: number;
}

/**
 * **How long a held state stays on screen.**
 *
 * Keeping the last state and continuing to show it are different questions. Without this window, an
 * install that finished yesterday appears as "installed" when settings are opened today — stating
 * something that is not what was just done as if it were.
 *
 * Five minutes because it covers closing the sheet, doing something else, and coming back (which is
 * why this value exists) without carrying over into the next session.
 */
export const INSTALL_PROGRESS_FRESH_MS = 5 * 60 * 1000;

/** May this state still be drawn? `now` is a parameter so tests can pin the clock. */
export function isInstallProgressFresh(
  progress: Pick<AcpInstallProgress, 'at'>,
  now: number = Date.now(),
): boolean {
  // A clock that went backwards (a timezone change, a manual adjustment) is not mistaken for stale.
  const elapsed = now - progress.at;
  return elapsed < 0 || elapsed <= INSTALL_PROGRESS_FRESH_MS;
}

/**
 * Listens to install progress. Returns the detach function.
 *
 * It does not attach on the web — there is no install button there to begin with.
 */
/**
 * @param runtimeId Receives only this tool's progress. `null` receives **everything** — used by
 *   consumers such as the rail badge that watch "has any tool finished".
 */
export async function listenInstallProgress(
  runtimeId: string | null,
  onProgress: (progress: AcpInstallProgress) => void,
): Promise<() => void> {
  if (!isAgentDoctorAvailable()) return () => undefined;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<AcpInstallProgress>('acp-install://progress', (event) => {
      // One screen has several tool rows. Another tool's progress is not drawn on this row.
      if (!event.payload) return;
      if (runtimeId === null || event.payload.runtimeId === runtimeId) onProgress(event.payload);
    });
    return unlisten;
  } catch {
    // Failing to listen only means there is no progress indicator; the install itself runs unchanged.
    return () => undefined;
  }
}

/**
 * Bytes into a human-readable size, to one decimal — the number must visibly move while 52MB
 * downloads.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${mb.toFixed(1)}MB`;
}

/**
 * Asks Rust for this tool's **last progress state**, or `null`.
 *
 * Why it is needed (2026-08-20): the settings sheet **unmounts entirely** when closed, so this
 * hook's state disappears and the event subscription drops. The Node download ticks every 250ms and
 * revives on reopening, but **completion (`done`) is a single event**, so going past while closed
 * means it is **never seen**.
 *
 * Events alone cannot keep the "it finished" promise, so it is asked once on mount.
 */
export async function lastInstallProgress(
  runtimeId: string,
): Promise<AcpInstallProgress | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const last =
      (await invoke<AcpInstallProgress | null>('acp_install_progress', { runtimeId })) ?? null;
    // Stale values are not returned at all — leaving each screen to judge again lets them diverge.
    return last && isInstallProgressFresh(last) ? last : null;
  } catch {
    // A failed query does not stop the screen — it simply ends up as it was before the fix.
    return null;
  }
}

/** Stages that no longer change — "finished" and "failed". */
const TERMINAL_INSTALL_STAGES = ['done', 'failed'] as const;

export function isTerminalInstallStage(stage: AcpInstallProgress['stage']): boolean {
  return (TERMINAL_INSTALL_STAGES as readonly string[]).includes(stage);
}
