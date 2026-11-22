import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import type { HeldRequest, SeatedDetail, SessionState } from '../chat-panel-props';
import { heldRequestStillMeant } from './outgoing-request';

/**
 * A request pressed while the agent starts is kept and goes out once, when it is ready. If it stops
 * being meant (another agent or folder, a stopped connection) it returns to the composer instead.
 */
export function useHeldRequest({
  runtimeId,
  vaultRoot,
  status,
  connectStopped,
  setDraft,
  setSeatedDetail,
  sendAsPerson,
  setNextStepsDismissed,
}: {
  runtimeId: string;
  vaultRoot: string | null;
  status: SessionState['status'];
  connectStopped: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  setSeatedDetail: Dispatch<SetStateAction<SeatedDetail | null>>;
  sendAsPerson: (text: string) => void;
  setNextStepsDismissed: (dismissed: boolean) => void;
}) {
  const [heldRequest, setHeldRequest] = useState<HeldRequest | null>(null);
  const returnHeldToComposer = useCallback((held: HeldRequest) => {
    setHeldRequest(null);
    setDraft((current) => (current.trim() ? `${held.lead}\n\n${current}` : held.lead));
    setSeatedDetail((current) => current ?? held.seatedDetail);
  }, [setDraft, setSeatedDetail]);
  if (heldRequest && !heldRequestStillMeant(heldRequest, { runtimeId, vaultRoot, connectStopped, status })) {
    returnHeldToComposer(heldRequest);
  }
  const sendHeldRequest = useCallback((held: HeldRequest) => {
    setHeldRequest(null);
    setNextStepsDismissed(false);
    sendAsPerson(held.text);
  }, [sendAsPerson, setNextStepsDismissed]);
  const returnHeld = useCallback(() => {
    if (heldRequest) returnHeldToComposer(heldRequest);
  }, [heldRequest, returnHeldToComposer]);

  return { heldRequest, setHeldRequest, sendHeldRequest, returnHeld };
}
