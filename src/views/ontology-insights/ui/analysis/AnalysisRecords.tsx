'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { useVaultUnmatchedAsks } from '@/features/vault-ontology';
import { useRouter } from '@/i18n/navigation';
import { useLocalVault, useDataSourceMode, useStaticVaultSource, useVaultSessionIdentityScope } from '@/entities/vault-session';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { resolveNodeAgentTarget, resolveNodeDocument, type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import { buildBusinessFlowRequest } from '@/features/vault-agent';
import { analysisGraphFromInsight, presentationRelationKeysForGraphEdge, type AnalysisCaptureContext } from '@/features/acp-session';
import { useVaultAgentRuntime } from '@/widgets/acp-chat-panel';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { useToast } from '@/shared/ui';
import type { AnalysisBasis, AnalysisRecord } from '@/entities/analysis-record';
import { useInsightsBrief } from '../../lib/brief/use-insights-brief';
import { buildAnalysisModel } from '../../lib/analysis-model';
import { planInsightsAgentPrompt, buildInsightsAgentPrompt, type InsightsAgentPrefill } from '../../lib/insights-agent';
import { createFlowArchiveLoader, selectFlowVersions } from '../../lib/flow-history';
import { scopedFlowRequest } from '../../lib/selected-analysis-request';
import type { InsightsTab } from '../../lib/insights-tab-state';
import { BriefTab } from '../tabs/BriefTab';
import { LibraryTab } from '../tabs/LibraryTab';
import { HarnessTab } from '../tabs/HarnessTab';
import { FlowTab, type FlowTabLabels } from '../tabs/FlowTab';
import { InsightsAgentDock } from '../parts/InsightsAgentDock';
import { SampleFlowEmptyState } from './SampleFlowEmptyState';

const EMPTY_DOCS: VaultDoc[] = [];

/** Supporting records share one ACP session. Changing the question never sends or replaces a draft. */
export function AnalysisRecords({ dockHost, inspectRequest, onAgentReady, active, tab, onTab, nodes, edges }: {
  dockHost: HTMLElement | null; inspectRequest: { text: string; scope: string; nonce: number } | null; onAgentReady: (ready: boolean) => void; active: boolean; tab: InsightsTab; onTab: (tab: InsightsTab) => void; nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[];
}) {
  const t = useTranslations('ontologyPages.insights');
  const locale = useLocale();
  const vault = useLocalVault(); const mode = useDataSourceMode(); const staticSource = useStaticVaultSource();
  const router = useRouter(); const toast = useToast();
  const docs = mode === 'static' ? staticSource.manifest.docs : vault.manifest?.docs ?? EMPTY_DOCS;
  const model = useMemo(() => buildAnalysisModel(nodes, edges, docs), [nodes, edges, docs]);
  const briefNodes = useMemo(() => nodes.map(node => ({ ...node, docSlug: resolveNodeDocument(node).ownSlug })), [nodes]);
  const unmatched = useVaultUnmatchedAsks();
  const brief = useInsightsBrief({ nodes: briefNodes, repairCount: model.gaps.length, unmatchedCount: unmatched.asks.length, enabled: active && tab !== 'flow' });
  const root = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  const agent = useVaultAgentRuntime(root, { connectors: false });
  const identity = useVaultSessionIdentityScope();
  const canInspect = mode === 'local' && vault.status === 'loaded' && root !== null && agent.route === 'agent';
  useEffect(() => { onAgentReady(canInspect); }, [canInspect, onAgentReady]);
  const handledRequest = useRef<object | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const [prefill, setPrefill] = useState<InsightsAgentPrefill | null>(null);
  const slugs = useMemo(() => new Map(nodes.map(node => [node.id, resolveNodeAgentTarget(node).ref ?? node.id])), [nodes]);
  const knownSlugs = useMemo(() => new Set(slugs.values()), [slugs]);
  const knownRelations = useMemo(() => new Set(edges.flatMap(edge => presentationRelationKeysForGraphEdge({ from: slugs.get(edge.from) ?? edge.from, to: slugs.get(edge.to) ?? edge.to, type: edge.type, toKind: model.byId.get(edge.to)?.kind ?? null }))), [edges, slugs, model.byId]);
  const context = useMemo<AnalysisCaptureContext>(() => {
    const projects = nodes.filter(node => node.kind === 'project');
    const projectSlug = projects.length === 1 ? resolveNodeAgentTarget(projects[0]).ref : null;
    const project = vault.manifest?.docs.find(doc => doc.slug === projectSlug);
    return { mode: 'meaning', surface: 'analysis', handle: mode === 'local' ? vault.handle : null, writable: mode === 'local' && vault.status === 'loaded', fileHandles: vault.fileHandles,
      scope: { projectSlug, projectUid: typeof project?.frontmatter.uid === 'string' ? project.frontmatter.uid : null, targetSlugs: [], profileSlug: null },
      graph: analysisGraphFromInsight({ nodes, edges }), sourceFingerprint: null, profileHash: null };
  }, [nodes, edges, vault.manifest, vault.handle, vault.status, vault.fileHandles, mode]);
  function ask(text: string, kind: InsightsTab = 'brief') {
    if (!canInspect) return;
    const plan = planInsightsAgentPrompt({ current: prefill, draftPresent: draft, kind, text: kind === 'flow' ? buildInsightsAgentPrompt({ locale, kind, handoff: '', flowRequest: text }) : text });
    setOpen(true);
    if (plan.action === 'seat') setPrefill(plan.request);
    if (plan.action === 'confirm-replace') toast.show(t('agentDraftHeld'), 'info', { label: t('agentReplaceDraft'), onClick: () => setPrefill(plan.request) });
  }
  const inspectSelected = useEffectEvent(() => {
    if (!inspectRequest || handledRequest.current === inspectRequest || inspectRequest.scope !== identity || !canInspect) return;
    handledRequest.current = inspectRequest;
    ask(inspectRequest.text, 'connections');
  });
  useEffect(() => { inspectSelected(); }, [inspectRequest]);
  const [archive, setArchive] = useState<{ handle: FileSystemDirectoryHandle | null; records: readonly AnalysisRecord[]; basis: AnalysisBasis | null }>({ handle: null, records: [], basis: null });
  const flowHandle = active && tab === 'flow' ? context.handle : null;
  useEffect(() => {
    if (!flowHandle) return;
    const loader = createFlowArchiveLoader(context, state => setArchive({ handle: flowHandle, ...state }));
    const load = () => { void loader.load(); }; load(); window.addEventListener('atlas-analysis-records-changed', load);
    return () => { loader.stop(); window.removeEventListener('atlas-analysis-records-changed', load); };
  }, [flowHandle, context]);
  const versions = useMemo(() => archive.handle && archive.handle === flowHandle ? selectFlowVersions(archive.records, context, archive.basis) : [], [archive, flowHandle, context]);
  const request = useMemo(() => scopedFlowRequest({ request: buildBusinessFlowRequest({ request: t('flow.request') }), vaultRoot: root, vaultName: vault.handle?.name ?? '', documents: docs }), [t, root, vault.handle?.name, docs]);
  const project = model.projects.length === 1 ? model.projects[0] : null;
  const scopeName = project ? project.display ?? project.title : mode === 'local' && vault.handle ? vault.handle.name : t('analysis.scopeAll');
  const flowLabels: FlowTabLabels = {
                  title: t("flow.title"),
                  lead: t("flow.lead"),
                  action: t("flow.action"),
                  actionHint: t("flow.actionHint"),
                  checking: t("flow.checking"),
                  requestLabel: t("flow.requestLabel"),
                  unavailableTitle: t("flow.unavailableTitle"),
                  unavailableBody: t("flow.unavailableBody"),
                  copy: t("flow.copy"),
                  copied: t("flow.copied"),
                  noVaultTitle: t("flow.noVaultTitle"),
                  noVaultBody: t("flow.noVaultBody"),
                  writtenAt: (values) => t("flow.writtenAt", values),
                  standingCurrent: t("flow.standingCurrent"),
                  standingStale: t("flow.standingStale"),
                  standingUnknown: t("flow.standingUnknown"),
                  ungrounded: t("flow.ungrounded"),
                  changedTitle: t("flow.changedTitle"),
                  changeAdded: t("flow.changeAdded"),
                  changeRemoved: t("flow.changeRemoved"),
                  changeRewritten: t("flow.changeRewritten"),
                  noVersionTitle: t("flow.noVersionTitle"),
                  noVersionBody: t("flow.noVersionBody"),
                  rewrite: t("flow.rewrite"),
                  versionsLabel: (count) => t("flow.versionsLabel", { count }),
  };
  return <>
    {active ? <section className={tab === 'harness' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : tab === 'flow' && mode === 'static' ? 'flex flex-1 flex-col' : undefined}>
      <p data-testid="analysis-records-scope" className="mb-4 shrink-0 text-label text-[color:var(--color-text-secondary)]"><span className="font-[var(--font-weight-strong)]">{scopeName}</span>{' · '}{t(mode === 'static' ? 'analysis.example' : 'analysis.recorded')}{!project ? ` · ${t('analysis.scopeCount', { count: model.projects.length })}` : ''}</p>
      {tab === 'brief' ? <BriefTab brief={brief} onOpenTab={onTab} onAskAgent={canInspect ? text => ask(text) : undefined} /> : null}
      {tab === 'library' ? <LibraryTab detail={brief.library} nowMs={brief.nowMs} /> : null}
      {tab === 'harness' ? <HarnessTab detail={brief.harnessDetail} /> : null}
      {tab === 'flow' ? mode === 'static' ? <SampleFlowEmptyState onExplore={() => onTab('connections')} /> : <FlowTab labels={flowLabels} request={request} versions={versions} hasGraph={nodes.length > 0} hasOwnFolder={vault.status === 'loaded'} canLaunchAgent={canInspect} agentChecking={agent.route === 'checking'} onPrefill={text => ask(text, 'flow')} /> : null}
    </section> : null}
    {agent.runtime && root && dockHost ? createPortal(<InsightsAgentDock open={open} runtime={agent.runtime} runtimes={agent.runtimes} onRuntimeChange={agent.setRuntimeId} vaultRoot={root} mcpServers={agent.mcpServers} prefillRequest={prefill} contextLabel={prefill ? t('agentContext', { tab: t(`tab.${prefill.kind}`) }) : ''} knownSlugs={knownSlugs} knownRelations={knownRelations} analysisContext={context} onDraftPresenceChange={setDraft} onPresentationOpenMap={slug => { const id = [...slugs].find(([, value]) => value === slug)?.[0]; if (id) router.push(`/topology/?p=${encodeURIComponent(id)}`); }} onEvidence={slug => router.push(buildDocsVaultHref({ slug }))} onClose={() => setOpen(false)} />, dockHost) : null}
  </>;
}
