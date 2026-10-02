import type { SettingsCatalogEntry } from './types';

export const ABOUT_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'version', section: 'about', labelKey: 'settingsAbout.rows.version', keywordsKey: 'settingsAbout.keywords.version', surface: 'both' },
  { id: 'update-check', section: 'about', labelKey: 'settingsAbout.rows.updateCheck', keywordsKey: 'settingsAbout.keywords.updateCheck', surface: 'desktop' },
  { id: 'update-auto', section: 'about', labelKey: 'settingsAbout.rows.updateAuto', keywordsKey: 'settingsAbout.keywords.updateAuto', surface: 'desktop' },
  { id: 'whats-new', section: 'about', labelKey: 'settingsAbout.rows.whatsNew', keywordsKey: 'settingsAbout.keywords.whatsNew', surface: 'both', href: '/changelog' },
  { id: 'keyboard-shortcuts', section: 'about', labelKey: 'settingsAbout.rows.keyboardShortcuts', keywordsKey: 'settingsAbout.keywords.keyboardShortcuts', surface: 'both' },
  { id: 'source', section: 'about', labelKey: 'settingsAbout.rows.source', keywordsKey: 'settingsAbout.keywords.source', surface: 'both' },
  { id: 'licences', section: 'about', labelKey: 'settingsAbout.rows.licences', keywordsKey: 'settingsAbout.keywords.licences', surface: 'both' },
  { id: 'diagnostics', section: 'about', labelKey: 'settingsAbout.rows.diagnostics', keywordsKey: 'settingsAbout.keywords.diagnostics', surface: 'both' },
  { id: 'logs', section: 'about', labelKey: 'settingsAbout.rows.logs', keywordsKey: 'settingsAbout.keywords.logs', surface: 'desktop' },
];
