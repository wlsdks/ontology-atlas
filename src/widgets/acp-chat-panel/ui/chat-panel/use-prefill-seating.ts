import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { splitAppRequest } from '../request-parts';
import type { DraftStore, SeatedDetail } from './types';

interface PrefillSeatingOptions {
  prefillRequest?: { text: string; nonce: number } | null;
  restoredDraft: { full: string; prefillNonce: number | null; lead: string; detail: string | null };
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  draftStore?: DraftStore;
  onDraftPresenceChange?: (present: boolean) => void;
}

export function usePrefillSeating({
  prefillRequest,
  restoredDraft,
  draft,
  setDraft,
  draftStore,
  onDraftPresenceChange,
}: PrefillSeatingOptions) {
  const draftPresent = draft.trim().length > 0;
  const prefillNonce = prefillRequest?.nonce ?? null;
  const prefillText = prefillRequest?.text ?? null;
  const [seenPrefillNonce, setSeenPrefillNonce] = useState<number | null>(restoredDraft.prefillNonce);

  const [seatedDetail, setSeatedDetail] = useState<SeatedDetail | null>(
    () => restoredDraft.detail ? { lead: restoredDraft.lead, detail: restoredDraft.detail, full: restoredDraft.full } : null,
  );
  // Adjusted during render: in an effect, one frame would draw an empty composer.
  if (prefillNonce !== null && prefillText && prefillNonce !== seenPrefillNonce) {
    setSeenPrefillNonce(prefillNonce);
    const parts = splitAppRequest(prefillText);
    setDraft(parts.lead);
    setSeatedDetail(
      parts.detail ? { lead: parts.lead, detail: parts.detail, full: prefillText } : null,
    );
  }

  const seatedRequestWaiting = (seenPrefillNonce !== null || seatedDetail !== null) && draft.trim().length > 0;
  useEffect(() => {
    const text = seatedDetail ? draft === seatedDetail.lead ? seatedDetail.full : `${draft}\n\n${seatedDetail.detail}` : draft;
    draftStore?.write({ text, prefillNonce: seenPrefillNonce });
  }, [draftStore, draft, seatedDetail, seenPrefillNonce]);
  useEffect(() => {
    onDraftPresenceChange?.(draftPresent);
  }, [draftPresent, onDraftPresenceChange]);
  useEffect(
    () => () => onDraftPresenceChange?.(false),
    [onDraftPresenceChange],
  );
  return { seatedDetail, setSeatedDetail, seatedRequestWaiting };
}
