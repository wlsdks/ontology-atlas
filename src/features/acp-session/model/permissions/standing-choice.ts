import {
  forgetApproval,
  readMachineApprovals,
  recordApproval,
  useMachineApprovals,
} from '@/shared/lib/connectors/machine-approvals';

import { STANDING_APPROVAL_SCOPE } from './standing-approval';

const SUBJECT = 'auto-approve';
const CHAT = 'chat';

export function standingChoiceKept(folder: string | null): boolean {
  return readMachineApprovals().approves(SUBJECT, folder, CHAT, STANDING_APPROVAL_SCOPE);
}

export function keepStandingChoice(folder: string | null, on: boolean): void {
  if (on) recordApproval(SUBJECT, folder, CHAT, STANDING_APPROVAL_SCOPE);
  else forgetApproval(SUBJECT, folder, CHAT);
}

export function useStandingChoice(folder: string | null): boolean {
  return useMachineApprovals().approves(SUBJECT, folder, CHAT, STANDING_APPROVAL_SCOPE);
}
