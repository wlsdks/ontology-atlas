import type { AppLocale } from '@/i18n/locales';

import { messageReader, screenMetadata, type MessageTree, type ScreenHead } from './screen-metadata';

/** A route loader's answer for its head: the screen's declared facts in the route's language. */
export function loadScreenMetadata(head: ScreenHead, locale: string, messages: MessageTree) {
  return screenMetadata(head, locale as AppLocale, messageReader(locale as AppLocale, messages));
}
