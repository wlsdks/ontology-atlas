import type { ConnectionProvider } from '@/shared/lib/llm-connection/tauri-secrets';

/**
 * Which state the panel is in. Each stage names what is missing before the conversation can run;
 * `scope` and `chat` exist only once a provider is connected, so they carry it.
 */
export type AgentPanelStage =
  | { kind: 'web' | 'no-folder' | 'no-key' }
  | { kind: 'scope' | 'chat'; provider: ConnectionProvider };

export function agentPanelStage({
  bridgeAvailable,
  vaultPath,
  provider,
  scopeAccepted,
}: {
  bridgeAvailable: boolean;
  vaultPath: string | null;
  provider: ConnectionProvider | null;
  scopeAccepted: boolean;
}): AgentPanelStage {
  if (!bridgeAvailable) return { kind: 'web' };
  if (!vaultPath) return { kind: 'no-folder' };
  if (!provider) return { kind: 'no-key' };
  return { kind: scopeAccepted ? 'chat' : 'scope', provider };
}

export function canSendDraft({
  stage,
  running,
  choosingSource,
  applying,
  draft,
}: {
  stage: AgentPanelStage;
  running: boolean;
  choosingSource: boolean;
  applying: boolean;
  draft: string;
}): boolean {
  return (
    stage.kind === 'chat' && !running && !choosingSource && !applying && draft.trim().length > 0
  );
}
