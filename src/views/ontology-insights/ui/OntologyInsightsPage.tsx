'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOntologyInsight, useVaultHealthDocs } from '@/features/vault-ontology';
import { useDataSourceMode, useVaultSessionIdentityScope, VaultSourceHydrationBoundary } from '@/entities/vault-session';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { Button, TabBar } from '@/shared/ui';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { useDocumentTitle } from '@/shared/lib/use-document-title';
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW, PAGE_TITLE } from '@/shared/ui/page-frame';
import { type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import { parseInsightsTab, buildInsightsTabHref, INSIGHTS_SECTIONS, type InsightsTab } from '../lib/insights-tab-state';
import { AnalysisWorkspace } from './analysis/AnalysisWorkspace';
import { AnalysisRecords } from './analysis/AnalysisRecords';

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const RECORDS = new Set<InsightsTab>(['brief', 'library', 'harness', 'flow']);
/** One question-led workspace; old ontology URLs enter the same relationship/evidence journey. */
export function OntologyInsightsPage() {
  const t = useTranslations('ontologyPages.insights');
  const search = useSearchParams();
  const [tab, setTabState] = useState<InsightsTab>(() => parseInsightsTab(search.get('tab')));
  const mode = useDataSourceMode();
  const identity = useVaultSessionIdentityScope();
  const { insight, error } = useOntologyInsight();
  const nodes = insight?.nodes ?? EMPTY_NODES, edges = insight?.edges ?? EMPTY_EDGES;
  const docs = useVaultHealthDocs();
  const settings = useMemo(() => <AppSettingsMenu mode={mode} triggerVariant="rail-tile" />, [mode]);
  useNavRailSettingsSlot(settings);
  useDocumentTitle(t('analysis.documentTitle'));
  function setTab(next: InsightsTab) {
    setTabState(next);
    window.history.pushState(null, '', buildInsightsTabHref(next, window.location.pathname));
  }
  useEffect(() => {
    const sync = () => setTabState(parseInsightsTab(new URL(window.location.href).searchParams.get('tab')));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const review = search.get('review');
  const initialClaim = review?.startsWith('analysis:') ? review.slice(9) : undefined;
  const initialEdge = review?.startsWith('relation:') ? review.slice(9) : undefined;
  const [agentReady, setAgentReady] = useState(false);
  const [inspectRequest, setInspectRequest] = useState<{ text: string; scope: string; nonce: number } | null>(null);
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  const record = RECORDS.has(tab);
  const evidence = tab === 'do-next' || tab === 'unmatched';
  return <VaultSourceHydrationBoundary><div className="relative flex min-h-0 min-w-0 flex-1 pb-[var(--topology-mobile-bottom-tab-reserve)] lg:pb-0">
    <main id="main" tabIndex={-1} className={`${PAGE_FRAME} min-h-0 min-w-0 flex-1 pb-[var(--page-bottom-breath)] scroll-pb-[var(--page-bottom-breath)] ${tab === 'harness' ? 'overflow-y-auto lg:flex lg:h-full lg:flex-col lg:overflow-hidden' : 'overflow-y-auto'}`} data-insights-surface="relationship-analysis" data-insights-question-model="claim-evidence">
      <header className={`${PAGE_HEADER_ROW} mb-5`}><div className={PAGE_TITLE_ROW}><h1 className={PAGE_TITLE}>{t('analysis.title')}</h1></div><nav className="min-w-0 flex-1" aria-label={t('coreAriaLabel')}><TabBar ariaLabel={t('coreAriaLabel')} activeKey={record ? tab : 'connections'} onSelect={value => setTab(value as InsightsTab)} testId="insights-core-switch" items={INSIGHTS_SECTIONS.map(key => ({ key, label: t(`analysis.${({ connections: 'system', brief: 'records', library: 'wiki', harness: 'guidance', flow: 'explanations' } as const)[key]}`), testId: `insights-core-${key === 'connections' ? 'ontology' : key}` }))} /></nav><div className="lg:hidden"><AppSettingsMenu mode={mode} triggerVariant="chrome-tile" /></div></header>
      <section id={`insights-tabpanel-${record ? tab : 'connections'}`} role="tabpanel" aria-labelledby={`insights-tab-${record ? tab : 'connections'}`} data-insights-panel={record ? tab : 'analysis'} className={tab === 'harness' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : undefined}>
      {error ? <p role="alert" className="text-body text-[color:var(--color-status-danger)]">{error.message}</p> : null}
      {!insight ? <p role="status" className="text-body">{t('loading')}</p> : nodes.length === 0 ? <div className="flex flex-col gap-4"><p className="text-body">{t('analysis.empty')}</p><OpenVaultCta testId="analysis-open-vault" /></div> : <>
        <AnalysisRecords dockHost={dockHost} inspectRequest={inspectRequest} onAgentReady={setAgentReady} active={record} tab={tab} onTab={setTab} nodes={nodes} edges={edges} />
        <div hidden={record}>
          {search.get('tab') && !['connections', 'do-next'].includes(search.get('tab')!) ? <p className="mb-3 text-label text-[color:var(--color-text-tertiary)]">{t('analysis.legacy')}</p> : null}
          <AnalysisWorkspace agentReady={agentReady} onInspect={text => setInspectRequest(previous => ({ text, scope: identity, nonce: (previous?.nonce ?? 0) + 1 }))} active={!record} key={`${identity}:${evidence}`} nodes={nodes} edges={edges} docs={docs} mode={mode} initialQuestion={evidence ? 'evidence' : 'relationships'} initialClaim={initialClaim} initialEdge={initialEdge} />
        </div>{record ? <Button data-testid="analysis-back-to-system" variant="ghost" size="sm" className="atlas-touch-floor mt-6" onClick={() => setTab('connections')}>{t('analysis.system')}</Button> : null}
      </>}
      </section>
    </main>
  <div ref={setDockHost} className="contents" /></div></VaultSourceHydrationBoundary>;
}
