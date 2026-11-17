import { getMessages, getTimeZone, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { AppShell, MotionProvider } from '@/app-providers/providers';
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
 * The workbench: every route under `app/[locale]` wears the app shell and reads the whole catalog,
 * because the shell's rail, settings and agent dock read most of it. This segment is shared by all
 * of them, `/` included, so it serialises only `/`'s subset; the catalog arrives as a per-locale
 * chunk (`WorkbenchMessagesProvider`). The gateway pages live in `app/(gateway)/[locale]` with a
 * picked subset (`src/i18n/gateway-messages.ts`).
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
    <WorkbenchMessagesProvider locale={locale} timeZone={timeZone} rootMessages={rootMessages}>
      <LocaleDocumentChrome locale={locale} />
      <MotionProvider>
        <TaxonomyProvider>
          {/* `LocalVaultProvider` is the single source of truth. Consumers share one instance through
              `useLocalVault()` — this fixed the eight independent call sites producing two or three
              duplicate instances. */}
          <LocalVaultProvider>
            {/* The notification region's name is supplied by the app so the primitive does not read
               translations itself. */}
            <ToastProvider notificationsLabel={tNav('notificationsAriaLabel')}>
              <TooltipProvider delayDuration={300}>
                {/* Sets the change baseline once when a local vault loads, so agent edits pulse on
                    the topology without a click. Headless. */}
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
  );
}
