import type { AcpEvent } from '@/features/acp-session';

type AcpWorkEvent = Extract<AcpEvent, { kind: 'thought' }>;

type AcpToolEvent = Extract<AcpEvent, { kind: 'tool' }>;

/**
 * One drawn line of a tool run.
 *
 * `repeat` is how many calls that line stands for — always `1` unless a run of identical
 * calls was folded onto it (see `REPEAT_THRESHOLD`).
 */
interface TranscriptToolRow {
  event: AcpToolEvent;
  repeat: number;
}

export type TranscriptItem =
  | { kind: 'event'; event: Exclude<AcpEvent, AcpWorkEvent | AcpToolEvent> }
  | { kind: 'workGroup'; id: string; events: AcpWorkEvent[] }
  /**
   * Consecutive tool calls, drawn as one block. Nothing is hidden: `count` is how many calls
   * happened and `rows` is how many lines draw them, and the two differ only where a run of
   * identical calls folded onto one row that says `×N`.
   */
  | { kind: 'toolRun'; id: string; rows: TranscriptToolRow[]; count: number };

/**
 * **Three is where a repeat stops being a step and becomes a texture.**
 *
 * Two identical rows still read as two things that happened, and a reader counts them without
 * effort. From the third the column stops carrying information and starts carrying rhythm: the
 * eye reports "a lot of the same" and the *next*, different call — the one that might explain a
 * wrong answer — loses its place in the run. Below this number nothing is folded, because folding
 * a pair would cost a `×2` badge to save one line.
 */
const REPEAT_THRESHOLD = 3;

/**
 * **Two calls are the same call only when nothing a reader could act on differs.**
 *
 * The name is the label, the input is the target, and the answer is the outcome — the three
 * things the row actually draws. Comparing the name alone would fold four reads of four different
 * concepts into "read a concept ×4", which deletes exactly the evidence the standing tool row was
 * kept for. Comparing the answer too is what keeps `nothing found` from being absorbed by three
 * neighbours that found something: a distinct outcome never merges.
 *
 * `id` is deliberately absent — every call has its own, so including it would make the key unique
 * and the fold unreachable.
 */
function repeatKey(event: AcpToolEvent): string {
  return JSON.stringify([
    event.title,
    event.toolKind,
    event.status,
    event.rawInput ?? null,
    event.rawOutput ?? null,
  ]);
}

/**
 * Fold only runs that reach the threshold, and only while they are adjacent. A later identical
 * call after something else happened is a second attempt, not a repetition, so the run restarts.
 */
function foldRepeats(events: readonly AcpToolEvent[]): TranscriptToolRow[] {
  const rows: TranscriptToolRow[] = [];
  let index = 0;
  while (index < events.length) {
    const key = repeatKey(events[index]);
    let end = index + 1;
    while (end < events.length && repeatKey(events[end]) === key) end += 1;
    const run = end - index;
    if (run >= REPEAT_THRESHOLD) {
      rows.push({ event: events[index], repeat: run });
    } else {
      for (let at = index; at < end; at += 1) rows.push({ event: events[at], repeat: 1 });
    }
    index = end;
  }
  return rows;
}

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
 * **Only repetition collapses** (2026-09-06). The 2026-09-05 decision that an agent's lookups
 * stand above its answer is unchanged: no tool call is hidden behind a click. What a run of three
 * or more byte-identical calls loses is its *separate lines* — same name, same input, same answer
 * is one fact stated three times, and stating it three times pushes the next, different call out
 * of view. The row still says how many (`×N`), so nothing about what happened is lost.
 *
 * A later user message starts a new group.
 */
export function groupEvents(events: readonly AcpEvent[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  let workGroup: Extract<TranscriptItem, { kind: 'workGroup' }> | null = null;
  /** Collected raw calls for the open run; folded into rows when the run closes. */
  let toolRun: { item: Extract<TranscriptItem, { kind: 'toolRun' }>; events: AcpToolEvent[] } | null =
    null;
  const closeRun = () => {
    if (!toolRun) return;
    toolRun.item.rows = foldRepeats(toolRun.events);
    toolRun.item.count = toolRun.events.length;
    toolRun = null;
  };

  for (const event of events) {
    if (event.kind === 'user') {
      workGroup = null;
      closeRun();
      out.push({ kind: 'event', event });
      continue;
    }

    if (event.kind === 'thought') {
      closeRun();
      if (!workGroup) {
        workGroup = { kind: 'workGroup', id: event.id, events: [] };
        out.push(workGroup);
      }
      workGroup.events.push(event);
      continue;
    }

    if (event.kind === 'tool') {
      if (!toolRun) {
        const item: Extract<TranscriptItem, { kind: 'toolRun' }> = {
          kind: 'toolRun',
          id: event.id,
          rows: [],
          count: 0,
        };
        toolRun = { item, events: [] };
        out.push(item);
      }
      toolRun.events.push(event);
      continue;
    }

    closeRun();
    out.push({ kind: 'event', event });
  }

  closeRun();
  return out;
}
