import { isGuardedRuntime } from '@/features/acp-session';
import type { AcpRuntimeStatus } from '@/shared/lib/tauri-acp';

export type ArchitectureAgentRoute = 'checking' | 'agent' | 'clipboard';

export interface ArchitectureAgentRuntime {
  id: string;
  label: string;
}

export interface ArchitectureAgentRequest {
  kind: 'draft' | 'change' | 'verify' | 'improve';
  prompt: string;
  profileSlug?: string | null;
  roleId?: string | null;
}

/**
 * Only a present, verified runtime with an app-owned write checkpoint may enter.
 *
 * `login-unknown` is admitted; `login-needed` is not. The difference is what we know:
 * `login-needed` is a measured "no credentials", and letting it in ends in an
 * `Authentication required` failure once the conversation opens. `login-unknown` means the
 * sign-in probe itself failed, and refusing on that basis is how a load spike took two working
 * runtimes out of the picker on 2026-09-05 while the same commands exited 0 from a shell.
 */
export function selectArchitectureAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): ArchitectureAgentRuntime[] {
  return (runtimes ?? [])
    .filter(
      (runtime) =>
        (runtime.state === 'ready' || runtime.state === 'login-unknown') &&
        runtime.verified &&
        isGuardedRuntime(runtime.id, runtime.isolated),
    )
    .map((runtime) => ({ id: runtime.id, label: runtime.label }));
}

export function resolveArchitectureAgentRoute({
  bridgeAvailable,
  runtimeCheckComplete,
  serverCheckComplete,
  runtime,
  vaultRoot,
  serverReady,
}: {
  bridgeAvailable: boolean;
  runtimeCheckComplete: boolean;
  serverCheckComplete: boolean;
  runtime: ArchitectureAgentRuntime | null;
  vaultRoot: string | null;
  serverReady: boolean;
}): ArchitectureAgentRoute {
  if (!bridgeAvailable) return 'clipboard';
  if (!runtimeCheckComplete || !serverCheckComplete) return 'checking';
  if (runtime && vaultRoot && serverReady) return 'agent';
  return 'clipboard';
}
