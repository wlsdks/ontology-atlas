import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const FOOTPRINT_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'footprint-strength', section: 'footprint', labelKey: 'nav.settingsMenu.footprint.presetLabel' },
  { id: 'footprint-detail', section: 'footprint', labelKey: 'nav.settingsMenu.footprint.detailShow' },
];
