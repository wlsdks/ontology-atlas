import { getTranslations } from 'next-intl/server';
import { GatewayEntryView } from './gateway-entry-view';

/**
 * The server-rendered fallback for `/`: under static export it is the whole page for anything
 * without JS (link previews, crawlers), so it must say what the gateway says. It reuses the
 * gateway's own sentences; new positioning copy is a one-way change under `AGENTS.md`.
 * `MapEntryFallback` stays where the map description is true. Both
 * links are real destinations, so the gateway works with no JS.
 */
export async function GatewayEntryFallback({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'download' });

  return (
    <GatewayEntryView
      locale={locale}
      copy={{
        eyebrow: t('eyebrow'),
        heroTitleLine1: t('heroTitleLine1'),
        heroTitleLine2: t('heroTitleLine2'),
        heroLead: t('heroLead'),
        downloadSectionLabel: t('downloadSectionLabel'),
        webCta: t('webCta'),
      }}
    />
  );
}
