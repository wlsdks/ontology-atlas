import { createFileRoute } from '@tanstack/react-router';

import type { AppLocale } from '@/i18n/locales';
import { GUIDE_PAGES } from '@/views/gateway-doc';

import { GuideChapterView } from '../../../-site/GuideChapterView';
import { loadGuideChapter } from '../../../-site/guide-chapter';

/** An unknown chapter draws the first one and says so; static hosting cannot answer a real 404 per chapter. */
export const Route = createFileRoute('/$locale/_site/guide/$segment')({
  staticData: { prerenderParams: () => GUIDE_PAGES.map((page) => ({ segment: page.segment })) },
  loader: ({ context, params }) =>
    loadGuideChapter({ locale: params.locale as AppLocale, segment: params.segment, messages: context.siteMessages, buildFacts: context.buildFacts }),
  component: GuideSegmentRoute,
});

function GuideSegmentRoute() {
  return <GuideChapterView chapter={Route.useLoaderData()} />;
}
