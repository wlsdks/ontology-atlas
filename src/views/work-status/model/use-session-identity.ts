import { useState } from 'react';
import { keepSessionIdentity, type SessionIdentity, type WorkTracks } from '@/shared/lib/work-status/work-tracks';

/**
 * The reads with each live session's ink and number kept from the read before, for as long as this
 * screen stays open.
 */
export function useSessionIdentity(tracks: WorkTracks | null): WorkTracks | null {
  const [memory, setMemory] = useState<{
    source: WorkTracks | null;
    kept: WorkTracks | null;
    identities: ReadonlyMap<string, SessionIdentity>;
  }>({ source: null, kept: null, identities: new Map() });
  if (tracks !== memory.source) {
    const next = tracks ? keepSessionIdentity(tracks, memory.identities) : { tracks: null, identities: memory.identities };
    setMemory({ source: tracks, kept: next.tracks, identities: next.identities });
    return next.tracks;
  }
  return memory.kept;
}
