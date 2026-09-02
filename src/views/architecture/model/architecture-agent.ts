import { isGuardedRuntime } from '@/features/acp-session';
import type { AcpRuntimeStatus } from '@/shared/lib/tauri-acp';

export type ArchitectureAgentRoute = 'checking' | 'agent' | 'clipboard';

export interface ArchitectureAgentRuntime {
  id: string;
  label: string;
}

export interface ArchitectureAgentRequest {
  kind: 'draft' | 'change' | 'verify';
  prompt: string;
}

/** Only a present, verified, login-ready runtime with an app-owned write checkpoint may enter. */
export function selectArchitectureAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): ArchitectureAgentRuntime[] {
  return (runtimes ?? [])
    .filter(
      (runtime) =>
        runtime.state === 'ready' &&
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
