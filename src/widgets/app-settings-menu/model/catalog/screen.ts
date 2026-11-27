import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const SCREEN_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'language', section: 'screen', labelKey: 'settingsScreen.languageLabel' },
  { id: 'view-mode', section: 'screen', labelKey: 'settingsScreen.viewModeLabel' },
  { id: 'type-size', section: 'screen', labelKey: 'settingsScreen.textSizeLabel' },
  { id: 'concept-icons', section: 'screen', labelKey: 'settingsScreen.conceptIconsLabel' },
  { id: 'motion', section: 'screen', labelKey: 'settingsScreen.motionLabel' },
  { id: 'screen-guides', section: 'screen', labelKey: 'settingsScreen.guidesLabel' },
];
