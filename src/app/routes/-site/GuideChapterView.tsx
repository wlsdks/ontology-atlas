import { JsonLd } from '@/shared/ui';
import { GatewayDocPage } from '@/views/gateway-doc';

import { MetadataTags } from './metadata-tags';
import type { loadGuideChapter } from './guide-chapter';

/** One guide chapter: its head, its structured data and the page. `/guide/` and `/guide/<chapter>/` share it. */
export function GuideChapterView({ chapter }: { chapter: Awaited<ReturnType<typeof loadGuideChapter>> }) {
  return (
    <>
      <MetadataTags resolved={chapter.resolved} />
      {chapter.matched ? <JsonLd data={chapter.structuredData.article} /> : null}
      {chapter.matched ? <JsonLd data={chapter.structuredData.breadcrumb} /> : null}
      <GatewayDocPage
        document={chapter.document}
        title={chapter.title}
        {...(chapter.lead ? { lead: chapter.lead } : {})}
        {...(chapter.notice ? { notice: chapter.notice } : {})}
        sourcePath={chapter.document.sourcePath}
        sidebar
        activeSegment={chapter.page.segment}
        {...(chapter.updated ? { updated: chapter.updated } : {})}
      />
    </>
  );
}
