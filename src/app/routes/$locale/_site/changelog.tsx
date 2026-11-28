import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { CHANGELOG_CONTENT_LOCALES, GatewayDocPage } from '@/views/gateway-doc/browser';

import { loadScreenMetadata } from '../../-site/load-screen-metadata';
import { MetadataTags } from '../../-site/metadata-tags';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'page',
  path: 'changelog',
  title: { namespace: 'metadata', key: 'pages.changelog' },
  description: { namespace: 'metadata', key: 'descriptions.changelog' },
  contentLocales: CHANGELOG_CONTENT_LOCALES,
};

/** The whole CHANGELOG would be the heaviest screen; 12 sections is two to three weeks, so tune it in weeks. */
const RECENT_SECTIONS = 12;

export const Route = createFileRoute('/$locale/_site/changelog')({
  staticData: { head },
  loader: async ({ context, params }) => ({
    resolved: loadScreenMetadata(head, params.locale, context.siteMessages),
    document: await context.buildFacts.changelog(),
  }),
  component: ChangelogRoute,
});

function ChangelogRoute() {
  const t = useTranslations('gatewayNav');
  const { resolved, document } = Route.useLoaderData();
  return (
    <>
      <MetadataTags resolved={resolved} />
      <GatewayDocPage
        document={document}
        title={t('changelogTitle')}
        lead={t('changelogLead')}
        recentSectionLimit={RECENT_SECTIONS}
        entryNav
        sourcePath="docs/CHANGELOG.md"
      />
    </>
  );
}
