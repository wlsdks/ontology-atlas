import type { SettingsCatalogEntry } from './types';

export const SCREEN_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'language', section: 'screen', labelKey: 'settingsScreen.languageLabel', surface: 'both' },
  { id: 'view-mode', section: 'screen', labelKey: 'settingsScreen.viewModeLabel', surface: 'both' },
  { id: 'type-size', section: 'screen', labelKey: 'settingsScreen.textSizeLabel', surface: 'both' },
  { id: 'concept-icons', section: 'screen', labelKey: 'settingsScreen.conceptIconsLabel', surface: 'both' },
  { id: 'motion', section: 'screen', labelKey: 'settingsScreen.motionLabel', surface: 'both' },
  { id: 'screen-guides', section: 'screen', labelKey: 'settingsScreen.guidesLabel', surface: 'both' },
];
