import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const NOTIFY_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'work-in-progress', section: 'notify', labelKey: 'nav.settingsMenu.agentStatusLabel', surface: 'both' },
  { id: 'notifications', section: 'notify', labelKey: 'nav.settingsMenu.agentNotificationsLabel', surface: 'both' },
  { id: 'notification-kinds', section: 'notify', labelKey: 'nav.settingsMenu.agentNotificationKindsLabel', surface: 'both' },
];
