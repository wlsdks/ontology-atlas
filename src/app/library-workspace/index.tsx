'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { LibraryConstellations, LibraryPage, LibraryRounds, useLibraryRounds } from '@/views/library';
import { useLocalVault } from '@/entities/vault-session';
import { selectWikiPages } from '@/entities/docs-vault';
import { useRouter } from '@/i18n/navigation';
import { useLibraryIndexSegment, writeLibraryIndexSegment } from '@/shared/lib/appearance-preferences';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { RouteLoadingFallback, TabBar } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';

import styles from './library-workspace.module.css';

// The app layer composes both views so neither imports the other.
const OntologyPage = dynamic(
  () => import('@/views/docs-vault').then((module) => module.DocsVaultPage),
  { loading: () => <RouteLoadingFallback /> },
);

type LibraryTab = 'sources' | 'wiki' | 'ontology' | 'rounds';
type OntologyView = 'documents' | 'sets';

function carriedQuery(params: URLSearchParams): URLSearchParams {
  const query = new URLSearchParams(params.toString());
  const openSlug = new URLSearchParams(window.location.search).get('slug');
  if (openSlug) query.set('slug', openSlug);
  return query;
}

export function LibraryWorkspace() {
  const t = useTranslations('library');
  // Counts are grouped the way the messages' `{count, number}` writes them.
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
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  /** The strip's empty right end, where `LibraryPage` portals the info glyph and column fold. */
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousTab = useRef(tab);
  /*
   * Sources and Wiki share one keyed view, so their CSS enter never replays; the same fade is
   * played on the mounted panel instead, before paint, keeping the view's selection and scroll.
   * Opacity only, so no fixed popover inside changes its containing block.
   *
   * The global reduced-motion rule cuts CSS animations, so under reduced motion every switch
   * plays the fade here, without travel, on the short step.
   */
  useLayoutEffect(() => {
    const from = previousTab.current;
    previousTab.current = tab;
    const panel = panelRef.current;
    if (from === tab || !panel || typeof panel.animate !== 'function') return;
    const segmentSwitch = (from === 'sources' || from === 'wiki') && (tab === 'sources' || tab === 'wiki');
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!segmentSwitch && !reduced) return;
    const style = getComputedStyle(panel);
    // The browser hands the token back normalised (`.18s`, not `180ms`), so read the unit.
    const raw = style.getPropertyValue(reduced ? '--motion-fast' : '--motion-base').trim();
    const duration = (Number.parseFloat(raw) || 0) * (raw.endsWith('ms') ? 1 : 1000);
    if (duration <= 0) return;
    const easing = style.getPropertyValue('--motion-ease').trim() || undefined;
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
  }, [tab]);

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
        {/*
          No title in the strip: the rail names the place.
          The tabs start on the index column's text line.
        */}
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
        {/*
          The column's glyph and fold sit on the tabs' row: the tabs stand on the strip's bottom
          edge at `--control-h-lg`, so this box takes that seat rather than the strip's centre.
        */}
        <div ref={setToolsHost} data-testid="library-strip-tools" className="ml-auto flex min-h-[var(--control-h-lg)] shrink-0 items-center gap-1 self-end pr-3" />
      </header>
      {/*
        Keyed by the view, so a tab switch remounts the panel and plays its short enter.
        Sources and Wiki share one view (`LibraryPage` with a segment), so they share one key:
        switching between them keeps that view's state and does not replay the enter.
      */}
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
                : <OntologyPage initialCollection="ontology" documentScope="ontology" />}
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
