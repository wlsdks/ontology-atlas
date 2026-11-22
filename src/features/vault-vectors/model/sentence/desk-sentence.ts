import { formatSize } from '@/shared/lib/format-size';
import type { DeskLine, DeskLineMessage, DeskProgress } from '../desk-line';
import { modelFailedSentence } from './model-failed-sentence';

type DeskTranslate = (
  key: DeskLineMessage | 'failureDetail' | 'modelFailedDetail' | 'modelFailedGeneric',
  values?: Record<string, string | number> | DeskLine['values'],
) => string;

/** A working line without `progress` counts nothing. */
export function deskSentence(
  t: DeskTranslate,
  locale: string,
  line: Pick<DeskLine, 'message' | 'values'>,
  progress: Pick<DeskProgress, 'done' | 'total'> | null = null,
): string {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  switch (line.message) {
    case 'modelDownloading':
      return t('modelDownloading', {
        percent: total > 0 ? Math.floor((done / total) * 100) : 0,
        done: formatSize(done, locale),
        total: formatSize(total, locale),
      });
    case 'modelDownloadPaused':
      return t('modelDownloadPaused', { done: formatSize(line.values.done ?? 0, locale), total: formatSize(line.values.total ?? 0, locale) });
    case 'preparing':
      return t('preparing', { done: Math.floor(done), total });
    case 'modelFailed':
      return modelFailedSentence(t, line.values.detail ?? null);
    case 'modelDownloadFailed':
    case 'writeFailed':
      return t(line.message, { detail: t('failureDetail', { code: (line.values.detail ?? '').replaceAll('-', '_') }) });
    default:
      return t(line.message, line.values);
  }
}
