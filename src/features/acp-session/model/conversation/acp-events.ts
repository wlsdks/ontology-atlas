import type { ToolOutputEvidence } from '../tool-calls/tool-output';

/** One row of the conversation, recorded only after it actually happened. */
export type AcpEvent =
  /** `shown` is the one line the transcript shows for a request the app wrote; the agent receives `text`. */
  | { kind: 'user'; id: string; text: string; shown?: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | {
      kind: 'tool';
      id: string;
      title: string;
      toolKind: string;
      status: string;
      rawInput?: unknown;
      /** The only record of how much came back (`tool-outcome.ts`); large ones are previews. */
      rawOutput?: unknown;
      /** A trimmed answer's analysis rows, held only until its turn is captured. */
      outputEvidence?: ToolOutputEvidence;
    }
  | {
      kind: 'notice';
      id: string;
      text: string;
      /**
       * What `auto-allowed` allowed (the vault-relative path the screen judged), or what
       * `auto-approved` passed under the person's auto-approve choice (a file or tool name).
       */
      detail?: string;
      /** The mode the adapter moved this session into, verbatim: it is the id the tool itself shows, and a friendly name for a mode this app refuses to offer would name something nobody can pick. */
      mode?: string;
      serverGate?: boolean;
    };

export type AcpSessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'exited';

let eventSeq = 0;
export const nextEventId = () => `acp-evt-${(eventSeq += 1)}`;

/** Streamed agent and thought chunks join the row they continue; every other event is a new row. */
export function appendEvent(previous: AcpEvent[], event: AcpEvent): AcpEvent[] {
  const last = previous[previous.length - 1];
  if (last && (event.kind === 'agent' || event.kind === 'thought') && last.kind === event.kind) {
    const next = previous.slice();
    next[next.length - 1] = { ...last, text: last.text + event.text };
    return next;
  }
  return [...previous, event];
}
