import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { briefingRange, movePeriod } from './briefing-model';
import { latestChangeDay } from './change-digest';

const LOOKBACK_DAYS = [7, 31, 366] as const;

type ReadHistory = (startEpoch: number, endEpoch: number) => Promise<ChangeBriefing | null>;

/**
 * Widens the window back from today until a read holds a change, so a quiet repository costs a few
 * small reads instead of one read of its whole history. Null when history holds no change or a read fails.
 */
export async function findLatestChangeDay(read: ReadHistory, today: string): Promise<string | null> {
  const end = briefingRange('day', today)?.endEpoch;
  if (end === undefined) return null;
  const starts = [...LOOKBACK_DAYS.map(days => briefingRange('day', movePeriod('day', today, 1 - days))?.startEpoch ?? 0), 0];
  for (const start of starts) {
    const data = await read(start, end);
    if (!data || (data.status !== 'measured' && data.status !== 'partial')) return null;
    const day = latestChangeDay(data.commits);
    if (day) return day;
  }
  return null;
}
