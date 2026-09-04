import type { AcpEvent } from '@/features/acp-session';

type AcpWorkEvent = Extract<AcpEvent, { kind: 'thought' }>;

type AcpToolEvent = Extract<AcpEvent, { kind: 'tool' }>;

export type TranscriptItem =
  | { kind: 'event'; event: Exclude<AcpEvent, AcpWorkEvent | AcpToolEvent> }
  | { kind: 'workGroup'; id: string; events: AcpWorkEvent[] }
  /** Consecutive tool calls, drawn as one block. Nothing is folded away. */
  | { kind: 'toolRun'; id: string; events: AcpToolEvent[] };

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
 * answer is simply believed.
 *
 * **Consecutive calls come back as one run.** Standing rows won the diagnosis and then
 * cost the transcript its shape: four dim lines with nothing tying them together read as
 * four unrelated interruptions rather than one stretch of work. The run is a grouping for
 * the panel to draw a single rule beside — every row is still on screen, in arrival order,
 * and nothing is collapsible.
 *
 * A later user message starts a new group.
 */
export function groupEvents(events: readonly AcpEvent[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  let workGroup: Extract<TranscriptItem, { kind: 'workGroup' }> | null = null;
  let toolRun: Extract<TranscriptItem, { kind: 'toolRun' }> | null = null;

  for (const event of events) {
    if (event.kind === 'user') {
      workGroup = null;
      toolRun = null;
      out.push({ kind: 'event', event });
      continue;
    }

    if (event.kind === 'thought') {
      toolRun = null;
      if (!workGroup) {
        workGroup = { kind: 'workGroup', id: event.id, events: [] };
        out.push(workGroup);
      }
      workGroup.events.push(event);
      continue;
    }

    if (event.kind === 'tool') {
      if (!toolRun) {
        toolRun = { kind: 'toolRun', id: event.id, events: [] };
        out.push(toolRun);
      }
      toolRun.events.push(event);
      continue;
    }

    toolRun = null;
    out.push({ kind: 'event', event });
  }

  return out;
}
