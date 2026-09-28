'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react';

import { LibraryConstellations, LibraryPage, LibraryRounds, useLibraryRounds } from '@/views/library';
import type { DocsVaultPage } from '@/views/docs-vault';
import { useLocalVault } from '@/entities/vault-session';
import { selectWikiPages } from '@/entities/docs-vault';
import { useRouter } from '@/i18n/navigation';
import { useLibraryIndexSegment, writeLibraryIndexSegment } from '@/shared/lib/appearance-preferences';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { RouteLoadingFallback, TabBar } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';

import { fadeIn, prefersReducedMotion, tabSwitchFade, whenIdle, whenLoaded, type LibraryTab } from './panel-arrival';
import styles from './library-workspace.module.css';

type OntologyPageComponent = ComponentType<ComponentProps<typeof DocsVaultPage>>;

let loadedOntologyPage: OntologyPageComponent | null = null;

function rememberOntologyPage(module: { DocsVaultPage: typeof DocsVaultPage }): OntologyPageComponent {
  loadedOntologyPage = module.DocsVaultPage;
  return module.DocsVaultPage;
}

const LazyOntologyPage = dynamic(
  () => import('@/views/docs-vault').then(rememberOntologyPage),
  { loading: () => <RouteLoadingFallback /> },
);

function OntologyDocuments() {
  const [Page] = useState<OntologyPageComponent>(() => loadedOntologyPage ?? LazyOntologyPage);
  return <Page initialCollection="ontology" documentScope="ontology" />;
}

type OntologyView = 'documents' | 'sets';

function carriedQuery(params: URLSearchParams): URLSearchParams {
  const query = new URLSearchParams(params.toString());
  const openSlug = new URLSearchParams(window.location.search).get('slug');
  if (openSlug) query.set('slug', openSlug);
  return query;
}

export function LibraryWorkspace() {
  const t = useTranslations('library');
  const format = useFormatter();
  const params = useSearchParams();
  const router = useRouter();
  const vault = useLocalVault();
  const wikiCount = useMemo(() => selectWikiPages(vault.manifest?.docs ?? []).length, [vault.manifest?.docs]);
  const preferredSegment = useLibraryIndexSegment();
  const requested = params.get('tab');
  const rounds = useLibraryRounds();
  const roundsOn = rounds ? rounds.rounds.filter((round) => round.kind !== 'ontology' && round.enabled).length : 0;
  const tab: LibraryTab = requested === 'collections' ? 'ontology' : requested === 'ontology' || requested === 'rounds'
    ? requested
    : requested === 'sources' || requested === 'wiki' ? requested : preferredSegment;
  const ontologyView: OntologyView = requested === 'collections' || params.get('ontologyView') === 'sets' ? 'sets' : 'documents';
  useEffect(() => {
    if (requested !== 'collections') return;
    const query = new URLSearchParams(params.toString());
    query.set('tab', 'ontology');
    query.set('ontologyView', 'sets');
    router.replace(`/library/?${query}${window.location.hash}`, { scroll: false });
  }, [params, requested, router]);
  useEffect(() => whenIdle(() => void import('@/views/docs-vault').then(rememberOntologyPage)), []);
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const ontologyRef = useRef<HTMLDivElement | null>(null);
  const previousTab = useRef(tab);
  useLayoutEffect(() => {
    const from = previousTab.current;
    previousTab.current = tab;
    const panel = panelRef.current;
    const token = panel ? tabSwitchFade(from, tab, prefersReducedMotion()) : null;
    if (panel && token) fadeIn(panel, token);
  }, [tab]);
  useLayoutEffect(() => {
    const host = ontologyRef.current;
    return host ? whenLoaded(host, () => fadeIn(host, '--motion-fast')) : undefined;
  }, [tab, ontologyView]);

  const selectTab = useCallback((next: LibraryTab) => {
    if (next === tab) return;
    if (next === 'sources' || next === 'wiki') writeLibraryIndexSegment(next);
    const query = carriedQuery(params);
    query.set('tab', next);
    router.push(`/library/?${query}${window.location.hash}`, { scroll: false });
  }, [params, router, tab]);
  const selectOntologyView = (next: OntologyView) => {
    const query = carriedQuery(params);
    query.set('tab', 'ontology');
    query.set('ontologyView', next);
    router.push(`/library/?${query}${window.location.hash}`, { scroll: false });
  };

  return (
    <div data-testid="library-workspace" className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="topology-ui-scale flex h-14 shrink-0 items-stretch border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-0">
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
              count: vault.manifest ? format.number(vault.manifest.sources?.length ?? 0) : undefined,
              countTitle: t('workspace.sourcesCount'),
              testId: 'library-workspace-sources',
            },
            {
              key: 'wiki',
              label: t('workspace.wiki'),
              count: vault.manifest ? format.number(wikiCount) : undefined,
              countTitle: t('workspace.wikiCount'),
              testId: 'library-workspace-wiki',
            },
            {
              key: 'ontology',
              label: t('workspace.ontology'),
              testId: 'library-workspace-ontology',
            },
            {
              key: 'rounds',
              label: t('workspace.rounds'),
              count: rounds && rounds.storeStatus !== 'no-vault' && roundsOn > 0 ? format.number(roundsOn) : undefined,
              countTitle: t('workspace.roundsCount'),
              testId: 'library-workspace-rounds',
            },
          ]}
        />
        <div ref={setToolsHost} data-testid="library-strip-tools" className="ml-auto flex min-h-[var(--control-h-lg)] shrink-0 items-center gap-1 self-end pr-3" />
      </header>
      <div
        key={tab === 'sources' || tab === 'wiki' ? 'library' : tab}
        id={'library-workspace-tabpanel-' + tab}
        role="tabpanel"
        aria-labelledby={'library-workspace-tab-' + tab}
        ref={panelRef}
        data-testid="library-workspace-panel"
        className={`flex min-h-0 flex-1 ${styles.panel}`}
      >
        {tab === 'ontology' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center border-b border-[color:var(--color-divider)] px-4 py-2">
              <SegmentedControl<OntologyView> value={ontologyView} onChange={selectOntologyView}
                ariaLabel={t('workspace.ontologyViews')} size="md" testId="library-ontology-views"
                options={[
                  { value: 'documents', label: t('workspace.conceptDocuments'), testId: 'library-ontology-documents' },
                  { value: 'sets', label: t('workspace.conceptSets'), testId: 'library-ontology-sets' },
                ]} />
            </div>
            <div key={ontologyView} className={`flex min-h-0 flex-1 ${styles.panel}`}>
              {ontologyView === 'sets'
                ? <LibraryConstellations handle={handle} documents={vault.manifest?.docs ?? []} />
                : (
                  <div ref={ontologyRef} data-testid="library-ontology-documents-view" className="flex min-h-0 min-w-0 flex-1">
                    <OntologyDocuments />
                  </div>
                )}
            </div>
          </div>
        ) : tab === 'rounds' ? (
          <LibraryRounds />
        ) : (
          <LibraryPage segment={tab} onSegmentChange={selectTab} toolsHost={toolsHost} />
        )}
      </div>
    </div>
  );
}
