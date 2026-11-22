import { useState } from 'react';
import type { WorkTracks } from '@/shared/lib/work-status/work-tracks';

/**
 * When this screen last saw something running in each worktree, so a held worktree dozes only
 * after five minutes with nothing seen at work. Only reads this screen made count; nothing is kept
 * when the screen unmounts.
 */
export function useRunningMemory(tracks: WorkTracks | null, readAtMs: number): ReadonlyMap<string, number> {
  const [memory, setMemory] = useState<{ tracks: WorkTracks | null; seen: ReadonlyMap<string, number> }>({ tracks: null, seen: new Map() });
  if (tracks !== memory.tracks) {
    const seen = new Map(memory.seen);
    if (tracks) {
      for (const track of [...tracks.stuck, ...tracks.sessions.flatMap(session => session.tracks), ...tracks.unheld]) {
        if (track.running) seen.set(track.key, readAtMs);
      }
    }
    setMemory({ tracks, seen });
    return seen;
  }
  return memory.seen;
}
