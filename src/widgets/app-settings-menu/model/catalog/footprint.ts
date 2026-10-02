import type { SettingsCatalogEntry } from './types';

export const FOOTPRINT_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'footprint-strength', section: 'footprint', labelKey: 'nav.settingsMenu.footprint.presetLabel', surface: 'both' },
  { id: 'footprint-detail', section: 'footprint', labelKey: 'nav.settingsMenu.footprint.detailShow', surface: 'both' },
];
