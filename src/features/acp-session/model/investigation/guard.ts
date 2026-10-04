import type { AcpSessionChoices } from '../acp-client';
import { partitionModes } from '../mode-safety';
import { GATED_SESSION_MODE, runtimeOwnsWriteGate } from '../runtime-gate';

export interface InvestigationSendGuard {
  runtimeId: string;
  revalidate: () => Promise<boolean>;
}

export function investigationPermissionVerified(
  runtimeId: string, choices: AcpSessionChoices, serverConsent: boolean, gateOff: boolean,
): boolean {
  if (gateOff || !choices.currentModeId || choices.unverifiedModeIds.includes(choices.currentModeId)) return false;
  const ownsGate = runtimeOwnsWriteGate(runtimeId);
  if (!ownsGate && (!(runtimeId in GATED_SESSION_MODE) || !serverConsent)) return false;
  const mode = choices.modes.find(item => item.id === choices.currentModeId);
  if (!mode) return false;
  const verdict = partitionModes([mode]);
  return verdict.offered.length === 1 && verdict.unverified.length === 0;
}
