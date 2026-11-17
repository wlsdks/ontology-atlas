'use client';

import { use, type ReactNode } from 'react';
import { NextIntlClientProvider, type IntlError } from 'next-intl';
import { usePathname } from 'next/navigation';
import type { AppLocale } from '@/i18n/locales';
import { loadWorkbenchCatalog, useWorkbenchCatalog, type MessageCatalog } from '@/i18n/workbench-catalog';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import { stripLocalePrefix } from '@/shared/lib/navigation/nav-destination';

/**
 * The workbench's messages. `/` starts from `rootMessages`, the subset the gateway and the hidden
 * shell around it read, and gains the whole catalog once a visitor turns out to have a folder
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
  // `next/navigation`'s: the locale-aware one reads the provider this component mounts.
  const pathname = usePathname() ?? '/';
  const atRoot = stripLocalePrefix(pathname) === '/';
  // Null on the server and while hydrating, so `/` hydrates with the subset its HTML was built from.
  const loaded = useWorkbenchCatalog(locale);

  let messages: MessageCatalog;
  if (loaded) messages = loaded;
  else if (atRoot && !isDesktopShell()) messages = rootMessages;
  else messages = use(loadWorkbenchCatalog(locale));

  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      messages={messages}
      onError={messages === rootMessages ? reportRootSubsetGap : undefined}
    >
      {children}
    </NextIntlClientProvider>
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
