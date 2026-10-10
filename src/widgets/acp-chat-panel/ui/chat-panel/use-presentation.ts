import { useEffect, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';

import {
  buildAcpPresentationTrace,
  type AcpMapIntent,
  type AcpPresentationIntent,
  type AcpPresentationScene,
  type KnownRelations,
} from '@/features/acp-session';
import { useHeldValue } from '@/shared/lib/use-presence';

import { EMPTY_KNOWN_RELATIONS, EMPTY_KNOWN_SLUGS } from './constants';
import type { ChatT, SessionState } from './types';

interface PresentationOptions {
  presentationIntent: AcpPresentationIntent | null;
  presentationRequest: string | null;
  status: SessionState['status'];
  events: SessionState['events'];
  knownSlugs?: ReadonlySet<string>;
  knownRelations?: KnownRelations;
  lastUserEventIndex: number;
  presentationOpen: boolean;
  setPresentationOpen: Dispatch<SetStateAction<boolean>>;
  presentationSceneIndex: number;
  setPresentationSceneIndex: Dispatch<SetStateAction<number>>;
  presentationOfferRef: RefObject<HTMLButtonElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setDraft: Dispatch<SetStateAction<string>>;
  onMapIntent?: (intent: AcpMapIntent) => void;
  onPresentationVisibilityChange?: (visible: boolean) => void;
  t: ChatT;
}

export function usePresentation({
  presentationIntent,
  presentationRequest,
  status,
  events,
  knownSlugs,
  knownRelations,
  lastUserEventIndex,
  presentationOpen,
  setPresentationOpen,
  presentationSceneIndex,
  setPresentationSceneIndex,
  presentationOfferRef,
  inputRef,
  setHistoryOpen,
  setDraft,
  onMapIntent,
  onPresentationVisibilityChange,
  t,
}: PresentationOptions) {
  const presentationResult = useMemo(
    () => buildAcpPresentationTrace({
      intent: presentationIntent,
      expectedUserText: presentationRequest,
      sessionStatus: status,
      events,
      knownSlugs: knownSlugs ?? EMPTY_KNOWN_SLUGS,
      knownRelations: knownRelations ?? EMPTY_KNOWN_RELATIONS,
    }),
    [events, knownRelations, knownSlugs, presentationIntent, presentationRequest, status],
  );
  const presentationTrace = presentationResult.status === 'ready' ? presentationResult : null;
  const latestUserEvent = events[lastUserEventIndex];
  const currentTurnIsPresentationRequest = latestUserEvent?.kind === 'user'
    && latestUserEvent.text.trim() === presentationRequest?.trim();
  const presentationBlocked = presentationIntent !== null
    && currentTurnIsPresentationRequest
    && status === 'ready'
    && events.some((event) => event.kind === 'agent' && event.text.trim().length > 0)
    && presentationResult.status === 'blocked'
    ? presentationResult
    : null;
  const presentationKey = presentationTrace?.scenes.map((scene) => scene.id).join('|') ?? null;
  const heldPresentationTrace = useHeldValue(presentationTrace, presentationKey);
  const presentationVisible = presentationOpen && presentationTrace !== null;
  useEffect(() => {
    if (!presentationOpen || presentationTrace !== null) return;
    onPresentationVisibilityChange?.(false);
  }, [onPresentationVisibilityChange, presentationOpen, presentationTrace]);
  useEffect(
    () => () => onPresentationVisibilityChange?.(false),
    [onPresentationVisibilityChange],
  );
  const activePresentationIndex = presentationTrace
    ? Math.min(presentationSceneIndex, presentationTrace.scenes.length - 1)
    : 0;
  const focusPresentationScene = (index: number) => {
    if (!presentationTrace) return;
    const bounded = Math.min(Math.max(index, 0), presentationTrace.scenes.length - 1);
    const scene = presentationTrace.scenes[bounded];
    setPresentationSceneIndex(bounded);
    onMapIntent?.({ kind: 'focus', ...scene.focus });
  };
  const openPresentation = () => {
    if (!presentationTrace) return;
    setHistoryOpen(false);
    setPresentationOpen(true);
    onPresentationVisibilityChange?.(true);
    focusPresentationScene(0);
  };
  const closePresentation = () => {
    setPresentationOpen(false);
    onPresentationVisibilityChange?.(false);
    window.requestAnimationFrame(() => presentationOfferRef.current?.focus());
  };
  const askAboutPresentationScene = (scene: AcpPresentationScene) => {
    setPresentationOpen(false);
    onPresentationVisibilityChange?.(false);
    setDraft(t('presentation.askPrompt', {
      title: scene.title ?? t('presentation.sceneFallback', { current: activePresentationIndex + 1 }),
    }));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  return {
    presentationTrace,
    heldPresentationTrace,
    presentationBlocked,
    presentationVisible,
    activePresentationIndex,
    focusPresentationScene,
    openPresentation,
    closePresentation,
    askAboutPresentationScene,
  };
}
