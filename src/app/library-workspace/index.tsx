'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { LibraryPage } from '@/views/library';
import { useLocalVault } from '@/entities/vault-session';
import { selectWikiPages } from '@/entities/docs-vault';
import { useRouter } from '@/i18n/navigation';
import { useLibraryIndexSegment, writeLibraryIndexSegment } from '@/shared/lib/appearance-preferences';
import { RouteLoadingFallback, TabBar } from '@/shared/ui';

// The editor is loaded only when its tab is opened. Composition belongs to the
// app layer so neither view imports the other or duplicates its state machine.
const OntologyPage = dynamic(
  () => import('@/views/docs-vault').then((module) => module.DocsVaultPage),
  { loading: () => <RouteLoadingFallback /> },
);

type LibraryTab = 'sources' | 'wiki' | 'ontology';

export function LibraryWorkspace({ legacyOntology = false }: { legacyOntology?: boolean }) {
  const t = useTranslations('library');
  const params = useSearchParams();
  const router = useRouter();
  const vault = useLocalVault();
  const wikiCount = useMemo(() => selectWikiPages(vault.manifest?.docs ?? []).length, [vault.manifest?.docs]);
  const preferredSegment = useLibraryIndexSegment();
  const requested = params.get('tab');
  const tab: LibraryTab = legacyOntology || requested === 'ontology'
    ? 'ontology'
    : requested === 'sources' || requested === 'wiki' ? requested : preferredSegment;

  const selectTab = useCallback((next: LibraryTab) => {
    if (next === tab) return;
    if (next !== 'ontology') writeLibraryIndexSegment(next);
    // Carry the selected document and its source/review context across a tab
    // round trip. The Docs URL writer preserves this tab parameter as well.
    const query = new URLSearchParams(params.toString());
    query.set('tab', next);
    router.push(`/library/?${query}${window.location.hash}`, { scroll: false });
  }, [params, router, tab]);

  return (
    <div data-testid="library-workspace" className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="topology-ui-scale flex h-14 shrink-0 items-stretch gap-5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 md:px-4">
        <h1 className="hidden shrink-0 items-end pb-2 text-body leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] sm:inline-flex">{t('title')}</h1>
        <span aria-hidden className="mb-2.5 hidden h-4 self-end border-l border-[color:var(--color-border-soft)] sm:block" />
        <TabBar
          ariaLabel={t('workspace.aria')}
          activeKey={tab}
          onSelect={(next) => selectTab(next as LibraryTab)}
          idPrefix="library-workspace"
          testId="library-workspace-tabs"
          placement="header"
          items={[
            {
              key: 'sources',
              label: t('workspace.sources'),
              count: vault.manifest ? vault.manifest.sources?.length ?? 0 : undefined,
              countTitle: t('workspace.sourcesCount'),
              testId: 'library-workspace-sources',
            },
            {
              key: 'wiki',
              label: t('workspace.wiki'),
              count: vault.manifest ? wikiCount : undefined,
              countTitle: t('workspace.wikiCount'),
              testId: 'library-workspace-wiki',
            },
            {
              key: 'ontology',
              label: t('workspace.ontology'),
              testId: 'library-workspace-ontology',
            },
          ]}
        />
      </header>
      <div
        id={'library-workspace-tabpanel-' + tab}
        role="tabpanel"
        aria-labelledby={'library-workspace-tab-' + tab}
        className="flex min-h-0 flex-1"
      >
        {tab === 'ontology'
          ? <OntologyPage initialCollection="ontology" />
          : <LibraryPage segment={tab} onSegmentChange={selectTab} />}
      </div>
    </div>
  );
}
