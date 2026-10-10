import { useEffect, useMemo } from 'react';

import type { ChatSuggestion } from '@/features/acp-session';
import { useHeldValue } from '@/shared/lib/use-presence';

import type { SessionState } from './types';

interface TranscriptSignalsOptions {
  events: SessionState['events'];
  status: SessionState['status'];
  pending: SessionState['pending'];
  error: SessionState['error'];
  draft: string;
  suggestions: readonly ChatSuggestion[];
  followTranscript: () => void;
  restoreTranscript: () => void;
}

export function useTranscriptSignals({
  events,
  status,
  pending,
  error,
  draft,
  suggestions,
  followTranscript,
  restoreTranscript,
}: TranscriptSignalsOptions) {
  const lastUserEventIndex = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].kind === 'user') return index;
    }
    return -1;
  }, [events]);
  const postTurnSuggestions = suggestions.filter(
    (suggestion) => suggestion.kind !== 'connectSource',
  );
  const hasCompletedAgentAnswer = events.some(
    (event, index) =>
      index > lastUserEventIndex
      && event.kind === 'agent'
      && event.text.trim().length > 0,
  );
  const showPostTurnSuggestions =
    lastUserEventIndex >= 0
    && hasCompletedAgentAnswer
    && status === 'ready'
    && pending === null
    && error === null
    && draft.length === 0
    && postTurnSuggestions.length > 0;
  const postTurnSuggestionKey = showPostTurnSuggestions
    ? JSON.stringify(postTurnSuggestions)
    : null;
  const postTurnSuggestionsHeld =
    useHeldValue(
      showPostTurnSuggestions ? postTurnSuggestions : null,
      postTurnSuggestionKey,
    ) ?? [];

  const lastUserEventId = lastUserEventIndex >= 0 ? events[lastUserEventIndex]?.id ?? null : null;
  useEffect(() => {
    if (lastUserEventId) followTranscript();
  }, [followTranscript, lastUserEventId]);
  const firstEventId = events[0]?.id ?? null;
  useEffect(() => {
    restoreTranscript();
  }, [firstEventId, restoreTranscript]);
  return { lastUserEventIndex, hasCompletedAgentAnswer, showPostTurnSuggestions, postTurnSuggestionsHeld };
}
