import { use, type ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import type { AppLocale } from '@/i18n/locales';
import { loadWorkbenchCatalog } from '@/i18n/workbench-catalog';

/**
 * The workbench's messages: the whole catalog, one chunk per language (`src/i18n/workbench-catalog.ts`).
 * Every route waits for the chunk before it renders, so no screen shows a raw key.
 */
export function WorkbenchMessagesProvider({
  locale,
  timeZone,
  children,
}: {
  locale: AppLocale;
  timeZone: string;
  children: ReactNode;
}) {
  // Always read through `use`, loaded or not: a component that suspended in `use` and then finished a retry without
  // calling it makes React log a misuse. The loader hands out a promise that is already settled once the catalog
  // is there, so the read then returns at once.
  const messages = use(loadWorkbenchCatalog(locale));

  return (
    <IntlProvider locale={locale} timeZone={timeZone} messages={messages}>
      {children}
    </IntlProvider>
  );
}
