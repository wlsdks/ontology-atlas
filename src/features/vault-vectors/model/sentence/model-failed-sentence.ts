import { modelFailedDetail } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';

type MeaningTranslate = (key: 'modelFailed' | 'modelFailedDetail' | 'modelFailedGeneric', values?: Record<string, string>) => string;

/** One sentence per detail of the closed list; any other detail is the generic one, never its code. */
export function modelFailedSentence(t: MeaningTranslate, detail: string | null): string {
  const code = modelFailedDetail(detail);
  if (code === null) return t('modelFailedGeneric');
  return t('modelFailed', { detail: t('modelFailedDetail', { code: code.replaceAll('-', '_') }) });
}
