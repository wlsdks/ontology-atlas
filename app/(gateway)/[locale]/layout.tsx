import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { GatewayShell } from '@/app-providers/providers/GatewayShell';
import { MotionProvider } from '@/app-providers/providers/MotionProvider';
import {
  enterLocaleSegment,
  LocaleDocumentChrome,
  localeLayoutMetadata,
  localeStaticParams,
} from '@/app-providers/providers/locale-segment';
import { GATEWAY_MESSAGE_PATHS, pickMessagePaths } from '@/i18n/gateway-messages';
import { LocalVaultProvider } from '@/entities/vault-session';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';
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
 * A sibling of `app/[locale]` rather than a child, so the workbench's providers and whole catalog
 * stay out of these pages' HTML; the URLs are the same, since a route group adds no segment. The
 * client receives only the message paths its tree reads (`src/i18n/gateway-messages.ts`).
 *
 * The vault provider stays because the mobile tab bar on `/guide` and `/changelog` lists the
 * destinations the open folder has. Crossing to a workbench route mounts that layout's own
 * providers, which restore the remembered folder as a first load does.
 */
export default async function GatewayLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = enterLocaleSegment((await params).locale);
  const messages = pickMessagePaths(await getMessages(), GATEWAY_MESSAGE_PATHS);
  const tNav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleDocumentChrome locale={locale} />
      <MotionProvider>
        <LocalVaultProvider>
          <ToastProvider notificationsLabel={tNav('notificationsAriaLabel')}>
            <TooltipProvider delayDuration={300}>
              <RouteMemory />
              <GatewayShell>{children}</GatewayShell>
              <BottomTabBar />
            </TooltipProvider>
          </ToastProvider>
        </LocalVaultProvider>
      </MotionProvider>
    </NextIntlClientProvider>
  );
}
