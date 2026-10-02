import { hangulIncludes, hangulStartsWith } from '@/shared/lib/hangul-match';

import type { SettingId, SettingsSectionId } from './catalog/types';

export const SETTINGS_SEARCH_LIMIT = 30;

export interface SettingsSearchItem {
  id: SettingId;
  section: SettingsSectionId;
  label: string;
  keywords: string;
  sectionLabel: string;
  scopeLabel: string;
  opensLabel?: string;
}

export interface SettingsSearchGroup {
  section: SettingsSectionId;
  sectionLabel: string;
  scopeLabel: string;
  items: SettingsSearchItem[];
}

function fold(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

function startsWith(haystack: string, query: string): boolean {
  return fold(haystack).startsWith(query) || hangulStartsWith(haystack, query);
}

function includes(haystack: string, query: string): boolean {
  return fold(haystack).includes(query) || hangulIncludes(haystack, query);
}

function words(haystack: string): string[] {
  return haystack.split(/[\s·,/()-]+/).filter((word) => word !== '');
}

function wordStartsWith(haystack: string, query: string): boolean {
  return words(haystack).some((word) => startsWith(word, query));
}

function hasWord(item: SettingsSearchItem, query: string): boolean {
  return [...words(item.label), ...words(item.keywords)].some((word) => fold(word) === query);
}

function tierOf(item: SettingsSearchItem, query: string): number | null {
  if (hasWord(item, query)) return 0;
  if (startsWith(item.label, query)) return 1;
  if (wordStartsWith(item.label, query)) return 2;
  if (includes(item.label, query)) return 3;
  if (item.keywords && includes(item.keywords, query)) return 4;
  if (includes(item.sectionLabel, query)) return 5;
  return null;
}

/** The catalog holds at most 40 resolved entries, so one linear scan per keystroke is enough. */
export function searchSettings(
  items: readonly SettingsSearchItem[],
  rawQuery: string,
  limit = SETTINGS_SEARCH_LIMIT,
): SettingsSearchItem[] {
  const query = fold(rawQuery.trim());
  if (query === '') return [];
  const tiers: SettingsSearchItem[][] = [[], [], [], [], [], []];
  for (const item of items) {
    const tier = tierOf(item, query);
    if (tier !== null) tiers[tier]!.push(item);
  }
  return tiers.flat().slice(0, limit);
}

export function groupSettingsResults(results: readonly SettingsSearchItem[]): SettingsSearchGroup[] {
  const groups = new Map<SettingsSectionId, SettingsSearchGroup>();
  for (const item of results) {
    const group = groups.get(item.section);
    if (group) group.items.push(item);
    else
      groups.set(item.section, {
        section: item.section,
        sectionLabel: item.sectionLabel,
        scopeLabel: item.scopeLabel,
        items: [item],
      });
  }
  return [...groups.values()];
}
