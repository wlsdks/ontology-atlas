import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const EXPAND_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'expand-affordance', section: 'expand', labelKey: 'nav.settingsMenu.expand.affordanceLabel' },
  { id: 'expand-structure', section: 'expand', labelKey: 'nav.settingsMenu.expand.structureLabel' },
  { id: 'expand-counts', section: 'expand', labelKey: 'nav.settingsMenu.expand.detailShow' },
];
