import type { SettingsCatalogEntry } from './types';

export const PRIVACY_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    id: 'outbound',
    section: 'privacy',
    labelKey: 'settingsPrivacy.outbound.title',
    keywordsKey: 'settingsPrivacy.outbound.keywords',
    surface: 'both',
  },
  {
    id: 'allowances',
    section: 'privacy',
    labelKey: 'settingsPrivacy.allowances.title',
    keywordsKey: 'settingsPrivacy.allowances.keywords',
    surface: 'desktop',
  },
  {
    id: 'recent-folders',
    section: 'privacy',
    labelKey: 'settingsPrivacy.recent.label',
    keywordsKey: 'settingsPrivacy.recent.keywords',
    surface: 'both',
  },
];
