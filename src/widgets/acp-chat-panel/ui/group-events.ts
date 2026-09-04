import type { AcpEvent } from '@/features/acp-session';

type AcpWorkEvent = Extract<AcpEvent, { kind: 'thought' }>;

export type TranscriptItem =
  | { kind: 'event'; event: Exclude<AcpEvent, AcpWorkEvent> }
  | { kind: 'workGroup'; id: string; events: AcpWorkEvent[] };

/**
 * Separates the answer from the agent's work stream — and separates that stream into its
 * two halves, which are not the same thing.
 *
 * **Thinking is folded.** One user message starts one turn; every thought chunk in that
 * turn is collected into one disclosure at the position where thinking first appeared. It
 * is multi-paragraph markdown, and standing it would let the middle of the work outweigh
 * the conclusion — the failure this function was written to prevent.
 *
 * **Tool calls stand** (2026-09-05). A tool call is one dim line naming what was touched
 * and what came back, and it is the only thing on screen that can tell you *why* an answer
 * is wrong — that the search found nothing, or read a stale frame. Folded away, that
 * diagnosis costs a click nobody makes while reading a confident paragraph, so the wrong
 * answer is simply believed. So they are returned in place, in arrival order, and the
 * panel draws them as ordinary transcript rows.
 *
 * A later user message starts a new group.
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

    if (event.kind === 'thought') {
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
