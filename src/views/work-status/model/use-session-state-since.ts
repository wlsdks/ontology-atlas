import { useState } from 'react';
import { rememberStateSince, type StateSince } from '@/shared/lib/work-status/signals/session-lines';
import type { AgentSessionRow } from '@/shared/lib/work-status/tauri-work-status';
import type { WorkTracks } from '@/shared/lib/work-status/work-tracks';

const NOTHING_SEEN: ReadonlyMap<number, StateSince> = new Map();

/**
 * Since when each listed session has said what it says now, for as long as this screen stays open:
 * a session first seen counts from its start, a change from the read that saw it.
 */
export function useSessionStateSince(rows: readonly AgentSessionRow[], readAtMs: number, tracks: WorkTracks | null): ReadonlyMap<number, StateSince> {
  const [memory, setMemory] = useState<{ rows: readonly AgentSessionRow[] | null; since: ReadonlyMap<number, StateSince> }>({ rows: null, since: NOTHING_SEEN });
  if (rows === memory.rows) return memory.since;
  const startedAtMs = new Map<number, number>();
  for (const session of tracks?.sessions ?? []) {
    if (session.pid !== null && session.startedAt !== null) startedAtMs.set(session.pid, session.startedAt * 1000);
  }
  const since = rememberStateSince(memory.since, rows, readAtMs, pid => startedAtMs.get(pid) ?? null);
  setMemory({ rows, since });
  return since;
}
