import type { HeldRequest, SeatedDetail, SessionState } from '../chat-panel-props';

/**
 * What a draft sends: the lead the person sees, or, while the seated lead is untouched, the whole
 * request it stands for, and otherwise the edited lead followed by the seated detail.
 */
export function seatedRequestText(lead: string, seatedDetail: SeatedDetail | null): string {
  return seatedDetail
    ? (lead === seatedDetail.lead ? seatedDetail.full : `${lead}\n\n${seatedDetail.detail}`)
    : lead;
}

/**
 * What pressing Send does with a draft: nothing for a blank one or while the agent cannot take it,
 * otherwise send it, or hold it while the agent is still starting.
 */
export function planSubmit({
  draft,
  status,
  connecting,
  seatedDetail,
}: {
  draft: string;
  status: SessionState['status'];
  connecting: boolean;
  seatedDetail: SeatedDetail | null;
}): { lead: string; text: string; hold: boolean } | null {
  const lead = draft.trim();
  if (!lead || (status !== 'ready' && !connecting)) return null;
  return { lead, text: seatedRequestText(lead, seatedDetail), hold: status !== 'ready' };
}

/** A held request is sent only to the agent and folder it was written for, and only while that agent is on its way. */
export function heldRequestStillMeant(
  held: HeldRequest | null,
  current: {
    runtimeId: string;
    vaultRoot: string | null;
    connectStopped: boolean;
    status: SessionState['status'];
  },
): boolean {
  return held !== null
    && held.runtimeId === current.runtimeId
    && held.vaultRoot === current.vaultRoot
    && !current.connectStopped
    && (current.status === 'starting' || current.status === 'idle' || current.status === 'ready');
}
