'use client';

import { ChevronDown, ChevronRight, FileText, Orbit, Paperclip, Plus, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';

import type { VaultDoc } from '@/entities/docs-vault';
import {
  resolveCollectionMembers,
  type LibraryCollectionItem,
  type ResolvedCollectionMember,
} from '@/entities/library-collection';
import { useSavedConstellations } from '@/features/saved-constellations';
import { useRouter } from '@/i18n/navigation';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { PAGE_FRAME_FORM } from '@/shared/ui/page-frame';
import { Button, EmptyState, RowButton, Surface } from '@/shared/ui';
import { ConstellationsStartingPoint } from './parts/ConstellationsStartingPoint';

type MemberRow =
  | { kind: 'ontology'; resolution: ResolvedCollectionMember }
  | { kind: 'reference'; item: LibraryCollectionItem };

function memberRows(items: readonly LibraryCollectionItem[], documents: readonly VaultDoc[]): MemberRow[] {
  const ontology = new Map(
    resolveCollectionMembers(items, documents).map((resolution) => [resolution.item.id, resolution]),
  );
  return items.map((item) => item.target.kind === 'ontology'
    ? { kind: 'ontology', resolution: ontology.get(item.id) ?? { status: 'unresolved', reason: 'missing', item } }
    : { kind: 'reference', item });
}

const KIND_ORDER = ['domain', 'capability', 'element'];
/** Enough rows to show every kind the map nests, few enough that the list stays a preview. */
const STARTING_ROWS = 6;

/**
 * The micro badge (9.5px) is for decoration; these carry a count or a kind a person reads, so
 * they stand on the label step the Chip primitive uses.
 */
const quietTag = badgeClass({
  shape: 'tag',
  className: 'border border-[color:var(--color-border-soft)] py-0.5 text-[color:var(--color-text-tertiary)]',
});

function documentKind(document: { frontmatter: Record<string, unknown> }): string {
  const value = document.frontmatter.kind;
  return typeof value === 'string' && value.trim() ? value.trim() : 'ontology';
}

export function LibraryConstellations({
  handle,
  documents,
}: {
  handle: FileSystemDirectoryHandle | null;
  documents: readonly VaultDoc[];
}) {
  const t = useTranslations('library.collections');
  const tCreateNode = useTranslations('topology.createNode');
  const locale = useLocale();
  const router = useRouter();
  const saved = useSavedConstellations(handle);
  // `null` means "use the calm first-row-open default". Once the person toggles a row,
  // their explicit expansion set wins even if it is empty.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string> | null>(null);
  const defaultExpandedId = saved.status === 'ready' ? saved.constellations[0]?.folder.id ?? null : null;

  const rowsByFolder = useMemo(
    () => new Map(saved.constellations.map(({ folder, items }) => [folder.id, memberRows(items, documents)])),
    [documents, saved.constellations],
  );
  const availableConcepts = useMemo(() => documents.filter(doc => ['domain', 'capability', 'element'].includes(documentKind(doc))), [documents]);
  // Domains first, then capabilities, then elements: the order the map nests them in.
  const startingConcepts = useMemo(() => [...availableConcepts]
    .sort((a, b) => KIND_ORDER.indexOf(documentKind(a)) - KIND_ORDER.indexOf(documentKind(b)))
    .slice(0, STARTING_ROWS)
    .map(doc => ({ id: doc.slug, name: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      kind: documentKind(doc),
      kindLabel: documentKind(doc) === 'domain' ? tCreateNode('kindDomain') : documentKind(doc) === 'capability' ? tCreateNode('kindCapability') : tCreateNode('kindElement') })),
  [availableConcepts, locale, tCreateNode]);
  const hiddenStarting = availableConcepts.length - startingConcepts.length;

  const createInGalaxy = () => router.push('/topology/?constellation=new');
  const openInGalaxy = (id: string) => router.push(`/topology/?constellation=${encodeURIComponent(id)}`);
  const openDocument = (slug: string) => {
    router.push(`/library/?tab=ontology&slug=${encodeURIComponent(slug)}`);
  };
  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current ?? (defaultExpandedId ? [defaultExpandedId] : []));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const kindLabel = (kind: string) => {
    if (kind === 'project') return tCreateNode('kindProject');
    if (kind === 'domain') return tCreateNode('kindDomain');
    if (kind === 'capability') return tCreateNode('kindCapability');
    if (kind === 'element') return tCreateNode('kindElement');
    return kind;
  };

  const pageHeader = (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 text-display leading-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-prose text-body-lg leading-title text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
          {t('description')}
        </p>
      </div>
      {saved.status === 'ready' && saved.constellations.length > 0 ? (
        <Button data-testid="library-collections-create" onClick={createInGalaxy} className="atlas-touch-floor atlas-touch-floor-wide shrink-0">
          <Plus size={ICON_SIZE.sm} aria-hidden />
          {t('create')}
        </Button>
      ) : null}
    </header>
  );

  let content: ReactNode;
  if (saved.status === 'loading') {
    content = (
      <EmptyState
        title={t('loadingTitle')}
        description={t('loadingDescription')}
        skeleton
        tone="solid"
      />
    );
  } else if (saved.status === 'unavailable') {
    content = (
      <EmptyState
        title={t('unavailableTitle')}
        description={t('unavailableDescription')}
        icon={<Orbit />}
        action={<Button className="atlas-touch-floor atlas-touch-floor-wide" onClick={createInGalaxy}>{t('openGalaxy')}</Button>}
        tone="solid"
      />
    );
  } else if (saved.status === 'corrupt' || saved.status === 'unsupported' || saved.status === 'error') {
    content = (
      <EmptyState
        title={t('errorTitle')}
        description={t('errorDescription')}
        icon={<TriangleAlert />}
        action={<Button variant="outline" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => void saved.reload()}>{t('retry')}</Button>}
        tone="solid"
        className="border-[color:var(--color-amber-source-a35)]"
      />
    );
  } else if (saved.constellations.length === 0) {
    content = <ConstellationsStartingPoint title={t('emptyTitle')} description={t('emptyDescription')}
      sourceLabel={t('startingSource')} sourceCount={availableConcepts.length} concepts={startingConcepts} noConcepts={t('startingNoConcepts')}
      more={hiddenStarting > 0 ? { label: t('startingMore', { count: hiddenStarting }), onOpen: () => router.push('/topology/') } : null}
      action={<Button className="atlas-touch-floor atlas-touch-floor-wide" onClick={createInGalaxy}><Plus size={ICON_SIZE.sm} aria-hidden />{t('create')}</Button>} />;
  } else {
    content = (
      <ul
        data-testid="library-constellations-list"
        className="overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]"
      >
        {saved.constellations.map(({ folder, items }) => {
          const expanded = expandedIds ? expandedIds.has(folder.id) : folder.id === defaultExpandedId;
          const rows = rowsByFolder.get(folder.id) ?? [];
          const ontologyCount = items.filter((item) => item.target.kind === 'ontology').length;
          const referenceCount = items.length - ontologyCount;
          const memberRegionId = `library-constellation-members-${folder.id}`;
          return (
            <li key={folder.id} className="border-b border-[color:var(--color-divider)] last:border-b-0">
              <article>
                <div className="flex items-stretch gap-2 p-2 sm:p-3">
                  <RowButton
                    data-testid={`library-constellation-${folder.id}`}
                    onClick={() => toggle(folder.id)}
                    aria-expanded={expanded}
                    aria-controls={memberRegionId}
                    hoverInk="strong"
                    hoverSurface="lift"
                    className="min-w-0 flex-1 text-left"
                  >
                    {expanded
                      ? <ChevronDown size={ICON_SIZE.sm} className="flex-none" aria-hidden />
                      : <ChevronRight size={ICON_SIZE.sm} className="flex-none" aria-hidden />}
                    <span className="min-w-0 flex-1 py-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-body-lg leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                          {folder.name}
                        </span>
                        <span className={quietTag}>
                          {t('memberCount', { count: ontologyCount })}
                        </span>
                        {referenceCount > 0 ? (
                          <span className={quietTag}>
                            {t('referenceCount', { count: referenceCount })}
                          </span>
                        ) : null}
                      </span>
                      {/* A scope saved without a purpose shows its title alone: a sentence saying
                          nothing was written read, in a scan down the list, like one more purpose. */}
                      {folder.purpose ? (
                        <span className="mt-1 block truncate text-body leading-body text-[color:var(--color-text-tertiary)]">
                          {folder.purpose}
                        </span>
                      ) : null}
                    </span>
                  </RowButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openInGalaxy(folder.id)}
                    aria-label={t('viewInGalaxyNamed', { name: folder.name })}
                    className="atlas-touch-floor atlas-touch-floor-wide shrink-0 self-center"
                  >
                    <Orbit size={ICON_SIZE.sm} aria-hidden />
                    <span className="hidden sm:inline">{t('viewInGalaxy')}</span>
                  </Button>
                </div>
                <Surface
                  open={expanded}
                  as="section"
                  id={memberRegionId}
                  role="region"
                  aria-label={referenceCount > 0
                    ? t('membersWithReferencesNamed', { name: folder.name })
                    : t('membersNamed', { name: folder.name })}
                  className="border-t border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-2 sm:px-3 sm:py-3"
                >
                  {rows.length === 0 ? (
                    <p className="py-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
                      {t('noMembers')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-[color:var(--color-divider)]" data-row-surface-contract="flat-divider-rail">
                      {rows.map((row) => {
                        if (row.kind === 'reference') {
                          const referenceKind = row.item.target.kind;
                          return (
                            <li
                              key={row.item.id}
                              data-testid={`library-constellation-reference-${row.item.id}`}
                              className="flex min-h-11 items-center gap-2 px-2 py-2.5"
                              data-row-surface-contract="flat-divider-row"
                            >
                              <Paperclip size={ICON_SIZE.sm} className="flex-none text-[color:var(--color-text-quaternary)]" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-body leading-body text-[color:var(--color-text-secondary)]">
                                {row.item.label}
                              </span>
                              <span className={quietTag}>
                                {referenceKind === 'source' ? t('kind.sourceReference') : t('kind.wikiReference')}
                              </span>
                            </li>
                          );
                        }

                        const { resolution } = row;
                        if (resolution.status === 'unresolved') {
                          return (
                            <li
                              key={resolution.item.id}
                              data-testid={`library-constellation-unresolved-${resolution.item.id}`}
                              className="flex min-h-11 items-center gap-2 px-2 py-2.5"
                              data-row-surface-contract="flat-divider-row"
                            >
                              <TriangleAlert size={ICON_SIZE.sm} className="flex-none text-[color:var(--color-amber-source-a90)]" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-body leading-body text-[color:var(--color-text-secondary)]">
                                  {resolution.item.label}
                                </span>
                                <span className="mt-0.5 block truncate text-label leading-label text-[color:var(--color-text-quaternary)]">
                                  {resolution.item.target.kind === 'ontology' ? resolution.item.target.lastKnownPath : ''}
                                </span>
                              </span>
                              <span className={badgeClass({
                                shape: 'tag',
                                className: 'border border-[color:var(--color-amber-source-a35)] py-0.5 bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
                              })}>
                                {resolution.reason === 'ambiguous' ? t('ambiguous') : t('missing')}
                              </span>
                            </li>
                          );
                        }

                        const name = resolveLocaleDisplayName(
                          resolution.document.frontmatter,
                          locale,
                          resolution.document.title,
                        );
                        return (
                          <li key={resolution.item.id} data-row-surface-contract="flat-divider-row">
                            <RowButton
                              data-testid={`library-constellation-member-${resolution.item.id}`}
                              onClick={() => openDocument(resolution.document.slug)}
                              aria-label={t('openDocumentNamed', { name })}
                              hoverInk="strong"
                              hoverSurface="lift"
                              className="w-full text-left"
                            >
                              <FileText size={ICON_SIZE.sm} className="flex-none text-[color:var(--color-text-quaternary)]" aria-hidden />
                              {/* The members are the content of the scope: primary ink, not the purpose's grey. */}
                              <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">{name}</span>
                              <span className={badgeClass({
                                shape: 'tag',
                                className: 'border border-[color:var(--color-indigo-line-a20)] py-0.5 bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]',
                              })}>
                                {kindLabel(documentKind(resolution.document))}
                              </span>
                            </RowButton>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Surface>
              </article>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <main id="main" tabIndex={-1} data-testid="library-collections" className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--color-canvas)]">
      <div className={`${PAGE_FRAME_FORM} flex flex-col gap-6 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]`}>
        {pageHeader}
        <div data-error-detail={saved.error ?? undefined}>{content}</div>
      </div>
    </main>
  );
}
