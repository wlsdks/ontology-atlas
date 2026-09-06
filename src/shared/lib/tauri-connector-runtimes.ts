/**
 * Where this machine's `npx`, `node`, `uvx`, `python3` and `docker` actually are — the Tauri
 * bridge over `resolve_connector_runtimes` in `src-tauri/src/connectors.rs`.
 *
 * ## Why the form stopped asking for a typed path
 *
 * A connector the agent spawns inherits a sanitized environment with **no `PATH`**
 * (`SHARED_RUNTIME_ENV`, `src-tauri/src/acp.rs`), so a bare `npx` resolves to nothing and the
 * session comes up with that connector's tools silently absent. `connectorProblems` reports it as
 * `command-not-absolute` and the form's hint said so — and the owner's answer on 2026-09-07 was
 * still *"I don't know what I'm supposed to write here"*. Nobody knows where their own `npx` is;
 * `acp.rs` already worked it out for the agent runtimes, so the form picks from that answer
 * instead of asking for it.
 *
 * ## Web degradation contract
 *
 * A browser cannot look at `/opt/homebrew/bin`. Outside Tauri `isConnectorRuntimeBridgeAvailable()`
 * is false and this returns `null` — **"not asked", never "none installed"**. The form then falls
 * back to a typed path with the hint it always had, which still works; what is missing is the
 * convenience, not the ability (`.claude/rules/surfaces.md`).
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/** Rust `ResolvedRuntime` (serde camelCase). `path` is `null` when the runtime is not installed. */
export interface ResolvedRuntime {
  name: string;
  path: string | null;
}

export function isConnectorRuntimeBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/** `null` on any surface that cannot look — which is not the same as an empty list. */
export async function resolveConnectorRuntimes(): Promise<ResolvedRuntime[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    return await invoke<ResolvedRuntime[]>('resolve_connector_runtimes');
  } catch {
    return null;
  }
}

/**
 * The full path this machine holds for one runtime name, or `null`.
 *
 * `null` covers both "not installed" and "could not look", and the caller must not collapse them:
 * a catalogue entry written with a bare `npx` on the web is a row the person still has to finish,
 * and `connectorProblems` already says so in the one place that matters.
 */
export function runtimePath(
  runtimes: readonly ResolvedRuntime[] | null,
  name: string,
): string | null {
  return runtimes?.find((runtime) => runtime.name === name)?.path ?? null;
}
