import { GATEWAY_MESSAGE_PATHS } from '@/i18n/gateway-messages';
import { SETTINGS_SEARCH_MESSAGE_PATHS } from '@/widgets/app-settings-menu';

/**
 * Server-side only: the message paths `/` hands its client tree before the installed app has a
 * folder (`app/[locale]/layout.tsx`, `WorkbenchMessagesProvider`): the shared gateway subset, the
 * root entry's copy, and what the workbench shell renders around them while its rail is hidden,
 * the bottom tab bar's `nav` included. The export of `/` fails on a message this list lacks.
 */
export const ROOT_ENTRY_MESSAGE_PATHS: readonly string[] = [
  ...GATEWAY_MESSAGE_PATHS,
  'rootEntry',
  'nav',
  // The rail's folder tile names a remembered folder while it restores, before the catalog lands.
  'vaultSwitch',
  ...SETTINGS_SEARCH_MESSAGE_PATHS,
];
