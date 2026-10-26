'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { useSurfaceSwap, useSwapHeight } from '@/shared/lib/render-timing/use-presence';
import { SourceDateRecovery } from './SourceDateRecovery';
import { useOntologyEvidence } from '../../lib/use-ontology-evidence';
import { Link } from '@/i18n/navigation';
import { Button, Disclosure, IconButton, OntologyMapKindGlyph, Select } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { controlClass } from '@/shared/ui/control-class';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { buildTopologyMeaningEditorNodeHref, buildEdgeTypeRows, computeEdgeTypeDistribution, useEdgeTypeLabel, resolveNodeDocument, type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import { CopyAgentTextButton } from '../parts/CopyAgentTextButton';
import { selectedAnalysisRequest } from '../../lib/selected-analysis-request';
import { filterAnalysisItems } from '../../lib/analysis-selection';
import { linearAnalysisSourceScopes, type AnalysisSourceScope } from '../../lib/analysis-source-scope';
import { buildAnalysisModel, type AnalysisClaim } from '../../lib/analysis-model';
import { buildAnalysisBoard } from '../../lib/analysis-board';
import { AnalysisListSearch } from './AnalysisListSearch';
import { ProjectBoard, type BoardMarker } from './ProjectBoard';
import { ClaimRoles } from './ClaimRoles';
import styles from './analysis.module.css';

const name = (node: KnowledgeGraphNode) => node.display ?? node.title;
export function AnalysisWorkspace({ agentReady, onInspect, active, nodes, edges, docs, mode, initialQuestion = 'relationships', initialClaim, initialEdge }: {
  agentReady: boolean; onInspect: (text: string) => void; active: boolean; nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[]; docs: readonly VaultDoc[]; mode: 'static' | 'local'; initialQuestion?: 'relationships' | 'evidence'; initialClaim?: string; initialEdge?: string;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const locale = useLocale();
  const relationLabel = useEdgeTypeLabel();
  const relationTypes = useMemo(() => buildEdgeTypeRows(computeEdgeTypeDistribution(edges)), [edges]);
  const model = useMemo(() => buildAnalysisModel(nodes, edges, docs), [nodes, edges, docs]);
  const board = useMemo(() => buildAnalysisBoard(model), [model]);
  const vault = useLocalVault();
  const evidenceNodes = useMemo(() => nodes.map(node => ({ id: node.id, docSlug: resolveNodeDocument(node).ownSlug })), [nodes]);
  const projectSlugs = useMemo(() => model.projects.flatMap(node => { const slug = resolveNodeDocument(node).ownSlug; return slug ? [slug] : []; }), [model.projects]);
  const source = useOntologyEvidence({ docs, nodes: evidenceNodes, handle: mode === 'local' ? vault.handle : null, projectSlugs, nativeRootPath: vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null, reloadToken: vault.lastLoadedAt, enabled: active && mode === 'local' });
  const [question, setQuestion] = useState(initialQuestion);
  const [edgeId, setEdgeId] = useState<string | null>(initialEdge ?? null);
  const [claimId, setClaimId] = useState<string | null>(initialClaim ?? null);
  const [claimQuery, setClaimQuery] = useState('');
  const graphStage = useRef<HTMLDivElement>(null);
  const findingHeading = useRef<HTMLHeadingElement>(null);
  const pendingClaimFocus = useRef<string | null>(initialClaim && model.claims.some(item => item.node.id === initialClaim) ? initialClaim : null);
  const pendingEdgeFocus = useRef(Boolean(initialEdge && board.links.some(link => link.edge.id === initialEdge)));
  const [onlyGaps, setOnlyGaps] = useState(initialQuestion === 'evidence' && !initialClaim);
  const [sourceScope, setSourceScope] = useState<AnalysisSourceScope>('all');
  const stepIndex = Math.max(0, board.links.findIndex(link => link.edge.id === edgeId));
  const edge = board.links[stepIndex]?.edge ?? null;
  const pair = edge ? model.pairs.find(candidate => candidate.edges.includes(edge)) ?? null : null;
  const evidenceQuestion = question === 'evidence' || !pair;
  const candidates = onlyGaps ? model.gaps : model.claims;
  const sourceScopes = useMemo(() => linearAnalysisSourceScopes(model.claims.map(item => item.node.id), source.evidence), [model.claims, source.evidence]);
  const searchMatches = useMemo(() => claimQuery.trim() ? new Set(filterAnalysisItems(model.claims, claimQuery, item => [name(item.node), item.node.title]).map(item => item.node.id)) : null, [model.claims, claimQuery]);
  const matches = useMemo(() => evidenceQuestion && sourceScope !== 'all' ? new Set([...sourceScopes[sourceScope]].filter(id => !searchMatches || searchMatches.has(id))) : searchMatches, [evidenceQuestion, sourceScope, sourceScopes, searchMatches]);
  const matchingCount = candidates.filter(item => !matches || matches.has(item.node.id)).length;
  const claim = model.claims.find(candidate => candidate.node.id === claimId) ?? candidates[0] ?? null;
  const markers = useMemo(() => new Map(model.claims.flatMap((item): [string, BoardMarker][] => source.evidence?.missing.has(item.node.id) ? [[item.node.id, 'missing']] : source.evidence?.stale.has(item.node.id) ? [[item.node.id, 'moved']] : [])), [model.claims, source.evidence]);
  const implementationOf = (item: KnowledgeGraphEdge) => model.claims.find(candidate => candidate.node.id === item.from || candidate.roles.some(role => role.id === item.from)) ?? null;
  const docsOf = (item: KnowledgeGraphEdge) => item.evidenceIds.flatMap(slug => { const doc = docs.find(candidate => candidate.slug === slug); return doc ? [doc] : []; });
  const implementationClaim = edge ? implementationOf(edge) : null;
  const declaringDocs = edge ? docsOf(edge) : [];
  const href = (slug: string) => buildDocsVaultHref({ slug, intent: mode === 'static' ? null : 'local', via: evidenceQuestion ? 'insights:do-next' : 'insights:connections', reviewId: evidenceQuestion && claim ? `analysis:${claim.node.id}` : edge ? `relation:${edge.id}` : null });
  const selectedNodes = evidenceQuestion ? claim ? [claim.node] : [] : edge ? [model.byId.get(edge.from)!, model.byId.get(edge.to)!] : [];
  const selectedDocuments = evidenceQuestion ? claim?.document ? [claim.document] : [] : [...new Map([...declaringDocs, ...selectedNodes.flatMap(node => { const doc = model.documentOf(node); return doc ? [doc] : []; })].map(doc => [doc.slug, doc])).values()];
  const inspection = selectedAnalysisRequest({ mode, locale, vaultName: vault.handle?.name ?? '', vaultRoot: mode === 'local' && vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null, nodes: selectedNodes, edge: evidenceQuestion ? null : edge, documents: selectedDocuments });
  const evidenceClaim = evidenceQuestion ? claim : implementationClaim;
  const sourceCaption = mode === 'static' ? t('sourceStatus.example') : evidenceClaim && source.evidence ? t(`sourceShort.${source.evidence.missing.has(evidenceClaim.node.id) ? 'missing' : source.evidence.stale.has(evidenceClaim.node.id) ? 'moved' : source.evidence.current.has(evidenceClaim.node.id) ? 'dated' : 'unknown'}`) : t(`sourceStatus.${source.status === 'wrong-folder' ? 'ungranted' : source.status}`);
  const missingSelection = Boolean(initialClaim && !model.claims.some(item => item.node.id === initialClaim) || initialEdge && !board.links.some(link => link.edge.id === initialEdge));
  const project = model.projects.length === 1 ? model.projects[0] : null;
  const scopeName = project ? name(project) : mode === 'local' && vault.handle ? vault.handle.name : t('scopeAll');
  const scopeNote = [mode === 'static' ? t('example') : null, project ? null : t('scopeCount', { count: model.projects.length })].filter(Boolean).join(' · ');
  const selectionKey = evidenceQuestion ? `claim:${claim?.node.id ?? ''}` : `edge:${edge?.id ?? ''}`;
  const { leaving: leavingKey } = useSurfaceSwap(selectionKey);
  const { hostRef: inspectorHost, capture: captureInspector } = useSwapHeight(selectionKey);
  const shownEdge = (key: string) => key.startsWith('edge:') ? edges.find(item => `edge:${item.id}` === key) ?? null : null;
  const shownClaim = (key: string) => key.startsWith('claim:') ? model.claims.find(item => `claim:${item.node.id}` === key) ?? null : null;
  const heading = (key: string) => { const item = shownEdge(key); return item ? <><h3 className="text-title font-[var(--font-weight-strong)]">{name(model.byId.get(item.from)!)}</h3><p className="mt-1 text-body text-[color:var(--color-text-secondary)]">→ {name(model.byId.get(item.to)!)}</p></> : null; };
  const body = (key: string) => { const item = shownEdge(key), chosen = shownClaim(key); const implemented = item ? implementationOf(item) : null; return item ? <>
    <div className={styles.documentStep}>{docsOf(item).map(doc => <div key={doc.slug}><Link href={href(doc.slug)} className={controlClass({ hoverSurface: 'lift', shape: 'card', size: 'lg', tone: 'accent', className: 'atlas-touch-floor w-full justify-between' })}>{t('openDeclaration')}</Link><p className="mt-2 break-all text-label text-[color:var(--color-text-tertiary)]">{doc.path}</p></div>)}{!docsOf(item).length ? <p className="text-body">{t('documentMissing')}</p> : null}</div>
    <div className={styles.evidenceStep}><span className={styles.stepLabel}>{t('why')}</span><p className="mt-2 text-body leading-prose">{item.label || t('rationaleShort')}</p>{!item.label ? <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('readBeforeRelying')}</p> : null}</div>
    <div className={styles.evidenceStep}><span className={styles.stepLabel}>{t('implementation')}</span>{implemented?.roles.length ? <p className="mt-2 text-body leading-prose">{implemented.roles.slice(0, 3).map(name).join(' · ')}</p> : <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{implemented?.paths[0] ?? t('anchorMissing')}</p>}{implemented && implemented.roles.length > 3 ? <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('moreRoles', { count: implemented.roles.length - 3 })}</p> : null}{implemented ? <Button variant="outline" size="sm" className="atlas-touch-floor mt-3" data-testid="analysis-open-implementation" onClick={inspectImplementation}>{t('inspectImplementation')}</Button> : null}</div>
  </> : chosen ? <ClaimEvidence claim={chosen} href={href} local={mode === 'local'} pathNotes={new Map(source.evidence?.rows.filter(row => row.id === chosen.node.id).flatMap(row => [...row.moved.map(file => [file.path, t('pathChanged', { date: file.changedAt.slice(0, 10) })] as const), ...row.gone.map(path => [path, t('pathGone')] as const), ...row.undated.map(path => [path, t('pathUndated')] as const)]))} /> : !model.claims.length ? <p className="text-body">{t('noClaim')}</p> : onlyGaps && !model.gaps.length ? <p className="text-body">{t('noGaps')}</p> : null; };
  const swap = (render: (key: string) => ReactNode) => <div className={styles.swapSlot}>{leavingKey ? <div key={`out:${leavingKey}`} inert aria-hidden="true" className="motion-swap-out">{render(leavingKey)}</div> : null}<div key={selectionKey} className="motion-swap-in">{render(selectionKey)}</div></div>;
  useLayoutEffect(() => {
    const stage = graphStage.current;
    if (!evidenceQuestion && pendingEdgeFocus.current) {
      const selected = stage?.querySelector<HTMLElement>('[data-endpoint="from"]') ?? findingHeading.current;
      selected?.focus(); selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pendingEdgeFocus.current = false;
    }
    if (!pendingClaimFocus.current || !evidenceQuestion) return;
    const target = [...stage?.querySelectorAll<HTMLButtonElement>('[data-analysis-claim-id]') ?? []].find(node => node.dataset.analysisClaimId === pendingClaimFocus.current);
    if (target) { target.focus(); target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pendingClaimFocus.current = null; }
  }, [evidenceQuestion, edge?.id, claim?.node.id]);
  function selectEdge(next: string) { captureInspector(); setEdgeId(next); }
  function selectClaim(next: string) { captureInspector(); setClaimId(next); }
  function inspectImplementation() {
    if (!implementationClaim) return;
    pendingClaimFocus.current = implementationClaim.node.id;
    setClaimQuery('');
    setSourceScope('all');
    setQuestion('evidence'); setOnlyGaps(false); setClaimId(implementationClaim.node.id);
  }
  function openEvidence(gaps: boolean) { pendingClaimFocus.current = null; setOnlyGaps(gaps); setClaimId(gaps && claim && !claim.gaps.length ? model.gaps[0]?.node.id ?? null : claim?.node.id ?? null); }
  const stepButton = (delta: 1 | -1, label: string, icon: ReactNode) => {
    const next = board.links[stepIndex + delta];
    return <IconButton label={label} size="lg" tone="muted" hoverInk={next ? 'strong' : undefined} hoverSurface={next ? 'lift' : undefined} aria-disabled={!next || undefined} onClick={next ? () => selectEdge(next.edge.id) : undefined} className="atlas-touch-floor aria-disabled:cursor-not-allowed aria-disabled:opacity-55">{icon}</IconButton>;
  };
  return <section className={styles.workspace} data-testid="analysis-workspace" data-analysis-capability-count={model.claims.length} data-analysis-cross-count={model.crossCount} data-analysis-project-count={model.projects.length}>
    <div className={styles.scopeBar} data-testid="analysis-scope">
      <div className="flex min-w-0 items-center gap-2"><OntologyMapKindGlyph kind="project" size={16} /><span className="text-body font-[var(--font-weight-strong)]">{scopeName}</span>{scopeNote ? <span className="text-label text-[color:var(--color-text-tertiary)]">{scopeNote}</span> : null}</div>
      <SegmentedControl ariaLabel={t('question')} value={question} onChange={value => setQuestion(value as typeof question)} options={[{ value: 'relationships', label: t('relationships') }, { value: 'evidence', label: t('evidence') }]} />
    </div>
    {missingSelection ? <p role="status" data-testid="analysis-missing-selection" className="mb-3 text-body text-[color:var(--color-text-secondary)]">{t('selectionMissing')}</p> : null}
    {!pair && question === 'relationships' ? <p className="mb-4 text-body text-[color:var(--color-text-secondary)]">{t('noDependencies', { count: model.dependencyCount })}</p> : null}
    <div className={styles.layout} data-testid="analysis-layout">
      <div ref={graphStage} className={styles.stage}>
        <div className={styles.boardToolbar}>
          <AnalysisListSearch value={claimQuery} onChange={setClaimQuery} label={t('findCapability')} matches={matches?.size ?? 0} total={model.claims.length} testId="analysis-claim-search" />
          {evidenceQuestion ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className={styles.boardLegend} aria-hidden="true">
              {mode === 'local' ? <><span><span className={styles.boardMarker} data-marker="moved" />{t('sourceShort.moved')}</span><span><span className={styles.boardMarker} data-marker="missing" />{t('sourceShort.missing')}</span></> : null}
              <span>{t('markerGap')}</span>
            </div>
            <Select ariaLabel={t('sourceScope')} size="md" value={sourceScope} onChange={value => setSourceScope(value as AnalysisSourceScope)} options={(['all', 'moved', 'missing', 'unknown'] as const).map(value => ({ value, label: t(`sourceScopeOptions.${value}`, { count: sourceScopes[value].size }) }))} />
            <SegmentedControl ariaLabel={t('capabilityFilter')} value={onlyGaps ? 'gaps' : 'all'} onChange={value => openEvidence(value === 'gaps')} options={[{ value: 'all', label: t('allFilter', { count: model.claims.length }) }, { value: 'gaps', label: t('gapsFilter', { count: model.gaps.length }) }]} />
          </div> : null}
        </div>
        {evidenceQuestion && sourceScope !== 'all' ? <p role="status" aria-atomic="true" data-testid="analysis-source-scope-status" className="mb-3 text-label text-[color:var(--color-text-secondary)]">{t('sourceScopeMatches', { count: matchingCount })}</p> : null}
        <ProjectBoard board={board} mode={evidenceQuestion ? 'evidence' : 'relationships'} selectedEdge={edge?.id ?? null} selectedClaim={claim?.node.id ?? null} markers={markers} matches={matches} searching={searchMatches !== null} onlyGaps={onlyGaps}
          vaultKey={mode === 'local' ? `local:${vault.handle?.name ?? ''}` : 'static'} onSelectEdge={selectEdge} onSelectClaim={selectClaim} />
        <Disclosure summary={t('countBasis')} className={styles.countBasis}><p className="text-body leading-prose text-[color:var(--color-text-secondary)]">{t('countDetails', { total: model.dependencyCount, cross: model.crossCount, internal: model.internal, unassigned: model.unassigned })}</p><p className="mt-3 text-body leading-prose text-[color:var(--color-text-secondary)]">{t('inspectionBasis', { inspected: model.inspected, total: model.claims.length })}</p><p className="mt-3 text-body leading-prose text-[color:var(--color-text-secondary)]">{t('anchorSummary', { anchored: model.anchored, total: model.claims.length })}</p><div className="mt-3 flex flex-wrap gap-3">{relationTypes.map(row => <span key={row.type} className="text-label text-[color:var(--color-text-tertiary)]">{relationLabel(row.type)} · {row.count}</span>)}</div></Disclosure>
      </div>
      <aside className={styles.inspector} data-testid="analysis-evidence">
        <div className={styles.inspectorHeading}>
          <h2 ref={findingHeading} tabIndex={-1} data-testid="analysis-finding-heading" className="min-w-0 text-title outline-none font-[var(--font-weight-strong)]">{!evidenceQuestion && pair ? <>{name(pair.from)} <span className="text-[color:var(--color-text-tertiary)]">→</span> {name(pair.to)}</> : claim ? name(claim.node) : t('evidenceQuestion')}</h2>
          {!evidenceQuestion && board.links.length > 1 && edge ? <div role="group" aria-label={t('chooseDeclaration')} className="flex shrink-0 items-center">
            {stepButton(-1, t('previousDeclaration'), <ChevronLeft size={ICON_SIZE.lg} aria-hidden />)}
            <span data-testid="analysis-declaration-step" aria-live="polite" className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">{t('declarationStep', { index: stepIndex + 1, total: board.links.length })}<span className="sr-only"> · {name(model.byId.get(edge.from)!)} → {name(model.byId.get(edge.to)!)}</span></span>
            {stepButton(1, t('nextDeclaration'), <ChevronRight size={ICON_SIZE.lg} aria-hidden />)}
          </div> : null}
        </div>
        <div ref={inspectorHost} className={styles.swapHost} data-swapping={Boolean(leavingKey)}>
          <div className={styles.evidenceHeading}>{evidenceQuestion ? null : swap(heading)}<p data-testid="analysis-source-status" className={`${evidenceQuestion ? '' : 'mt-3 '}text-pretty text-body text-[color:var(--color-text-tertiary)]`}>{sourceCaption}</p>{mode === 'local' ? <SourceDateRecovery status={source.status} onChoose={source.chooseSourceFolder} onRetry={source.retry} /> : null}</div>
          {swap(body)}
        </div>
        {selectedNodes.length ? <div className={styles.inspectAction}>
          {mode === 'local' && inspection.runnable && agentReady ? <Button data-testid="analysis-inspect-selected" variant="outline" size="sm" className="atlas-touch-floor" onClick={() => onInspect(inspection.text)}>{t('inspectSelected')}</Button> : null}
          <CopyAgentTextButton key={inspection.text} testId="analysis-copy-selected" compact label={t(mode === 'static' ? 'copySampleFact' : 'copySelectedCheck')} copiedLabel={t('copiedSelected')} text={inspection.text} />
          <Disclosure summary={t('reviewSelectedRequest')} summaryTestId="analysis-selected-request-toggle"><pre data-testid="analysis-selected-request" className="whitespace-pre-wrap break-words text-label leading-prose text-[color:var(--color-text-secondary)]">{inspection.text}</pre></Disclosure>
        </div> : null}
        <div className={styles.evidenceLimit}><p className="mt-2 text-label leading-prose text-[color:var(--color-text-tertiary)]">{t('limitsShort')}</p></div>
      </aside>
    </div>
  </section>;
}

function ClaimEvidence({ claim, href, local, pathNotes }: { claim: AnalysisClaim; href: (slug: string) => string; local: boolean; pathNotes: ReadonlyMap<string, string> }) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const paths = [...new Set([...claim.paths, ...pathNotes.keys()])];
  return <>
    <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">{claim.node.summary || claim.document?.definitionPreview || t('definitionMissing')}</p>
    <div className="my-5 border-y border-[color:var(--color-divider)] py-4"><p className="text-label text-[color:var(--color-text-tertiary)]">{t('checkThis')}</p>{claim.gaps.length ? claim.gaps.map(gap => <p key={gap} className="mt-2 text-body">{t(`gap.${gap}`)}</p>) : <p className="mt-2 text-body">{t('noRecordedGap')}</p>}</div>
    {claim.document ? <Link href={href(claim.document.slug)} className={controlClass({ hoverSurface: 'lift', shape: 'link', tone: 'accent', className: 'atlas-touch-floor' })}>{t('openDeclaration')}</Link> : <p className="text-body">{t('documentMissing')}</p>}
    {local && claim.document ? <Link href={buildTopologyMeaningEditorNodeHref(claim.node.id, { via: 'insights:do-next', reviewId: `analysis:${claim.node.id}` })} className={controlClass({ hoverSurface: 'lift', shape: 'link', className: 'atlas-touch-floor mt-3 block' })}>{t('correctClaim')}</Link> : null}
    <ClaimRoles key={claim.node.id} claim={claim} href={href} />
    {paths.length || claim.roles.length ? <><p className="mt-5 text-label text-[color:var(--color-text-tertiary)]">{t('sourcePaths')}</p>{paths.length ? paths.map(path => <p key={path} className="mt-2 break-all text-body">{path}{pathNotes.has(path) ? <span className="whitespace-nowrap text-[color:var(--color-text-secondary)]"> · {pathNotes.get(path)}</span> : null}</p>) : <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('pathMissing')}</p>}</> : null}
  </>;
}
