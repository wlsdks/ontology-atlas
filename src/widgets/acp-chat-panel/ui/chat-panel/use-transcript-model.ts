import { useMemo } from 'react';

import { withoutErrorEcho } from '@/features/acp-session';

import { groupEvents } from '../group-events';
import { chatMarkdownComponents } from '../chat-markdown/chat-markdown-components';
import type { SessionState } from './types';

interface TranscriptModelOptions {
  events: SessionState['events'];
  error: SessionState['error'];
  status: SessionState['status'];
  lastUserEventIndex: number;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
  answerFold: { request: string } | null;
}

export function useTranscriptModel({
  events,
  error,
  status,
  lastUserEventIndex,
  knownSlugs,
  onHoverSlug,
  answerFold,
}: TranscriptModelOptions) {
  const transcriptItems = useMemo(() => groupEvents(withoutErrorEcho(events, error)), [events, error]);

  const markdownComponents = useMemo(
    () => chatMarkdownComponents(knownSlugs, onHoverSlug),
    [knownSlugs, onHoverSlug],
  );

  const foldedAnswerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!answerFold) return ids;
    const wanted = answerFold.request.trim();
    if (!wanted) return ids;
    let inside = false;
    for (const item of transcriptItems) {
      if (item.kind !== 'event') continue;
      if (item.event.kind === 'user') {
        inside = item.event.text.trim() === wanted;
        continue;
      }
      if (inside && item.event.kind === 'agent') ids.add(item.event.id);
    }
    return ids;
  }, [answerFold, transcriptItems]);
  const lastWorkGroupId = useMemo(() => {
    for (let index = transcriptItems.length - 1; index >= 0; index -= 1) {
      const item = transcriptItems[index];
      if (item.kind === 'workGroup') return item.id;
    }
    return undefined;
  }, [transcriptItems]);

  const liveToolIds = useMemo(() => {
    const ids = new Set<string>();
    if (status !== 'thinking') return ids;
    for (let index = lastUserEventIndex + 1; index < events.length; index += 1) {
      const event = events[index];
      if (event.kind === 'tool' && !['completed', 'failed', 'cancelled'].includes(event.status)) {
        ids.add(event.id);
      }
    }
    return ids;
  }, [events, lastUserEventIndex, status]);
  return { transcriptItems, markdownComponents, foldedAnswerIds, lastWorkGroupId, liveToolIds };
}
