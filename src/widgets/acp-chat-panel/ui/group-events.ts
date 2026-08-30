import type { AcpEvent } from '@/features/acp-session/model/use-acp-session';

type AcpWorkEvent = Extract<AcpEvent, { kind: 'thought' | 'tool' }>;

export type TranscriptItem =
  | { kind: 'event'; event: Exclude<AcpEvent, AcpWorkEvent> }
  | { kind: 'workGroup'; id: string; events: AcpWorkEvent[] };

/**
 * Separates the answer from the agent's work stream.
 *
 * One user message starts one turn. Every thought/tool event in that turn is
 * collected into one disclosure at the position where work first appeared;
 * agent prose stays in the transcript as prose. A later user message starts a
 * new group. This keeps the causal boundary without letting raw tool traffic
 * become the conversation's visual hierarchy.
 */
export function groupEvents(events: readonly AcpEvent[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  let workGroup: Extract<TranscriptItem, { kind: 'workGroup' }> | null = null;

  for (const event of events) {
    if (event.kind === 'user') {
      workGroup = null;
      out.push({ kind: 'event', event });
      continue;
    }

    if (event.kind === 'thought' || event.kind === 'tool') {
      if (!workGroup) {
        workGroup = { kind: 'workGroup', id: event.id, events: [] };
        out.push(workGroup);
      }
      workGroup.events.push(event);
      continue;
    }

    out.push({ kind: 'event', event });
  }

  return out;
}
