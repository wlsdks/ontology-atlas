import { useEffect, useState } from 'react';
import {
  readAgentSessions,
  setAgentSessionsRead,
  type AgentSessionRow,
  type AgentSessionsReadStatus,
} from '@/shared/lib/work-status/tauri-work-status';

/** How often the visible screen asks; Rust decides whether an ask reads the list again or answers from its last one. */
export const SESSIONS_ASK_MS = 2000;

/** `off`: the person stopped the read. `pending` also covers an ask not answered yet. */
export type SessionListStatus = AgentSessionsReadStatus | 'off';

export interface SessionListRead {
  rows: readonly AgentSessionRow[];
  status: SessionListStatus;
}

const NO_ROWS: readonly AgentSessionRow[] = [];
const NOT_ASKED: { root: string | null } & SessionListRead = { root: null, rows: NO_ROWS, status: 'pending' };
const OFF: SessionListRead = { rows: NO_ROWS, status: 'off' };
const PENDING: SessionListRead = { rows: NO_ROWS, status: 'pending' };

const sameRows = (a: readonly AgentSessionRow[], b: readonly AgentSessionRow[]) =>
  a.length === b.length && a.every((row, index) => row.pid === b[index].pid && row.worktreeId === b[index].worktreeId && row.state === b[index].state);

/**
 * What each Claude Code session in the repository says of itself and how the read went, asked
 * while the screen is visible and the read is switched on. An answer equal to the last keeps its
 * object, so nothing downstream recomputes; a hidden screen asks nothing. Switched off, nothing is
 * asked and Rust is told, so no program is started and the list it held is dropped.
 */
export function useAgentSessions(root: string | null, enabled: boolean): SessionListRead {
  const [read, setRead] = useState(NOT_ASKED);

  useEffect(() => {
    if (!enabled) void setAgentSessionsRead(false).catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!root || !enabled) return;
    let cancelled = false;
    let timer: number | undefined;
    const ask = async () => {
      if (document.visibilityState === 'visible') {
        const answer = await readAgentSessions(root).catch(() => null);
        if (cancelled) return;
        if (answer) {
          setRead(current =>
            current.root === root && current.status === answer.status && sameRows(current.rows, answer.rows)
              ? current
              : { root, rows: answer.rows, status: answer.status },
          );
        }
      }
      timer = window.setTimeout(() => void ask(), SESSIONS_ASK_MS);
    };
    // Rust hears "on" before the first ask, since it refuses asks while it holds "off".
    void setAgentSessionsRead(true)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) void ask();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // A read switched on again starts from nothing, never from the rows of before.
      setRead(NOT_ASKED);
    };
  }, [root, enabled]);

  if (!enabled) return OFF;
  return read.root === root && root !== null ? read : PENDING;
}
