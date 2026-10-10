import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';

import type { OpeningRequest, SessionState } from './types';

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
}

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
}: OpeningRequestOptions) {
  const sentOpeningNonceRef = useRef<number | null>(null);

  const restartedOpeningNonceRef = useRef<number | null>(null);
  const openingNonce = openingRequest?.nonce ?? null;
  const openingText = openingRequest?.text ?? null;
  const openingInvestigation = openingRequest?.investigation;
  useEffect(() => {
    if (openingNonce === null || !openingText) return;
    if (sentOpeningNonceRef.current === openingNonce) return;
    if (openingInvestigation && (openingScopeMismatch || openingInvestigation.runtimeId !== runtimeId || status === 'thinking' || pending !== null)) {
      sentOpeningNonceRef.current = openingNonce;
      onOpeningRequestRejected?.(openingNonce);
      return;
    }
    if (openingScopeMismatch) return;

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
        if (sent) onOpeningRequestSent?.(openingNonce);
        else onOpeningRequestRejected?.(openingNonce);
      });
    } else void send(openingText);
  }, [openingNonce, openingText, openingInvestigation, openingScopeMismatch, runtimeId, vaultRoot, liveOpeningRequest, status, pending, send, sendInvestigation, switchSession, markConnectStopped, onOpeningRequestSent, onOpeningRequestRejected, connectStoppedRef, setHistoryOpen]);
  return { restartedOpeningNonceRef, openingNonce };
}
