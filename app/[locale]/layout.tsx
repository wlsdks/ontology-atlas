import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { AppShell, MotionProvider } from '@/app-providers/providers';
import {
  enterLocaleSegment,
  LocaleDocumentChrome,
  localeLayoutMetadata,
  localeStaticParams,
} from '@/app-providers/providers/locale-segment';
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
 * The workbench: every route under `app/[locale]` wears the app shell and receives the whole
 * catalog, because the shell's rail, settings and agent dock read most of it. The gateway pages
 * live in `app/(gateway)/[locale]` with a picked subset (`src/i18n/gateway-messages.ts`).
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = enterLocaleSegment((await params).locale);
  const messages = await getMessages();
  const tNav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
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
    </NextIntlClientProvider>
  );
}
