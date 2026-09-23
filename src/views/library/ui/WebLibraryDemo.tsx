'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, BookText, ArrowLeft } from 'lucide-react';

import { buildTopologyDeeplinkForDoc, resolveStaticVaultSource, type VaultDoc } from '@/entities/docs-vault';
import { LibraryGraph } from '@/widgets/library-graph';
import { DocReadingPane } from '@/widgets/doc-reading-pane';
import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';
import { Input } from '@/shared/ui/input';
import { RowButton, Button } from '@/shared/ui';
import type { LibraryIndexSegment } from '@/shared/lib/appearance-preferences';

const examples = [
  { id: 'checkout', source: 'sources/checkout-policy.md', concept: 'capabilities/checkout' },
  { id: 'refund', source: 'sources/refund-policy.md', concept: 'capabilities/refund' },
  { id: 'inventory', source: 'sources/inventory-promise.md', concept: 'capabilities/stock-reservation' },
  { id: 'delivery', source: 'sources/delivery-handoff.md', concept: 'capabilities/carrier-integration' },
] as const;

const storefrontDocs = resolveStaticVaultSource('storefront').manifest.docs;
type ExampleId = (typeof examples)[number]['id'];
type Selection = { kind: 'source' | 'wiki'; id: ExampleId } | null;

export function WebLibraryDemo({ segment }: { segment: LibraryIndexSegment }) {
  const t = useTranslations('webExamples.libraryDemo');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selection>(null);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const readerBackRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Partial<Record<ExampleId, HTMLButtonElement>>>({});
  useEffect(() => {
    if (selected && window.matchMedia('(max-width: 1023px)').matches) readerBackRef.current?.focus();
  }, [selected]);
  const wikiDocs = useMemo<VaultDoc[]>(() => examples.map((item) => ({
    slug: `wiki/${item.id}-review`, path: `wiki/${item.id}-review.md`,
    title: t(`${item.id}.wikiTitle`), description: t(`${item.id}.wikiSummary`),
    tags: [], frontmatter: { sources: [item.source], status: 'example' },
    headings: [], excerpt: t(`${item.id}.wikiSummary`), wordCount: 0,
    updatedAt: '', linksOut: [item.concept],
  })), [t]);
  const graphDocs = useMemo(() => [...storefrontDocs, ...wikiDocs], [wikiDocs]);
  const wikiPages = useMemo(() => wikiDocs.map((doc, index) => ({
    slug: doc.slug, title: doc.title, sourcePaths: [examples[index].source],
  })), [wikiDocs]);
  const graphSources = useMemo(() => examples.map((item) => ({ path: item.source })), []);
  const visible = examples.filter((item) => {
    const title = segment === 'sources' ? t(`${item.id}.sourceTitle`) : t(`${item.id}.wikiTitle`);
    return `${title} ${item.source}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
  });
  const opened = selected ? examples.find((item) => item.id === selected.id) : null;
  const relatedConcept = opened ? storefrontDocs.find((doc) => doc.slug === opened.concept) : null;
  const conceptHref = relatedConcept ? buildTopologyDeeplinkForDoc(relatedConcept) : null;
  const choose = (kind: 'source' | 'wiki', id: ExampleId) => setSelected({ kind, id });
  const returnToGraph = () => {
    const id = selected?.id;
    setSelected(null);
    if (id) requestAnimationFrame(() => rowRefs.current[id]?.focus());
  };

  return <main id="main" tabIndex={-1} data-testid="web-library-demo" className={`topology-ui-scale relative flex min-h-0 w-full flex-1 bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)] max-lg:flex-col ${selected ? '' : 'max-lg:overflow-y-auto'}`}>
    <aside data-testid="library-index" aria-label={t('indexLabel')} className={`flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] max-lg:h-[var(--library-index-min)] max-lg:flex-none lg:w-[var(--docs-list-width)] lg:flex-none ${selected ? 'max-lg:hidden' : ''}`}>
      <div className="flex-none px-3 pb-2 pt-3">
        <p className="text-caption text-[color:var(--color-indigo-text-soft)]">{t('sampleBadge')}</p>
        <div className="mt-2"><Input label={t('searchLabel')} value={query} onChange={(event) => setQuery(event.target.value)} className="w-full" /></div>
      </div>
      <div className="atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto px-1 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]">
        <p className="px-2 py-2 text-caption text-[color:var(--color-text-tertiary)]">{segment === 'sources' ? t('sourceCount', { count: visible.length }) : t('wikiCount', { count: visible.length })}</p>
        {visible.map((item) => {
          const active = selected?.kind === (segment === 'sources' ? 'source' : 'wiki') && selected.id === item.id;
          return <RowButton key={item.id} ref={(node) => { rowRefs.current[item.id] = node ?? undefined; }} active={active} aria-current={active ? 'page' : undefined} onClick={() => choose(segment === 'sources' ? 'source' : 'wiki', item.id)} className="flex items-center gap-2 px-2 text-left" data-testid={`web-library-${segment}-row`}>
            {segment === 'sources' ? <FileText size={16} aria-hidden /> : <BookText size={16} aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{t(`${item.id}.${segment === 'sources' ? 'sourceTitle' : 'wikiTitle'}`)}</span>
            {segment === 'sources' && <span className="text-caption text-[color:var(--color-text-tertiary)]">MD</span>}
          </RowButton>;
        })}
        {visible.length === 0 && <p className="px-3 py-5 text-body text-[color:var(--color-text-tertiary)]">{t('noMatches')}</p>}
      </div>
    </aside>
    <section className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${selected ? '' : 'max-lg:min-h-[480px] max-lg:pb-[var(--topology-mobile-bottom-tab-reserve)]'}`} aria-label={t('readerLabel')}>
      {opened && selected ? <DocReadingPane key={`${selected.kind}:${selected.id}`} scrollRef={readerScrollRef} outline={null} backToTop={null} scrollClassName="atlas-scroll-quiet" data-testid="web-library-reading-pane">
        <div className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 py-8 md:px-10">
          <Button ref={readerBackRef} variant="ghost" onClick={returnToGraph} className="mb-5"><ArrowLeft size={16} aria-hidden />{t('backToGraph')}</Button>
          <p className="text-caption text-[color:var(--color-indigo-text-soft)]">{t('sampleBadge')}</p>
          <h2 className="mt-2 text-display font-[var(--font-weight-signature)]">{t(`${opened.id}.${selected.kind === 'source' ? 'sourceTitle' : 'wikiTitle'}`)}</h2>
          <p className="mt-2 text-caption text-[color:var(--color-text-tertiary)]">{selected.kind === 'source' ? opened.source : `wiki/${opened.id}-review.md`}</p>
          {selected.kind === 'wiki' ? <div className="mt-7 space-y-7">
            <section><h3 className="text-title font-[var(--font-weight-strong)]">{t('summaryHeading')}</h3><p className="mt-2 text-reading leading-prose">{t(`${opened.id}.wikiSummary`)}</p></section>
            <section><h3 className="text-title font-[var(--font-weight-strong)]">{t('factsHeading')}</h3><p className="mt-2 text-reading leading-prose">{t(`${opened.id}.sourceText`)}</p></section>
            <section><h3 className="text-title font-[var(--font-weight-strong)]">{t('openQuestionsHeading')}</h3><p className="mt-2 text-reading leading-prose">{t(`${opened.id}.openQuestion`)}</p></section>
            <section><h3 className="text-title font-[var(--font-weight-strong)]">{t('notInSourcesHeading')}</h3><p className="mt-2 text-reading leading-prose">{t('notInSources')}</p></section>
          </div> : <p className="mt-7 text-reading leading-prose">{t(`${opened.id}.sourceText`)}</p>}
          <div className="mt-8 border-t border-[color:var(--color-border-soft)] pt-4">
            <p className="text-label text-[color:var(--color-text-tertiary)]">{selected.kind === 'source' ? t('linkedWiki') : t('citedSource')}</p>
            <RowButton onClick={() => choose(selected.kind === 'source' ? 'wiki' : 'source', opened.id)} className="mt-2 text-left">{t(`${opened.id}.${selected.kind === 'source' ? 'wikiTitle' : 'sourceTitle'}`)}</RowButton>
          </div>
          {selected.kind === 'wiki' && conceptHref && relatedConcept && <div className="mt-5">
            <p className="text-label text-[color:var(--color-text-tertiary)]">{t('relatedConcept')}</p>
            <Link href={conceptHref} className={controlClass({ shape: 'link', tone: 'accent', className: 'mt-2 inline-flex' })}>{String(relatedConcept.frontmatter[`display_${locale}`] ?? relatedConcept.title)}</Link>
          </div>}
          <p className="mt-6 text-caption text-[color:var(--color-text-tertiary)]">{t('readOnly')}</p>
        </div>
      </DocReadingPane> : <LibraryGraph docs={graphDocs} wikiPages={wikiPages} sources={graphSources} selection={null} onSelect={(next) => {
        const found = examples.find((item) => next.kind === 'source' ? item.source === next.ref : `wiki/${item.id}-review` === next.ref);
        if (found) choose(next.kind, found.id);
      }} />}
    </section>
  </main>;
}
