import { invoke, isTauri } from '@tauri-apps/api/core';

export interface JevSecretStatus {
  stored: boolean;
  last4: string | null;
}

export interface JevJudgment {
  choice: 'supported' | 'contradicted' | 'insufficient';
  confidence: number;
  probabilities: Record<'supported' | 'contradicted' | 'insufficient', number>;
  responseModel: string;
  loggedAt: string;
}

export const JEV_DESTINATION = 'api.typesafe.ai';

export function isJevAvailable(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

export function buildJevPayload(claim: string, evidence: string): string {
  return JSON.stringify({
    model: 'jev-latest',
    state: { claim, evidence },
    questions: {
      claim_judgment: {
        type: 'choice',
        instructions: 'Given only the evidence, how does it relate to the claim?',
        criteria: {
          supported: 'The evidence directly supports the claim.',
          contradicted: 'The evidence directly conflicts with the claim.',
          insufficient: 'The evidence cannot settle the claim.',
        },
      },
    },
  });
}

export async function jevSecretStatus(): Promise<JevSecretStatus | null> {
  if (!isJevAvailable()) return null;
  return invoke<JevSecretStatus>('jev_secret_status');
}

export async function jevSecretSet(secret: string): Promise<JevSecretStatus | null> {
  if (!isJevAvailable()) return null;
  return invoke<JevSecretStatus>('jev_secret_set', { secret });
}

export async function jevSecretClear(): Promise<JevSecretStatus | null> {
  if (!isJevAvailable()) return null;
  return invoke<JevSecretStatus>('jev_secret_clear');
}

export async function jevJudge(vaultPath: string, payload: string): Promise<JevJudgment | null> {
  if (!isJevAvailable()) return null;
  return invoke<JevJudgment>('jev_judge', { vaultPath, payload });
}
