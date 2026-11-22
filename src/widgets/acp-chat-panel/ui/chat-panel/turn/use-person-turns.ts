import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import type { ChatSuggestion } from '@/features/acp-session';

import type { SessionState } from '../chat-panel-props';
import { offersNextSteps, startedPersonTurnId } from './person-turns';
import { lastUserEventIndexOf } from './turn-state';

/**
 * Which turns the person started themselves, what they stopped, and the next steps that follow. A send
 * made here is remembered so its user message can be told apart from one the app composed.
 */
export function usePersonTurns({
  events,
  suggestions,
  send,
  setPresentationOpen,
  onPresentationVisibilityChange,
}: {
  events: SessionState['events'];
  suggestions: readonly ChatSuggestion[];
  send: SessionState['send'];
  setPresentationOpen: Dispatch<SetStateAction<boolean>>;
  onPresentationVisibilityChange?: (visible: boolean) => void;
}) {
  const latestUserEventId = useMemo(() => events[lastUserEventIndexOf(events)]?.id ?? null, [events]);
  const [personSendFrom, setPersonSendFrom] = useState<{ after: string | null } | null>(null);
  const [personTurnIds, setPersonTurnIds] = useState<ReadonlySet<string>>(() => new Set());
  const startedTurnId = startedPersonTurnId(personSendFrom, latestUserEventId);
  if (startedTurnId !== null) {
    setPersonTurnIds((previous) => new Set(previous).add(startedTurnId));
    setPersonSendFrom(null);
  }
  // Done for now holds until the person's next typed turn.
  const [nextStepsDismissed, setNextStepsDismissed] = useState(false);
  const [cancelledWaitTurnId, setCancelledWaitTurnId] = useState<string | null>(null);
  const sendAsPerson = useCallback((text: string) => {
    setPersonSendFrom({ after: latestUserEventId });
    setPresentationOpen(false);
    onPresentationVisibilityChange?.(false);
    void send(text);
  }, [latestUserEventId, onPresentationVisibilityChange, send, setPresentationOpen]);

  const nextSteps = nextStepsDismissed ? [] : suggestions;
  const postTurnNextSteps = offersNextSteps({ latestUserEventId, personTurnIds, cancelledWaitTurnId })
    ? nextSteps
    : [];

  return {
    nextSteps,
    postTurnNextSteps,
    setNextStepsDismissed,
    cancelledWaitTurnId,
    setCancelledWaitTurnId,
    sendAsPerson,
  };
}
