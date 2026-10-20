'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useVaultUnmatchedAsks } from '@/features/vault-ontology';
import { useRouter } from '@/i18n/navigation';
import { useLocalVault, useDataSourceMode, useStaticVaultSource, useVaultSessionIdentityScope } from '@/entities/vault-session';
import { analysisScopeKey } from '@/entities/analysis-record';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { resolveNodeAgentTarget, resolveNodeDocument, type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import { analysisGraphFromInsight, presentationRelationKeysForGraphEdge, type AnalysisCaptureContext } from '@/features/acp-session';
import { useVaultAgentRuntime } from '@/widgets/acp-chat-panel';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { useToast } from '@/shared/ui';
import { useInsightsBrief } from '../../lib/brief/use-insights-brief';
import { buildAnalysisModel } from '../../lib/analysis-model';
import { planInsightsAgentPrompt, type InsightsAgentPrefill } from '../../lib/insights-agent';
import type { InsightsTab } from '../../lib/insights-tab-state';
import { countSavedExplanations } from '../../lib/count-saved-explanations';
import { BriefTab } from '../tabs/BriefTab';
import { RetiredFlowNotice } from './RetiredFlowNotice';
import { LibraryTab } from '../tabs/LibraryTab';
import { InsightsAgentDock } from '../parts/InsightsAgentDock';

const EMPTY_DOCS: VaultDoc[] = [];

/** Supporting records share one ACP session. Changing the question never sends or replaces a draft. */
export function AnalysisRecords({ dockHost, inspectRequest, onAgentReady, active, tab, onTab, nodes, edges, flowRetired }: {
  flowRetired: boolean; dockHost: HTMLElement | null; inspectRequest: { text: string; scope: string; nonce: number } | null; onAgentReady: (ready: boolean) => void; active: boolean; tab: InsightsTab; onTab: (tab: InsightsTab) => void; nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[];
}) {
  const t = useTranslations('ontologyPages.insights');
  const vault = useLocalVault(); const mode = useDataSourceMode(); const staticSource = useStaticVaultSource();
  const router = useRouter(); const toast = useToast();
  const docs = mode === 'static' ? staticSource.manifest.docs : vault.manifest?.docs ?? EMPTY_DOCS;
  const model = useMemo(() => buildAnalysisModel(nodes, edges, docs), [nodes, edges, docs]);
  const briefNodes = useMemo(() => nodes.map(node => ({ ...node, docSlug: resolveNodeDocument(node).ownSlug })), [nodes]);
  const unmatched = useVaultUnmatchedAsks();
  const brief = useInsightsBrief({ nodes: briefNodes, repairCount: model.gaps.length, unmatchedCount: unmatched.asks.length, enabled: active });
  const root = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  const agent = useVaultAgentRuntime(root, { connectors: false });
  const identity = useVaultSessionIdentityScope();
  const canInspect = mode === 'local' && vault.status === 'loaded' && root !== null && agent.route === 'agent';
  useEffect(() => { onAgentReady(canInspect); }, [canInspect, onAgentReady]);
  const handledRequest = useRef<object | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const [prefill, setPrefill] = useState<InsightsAgentPrefill | null>(null);
  const [sectionRequest, setSectionRequest] = useState<{ tab: 'history'; nonce: number } | null>(null);
  const [saved, setSaved] = useState<{ handle: FileSystemDirectoryHandle; count: number } | null>(null);
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
  const noticeHandle = flowRetired ? context.handle : null;
  const scopeKey = analysisScopeKey(context.mode, context.scope);
  const countSaved = useEffectEvent((handle: FileSystemDirectoryHandle) => countSavedExplanations(handle, context));
  useEffect(() => {
    if (!noticeHandle) return;
    let live = true;
    void countSaved(noticeHandle).then(count => { if (live) setSaved({ handle: noticeHandle, count }); });
    return () => { live = false; };
  }, [noticeHandle, scopeKey]);
  const savedCount = noticeHandle && saved?.handle === noticeHandle ? saved.count : 0;
  function openHistory() {
    setOpen(true);
    setSectionRequest(previous => ({ tab: 'history', nonce: (previous?.nonce ?? 0) + 1 }));
  }
  function ask(text: string, kind: InsightsTab = 'brief') {
    if (!canInspect) return;
    const plan = planInsightsAgentPrompt({ current: prefill, draftPresent: draft, kind, text });
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
  const project = model.projects.length === 1 ? model.projects[0] : null;
  const scopeName = project ? project.display ?? project.title : mode === 'local' && vault.handle ? vault.handle.name : t('analysis.scopeAll');
  return <>
    {flowRetired && !active ? <RetiredFlowNotice count={savedCount} onOpenHistory={canInspect ? openHistory : null} /> : null}
    {active ? <section>
      <p data-testid="analysis-records-scope" className="mb-4 shrink-0 text-label text-[color:var(--color-text-secondary)]"><span className="font-[var(--font-weight-strong)]">{scopeName}</span>{[mode === 'static' ? t('analysis.example') : null, project ? null : t('analysis.scopeCount', { count: model.projects.length })].filter(Boolean).map(note => ` · ${note}`).join('')}</p>
      {tab === 'brief' ? <BriefTab brief={brief} onOpenTab={onTab} onAskAgent={canInspect ? text => ask(text) : undefined} /> : null}
      {tab === 'library' ? <LibraryTab detail={brief.library} nowMs={brief.nowMs} /> : null}
    </section> : null}
    {agent.runtime && root && dockHost ? createPortal(<InsightsAgentDock open={open} runtime={agent.runtime} runtimes={agent.runtimes} onRuntimeChange={agent.setRuntimeId} vaultRoot={root} mcpServers={agent.mcpServers} prefillRequest={prefill} sectionRequest={sectionRequest} contextLabel={t('agentContext', { tab: t(`tab.${prefill?.kind ?? 'connections'}`) })} knownSlugs={knownSlugs} knownRelations={knownRelations} analysisContext={context} onDraftPresenceChange={setDraft} onPresentationOpenMap={slug => { const id = [...slugs].find(([, value]) => value === slug)?.[0]; if (id) router.push(`/topology/?p=${encodeURIComponent(id)}`); }} onEvidence={slug => router.push(buildDocsVaultHref({ slug }))} onClose={() => setOpen(false)} />, dockHost) : null}
  </>;
}
