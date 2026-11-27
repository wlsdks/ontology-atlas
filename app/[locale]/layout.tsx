import { getMessages, getTimeZone, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { AppShell, MotionProvider } from '@/app-providers/providers';
import { AppAddressFaces } from '@/app-providers/providers/AppAddressFaces';
import { WorkbenchMessagesProvider } from '@/app-providers/providers/WorkbenchMessagesProvider';
import {
  enterLocaleSegment,
  LocaleDocumentChrome,
  localeLayoutMetadata,
  localeStaticParams,
} from '@/app-providers/providers/locale-segment';
import { pickMessagePaths } from '@/i18n/gateway-messages';
import { ROOT_ENTRY_MESSAGE_PATHS } from '@/app-providers/providers/root-entry-messages';
import { TaxonomyProvider } from '@/features/taxonomy';
import { LocalVaultProvider } from '@/entities/vault-session';
import { OntologyLiveBaselineInit } from '@/features/vault-ontology';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';
import { AcpChatPanelKeeper } from '@/widgets/acp-chat-panel';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
import { RouteMemory } from '@/shared/ui/routing/route-memory';
import { AppOnlyPage } from '@/views/app-only';

export function generateStaticParams() {
  return localeStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return localeLayoutMetadata((await params).locale);
}

/**
 * This segment is shared by every app address, `/` included, so it serialises only `/`'s message
 * subset; the whole catalog arrives as a per-locale chunk (`WorkbenchMessagesProvider`).
 *
 * Every address carries two faces, the app's screen and `AppOnlyPage`; `AppAddressFaces` keeps the
 * screen from ever mounting in a plain browser, so nothing below it runs there.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = enterLocaleSegment((await params).locale);
  const rootMessages = pickMessagePaths(await getMessages(), ROOT_ENTRY_MESSAGE_PATHS);
  const timeZone = await getTimeZone();
  const tNav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <AppAddressFaces locale={locale} appOnly={<AppOnlyPage locale={locale} />}>
      <WorkbenchMessagesProvider locale={locale} timeZone={timeZone} rootMessages={rootMessages}>
        <LocaleDocumentChrome locale={locale} />
        <MotionProvider>
          <TaxonomyProvider>
            <LocalVaultProvider>
              <ToastProvider notificationsLabel={tNav('notificationsAriaLabel')}>
                <TooltipProvider delayDuration={300}>
                  <OntologyLiveBaselineInit />
                  <RouteMemory />
                  <AcpChatPanelKeeper />
                  <AppShell>{children}</AppShell>
                  <BottomTabBar />
                </TooltipProvider>
              </ToastProvider>
            </LocalVaultProvider>
          </TaxonomyProvider>
        </MotionProvider>
      </WorkbenchMessagesProvider>
    </AppAddressFaces>
  );
}
