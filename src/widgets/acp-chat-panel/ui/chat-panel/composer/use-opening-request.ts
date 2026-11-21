import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

import type { HeldRequest, OpeningRequest, SessionState } from '../types';

interface OpeningRequestOptions {
  openingRequest?: OpeningRequest | null;
  openingScopeMismatch: boolean;
  runtimeId: string;
  vaultRoot: string | null;
  liveOpeningRequest: RefObject<{
    openingRequest?: OpeningRequest | null;
    sessionEnabled: boolean;
    openingScopeMismatch: boolean;
    runtimeId: string;
    vaultRoot: string | null;
  }>;
  status: SessionState['status'];
  pending: SessionState['pending'];
  send: SessionState['send'];
  sendInvestigation: SessionState['sendInvestigation'];
  switchSession: SessionState['switchSession'];
  connectStoppedRef: RefObject<boolean>;
  markConnectStopped: (stopped: boolean) => void;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  onOpeningRequestSent?: (nonce: number) => void;
  onOpeningRequestRejected?: (nonce: number) => void;
  heldRequest: HeldRequest | null;
  sendHeldRequest: (held: HeldRequest) => void;
  /** The opening request takes the first turn; a held request goes back to the box instead of queueing behind it. */
  onOpeningTakesTurn: () => void;
}

/**
 * Requests waiting for the session: an opening request a button started, and one the person
 * pressed while the agent was starting. The opening request goes first, once the session is ready.
 */
export function useOpeningRequest({
  openingRequest,
  openingScopeMismatch,
  runtimeId,
  vaultRoot,
  liveOpeningRequest,
  status,
  pending,
  send,
  sendInvestigation,
  switchSession,
  connectStoppedRef,
  markConnectStopped,
  setHistoryOpen,
  onOpeningRequestSent,
  onOpeningRequestRejected,
  heldRequest,
  sendHeldRequest,
  onOpeningTakesTurn,
}: OpeningRequestOptions) {
  // A ref, not state: state would re-run the send effect on the render the send causes.
  const sentOpeningNonceRef = useRef<number | null>(null);
  // What the stage reads; it trails the ref by the send, which only a starting stage looks at.
  const [sentOpeningNonce, setSentOpeningNonce] = useState<number | null>(null);
  const restartedOpeningNonceRef = useRef<number | null>(null);
  const openingNonce = openingRequest?.nonce ?? null;
  const openingText = openingRequest?.text ?? null;
  const openingInvestigation = openingRequest?.investigation;
  useEffect(() => {
    const sendHeldWhenReady = () => {
      if (heldRequest && status === 'ready' && pending === null) sendHeldRequest(heldRequest);
    };
    if (openingNonce === null || !openingText || sentOpeningNonceRef.current === openingNonce) {
      sendHeldWhenReady();
      return;
    }
    if (openingInvestigation && (openingScopeMismatch || openingInvestigation.runtimeId !== runtimeId || status === 'thinking' || pending !== null)) {
      sentOpeningNonceRef.current = openingNonce;
      onOpeningRequestRejected?.(openingNonce);
      sendHeldWhenReady();
      return;
    }
    if (openingScopeMismatch) {
      sendHeldWhenReady();
      return;
    }

    if (
      (status === 'error' || status === 'exited' || connectStoppedRef.current) &&
      sentOpeningNonceRef.current !== openingNonce &&
      restartedOpeningNonceRef.current !== openingNonce
    ) {
      restartedOpeningNonceRef.current = openingNonce;
      setHistoryOpen(false);
      markConnectStopped(false);
      void switchSession(null);
      return;
    }
    if (status !== 'ready') return;
    sentOpeningNonceRef.current = openingNonce;
    if (heldRequest) onOpeningTakesTurn();
    if (openingInvestigation) {
      const requestCurrent=()=>{
        const current=liveOpeningRequest.current;
        return current.sessionEnabled&&!current.openingScopeMismatch
          &&current.runtimeId===runtimeId&&current.vaultRoot===vaultRoot
          &&current.openingRequest?.nonce===openingNonce&&current.openingRequest.text===openingText;
      };
      const guard={...openingInvestigation,revalidate:async()=>requestCurrent()
        &&await openingInvestigation.revalidate()&&requestCurrent()};
      void sendInvestigation(openingText, guard).then(sent => {
        setSentOpeningNonce(openingNonce);
        if (sent) onOpeningRequestSent?.(openingNonce);
        else onOpeningRequestRejected?.(openingNonce);
      });
    } else void send(openingText).then(() => setSentOpeningNonce(openingNonce));
  }, [openingNonce, openingText, openingInvestigation, openingScopeMismatch, runtimeId, vaultRoot, liveOpeningRequest, status, pending, send, sendInvestigation, switchSession, markConnectStopped, onOpeningRequestSent, onOpeningRequestRejected, connectStoppedRef, setHistoryOpen, heldRequest, sendHeldRequest, onOpeningTakesTurn]);

  const openingWaiting = openingNonce !== null && Boolean(openingText) && !openingScopeMismatch
    && sentOpeningNonce !== openingNonce
    && (!openingInvestigation || openingInvestigation.runtimeId === runtimeId);
  return { restartedOpeningNonceRef, openingNonce, openingWaiting };
}
