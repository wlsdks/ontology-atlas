'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { useOntologyEvidence } from '../../lib/use-ontology-evidence';
import { Link } from '@/i18n/navigation';
import { Button, Disclosure, OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { buildDocsVaultHref, type VaultDoc } from '@/entities/docs-vault';
import { buildTopologyMeaningEditorNodeHref, buildEdgeTypeRows, computeEdgeTypeDistribution, useEdgeTypeLabel, resolveNodeDocument, type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import { CopyAgentTextButton } from '../parts/CopyAgentTextButton';
import { selectedAnalysisRequest } from '../../lib/selected-analysis-request';
import { filterAnalysisItems, visibleAnalysisItems } from '../../lib/analysis-selection';
import { buildAnalysisModel, type AnalysisClaim } from '../../lib/analysis-model';
import { PairRail } from './PairRail';
import { AnalysisListSearch } from './AnalysisListSearch';
import { DependencyDiagram } from './DependencyDiagram';
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
  const vault = useLocalVault();
  const evidenceNodes = useMemo(() => nodes.map(node => ({ id: node.id, docSlug: resolveNodeDocument(node).ownSlug })), [nodes]);
  const projectSlugs = useMemo(() => model.projects.flatMap(node => { const slug = resolveNodeDocument(node).ownSlug; return slug ? [slug] : []; }), [model.projects]);
  const source = useOntologyEvidence({ docs, nodes: evidenceNodes, handle: mode === 'local' ? vault.handle : null, projectSlugs, nativeRootPath: vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null, reloadToken: vault.lastLoadedAt, enabled: active && mode === 'local' });
  const [question, setQuestion] = useState(initialQuestion);
  const [pairId, setPairId] = useState<string | null>(() => model.pairs.find(pair => pair.edges.some(edge => edge.id === initialEdge))?.id ?? null);
  const [edgeId, setEdgeId] = useState<string | null>(initialEdge ?? null);
  const [claimId, setClaimId] = useState<string | null>(initialClaim ?? null);
  const [claimLimit, setClaimLimit] = useState(6);
  const [claimQuery, setClaimQuery] = useState('');
  const [rolePage, setRolePage] = useState({ claim: '', limit: 6 });
  const claimList = useRef<HTMLDivElement>(null);
  const pendingClaimFocus = useRef<string | null>(initialClaim && model.claims.some(item => item.node.id === initialClaim) ? initialClaim : null);
  const graphStage = useRef<HTMLDivElement>(null);
  const pendingEdgeFocus = useRef(Boolean(initialEdge && model.pairs.some(item => item.edges.some(edge => edge.id === initialEdge))));
  const [onlyGaps, setOnlyGaps] = useState(initialQuestion === 'evidence' && !initialClaim);
  const pair = model.pairs.find(candidate => candidate.id === pairId) ?? model.pairs[0] ?? null;
  const edge = pair?.edges.find(candidate => candidate.id === edgeId) ?? pair?.edges[0] ?? null;
  const candidates = onlyGaps ? model.gaps : model.claims;
  const filteredClaims = useMemo(() => filterAnalysisItems(candidates, claimQuery, item => [name(item.node), item.node.title]), [candidates, claimQuery]);
  const claim = candidates.find(candidate => candidate.node.id === claimId) ?? candidates[0] ?? null;
  const roleLimit = rolePage.claim === claim?.node.id ? rolePage.limit : 6;
  const implementationClaim = edge ? model.claims.find(item => item.node.id === edge.from || item.roles.some(role => role.id === edge.from)) : null;
  const evidenceQuestion = question === 'evidence' || !pair;
  const declaringDocs = edge?.evidenceIds.flatMap(slug => { const doc = docs.find(candidate => candidate.slug === slug); return doc ? [doc] : []; }) ?? [];
  const href = (slug: string) => buildDocsVaultHref({ slug, intent: mode === 'static' ? null : 'local', via: evidenceQuestion ? 'insights:do-next' : 'insights:connections', reviewId: evidenceQuestion && claim ? `analysis:${claim.node.id}` : edge ? `relation:${edge.id}` : null });
  const selectedNodes = evidenceQuestion ? claim ? [claim.node] : [] : edge ? [model.byId.get(edge.from)!, model.byId.get(edge.to)!] : [];
  const selectedDocuments = evidenceQuestion ? claim?.document ? [claim.document] : [] : [...new Map([...declaringDocs, ...selectedNodes.flatMap(node => { const doc = model.documentOf(node); return doc ? [doc] : []; })].map(doc => [doc.slug, doc])).values()];
  const inspection = selectedAnalysisRequest({ mode, locale, vaultName: vault.handle?.name ?? '', vaultRoot: mode === 'local' && vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null, nodes: selectedNodes, edge: evidenceQuestion ? null : edge, documents: selectedDocuments });
  const evidenceClaim = evidenceQuestion ? claim : implementationClaim;
  const sourceCaption = mode === 'static' ? t('sourceStatus.example') : source.status !== 'measured' ? t(`sourceStatus.${source.status}`) : t(`sourceShort.${evidenceClaim && source.evidence?.missing.has(evidenceClaim.node.id) ? 'missing' : evidenceClaim && source.evidence?.stale.has(evidenceClaim.node.id) ? 'moved' : evidenceClaim && source.evidence?.current.has(evidenceClaim.node.id) ? 'dated' : 'unknown'}`);
  const missingSelection = Boolean(initialClaim && !model.claims.some(item => item.node.id === initialClaim) || initialEdge && !model.pairs.some(item => item.edges.some(candidate => candidate.id === initialEdge)));
  const project = model.projects.length === 1 ? model.projects[0] : null;
  const scopeName = project ? name(project) : mode === 'local' && vault.handle ? vault.handle.name : t('scopeAll');
  const visibleClaims = visibleAnalysisItems(filteredClaims, claimLimit, claim?.node.id ?? null, item => item.node.id);
  useLayoutEffect(() => {
    if (!evidenceQuestion && pendingEdgeFocus.current) {
      const selected = graphStage.current?.querySelector<HTMLButtonElement>('[data-testid="analysis-witness"][aria-pressed="true"]');
      if (selected) { selected.focus(); selected.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pendingEdgeFocus.current = false; }
    }
    if (!pendingClaimFocus.current || !evidenceQuestion) return;
    const target = [...claimList.current?.querySelectorAll<HTMLButtonElement>('[data-analysis-claim-id]') ?? []].find(node => node.dataset.analysisClaimId === pendingClaimFocus.current);
    if (target) { target.focus(); target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pendingClaimFocus.current = null; }
  }, [evidenceQuestion, edge?.id, claim?.node.id, claimLimit]);
  function inspectImplementation() {
    if (!implementationClaim) return;
    pendingClaimFocus.current = implementationClaim.node.id;
    setClaimQuery(''); setClaimLimit(6);
    setQuestion('evidence'); setOnlyGaps(false); setClaimId(implementationClaim.node.id);
  }
  function revealClaims() {
    const next = visibleAnalysisItems(filteredClaims, claimLimit + 6, claim?.node.id ?? null, item => item.node.id);
    pendingClaimFocus.current = next.find(item => !visibleClaims.some(shown => shown.node.id === item.node.id))?.node.id ?? null;
    setClaimLimit(value => value + 6);
  }
  function openEvidence(gaps: boolean) { pendingClaimFocus.current = null; setClaimQuery(''); setClaimLimit(6); setQuestion('evidence'); setOnlyGaps(gaps); setClaimId(null); }
  return <section className={styles.workspace} data-testid="analysis-workspace" data-analysis-capability-count={model.claims.length} data-analysis-cross-count={model.crossCount} data-analysis-project-count={model.projects.length}>
    <div className={styles.scopeBar} data-testid="analysis-scope">
      <div className="flex min-w-0 items-center gap-2"><OntologyMapKindGlyph kind="project" size={16} /><span className="text-body font-[var(--font-weight-strong)]">{scopeName}</span><span className="text-label text-[color:var(--color-text-tertiary)]">{mode === 'static' ? t('example') : t('recorded')}{!project ? ` · ${t('scopeCount', { count: model.projects.length })}` : ''}</span></div>
      <SegmentedControl ariaLabel={t('question')} value={question} onChange={value => setQuestion(value as typeof question)} options={[{ value: 'relationships', label: t('relationships') }, { value: 'evidence', label: t('evidence') }]} />
    </div>
    {missingSelection ? <p role="status" data-testid="analysis-missing-selection" className="mb-3 text-body text-[color:var(--color-text-secondary)]">{t('selectionMissing')}</p> : null}
    <div className={styles.findingHeading}>
      <div><h2 data-testid="analysis-finding-heading" className="text-hero font-[var(--font-weight-strong)] tracking-tight">{!evidenceQuestion && pair ? <>{name(pair.from)} <span className="text-[color:var(--color-text-tertiary)]">→</span> {name(pair.to)}</> : claim ? name(claim.node) : t('evidenceQuestion')}</h2>
        <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">{!evidenceQuestion && pair ? t('findingDeclarations', { count: pair.edges.length }) : t('evidenceLead')}</p>
      </div>
      <div className={styles.scopeDetail}><Disclosure summary={t('purpose')} summaryTestId="analysis-purpose" className={styles.purposeDisclosure}><p className="text-body leading-prose text-[color:var(--color-text-secondary)]">{project ? project.summary || model.documentOf(project)?.definitionPreview || t('purposeMissing') : model.projects.map(name).join(' · ') || t('purposeMissing')}</p></Disclosure></div>
    </div>
    {!pair && question === 'relationships' ? <p className="mb-4 text-body text-[color:var(--color-text-secondary)]">{t('noDependencies', { count: model.dependencyCount })}</p> : null}
    <div className={styles.layout} data-testid="analysis-layout">
      {!evidenceQuestion && pair ? <PairRail pairs={model.pairs} selected={pair.id} count={model.crossCount} onSelect={next => { setPairId(next.id); setEdgeId(null); }} /> : <nav className={styles.pairRail} aria-label={t('chooseCapability')}>
        <div className={styles.railHeading}><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t(onlyGaps ? 'gapClaims' : 'allClaims', { count: candidates.length })}</h3></div>
        <div className="mb-3"><SegmentedControl ariaLabel={t('capabilityFilter')} value={onlyGaps ? 'gaps' : 'all'} onChange={value => openEvidence(value === 'gaps')} options={[{ value: 'all', label: t('allFilter') }, { value: 'gaps', label: t('gapsFilter') }]} /></div>
        <AnalysisListSearch value={claimQuery} onChange={value => { pendingClaimFocus.current = null; setClaimQuery(value); setClaimLimit(6); }} label={t('findCapability')} shown={visibleClaims.length} matches={filteredClaims.length} total={candidates.length} selectionHidden={Boolean(claimQuery.trim() && claim && !filteredClaims.some(item => item.node.id === claim.node.id))} testId="analysis-claim-search" />
        <div ref={claimList} className={styles.pairChoices}>{visibleClaims.map(item => <button type="button" key={item.node.id} data-testid="analysis-claim" data-analysis-claim-id={item.node.id} aria-pressed={claim?.node.id === item.node.id} onClick={() => setClaimId(item.node.id)} className={controlClass({ hoverSurface: 'lift', shape: 'row', size: 'lg', tone: claim?.node.id === item.node.id ? 'accentOnTint' : 'default', active: claim?.node.id === item.node.id, className: 'atlas-touch-floor w-full' })}><OntologyMapKindGlyph kind="capability" size={14} /><span>{name(item.node)}</span></button>)}</div>
        <div className={styles.railActions}>
          {filteredClaims.length > claimLimit ? <Button variant="ghost" size="sm" className="atlas-touch-floor" data-testid="analysis-claims-more" onClick={revealClaims}>{t('showMoreItems', { count: Math.min(6, filteredClaims.length - claimLimit) })}</Button> : null}
          {claimLimit > 6 ? <Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={() => { pendingClaimFocus.current = visibleAnalysisItems(filteredClaims, 6, claim?.node.id ?? null, item => item.node.id)[0]?.node.id ?? null; setClaimLimit(6); }}>{t('showLessItems')}</Button> : null}
        </div>
      </nav>}
      <div ref={graphStage} className={styles.stage}>
        {!evidenceQuestion && pair && edge ? <DependencyDiagram pair={pair} selected={edge} byId={model.byId} onSelect={next => setEdgeId(next.id)} /> : claim ? <div className={styles.capabilityObject}>
          <div className={styles.objectHeading}><span>{t('capability')}</span><span>→</span><span>{t('implementation')}</span></div>
          <div className={styles.implementationTrace}><div className={styles.implementationSubject}><OntologyMapKindGlyph kind="capability" size={24} /><h3 className="text-title font-[var(--font-weight-strong)]">{name(claim.node)}</h3><p className="text-label text-[color:var(--color-text-tertiary)]">{[...model.domainsOf.get(claim.node.id) ?? []].map(id => name(model.byId.get(id)!)).join(' · ') || t('responsibilityMissing')}</p></div><div className={styles.implementationBranch} aria-hidden="true" /><div className={styles.implementationRoles}>
            {claim.roles.length ? claim.roles.slice(0, roleLimit).map(role => <div key={role.id} className={styles.roleObject}><OntologyMapKindGlyph kind="element" size={18} /><span className="text-body-lg">{name(role)}</span></div>) : <div className={styles.roleEmpty}><p className="text-body-lg">{claim.paths[0] ?? t('anchorMissing')}</p><p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('recordingNotImplementation')}</p></div>}
          </div></div>
          {claim.roles.length > roleLimit ? <Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={() => setRolePage({ claim: claim.node.id, limit: roleLimit + 6 })}>{t('moreRoles', { count: claim.roles.length - roleLimit })}</Button> : null}
          <p className="mt-5 text-label text-[color:var(--color-text-tertiary)]">{t('inspectionBasis', { inspected: model.inspected, total: model.claims.length })}</p>
        </div> : <p className="text-body">{t('noGaps')}</p>}
        <div className={styles.supportingFacts}><Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={() => openEvidence(false)}>{t('anchorSummary', { anchored: model.anchored, total: model.claims.length })}</Button><Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={() => openEvidence(true)}>{t('gapSummary', { count: model.gaps.length })}</Button></div>
        <Disclosure summary={t('countBasis')}><p className="text-body leading-prose text-[color:var(--color-text-secondary)]">{t('countDetails', { total: model.dependencyCount, cross: model.crossCount, internal: model.internal, unassigned: model.unassigned })}</p><div className="mt-3 flex flex-wrap gap-3">{relationTypes.map(row => <span key={row.type} className="text-label text-[color:var(--color-text-tertiary)]">{relationLabel(row.type)} · {row.count}</span>)}</div></Disclosure>
      </div>
      <aside className={styles.inspector} data-testid="analysis-evidence">
        <div className={styles.evidenceHeading}><p className="text-label text-[color:var(--color-text-tertiary)]">{t('evidenceChain')}</p><h3 className="mt-2 text-title font-[var(--font-weight-strong)]">{!evidenceQuestion && edge ? name(model.byId.get(edge.from)!) : claim ? name(claim.node) : t('noClaim')}</h3>{!evidenceQuestion && edge ? <p className="mt-1 text-body text-[color:var(--color-text-secondary)]">→ {name(model.byId.get(edge.to)!)}</p> : null}<p className="mt-3 text-label text-[color:var(--color-text-tertiary)]">{sourceCaption}</p></div>
        {!evidenceQuestion && edge ? <>
          <div className={styles.documentStep}>{declaringDocs.map(doc => <div key={doc.slug}><Link href={href(doc.slug)} className={controlClass({ hoverSurface: 'lift', shape: 'card', size: 'lg', tone: 'accent', className: 'atlas-touch-floor w-full justify-between' })}>{t('openDeclaration')}</Link><p className="mt-2 break-all text-label text-[color:var(--color-text-tertiary)]">{doc.path}</p></div>)}{!declaringDocs.length ? <p className="text-body">{t('documentMissing')}</p> : null}</div>
          <div className={styles.evidenceStep}><span className={styles.stepLabel}>{t('why')}</span><p className="mt-2 text-body leading-prose">{edge.label || t('rationaleShort')}</p>{!edge.label ? <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('readBeforeRelying')}</p> : null}</div>
          <div className={styles.evidenceStep}><span className={styles.stepLabel}>{t('implementation')}</span>{implementationClaim?.roles.length ? implementationClaim.roles.slice(0, 3).map(role => <p key={role.id} className="mt-2 flex items-center gap-2 text-body"><OntologyMapKindGlyph kind="element" size={14} />{name(role)}</p>) : <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{implementationClaim?.paths[0] ?? t('anchorMissing')}</p>}{implementationClaim && implementationClaim.roles.length > 3 ? <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('moreRoles', { count: implementationClaim.roles.length - 3 })}</p> : null}{implementationClaim ? <Button variant="ghost" size="sm" className="atlas-touch-floor mt-2" data-testid="analysis-open-implementation" onClick={inspectImplementation}>{t('inspectImplementation')}</Button> : null}</div>

        </> : claim ? <><ClaimEvidence claim={claim} href={href} local={mode === 'local'} /><p className="mt-4 text-body text-[color:var(--color-text-secondary)]">{t(`sourceClaim.${source.evidence?.missing.has(claim.node.id) ? 'missing' : source.evidence?.stale.has(claim.node.id) ? 'moved' : source.evidence?.current.has(claim.node.id) ? 'dated' : 'unknown'}`)}</p>{source.evidence?.rows.filter(row => row.id === claim.node.id).flatMap(row => [...row.gone, ...row.moved.map(file => `${file.path} · ${file.changedAt}`)]).map(path => <p key={path} className="mt-2 break-all text-label text-[color:var(--color-text-tertiary)]">{path}</p>)}</> : null}
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

function ClaimEvidence({ claim, href, local }: { claim: AnalysisClaim; href: (slug: string) => string; local: boolean }) {
  const t = useTranslations('ontologyPages.insights.analysis');
  return <>
    <p className="mt-3 text-body leading-prose text-[color:var(--color-text-secondary)]">{claim.node.summary || claim.document?.definitionPreview || t('definitionMissing')}</p>
    <div className="my-5 border-y border-[color:var(--color-divider)] py-4"><p className="text-label text-[color:var(--color-text-tertiary)]">{t('checkThis')}</p>{claim.gaps.length ? claim.gaps.map(gap => <p key={gap} className="mt-2 text-body">{t(`gap.${gap}`)}</p>) : <p className="mt-2 text-body">{t('noRecordedGap')}</p>}</div>
    {claim.document ? <Link href={href(claim.document.slug)} className={controlClass({ hoverSurface: 'lift', shape: 'link', tone: 'accent', className: 'atlas-touch-floor' })}>{t('openDeclaration')}</Link> : <p className="text-body">{t('documentMissing')}</p>}
    {local && claim.document ? <Link href={buildTopologyMeaningEditorNodeHref(claim.node.id, { via: 'insights:do-next', reviewId: `analysis:${claim.node.id}` })} className={controlClass({ hoverSurface: 'lift', shape: 'link', className: 'atlas-touch-floor mt-3 block' })}>{t('correctClaim')}</Link> : null}
    <p className="mt-5 text-label text-[color:var(--color-text-tertiary)]">{t('sourcePaths')}</p>{claim.paths.length ? claim.paths.map(path => <p key={path} className="mt-2 break-all text-body">{path}</p>) : <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('pathMissing')}</p>}
  </>;
}
