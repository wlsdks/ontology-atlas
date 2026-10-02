import type { SettingsCatalogEntry } from './types';

export const EXPAND_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'expand-affordance', section: 'expand', labelKey: 'nav.settingsMenu.expand.affordanceLabel', surface: 'both' },
  { id: 'expand-structure', section: 'expand', labelKey: 'nav.settingsMenu.expand.structureLabel', surface: 'both' },
  { id: 'expand-counts', section: 'expand', labelKey: 'nav.settingsMenu.expand.detailShow', surface: 'both' },
];
