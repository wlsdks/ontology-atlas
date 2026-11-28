import { Outlet } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { IntlProvider, useTranslations } from 'use-intl';

import { MotionProvider } from '@/app-providers/providers/MotionProvider';
import { AppAddressFaces } from '@/app-providers/providers/AppAddressFaces';
import { AppShell } from '@/app-providers/providers/AppShell';
import { WorkbenchMessagesProvider } from '@/app-providers/providers/WorkbenchMessagesProvider';
import { LocalVaultProvider } from '@/entities/vault-session';
import { TaxonomyProvider } from '@/features/taxonomy';
import { OntologyLiveBaselineInit } from '@/features/vault-ontology';
import { loadWorkbenchCatalog, useWorkbenchCatalog } from '@/i18n/workbench-catalog';
import type { AppLocale } from '@/i18n/locales';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
import { RouteMemory } from '@/shared/ui/routing/route-memory';
import { AppOnlyPage } from '@/views/app-only';
import { AcpChatPanelKeeper } from '@/widgets/acp-chat-panel';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';

import { BootPictureRemover } from './BootPictureRemover';
import { LocaleDocumentChrome } from './LocaleDocumentChrome';

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * What a plain browser shows at an app address, in the route's language. It stands outside the
 * workbench's messages, so it reads the catalog's `appOnly` namespace on its own and stays empty until
 * the catalog arrives; the installed app never renders it.
 */
function AppOnlyFace({ locale }: { locale: AppLocale }) {
  const catalog = useWorkbenchCatalog(locale);
  useEffect(() => void loadWorkbenchCatalog(locale), [locale]);
  if (!catalog) return null;
  return (
    <IntlProvider locale={locale} messages={{ appOnly: catalog.appOnly }}>
      <BootPictureRemover />
      <AppOnlyPage locale={locale} />
    </IntlProvider>
  );
}

function LocalizedToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return <ToastProvider notificationsLabel={t('notificationsAriaLabel')}>{children}</ToastProvider>;
}

/**
 * Every app address: the workbench's providers around the screen, and beside it the page a plain
 * browser reads instead (`AppAddressFaces`).
 */
export function AppLocaleLayout({ locale }: { locale: AppLocale }) {
  return (
    <AppAddressFaces appOnly={<AppOnlyFace locale={locale} />}>
      <WorkbenchMessagesProvider locale={locale} timeZone={browserTimeZone()}>
        <BootPictureRemover />
        <LocaleDocumentChrome locale={locale} />
        <MotionProvider>
          <TaxonomyProvider>
            <LocalVaultProvider>
              <LocalizedToastProvider>
                <TooltipProvider delayDuration={300}>
                  <OntologyLiveBaselineInit />
                  <RouteMemory />
                  <AcpChatPanelKeeper />
                  <AppShell>
                    <Outlet />
                  </AppShell>
                  <BottomTabBar />
                </TooltipProvider>
              </LocalizedToastProvider>
            </LocalVaultProvider>
          </TaxonomyProvider>
        </MotionProvider>
      </WorkbenchMessagesProvider>
    </AppAddressFaces>
  );
}
