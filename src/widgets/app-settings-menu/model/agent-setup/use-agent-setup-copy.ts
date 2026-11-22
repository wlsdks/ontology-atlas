import { useState } from 'react';
import { copyText } from '@/shared/lib/clipboard/copy-text';
import { buildAgentSetupCopyText, type AgentSetupCopyKey } from './agent-setup-packets';

export type CopyState = 'idle' | 'copied' | 'failed';

export interface AgentSetupCopy {
  states: Record<AgentSetupCopyKey, CopyState>;
  copy: (key: AgentSetupCopyKey) => Promise<void>;
}

const IDLE_STATES: Record<AgentSetupCopyKey, CopyState> = {
  verifyPrompt: 'idle',
  setupPacket: 'idle',
  verifyCli: 'idle',
  jsonGate: 'idle',
  postChangeSync: 'idle',
  firstContactProof: 'idle',
  configTemplate: 'idle',
  setupCheckCli: 'idle',
  setupCli: 'idle',
  codexTemplate: 'idle',
  codexMcpAddCommand: 'idle',
};

/** Each copy chip's own copied/failed feedback; the text is built at click time. */
export function useAgentSetupCopy(
  vaultName: string,
  vaultRootPath: string | null | undefined,
): AgentSetupCopy {
  const [states, setStates] = useState(IDLE_STATES);

  async function copy(key: AgentSetupCopyKey) {
    const copied = await copyText(buildAgentSetupCopyText(key, vaultName, vaultRootPath));
    setStates((previous) => ({ ...previous, [key]: copied ? 'copied' : 'failed' }));
  }

  return { states, copy };
}
