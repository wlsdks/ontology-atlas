import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { PendingPermission } from './ask-permission';

export interface OpenAskSlots {
  permissionDecisionTimerRef: RefObject<number | null>;
  pendingResolverRef: RefObject<((optionId: string | null) => void) | null>;
  setPending: Dispatch<SetStateAction<PendingPermission | null>>;
}

/**
 * Answers the card on screen with a rejection and takes it down: an unasked question counted as
 * allowed is having no gate. Used when a turn is stopped, the conversation is closed and the agent
 * process ends. A write already waiting out its settle delay is cancelled with it.
 */
export function refuseOpenAsk({ permissionDecisionTimerRef, pendingResolverRef, setPending }: OpenAskSlots): void {
  if (permissionDecisionTimerRef.current !== null) {
    window.clearTimeout(permissionDecisionTimerRef.current);
    permissionDecisionTimerRef.current = null;
  }
  pendingResolverRef.current?.(null);
  pendingResolverRef.current = null;
  setPending(null);
}
