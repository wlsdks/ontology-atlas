/** What Planning shows: a folder's workbench, a door, or the wait while either is decided. */
export type PlanningArrival = 'workbench' | 'checking' | 'open-home' | 'create-home' | 'picker' | 'unsupported';

/**
 * A loaded ontology folder decides first: its `planning/` opens at once, or its absence offers to
 * make it. Without one, the native picker is the only door, as before the home folder existed.
 */
export function planningArrival({ selection, nativeAvailable, vault, home }: {
  selection: 'home' | 'picked' | null;
  nativeAvailable: boolean | null;
  vault: 'pending' | 'none' | 'loaded';
  home: 'unknown' | 'present' | 'absent';
}): PlanningArrival {
  if (selection === 'home') return 'workbench';
  if (selection === 'picked' && nativeAvailable !== false) return nativeAvailable ? 'workbench' : 'checking';
  if (vault === 'pending') return 'checking';
  if (vault === 'loaded') {
    if (home === 'present') return 'open-home';
    return home === 'absent' && nativeAvailable !== null ? 'create-home' : 'checking';
  }
  if (nativeAvailable === null) return 'checking';
  return nativeAvailable ? 'picker' : 'unsupported';
}
