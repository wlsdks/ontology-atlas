import type { NarrativeSource } from './narrative';

export function formatPrTime(value: string, locale: string): string {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epoch)) : value;
}
export function prCopyDetails(source: Pick<NarrativeSource, 'fetchedAt' | 'copyKind'>, clearedAt: number, locale: string) {
  const sessionOnly = source.copyKind === 'session' || (clearedAt > 0 && Date.parse(source.fetchedAt ?? '') <= clearedAt);
  return { key: sessionOnly ? 'prSessionVersion' as const : source.copyKind === 'saved' ? 'prSavedVersion' as const : 'prFreshVersion' as const, fetchedAt: formatPrTime(source.fetchedAt ?? '', locale) };
}
