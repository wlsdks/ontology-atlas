import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const ABOUT_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'version', section: 'about', labelKey: 'settingsAbout.rows.version', keywordsKey: 'settingsAbout.keywords.version' },
  { id: 'update-check', section: 'about', labelKey: 'settingsAbout.rows.updateCheck', keywordsKey: 'settingsAbout.keywords.updateCheck' },
  { id: 'update-auto', section: 'about', labelKey: 'settingsAbout.rows.updateAuto', keywordsKey: 'settingsAbout.keywords.updateAuto' },
  { id: 'whats-new', section: 'about', labelKey: 'settingsAbout.rows.whatsNew', keywordsKey: 'settingsAbout.keywords.whatsNew', href: '/changelog' },
  { id: 'keyboard-shortcuts', section: 'about', labelKey: 'settingsAbout.rows.keyboardShortcuts', keywordsKey: 'settingsAbout.keywords.keyboardShortcuts' },
  { id: 'source', section: 'about', labelKey: 'settingsAbout.rows.source', keywordsKey: 'settingsAbout.keywords.source' },
  { id: 'licences', section: 'about', labelKey: 'settingsAbout.rows.licences', keywordsKey: 'settingsAbout.keywords.licences' },
  { id: 'diagnostics', section: 'about', labelKey: 'settingsAbout.rows.diagnostics', keywordsKey: 'settingsAbout.keywords.diagnostics' },
  { id: 'logs', section: 'about', labelKey: 'settingsAbout.rows.logs', keywordsKey: 'settingsAbout.keywords.logs' },
];
