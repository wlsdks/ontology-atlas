import { BELL_TABS, type BellTab } from './bell-inbox';

const TAB_STORAGE_KEY = 'atlas.agentActivity.tab';

export function readStoredTab(): BellTab | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    return BELL_TABS.find((tab) => tab === raw) ?? null;
  } catch {
    return null;
  }
}

export function writeStoredTab(tab: BellTab): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Private mode — the tab is still remembered for this session by React state.
  }
}

/**
 * Which tab opens, decided once at mount: a waiting request first, so it is never two tabs away;
 * then the remembered tab while it has content; else the first tab that does. The badge and the
 * opening tab must name the same thing, so a remembered non-empty tab never wins over a request.
 */
export function openingTab(counts: Record<BellTab, number>, remembered: BellTab | null): BellTab {
  if (counts.todo > 0) return 'todo';
  if (remembered && counts[remembered] > 0) return remembered;
  return BELL_TABS.find((key) => counts[key] > 0) ?? remembered ?? 'todo';
}
