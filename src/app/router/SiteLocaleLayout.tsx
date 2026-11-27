import { Outlet } from '@tanstack/react-router';
import { use, type ReactNode } from 'react';
import { IntlProvider, useTranslations } from 'use-intl';

import { GatewayShell } from '@/app-providers/providers/GatewayShell';
import { MotionProvider } from '@/app-providers/providers/MotionProvider';
import { OldBrowserFolderCleanup } from '@/app-providers/providers/OldBrowserFolderCleanup';
import { loadWorkbenchCatalog } from '@/i18n/workbench-catalog';
import type { AppLocale } from '@/i18n/locales';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
import { RouteMemory } from '@/shared/ui/routing/route-memory';

import { BootPictureRemover } from './BootPictureRemover';
import { LocaleDocumentChrome } from './LocaleDocumentChrome';

function LocalizedToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return <ToastProvider notificationsLabel={t('notificationsAriaLabel')}>{children}</ToastProvider>;
}

/**
 * The website's pages: no vault provider and no tab bar, since the website opens no folder. They read
 * the whole catalog here; the prerendered build gives each page only the paths it reads.
 */
export function SiteLocaleLayout({ locale }: { locale: AppLocale }) {
  const messages = use(loadWorkbenchCatalog(locale));
  return (
    <IntlProvider locale={locale} messages={messages} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}>
      <BootPictureRemover />
      <LocaleDocumentChrome locale={locale} />
      <OldBrowserFolderCleanup />
      <MotionProvider>
        <LocalizedToastProvider>
          <TooltipProvider delayDuration={300}>
            <RouteMemory />
            <GatewayShell>
              <Outlet />
            </GatewayShell>
          </TooltipProvider>
        </LocalizedToastProvider>
      </MotionProvider>
    </IntlProvider>
  );
}
