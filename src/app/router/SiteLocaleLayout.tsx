import { Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { IntlProvider, useTranslations } from 'use-intl';

import { GatewayShell } from '@/app-providers/providers/GatewayShell';
import { MotionProvider } from '@/app-providers/providers/MotionProvider';
import { OldBrowserFolderCleanup } from '@/app-providers/providers/OldBrowserFolderCleanup';
import type { AppLocale } from '@/i18n/locales';
import { ToastProvider, TooltipProvider } from '@/shared/ui';

import { BootPictureRemover } from './BootPictureRemover';
import { LocaleDocumentChrome } from './LocaleDocumentChrome';

function LocalizedToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return <ToastProvider notificationsLabel={t('notificationsAriaLabel')}>{children}</ToastProvider>;
}

/**
 * The website's pages: no vault provider and no tab bar, since the website opens no folder. Each page
 * reads only the message paths it needs (`SITE_MESSAGE_PATHS`), which the prerender writes into the page,
 * and formats dates in UTC so the prerendered text and the browser's first render agree.
 */
export function SiteLocaleLayout({ locale, messages }: { locale: AppLocale; messages: Record<string, unknown> }) {
  return (
    <IntlProvider locale={locale} messages={messages} timeZone="UTC">
      <BootPictureRemover />
      <LocaleDocumentChrome locale={locale} />
      <OldBrowserFolderCleanup />
      <MotionProvider>
        <LocalizedToastProvider>
          <TooltipProvider delayDuration={300}>
            <GatewayShell>
              <Outlet />
            </GatewayShell>
          </TooltipProvider>
        </LocalizedToastProvider>
      </MotionProvider>
    </IntlProvider>
  );
}
