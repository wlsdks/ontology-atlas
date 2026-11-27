import { createFileRoute } from '@tanstack/react-router';

import type { AppLocale } from '@/i18n/locales';

import { GuideChapterView } from '../../../-site/GuideChapterView';
import { loadGuideChapter } from '../../../-site/guide-chapter';

/** `/guide/` draws the first chapter in place: a redirect would change the address that was shared. */
export const Route = createFileRoute('/$locale/_site/guide/')({
  loader: ({ context, params }) =>
    loadGuideChapter({ locale: params.locale as AppLocale, segment: undefined, messages: context.siteMessages, buildFacts: context.buildFacts }),
  component: GuideEntryRoute,
});

function GuideEntryRoute() {
  return <GuideChapterView chapter={Route.useLoaderData()} />;
}
