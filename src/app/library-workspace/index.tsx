'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { LibraryConstellations, LibraryPage, LibraryRounds, useLibraryRounds } from '@/views/library';
import { useLocalVault } from '@/entities/vault-session';
import { selectWikiPages } from '@/entities/docs-vault';
import { useRouter } from '@/i18n/navigation';
import { useLibraryIndexSegment, writeLibraryIndexSegment } from '@/shared/lib/appearance-preferences';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { RouteLoadingFallback, TabBar } from '@/shared/ui';

import styles from './library-workspace.module.css';

// The editor is loaded only when its tab is opened. Composition belongs to the
// app layer so neither view imports the other or duplicates its state machine.
const OntologyPage = dynamic(
  () => import('@/views/docs-vault').then((module) => module.DocsVaultPage),
  { loading: () => <RouteLoadingFallback /> },
);

type LibraryTab = 'sources' | 'wiki' | 'ontology' | 'collections' | 'rounds';

export function LibraryWorkspace() {
  const t = useTranslations('library');
  // Counts past a thousand read as the messages write them (`{count, number}`): grouped.
  const format = useFormatter();
  const params = useSearchParams();
  const router = useRouter();
  const vault = useLocalVault();
  const wikiCount = useMemo(() => selectWikiPages(vault.manifest?.docs ?? []).length, [vault.manifest?.docs]);
  const preferredSegment = useLibraryIndexSegment();
  const requested = params.get('tab');
  const rounds = useLibraryRounds();
  const roundsOn = rounds ? rounds.rounds.filter((round) => round.kind !== 'ontology' && round.enabled).length : 0;
  const tab: LibraryTab = requested === 'ontology' || requested === 'collections' || requested === 'rounds'
    ? requested
    : requested === 'sources' || requested === 'wiki' ? requested : preferredSegment;
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  /**
   * The strip's right end is empty past its last tab; the Library's info glyph and the
   * column fold stand there, portalled by `LibraryPage` so their state stays where it is.
   * Measured 2026-09-17 (design pass): with them in the column's head, that head was 105px
   * for a 28px field.
   */
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousTab = useRef(tab);
  /*
   * **Sources and Wiki cross-fade too** (2026-09-25, round two). They share one view, so the
   * key below keeps the panel mounted between them and its CSS enter never replays: the one
   * tab pair that switched with a hard cut. Remounting would drop the view's selection and
   * scroll, so the same arrival is played on the mounted panel instead. Opacity only, which
   * is also the reduced-motion form of the other tabs' enter, and no transform, so no fixed
   * popover inside the panel changes its containing block. Before paint, so the new list
   * never shows a full-opacity first frame.
   */
  useLayoutEffect(() => {
    const from = previousTab.current;
    previousTab.current = tab;
    const panel = panelRef.current;
    const segmentSwitch = from !== tab && (from === 'sources' || from === 'wiki') && (tab === 'sources' || tab === 'wiki');
    if (!segmentSwitch || !panel || typeof panel.animate !== 'function') return;
    const style = getComputedStyle(panel);
    // The browser hands the token back normalised (`.18s`, not `180ms`), so read the unit.
    const raw = style.getPropertyValue('--motion-base').trim();
    const duration = (Number.parseFloat(raw) || 0) * (raw.endsWith('ms') ? 1 : 1000);
    if (duration <= 0) return;
    const easing = style.getPropertyValue('--motion-ease').trim() || undefined;
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
  }, [tab]);

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
      <header className="topology-ui-scale flex h-14 shrink-0 items-stretch border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-0">
        {/*
          No name in the strip. Every other tabbed destination carries a display title
          above its tabs (MCP, Insights); this workbench has none, and a body-size word
          beside a hairline read as a sixth tab with a different font (owner, 2026-09-17,
          twice). The rail already names the place. The tabs start on the index column's
          own text line so the strip and the column share one start.
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
              key: 'collections',
              label: t('workspace.collections'),
              testId: 'library-workspace-collections',
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
          The column's two controls (the glyph, the fold) sit here, on the tabs' own row:
          the tabs stand on the strip's bottom edge at `--control-h-lg`, so this box takes
          the same seat and height rather than the strip's centre — measured 2026-09-18,
          centring on the strip put the glyphs 8.5px above the tab text.
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
          <OntologyPage initialCollection="ontology" documentScope="ontology" />
        ) : tab === 'collections' ? (
          <LibraryConstellations handle={handle} documents={vault.manifest?.docs ?? []} />
        ) : tab === 'rounds' ? (
          <LibraryRounds />
        ) : (
          <LibraryPage segment={tab} onSegmentChange={selectTab} toolsHost={toolsHost} />
        )}
      </div>
    </div>
  );
}
