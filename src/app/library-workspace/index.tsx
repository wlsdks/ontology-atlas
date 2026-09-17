'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { LibraryConstellations, LibraryPage, LibraryRounds, useLibraryRounds } from '@/views/library';
import { useLocalVault } from '@/entities/vault-session';
import { selectWikiPages } from '@/entities/docs-vault';
import { useRouter } from '@/i18n/navigation';
import { useLibraryIndexSegment, writeLibraryIndexSegment } from '@/shared/lib/appearance-preferences';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { RouteLoadingFallback, TabBar } from '@/shared/ui';

// The editor is loaded only when its tab is opened. Composition belongs to the
// app layer so neither view imports the other or duplicates its state machine.
const OntologyPage = dynamic(
  () => import('@/views/docs-vault').then((module) => module.DocsVaultPage),
  { loading: () => <RouteLoadingFallback /> },
);

type LibraryTab = 'sources' | 'wiki' | 'ontology' | 'collections' | 'rounds';

export function LibraryWorkspace() {
  const t = useTranslations('library');
  const params = useSearchParams();
  const router = useRouter();
  const vault = useLocalVault();
  const wikiCount = useMemo(() => selectWikiPages(vault.manifest?.docs ?? []).length, [vault.manifest?.docs]);
  const preferredSegment = useLibraryIndexSegment();
  const requested = params.get('tab');
  const rounds = useLibraryRounds();
  const roundsOn = rounds ? rounds.rounds.filter((round) => round.enabled).length : 0;
  const tab: LibraryTab = requested === 'ontology' || requested === 'collections' || requested === 'rounds'
    ? requested
    : requested === 'sources' || requested === 'wiki' ? requested : preferredSegment;
  const handle = selectOpenVaultHandle(vault.status, vault.handle);

  const selectTab = useCallback((next: LibraryTab) => {
    if (next === tab) return;
    if (next === 'sources' || next === 'wiki') writeLibraryIndexSegment(next);
    // Carry the selected document and its source/review context across a tab
    // round trip. The Docs URL writer preserves this tab parameter as well.
    const query = new URLSearchParams(params.toString());
    query.set('tab', next);
    router.push(`/library/?${query}${window.location.hash}`, { scroll: false });
  }, [params, router, tab]);

  return (
    <div data-testid="library-workspace" className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="topology-ui-scale flex h-14 shrink-0 items-stretch gap-5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 md:px-4">
        {/*
          The name of the place stands on the tab labels' line. Each tab is a bottom-aligned
          box of `--control-h-lg` with its label centred, so the name and the rule take the
          same box and the same centring rather than a hand-tuned bottom pad: pinned with
          `items-end pb-2`, "Library" sat 7px under the tab labels and read as a stray word
          stuck to the floor (owner, 2026-09-17).
        */}
        <p className="hidden shrink-0 self-end -mb-px min-h-[var(--control-h-lg)] items-center text-body leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] sm:inline-flex">{t('title')}</p>
        <span aria-hidden className="hidden self-end -mb-px min-h-[var(--control-h-lg)] items-center sm:flex">
          <span className="h-4 border-l border-[color:var(--color-border-soft)]" />
        </span>
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
            {
              key: 'collections',
              label: t('workspace.collections'),
              testId: 'library-workspace-collections',
            },
            {
              key: 'rounds',
              label: t('workspace.rounds'),
              count: rounds && rounds.storeStatus !== 'no-vault' && roundsOn > 0 ? roundsOn : undefined,
              countTitle: t('workspace.roundsCount'),
              testId: 'library-workspace-rounds',
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
        {tab === 'ontology' ? (
          <OntologyPage initialCollection="ontology" documentScope="ontology" />
        ) : tab === 'collections' ? (
          <LibraryConstellations handle={handle} documents={vault.manifest?.docs ?? []} />
        ) : tab === 'rounds' ? (
          <LibraryRounds />
        ) : (
          <LibraryPage segment={tab} onSegmentChange={selectTab} />
        )}
      </div>
    </div>
  );
}
