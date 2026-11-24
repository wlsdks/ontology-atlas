import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/** Bridge to `src-tauri/src/acp/doctor.rs`, the source of truth: it returns ids and measured facts only, and copy comes from i18n. App-only: a browser cannot spawn processes or read the keychain (`.claude/rules/surfaces.md`). */

/** 1:1 with Rust's `AcpCheck`. A new field turns the contract test red first. */
export interface AcpCheck {
  id: string;
  state: 'ok' | 'problem' | 'unknown';
  fixable: boolean;
  /** An earlier step is blocked, so no action is recommended for this one; its state still shows. */
  blocked: boolean;
  /** A machine-measured fact (a path, a reason); never invented, so it may be absent. */
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

/** Not a logout: the app reuses the terminal login, so logging out would erase someone else's login or do nothing. */
export async function resetAgentConnection(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_reset_connection', { runtimeId });
}

export async function agentInstallPlan(runtimeId: string): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>('acp_install_plan', { runtimeId });
}

/** Touches neither global npm nor the system PATH; the version is pinned. */
export async function installAgentCli(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_install_cli', { runtimeId });
}

export async function nodeInstallPlan(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>('acp_node_plan');
}

export async function installManagedNode(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_install_node', { runtimeId });
}

/** 1:1 with Rust's `AcpInstallProgress`. */
export interface AcpInstallProgress {
  runtimeId: string;
  /** `adapter` is the npx adapter fetch the chat panel's session start waits on. */
  job: 'node' | 'cli' | 'adapter';
  stage:
    | 'downloading'
    | 'verifying'
    | 'extracting'
    | 'installing'
    | 'verifying-install'
    | 'done'
    | 'failed';
  /** Null when unknown, and then the screen draws no percentage. */
  received: number | null;
  total: number | null;
  note: string | null;
  /** Epoch ms when this state arose, so stale state is not drawn. */
  at: number;
}

/**
 * How long a held state stays on screen. Without it, yesterday's install shows as just installed.
 * Five minutes covers closing the sheet and coming back without reaching the next session.
 */
export const INSTALL_PROGRESS_FRESH_MS = 5 * 60 * 1000;

export function isInstallProgressFresh(
  progress: Pick<AcpInstallProgress, 'at'>,
  now: number = Date.now(),
): boolean {
  // A clock that went backwards (timezone change, manual adjustment) is not stale.
  const elapsed = now - progress.at;
  return elapsed < 0 || elapsed <= INSTALL_PROGRESS_FRESH_MS;
}

/**
 * @param runtimeId Receives only this tool's progress; `null` receives every tool, for the rail badge.
 */
export async function listenInstallProgress(
  runtimeId: string | null,
  onProgress: (progress: AcpInstallProgress) => void,
): Promise<() => void> {
  if (!isAgentDoctorAvailable()) return () => undefined;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<AcpInstallProgress>('acp-install://progress', (event) => {
      if (!event.payload) return;
      if (runtimeId === null || event.payload.runtimeId === runtimeId) onProgress(event.payload);
    });
    return unlisten;
  } catch {
    // Failing to listen only loses the progress indicator; the install itself still runs.
    return () => undefined;
  }
}

/** One decimal, so the number visibly moves during a 52MB download. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${mb.toFixed(1)}MB`;
}

/**
 * Asks Rust for this tool's last progress state, or null. The settings sheet unmounts when closed
 * and `done` is a single event, so a completion while closed is seen only through this call.
 */
export async function lastInstallProgress(
  runtimeId: string,
): Promise<AcpInstallProgress | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const last =
      (await invoke<AcpInstallProgress | null>('acp_install_progress', { runtimeId })) ?? null;
    // Stale values are not returned, so screens cannot judge freshness differently.
    return last && isInstallProgressFresh(last) ? last : null;
  } catch {
    // A failed query does not stop the screen.
    return null;
  }
}

const TERMINAL_INSTALL_STAGES = ['done', 'failed'] as const;

export function isTerminalInstallStage(stage: AcpInstallProgress['stage']): boolean {
  return (TERMINAL_INSTALL_STAGES as readonly string[]).includes(stage);
}
