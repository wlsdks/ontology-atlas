import { use, type ReactNode } from 'react';
import { IntlProvider, type IntlError } from 'use-intl';
import type { AppLocale } from '@/i18n/locales';
import { loadWorkbenchCatalog, useWorkbenchCatalog, type MessageCatalog } from '@/i18n/workbench-catalog';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import { stripLocalePrefix } from '@/shared/lib/navigation/nav-destination';
import { useCommittedAddress } from '@/shared/lib/navigation/use-committed-address';

/**
 * The workbench's messages. `/` starts from `rootMessages`, the subset the neutral frame and the
 * hidden shell around it read, and gains the whole catalog once the installed app has a folder
 * (`requestRootWorkbench` in `@/views/root-entry`). Every other route, and `/` in the installed
 * app, renders with the whole catalog: the server reads it before rendering, and the browser holds
 * hydration on the server's HTML until the chunk arrives, so no screen shows a raw key.
 */
export function WorkbenchMessagesProvider({
  locale,
  timeZone,
  rootMessages,
  children,
}: {
  locale: AppLocale;
  timeZone: string;
  rootMessages: MessageCatalog;
  children: ReactNode;
}) {
  // The whole path with its language: the locale-aware `usePathname` reads the provider this component mounts.
  const { pathname } = useCommittedAddress();
  const atRoot = stripLocalePrefix(pathname) === '/';
  // Null on the server and while hydrating, so `/` hydrates with the subset its HTML was built from.
  const loaded = useWorkbenchCatalog(locale);

  // Past the subset this always reads through `use`, loaded or not: a component that suspended in `use` and then
  // finished a retry without calling it makes React log a misuse. The loader hands out a promise that is already
  // settled once the catalog is there, so the read then returns at once.
  const messages: MessageCatalog =
    atRoot && !loaded && !isDesktopShell() ? rootMessages : use(loadWorkbenchCatalog(locale));

  return (
    <IntlProvider
      locale={locale}
      timeZone={timeZone}
      messages={messages}
      onError={messages === rootMessages ? reportRootSubsetGap : undefined}
    >
      {children}
    </IntlProvider>
  );
}

/**
 * A message `/` renders outside its subset is a missing path in `ROOT_ENTRY_MESSAGE_PATHS`. On the
 * server that fails the export of `/` rather than shipping a raw key in its HTML.
 */
function reportRootSubsetGap(error: IntlError) {
  if (typeof window === 'undefined' && error.code === 'MISSING_MESSAGE') {
    throw new Error(`/ renders a message outside ROOT_ENTRY_MESSAGE_PATHS: ${error.message}`);
  }
  console.error(error);
}
