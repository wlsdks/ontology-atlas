import { analysisScopeKey, readAnalysisHistory, type AnalysisRun } from '@/entities/analysis-record';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** The saved runs the retired Written explanations section listed: this analysis surface, this exact scope. */
export async function countSavedExplanations(
  handle: FileSystemDirectoryHandle,
  context: { mode: AnalysisRun['mode']; scope: AnalysisRun['scope'] },
): Promise<number> {
  const wanted = analysisScopeKey(context.mode, context.scope);
  let count = 0;
  let cursor: string | null = null;
  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    const page: Awaited<ReturnType<typeof readAnalysisHistory>> | null = await readAnalysisHistory(handle, { limit: PAGE_SIZE, cursor }).catch(() => null);
    if (!page) break;
    count += page.records.filter((record): record is AnalysisRun => record.recordType === 'run'
      && record.origin.surface === 'analysis' && record.mode === context.mode && analysisScopeKey(record.mode, record.scope) === wanted).length;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return count;
}
