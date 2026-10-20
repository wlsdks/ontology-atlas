'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOntologyInsight, useVaultHealthDocs } from '@/features/vault-ontology';
import { useDataSourceMode, useVaultSessionIdentityScope, VaultSourceHydrationBoundary } from '@/entities/vault-session';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { PageHeaderBar, TabBar } from '@/shared/ui';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { useDocumentTitle } from '@/shared/lib/public-pages/use-document-title';
import { cn } from '@/shared/lib/cn';
import { PAGE_FRAME } from '@/shared/ui/tokens/page-frame';
import { type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import { useRouter } from '@/i18n/navigation';
import { parseInsightsTab, buildInsightsTabHref, harnessOverviewHref, INSIGHTS_SECTIONS, type InsightsTab } from '../lib/insights-tab-state';
import { AnalysisWorkspace } from './analysis/AnalysisWorkspace';
import { AnalysisRecords } from './analysis/AnalysisRecords';

const EMPTY_NODES: KnowledgeGraphNode[] = [];
const EMPTY_EDGES: KnowledgeGraphEdge[] = [];
const RECORDS = new Set<InsightsTab>(['brief', 'library']);
/** One question-led workspace; old ontology URLs enter the same relationship/evidence journey. */
export function OntologyInsightsPage() {
  const t = useTranslations('ontologyPages.insights');
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTabState] = useState<InsightsTab>(() => parseInsightsTab(search.get('tab')));
  const [flowRetired, setFlowRetired] = useState(() => search.get('tab') === 'flow');
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
    setFlowRetired(false);
    window.history.pushState(null, '', buildInsightsTabHref(next, window.location.pathname));
  }
  useEffect(() => {
    const sync = () => {
      const raw = new URL(window.location.href).searchParams.get('tab');
      if (raw === 'harness') router.replace(harnessOverviewHref(window.location.search));
      setTabState(parseInsightsTab(raw));
      setFlowRetired(raw === 'flow');
    };
    if (search.get('tab') === 'harness') router.replace(harnessOverviewHref(window.location.search));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [router, search]);
  const review = search.get('review');
  const initialClaim = review?.startsWith('analysis:') ? review.slice(9) : undefined;
  const initialEdge = review?.startsWith('relation:') ? review.slice(9) : undefined;
  const [agentReady, setAgentReady] = useState(false);
  const [inspectRequest, setInspectRequest] = useState<{ text: string; scope: string; nonce: number } | null>(null);
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  const record = RECORDS.has(tab);
  const evidence = tab === 'do-next' || tab === 'unmatched';
  return <VaultSourceHydrationBoundary><div className="relative flex min-h-0 min-w-0 flex-1 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+1px)] lg:pb-0">
    <main id="main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" data-insights-surface="relationship-analysis" data-insights-question-model="claim-evidence">
      <PageHeaderBar
        frame="page"
        title={t('analysis.title')}
        actions={<div className="lg:hidden"><AppSettingsMenu mode={mode} triggerVariant="chrome-tile" /></div>}
        tabs={<nav aria-label={t('coreAriaLabel')}>
          <TabBar
            variant="segmented"
            ariaLabel={t('coreAriaLabel')}
            activeKey={record ? tab : 'connections'}
            onSelect={value => setTab(value as InsightsTab)}
            testId="insights-core-switch"
            items={INSIGHTS_SECTIONS.map(key => ({ key, label: t(`analysis.${({ connections: 'system', brief: 'records', library: 'wiki' } as const)[key]}`), testId: `insights-core-${key === 'connections' ? 'ontology' : key}` }))}
          />
        </nav>}
      />
      <div className={cn(PAGE_FRAME, 'relative min-w-0 flex-1 pt-8 md:pt-10 pb-[var(--page-bottom-breath)] scroll-pb-[var(--page-bottom-breath)]')}>
      <section id={`insights-tabpanel-${record ? tab : 'connections'}`} role="tabpanel" aria-labelledby={`insights-tab-${record ? tab : 'connections'}`} data-insights-panel={record ? tab : 'analysis'}>
      {error ? <p role="alert" className="text-body text-[color:var(--color-status-danger)]">{error.message}</p> : null}
      {!insight ? <p role="status" className="text-body">{t('loading')}</p> : nodes.length === 0 ? <div className="flex flex-col gap-4"><p className="text-body">{t('analysis.empty')}</p><OpenVaultCta testId="analysis-open-vault" /></div> : <>
        <AnalysisRecords dockHost={dockHost} inspectRequest={inspectRequest} onAgentReady={setAgentReady} active={record} tab={tab} onTab={setTab} nodes={nodes} edges={edges} />
        <div hidden={record}>
          {flowRetired ? <p data-testid="analysis-flow-retired" className="mb-3 text-label text-[color:var(--color-text-tertiary)]">{t('analysis.flowRetired', { history: agentReady ? 'available' : 'other' })}</p>
            : search.get('tab') && !['connections', 'do-next'].includes(search.get('tab')!) ? <p className="mb-3 text-label text-[color:var(--color-text-tertiary)]">{t('analysis.legacy')}</p> : null}
          <AnalysisWorkspace agentReady={agentReady} onInspect={text => setInspectRequest(previous => ({ text, scope: identity, nonce: (previous?.nonce ?? 0) + 1 }))} active={!record} key={`${identity}:${evidence}`} nodes={nodes} edges={edges} docs={docs} mode={mode} initialQuestion={evidence ? 'evidence' : 'relationships'} initialClaim={initialClaim} initialEdge={initialEdge} />
        </div>
      </>}
      </section>
      </div>
    </main>
  <div ref={setDockHost} className="contents" /></div></VaultSourceHydrationBoundary>;
}
