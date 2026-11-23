import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';

export type BriefingStatus = 'invalidRange' | 'readError' | 'loading' | 'stale' | 'noHistory' | 'noSource' | 'sourceUngranted' | 'sourceUnavailable' | 'empty';

/** What the Changes page states instead of commits, or null when it shows them; each answer names its own cause. */
export function briefingStatus({ root, hasRange, error, loading, data }: { root: string | null; hasRange: boolean; error: boolean; loading: boolean; data: ChangeBriefing | null }): BriefingStatus | null {
  if (!root) return null;
  if (!hasRange) return 'invalidRange';
  if (error) return 'readError';
  if (loading) return 'loading';
  switch (data?.status) {
    case 'stale': return 'stale';
    case 'no-history': return 'noHistory';
    case 'no-source': return 'noSource';
    case 'ungranted': return 'sourceUngranted';
    case 'measured': return data.commits.length ? null : 'empty';
    case 'partial': return null;
    default: return 'sourceUnavailable';
  }
}

/** Statuses a person settles by choosing the code folder: none connected, its grant lost, or unreadable. */
export const needsSourceChoice = (status: BriefingStatus | null): boolean => status === 'noSource' || status === 'sourceUngranted' || status === 'sourceUnavailable';
